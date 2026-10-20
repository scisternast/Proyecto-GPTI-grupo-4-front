import { NavLink, Outlet } from 'react-router'
import { USE_MOCKS } from '../api/config'
import { useAlerts } from '../api/queries'
import { useAuth } from '../auth/useAuth'

export function Layout() {
  const { user, logout } = useAuth()
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
          {user?.role === 'ADMIN' && <NavLink to="/insumos/nuevo">Nuevo insumo</NavLink>}
        </nav>
        {USE_MOCKS && <span className="badge badge-muted">Datos simulados</span>}
        <div className="session-menu">
          <span>{user?.name} · {user?.role === 'ADMIN' ? 'Administrador' : 'Bodega'}</span>
          <button className="link" onClick={logout}>Cerrar sesión</button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
