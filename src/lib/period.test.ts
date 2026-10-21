import { describe, expect, it } from 'vitest'
import type { ItemState } from '../api/types'
import { dayKey, daysAgoKey } from './format'
import { defaultStart, periodStart } from './period'

const item = (observation_started_at: string | null) => ({ observation_started_at }) as ItemState

describe('fechas de los campos de período', () => {
  it('dayKey entrega AAAA-MM-DD en hora de Chile, sin depender del idioma del navegador', () => {
    // 02:00 UTC del 21 = 23:00 del 20 en Chile (-03:00).
    expect(dayKey('2026-10-21T02:00:00Z')).toBe('2026-10-20')
    expect(dayKey('2026-07-27T11:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('período por defecto de Métricas', () => {
  it('si los datos empiezan dentro de los últimos 90 días, parte en el primer registro', () => {
    const first = new Date(Date.now() - 30 * 86_400_000).toISOString()
    expect(defaultStart([item(first), item(new Date().toISOString())])).toBe(dayKey(first))
  })

  it('si los datos son más antiguos, usa los últimos 90 días', () => {
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString()
    expect(defaultStart([item(old)])).toBe(daysAgoKey(90))
  })

  it('sin insumos, usa los últimos 90 días', () => {
    expect(defaultStart([])).toBe(daysAgoKey(90))
  })

  it('el día del primer registro parte a la hora exacta del registro, no a las 00:00', () => {
    const first = '2026-07-27T11:00:00.000Z' // 08:00 en Chile
    expect(periodStart('2026-07-27', [item(first)])).toBe(first)
    expect(Date.parse(periodStart('2026-07-28', [item(first)]))).toBeGreaterThan(Date.parse(first))
  })
})
