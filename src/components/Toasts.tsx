import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Toast, ToastContext, type ToastInput } from '../state/toastContext'

// Duración por defecto: el éxito se cierra solo; un error queda hasta que la persona lo cierre.
const DEFAULT_DURATION: Record<Toast['tone'], number | null> = { success: 6000, info: 8000, error: null }
const MAX_VISIBLE = 4

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  const notify = useCallback((input: ToastInput) => {
    const id = nextId.current++
    setToasts((list) => [...list, { ...input, id }].slice(-MAX_VISIBLE))
    return id
  }, [])
  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-label="Notificaciones">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const ICON: Record<Toast['tone'], string> = { success: '✓', error: '!', info: 'i' }

// `dismiss` es estable: el temporizador no se reinicia cuando aparece otra notificación.
function ToastCard({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const { id } = toast
  const duration = toast.duration === undefined ? DEFAULT_DURATION[toast.tone] : toast.duration
  const [paused, setPaused] = useState(false)

  // Se pausa mientras el cursor o el foco están sobre la notificación, para poder leerla.
  useEffect(() => {
    if (duration === null || paused) return
    const timer = window.setTimeout(() => dismiss(id), duration)
    return () => window.clearTimeout(timer)
  }, [duration, paused, dismiss, id])

  return (
    <div
      className={`toast toast-${toast.tone}`}
      // Un error se anuncia de inmediato a lectores de pantalla; el resto, sin interrumpir.
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast-icon" aria-hidden>
        {ICON[toast.tone]}
      </span>
      <div className="toast-body">
        <strong>{toast.title}</strong>
        {toast.message && <p>{toast.message}</p>}
      </div>
      <button type="button" className="toast-close" aria-label="Cerrar notificación" onClick={() => dismiss(id)}>
        ×
      </button>
    </div>
  )
}
