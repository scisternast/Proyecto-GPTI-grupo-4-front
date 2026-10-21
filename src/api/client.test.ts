import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildLedger, formatMovementNote } from '../lib/ledger'
import { handlers, resetMockDb } from '../mocks/handlers'
import { api, setAccessToken, unwrap } from './client'
import { ApiError } from './errors'
import type { ItemState, Metrics, Movement, PriceComparison } from './types'

const PASSWORD = 'stocksmart-demo'
const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterAll(() => server.close())
beforeEach(async () => {
  resetMockDb()
  await loginAs('admin@negocio.cl')
})

async function loginAs(email: string) {
  setAccessToken(null)
  const token = await unwrap(api.POST('/auth/login', { body: { email, password: PASSWORD } }))
  setAccessToken(token.access_token)
}

const failure = (promise: Promise<unknown>) => promise.then(() => null, (e: unknown) => e as ApiError)
const POLLO = 'Pechuga de pollo asada'

async function itemNamed(name: string): Promise<ItemState> {
  const items = await unwrap(api.GET('/items'))
  return items.find((item) => item.name === name)!
}

async function pendingSuggestion(itemId: number) {
  const list = await unwrap(api.GET('/suggestions', { params: { query: { item_id: itemId } } }))
  return list.find((s) => s.status === 'PENDING')!
}

describe('autenticación y permisos', () => {
  it('login entrega un token y /auth/me el usuario con su rol', async () => {
    const me = await unwrap(api.GET('/auth/me'))
    expect(me).toMatchObject({ email: 'admin@negocio.cl', role: 'ADMIN' })
  })

  it('sin token, cualquier ruta responde 401 UNAUTHENTICATED', async () => {
    setAccessToken(null)
    const error = await failure(unwrap(api.GET('/items')))
    expect([error?.status, error?.code]).toEqual([401, 'UNAUTHENTICATED'])
  })

  it('credenciales incorrectas responden UNAUTHENTICATED con mensaje en español', async () => {
    setAccessToken(null)
    const error = await failure(unwrap(api.POST('/auth/login', { body: { email: 'admin@negocio.cl', password: 'otra-clave-123' } })))
    expect(error?.code).toBe('UNAUTHENTICATED')
    expect(error?.message).toContain('incorrectos')
  })

  it('el Encargado(a) de bodega registra movimientos, pero no crea insumos ni aprueba', async () => {
    await loginAs('bodega@negocio.cl')
    const pollo = await itemNamed(POLLO)
    await unwrap(api.POST('/movements', { body: { item_id: pollo.id, kind: 'EXIT', quantity: '1', unit: 'kg' } }))
    const create = await failure(
      unwrap(api.POST('/items', { body: { name: 'Sal', base_unit: 'kg', initial_quantity: '1', initial_unit: 'kg', timezone: 'America/Santiago' } })),
    )
    expect(create?.status).toBe(403)
    const suggestion = await pendingSuggestion(pollo.id)
    const decide = await failure(
      unwrap(api.POST('/suggestions/{suggestion_id}/decision', { params: { path: { suggestion_id: suggestion.id } }, body: { decision: 'APPROVE' } })),
    )
    expect(decide?.code).toBe('FORBIDDEN')
  })
})

describe('inventario', () => {
  it('crea un insumo y registra una salida con conversión de unidades', async () => {
    const item = await unwrap(
      api.POST('/items', { body: { name: 'Sal', base_unit: 'kg', initial_quantity: '25', initial_unit: 'kg', timezone: 'America/Santiago' } }),
    )
    await unwrap(api.POST('/movements', { body: { item_id: item.id, kind: 'EXIT', quantity: '500', unit: 'g' } }))
    const updated = await unwrap(api.GET('/items/{item_id}', { params: { path: { item_id: item.id } } }))
    expect(Number(updated.current_stock)).toBe(24.5)
  })

  it('PATCH solo cambia lo enviado; null vuelve al stock seguro automático', async () => {
    const pollo = await itemNamed(POLLO)
    const renamed = await unwrap(api.PATCH('/items/{item_id}', { params: { path: { item_id: pollo.id } }, body: { name: 'Pollo asado' } }))
    expect([renamed.name, Number(renamed.manual_safe_stock)]).toEqual(['Pollo asado', 5])
    const automatic = await unwrap(api.PATCH('/items/{item_id}', { params: { path: { item_id: pollo.id } }, body: { manual_safe_stock: null } }))
    expect(automatic.assessment.alert_source).toBe('AUTOMATIC')
  })

  it('traduce el código de error del backend', async () => {
    const pollo = await itemNamed(POLLO)
    const error = await failure(unwrap(api.POST('/movements', { body: { item_id: pollo.id, kind: 'EXIT', quantity: '1000', unit: 'kg' } })))
    expect(error).toBeInstanceOf(ApiError)
    expect(error?.message).toBe('No hay stock suficiente para esa salida.')
  })

  it('los conteos con sobrante vienen marcados para revisión', async () => {
    const pollo = await itemNamed(POLLO)
    const counts = await unwrap(api.GET('/items/{item_id}/counts', { params: { path: { item_id: pollo.id } } }))
    expect(counts.map((c) => c.needs_review)).toEqual([true, false, false])
  })
})

