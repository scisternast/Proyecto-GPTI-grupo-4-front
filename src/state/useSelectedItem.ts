import { createContext, useContext } from 'react'
import { useItems } from '../api/queries'

export const SelectedItemContext = createContext<{ id: number | null; select: (id: number) => void } | null>(null)

/**
 * Insumo seleccionado. Si el guardado ya no existe (o no hay ninguno), usa el primero de la lista;
 * sin GET /items en el backend se queda con el guardado o el elegido por ID. Mientras la lista carga es null.
 */
export function useSelectedItem() {
  const context = useContext(SelectedItemContext)
  if (!context) throw new Error('useSelectedItem debe usarse dentro de SelectedItemProvider')
  const items = useItems()
  const list = items.data
  // Mientras carga la lista no se usa el guardado: puede ser de otra base y pedir rutas que dan 404.
  const fallback = items.error ? context.id : null
  const id = list ? (list.some((item) => item.id === context.id) ? context.id : (list[0]?.id ?? null)) : fallback
  return { id, select: context.select }
}
