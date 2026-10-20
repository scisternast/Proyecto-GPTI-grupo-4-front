import type { Count, Movement } from '../api/types'
import { dayKey } from './format'

export interface LedgerRow extends Movement {
  /** Saldo después del movimiento (`balance_after`). */
  balance: number
  /** Conteo que generó este ajuste, si corresponde. */
  count?: Count
  /** Ya fue anulado por una reversa o corrección. */
  invalidated: boolean
}

const E2_RECEIPT_PREFIX = 'E2_RECEIPT:'
const LEGACY_ORDER_RECEIPT_PREFIX = 'Order receipt '
const SYNTHETIC_NOTE_PREFIX = 'SYNTHETIC_E2_TEST_DATA_NOT_A_REAL_BUSINESS'

/** Formatea notas técnicas de recepción o del dataset para mostrar un detalle breve al usuario. */
export function formatMovementNote(note: string | null | undefined): string {
  if (!note) return '—'
  const cleaned = note.trim()
  if (!cleaned || cleaned.startsWith(SYNTHETIC_NOTE_PREFIX)) return '—'
  if (cleaned.startsWith(E2_RECEIPT_PREFIX)) {
    try {
      const payload = JSON.parse(cleaned.slice(E2_RECEIPT_PREFIX.length)) as Record<string, unknown>
      if (payload && typeof payload === 'object') {
        for (const key of ['order_code', 'receipt_id', 'order_id']) {
          const value = payload[key]
          if (value !== undefined && value !== null && String(value).trim()) {
            return `Recepción ${String(value).trim()}`
          }
        }
      }
    } catch {
      return '—'
    }
    return '—'
  }
  if (cleaned.startsWith(LEGACY_ORDER_RECEIPT_PREFIX)) {
    const code = cleaned.slice(LEGACY_ORDER_RECEIPT_PREFIX.length).trim()
    return code ? `Recepción ${code}` : '—'
  }
  return cleaned
}

/** Orden de ocurrencia del backend: (occurred_at, created_at, id). Compara instantes, no textos. */
export function byOccurrence(a: Movement, b: Movement): number {
  return (
    Date.parse(a.occurred_at) - Date.parse(b.occurred_at) ||
    Date.parse(a.created_at) - Date.parse(b.created_at) ||
    a.id - b.id
  )
}

/** Historial del más reciente al más antiguo, con su conteo asociado y si fue anulado. */
export function buildLedger(movements: Movement[], counts: Count[] = []): LedgerRow[] {
  const countByAdjustment = new Map(counts.map((count) => [count.adjustment_movement_id, count]))
  const invalidated = new Set(movements.map((m) => m.invalidates_movement_id).filter((id) => id !== null))
  return [...movements]
    .sort(byOccurrence)
    .reverse()
    .map((movement) => ({
      ...movement,
      balance: Number(movement.balance_after),
      count: countByAdjustment.get(movement.id),
      invalidated: invalidated.has(movement.id),
    }))
}

/** Saldo al cierre de cada día (hora de Chile) desde `fromDay` hasta hoy, para el gráfico. */
export function dailyClosingBalances(ledger: LedgerRow[], fromDay: string): { day: string; balance: number }[] {
  const chronological = [...ledger].reverse()
  const result: { day: string; balance: number }[] = []
  let index = 0
  let balance = 0
  const today = dayKey(new Date())
  for (let day = fromDay; day <= today; day = nextDay(day)) {
    while (index < chronological.length && dayKey(chronological[index].occurred_at) <= day) {
      balance = chronological[index].balance
      index++
    }
    // Antes del primer movimiento no hay historia que mostrar.
    if (index > 0) result.push({ day, balance })
  }
  return result
}

export function nextDay(day: string, offset = 1): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
