import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CsvImportError, importCsv, type CsvResult } from '../api/client'
import { errorMessage } from '../api/errors'
import { useItems } from '../api/queries'

export function CsvImport() {
  const items = useItems()
  const cache = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CsvResult | null>(null)
  const [failure, setFailure] = useState<unknown>(null)
  return <form className="card form" onSubmit={async (event) => {
    event.preventDefault()
    if (!file || busy) return
    setBusy(true); setResult(null); setFailure(null)
    try {
      setResult(await importCsv(file))
      await cache.invalidateQueries()
    } catch (error) { setFailure(error) }
    finally { setBusy(false) }
  }}>
    <h2>Importar movimientos CSV</h2>
    <p>Se registra el archivo completo o ninguno de sus movimientos. Máximo 1 MiB y 1000 filas.</p>
    <p>UTF-8, separado por coma o punto y coma. Encabezado obligatorio:</p>
    <p style={{ overflowWrap: 'anywhere' }}><code>insumo,cantidad,unidad,tipo,fecha,observacion</code></p>
    <p>Usa el ID del insumo, ENTRADA o SALIDA y fecha AAAA-MM-DD (inicio del día en Chile), o fecha y hora ISO con zona horaria. La cantidad admite punto o coma decimal, sin separadores de miles. Observación puede quedar vacía.</p>
    <details><summary>IDs de los insumos disponibles</summary>
      <ul>{items.data?.map(item => <li key={item.id}>{item.id}: {item.name} ({item.base_unit})</li>)}</ul>
    </details>
    <label>Archivo CSV<input type="file" accept=".csv,text/csv" required disabled={busy} onChange={e => {
      setFile(e.target.files?.[0] ?? null); setFailure(null); setResult(null)
    }} /></label>
    <button disabled={!file || busy} type="submit">{busy ? 'Importando…' : 'Importar archivo'}</button>
    {result && <p className="success" role="status">{result.replayed
      ? `Este archivo ya se había importado (${result.imported} movimientos). No se duplicaron datos.`
      : `Se importaron ${result.imported} movimientos. El stock y el historial están actualizados.`}</p>}
    {failure != null && <div className="error" role="alert">
      <p>{failure instanceof CsvImportError ? failure.message : errorMessage(failure)}</p>
      {failure instanceof CsvImportError && failure.details.length > 0 && <ul>
        {failure.details.map((err, index) => <li key={index}>{err.row ? `Fila de datos ${err.row}` : 'Archivo'}: {errorMessageForRow(err.code, err.message)}</li>)}
      </ul>}
    </div>}
  </form>
}

function errorMessageForRow(code: string, message: string) {
  const messages: Record<string, string> = {
    ITEM_NOT_FOUND: 'El insumo no existe.', NEGATIVE_STOCK: 'El movimiento dejaría stock negativo.',
    HISTORICAL_NEGATIVE_STOCK: 'El movimiento dejaría stock negativo en el historial.',
    HISTORICAL_RECONCILIATION_CONFLICT: 'El movimiento modifica un período conciliado por un conteo.',
    FUTURE_MOVEMENT: 'La fecha no puede estar en el futuro.',
    BEFORE_INITIAL_STOCK: 'La fecha es anterior al stock inicial.',
    INVALID_UNIT: 'La unidad no es compatible con el insumo.',
    INCOMPATIBLE_UNIT: 'La unidad no es compatible con el insumo.',
    AMOUNT_PRECISION: 'La cantidad supera los seis decimales permitidos.',
    AMOUNT_OUT_OF_RANGE: 'La cantidad está fuera del rango permitido.',
  }
  return messages[code] ?? message
}
