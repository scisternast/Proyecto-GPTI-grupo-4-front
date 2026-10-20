// Rutas del backend simulado para `npm run dev:mock` y los tests. Siguen el contrato OpenAPI del
// backend: todas exigen token (salvo login y health) y las de configuración, Administrador(a).
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { API_URL } from '../api/client'
import type {
  CountCreate,
  ItemCreate,
  ItemState,
  ItemUpdate,
  MovementCreate,
  OrderReceipt,
  SupplierCreate,
  User,
  SupplierProductCreate,
  SupplierProductUpdate,
  SupplierUpdate,
} from '../api/types'
import { createDb, MockError, PASSWORD } from './db'

const url = (path: string) => `${API_URL}${path}`
const now = () => new Date().toISOString()
const toBase: Record<string, number> = { kg: 1, g: 0.001, L: 1, mL: 0.001, unidad: 1 }

let db = createDb()

/** Vuelve a los datos de ejemplo (para los tests). */
export function resetMockDb() {
  db = createDb()
}

function fail(status: number, code: string, message: string) {
  return HttpResponse.json({ error: { code, message } }, { status })
}

function userFrom(request: Request): User | null {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  return db.users.find((user) => token === `mock-token-${user.id}`) ?? null
}

function requireUser(request: Request): User {
  const user = userFrom(request)
  if (!user) throw new MockError(401, 'UNAUTHENTICATED', 'Missing or invalid token')
  return user
}

/** Como la dependencia `Admin` del backend: 403 para el Encargado(a) de bodega. */
function requireAdmin(request: Request): User {
  const user = requireUser(request)
  if (user.role !== 'ADMIN') throw new MockError(403, 'FORBIDDEN', 'Esta operación requiere Administrador(a)')
  return user
}

/** Ejecuta la lógica y traduce MockError al sobre de error del backend. */
function handle(fn: () => JsonBodyType, status = 200) {
  try {
    return HttpResponse.json(fn(), { status })
  } catch (error) {
    if (error instanceof MockError) return fail(error.status, error.code, error.message)
    throw error
  }
}

function alertOf(item: ItemState) {
  const a = item.assessment
  return {
    item_id: item.id,
    current_stock: item.current_stock,
    safe_stock: a.safe_stock,
    alert_source: a.alert_source,
    alert_status: a.alert_status,
    is_low_stock: a.is_low_stock,
    base_unit: item.base_unit,
    lead_time_days: a.lead_time_days,
    projected_stock_at_arrival: a.projected_stock_at_arrival,
    in_transit_quantity: a.in_transit_quantity,
    order_by_at: a.order_by_at,
  }
}

