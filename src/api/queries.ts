import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'
import type {
  CountCreate,
  Decision,
  Metrics,
  ItemCreate,
  ItemUpdate,
  MovementCreate,
  OrderReceipt,
  PriceComparison,
  Prices,
  SupplierCreate,
  SupplierProductCreate,
  SupplierProductUpdate,
  SupplierUpdate,
} from './types'

export const keys = {
  items: ['items'] as const,
  item: (id: number) => ['items', id] as const,
  movements: (id: number) => ['items', id, 'movements'] as const,
  counts: (id: number) => ['items', id, 'counts'] as const,
  shortage: (id: number, start: string, end: string) => ['items', id, 'shortage', start, end] as const,
  alerts: ['alerts'] as const,
  suppliers: ['suppliers'] as const,
  products: (supplierId: number) => ['suppliers', supplierId, 'products'] as const,
  scrapeRuns: (id: number) => ['suppliers', id, 'scrape-runs'] as const,
  orders: ['orders'] as const,
  prices: (itemId: number) => ['prices', itemId] as const,
  suggestions: (itemId?: number) => ['suggestions', itemId ?? 'all'] as const,
  metrics: (start: string, end: string) => ['metrics', start, end] as const,
}

// Inventario

export function useItems() {
  return useQuery({ queryKey: keys.items, queryFn: () => unwrap(api.GET('/items')) })
}

export function useItem(id: number | null) {
  return useQuery({
    queryKey: keys.item(id ?? 0),
    queryFn: () => unwrap(api.GET('/items/{item_id}', { params: { path: { item_id: id! } } })),
    enabled: id !== null,
  })
}

export function useMovements(id: number | null) {
  return useQuery({
    queryKey: keys.movements(id ?? 0),
    queryFn: () => unwrap(api.GET('/items/{item_id}/movements', { params: { path: { item_id: id! } } })),
    enabled: id !== null,
  })
}

export function useCounts(id: number | null) {
  return useQuery({
    queryKey: keys.counts(id ?? 0),
    queryFn: () => unwrap(api.GET('/items/{item_id}/counts', { params: { path: { item_id: id! } } })),
    enabled: id !== null,
  })
}

/** Solo las alertas `LOW_STOCK` (las que requieren pedir); las `IN_TRANSIT` no se listan. */
export function useAlerts() {
  return useQuery({
    queryKey: keys.alerts,
    queryFn: () => unwrap(api.GET('/alerts')),
    refetchInterval: 60_000,
  })
}

export function shortageRateQuery(id: number, start: string, end: string) {
  return {
    queryKey: keys.shortage(id, start, end),
    queryFn: () =>
      unwrap(api.GET('/items/{item_id}/shortage-rate', { params: { path: { item_id: id }, query: { start, end } } })),
  }
}

export function useShortageRate(id: number | null, start: string, end: string) {
  return useQuery({ ...shortageRateQuery(id ?? 0, start, end), enabled: id !== null && Boolean(start && end) })
}

// Cualquier cambio de stock afecta saldo, consumo, alertas, precios requeridos, sugerencias y métricas.
function useInvalidateInventory() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      [keys.items, keys.alerts, keys.orders, ['prices'], ['suggestions'], ['metrics']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
}

export function useCreateItem() {
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: (body: ItemCreate) => unwrap(api.POST('/items', { body })),
    onSuccess: invalidate,
  })
}

/** Solo cambia lo enviado: `name` y/o `manual_safe_stock` (`null` vuelve al umbral automático). */
export function useUpdateItem() {
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ItemUpdate }) =>
      unwrap(api.PATCH('/items/{item_id}', { params: { path: { item_id: id } }, body })),
    onSuccess: invalidate,
  })
}

export function useCreateMovement() {
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: (body: MovementCreate) => unwrap(api.POST('/movements', { body })),
    onSuccess: invalidate,
  })
}

export function useReverseMovement() {
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: (movementId: number) =>
      unwrap(api.POST('/movements/{movement_id}/reverse', { params: { path: { movement_id: movementId } }, body: {} })),
    onSuccess: invalidate,
  })
}

export function useCreateCount() {
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: (body: CountCreate) => unwrap(api.POST('/counts', { body })),
    onSuccess: invalidate,
  })
}

// Proveedores, productos y precios

export function useSuppliers() {
  return useQuery({ queryKey: keys.suppliers, queryFn: () => unwrap(api.GET('/suppliers')) })
}

function productsQuery(supplierId: number) {
  return {
    queryKey: keys.products(supplierId),
    queryFn: () => unwrap(api.GET('/suppliers/{supplier_id}/products', { params: { path: { supplier_id: supplierId } } })),
  }
}

/** Productos de todos los proveedores: el vínculo insumo ↔ proveedor (`supplier_products`). */
export function useAllProducts() {
  const suppliers = useSuppliers()
  const results = useQueries({ queries: (suppliers.data ?? []).map((s) => productsQuery(s.id)) })
  return {
    suppliers,
    products: results.flatMap((r) => r.data ?? []),
    isPending: suppliers.isPending || results.some((r) => r.isPending),
    error: suppliers.error ?? results.find((r) => r.error)?.error ?? null,
  }
}

