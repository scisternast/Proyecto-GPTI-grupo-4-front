// Alias legibles de los tipos generados desde OpenAPI (src/api/schema.d.ts).
// No edites schema.d.ts a mano: regenéralo con `npm run api:types` o `npm run api:pull`.
import type { components } from './schema'

type Schemas = components['schemas']

// Inventario
export type ItemState = Schemas['ItemStateResponse']
export type ItemCreate = Schemas['ItemCreate']
export type ItemUpdate = Schemas['ItemUpdate']
export type Assessment = Schemas['AssessmentResponse']
export type Consumption = Schemas['ConsumptionResponse']
export type Movement = Schemas['MovementResponse']
export type MovementCreate = Schemas['MovementCreate']
export type Count = Schemas['CountResponse']
export type CountCreate = Schemas['CountCreate']
export type Alert = Schemas['AlertResponse']
export type ShortageRate = Schemas['ShortageRateResponse']
export type ErrorBody = Schemas['ErrorResponse']

export type BaseUnit = ItemState['base_unit']
export type CountCause = NonNullable<CountCreate['cause']>

// Proveedores, productos y precios
export type Supplier = Schemas['SupplierResponse']
export type SupplierCreate = Schemas['SupplierCreate']
export type SupplierUpdate = Schemas['SupplierUpdate']
export type Adapter = NonNullable<SupplierCreate['adapter']>
export type SupplierProduct = Schemas['SupplierProductResponse']
export type SupplierProductCreate = Schemas['SupplierProductCreate']
export type SupplierProductUpdate = Schemas['SupplierProductUpdate']
export type ScrapeConfig = Schemas['ScrapeConfig-Output']
export type ScrapeConfigInput = Schemas['ScrapeConfig-Input']
export type ScrapeRun = Schemas['ScrapeRunResponse']
export type PriceOffer = Schemas['PriceOfferResponse']
export type Prices = Schemas['PricesResponse']
export type PriceRefresh = Schemas['PriceRefreshResponse']

/** Estado del último precio de un producto (`PriceOfferResponse.state`). */
export type PriceState = 'MISSING' | 'CURRENT' | 'EXPIRED' | 'OUT_OF_STOCK' | 'INACTIVE' | 'FUTURE_OBSERVATION'

/**
 * `PricesResponse.comparison` llega como `dict` en OpenAPI. Su forma sale de `compare_offers`
 * (backend/scraper/pipeline.py). Las opciones son solo precios vigentes, ordenadas por total.
 */
export interface PriceOption {
  supplier_id: number
  supplier_product_id: number
  supplier: string
  quote_id: number
  packs: number
  purchased_quantity: string
  base_unit: BaseUnit
  total_clp: string
  shipping_cost_clp: string
  observed_at: string
}

export interface PriceComparison {
  status:
    | 'COMPARABLE_WITH_CONTEXT_ASSUMPTIONS'
    | 'INSUFFICIENT_CURRENT_PRICES'
    | 'NO_PURCHASE_REQUIRED'
    | 'INSUFFICIENT_HISTORY'
  options: PriceOption[]
  recommended: PriceOption | null
  next_best_total_clp?: string
  savings_clp?: string
  potential_savings_percent?: string
}

/** `ScrapeRun.message` es JSON con el resultado de cada producto (o texto en corridas antiguas). */
export interface ScrapeRunProductResult {
  supplier_product_id: number
  status: 'OK' | 'OUT_OF_STOCK' | 'ERROR'
  error_code?: string
  observed_at?: string
}

// Órdenes y sugerencias
export type Order = Schemas['OrderResponse']
export type OrderReceipt = Schemas['OrderReceiptCreate']
export type Suggestion = Schemas['SuggestionResponse']
export type Decision = Schemas['DecisionCreate']['decision']

/**
 * `Suggestion.inputs_snapshot` llega como `dict`. El backend congela ahí el estado usado para
 * calcularla (backend/app/services/suggestions.py): inventario, precios y productos de ese momento.
 */
export interface SuggestionSnapshot {
  version: number
  reference_at: string
  inventory: Pick<ItemState, 'current_stock' | 'base_unit'> & {
    consumption: Pick<Consumption, 'weekly_average'>
    assessment: Pick<Assessment, 'safe_stock' | 'projected_stock_at_arrival' | 'lead_time_days' | 'depletion_at'>
  }
  prices: { comparison: PriceComparison }
  taxes: 'VAT_INCLUDED'
  dispatch: 'EXCLUDED'
}

export function snapshotOf(suggestion: Suggestion): Partial<SuggestionSnapshot> {
  return suggestion.inputs_snapshot as Partial<SuggestionSnapshot>
}

// Usuarios y sesión
export type User = Schemas['UserResponse']
export type Role = User['role']
export type Token = Schemas['TokenResponse']

// Métricas

/**
 * `GET /metrics` no declara su respuesta en OpenAPI. Forma según backend/app/services/metrics.py.
 * Período [start, end), para todo el negocio. `null` = no calculable con los datos disponibles.
 */
export interface Metrics {
  start: string
  end: string
  approved_orders: number
  order_ids: number[]
  approved_total_clp: string | null
  estimated_savings_clp: string | null
  estimated_savings_percent: string | null
  savings_order_ids: number[]
  /** Aprobaciones antes de la fecha de quiebre congelada en la sugerencia; null si hay órdenes no evaluables. */
  alerts_attended_before_depletion: number | null
  attended_order_ids: number[]
  evaluated_alert_order_ids: number[]
  not_evaluable_order_ids: number[]
  items: {
    item_id: number
    base_unit: BaseUnit
    shortage: ShortageRate
    stockout_count: number
    stockout_movement_ids: number[]
  }[]
  stockouts: number
  definitions: Record<'attended' | 'stockouts' | 'shortage' | 'savings', string>
  impact_comparison: {
    status: string
    stockout_reduction_percent: string | null
    shortage_reduction_percent: string | null
    reason: string
  }
}
