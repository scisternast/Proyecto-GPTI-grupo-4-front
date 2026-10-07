import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, requestPending, unwrap } from './client'
import type { CountCreate, ItemCreate, ItemState, MovementCreate } from './types'

export const keys = {
  items: ['items'] as const,
  item: (id: number) => ['items', id] as const,
  movements: (id: number) => ['items', id, 'movements'] as const,
  counts: (id: number) => ['items', id, 'counts'] as const,
  shortage: (id: number, start: string, end: string) => ['items', id, 'shortage', start, end] as const,
  alerts: ['alerts'] as const,
}

// --- Lecturas ---

/** Pendiente en el backend (Arquitectura.md §5.3): GET /items todavía no existe. */
export function useItems() {
  return useQuery({
    queryKey: keys.items,
    queryFn: () => requestPending<ItemState[]>('/items'),
    retry: false,
  })
}

export function useItem(id: number) {
  return useQuery({
    queryKey: keys.item(id),
    queryFn: () => unwrap(api.GET('/items/{item_id}', { params: { path: { item_id: id } } })),
  })
}

export function useMovements(id: number) {
  return useQuery({
    queryKey: keys.movements(id),
    queryFn: () => unwrap(api.GET('/items/{item_id}/movements', { params: { path: { item_id: id } } })),
  })
}

export function useCounts(id: number) {
  return useQuery({
    queryKey: keys.counts(id),
    queryFn: () => unwrap(api.GET('/items/{item_id}/counts', { params: { path: { item_id: id } } })),
  })
}

export function useAlerts() {
  return useQuery({
    queryKey: keys.alerts,
    queryFn: () => unwrap(api.GET('/alerts')),
    refetchInterval: 60_000,
  })
}

export function useShortageRate(id: number, start: string, end: string) {
  return useQuery({
    queryKey: keys.shortage(id, start, end),
    queryFn: () =>
      unwrap(
        api.GET('/items/{item_id}/shortage-rate', {
          params: { path: { item_id: id }, query: { start, end } },
        }),
      ),
    enabled: Boolean(start && end),
  })
}

// --- Escrituras ---
// Cualquier cambio de stock afecta saldo, consumo, alertas e historial: se invalida todo lo del insumo.

function useInvalidateItem() {
  const queryClient = useQueryClient()
  return (id: number) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.item(id) }),
      queryClient.invalidateQueries({ queryKey: keys.items, exact: true }),
      queryClient.invalidateQueries({ queryKey: keys.alerts }),
    ])
}

export function useCreateItem() {
  const invalidate = useInvalidateItem()
  return useMutation({
    mutationFn: (body: ItemCreate) => unwrap(api.POST('/items', { body })),
    onSuccess: (item) => invalidate(item.id),
  })
}

export function useUpdateSafeStock(id: number) {
  const invalidate = useInvalidateItem()
  return useMutation({
    mutationFn: (manual_safe_stock: string | null) =>
      unwrap(
        api.PUT('/items/{item_id}/safe-stock', {
          params: { path: { item_id: id } },
          body: { manual_safe_stock },
        }),
      ),
    onSuccess: () => invalidate(id),
  })
}

export function useCreateMovement() {
  const invalidate = useInvalidateItem()
  return useMutation({
    mutationFn: (body: MovementCreate) => unwrap(api.POST('/movements', { body })),
    onSuccess: (movement) => invalidate(movement.item_id),
  })
}

export function useReverseMovement(itemId: number) {
  const invalidate = useInvalidateItem()
  return useMutation({
    mutationFn: (movementId: number) =>
      unwrap(
        api.POST('/movements/{movement_id}/reverse', {
          params: { path: { movement_id: movementId } },
          body: {},
        }),
      ),
    onSuccess: () => invalidate(itemId),
  })
}

export function useCreateCount() {
  const invalidate = useInvalidateItem()
  return useMutation({
    mutationFn: (body: CountCreate) => unwrap(api.POST('/counts', { body })),
    onSuccess: (count) => invalidate(count.item_id),
  })
}
