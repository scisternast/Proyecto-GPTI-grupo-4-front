// Base de datos en memoria del backend simulado (`npm run dev:mock` y tests).
// Devuelve la misma forma que el backend real (rama con autenticación, sugerencias y métricas).
// Las reglas (§4.3) se aproximan solo para que la demo tenga números creíbles: manda el backend.
import {
  type Assessment,
  type BaseUnit,
  type Count,
  type ItemState,
  type Metrics,
  type Movement,
  type Order,
  type PriceComparison,
  type PriceOffer,
  type PriceOption,
  type PriceState,
  type ScrapeConfig,
  type ScrapeRun,
  type ScrapeRunProductResult,
  snapshotOf,
  type Suggestion,
  type Supplier,
  type SupplierProduct,
  type User,
} from '../api/types'
import { dayKey } from '../lib/format'

const DAY = 86_400_000
/** Redondeo a 6 decimales, como el NUMERIC(24,6) del backend (evita errores de punto flotante). */
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000
const dec = (value: number) => String(round6(value))
const iso = (date: Date | number) => new Date(date).toISOString()
const now = () => iso(Date.now())
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

/** Hace `days` días a la hora local `hour`; hoy (0), hace una hora para no quedar en el futuro. */
function daysAgo(days: number, hour = 12): string {
  if (days === 0) return iso(Date.now() - 3_600_000)
  const date = new Date(Date.now() - days * DAY)
  date.setHours(hour, 0, 0, 0)
  return iso(date)
}

export class MockError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

interface ItemRow {
  id: number
  name: string
  base_unit: BaseUnit
  manual_safe_stock: number | null
  observation_started_at: string
  created_at: string
  updated_at: string
}

type MovementRow = Omit<Movement, 'balance_after'>

interface Quote {
  id: number
  supplier_product_id: number
  pack_price_clp: number
  available: boolean
  observed_at: string
}

/** Contraseña de los usuarios de prueba (el backend real exige entre 12 y 72 bytes). */
export const PASSWORD = 'stocksmart-demo'

