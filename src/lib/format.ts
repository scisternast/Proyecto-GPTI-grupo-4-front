import type { BaseUnit } from '../api/types'

export const TIME_ZONE = 'America/Santiago'

const quantityFormat = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 })
const clpFormat = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const dateTimeFormat = new Intl.DateTimeFormat('es-CL', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})
const shortDateFormat = new Intl.DateTimeFormat('es-CL', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit' })
const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })

/** Cómo se muestra cada unidad (el backend usa `unidad`; el mockup muestra `u`). */
export const UNIT_LABEL: Record<string, string> = { kg: 'kg', g: 'g', L: 'L', mL: 'mL', unidad: 'u' }

/** Los decimales llegan como texto ("25.000000") para no perder precisión; solo se convierten para mostrar. */
export function formatQuantity(value: string | number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined) return '—'
  const text = quantityFormat.format(Number(value))
  return unit ? `${text} ${UNIT_LABEL[unit] ?? unit}` : text
}

export function formatSigned(value: string | number, unit?: string | null): string {
  const text = formatQuantity(value, unit)
  return Number(value) > 0 ? `+${text}` : text
}

const percentFormat = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function formatPercent(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${percentFormat.format(Number(value))} %`
}

export function formatCLP(value: number | string | null | undefined): string {
  return value === null || value === undefined ? '—' : clpFormat.format(Number(value))
}

/** Las fechas pueden venir en UTC (…Z); se muestran siempre en hora de Chile. */
export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFormat.format(new Date(value)).replace(',', ' ·') : '—'
}

/** Fecha corta, como en el mockup: 28/09. */
export function formatShortDate(value: string | Date | null | undefined): string {
  return value ? shortDateFormat.format(new Date(value)) : '—'
}

/** Día calendario en Chile (AAAA-MM-DD), para comparar fechas sin la hora. */
export function dayKey(value: string | Date): string {
  return dayKeyFormat.format(new Date(value))
}

export function todayKey(): string {
  return dayKey(new Date())
}

/** Unidades que acepta el backend para cada unidad base. */
export const UNITS_BY_BASE: Record<BaseUnit, string[]> = {
  kg: ['kg', 'g'],
  L: ['L', 'mL'],
  unidad: ['unidad'],
}

const TO_BASE: Record<string, number> = { kg: 1, g: 0.001, L: 1, mL: 0.001, unidad: 1 }

/** Solo para vistas previas («Stock después»); el backend hace la conversión oficial. */
export function toBaseUnit(quantity: number, unit: string): number {
  return quantity * (TO_BASE[unit] ?? 1)
}

/**
 * Convierte la fecha elegida en un <input type="date"> al `occurred_at` del movimiento.
 * Hoy → `undefined` (el backend usa la hora actual). Un día pasado → ese día a las 12:00 hora local.
 */
export function dateInputToOccurredAt(value: string): string | undefined {
  if (!value || value === todayKey()) return undefined
  return new Date(`${value}T12:00:00`).toISOString()
}

/** Inicio de un día (AAAA-MM-DD) en hora local, en ISO con zona. */
export function dateInputToIso(value: string, endOfDay = false): string {
  return new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`).toISOString()
}

export function daysAgoKey(days: number): string {
  return dayKey(new Date(Date.now() - days * 86_400_000))
}

/** Une nombres en español: «A, B y C». */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`
}
