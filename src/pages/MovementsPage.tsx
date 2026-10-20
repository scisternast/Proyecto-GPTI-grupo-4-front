import { useState } from 'react'
import type { ItemState } from '../api/types'
import { useCounts, useCreateMovement, useItem, useMovements, useOrders, useReverseMovement } from '../api/queries'
import { Badge, ErrorMessage, Loading, PageHeader } from '../components/Feedback'
import { ItemSelect } from '../components/ItemSelect'
import {
  dateInputToOccurredAt,
  formatQuantity,
  formatShortDate,
  formatSigned,
  todayKey,
  toBaseUnit,
  UNIT_LABEL,
  UNITS_BY_BASE,
} from '../lib/format'
import { buildLedger, type LedgerRow } from '../lib/ledger'
import { MOVEMENT_KIND } from '../lib/labels'
import { useSelectedItem } from '../state/useSelectedItem'

const FILTERS = [
  { key: 'ALL', label: 'Todos', kinds: null },
  { key: 'ENTRY', label: 'Entradas', kinds: ['ENTRY'] },
  { key: 'EXIT', label: 'Salidas', kinds: ['EXIT'] },
  { key: 'COUNT', label: 'Conteos', kinds: ['COUNT_ADJUSTMENT'] },
  { key: 'REVERSAL', label: 'Reversas', kinds: ['REVERSAL', 'CORRECTION'] },
] as const

const KIND_TONE: Record<string, 'muted' | 'ok' | 'warn' | 'info'> = {
  ENTRY: 'ok',
  INITIAL: 'info',
  COUNT_ADJUSTMENT: 'warn',
  REVERSAL: 'muted',
  CORRECTION: 'muted',
}

export function MovementsPage() {
  const { id } = useSelectedItem()
  const item = useItem(id)

  return (
    <section>
      <PageHeader
        eyebrow={item.data && `${item.data.name} · stock disponible ${formatQuantity(item.data.current_stock, item.data.base_unit)}`}
        title="Movimientos"
      />
      {item.error && <ErrorMessage error={item.error} />}
      <div className="split">
        <MovementForm item={item.data} />
        {item.data ? <History item={item.data} /> : <div className="card">{id !== null && <Loading />}</div>}
      </div>
    </section>
  )
}

function MovementForm({ item }: { item: ItemState | undefined }) {
  const create = useCreateMovement()
  const [kind, setKind] = useState<'EXIT' | 'ENTRY'>('EXIT')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<string | null>(null)
  const [date, setDate] = useState(todayKey)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)

  const units = item ? UNITS_BY_BASE[item.base_unit] : []
  const activeUnit = unit && units.includes(unit) ? unit : units[0]
  const stock = item ? Number(item.current_stock) : 0
  const change = quantity ? toBaseUnit(Number(quantity), activeUnit) * (kind === 'EXIT' ? -1 : 1) : 0

  function reset() {
    setQuantity('')
    setDate(todayKey())
    setNote('')
    create.reset()
  }

  return (
    <form
      className="card form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!item) return
        setSaved(false)
        create.mutate(
          {
            item_id: item.id,
            kind,
            quantity,
            unit: activeUnit,
            occurred_at: dateInputToOccurredAt(date),
            note: note.trim() || null,
          },
          {
            onSuccess: () => {
              reset()
              setSaved(true)
            },
          },
        )
      }}
    >
      <h2>Registrar movimiento</h2>
      <ItemSelect />
      <fieldset className="choice">
        <legend>Tipo de movimiento</legend>
        <label className={kind === 'EXIT' ? 'selected' : undefined}>
          <input type="radio" name="kind" checked={kind === 'EXIT'} onChange={() => setKind('EXIT')} /> Salida
        </label>
        <label className={kind === 'ENTRY' ? 'selected' : undefined}>
          <input type="radio" name="kind" checked={kind === 'ENTRY'} onChange={() => setKind('ENTRY')} /> Entrada
        </label>
      </fieldset>
      <div className="row">
        <label>
          Cantidad
          <span className="input-unit">
            <input
              required
              type="number"
              min={0}
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            {units.length > 1 ? (
              <select value={activeUnit} onChange={(event) => setUnit(event.target.value)} aria-label="Unidad">
                {units.map((option) => (
                  <option key={option} value={option}>
                    {UNIT_LABEL[option]}
                  </option>
                ))}
              </select>
            ) : (
              <span>{UNIT_LABEL[activeUnit]}</span>
            )}
          </span>
        </label>
        <label>
          Fecha
          <input type="date" required max={todayKey()} value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>
      <label>
        Detalle (opcional)
        <input value={note} placeholder="Ej.: evento del fin de semana" onChange={(event) => setNote(event.target.value)} />
      </label>
      {item && (
        <div className="preview">
          <span>Stock después</span>
          <strong className={stock + change < 0 ? 'error' : undefined}>
            {formatQuantity(stock, item.base_unit)} → {formatQuantity(stock + change, item.base_unit)}
          </strong>
        </div>
      )}
      {create.error && <ErrorMessage error={create.error} />}
      {saved && <p className="success">Movimiento registrado.</p>}
      <div className="actions">
        <button type="submit" disabled={!item || create.isPending}>
          {create.isPending ? 'Guardando…' : 'Guardar movimiento'}
        </button>
        <button type="button" className="secondary" onClick={reset}>
          Limpiar
        </button>
      </div>
    </form>
  )
}

