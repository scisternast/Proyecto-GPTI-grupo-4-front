import { NavLink, Outlet } from 'react-router'
import { useAlerts } from '../api/queries'

export function Layout() {
  const alerts = useAlerts()
  const alertCount = alerts.data?.length ?? 0

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">StockSmart</span>
        <nav>
          <NavLink to="/" end>
            Panel de stock
            {alertCount > 0 && (
              <span className="badge badge-danger" title="Insumos con stock bajo">
                {alertCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/insumos/nuevo">Nuevo insumo</NavLink>
        </nav>
        {import.meta.env.VITE_USE_MOCKS === 'true' && <span className="badge badge-muted">Datos simulados</span>}
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
