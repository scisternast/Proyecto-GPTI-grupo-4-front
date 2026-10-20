import { useState } from 'react'
import type { ItemState } from '../api/types'
import { useCounts, useCreateCount, useItem, useShortageRate } from '../api/queries'
import type { CountCause } from '../api/types'
import { Badge, ErrorMessage, Loading, PageHeader } from '../components/Feedback'
import { ItemSelect } from '../components/ItemSelect'
import {
  dateInputToIso,
  daysAgoKey,
  formatPercent,
  formatQuantity,
  formatShortDate,
  formatSigned,
  todayKey,
  toBaseUnit,
  UNIT_LABEL,
  UNITS_BY_BASE,
} from '../lib/format'
import { COUNT_CAUSES } from '../lib/labels'
import { useSelectedItem } from '../state/useSelectedItem'

export function CountsPage() {
  const { id } = useSelectedItem()
  const item = useItem(id)

  return (
    <section>
      <PageHeader
        eyebrow={item.data && `${item.data.name} · stock teórico ${formatQuantity(item.data.current_stock, item.data.base_unit)}`}
        title="Conteo y merma"
      />
      {item.error && <ErrorMessage error={item.error} />}
      <div className="split">
        <CountForm item={item.data} />
        {item.data ? (
          <div className="stack">
            <ShortageRate item={item.data} />
            <CountHistory item={item.data} />
          </div>
        ) : (
          <div className="card">{id !== null && <Loading />}</div>
        )}
      </div>
    </section>
  )
}

function CountForm({ item }: { item: ItemState | undefined }) {
  const create = useCreateCount()
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<string | null>(null)
  const [cause, setCause] = useState<CountCause | ''>('')
  const [saved, setSaved] = useState(false)

  const units = item ? UNITS_BY_BASE[item.base_unit] : []
  const activeUnit = unit && units.includes(unit) ? unit : units[0]
  const theoretical = item ? Number(item.current_stock) : 0
  const difference = quantity === '' ? null : toBaseUnit(Number(quantity), activeUnit) - theoretical

  return (
    <form
      className="card form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!item) return
        setSaved(false)
        create.mutate(
          { item_id: item.id, physical_quantity: quantity, unit: activeUnit, cause: cause || null },
          {
            onSuccess: () => {
              setQuantity('')
              setCause('')
              setSaved(true)
            },
          },
        )
      }}
    >
      <h2>Registrar conteo físico</h2>
      <ItemSelect />
      <label>
        Cantidad contada
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
            <span>{activeUnit && UNIT_LABEL[activeUnit]}</span>
          )}
        </span>
      </label>
      <label>
        Causa de la diferencia
        <select value={cause} onChange={(event) => setCause(event.target.value as CountCause | '')}>
          <option value="">Sin indicar</option>
          {COUNT_CAUSES.map((option) => (
            <option key={option} value={option}>
              {option[0].toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
      </label>
      {item && (
        <div className="preview">
          <span>Teórico → contado</span>
          <strong>
            {formatQuantity(theoretical, item.base_unit)} →{' '}
            {difference === null ? '—' : formatQuantity(theoretical + difference, item.base_unit)}
            {difference !== null && difference !== 0 && ` (${formatSigned(difference, item.base_unit)})`}
          </strong>
        </div>
      )}
      <p className="muted small">El sistema ajusta el saldo al valor contado. Si sobra stock, el conteo queda para revisar.</p>
      {create.error && <ErrorMessage error={create.error} />}
      {saved && <p className="success">Conteo registrado.</p>}
      <button type="submit" disabled={!item || create.isPending}>
        {create.isPending ? 'Guardando…' : 'Guardar conteo'}
      </button>
    </form>
  )
}

function ShortageRate({ item }: { item: ItemState }) {
  const [start, setStart] = useState(() => daysAgoKey(30))
  const [end, setEnd] = useState(todayKey)
  const rate = useShortageRate(item.id, start && dateInputToIso(start), end && dateInputToIso(end, true))

  return (
    <div className="card">
      <div className="card-header">
        <h2>Tasa de merma</h2>
        <div className="inline-form">
          <label>
            Desde
            <input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={end} max={todayKey()} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>
      </div>
      {rate.isPending && <Loading />}
      {rate.error && <ErrorMessage error={rate.error} />}
      {rate.data &&
        (rate.data.status === 'CALCULABLE' ? (
          <div className="kpis kpis-inline">
            <div className="kpi">
              <span>Tasa de merma</span>
              <strong>{formatPercent(rate.data.rate_percent)}</strong>
            </div>
            <div className="kpi">
              <span>Merma</span>
              <strong>{formatQuantity(rate.data.shortage, item.base_unit)}</strong>
            </div>
            <div className="kpi">
              <span>Disponible en el período</span>
              <strong>{formatQuantity(rate.data.available, item.base_unit)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">No se puede calcular la tasa para este período.</p>
        ))}
    </div>
  )
}

function CountHistory({ item }: { item: ItemState }) {
  const counts = useCounts(item.id)
  const unit = item.base_unit

  return (
    <div className="card">
      <h2>Conteos registrados</h2>
      {counts.isPending && <Loading />}
      {counts.error && <ErrorMessage error={counts.error} />}
      {counts.data?.length === 0 && <p className="muted">Aún no hay conteos.</p>}
      {counts.data && counts.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="num">Teórico</th>
                <th className="num">Contado</th>
                <th className="num">Diferencia</th>
                <th className="num">Merma</th>
                <th>Causa</th>
              </tr>
            </thead>
            <tbody>
              {[...counts.data].reverse().map((count) => (
                <tr key={count.id}>
                  <td>{formatShortDate(count.occurred_at)}</td>
                  <td className="num">{formatQuantity(count.theoretical_before, unit)}</td>
                  <td className="num">{formatQuantity(count.physical_stock, unit)}</td>
                  <td className="num">
                    {formatSigned(count.difference, unit)}{' '}
                    {/* C10: el backend marca para revisión un conteo mayor al teórico. */}
                    {count.needs_review && <Badge tone="warn">Revisar</Badge>}
                  </td>
                  <td className="num">{formatQuantity(count.shortage, unit)}</td>
                  <td>{count.cause ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
