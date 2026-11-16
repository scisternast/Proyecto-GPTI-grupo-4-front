import { useRef, useState } from 'react'
import { csvRowErrors, errorMessage, messageForCode } from '../api/errors'
import { useImportMovementsCsv, useItems } from '../api/queries'
import type { CsvRowError, ItemState } from '../api/types'
import { CSV_HEADERS, csvTemplate, type CsvPreviewRow, decodeCsv, readCsv } from '../lib/csv'
import { formatDateTime, formatQuantity, formatShortDate, todayKey, UNIT_LABEL } from '../lib/format'
import { useToast } from '../state/toastContext'
import { ErrorMessage } from './Feedback'

const PREVIEW_ROWS = 8

type Picked = { name: string; text: string; rows: CsvPreviewRow[] }

/**
 * Importar movimientos desde un CSV (REQ-18, RN-19). El backend valida las filas en orden, con el stock
 * acumulado de las anteriores, y es todo o nada: si una fila falla no se registra ninguna.
 */
export function CsvImport({ item }: { item: ItemState | undefined }) {
  const items = useItems()
  const upload = useImportMovementsCsv()
  const input = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const toast = useToast()
  // Cada intento reemplaza la notificación del anterior: un error viejo no queda junto a un éxito nuevo.
  const lastToast = useRef<number | null>(null)
  const notify = (input: Parameters<typeof toast.notify>[0]) => {
    if (lastToast.current !== null) toast.dismiss(lastToast.current)
    lastToast.current = toast.notify(input)
  }

  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]))
  const rowErrors = csvRowErrors(upload.error)

  function clear() {
    setPicked(null)
    setReadError(null)
    upload.reset()
    if (input.current) input.current.value = ''
  }

  function readFailed(file: string, message: string) {
    setReadError(message)
    notify({ tone: 'error', title: 'No se pudo leer el archivo', message: `${file}: ${message}` })
  }

  async function pick(file: File | undefined) {
    clear()
    if (!file) return
    const decoded = decodeCsv(await file.arrayBuffer())
    if (!decoded.ok) return readFailed(file.name, decoded.message)
    const read = readCsv(decoded.text)
    if (!read.ok) return readFailed(file.name, read.message)
    setPicked({ name: file.name, text: read.text, rows: read.rows })
  }

  function importFile({ name, text }: Picked) {
    upload.mutate(text, {
      onSuccess: (data) => {
        notify(
          data.replayed
            ? {
                tone: 'info',
                title: 'Archivo ya importado',
                message: `${name} ya se había importado: no se registraron movimientos nuevos.`,
              }
            : {
                tone: 'success',
                title: 'Importación exitosa',
                message: `${name}: ${data.imported} ${data.imported === 1 ? 'movimiento registrado' : 'movimientos registrados'}. El stock y el historial se actualizaron.`,
              },
        )
        clear()
      },
      onError: (error) => {
        const rows = csvRowErrors(error)
        const fileLevel = rows?.find((e) => e.row === 0)
        const badRows = new Set(rows?.filter((e) => e.row > 0).map((e) => e.row)).size
        notify({
          tone: 'error',
          title: 'No se importó el archivo',
          message:
            rows === null
              ? `${name}: ${errorMessage(error)}`
              : fileLevel
                ? `${name}: ${messageForCode(fileLevel.code, fileLevel.message)} No se registró ningún movimiento.`
                : `${name}: ${badRows} ${badRows === 1 ? 'fila tiene' : 'filas tienen'} errores, así que no se registró ningún movimiento y el stock no cambió. Revisa el detalle bajo «Importar desde CSV».`,
        })
      },
    })
  }

  function downloadTemplate() {
    if (!item) return
    const blob = new Blob([csvTemplate(item.id, item.base_unit, todayKey())], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `movimientos-${slug(item.name)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card form csv-import">
      <div className="card-header">
        <h2>Importar desde CSV</h2>
        <button type="button" className="link small" disabled={!item} onClick={downloadTemplate}>
          Descargar plantilla
        </button>
      </div>
      <p className="muted small">
        Registra varios movimientos de una vez. Si una fila tiene un error no se registra ningún movimiento del archivo
        y el stock no cambia.
        {item && (
          <>
            {' '}
            El ID de <strong>{item.name}</strong> es <code>{item.id}</code>.
          </>
        )}
      </p>

      <label className="file-pick">
        <span>Archivo .csv (UTF-8, máx. 1 MiB y 1000 filas)</span>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void pick(event.target.files?.[0])}
        />
      </label>

      <details className="csv-format">
        <summary>Formato del archivo</summary>
        <p className="small">
          Primera fila: <code>{CSV_HEADERS.join(',')}</code>. Separador coma o punto y coma.
        </p>
        <ul className="small">
          <li>
            <strong>insumo</strong>: ID del insumo
            {items.data && items.data.length > 0 && (
              <> ({items.data.map((i) => `${i.id} = ${i.name}`).join(', ')})</>
            )}
            .
          </li>
          <li>
            <strong>cantidad</strong>: mayor a cero, sin separador de miles; decimales con punto o coma (con coma como
            separador, entre comillas: <code>"2,5"</code>).
          </li>
          <li>
            <strong>unidad</strong>: <code>kg</code> o <code>g</code>, <code>L</code> o <code>mL</code>, o{' '}
            <code>unidad</code>, compatible con la unidad del insumo.
          </li>
          <li>
            <strong>tipo</strong>: <code>ENTRADA</code> o <code>SALIDA</code>.
          </li>
          <li>
            <strong>fecha</strong>: <code>AAAA-MM-DD</code> (se registra a las 00:00) o fecha y hora con zona, p. ej.{' '}
            <code>2026-11-13T15:30:00-03:00</code>. No puede ser futura ni anterior al stock inicial del insumo.
          </li>
          <li>
            <strong>observacion</strong>: opcional, pero la columna debe estar.
          </li>
        </ul>
        <p className="small muted">
          Las filas se aplican en el orden del archivo: una salida debe tener stock suficiente con las filas anteriores.
          Volver a subir un archivo ya importado no duplica los movimientos.
        </p>
      </details>

      {readError && (
        <p className="error" role="alert">
          {readError}
        </p>
      )}

      {picked && <Preview picked={picked} itemById={itemById} errorRows={new Set(rowErrors?.map((e) => e.row))} />}

      {upload.error !== null && rowErrors === null && <ErrorMessage error={upload.error} />}
      {rowErrors !== null && picked && <RowErrors errors={rowErrors} rows={picked.rows} itemById={itemById} />}

      {picked && (
        <div className="actions">
          <button
            type="button"
            // Tras un rechazo hay que corregir el archivo y volver a elegirlo.
            disabled={upload.isPending || rowErrors !== null}
            onClick={() => importFile(picked)}
          >
            {upload.isPending
              ? 'Importando…'
              : `Importar ${picked.rows.length} ${picked.rows.length === 1 ? 'movimiento' : 'movimientos'}`}
          </button>
          <button type="button" className="secondary" onClick={clear} disabled={upload.isPending}>
            Quitar archivo
          </button>
        </div>
      )}
    </div>
  )
}

function Preview({
  picked,
  itemById,
  errorRows,
}: {
  picked: Picked
  itemById: Map<number, ItemState>
  errorRows: Set<number>
}) {
  const { rows } = picked
  const entries = rows.filter((r) => r.tipo === 'ENTRADA').length
  const exits = rows.filter((r) => r.tipo === 'SALIDA').length
  const names = [...new Set(rows.map((r) => itemName(r, itemById)))]
  const shown = rows.slice(0, PREVIEW_ROWS)

  return (
    <div className="csv-preview">
      <p className="small">
        <strong>{picked.name}</strong>: {rows.length} {rows.length === 1 ? 'fila' : 'filas'} · {entries}{' '}
        {entries === 1 ? 'entrada' : 'entradas'} · {exits} {exits === 1 ? 'salida' : 'salidas'} · {names.join(', ')}
      </p>
      <div className="table-wrap">
        <table className="compact">
          <thead>
            <tr>
              <th className="num">Fila</th>
              <th>Movimiento</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.row} className={errorRows.has(r.row) ? 'error-row' : undefined}>
                <td className="num">{r.row}</td>
                <td>
                  {kindLabel(r)} {quantityLabel(r)}
                  {names.length > 1 && <small className="block muted">{itemName(r, itemById)}</small>}
                </td>
                <td className="nowrap">{dateLabel(r.fecha, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PREVIEW_ROWS && <p className="muted small">y {rows.length - PREVIEW_ROWS} filas más.</p>}
    </div>
  )
}

function RowErrors({ errors, rows, itemById }: { errors: CsvRowError[]; rows: CsvPreviewRow[]; itemById: Map<number, ItemState> }) {
  const byRow = new Map(rows.map((r) => [r.row, r]))
  return (
    <div className="csv-errors" role="alert">
      <p>
        <strong>No se registró ningún movimiento del archivo.</strong> Corrige{' '}
        {errors.length === 1 ? 'la fila indicada' : `las ${errors.length} filas indicadas`} y vuelve a subirlo.
      </p>
      <ul>
        {errors.map((e, i) => {
          const row = byRow.get(e.row)
          return (
            <li key={`${e.row}-${e.code}-${i}`}>
              <strong>{e.row === 0 ? 'Archivo' : `Fila ${e.row}`}</strong>
              {row && (
                <span className="muted">
                  {' '}
                  ({itemName(row, itemById)} · {kindLabel(row)} {quantityLabel(row)} · {dateLabel(row.fecha)})
                </span>
              )}
              : {e.code === 'CSV_ROW' ? e.message : messageForCode(e.code, e.message)}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function kindLabel(row: CsvPreviewRow) {
  return row.tipo === 'ENTRADA' ? 'Entrada' : row.tipo === 'SALIDA' ? 'Salida' : row.tipo ? `«${row.tipo}»` : 'Sin tipo'
}

/** «13/11» para AAAA-MM-DD; «13/11 · 15:30» si trae hora; el texto original si no se entiende. */
function dateLabel(value: string, short = false) {
  if (!value) return 'sin fecha'
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (day) return `${day[3]}/${day[2]}`
  if (Number.isNaN(Date.parse(value))) return value
  return short ? formatShortDate(value) : formatDateTime(value)
}

function itemName(row: CsvPreviewRow, itemById: Map<number, ItemState>) {
  if (row.itemId === null) return row.insumo ? `«${row.insumo}»` : 'sin insumo'
  return itemById.get(row.itemId)?.name ?? `ID ${row.itemId} (no existe)`
}

function quantityLabel(row: CsvPreviewRow) {
  const qty = Number(row.cantidad.replace(',', '.'))
  if (!row.cantidad || Number.isNaN(qty) || !UNIT_LABEL[row.unidad]) return `${row.cantidad || '—'} ${row.unidad}`.trim()
  return formatQuantity(qty, row.unidad)
}

function slug(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'insumo'
  )
}
