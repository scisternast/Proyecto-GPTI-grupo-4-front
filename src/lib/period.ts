import type { ItemState } from '../api/types'
import { dateInputToIso, dayKey, daysAgoKey } from './format'

// Período de Métricas. El backend no calcula la merma de un período que empieza antes de que el insumo
// tenga historia (`observation_started_at`): responde 0 y «No calculable».

/**
 * Últimos 90 días, pero sin empezar antes del primer registro de inventario: el backend no calcula la
 * merma de un período que empieza antes de que el insumo tenga historia («No calculable»).
 */
export function defaultStart(items: ItemState[]): string {
  const ninetyDaysAgo = daysAgoKey(90)
  const first = firstRecordAt(items)
  return first && dayKey(first) > ninetyDaysAgo ? dayKey(first) : ninetyDaysAgo
}

/** Inicio del registro de inventario más antiguo (`observation_started_at`). */
export function firstRecordAt(items: ItemState[]): string | undefined {
  return items
    .map((i) => i.observation_started_at)
    .filter((d): d is string => d !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0]
}

/**
 * Inicio del período en ISO. Si el día elegido es el del primer registro, parte a la hora exacta del
 * registro (p. ej. 08:00) y no a las 00:00, que para el backend seguiría siendo «antes de la historia».
 */
export function periodStart(day: string, items: ItemState[]): string {
  const midnight = dateInputToIso(day)
  const first = firstRecordAt(items)
  return first && dayKey(first) === day && !(Date.parse(first) < Date.parse(midnight)) ? first : midnight
}

/**
 * Inicio de la tasa de merma de un insumo: si `start` es anterior al inicio de su registro
 * (`observation_started_at`), parte en el registro, porque el backend no calcula períodos que empiezan
 * antes de que el insumo tenga historia.
 *
 * Se devuelve el texto original del backend, no `new Date(...).toISOString()`: el backend guarda
 * microsegundos (…:22.123456Z) y JavaScript solo milisegundos. Redondear deja el inicio unos µs ANTES del
 * registro y el backend responde «No calculable». Por eso la comparación usa `<=`: a la precisión de
 * JavaScript, «igual» puede ser un poco antes.
 */
export function clampToRecord(start: string, recordStart: string | null | undefined): { start: string; clamped: boolean } {
  if (recordStart && Date.parse(start) <= Date.parse(recordStart)) return { start: recordStart, clamped: Date.parse(start) < Date.parse(recordStart) }
  return { start, clamped: false }
}