describe('escenario de los mockups (Arquitectura.md §4.3)', () => {
  it('pollo: 9 kg, 7 kg/semana, entrega 4 días → pide hoy 9 kg', async () => {
    const pollo = await itemNamed(POLLO)
    expect(Number(pollo.current_stock)).toBe(9)
    expect(Number(pollo.consumption.weekly_average)).toBe(7)
    expect(pollo.assessment.lead_time_days).toBe(4)
    expect(Number(pollo.assessment.projected_stock_at_arrival)).toBe(5)
    expect(pollo.assessment.alert_status).toBe('LOW_STOCK')
    expect(Number(pollo.assessment.suggested_quantity)).toBe(9)
  })

  it('compara solo precios vigentes, con IVA y sin despacho', async () => {
    const pollo = await itemNamed(POLLO)
    const prices = await unwrap(api.GET('/prices/{item_id}', { params: { path: { item_id: pollo.id } } }))
    const comparison = prices.comparison as unknown as PriceComparison
    expect(Object.fromEntries(prices.offers.map((o) => [o.supplier, o.state]))).toEqual({
      'Central Mayorista': 'CURRENT',
      Jumbo: 'CURRENT',
      'Santa Isabel': 'EXPIRED',
    })
    expect(comparison.recommended?.supplier).toBe('Jumbo')
    expect(Number(comparison.recommended?.total_clp)).toBe(107_100)
    expect(Number(comparison.savings_clp)).toBe(5_310)
  })

  it('aprobar crea la orden OC-0013, deja el insumo en tránsito y la recepción suma stock', async () => {
    const pollo = await itemNamed(POLLO)
    const suggestion = await pendingSuggestion(pollo.id)
    const approved = await unwrap(
      api.POST('/suggestions/{suggestion_id}/decision', { params: { path: { suggestion_id: suggestion.id } }, body: { decision: 'APPROVE' } }),
    )
    expect(approved.status).toBe('APPROVED')
    const order = (await unwrap(api.GET('/orders'))).find((o) => o.suggestion_id === suggestion.id)!
    expect(order.code).toBe('OC-0013')
    const inTransit = await itemNamed(POLLO)
    expect([inTransit.assessment.alert_status, Number(inTransit.assessment.suggested_quantity)]).toEqual(['IN_TRANSIT', 0])

    const again = await failure(unwrap(api.POST('/suggestions', { body: { item_id: pollo.id } })))
    expect(again?.code).toBe('ORDER_IN_TRANSIT')

    const received = await unwrap(api.POST('/orders/{order_id}/receipt', { params: { path: { order_id: order.id } }, body: {} }))
    expect(received.status).toBe('RECEIVED')
    expect(Number((await itemNamed(POLLO)).current_stock)).toBe(18)
  })

  it('rechazar exige motivo y lo guarda en rejection_reason', async () => {
    const pollo = await itemNamed(POLLO)
    const suggestion = await pendingSuggestion(pollo.id)
    const path = { params: { path: { suggestion_id: suggestion.id } } }
    const noReason = await failure(unwrap(api.POST('/suggestions/{suggestion_id}/decision', { ...path, body: { decision: 'REJECT' } })))
    expect(noReason?.code).toBe('REJECTION_REASON_REQUIRED')
    const rejected = await unwrap(api.POST('/suggestions/{suggestion_id}/decision', { ...path, body: { decision: 'REJECT', reason: 'Precio alto' } }))
    expect([rejected.status, rejected.rejection_reason]).toEqual(['REJECTED', 'Precio alto'])
  })

  it('si el stock cambió desde la sugerencia, aprobar responde STALE_SUGGESTION', async () => {
    const pollo = await itemNamed(POLLO)
    const suggestion = await pendingSuggestion(pollo.id)
    await unwrap(api.POST('/movements', { body: { item_id: pollo.id, kind: 'EXIT', quantity: '1', unit: 'kg' } }))
    const error = await failure(
      unwrap(api.POST('/suggestions/{suggestion_id}/decision', { params: { path: { suggestion_id: suggestion.id } }, body: { decision: 'APPROVE' } })),
    )
    expect(error?.code).toBe('STALE_SUGGESTION')
  })

  it('métricas del período: 3 órdenes aprobadas antes del quiebre y ahorro acumulado', async () => {
    const end = new Date().toISOString()
    const start = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const m = (await unwrap(api.GET('/metrics', { params: { query: { start, end } } }))) as unknown as Metrics
    expect(m.approved_orders).toBe(3) // OC-0010, OC-0011 y la de huevos en tránsito
    expect(m.alerts_attended_before_depletion).toBe(3)
    expect(Number(m.estimated_savings_clp)).toBe(5_800 + 3_600 + 12_190)
    expect(m.impact_comparison.status).toBe('NOT_VERIFIABLE')
  })

  it('métricas: si el período empieza antes del registro del insumo, la merma no es calculable', async () => {
    const pollo = await itemNamed(POLLO)
    const before = new Date(Date.parse(pollo.observation_started_at!) - 86_400_000).toISOString()
    const after = new Date(Date.parse(pollo.observation_started_at!) + 1).toISOString()
    const end = new Date().toISOString()
    const rowFor = async (start: string) => {
      const m = (await unwrap(api.GET('/metrics', { params: { query: { start, end } } }))) as unknown as Metrics
      return m.items.find((i) => i.item_id === pollo.id)!.shortage
    }
    expect((await rowFor(before)).status).toBe('NOT_CALCULABLE')
    const fromRecord = await rowFor(after)
    expect(fromRecord.status).toBe('CALCULABLE')
    expect(Number(fromRecord.shortage)).toBeGreaterThan(0)
  })

  it('métricas: la bodega no tiene acceso', async () => {
    await loginAs('bodega@negocio.cl')
    const error = await failure(unwrap(api.GET('/metrics', { params: { query: { start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z' } } })))
    expect(error?.status).toBe(403)
  })
})

describe('historial', () => {
  it('ordena por ocurrencia aunque las fechas vengan con distinto desplazamiento horario', () => {
    const base = { item_id: 1, input_quantity: null, input_unit: null, invalidates_movement_id: null, note: null, created_by: null }
    const movements: Movement[] = [
      { ...base, id: 1, kind: 'INITIAL', delta: '10', balance_after: '10', occurred_at: '2026-09-01T12:00:00Z', created_at: '2026-09-01T12:00:00Z' },
      // 09:00 en Chile (-03:00) = 12:00 UTC del día 3: ocurre después del #3.
      { ...base, id: 2, kind: 'EXIT', delta: '-3', balance_after: '12', occurred_at: '2026-09-03T09:00:00-03:00', created_at: '2026-09-03T12:00:00Z' },
      { ...base, id: 3, kind: 'ENTRY', delta: '5', balance_after: '15', occurred_at: '2026-09-03T11:00:00Z', created_at: '2026-09-04T12:00:00Z' },
      { ...base, id: 4, kind: 'REVERSAL', delta: '3', balance_after: '15', occurred_at: '2026-09-05T12:00:00Z', created_at: '2026-09-05T12:00:00Z', invalidates_movement_id: 2 },
    ]
    const ledger = buildLedger(movements)
    expect(ledger.map((row) => [row.id, row.balance])).toEqual([
      [4, 15],
      [2, 12],
      [3, 15],
      [1, 10],
    ])
    expect(ledger.find((row) => row.id === 2)!.invalidated).toBe(true)
    const rawReceipt =
      'E2_RECEIPT:{"approved_at":"2026-09-30T12:05:00+00:00","base_unit":"kg","order_code":"OC-E2-0015","order_id":"OC-E2-0015","receipt_id":"RCP-E2-0015"}'
    expect(formatMovementNote(rawReceipt)).toBe('Recepción OC-E2-0015')
    expect(formatMovementNote('E2_RECEIPT:{"receipt_id":"RCP-E2-0007"}')).toBe('Recepción RCP-E2-0007')
    expect(formatMovementNote('E2_RECEIPT:{}')).toBe('—')
    expect(formatMovementNote('E2_RECEIPT:{invalid')).toBe('—')
    expect(formatMovementNote('Order receipt OC-0013')).toBe('Recepción OC-0013')
    expect(formatMovementNote('Recepción OC-0013')).toBe('Recepción OC-0013')
    expect(formatMovementNote('SYNTHETIC_E2_TEST_DATA_NOT_A_REAL_BUSINESS; Dataset_v2 sha256=abc')).toBe('—')
    expect(formatMovementNote('Consumo cocina')).toBe('Consumo cocina')
    expect(formatMovementNote(null)).toBe('—')
    expect(formatMovementNote('   ')).toBe('—')
  })
})
