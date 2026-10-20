import { type ReactNode, useState } from 'react'
import { SelectedItemContext } from './useSelectedItem'

// El insumo elegido se comparte entre Panel, Movimientos, Conteo y merma y Precios,
// y se recuerda en este navegador.

const STORAGE_KEY = 'stocksmart.selectedItem'

function readStored(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function SelectedItemProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<number | null>(readStored)
  const select = (next: number) => {
    setId(next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // Sin almacenamiento: se recuerda solo durante la sesión.
    }
  }
  return <SelectedItemContext.Provider value={{ id, select }}>{children}</SelectedItemContext.Provider>
}
