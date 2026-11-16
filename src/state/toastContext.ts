import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastInput {
  tone: ToastTone
  title: string
  message?: string
  /** Milisegundos antes de cerrarse sola. `null` = queda hasta que la persona la cierre. */
  duration?: number | null
}

export interface Toast extends ToastInput {
  id: number
}

export interface ToastContextValue {
  /** Muestra una notificación y devuelve su id. */
  notify: (toast: ToastInput) => number
  dismiss: (id: number) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

/** Notificaciones flotantes (éxito, error o información) visibles en cualquier pantalla. */
export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast debe usarse dentro de ToastProvider')
  return value
}
