import { useState } from 'react'
import { useUpdateSafeStock } from '../api/queries'
import { ErrorMessage } from '../components/Feedback'
import { formatDate, formatQuantity } from '../lib/format'
import { ALERT_SOURCE, CONSUMPTION_STATUS, DEPLETION_STATUS } from '../lib/labels'
import { useCurrentItem } from './useCurrentItem'

// Solo muestra lo que calcula el backend (`assessment`, `consumption`): la fórmula de alerta y
// cantidad sugerida va a cambiar (Arquitectura.md §9, punto 3) y no debe duplicarse aquí.
export function ItemSummaryPage() {
  const item = useCurrentItem()
  const { assessment: a, consumption: c, base_unit: unit } = item

  return (
    <div className="grid">
      <div className="card">
        <h2>Reposición</h2>
        <dl>
          <dt>Stock seguro</dt>
          <dd>
            {formatQuantity(a.safe_stock, unit)}
            {a.alert_source && <span className="muted"> ({ALERT_SOURCE[a.alert_source]})</span>}
          </dd>
          <dt>Stock objetivo</dt>
          <dd>{formatQuantity(a.target_stock, unit)}</dd>
          <dt>Cantidad sugerida</dt>
          <dd>
            <strong>{formatQuantity(a.suggested_quantity, unit)}</strong>
          </dd>
        </dl>
        <SafeStockForm />
      </div>

      <div className="card">
        <h2>Consumo y proyección</h2>
        <dl>
          <dt>Estado del consumo</dt>
          <dd>
            {CONSUMPTION_STATUS[c.status]} · {c.complete_days} días completos
          </dd>
          <dt>Consumo semanal</dt>
          <dd>{formatQuantity(c.weekly_average, unit)}</dd>
          <dt>Consumo diario</dt>
          <dd>{formatQuantity(a.daily_average, unit)}</dd>
          <dt>Días restantes</dt>
          <dd>{formatQuantity(a.remaining_days)}</dd>
          <dt>Fecha estimada de quiebre</dt>
          <dd>{a.depletion_status === 'PROJECTED' ? formatDate(a.depletion_at) : DEPLETION_STATUS[a.depletion_status]}</dd>
        </dl>
      </div>
    </div>
  )
}

function SafeStockForm() {
  const item = useCurrentItem()
  const update = useUpdateSafeStock(item.id)
  const [value, setValue] = useState(item.manual_safe_stock === null ? '' : String(Number(item.manual_safe_stock)))

  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault()
        update.mutate(value === '' ? null : value)
      }}
    >
      <label>
        Stock seguro manual ({item.base_unit})
        <input
          type="number"
          min={0}
          step="any"
          value={value}
          placeholder="Automático"
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="submit" disabled={update.isPending}>
        Guardar
      </button>
      {update.error && <ErrorMessage error={update.error} />}
    </form>
  )
}
