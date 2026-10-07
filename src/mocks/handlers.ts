// Backend simulado en memoria para `npm run dev:mock`. Sigue el contrato OpenAPI,
// pero NO replica las reglas del backend (consumo, proyección, D1–D7): solo sirve para
// avanzar pantallas sin PostgreSQL. Los datos se pierden al recargar la página.
import { http, HttpResponse } from 'msw'
import { API_URL } from '../api/client'
import type { Alert, Count, CountCreate, ItemCreate, ItemState, Movement, MovementCreate } from '../api/types'

const url = (path: string) => `${API_URL}${path}`
const now = () => new Date().toISOString()
const dec = (value: number) => value.toFixed(6)
const toBase: Record<string, number> = { kg: 1, g: 0.001, L: 1, mL: 0.001, unidad: 1 }

let nextId = 1
const items = new Map<number, ItemState>()
const movements: Movement[] = []
const counts: Count[] = []

function fail(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status })
}

function assess(item: ItemState): ItemState {
  const safe = item.manual_safe_stock
  const isLow = safe === null ? null : Number(item.current_stock) <= Number(safe)
  return {
    ...item,
    assessment: {
      ...item.assessment,
      safe_stock: safe,
      alert_source: safe === null ? null : 'MANUAL_THRESHOLD',
      alert_status: isLow === null ? 'INSUFFICIENT_HISTORY' : isLow ? 'LOW_STOCK' : 'OK',
      is_low_stock: isLow,
    },
  }
}

function addMovement(itemId: number, data: Partial<Movement> & Pick<Movement, 'kind' | 'delta'>): Movement {
  const item = items.get(itemId)!
  const movement: Movement = {
    id: nextId++,
    item_id: itemId,
    input_quantity: null,
    input_unit: null,
    occurred_at: now(),
    created_at: now(),
    invalidates_movement_id: null,
    note: null,
    ...data,
  }
  movements.push(movement)
  items.set(itemId, assess({ ...item, current_stock: dec(Number(item.current_stock) + Number(data.delta)), updated_at: now() }))
  return movement
}

function createItem(body: ItemCreate): ItemState {
  const id = nextId++
  const stamp = now()
  const quantity = Number(body.initial_quantity) * (toBase[body.initial_unit] ?? 1)
  items.set(id, {
    id,
    name: body.name,
    base_unit: body.base_unit,
    timezone: body.timezone,
    current_stock: dec(0),
    manual_safe_stock: body.manual_safe_stock == null ? null : dec(Number(body.manual_safe_stock)),
    observation_started_at: stamp,
    created_at: stamp,
    updated_at: stamp,
    consumption: {
      status: 'INSUFFICIENT_HISTORY',
      complete_days: 0,
      observed_quantity: '0',
      weekly_average: null,
      window_start: null,
      window_end: null,
    },
    assessment: {
      safe_stock: null,
      alert_source: null,
      alert_status: 'INSUFFICIENT_HISTORY',
      is_low_stock: null,
      target_stock: null,
      suggested_quantity: null,
      daily_average: null,
      remaining_days: null,
      depletion_at: null,
      depletion_status: 'INSUFFICIENT_HISTORY',
    },
  })
  addMovement(id, { kind: 'INITIAL', delta: dec(quantity), input_quantity: dec(Number(body.initial_quantity)), input_unit: body.initial_unit })
  return items.get(id)!
}

// Datos de ejemplo (números del mockup, Arquitectura.md §4.3).
createItem({ name: 'Harina', base_unit: 'kg', initial_quantity: '9', initial_unit: 'kg', timezone: 'America/Santiago', manual_safe_stock: '5' })
createItem({ name: 'Leche', base_unit: 'L', initial_quantity: '12', initial_unit: 'L', timezone: 'America/Santiago' })
createItem({ name: 'Huevos', base_unit: 'unidad', initial_quantity: '30', initial_unit: 'unidad', timezone: 'America/Santiago', manual_safe_stock: '36' })

function withItem<T>(id: string | readonly string[] | undefined, fn: (item: ItemState) => T) {
  const item = items.get(Number(id))
  return item ? fn(item) : fail(404, 'ITEM_NOT_FOUND', 'Item does not exist')
}