export const handlers = [
  http.get(url('/health'), () => HttpResponse.json({ status: 'ok' })),

  // Todas las rutas, salvo login y health, exigen un token válido (si lo hay, sigue a la ruta).
  http.all(url('/*'), ({ request }) => {
    const path = new URL(request.url).pathname
    if (path.endsWith('/auth/login') || path.endsWith('/health') || userFrom(request)) return undefined
    return fail(401, 'UNAUTHENTICATED', 'Se requiere un token Bearer válido')
  }),

  // --- Autenticación ---
  http.post(url('/auth/login'), async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string }
    const user = db.users.find((u) => u.email === email.trim().toLowerCase())
    if (!user || password !== PASSWORD) return fail(401, 'UNAUTHENTICATED', 'Credenciales no válidas o vencidas')
    return HttpResponse.json({ access_token: `mock-token-${user.id}`, token_type: 'bearer', expires_in: 1800 })
  }),
  http.get(url('/auth/me'), ({ request }) => handle(() => requireUser(request))),

  // --- Insumos ---
  http.get(url('/items'), () => handle(() => db.items.map((item) => db.itemView(item.id)))),

  http.post(url('/items'), async ({ request }) => {
    const body = (await request.json()) as ItemCreate
    return handle(() => {
      requireAdmin(request)
      if (!body.name?.trim()) throw new MockError(422, 'INVALID_NAME', 'Name is required')
      const initial = Number(body.initial_quantity) * (toBase[body.initial_unit] ?? 1)
      const manual = body.manual_safe_stock == null ? null : Number(body.manual_safe_stock)
      const item = db.createItem(
        { name: body.name.trim(), base_unit: body.base_unit, initial, manual_safe_stock: manual },
        now(),
        userFrom(request),
      )
      return db.itemView(item.id)
    }, 201)
  }),

  http.get(url('/items/:id'), ({ params }) => handle(() => db.itemView(Number(params.id)))),
  http.get(url('/items/:id/consumption'), ({ params }) => handle(() => db.itemView(Number(params.id)))),
  http.get(url('/items/:id/alert'), ({ params }) => handle(() => alertOf(db.itemView(Number(params.id))))),

  http.patch(url('/items/:id'), async ({ params, request }) => {
    const body = (await request.json()) as ItemUpdate
    return handle(() => {
      requireAdmin(request)
      const item = db.getItemRow(Number(params.id))
      if (Object.keys(body).length === 0) throw new MockError(422, 'EMPTY_UPDATE', 'Nothing to update')
      if (body.name != null) item.name = body.name
      if ('manual_safe_stock' in body) {
        item.manual_safe_stock = body.manual_safe_stock == null ? null : Number(body.manual_safe_stock)
      }
      item.updated_at = now()
      return db.itemView(item.id)
    })
  }),

  http.get(url('/items/:id/movements'), ({ params }) =>
    handle(() => db.movementsOf(db.getItemRow(Number(params.id)).id)),
  ),

  http.get(url('/items/:id/counts'), ({ params }) =>
    handle(() => {
      const item = db.getItemRow(Number(params.id))
      return db.counts.filter((c) => c.item_id === item.id).sort((a, b) => a.id - b.id)
    }),
  ),

  // --- Movimientos y conteos ---
  http.post(url('/movements'), async ({ request }) => {
    const body = (await request.json()) as MovementCreate
    return handle(() => {
      const item = db.getItemRow(body.item_id)
      if (body.occurred_at && Date.parse(body.occurred_at) > Date.now()) {
        throw new MockError(422, 'FUTURE_MOVEMENT', 'Movement cannot occur in the future')
      }
      const quantity = Number(body.quantity) * (toBase[body.unit] ?? 1)
      const delta = body.kind === 'EXIT' ? -quantity : quantity
      if (db.stockOf(item.id) + delta < 0) throw new MockError(409, 'NEGATIVE_STOCK', 'Insufficient stock')
      return db.addMovement(
        item.id,
        {
          kind: body.kind,
          delta: String(delta),
          input_quantity: String(Number(body.quantity)),
          input_unit: body.unit,
          occurred_at: body.occurred_at ?? now(),
          note: body.note ?? null,
        },
        userFrom(request),
      )
    }, 201)
  }),

  http.post(url('/movements/:id/reverse'), ({ params, request }) =>
    handle(() => {
      const target = db.movements.find((m) => m.id === Number(params.id))
      if (!target) throw new MockError(404, 'MOVEMENT_NOT_FOUND', 'Movement does not exist')
      if (target.kind !== 'ENTRY' && target.kind !== 'EXIT') {
        throw new MockError(409, 'INVALID_CORRECTION_TARGET', 'Only entries and exits can be reversed')
      }
      if (db.movements.some((m) => m.invalidates_movement_id === target.id)) {
        throw new MockError(409, 'ALREADY_CORRECTED', 'Movement already reversed')
      }
      if (db.stockOf(target.item_id) - Number(target.delta) < 0) throw new MockError(409, 'NEGATIVE_STOCK', 'Insufficient stock')
      return db.addMovement(
        target.item_id,
        { kind: 'REVERSAL', delta: String(-Number(target.delta)), invalidates_movement_id: target.id },
        userFrom(request),
      )
    }, 201),
  ),

  http.post(url('/counts'), async ({ request }) => {
    const body = (await request.json()) as CountCreate
    return handle(() => {
      const item = db.getItemRow(body.item_id)
      const physical = Number(body.physical_quantity) * (toBase[body.unit] ?? 1)
      return db.addCount(item.id, physical, body.cause ?? null, now(), userFrom(request))
    }, 201)
  }),

  http.get(url('/items/:id/shortage-rate'), ({ params, request }) =>
    handle(() => {
      const item = db.getItemRow(Number(params.id))
      const query = new URL(request.url).searchParams
      const start = query.get('start') ?? ''
      const end = query.get('end') ?? ''
      if (!start || !end || Date.parse(start) >= Date.parse(end)) {
        throw new MockError(422, 'INVALID_PERIOD', 'Start must precede end')
      }
      return db.shortageRate(item.id, start, end)
    }),
  ),

  /** Solo LOW_STOCK: las que requieren pedir. */
  http.get(url('/alerts'), () =>
    handle(() =>
      db.items
        .map((item) => db.itemView(item.id))
        .filter((item) => item.assessment.alert_status === 'LOW_STOCK')
        .map(alertOf),
    ),
  ),

  // --- Proveedores y productos ---
  http.get(url('/suppliers'), () => handle(() => [...db.suppliers].sort((a, b) => a.id - b.id))),
  http.get(url('/suppliers/:id'), ({ params }) => handle(() => db.getSupplier(Number(params.id)))),

  http.post(url('/suppliers'), async ({ request }) => {
    const body = (await request.json()) as SupplierCreate
    return handle(() => {
      requireAdmin(request)
      if (db.suppliers.some((s) => s.name === body.name)) throw new MockError(409, 'SUPPLIER_EXISTS', 'Duplicated name')
      const supplier = {
        id: db.nextId(),
        name: body.name,
        price_source_url: body.price_source_url ?? null,
        lead_time_days: body.lead_time_days,
        adapter: body.adapter ?? null,
        is_active: body.is_active ?? true,
        created_at: now(),
        updated_at: now(),
      }
      db.suppliers.push(supplier)
      return supplier
    }, 201)
  }),

  http.patch(url('/suppliers/:id'), async ({ params, request }) => {
    const body = (await request.json()) as SupplierUpdate
    return handle(() => {
      requireAdmin(request)
      const supplier = db.getSupplier(Number(params.id))
      if (Object.keys(body).length === 0) throw new MockError(422, 'EMPTY_UPDATE', 'Nothing to update')
      if (body.name && db.suppliers.some((s) => s.name === body.name && s.id !== supplier.id)) {
        throw new MockError(409, 'SUPPLIER_EXISTS', 'Duplicated name')
      }
      Object.assign(supplier, body, { updated_at: now() })
      return supplier
    })
  }),

  http.get(url('/suppliers/:id/products'), ({ params }) =>
    handle(() => db.products.filter((p) => p.supplier_id === db.getSupplier(Number(params.id)).id)),
  ),

  http.post(url('/suppliers/:id/products'), async ({ params, request }) => {
    const body = (await request.json()) as SupplierProductCreate
    return handle(() => {
      requireAdmin(request)
      return db.createProduct(Number(params.id), {
          item_id: body.item_id,
          name_on_site: body.name_on_site,
          url: body.url,
          pack_quantity: String(body.pack_quantity),
          min_packs: body.min_packs ?? 1,
          is_active: body.is_active ?? true,
          scrape_config: body.scrape_config
            ? {
                ...body.scrape_config,
                pack: { ...body.scrape_config.pack, content_quantity: String(body.scrape_config.pack.content_quantity) },
              }
            : null,
        })
    }, 201)
  }),

  http.patch(url('/suppliers/:id/products/:productId'), async ({ params, request }) => {
    const body = (await request.json()) as SupplierProductUpdate
    return handle(() => {
      requireAdmin(request)
      const product = db.products.find((p) => p.id === Number(params.productId) && p.supplier_id === Number(params.id))
      if (!product) throw new MockError(404, 'PRODUCT_NOT_FOUND', 'Product does not exist')
      if (Object.keys(body).length === 0) throw new MockError(422, 'EMPTY_UPDATE', 'Nothing to update')
      const changesIdentity = ['url', 'pack_quantity'].some((key) => key in body)
      if (changesIdentity && db.orders.some((o) => o.supplier_product_id === product.id)) {
        throw new MockError(409, 'PRODUCT_IN_USE', 'Deactivate and register a new product')
      }
      Object.assign(product, body)
      return product
    })
  }),

  http.get(url('/suppliers/:id/scrape-runs'), ({ params }) =>
    handle(() => db.runs.filter((run) => run.supplier_id === db.getSupplier(Number(params.id)).id).sort((a, b) => b.id - a.id)),
  ),

  // --- Precios ---
  http.get(url('/prices/:itemId'), ({ params }) => handle(() => db.prices(Number(params.itemId)) as unknown as JsonBodyType)),
  http.post(url('/prices/:itemId/refresh'), ({ params, request }) =>
    handle(() => (requireAdmin(request), db.refreshPrices(Number(params.itemId))) as unknown as JsonBodyType),
  ),

  // --- Órdenes ---
  http.get(url('/orders'), () => handle(() => [...db.orders].sort((a, b) => a.id - b.id))),

  http.post(url('/orders/:id/receipt'), async ({ params, request }) => {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as OrderReceipt
    return handle(() =>
      db.receive(Number(params.id), { received_at: body.received_at, received_quantity: body.received_quantity == null ? null : String(body.received_quantity) }, userFrom(request)),
    )
  }),

  // --- Sugerencias y decisiones ---
  http.get(url('/suggestions'), ({ request }) => {
    const itemId = Number(new URL(request.url).searchParams.get('item_id'))
    return HttpResponse.json(db.suggestions.filter((s) => !itemId || s.item_id === itemId))
  }),

  http.get(url('/suggestions/:id'), ({ params }) =>
    handle(() => {
      const found = db.suggestions.find((s) => s.id === Number(params.id))
      if (!found) throw new MockError(404, 'SUGGESTION_NOT_FOUND', 'La sugerencia no existe')
      return found
    }),
  ),

  http.post(url('/suggestions'), async ({ request }) => {
    const { item_id } = (await request.json()) as { item_id: number }
    return handle(() => db.createSuggestion(item_id, requireUser(request)), 201)
  }),

  http.post(url('/suggestions/:id/decision'), async ({ params, request }) => {
    const body = (await request.json()) as { decision: 'APPROVE' | 'REJECT'; reason?: string | null }
    return handle(() => db.decide(Number(params.id), body.decision, body.reason, requireUser(request)))
  }),

  // --- Métricas (todo el negocio, período [start, end), solo Administrador(a)) ---
  http.get(url('/metrics'), ({ request }) => {
    const query = new URL(request.url).searchParams
    return handle(() => {
      requireAdmin(request)
      return db.metrics(query.get('start') ?? '', query.get('end') ?? '') as unknown as JsonBodyType
    })
  }),
]
