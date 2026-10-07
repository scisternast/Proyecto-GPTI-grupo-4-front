import { NavLink, Outlet, useParams } from 'react-router'
import { useItem } from '../api/queries'
import { ErrorMessage, Loading, StatusBadge } from '../components/Feedback'
import { formatQuantity } from '../lib/format'
import { ALERT_STATUS } from '../lib/labels'

/** Encabezado y pestañas comunes a las vistas de un insumo. */
export function ItemLayout() {
  const itemId = Number(useParams().itemId)
  const item = useItem(itemId)

  if (item.isPending) return <Loading />
  if (item.error) return <ErrorMessage error={item.error} />

  const { data } = item
  return (
    <section>
      <div className="page-header">
        <h1>{data.name}</h1>
        <div className="stock-now">
          <span className="stock-value">{formatQuantity(data.current_stock, data.base_unit)}</span>
          <StatusBadge status={data.assessment.alert_status} label={ALERT_STATUS[data.assessment.alert_status]} />
        </div>
      </div>
      <nav className="tabs">
        <NavLink to="" end>
          Resumen
        </NavLink>
        <NavLink to="movimientos">Movimientos</NavLink>
        <NavLink to="conteos">Conteo y merma</NavLink>
      </nav>
      <Outlet context={data} />
    </section>
  )
}

