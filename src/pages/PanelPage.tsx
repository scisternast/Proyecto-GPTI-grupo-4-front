import { Link } from 'react-router'
import type { ItemState } from '../api/types'
import { useCounts, useItem, useMovements } from '../api/queries'
import { ErrorMessage, Loading, PageHeader } from '../components/Feedback'
import { ItemSelect } from '../components/ItemSelect'
import { StockChart } from '../components/StockChart'
import { dayKey, formatDateTime, formatQuantity, formatShortDate, formatSigned, todayKey } from '../lib/format'
import { buildLedger, nextDay } from '../lib/ledger'
import { CONSUMPTION_STATUS, DEPLETION_STATUS, MOVEMENT_KIND } from '../lib/labels'
import { useSelectedItem } from '../state/useSelectedItem'

// El panel solo muestra lo que calcula el backend (`assessment`, `consumption`): la regla de alerta
// y la cantidad sugerida no se duplican aquí (Arquitectura.md §4.3).
export function PanelPage() {
  const { id } = useSelectedItem()
  const item = useItem(id)
  const movements = useMovements(id)
  const counts = useCounts(id)

  return (
    <section>
      <ItemSelect />
      <PageHeader
        title="Panel de stock"
        actions={
          <Link className="button" to="/movimientos">
            Registrar movimiento
          </Link>
        }
      />
      {id === null && <p className="muted">Elige un insumo o créalo en Configuración → Insumos.</p>}
      {item.isPending && id !== null && <Loading />}
      {item.error && <ErrorMessage error={item.error} />}
      {item.data && (
        <>
          <AlertBanner item={item.data} />
          <Kpis item={item.data} />
          <div className="panel-grid">
            <div className="card">
              <h2>Proyección de stock</h2>
              {movements.data ? (
                <StockChart item={item.data} ledger={buildLedger(movements.data, counts.data)} />
              ) : (
                <Loading />
              )}
            </div>
            <div className="card">
              <div className="card-header">
                <h2>Últimos movimientos</h2>
                <Link to="/movimientos">Ver historial</Link>
              </div>
              {movements.error && <ErrorMessage error={movements.error} />}
              <ul className="list">
                {movements.data &&
                  buildLedger(movements.data, counts.data)
                    .slice(0, 5)
                    .map((row) => (
                      <li key={row.id}>
                        <div>
                          <strong>{MOVEMENT_KIND[row.kind] ?? row.kind}</strong>
                          <span className="muted">
                            {formatShortDate(row.occurred_at)}
                            {row.created_by && ` · ${row.created_by.name}`}
                          </span>
                        </div>
                        <span className="num">{formatSigned(row.delta, item.data.base_unit)}</span>
                      </li>
                    ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function AlertBanner({ item }: { item: ItemState }) {
  const a = item.assessment
  const unit = item.base_unit
  if (a.alert_status === 'IN_TRANSIT') {
    return (
      <div className="banner banner-info">
        <div>
          <strong>Reposición en camino</strong>
          <p>
            Hay {formatQuantity(a.in_transit_quantity, unit)} en una orden aprobada que aún no se recibe. La alerta
            queda atendida.
          </p>
        </div>
        <Link className="button secondary" to="/ordenes">
          Ver órdenes
        </Link>
      </div>
    )
  }
  if (a.alert_status === 'INSUFFICIENT_HISTORY') {
    return (
      <div className="banner">
        <p>
          Todavía no hay un día completo de historia: aún no se puede calcular el consumo ni la alerta
          {a.safe_stock === null && ' (a menos que fijes un stock seguro manual en Insumos)'}.
        </p>
      </div>
    )
  }
  if (a.alert_status !== 'LOW_STOCK') return null

  const lead = a.lead_time_days
  const overdue = a.order_by_at !== null && dayKey(a.order_by_at) < todayKey()
  return (
    <div className="banner banner-warn" role="alert">
      <span className="banner-icon" aria-hidden>
        ⚠
      </span>
      <div>
        <strong>{overdue ? `Pedido atrasado desde el ${formatShortDate(a.order_by_at)}: pide hoy` : 'Pide hoy para reponer a tiempo'}</strong>
        <p>
          {lead != null && a.projected_stock_at_arrival != null ? (
            <>
              Con el mayor tiempo de entrega de tus proveedores ({lead} {lead === 1 ? 'día' : 'días'}), un pedido hecho
              hoy llega el {formatShortDate(`${nextDay(todayKey(), lead)}T12:00:00Z`)},{' '}
              {Number(a.projected_stock_at_arrival) > 0 ? (
                <>
                  cuando el stock proyectado será de {formatQuantity(a.projected_stock_at_arrival, unit)} (stock seguro:{' '}
                  {formatQuantity(a.safe_stock, unit)}).
                </>
              ) : (
                // El backend puede proyectar un stock negativo: el insumo se acaba antes de que llegue el pedido.
                <>
                  pero el stock se agotaría antes
                  {Number(a.projected_stock_at_arrival) < 0 &&
                    ` (faltarían ${formatQuantity(-Number(a.projected_stock_at_arrival), unit)})`}
                  .
                </>
              )}
            </>
          ) : (
            <>El stock está en o bajo el stock seguro ({formatQuantity(a.safe_stock, unit)}).</>
          )}
          {a.depletion_at && ` Sin reposición, el quiebre ocurriría el ${formatShortDate(a.depletion_at)}.`}
        </p>
      </div>
      <div className="actions">
        <Link className="button secondary" to="/precios">
          Comparar precios
        </Link>
        <Link className="button warn" to="/ordenes">
          Ver orden sugerida
        </Link>
      </div>
    </div>
  )
}

function Kpis({ item }: { item: ItemState }) {
  const a = item.assessment
  const c = item.consumption
  const unit = item.base_unit
  // `order_by_at` en el pasado = pedido atrasado.
  const orderDay = a.order_by_at ? dayKey(a.order_by_at) : null
  const orderBy = orderDay === null ? '—' : orderDay < todayKey() ? 'Atrasado' : orderDay === todayKey() ? 'Hoy' : formatShortDate(a.order_by_at)
  const remaining = a.remaining_days === null ? null : Math.floor(Number(a.remaining_days))

  return (
    <div className="kpis">
      <div className="card kpi">
        <span>Stock actual</span>
        <strong>{formatQuantity(item.current_stock, unit)}</strong>
        <small>Actualizado {formatDateTime(item.updated_at)}</small>
      </div>
      <div className="card kpi">
        <span>Consumo promedio semanal</span>
        <strong>{formatQuantity(c.weekly_average, unit)}</strong>
        <small>
          {CONSUMPTION_STATUS[c.status]} · {c.complete_days} días completos
        </small>
      </div>
      <div className={`card kpi${a.depletion_status === 'PROJECTED' ? ' kpi-warn' : ''}`}>
        <span>Quiebre proyectado</span>
        <strong>{a.depletion_status === 'PROJECTED' ? formatShortDate(a.depletion_at) : '—'}</strong>
        <small>
          {a.depletion_status === 'PROJECTED' && remaining !== null
            ? `En ${remaining} ${remaining === 1 ? 'día' : 'días'}`
            : DEPLETION_STATUS[a.depletion_status]}
        </small>
      </div>
      <div className={`card kpi${orderBy === 'Atrasado' ? ' kpi-warn' : ''}`}>
        <span>Pedir a más tardar</span>
        <strong>{orderBy}</strong>
        <small>
          {orderBy === 'Atrasado' && `Desde el ${formatShortDate(a.order_by_at)} · `}
          Stock seguro {formatQuantity(a.safe_stock, unit)}
          {a.lead_time_days != null ? ` · entrega máx. ${a.lead_time_days} días` : ' · sin proveedores'}
        </small>
      </div>
    </div>
  )
}
