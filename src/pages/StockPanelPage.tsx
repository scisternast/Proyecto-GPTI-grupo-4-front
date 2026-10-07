import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../api/errors'
import { useAlerts, useItems } from '../api/queries'
import { ErrorMessage, Loading, StatusBadge } from '../components/Feedback'
import { formatQuantity } from '../lib/format'
import { ALERT_STATUS } from '../lib/labels'

export function StockPanelPage() {
  const items = useItems()
  const listMissing = items.error instanceof ApiError && items.error.code === 'NOT_IMPLEMENTED'

  return (
    <section>
      <div className="page-header">
        <h1>Panel de stock</h1>
        <Link className="button" to="/insumos/nuevo">
          Nuevo insumo
        </Link>
      </div>

      <ActiveAlerts />

      <h2>Insumos</h2>
      {items.isPending && <Loading />}
      {listMissing && (
        <div className="notice">
          <p>
            El backend todavía no expone <code>GET /items</code> (Arquitectura.md §5.3), así que no se puede listar
            los insumos. Mientras tanto, abre uno por su ID o usa <code>npm run dev:mock</code>.
          </p>
          <OpenById />
        </div>
      )}
      {items.error && !listMissing && <ErrorMessage error={items.error} />}
      {items.data && items.data.length === 0 && <p className="muted">Aún no hay insumos registrados.</p>}
      {items.data && items.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Insumo</th>
              <th className="num">Stock actual</th>
              <th className="num">Stock seguro</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.data.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link to={`/insumos/${item.id}`}>{item.name}</Link>
                </td>
                <td className="num">{formatQuantity(item.current_stock, item.base_unit)}</td>
                <td className="num">{formatQuantity(item.assessment.safe_stock, item.base_unit)}</td>
                <td>
                  <StatusBadge
                    status={item.assessment.alert_status}
                    label={ALERT_STATUS[item.assessment.alert_status]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function ActiveAlerts() {
  const alerts = useAlerts()
  if (alerts.isPending) return null
  if (alerts.error) return <ErrorMessage error={alerts.error} />
  if (alerts.data.length === 0) return null

  return (
    <div className="notice notice-danger">
      <strong>Insumos con stock bajo:</strong>
      <ul>
        {alerts.data.map((alert) => (
          <li key={alert.item_id}>
            <Link to={`/insumos/${alert.item_id}`}>Insumo #{alert.item_id}</Link>: {formatQuantity(alert.current_stock)}{' '}
            (stock seguro {formatQuantity(alert.safe_stock)})
          </li>
        ))}
      </ul>
    </div>
  )
}

function OpenById() {
  const [id, setId] = useState('')
  const navigate = useNavigate()
  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (id) navigate(`/insumos/${id}`)
      }}
    >
      <label>
        ID del insumo
        <input type="number" min={1} value={id} onChange={(event) => setId(event.target.value)} />
      </label>
      <button type="submit">Abrir</button>
    </form>
  )
}