export function createDb() {
  let nextId = 1
  const id = () => nextId++

  const users: User[] = [
    { id: id(), email: 'admin@negocio.cl', name: 'Ana Pérez', role: 'ADMIN' },
    { id: id(), email: 'bodega@negocio.cl', name: 'Luis Rojas', role: 'WAREHOUSE' },
  ]
  const [admin, warehouse] = users
  const ref = (user: User | null) => (user ? { id: user.id, name: user.name } : null)

  // Proveedores validados (§12). Entrega: A 2, B 4 y C 3 días, como en el mockup.
  const supplier = (name: string, url: string, lead: number, adapter: Supplier['adapter']): Supplier => ({
    id: id(),
    name,
    price_source_url: url,
    lead_time_days: lead,
    adapter,
    is_active: true,
    created_at: daysAgo(60),
    updated_at: daysAgo(60),
  })
  const suppliers: Supplier[] = [
    supplier('Central Mayorista', 'https://www.centralmayorista.cl', 2, 'central'),
    supplier('Jumbo', 'https://www.jumbo.cl', 4, 'jumbo'),
    supplier('Santa Isabel', 'https://www.santaisabel.cl', 3, 'santa_isabel'),
  ]
  const [central, jumbo, santaIsabel] = suppliers

  const items: ItemRow[] = []
  const movements: MovementRow[] = []
  const counts: Count[] = []
  const products: SupplierProduct[] = []
  const quotes: Quote[] = []
  const runs: ScrapeRun[] = []
  const suggestions: Suggestion[] = []
  const orders: Order[] = []

  // --- Inventario ---

  function getItemRow(itemId: number) {
    const item = items.find((row) => row.id === itemId)
    if (!item) throw new MockError(404, 'ITEM_NOT_FOUND', 'Item does not exist')
    return item
  }

  function stockOf(itemId: number) {
    return round6(sum(movements.filter((m) => m.item_id === itemId).map((m) => Number(m.delta))))
  }

  const byOccurrence = (a: MovementRow, b: MovementRow) =>
    Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id

  /** Historial en orden de id, con `balance_after` según el orden de ocurrencia (como el backend). */
  function movementsOf(itemId: number): Movement[] {
    const ofItem = movements.filter((m) => m.item_id === itemId)
    const balances = new Map<number, number>()
    let running = 0
    for (const m of [...ofItem].sort(byOccurrence)) {
      running += Number(m.delta)
      balances.set(m.id, running)
    }
    return ofItem.sort((a, b) => a.id - b.id).map((m) => ({ ...m, balance_after: dec(balances.get(m.id)!) }))
  }

  function balanceAt(itemId: number, at: string) {
    return round6(
      sum(movements.filter((m) => m.item_id === itemId && Date.parse(m.occurred_at) <= Date.parse(at)).map((m) => Number(m.delta))),
    )
  }

  function addMovement(itemId: number, data: Partial<MovementRow> & Pick<MovementRow, 'kind' | 'delta'>, user: User | null): Movement {
    const occurredAt = data.occurred_at ?? now()
    const row: MovementRow = {
      id: id(),
      item_id: itemId,
      input_quantity: null,
      input_unit: null,
      created_at: Date.parse(occurredAt) < Date.now() ? occurredAt : now(),
      invalidates_movement_id: null,
      note: null,
      created_by: ref(user),
      ...data,
      occurred_at: occurredAt,
    }
    movements.push(row)
    getItemRow(itemId).updated_at = now()
    return movementsOf(itemId).find((m) => m.id === row.id)!
  }

  function createItem(
    input: { name: string; base_unit: BaseUnit; initial: number; manual_safe_stock: number | null },
    startedAt: string,
    user: User | null,
  ) {
    const row: ItemRow = {
      id: id(),
      name: input.name,
      base_unit: input.base_unit,
      manual_safe_stock: input.manual_safe_stock,
      observation_started_at: startedAt,
      created_at: startedAt,
      updated_at: startedAt,
    }
    items.push(row)
    addMovement(
      row.id,
      { kind: 'INITIAL', delta: dec(input.initial), input_quantity: dec(input.initial), input_unit: input.base_unit, occurred_at: startedAt },
      user,
    )
    return row
  }

  function addCount(itemId: number, physical: number, cause: Count['cause'], occurredAt: string, user: User | null) {
    const theoretical = balanceAt(itemId, occurredAt)
    const difference = physical - theoretical
    const adjustment = addMovement(itemId, { kind: 'COUNT_ADJUSTMENT', delta: dec(difference), occurred_at: occurredAt }, user)
    const count: Count = {
      id: id(),
      item_id: itemId,
      adjustment_movement_id: adjustment.id,
      corrects_movement_id: null,
      theoretical_before: dec(theoretical),
      physical_stock: dec(physical),
      difference: dec(difference),
      shortage: dec(Math.max(0, -difference)),
      cause,
      occurred_at: occurredAt,
      created_at: occurredAt,
      needs_review: difference > 0,
      created_by: user?.id ?? null,
    }
    counts.push(count)
    return count
  }

  /** Salidas diarias de los últimos `days` días (sin hoy); `pattern` se repite. */
  function seedExits(itemId: number, days: number, pattern: number[], notes: Record<number, string> = {}) {
    const unit = getItemRow(itemId).base_unit
    for (let day = days; day >= 1; day--) {
      const quantity = pattern[day % pattern.length]
      if (quantity > 0) {
        addMovement(
          itemId,
          { kind: 'EXIT', delta: dec(-quantity), input_quantity: dec(quantity), input_unit: unit, occurred_at: daysAgo(day, 18), note: notes[day] ?? null },
          warehouse,
        )
      }
    }
  }

  const exitsTotal = (days: number, pattern: number[]) => sum(Array.from({ length: days }, (_, i) => pattern[(i + 1) % pattern.length]))

  // --- Catálogo: productos de proveedores y precios ---

  function getSupplier(supplierId: number) {
    const found = suppliers.find((s) => s.id === supplierId)
    if (!found) throw new MockError(404, 'SUPPLIER_NOT_FOUND', 'Supplier does not exist')
    return found
  }

  /** Como `validate_public_product_url` del backend: página pública del sitio del adaptador. */
  function validateUrl(sup: Supplier, url: string) {
    const hosts: Record<string, string> = { central: 'www.centralmayorista.cl', jumbo: 'www.jumbo.cl', santa_isabel: 'www.santaisabel.cl' }
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new MockError(422, 'INVALID_SOURCE', 'Use a valid public HTTPS URL')
    }
    const pattern = sup.adapter === 'central' ? /^\/p\/[^/]+$/ : /^\/[^/]+\/p$/
    if (parsed.protocol !== 'https:' || (sup.adapter && (parsed.hostname !== hosts[sup.adapter] || !pattern.test(parsed.pathname) || parsed.search))) {
      throw new MockError(422, 'INVALID_SOURCE', "Use the adapter's public product page")
    }
  }

  function createProduct(supplierId: number, data: Omit<SupplierProduct, 'id' | 'supplier_id'>): SupplierProduct {
    const sup = getSupplier(supplierId)
    getItemRow(data.item_id)
    validateUrl(sup, data.url)
    if (products.some((p) => p.supplier_id === supplierId && p.url === data.url)) {
      throw new MockError(409, 'PRODUCT_EXISTS', 'Product URL already registered')
    }
    const product: SupplierProduct = { id: id(), supplier_id: supplierId, ...data, pack_quantity: dec(Number(data.pack_quantity)) }
    products.push(product)
    return product
  }

  /** Producto de ejemplo con su configuración de scraping y, si se indica, un precio de hace `observedDaysAgo`. */
  function seedProduct(itemId: number, sup: Supplier, name: string, packQuantity: number, packPrice: number | null, observedDaysAgo = 0, configured = true) {
    const base = getItemRow(itemId).base_unit
    const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')
    const config: ScrapeConfig | null = configured
      ? {
          sku: String(100000 + products.length),
          brand: name.split(' ').at(-3) ?? 'Genérica',
          expected_name_tokens: name.toLowerCase().split(' ').slice(0, 2),
          pack: {
            commercial_format: name,
            content_quantity: dec(packQuantity),
            content_unit: base,
            units_per_pack: 1,
            base_unit: base,
            is_variable_weight: false,
          },
        }
      : null
    const product = createProduct(sup.id, {
      item_id: itemId,
      name_on_site: name,
      url: sup.adapter === 'central' ? `${sup.price_source_url}/p/${slug}` : `${sup.price_source_url}/${slug}/p`,
      pack_quantity: dec(packQuantity),
      min_packs: 1,
      is_active: true,
      scrape_config: config,
    })
    if (packPrice !== null) {
      quotes.push({ id: id(), supplier_product_id: product.id, pack_price_clp: packPrice, available: true, observed_at: daysAgo(observedDaysAgo, 9) })
    }
    return product
  }

  let pendingPolloSeed = () => {}

  // --- Escenario del mockup: pechuga de pollo asada (kg, con decimales) ---
  // Hoy 9 kg, 7 kg/semana, stock seguro manual 5 kg, entrega máx. 4 días (Jumbo)
  // → stock a la llegada 5 kg ≤ 5 kg → «pide hoy» 9 kg (Arquitectura.md §4.3).
  const pollo = (() => {
    const pattern = [1.2, 0.8, 1, 1.5, 0.5, 1, 1] // 7 kg por semana
    const history = 28
    const receipt = 18 // OC-0011
    const shrinks = [1.2, 0.6] // conteos de hace 14 y 7 días
    const surplus = 1 // conteo de hace 21 días: sobran 1 kg (para revisión)
    const todayExit = 2
    const initial = 9 + exitsTotal(history, pattern) + todayExit - receipt + sum(shrinks) - surplus
    const row = createItem({ name: 'Pechuga de pollo asada', base_unit: 'kg', initial, manual_safe_stock: 5 }, daysAgo(history, 8), admin)
    seedExits(row.id, history, pattern, { 4: 'Evento del fin de semana' })
    // Los conteos y la salida de hoy se cargan después de la recepción de OC-0011, para que su
    // stock teórico la incluya.
    pendingPolloSeed = () => {
      addCount(row.id, balanceAt(row.id, daysAgo(21, 20)) + surplus, 'error de registro', daysAgo(21, 20), warehouse)
      addCount(row.id, balanceAt(row.id, daysAgo(14, 20)) - shrinks[0], 'deterioro', daysAgo(14, 20), warehouse)
      addCount(row.id, balanceAt(row.id, daysAgo(7, 20)) - shrinks[1], 'vencimiento', daysAgo(7, 20), warehouse)
      addMovement(row.id, { kind: 'EXIT', delta: dec(-todayExit), input_quantity: dec(todayExit), input_unit: 'kg' }, warehouse)
    }
    // Precios por kg con IVA: Central Mayorista falló hoy (precio de hace 2 días, vigente);
    // Jumbo, correcto hoy; Santa Isabel, último precio de hace 9 días (vencido, excluido).
    seedProduct(row.id, central, 'Pechuga de pollo asada 1 kg', 1, 12490, 2)
    seedProduct(row.id, jumbo, 'Pechuga de pollo asada 1 kg', 1, 11900, 0)
    seedProduct(row.id, santaIsabel, 'Pechuga de pollo asada 1 kg', 1, 13200, 9)
    return row
  })()

  // Harina: stock holgado; formatos distintos (saco de 25 kg) y un producto sin configurar.
  ;(() => {
    const row = createItem({ name: 'Harina', base_unit: 'kg', initial: 60, manual_safe_stock: null }, daysAgo(28, 9), admin)
    seedExits(row.id, 27, [2, 3, 2, 2, 3, 1, 2])
    addMovement(row.id, { kind: 'ENTRY', delta: '25', input_quantity: '25', input_unit: 'kg', occurred_at: daysAgo(9, 11), note: 'Compra directa' }, warehouse)
    seedProduct(row.id, central, 'Harina Selecta saco 25 kg', 25, 19990, 2)
    seedProduct(row.id, jumbo, 'Harina Selecta 1 kg', 1, 1190, 0)
    seedProduct(row.id, santaIsabel, 'Harina Selecta 1 kg', 1, null, 0, false)
  })()

  // Leche: con un movimiento anulado.
  ;(() => {
    const row = createItem({ name: 'Leche entera', base_unit: 'L', initial: 120, manual_safe_stock: null }, daysAgo(21, 9), admin)
    seedExits(row.id, 20, [3, 2, 4, 3, 2, 3, 4])
    const wrong = addMovement(row.id, { kind: 'EXIT', delta: '-12', input_quantity: '12', input_unit: 'L', occurred_at: daysAgo(2, 15), note: 'Cantidad mal ingresada' }, warehouse)
    addMovement(row.id, { kind: 'REVERSAL', delta: '12', occurred_at: daysAgo(2, 16), invalidates_movement_id: wrong.id }, warehouse)
    seedProduct(row.id, jumbo, 'Leche entera Colun 1 L', 1, 1150, 0)
    seedProduct(row.id, santaIsabel, 'Leche entera Colun 1 L', 1, 1190, 9)
  })()

  // Huevos: bajo el stock seguro, con una orden aprobada en tránsito (alerta atendida).
  const huevos = (() => {
    const row = createItem({ name: 'Huevos', base_unit: 'unidad', initial: 300, manual_safe_stock: null }, daysAgo(25, 9), admin)
    seedExits(row.id, 24, [12, 18, 12, 6, 12, 12, 12])
    seedProduct(row.id, central, 'Huevos blancos bandeja 30 u', 30, 7490, 2)
    seedProduct(row.id, jumbo, 'Huevos blancos 12 u', 12, 3590, 0)
    return row
  })()

  // Aceite: recién creado, sin historia suficiente.
  ;(() => {
    const row = createItem({ name: 'Aceite vegetal', base_unit: 'L', initial: 20, manual_safe_stock: null }, daysAgo(0), admin)
    seedProduct(row.id, central, 'Aceite vegetal caja 12 × 1 L', 12, 25990, 2)
    seedProduct(row.id, jumbo, 'Aceite vegetal 1 L', 1, 2390, 0)
  })()

  // --- Corridas de scraping: `message` es JSON con el resultado de cada producto (como el backend) ---

  function recordRun(sup: Supplier, startedAt: string, outcome: (product: SupplierProduct) => ScrapeRunProductResult) {
    const results = products.filter((p) => p.supplier_id === sup.id && p.is_active).map(outcome)
    const ok = results.filter((r) => r.status !== 'ERROR').length
    const run: ScrapeRun = {
      id: id(),
      supplier_id: sup.id,
      started_at: startedAt,
      finished_at: startedAt,
      status: results.length > 0 && ok === results.length ? 'OK' : ok > 0 ? 'PARTIAL' : 'ERROR',
      message: JSON.stringify({ products: results }),
    }
    runs.push(run)
    return run
  }

  const succeed = (at: string) => (p: SupplierProduct): ScrapeRunProductResult =>
    p.scrape_config
      ? { supplier_product_id: p.id, status: 'OK', observed_at: at }
      : { supplier_product_id: p.id, status: 'ERROR', error_code: 'SCRAPE_CONFIG_REQUIRED' }
  const failWith = (code: string) => (p: SupplierProduct): ScrapeRunProductResult => ({
    supplier_product_id: p.id,
    status: 'ERROR',
    error_code: p.scrape_config ? code : 'SCRAPE_CONFIG_REQUIRED',
  })

  recordRun(santaIsabel, daysAgo(9, 9), succeed(daysAgo(9, 9)))
  recordRun(central, daysAgo(2, 9), succeed(daysAgo(2, 9)))
  recordRun(jumbo, daysAgo(2, 9), succeed(daysAgo(2, 9)))
  for (const days of [7, 2]) recordRun(santaIsabel, daysAgo(days, 9), failWith('TIMEOUT'))
  recordRun(central, daysAgo(0), failWith('PRICE_MISSING'))
  recordRun(santaIsabel, daysAgo(0), failWith('TIMEOUT'))
  recordRun(jumbo, daysAgo(0), succeed(daysAgo(0)))

  // --- Estado calculado de un insumo (C1, C5, C12) ---

  function leadTime(itemId: number): number | null {
    const leads = suppliers
      .filter((s) => s.is_active && products.some((p) => p.item_id === itemId && p.supplier_id === s.id && p.is_active))
      .map((s) => s.lead_time_days)
    return leads.length ? Math.max(...leads) : null
  }

  function inTransit(itemId: number) {
    return sum(orders.filter((o) => o.item_id === itemId && o.status === 'APPROVED').map((o) => Number(o.purchased_qty)))
  }

  function itemView(itemId: number): ItemState {
    const item = getItemRow(itemId)
    const stock = stockOf(itemId)
    const today = dayKey(new Date())
    const elapsed = Math.round((Date.parse(today) - Date.parse(dayKey(item.observation_started_at))) / DAY)
    const completeDays = Math.max(0, Math.min(28, elapsed))
    const windowEnd = new Date(`${today}T00:00:00`)
    const windowStart = new Date(windowEnd.getTime() - completeDays * DAY)
    const invalidated = new Set(movements.map((m) => m.invalidates_movement_id))
    const exits = sum(
      movements
        .filter((m) => m.item_id === itemId && m.kind === 'EXIT' && !invalidated.has(m.id))
        .filter((m) => new Date(m.occurred_at) >= windowStart && new Date(m.occurred_at) < windowEnd)
        .map((m) => -Number(m.delta)),
    )

    const weekly = completeDays > 0 ? round6((exits / completeDays) * 7) : null
    const daily = weekly === null ? null : round6(weekly / 7)
    const safe = item.manual_safe_stock ?? weekly
    const lead = leadTime(itemId)
    const transit = inTransit(itemId)
    // Como el backend (RN-07): el stock proyectado a la llegada puede ser negativo.
    const projected = round6(stock - (daily ?? 0) * (lead ?? 0))
    const isLow = safe === null ? null : projected <= safe
    // Con algo en tránsito el estado es IN_TRANSIT y la cantidad sugerida, 0 (la necesidad teórica sigue).
    const status: Assessment['alert_status'] =
      transit > 0 ? 'IN_TRANSIT' : isLow === null ? 'INSUFFICIENT_HISTORY' : isLow ? 'LOW_STOCK' : 'OK'
    const required = weekly === null ? null : Math.max(0, 2 * weekly - projected - transit)
    const suggested = required === null ? null : transit > 0 ? 0 : required
    const remaining = daily ? stock / daily : null
    const depletion: Assessment['depletion_status'] =
      weekly === null ? 'INSUFFICIENT_HISTORY' : !daily ? 'ZERO_CONSUMPTION' : remaining! > 365 ? 'OUT_OF_RANGE' : 'PROJECTED'
    const orderInDays = daily && safe !== null ? (stock - safe) / daily - (lead ?? 0) : null

    return {
      id: item.id,
      name: item.name,
      base_unit: item.base_unit,
      timezone: 'America/Santiago',
      current_stock: dec(stock),
      manual_safe_stock: item.manual_safe_stock === null ? null : dec(item.manual_safe_stock),
      observation_started_at: item.observation_started_at,
      created_at: item.created_at,
      updated_at: item.updated_at,
      consumption: {
        status: completeDays === 0 ? 'INSUFFICIENT_HISTORY' : completeDays < 7 ? 'PRELIMINARY' : 'ESTABLISHED',
        complete_days: completeDays,
        observed_quantity: dec(exits),
        weekly_average: weekly === null ? null : dec(weekly),
        window_start: completeDays ? iso(windowStart) : null,
        window_end: completeDays ? iso(windowEnd) : null,
      },
      assessment: {
        safe_stock: safe === null ? null : dec(safe),
        alert_source: safe === null ? null : item.manual_safe_stock !== null ? 'MANUAL_THRESHOLD' : 'AUTOMATIC',
        alert_status: status,
        is_low_stock: isLow,
        target_stock: weekly === null ? null : dec(2 * weekly),
        suggested_quantity: suggested === null ? null : dec(suggested),
        required_quantity: required === null ? null : dec(required),
        daily_average: daily === null ? null : dec(daily),
        remaining_days: remaining === null ? null : dec(remaining),
        depletion_at: depletion === 'PROJECTED' ? iso(Date.now() + remaining! * DAY) : null,
        depletion_status: depletion,
        lead_time_days: lead,
        projected_stock_at_arrival: safe === null && weekly === null ? null : dec(projected),
        in_transit_quantity: dec(transit),
        order_by_at: orderInDays === null ? null : iso(Date.now() + orderInDays * DAY),
      },
    }
  }

  /** Tasa P3: faltantes del período / (stock al inicio + entradas y ajustes positivos). */
  function shortageRate(itemId: number, start: string, end: string) {
    // Como el backend: un período que empieza antes del registro del insumo no es calculable.
    if (Date.parse(start) < Date.parse(getItemRow(itemId).observation_started_at)) {
      return { status: 'NOT_CALCULABLE' as const, available: null, shortage: '0', rate_percent: null }
    }
    const from = Date.parse(start)
    const to = Date.parse(end)
    const ofItem = movements.filter((m) => m.item_id === itemId)
    const before = sum(ofItem.filter((m) => Date.parse(m.occurred_at) < from).map((m) => Number(m.delta)))
    const added = sum(
      ofItem
        .filter((m) => Date.parse(m.occurred_at) >= from && Date.parse(m.occurred_at) < to)
        .filter((m) => Number(m.delta) > 0 && m.kind !== 'REVERSAL')
        .map((m) => Number(m.delta)),
    )
    const shortage = sum(
      counts
        .filter((c) => c.item_id === itemId && Date.parse(c.occurred_at) >= from && Date.parse(c.occurred_at) < to)
        .map((c) => Number(c.shortage)),
    )
    const available = before + added
    return {
      status: available > 0 ? ('CALCULABLE' as const) : ('NOT_CALCULABLE' as const),
      available: available > 0 ? dec(available) : null,
      shortage: dec(shortage),
      rate_percent: available > 0 ? dec((shortage / available) * 100) : null,
    }
  }

  // --- Precios: GET /prices/{item_id} (misma forma que el backend; comparación C5, C6, C14) ---

  function priceState(quote: Quote | undefined, product: SupplierProduct): PriceState {
    const sup = getSupplier(product.supplier_id)
    if (!sup.is_active || !product.is_active) return 'INACTIVE'
    if (!quote) return 'MISSING'
    if (!quote.available) return 'OUT_OF_STOCK'
    if (Date.parse(quote.observed_at) > Date.now()) return 'FUTURE_OBSERVATION'
    return Date.now() <= Date.parse(quote.observed_at) + 7 * DAY ? 'CURRENT' : 'EXPIRED'
  }

  function prices(itemId: number) {
    const view = itemView(itemId)
    const required = view.assessment.suggested_quantity === null ? null : Number(view.assessment.suggested_quantity)
    const offers: PriceOffer[] = []
    const options: PriceOption[] = []
    for (const product of products.filter((p) => p.item_id === itemId).sort((a, b) => a.id - b.id)) {
      const sup = getSupplier(product.supplier_id)
      const quote = quotes
        .filter((q) => q.supplier_product_id === product.id)
        .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at) || b.id - a.id)[0]
      const state = priceState(quote, product)
      const pack = Number(product.pack_quantity)
      offers.push({
        supplier_id: sup.id,
        supplier: sup.name,
        supplier_product_id: product.id,
        quote_id: quote?.id ?? null,
        pack_quantity: product.pack_quantity,
        pack_price_clp: quote ? dec(quote.pack_price_clp) : null,
        unit_price_clp: quote ? dec(round6(quote.pack_price_clp / pack)) : null,
        available: quote ? quote.available : null,
        observed_at: quote?.observed_at ?? null,
        valid_until: quote ? iso(Date.parse(quote.observed_at) + 7 * DAY) : null,
        state,
      })
      if (state === 'CURRENT' && required !== null) {
        const packs = required === 0 ? 0 : Math.max(product.min_packs, Math.ceil(round6(required / pack)))
        options.push({
          supplier_id: sup.id,
          supplier_product_id: product.id,
          supplier: sup.name,
          quote_id: quote!.id,
          packs,
          purchased_quantity: dec(packs * pack),
          base_unit: view.base_unit,
          total_clp: dec(packs * quote!.pack_price_clp),
          shipping_cost_clp: '0',
          observed_at: quote!.observed_at,
        })
      }
    }
    options.sort((a, b) => Number(a.total_clp) - Number(b.total_clp) || a.supplier_id - b.supplier_id)
    let comparison: PriceComparison
    if (required === null) comparison = { status: 'INSUFFICIENT_HISTORY', options: [], recommended: null }
    else if (new Set(options.map((o) => o.supplier_id)).size < 2) {
      comparison = { status: 'INSUFFICIENT_CURRENT_PRICES', options, recommended: null }
    } else if (required === 0) comparison = { status: 'NO_PURCHASE_REQUIRED', options, recommended: null }
    else {
      const [best] = options
      const second = options.find((o) => o.supplier_id !== best.supplier_id)!
      const savings = Number(second.total_clp) - Number(best.total_clp)
      comparison = {
        status: 'COMPARABLE_WITH_CONTEXT_ASSUMPTIONS',
        options,
        recommended: best,
        next_best_total_clp: second.total_clp,
        savings_clp: dec(savings),
        potential_savings_percent: dec((100 * savings) / Number(second.total_clp)),
      }
    }
    return { item_id: itemId, required_quantity: required === null ? null : dec(required), offers, comparison }
  }

  /** Simula una corrida: Jumbo responde; Central Mayorista y Santa Isabel siguen fallando. */
  function refreshPrices(itemId: number) {
    getItemRow(itemId)
    const supplierIds = new Set(products.filter((p) => p.item_id === itemId && p.is_active).map((p) => p.supplier_id))
    const newRuns = suppliers
      .filter((s) => supplierIds.has(s.id) && s.is_active)
      .map((sup) => {
        const at = now()
        if (sup.id !== jumbo.id) return recordRun(sup, at, failWith(sup.id === central.id ? 'PRICE_MISSING' : 'TIMEOUT'))
        for (const product of products.filter((p) => p.supplier_id === sup.id && p.scrape_config)) {
          const last = quotes.filter((q) => q.supplier_product_id === product.id).at(-1)
          if (last) quotes.push({ ...last, id: id(), observed_at: at })
        }
        return recordRun(sup, at, succeed(at))
      })
    return { ...prices(itemId), runs: newRuns }
  }

  // --- Sugerencias (sugerida → aprobada/rechazada) y órdenes ---

  function addSuggestion(itemId: number, data: Partial<Suggestion> & Pick<Suggestion, 'supplier_product_id' | 'purchased_qty' | 'total_clp'>) {
    const row: Suggestion = {
      id: id(),
      item_id: itemId,
      status: 'PENDING',
      required_qty: data.purchased_qty!,
      in_transit_qty: '0',
      packs: Number(data.purchased_qty),
      next_best_total_clp: null,
      savings_clp: null,
      inputs_snapshot: {},
      created_at: now(),
      created_by: admin.id,
      decided_by: null,
      decided_at: null,
      rejection_reason: null,
      ...data,
    }
    suggestions.push(row)
    return row
  }

  /** Snapshot congelado como el del backend: inventario, precios y productos de ese momento. */
  function snapshot(itemId: number, at: string, pricesNow = prices(itemId)) {
    return {
      version: 1,
      reference_at: at,
      inventory: itemView(itemId),
      prices: pricesNow,
      products: products.filter((p) => p.item_id === itemId),
      taxes: 'VAT_INCLUDED',
      dispatch: 'EXCLUDED',
    }
  }

  /** POST /suggestions (solo Administrador(a)). */
  function createSuggestion(itemId: number, user: User = admin): Suggestion {
    if (user.role !== 'ADMIN') throw new MockError(403, 'FORBIDDEN', 'Administrator required')
    const view = itemView(itemId)
    if (Number(view.assessment.in_transit_quantity) > 0) throw new MockError(409, 'ORDER_IN_TRANSIT', 'Order in transit')
    if (view.assessment.suggested_quantity === null) throw new MockError(409, 'INSUFFICIENT_HISTORY', 'No calculable history')
    if (Number(view.assessment.suggested_quantity) === 0) throw new MockError(409, 'NO_PURCHASE_REQUIRED', 'No purchase required')
    const pricesNow = prices(itemId)
    const { comparison } = pricesNow
    const best = comparison.recommended
    if (!best) throw new MockError(409, comparison.status, 'Two current suppliers required')
    return addSuggestion(itemId, {
      required_qty: view.assessment.suggested_quantity,
      in_transit_qty: view.assessment.in_transit_quantity,
      supplier_product_id: best.supplier_product_id,
      packs: best.packs,
      purchased_qty: best.purchased_quantity,
      total_clp: best.total_clp,
      next_best_total_clp: comparison.next_best_total_clp ?? null,
      savings_clp: comparison.savings_clp ?? null,
      inputs_snapshot: snapshot(itemId, now(), pricesNow),
      created_by: user.id,
    })
  }

  function approve(row: Suggestion, user: User, decidedAt = now()) {
    const product = products.find((p) => p.id === row.supplier_product_id)!
    const lead = getSupplier(product.supplier_id).lead_time_days
    const order: Order = {
      id: id(),
      suggestion_id: row.id,
      code: `OC-${String(Math.max(9, ...orders.map((o) => Number(o.code.slice(3)))) + 1).padStart(4, '0')}`,
      status: 'APPROVED',
      item_id: row.item_id,
      supplier_product_id: row.supplier_product_id,
      packs: row.packs,
      purchased_qty: row.purchased_qty,
      total_clp: row.total_clp,
      decided_by: user.id,
      decided_at: decidedAt,
      expected_at: iso(Date.parse(decidedAt) + lead * DAY),
      received_at: null,
      receipt_movement_id: null,
      received_quantity: null,
    }
    orders.push(order)
    Object.assign(row, { status: 'APPROVED', decided_by: user.id, decided_at: decidedAt })
    return order
  }

  /** POST /suggestions/{id}/decision (solo Administrador(a)). Rechazar exige motivo; aprobar no lleva. */
  function decide(suggestionId: number, decision: 'APPROVE' | 'REJECT', reason: string | null | undefined, user: User) {
    if (user.role !== 'ADMIN') throw new MockError(403, 'FORBIDDEN', 'Administrator required')
    const row = suggestions.find((s) => s.id === suggestionId)
    if (!row) throw new MockError(404, 'SUGGESTION_NOT_FOUND', 'Suggestion does not exist')
    if (decision === 'REJECT' && !reason?.trim()) throw new MockError(422, 'REJECTION_REASON_REQUIRED', 'Reason required')
    if (decision === 'APPROVE' && reason) throw new MockError(422, 'INVALID_DECISION', 'Approval carries no reason')
    if (row.status !== 'PENDING') throw new MockError(409, 'DECISION_CONFLICT', 'Suggestion already decided')
    if (decision === 'APPROVE') {
      if (Number(itemView(row.item_id).assessment.in_transit_quantity) > 0) throw new MockError(409, 'ORDER_IN_TRANSIT', 'Order in transit')
      // Como el backend: si el stock cambió desde que se generó, hay que rechazarla y generar otra.
      const frozen = snapshotOf(row).inventory?.current_stock
      if (frozen !== undefined && Number(frozen) !== stockOf(row.item_id)) {
        throw new MockError(409, 'STALE_SUGGESTION', 'Inventory changed; reject and regenerate')
      }
      approve(row, user)
    } else Object.assign(row, { status: 'REJECTED', rejection_reason: reason, decided_by: user.id, decided_at: now() })
    return row
  }

  /** POST /orders/{id}/receipt: formatos fijos reciben lo aprobado; peso variable exige el peso medido. */
  function receive(orderId: number, body: { received_at?: string | null; received_quantity?: string | null }, user: User | null) {
    const order = orders.find((o) => o.id === orderId)
    if (!order) throw new MockError(404, 'ORDER_NOT_FOUND', 'Order does not exist')
    if (order.status === 'RECEIVED') throw new MockError(409, 'RECEIPT_CONFLICT', 'Order already received')
    const product = products.find((p) => p.id === order.supplier_product_id)
    const variable = Boolean(product?.scrape_config?.pack.is_variable_weight)
    if (variable && !body.received_quantity) throw new MockError(422, 'ACTUAL_WEIGHT_REQUIRED', 'Measured weight required')
    if (!variable && body.received_quantity && Number(body.received_quantity) !== Number(order.purchased_qty)) {
      throw new MockError(422, 'FIXED_FORMAT_MISMATCH', 'Fixed formats receive the full approved quantity')
    }
    const at = body.received_at ?? now()
    if (Date.parse(at) < Date.parse(order.decided_at) || Date.parse(at) > Date.now()) {
      throw new MockError(422, 'INVALID_RECEIPT_DATE', 'Receipt must fall between approval and now')
    }
    const quantity = Number(variable ? body.received_quantity : order.purchased_qty)
    const movement = addMovement(
      order.item_id,
      { kind: 'ENTRY', delta: dec(quantity), input_quantity: dec(quantity), input_unit: getItemRow(order.item_id).base_unit, occurred_at: at, note: `Recepción ${order.code}` },
      user,
    )
    Object.assign(order, { status: 'RECEIVED', received_at: at, receipt_movement_id: movement.id, received_quantity: dec(quantity) })
    return order
  }

  /** Snapshot mínimo para órdenes históricas: quiebre proyectado y la comparación de ese momento. */
  function historicSnapshot(at: string, depletionDaysLater: number, options: [Supplier, string, string, number][]) {
    return {
      version: 1,
      reference_at: at,
      inventory: { assessment: { depletion_at: iso(Date.parse(at) + depletionDaysLater * DAY) } },
      prices: {
        comparison: {
          status: 'COMPARABLE_WITH_CONTEXT_ASSUMPTIONS',
          options: options.map(([sup, productId, total, packs]) => ({
            supplier_id: sup.id,
            supplier_product_id: Number(productId),
            supplier: sup.name,
            packs,
            total_clp: total,
          })),
        },
      },
    }
  }

  // Historial del pollo como en el mockup: una sugerencia rechazada y OC-0010 y OC-0011 recibidas.
  {
    const [polloCentral, polloJumbo] = products.filter((p) => p.item_id === pollo.id)
    addSuggestion(pollo.id, {
      supplier_product_id: polloJumbo.id,
      purchased_qty: '15',
      total_clp: '178500',
      next_best_total_clp: '183000',
      created_at: daysAgo(63, 10),
      status: 'REJECTED',
      decided_by: admin.id,
      decided_at: daysAgo(63, 11),
      rejection_reason: 'Hay stock suficiente por baja de ventas en vacaciones de invierno',
    })
    const oc10 = addSuggestion(pollo.id, {
      supplier_product_id: polloJumbo.id,
      purchased_qty: '20',
      total_clp: '238000',
      next_best_total_clp: '243800',
      savings_clp: '5800',
      inputs_snapshot: historicSnapshot(daysAgo(42, 9), 6, [
        [jumbo, String(polloJumbo.id), '238000', 20],
        [central, String(polloCentral.id), '243800', 20],
      ]),
      created_at: daysAgo(42, 9),
    })
    Object.assign(approve(oc10, admin, daysAgo(42, 10)), { status: 'RECEIVED', received_at: daysAgo(38, 11), received_quantity: '20' })
    const oc11 = addSuggestion(pollo.id, {
      supplier_product_id: polloCentral.id,
      purchased_qty: '18',
      total_clp: '224820',
      next_best_total_clp: '228420',
      savings_clp: '3600',
      inputs_snapshot: historicSnapshot(daysAgo(21, 9), 5, [
        [central, String(polloCentral.id), '224820', 18],
        [jumbo, String(polloJumbo.id), '228420', 18],
      ]),
      created_at: daysAgo(21, 9),
    })
    receive(approve(oc11, admin, daysAgo(21, 10)).id, { received_at: daysAgo(18, 11) }, warehouse)
    pendingPolloSeed()
  }

  // Huevos: orden aprobada ayer, en tránsito.
  {
    const bandeja = products.find((p) => p.item_id === huevos.id && p.supplier_id === central.id)!
    const docena = products.find((p) => p.item_id === huevos.id && p.supplier_id === jumbo.id)!
    approve(
      addSuggestion(huevos.id, {
        supplier_product_id: bandeja.id,
        packs: 7,
        purchased_qty: '210',
        total_clp: '52430',
        next_best_total_clp: '64620',
        savings_clp: '12190',
        inputs_snapshot: historicSnapshot(daysAgo(1, 9), 2, [
          [central, String(bandeja.id), '52430', 7],
          [jumbo, String(docena.id), '64620', 18],
        ]),
        created_at: daysAgo(1, 9),
      }),
      admin,
      daysAgo(1, 10),
    )
  }

  // Como en el mockup: la orden sugerida del pollo queda pendiente de aprobación.
  createSuggestion(pollo.id)

  // --- Métricas: GET /metrics (misma forma que backend/app/services/metrics.py) ---

  function metrics(start: string, end: string): Metrics {
    if (!(Date.parse(end) > Date.parse(start))) throw new MockError(422, 'INVALID_PERIOD', 'Use [start, end)')
    const inRange = (date: string) => Date.parse(date) >= Date.parse(start) && Date.parse(date) < Date.parse(end)
    const approved = orders
      .filter((o) => inRange(o.decided_at))
      .map((order) => ({ order, s: suggestions.find((x) => x.id === order.suggestion_id)! }))
    const evaluated = approved.filter(({ s }) => snapshotOf(s).inventory?.assessment?.depletion_at)
    const legacy = approved.filter(({ s }) => !snapshotOf(s).inventory?.assessment?.depletion_at)
    const before = evaluated.filter(({ order, s }) => Date.parse(order.decided_at) < Date.parse(snapshotOf(s).inventory!.assessment!.depletion_at!))
    const withSavings = approved.filter(({ s }) => s.savings_clp !== null && s.next_best_total_clp !== null)
    const savings = sum(withSavings.map(({ s }) => Number(s.savings_clp)))
    const alternative = sum(withSavings.map(({ s }) => Number(s.next_best_total_clp)))
    const complete = withSavings.length > 0 && withSavings.length === approved.length
    const perItem = items.map((item) => ({
      item_id: item.id,
      base_unit: item.base_unit,
      shortage: shortageRate(item.id, start, end),
      stockout_count: 0,
      stockout_movement_ids: [],
    }))
    return {
      start,
      end,
      approved_orders: approved.length,
      order_ids: approved.map(({ order }) => order.id),
      approved_total_clp: dec(sum(approved.map(({ s }) => Number(s.total_clp)))),
      estimated_savings_clp: complete ? dec(savings) : null,
      estimated_savings_percent: complete && alternative > 0 ? dec((savings * 100) / alternative) : null,
      savings_order_ids: withSavings.map(({ order }) => order.id),
      alerts_attended_before_depletion: evaluated.length && !legacy.length ? before.length : null,
      attended_order_ids: before.map(({ order }) => order.id),
      evaluated_alert_order_ids: evaluated.map(({ order }) => order.id),
      not_evaluable_order_ids: legacy.map(({ order }) => order.id),
      items: perItem,
      stockouts: 0,
      definitions: {
        attended: 'Approved suggestions with frozen depletion_at later than approval.',
        stockouts: 'Positive-to-zero transitions in the effective inventory ledger.',
        shortage: 'RN-16 by item/base unit.',
        savings: 'RN-11 frozen next-best feasible pack cost at suggestion time.',
      },
      impact_comparison: {
        status: 'NOT_VERIFIABLE',
        stockout_reduction_percent: null,
        shortage_reduction_percent: null,
        reason: 'No comparable E3 baseline or business experiment provided',
      },
    }
  }

  return {
    users,
    suppliers,
    items,
    movements,
    counts,
    products,
    runs,
    suggestions,
    orders,
    stockOf,
    movementsOf,
    addMovement,
    addCount,
    createItem,
    getItemRow,
    getSupplier,
    createProduct,
    itemView,
    shortageRate,
    prices,
    refreshPrices,
    createSuggestion,
    decide,
    receive,
    metrics,
    nextId: id,
  }
}

export type MockDb = ReturnType<typeof createDb>
