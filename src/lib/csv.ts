// Importación CSV de movimientos (REQ-18, RN-19). El backend valida y registra; aquí solo se lee el archivo
// para mostrar una vista previa y ubicar los errores que devuelva por número de fila. El formato sigue
// backend/app/services/csv_imports.py (docs/CSV_E3.md del backend).

export const CSV_HEADERS = ['insumo', 'cantidad', 'unidad', 'tipo', 'fecha', 'observacion'] as const
export const CSV_MAX_BYTES = 1_048_576
export const CSV_MAX_ROWS = 1000

export interface CsvPreviewRow {
  /** Fila de datos, desde 1 (el encabezado no cuenta), como la numera el backend. */
  row: number
  itemId: number | null
  /** Texto original de cada columna. */
  insumo: string
  cantidad: string
  unidad: string
  tipo: string
  fecha: string
  observacion: string
}

export type CsvReadResult =
  | { ok: true; text: string; delimiter: ',' | ';'; rows: CsvPreviewRow[] }
  | { ok: false; message: string }

/**
 * Lee el archivo como UTF-8 (con BOM opcional). Un CSV guardado por Excel como «CSV (delimitado por comas)»
 * suele venir en Windows-1252: se rechaza aquí con un mensaje claro en vez de enviar texto corrupto.
 */
export function decodeCsv(bytes: ArrayBuffer): { ok: true; text: string } | { ok: false; message: string } {
  if (bytes.byteLength > CSV_MAX_BYTES) return { ok: false, message: 'El archivo supera el máximo de 1 MiB.' }
  try {
    // TextDecoder quita el BOM inicial.
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    return {
      ok: false,
      message: 'El archivo no está en UTF-8. En Excel, usa «Guardar como» → «CSV UTF-8 (delimitado por comas)».',
    }
  }
}

/** Mismo criterio que el backend: punto y coma si la primera línea tiene más «;» que «,». */
export function detectDelimiter(text: string): ',' | ';' {
  const first = text.split(/\r\n|\n|\r/, 1)[0] ?? ''
  const count = (char: string) => first.split(char).length - 1
  return count(';') > count(',') ? ';' : ','
}

/**
 * Registros CSV (RFC 4180): comillas dobles, comillas escapadas ("") y saltos de línea dentro de comillas.
 * Devuelve `null` si una comilla queda sin cerrar.
 */
export function parseRecords(text: string, delimiter: string): string[][] | null {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  while (i < text.length) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (char === '"') quoted = false
      else field += char
      i++
      continue
    }
    if (char === '"' && field === '') quoted = true
    else if (char === delimiter) {
      record.push(field)
      field = ''
    } else if (char === '\r' || char === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
      if (char === '\r' && text[i + 1] === '\n') i++
    } else field += char
    i++
  }
  if (quoted) return null
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }
  return records
}

/** Lee el CSV para la vista previa. Los errores de cada fila los informa el backend al importar. */
export function readCsv(text: string): CsvReadResult {
  const delimiter = detectDelimiter(text)
  const records = parseRecords(text, delimiter)
  if (records === null) return { ok: false, message: 'Hay una comilla sin cerrar: revisa el archivo.' }
  const [header, ...data] = records
  if (!header || header.map((h) => h.trim()).join() !== CSV_HEADERS.join()) {
    return { ok: false, message: `La primera fila debe ser el encabezado: ${CSV_HEADERS.join(delimiter)}` }
  }
  if (data.length === 0) return { ok: false, message: 'El archivo no contiene movimientos.' }
  if (data.length > CSV_MAX_ROWS) return { ok: false, message: `El archivo supera el máximo de ${CSV_MAX_ROWS} filas de movimientos.` }
  const rows = data.map((fields, index) => {
    const [insumo = '', cantidad = '', unidad = '', tipo = '', fecha = '', observacion = ''] = fields.map((f) => f.trim())
    return {
      row: index + 1,
      itemId: /^[1-9]\d{0,15}$/.test(insumo) ? Number(insumo) : null,
      insumo,
      cantidad,
      unidad,
      tipo,
      fecha,
      observacion,
    }
  })
  return { ok: true, text, delimiter, rows }
}

/** Campo CSV con comillas si contiene el delimitador, comillas o saltos de línea. */
function field(value: string, delimiter: string) {
  return /["\r\n]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Plantilla de ejemplo para un insumo: encabezado y una entrada y una salida con fecha de hoy. */
export function csvTemplate(itemId: number, unit: string, today: string): string {
  const rows = [
    [...CSV_HEADERS],
    [String(itemId), '10', unit, 'ENTRADA', today, 'Compra en feria'],
    [String(itemId), '2,5', unit, 'SALIDA', today, 'Consumo del día'],
  ]
  return `${rows.map((r) => r.map((v) => field(v, ',')).join(',')).join('\r\n')}\r\n`
}
