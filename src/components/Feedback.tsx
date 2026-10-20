import type { ReactNode } from 'react'
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

type Tone = 'muted' | 'ok' | 'warn' | 'danger' | 'info' | 'primary'

export function Badge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

const ALERT_TONE: Record<string, Tone> = {
  LOW_STOCK: 'warn',
  OK: 'ok',
  INSUFFICIENT_HISTORY: 'muted',
  IN_TRANSIT: 'info',
}

export function AlertBadge({ status, label }: { status: string; label: string }) {
  return <Badge tone={ALERT_TONE[status] ?? 'muted'}>{label}</Badge>
}

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: ReactNode; title: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  )
}
