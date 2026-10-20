import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearSession, saveSession } from '../auth/session'
import { handlers, resetMockData } from '../mocks/handlers'
import { api, unwrap } from './client'
import { ApiError } from './errors'

const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(async () => {
  resetMockData()
  clearSession()
  saveSession(await unwrap(api.POST('/auth/login', { body: { email: 'admin@stocksmart.test', password: 'stocksmart-demo' } })))
})
afterAll(() => server.close())

describe('cliente de la API contra el backend simulado', () => {
  it('crea un insumo y registra una salida', async () => {
    const item = await unwrap(
      api.POST('/items', {
        body: { name: 'Azúcar', base_unit: 'kg', initial_quantity: '25', initial_unit: 'kg', timezone: 'America/Santiago' },
      }),
    )
    expect(item.current_stock).toBe('25.000000')

    const movement = await unwrap(api.POST('/movements', { body: { item_id: item.id, kind: 'EXIT', quantity: '500', unit: 'g' } }))
    expect(movement.balance_after).toBe('24.500000')
    expect(movement.created_by?.name).toBe('Admin demo')
    const updated = await unwrap(api.GET('/items/{item_id}', { params: { path: { item_id: item.id } } }))
    expect(updated.current_stock).toBe('24.500000')
  })

  it('traduce el código de error del backend', async () => {
    const error = await unwrap(
      api.POST('/movements', { body: { item_id: 1, kind: 'EXIT', quantity: '1000', unit: 'kg' } }),
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('NEGATIVE_STOCK')
    expect((error as ApiError).message).toBe('No hay stock suficiente para esa salida.')
  })

  it('devuelve 404 como ITEM_NOT_FOUND', async () => {
    const error = await unwrap(api.GET('/items/{item_id}', { params: { path: { item_id: 999 } } })).catch(
      (e: unknown) => e,
    )
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).code).toBe('ITEM_NOT_FOUND')
  })

  it('lista insumos con GET /items y muestra las unidades de las alertas', async () => {
    const items = await unwrap(api.GET('/items'))
    const huevos = items.find((item) => item.name === 'Huevos')!
    expect(huevos.assessment.alert_status).toBe('LOW_STOCK')
    const alerts = await unwrap(api.GET('/alerts'))
    expect(alerts.map((a) => a.item_id)).toContain(huevos.id)
    expect(alerts.find((alert) => alert.item_id === huevos.id)?.base_unit).toBe('unidad')
  })
})