export function scrapeRunsQuery(supplierId: number) {
  return {
    queryKey: keys.scrapeRuns(supplierId),
    queryFn: () =>
      unwrap(api.GET('/suppliers/{supplier_id}/scrape-runs', { params: { path: { supplier_id: supplierId } } })),
  }
}

/** Corridas de scraping de todos los proveedores, por id de proveedor (más reciente primero). */
export function useAllScrapeRuns(supplierIds: number[]) {
  const results = useQueries({ queries: supplierIds.map(scrapeRunsQuery) })
  return new Map(supplierIds.map((id, i) => [id, results[i]?.data ?? []]))
}

function useInvalidateCatalog() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      [keys.suppliers, keys.items, ['prices']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
}

export function useSaveSupplier() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ id, create, update }: { id: number | null; create?: SupplierCreate; update?: SupplierUpdate }) =>
      id === null
        ? unwrap(api.POST('/suppliers', { body: create! }))
        : unwrap(api.PATCH('/suppliers/{supplier_id}', { params: { path: { supplier_id: id } }, body: update! })),
    onSuccess: invalidate,
  })
}

export function useCreateProduct() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ supplierId, body }: { supplierId: number; body: SupplierProductCreate }) =>
      unwrap(api.POST('/suppliers/{supplier_id}/products', { params: { path: { supplier_id: supplierId } }, body })),
    onSuccess: invalidate,
  })
}

export function useUpdateProduct() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ supplierId, productId, body }: { supplierId: number; productId: number; body: SupplierProductUpdate }) =>
      unwrap(
        api.PATCH('/suppliers/{supplier_id}/products/{product_id}', {
          params: { path: { supplier_id: supplierId, product_id: productId } },
          body,
        }),
      ),
    onSuccess: invalidate,
  })
}

/** `comparison` viene sin tipo en OpenAPI: se tipa según el backend (ver PriceComparison). */
export type PricesView = Omit<Prices, 'comparison'> & { comparison: PriceComparison }

function toPricesView(prices: Prices): PricesView {
  return { ...prices, comparison: prices.comparison as unknown as PriceComparison }
}

export function usePrices(itemId: number | null) {
  return useQuery({
    queryKey: keys.prices(itemId ?? 0),
    queryFn: async () =>
      toPricesView(await unwrap(api.GET('/prices/{item_id}', { params: { path: { item_id: itemId! } } }))),
    enabled: itemId !== null,
  })
}

/** Consulta las páginas públicas de los proveedores (respeta pausas de 2 s: puede tardar). */
export function useRefreshPrices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) =>
      unwrap(api.POST('/prices/{item_id}/refresh', { params: { path: { item_id: itemId } } })),
    onSuccess: (data) => {
      const { runs: _runs, ...prices } = data
      queryClient.setQueryData(keys.prices(data.item_id), toPricesView(prices))
      return queryClient.invalidateQueries({ queryKey: keys.suppliers })
    },
  })
}

// Órdenes

export function useOrders() {
  return useQuery({ queryKey: keys.orders, queryFn: () => unwrap(api.GET('/orders')) })
}

export function useReceiveOrder() {
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: number; body: OrderReceipt }) =>
      unwrap(api.POST('/orders/{order_id}/receipt', { params: { path: { order_id: orderId } }, body })),
    onSuccess: invalidate,
  })
}

// Sugerencias y métricas

/** Sugerencias de un insumo, o de todos si no se indica (para Métricas). */
export function useSuggestions(itemId?: number | null) {
  return useQuery({
    queryKey: keys.suggestions(itemId ?? undefined),
    queryFn: () => unwrap(api.GET('/suggestions', { params: { query: itemId ? { item_id: itemId } : {} } })),
    enabled: itemId !== null,
  })
}

/** Solo Administrador(a). El backend rechaza si hay orden en tránsito o no se puede comparar. */
export function useCreateSuggestion() {
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: (itemId: number) => unwrap(api.POST('/suggestions', { body: { item_id: itemId } })),
    onSuccess: invalidate,
  })
}

/** Solo Administrador(a). Rechazar exige motivo; aprobar no lleva motivo. */
export function useDecideSuggestion() {
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: ({ id, decision, reason }: { id: number; decision: Decision; reason?: string }) =>
      unwrap(
        api.POST('/suggestions/{suggestion_id}/decision', {
          params: { path: { suggestion_id: id } },
          body: decision === 'REJECT' ? { decision, reason } : { decision },
        }),
      ),
    onSuccess: invalidate,
  })
}

/** Indicadores del período [start, end) para todo el negocio (solo Administrador(a)). */
/** `start` null = el período aún no se conoce (no se consulta). */
export function useMetrics(start: string | null, end: string) {
  return useQuery({
    queryKey: keys.metrics(start ?? '', end),
    // La ruta no declara su respuesta en OpenAPI: se tipa según el backend (ver Metrics).
    queryFn: async () =>
      (await unwrap(api.GET('/metrics', { params: { query: { start: start!, end } } }))) as unknown as Metrics,
    enabled: start !== null,
  })
}
