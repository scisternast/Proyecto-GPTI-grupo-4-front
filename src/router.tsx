import { createBrowserRouter } from 'react-router'
import { RequireAuth, RequireRole } from './auth/guards'
import { Layout } from './components/Layout'
import { CountsPage } from './pages/CountsPage'
import { ItemsPage } from './pages/ItemsPage'
import { LoginPage } from './pages/LoginPage'
import { MetricsPage } from './pages/MetricsPage'
import { MovementsPage } from './pages/MovementsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OrdersPage } from './pages/OrdersPage'
import { PanelPage } from './pages/PanelPage'
import { PricesPage } from './pages/PricesPage'
import { SuppliersPage } from './pages/SuppliersPage'

const adminOnly = (element: React.ReactNode) => <RequireRole role="ADMIN">{element}</RequireRole>

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      // Administrador: todo. Encargado de bodega: Movimientos y Conteo y merma.
      { index: true, element: adminOnly(<PanelPage />) },
      { path: 'movimientos', element: <MovementsPage /> },
      { path: 'conteos', element: <CountsPage /> },
      { path: 'precios', element: adminOnly(<PricesPage />) },
      { path: 'ordenes', element: adminOnly(<OrdersPage />) },
      { path: 'metricas', element: adminOnly(<MetricsPage />) },
      { path: 'insumos', element: adminOnly(<ItemsPage />) },
      { path: 'proveedores', element: adminOnly(<SuppliersPage />) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
