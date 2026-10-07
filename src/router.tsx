import { createBrowserRouter } from 'react-router'
import { Layout } from './components/Layout'
import { CountsPage } from './pages/CountsPage'
import { ItemLayout } from './pages/ItemLayout'
import { ItemSummaryPage } from './pages/ItemSummaryPage'
import { MovementsPage } from './pages/MovementsPage'
import { NewItemPage } from './pages/NewItemPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { StockPanelPage } from './pages/StockPanelPage'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <StockPanelPage /> },
      { path: 'insumos/nuevo', element: <NewItemPage /> },
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
])
