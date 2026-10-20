import { createBrowserRouter } from 'react-router'
import { RequireAdmin, RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { CountsPage } from './pages/CountsPage'
import { ItemLayout } from './pages/ItemLayout'
import { ItemSummaryPage } from './pages/ItemSummaryPage'
import { LoginPage } from './pages/LoginPage'
import { MovementsPage } from './pages/MovementsPage'
import { NewItemPage } from './pages/NewItemPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { StockPanelPage } from './pages/StockPanelPage'

export const router = createBrowserRouter([
  { path: 'login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <StockPanelPage /> },
          { element: <RequireAdmin />, children: [{ path: 'insumos/nuevo', element: <NewItemPage /> }] },
          {
            path: 'insumos/:itemId',
            element: <ItemLayout />,
            children: [
              { index: true, element: <ItemSummaryPage /> },
              { path: 'movimientos', element: <MovementsPage /> },
              { path: 'conteos', element: <CountsPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