export const handlers = [
  http.get(url('/health'), () => HttpResponse.json({ status: 'ok' })),

  // Pendiente en el backend real (Arquitectura.md §5.3).
  http.get(url('/items'), () => HttpResponse.json([...items.values()])),

  http.post(url('/items'), async ({ request }) => {
    const body = (await request.json()) as ItemCreate
    if (!body.name?.trim()) return fail(409, 'INVALID_NAME', 'Name is required')
    return HttpResponse.json(createItem(body), { status: 201 })
  }),

  http.get(url('/items/:id'), ({ params }) => withItem(params.id, (item) => HttpResponse.json(item))),
  http.get(url('/items/:id/consumption'), ({ params }) => withItem(params.id, (item) => HttpResponse.json(item))),

  http.put(url('/items/:id/safe-stock'), async ({ params, request }) => {
    const { manual_safe_stock } = (await request.json()) as { manual_safe_stock: string | null }
    return withItem(params.id, (item) => {
      const updated = assess({ ...item, manual_safe_stock: manual_safe_stock === null ? null : dec(Number(manual_safe_stock)) })
      items.set(item.id, updated)
      return HttpResponse.json(updated)
    })
  }),

  http.get(url('/items/:id/movements'), ({ params }) =>
    withItem(params.id, (item) => HttpResponse.json(movements.filter((m) => m.item_id === item.id))),
  ),

  http.get(url('/items/:id/counts'), ({ params }) =>
    withItem(params.id, (item) => HttpResponse.json(counts.filter((c) => c.item_id === item.id))),
  ),

  http.post(url('/movements'), async ({ request }) => {
    const body = (await request.json()) as MovementCreate
    return withItem(String(body.item_id), (item) => {
      const quantity = Number(body.quantity) * (toBase[body.unit] ?? 1)
      const delta = body.kind === 'EXIT' ? -quantity : quantity
      if (Number(item.current_stock) + delta < 0) return fail(409, 'NEGATIVE_STOCK', 'Insufficient stock')
      const movement = addMovement(item.id, {
        kind: body.kind,
        delta: dec(delta),
        input_quantity: dec(Number(body.quantity)),
        input_unit: body.unit,
        occurred_at: body.occurred_at ?? now(),
        note: body.note ?? null,
      })
      return HttpResponse.json(movement, { status: 201 })
    })
  }),

  http.post(url('/movements/:id/reverse'), ({ params }) => {
    const target = movements.find((m) => m.id === Number(params.id))
    if (!target) return fail(404, 'MOVEMENT_NOT_FOUND', 'Movement does not exist')
    if (movements.some((m) => m.invalidates_movement_id === target.id)) {
      return fail(409, 'ALREADY_CORRECTED', 'Movement already reversed')
    }
    const item = items.get(target.item_id)!
    if (Number(item.current_stock) - Number(target.delta) < 0) return fail(409, 'NEGATIVE_STOCK', 'Insufficient stock')
    const movement = addMovement(item.id, { kind: 'REVERSAL', delta: dec(-Number(target.delta)), invalidates_movement_id: target.id })
    return HttpResponse.json(movement, { status: 201 })
  }),

  http.post(url('/counts'), async ({ request }) => {
    const body = (await request.json()) as CountCreate
    return withItem(String(body.item_id), (item) => {
      const physical = Number(body.physical_quantity) * (toBase[body.unit] ?? 1)
      const before = Number(item.current_stock)
      const difference = physical - before
      const adjustment = addMovement(item.id, { kind: 'COUNT_ADJUSTMENT', delta: dec(difference) })
      const count: Count = {
        id: nextId++,
        item_id: item.id,
        adjustment_movement_id: adjustment.id,
        corrects_movement_id: body.corrects_movement_id ?? null,
        theoretical_before: dec(before),
        physical_stock: dec(physical),
        difference: dec(difference),
        shortage: dec(Math.max(0, -difference)),
        cause: body.cause ?? null,
        occurred_at: now(),
        created_at: now(),
      }
      counts.push(count)
      return HttpResponse.json(count, { status: 201 })
    })
  }),

  http.get(url('/items/:id/shortage-rate'), ({ params }) =>
    withItem(params.id, (item) => {
      const shortage = counts.filter((c) => c.item_id === item.id).reduce((sum, c) => sum + Number(c.shortage), 0)
      const available = movements
        .filter((m) => m.item_id === item.id && Number(m.delta) > 0 && m.kind !== 'COUNT_ADJUSTMENT')
        .reduce((sum, m) => sum + Number(m.delta), 0)
      return HttpResponse.json({
        status: available > 0 ? 'CALCULABLE' : 'NOT_CALCULABLE',
        available: available > 0 ? dec(available) : null,
        shortage: dec(shortage),
        rate_percent: available > 0 ? dec((shortage / available) * 100) : null,
      })
    }),
  ),

  http.get(url('/alerts'), () => {
    const alerts: Alert[] = [...items.values()]
      .filter((item) => item.assessment.is_low_stock)
      .map((item) => ({
        item_id: item.id,
        current_stock: item.current_stock,
        safe_stock: item.assessment.safe_stock,
        alert_source: item.assessment.alert_source,
        alert_status: item.assessment.alert_status,
        is_low_stock: item.assessment.is_low_stock,
      }))
    return HttpResponse.json(alerts)
  }),
]
