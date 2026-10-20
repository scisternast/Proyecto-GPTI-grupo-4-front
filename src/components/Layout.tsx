import { NavLink, Outlet } from 'react-router'
import { useAlerts } from '../api/queries'
import { useSession, useUser } from '../auth/sessionContext'
import { BUSINESS_NAME } from '../lib/config'
import { ROLE_LABEL } from '../lib/labels'

interface NavItem {
  to: string
  label: string
  badge?: number
}

export function Layout() {
  const user = useUser()
  const { logout } = useSession()
  const isAdmin = user.role === 'ADMIN'
  // Badge de Órdenes de compra: insumos con alerta LOW_STOCK, que requieren pedir (GET /alerts).
  const alerts = useAlerts()

  const main: NavItem[] = isAdmin
    ? [
        { to: '/', label: 'Panel de stock' },
        { to: '/movimientos', label: 'Movimientos' },
        { to: '/conteos', label: 'Conteo y merma' },
        { to: '/precios', label: 'Precios' },
        { to: '/ordenes', label: 'Órdenes de compra', badge: alerts.data?.length },
        { to: '/metricas', label: 'Métricas' },
      ]
    : [
        { to: '/movimientos', label: 'Movimientos' },
        { to: '/conteos', label: 'Conteo y merma' },
      ]
  const config: NavItem[] = isAdmin
    ? [
        { to: '/insumos', label: 'Insumos' },
        { to: '/proveedores', label: 'Proveedores' },
      ]
    : []

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <strong>StockSmart</strong>
          <span>{BUSINESS_NAME}</span>
        </div>
        <nav>
          {main.map((item) => (
            <SideLink key={item.to} {...item} />
          ))}
          {config.length > 0 && <p className="nav-section">Configuración</p>}
          {config.map((item) => (
            <SideLink key={item.to} {...item} />
          ))}
        </nav>
        <div className="sidebar-footer">
          {import.meta.env.VITE_USE_MOCKS === 'true' && <p className="sidebar-note">Datos simulados</p>}
          <div className="user">
            <div>
              <strong>{user.name}</strong>
              <span>{ROLE_LABEL[user.role]}</span>
            </div>
            <button className="link" onClick={logout}>
              Salir
            </button>
          </div>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

function SideLink({ to, label, badge }: NavItem) {
  return (
    <NavLink to={to} end={to === '/'}>
      {label}
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </NavLink>
  )
}
