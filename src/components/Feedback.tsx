import { errorMessage } from '../api/errors'

export function Loading() {
  return <p className="muted">Cargando…</p>
}

export function ErrorMessage({ error }: { error: unknown }) {
  return (
    <p className="error" role="alert">
      {errorMessage(error)}
    </p>
  )
}

const ALERT_CLASS: Record<string, string> = {
  LOW_STOCK: 'badge-danger',
  OK: 'badge-ok',
  INSUFFICIENT_HISTORY: 'badge-muted',
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`badge ${ALERT_CLASS[status] ?? 'badge-muted'}`}>{label}</span>
}
