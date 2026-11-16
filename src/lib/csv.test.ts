import { describe, expect, it } from 'vitest'
import { csvTemplate, decodeCsv, detectDelimiter, parseRecords, readCsv } from './csv'

describe('lectura del CSV para la vista previa', () => {
  it('respeta comillas, comillas escapadas y saltos de línea dentro de un campo', () => {
    expect(parseRecords('a,"b,c","d ""e""\nf"\r\ng,h,i\n', ',')).toEqual([
      ['a', 'b,c', 'd "e"\nf'],
      ['g', 'h', 'i'],
    ])
    expect(parseRecords('a,"b\n', ',')).toBeNull()
  })

  it('usa punto y coma si la primera línea tiene más «;» que «,»', () => {
    expect(detectDelimiter('insumo;cantidad;unidad;tipo;fecha;observacion\n1;2,5;kg;SALIDA;2026-11-13;')).toBe(';')
    expect(detectDelimiter('insumo,cantidad,unidad,tipo,fecha,observacion')).toBe(',')
  })

  it('numera las filas de datos desde 1, como el backend', () => {
    const read = readCsv('insumo,cantidad,unidad,tipo,fecha,observacion\n3,4,kg,ENTRADA,2026-11-13,"Recepción\ncon nota"\n3,2,kg,SALIDA,2026-11-13,\n')
    expect(read.ok && read.rows.map((r) => [r.row, r.itemId, r.tipo])).toEqual([
      [1, 3, 'ENTRADA'],
      [2, 3, 'SALIDA'],
    ])
  })

  it('exige el encabezado y al menos una fila', () => {
    expect(readCsv('item,qty\n1,2\n').ok).toBe(false)
    expect(readCsv('insumo,cantidad,unidad,tipo,fecha,observacion\n').ok).toBe(false)
  })

  it('rechaza archivos que no están en UTF-8 (p. ej. Excel en Windows-1252)', () => {
    expect(decodeCsv(new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer).ok).toBe(false) // «café» en Latin-1
    const utf8 = new TextEncoder().encode('﻿insumo')
    expect(decodeCsv(utf8.buffer as ArrayBuffer)).toEqual({ ok: true, text: 'insumo' })
  })

  it('la plantilla se puede volver a leer', () => {
    const read = readCsv(csvTemplate(7, 'kg', '2026-11-13'))
    expect(read.ok && read.rows.map((r) => [r.itemId, r.cantidad, r.tipo])).toEqual([
      [7, '10', 'ENTRADA'],
      [7, '2,5', 'SALIDA'],
    ])
  })
})
