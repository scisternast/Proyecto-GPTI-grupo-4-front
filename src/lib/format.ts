import type { BaseUnit } from '../api/types'

export const TIME_ZONE = 'America/Santiago'

const quantityFormat = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 })
const dateTimeFormat = new Intl.DateTimeFormat('es-CL', {
  timeZone: TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
})
const dateFormat = new Intl.DateTimeFormat('es-CL', { timeZone: TIME_ZONE, dateStyle: 'medium' })

/** Los decimales llegan como texto ("25.000000") para no perder precisión; solo se convierten para mostrar. */
export function formatQuantity(value: string | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined) return '—'
  const text = quantityFormat.format(Number(value))
  return unit ? `${text} ${unit}` : text
}

/** Las fechas pueden venir en UTC (…Z); se muestran siempre en hora de Chile. */
export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFormat.format(new Date(value)) : '—'
}

export function formatDate(value: string | null | undefined): string {
  return value ? dateFormat.format(new Date(value)) : '—'
}

/** Unidades que acepta el backend para cada unidad base. */
export const UNITS_BY_BASE: Record<BaseUnit, string[]> = {
  kg: ['kg', 'g'],
  L: ['L', 'mL'],
  unidad: ['unidad'],
}

/** Convierte un <input type="datetime-local"> (hora local del navegador) a ISO con zona. */
export function localInputToIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined
}
