import { useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { shortageRateQuery, useAllProducts, useCounts, useItem, useItems, useMetrics, useOrders, useSuggestions } from '../api/queries'
import { type Count, type ItemState, type Metrics, type Order, snapshotOf, type Suggestion, type SupplierProduct } from '../api/types'
import { ColumnChart } from '../components/Charts'
import { ErrorMessage, Loading, PageHeader } from '../components/Feedback'
import { ItemSelect } from '../components/ItemSelect'
import { BUSINESS_NAME } from '../lib/config'
import { dateInputToIso, daysAgoKey, formatCLP, formatPercent, formatQuantity, formatShortDate, joinNames, todayKey } from '../lib/format'
import { nextDay } from '../lib/ledger'
import { useSelectedItem } from '../state/useSelectedItem'

// Mockup «Métricas del negocio» (REQ-12, C7). Los indicadores del período vienen de GET /metrics
// (todo el negocio). La merma por conteo es del insumo elegido: tasa P3 entre conteos consecutivos.
export function MetricsPage() {
  const { id } = useSelectedItem()
  const item = useItem(id)
  const [start, setStart] = useState(() => daysAgoKey(90))
  const [end, setEnd] = useState(todayKey)
  // Período [inicio, fin): «Hasta» incluye el día completo.
  const startIso = dateInputToIso(start)
  const endIso = dateInputToIso(nextDay(end))
  const metrics = useMetrics(startIso, endIso)
  const suggestions = useSuggestions()
  const shrink = useShrinkByCount(item.data, startIso, endIso)
  const m = metrics.data
  const decided = (suggestions.data ?? []).filter(
    (s) => s.decided_at !== null && Date.parse(s.decided_at) >= Date.parse(startIso) && Date.parse(s.decided_at) < Date.parse(endIso),
  )

  return (
    <section>
      <PageHeader
        eyebrow={BUSINESS_NAME}
        title="Métricas del negocio"
        actions={
          <div className="period">
            <span className="muted small">Período</span>
            <input type="date" aria-label="Inicio del período" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
            <span className="muted">–</span>
            <input type="date" aria-label="Fin del período" value={end} max={todayKey()} onChange={(e) => setEnd(e.target.value)} />
          </div>
        }
      />
      {metrics.isPending && <Loading />}
      {metrics.error && <ErrorMessage error={metrics.error} />}

      <div className={`kpis${metrics.isFetching && m ? ' refetching' : ''}`}>
        <div className="card kpi">
          <span>Alertas atendidas antes del quiebre</span>
          <strong className="mono">
            {m && m.alerts_attended_before_depletion !== null
              ? `${m.alerts_attended_before_depletion} de ${m.evaluated_alert_order_ids.length}`
              : '—'}
          </strong>
          <small>
            {!m
              ? ''
              : m.alerts_attended_before_depletion === null && m.not_evaluable_order_ids.length > 0
                ? `No evaluable: ${m.not_evaluable_order_ids.length} órdenes sin fecha de quiebre guardada`
                : 'Órdenes aprobadas antes de la fecha de quiebre proyectada'}
          </small>
        </div>
        <div className="card kpi">
          <span>Merma promedio{item.data && ` · ${item.data.name}`}</span>
          <strong className="mono">{shrink.rows.length ? formatPercent(shrink.average) : '—'}</strong>
          <small>
            {shrink.rows.length
              ? `Conteos del ${joinNames(shrink.rows.map((r) => formatShortDate(r.count.occurred_at)))}`
              : 'Sin conteos con merma en el período'}
          </small>
        </div>
        <div className="card kpi">
          <span>Órdenes aprobadas</span>
          <strong className="mono">{m ? `${m.approved_orders} de ${Math.max(decided.length, m.approved_orders)}` : '—'}</strong>
          <small>
            {m && decided.length > 0
              ? `${Math.round((m.approved_orders / Math.max(decided.length, m.approved_orders)) * 100)} % de las sugerencias decididas`
              : 'Sin sugerencias decididas en el período'}
          </small>
        </div>
        <div className="card kpi">
          <span>Ahorro estimado acumulado</span>
          <strong className="mono accent">
            {m?.estimated_savings_clp != null ? formatCLP(m.estimated_savings_clp) : '—'}{' '}
            {m?.estimated_savings_percent != null && <small>{formatPercent(m.estimated_savings_percent)}</small>}
          </strong>
          <small>
            {m && m.estimated_savings_clp === null && m.approved_orders > 0
              ? 'No calculable: hay órdenes sin precio alternativo guardado'
              : 'Frente a la siguiente mejor opción vigente'}
          </small>
        </div>
      </div>
      {m?.impact_comparison.status === 'NOT_VERIFIABLE' && (
        <p className="muted small">
          Sin línea base comparable: la reducción de quiebres y de merma frente a antes del sistema aún no se puede medir
          (E3).
        </p>
      )}

      <div className="split split-even">
        <div className="card">
          <div className="card-header">
            <h2>Merma por conteo</h2>
          </div>
          <ItemSelect />
          {shrink.loading && <Loading />}
          {shrink.error !== null && <ErrorMessage error={shrink.error} />}
          {!shrink.loading && shrink.rows.length === 0 && <p className="muted">No hay conteos con merma en el período.</p>}
          {shrink.rows.length > 0 && (
            <ColumnChart
              label={`Tasa de merma por conteo de ${item.data?.name ?? 'insumo'}`}
              formatTick={(v) => formatPercent(v)}
              data={shrink.rows.map((row, i) => ({
                key: row.count.id,
                label: formatShortDate(row.count.occurred_at),
                value: row.rate,
                valueLabel: formatPercent(row.rate),
                highlight: i === shrink.rows.length - 1,
                detail: `merma ${formatQuantity(row.count.shortage, item.data?.base_unit)}`,
              }))}
            />
          )}
          <p className="muted small">
            Solo se incluyen conteos guardados.
            {shrink.review.map((count) => (
              <span key={count.id}>
                {' '}
                El conteo del {formatShortDate(count.occurred_at)} tuvo diferencia positiva (+
                {formatQuantity(count.difference, item.data?.base_unit)}) y quedó para revisión, por eso no suma merma.
              </span>
            ))}
          </p>
        </div>

        <div className="card">
          <h2>Ahorro por orden aprobada</h2>
          {m && <SavingsTable metrics={m} suggestions={suggestions.data ?? []} />}
          <p className="muted small">
            El ahorro se calcula solo con el precio del producto (IVA incluido, sin despacho), usando los precios
            vigentes al momento de generar cada sugerencia.
          </p>
        </div>
      </div>

      {m && <ItemsTable metrics={m} />}
    </section>
  )
}

function SavingsTable({ metrics: m, suggestions }: { metrics: Metrics; suggestions: Suggestion[] }) {
  const orders = useOrders()
  const { suppliers, products } = useAllProducts()
  const items = useItems()
  if (m.order_ids.length === 0) return <p className="muted">No hay órdenes aprobadas en el período.</p>

  const supplierName = (productId: number | null) => {
    const product = products.find((p: SupplierProduct) => p.id === productId)
    return suppliers.data?.find((s) => s.id === product?.supplier_id)?.name ?? '—'
  }
  const rows = m.order_ids.flatMap((orderId) => {
    const order = orders.data?.find((o: Order) => o.id === orderId)
    const suggestion = suggestions.find((s) => s.id === order?.suggestion_id)
    return order ? [{ order, suggestion }] : []
  })

  return (
    <div className="table-wrap">
      <table className="compact">
        <thead>
          <tr>
            <th>Orden</th>
            <th>Comprado a</th>
            <th>Siguiente opción vigente</th>
            <th className="num">Ahorro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ order, suggestion }) => {
            const unit = items.data?.find((i) => i.id === order.item_id)?.base_unit
            // El siguiente proveedor sale de la comparación congelada en la sugerencia.
            const options = suggestion ? (snapshotOf(suggestion).prices?.comparison.options ?? []) : []
            const recommended = options.find((o) => o.supplier_product_id === order.supplier_product_id)
            const nextBest = options.find((o) => o.supplier_id !== recommended?.supplier_id)
            const savings = suggestion?.savings_clp ?? null
            const percent = savings && suggestion?.next_best_total_clp ? (Number(savings) / Number(suggestion.next_best_total_clp)) * 100 : null
            return (
              <tr key={order.id}>
                <td>
                  <strong className="code-id">{order.code}</strong>
                  <br />
                  <small className="muted">
                    {formatShortDate(order.decided_at)} · {formatQuantity(order.purchased_qty, unit)}
                  </small>
                </td>
                <td>
                  {supplierName(order.supplier_product_id)}
                  <br />
                  <small className="muted mono">{formatCLP(order.total_clp)}</small>
                </td>
                <td className="muted">
                  {nextBest?.supplier ?? '—'}
                  <br />
                  <small className="mono">{formatCLP(suggestion?.next_best_total_clp)}</small>
                </td>
                <td className="num">
                  <strong className="mono">{formatCLP(savings)}</strong>
                  <br />
                  <small className="muted">{formatPercent(percent)}</small>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3}>Total acumulado</th>
            <td className="num mono accent">
              <strong>
                {m.estimated_savings_clp === null
                  ? 'No calculable'
                  : `${formatCLP(m.estimated_savings_clp)} · ${formatPercent(m.estimated_savings_percent)}`}
              </strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function ItemsTable({ metrics: m }: { metrics: Metrics }) {
  const items = useItems()
  const name = (id: number) => items.data?.find((i) => i.id === id)?.name ?? `#${id}`
  return (
    <div className="card section">
      <h2>Merma y quiebres por insumo</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Insumo</th>
              <th className="num">Merma</th>
              <th className="num">Tasa de merma</th>
              <th className="num">Quiebres de stock</th>
            </tr>
          </thead>
          <tbody>
            {m.items.map((row) => (
              <tr key={row.item_id}>
                <td>{name(row.item_id)}</td>
                <td className="num">{formatQuantity(row.shortage.shortage, row.base_unit)}</td>
                <td className="num">
                  {row.shortage.status === 'CALCULABLE' ? formatPercent(row.shortage.rate_percent) : 'No calculable'}
                </td>
                <td className="num">{row.stockout_count}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={3}>Quiebres en el período</th>
              <td className="num">
                <strong>{m.stockouts}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted small">
        Un quiebre es cuando el stock registrado pasa de positivo a cero. No incluye ventas perdidas ni demanda no
        registrada. La merma no se suma entre insumos con unidades distintas.
      </p>
    </div>
  )
}

interface ShrinkByCount {
  rows: { count: Count; rate: number }[]
  /** Conteos con diferencia positiva: quedan para revisión y no suman merma (C10). */
  review: Count[]
  average: number
  loading: boolean
  error: unknown
}

/**
 * Tasa de merma de cada conteo del período: la tasa P3 del backend (`/shortage-rate`) entre el conteo
 * anterior (excluido) y este (incluido). La merma promedio es el promedio de esas tasas.
 */
function useShrinkByCount(item: ItemState | undefined, start: string, end: string): ShrinkByCount {
  const counts = useCounts(item?.id ?? null)
  const ordered = [...(counts.data ?? [])].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))
  const inPeriod = ordered.filter((c) => Date.parse(c.occurred_at) >= Date.parse(start) && Date.parse(c.occurred_at) < Date.parse(end))
  const review = inPeriod.filter((c) => c.needs_review)
  const measured = inPeriod.filter((c) => !c.needs_review)
  const windows = measured.map((count) => {
    const previous = ordered.filter((c) => Date.parse(c.occurred_at) < Date.parse(count.occurred_at)).at(-1)
    const from = previous ? iso(Date.parse(previous.occurred_at) + 1) : (item?.observation_started_at ?? count.occurred_at)
    return { count, from, to: iso(Date.parse(count.occurred_at) + 1) }
  })
  const rates = useQueries({
    queries: windows.map((w) => ({ ...shortageRateQuery(item!.id, w.from, w.to), enabled: item !== undefined })),
  })
  const rows = windows.flatMap((w, i) => {
    const data = rates[i]?.data
    return data?.status === 'CALCULABLE' && data.rate_percent !== null ? [{ count: w.count, rate: Number(data.rate_percent) }] : []
  })
  return {
    rows,
    review,
    average: rows.length ? rows.reduce((sum, r) => sum + r.rate, 0) / rows.length : 0,
    loading: counts.isLoading || rates.some((r) => r.isLoading),
    error: counts.error ?? rates.find((r) => r.error)?.error ?? null,
  }
}

const iso = (ms: number) => new Date(ms).toISOString()
