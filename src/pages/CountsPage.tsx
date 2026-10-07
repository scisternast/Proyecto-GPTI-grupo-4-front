import { useState } from 'react'
import { useCounts, useCreateCount, useShortageRate } from '../api/queries'
import type { CountCause } from '../api/types'
import { ErrorMessage, Loading } from '../components/Feedback'
import { formatDateTime, formatQuantity, localInputToIso, UNITS_BY_BASE } from '../lib/format'
import { COUNT_CAUSES } from '../lib/labels'
import { useCurrentItem } from './useCurrentItem'

export function CountsPage() {
  const item = useCurrentItem()
  const counts = useCounts(item.id)

  return (
    <div>
      <div className="grid">
        <CountForm />
        <ShortageRate />
      </div>

      <h2>Conteos registrados</h2>
      {counts.isPending && <Loading />}
      {counts.error && <ErrorMessage error={counts.error} />}
      {counts.data && counts.data.length === 0 && <p className="muted">Aún no hay conteos.</p>}
      {counts.data && counts.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th className="num">Teórico</th>
              <th className="num">Físico</th>
              <th className="num">Diferencia</th>
              <th className="num">Merma</th>
              <th>Causa</th>
            </tr>
          </thead>
          <tbody>
            {[...counts.data].reverse().map((count) => (
              <tr key={count.id}>
                <td>{formatDateTime(count.occurred_at)}</td>
                <td className="num">{formatQuantity(count.theoretical_before)}</td>
                <td className="num">{formatQuantity(count.physical_stock)}</td>
                <td className="num">{formatQuantity(count.difference)}</td>
                <td className="num">{formatQuantity(count.shortage)}</td>
                <td>{count.cause ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function CountForm() {
  const item = useCurrentItem()
  const create = useCreateCount()
  const units = UNITS_BY_BASE[item.base_unit]
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState(units[0])
  const [cause, setCause] = useState<CountCause | ''>('')

  return (
    <form
      className="card form"
      onSubmit={(event) => {
        event.preventDefault()
        create.mutate(
          { item_id: item.id, physical_quantity: quantity, unit, cause: cause || null },
          {
            onSuccess: () => {
              setQuantity('')
              setCause('')
            },
          },
        )
      }}
    >
      <h2>Registrar conteo físico</h2>
      <p className="muted">
        Stock teórico actual: {formatQuantity(item.current_stock, item.base_unit)}. El sistema ajusta el saldo al valor
        contado.
      </p>
      <div className="row">
        <label>
          Cantidad contada
          <input
            required
            type="number"
            min={0}
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label>
          Unidad
          <select value={unit} onChange={(event) => setUnit(event.target.value)}>
            {units.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Causa de la diferencia
        <select value={cause} onChange={(event) => setCause(event.target.value as CountCause | '')}>
          <option value="">Sin indicar</option>
          {COUNT_CAUSES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
      {create.error && <ErrorMessage error={create.error} />}
      <button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Guardando…' : 'Registrar conteo'}
      </button>
    </form>
  )
}

function daysAgoInput(days: number) {
  const date = new Date(Date.now() - days * 86_400_000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function ShortageRate() {
  const item = useCurrentItem()
  const [start, setStart] = useState(() => daysAgoInput(30))
  const [end, setEnd] = useState(() => daysAgoInput(0))
  const rate = useShortageRate(item.id, localInputToIso(start) ?? '', localInputToIso(end) ?? '')

  return (
    <div className="card form">
      <h2>Tasa de merma</h2>
      <div className="row">
        <label>
          Desde
          <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label>
          Hasta
          <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} />
        </label>
      </div>
      {rate.isFetching && <Loading />}
      {rate.error && <ErrorMessage error={rate.error} />}
      {rate.data &&
        (rate.data.status === 'CALCULABLE' ? (
          <dl>
            <dt>Tasa</dt>
            <dd>
              <strong>{formatQuantity(rate.data.rate_percent)} %</strong>
            </dd>
            <dt>Merma</dt>
            <dd>{formatQuantity(rate.data.shortage, item.base_unit)}</dd>
            <dt>Disponible en el periodo</dt>
            <dd>{formatQuantity(rate.data.available, item.base_unit)}</dd>
          </dl>
        ) : (
          <p className="muted">No se puede calcular la tasa para este periodo.</p>
        ))}
    </div>
  )
}