function History({ item }: { item: ItemState }) {
  const movements = useMovements(item.id)
  const counts = useCounts(item.id)
  const reverse = useReverseMovement()
  // Una entrada creada por la recepción de una orden no se anula (409 ORDER_RECEIPT_IMMUTABLE).
  const orders = useOrders()
  const receiptOrder = new Map(
    (orders.data ?? []).filter((o) => o.receipt_movement_id !== null).map((o) => [o.receipt_movement_id!, o.code]),
  )
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('ALL')

  if (movements.isPending) return <div className="card"><Loading /></div>
  if (movements.error) return <div className="card"><ErrorMessage error={movements.error} /></div>

  const ledger = buildLedger(movements.data, counts.data)
  const matches = (row: LedgerRow, kinds: readonly string[] | null) => !kinds || kinds.includes(row.kind)
  const active = FILTERS.find((f) => f.key === filter)!
  const rows = ledger.filter((row) => matches(row, active.kinds))
  const unit = item.base_unit

  return (
    <div className="card">
      <div className="card-header">
        <h2>Historial de movimientos</h2>
        {ledger.length > 0 && (
          <span className="muted">
            {formatShortDate(ledger.at(-1)!.occurred_at)} – {formatShortDate(ledger[0].occurred_at)}
          </span>
        )}
      </div>
      <p className="muted">
        Los movimientos no se editan ni se borran. Para corregir un error, anúlalo: se registra una reversa y el
        original queda marcado.
      </p>
      <div className="chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip${filter === f.key ? ' selected' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({ledger.filter((row) => matches(row, f.kinds)).length})
          </button>
        ))}
      </div>
      {reverse.error && <ErrorMessage error={reverse.error} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th className="num">Cant.</th>
              <th className="num">Stock</th>
              <th>Detalle</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.invalidated ? 'struck' : undefined}>
                <td>{formatShortDate(row.occurred_at)}</td>
                <td>
                  <Badge tone={KIND_TONE[row.kind] ?? 'muted'}>{MOVEMENT_KIND[row.kind] ?? row.kind}</Badge>
                </td>
                <td className="num">
                  {row.count ? formatQuantity(row.count.physical_stock, unit) : formatSigned(row.delta, unit)}
                </td>
                <td className="num">{formatQuantity(row.balance, unit)}</td>
                <td>
                  <div>{detail(row, unit)}</div>
                  {/* `created_by` viene null hasta que exista el login. */}
                  <small className="muted">{row.created_by?.name ?? '—'}</small>
                </td>
                <td>
                  {receiptOrder.has(row.id) && <small className="muted">Recepción {receiptOrder.get(row.id)}</small>}
                  {(row.kind === 'ENTRY' || row.kind === 'EXIT') && !row.invalidated && !receiptOrder.has(row.id) && (
                    <button
                      className="secondary small"
                      disabled={reverse.isPending}
                      onClick={() => {
                        if (confirm('¿Anular este movimiento? Se registrará una reversa en el historial.')) {
                          reverse.mutate(row.id)
                        }
                      }}
                    >
                      Anular
                    </button>
                  )}
                  {row.invalidated && <small className="muted">Anulado</small>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No hay movimientos de este tipo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function detail(row: LedgerRow, unit: string): string {
  if (row.count) {
    const shortage = Number(row.count.shortage)
    if (shortage > 0) return `Merma ${formatQuantity(shortage, unit)}`
    if (Number(row.count.difference) > 0) return `Sobrante ${formatQuantity(row.count.difference, unit)} · revisar`
    return 'Sin diferencias'
  }
  if (row.invalidates_movement_id) return `Anula el movimiento #${row.invalidates_movement_id}`
  return row.note || '—'
}
