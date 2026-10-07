import { useOutletContext } from 'react-router'
import type { ItemState } from '../api/types'

/** Insumo ya cargado por ItemLayout, para las pestañas hijas. */
export function useCurrentItem() {
  return useOutletContext<ItemState>()
}
