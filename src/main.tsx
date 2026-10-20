import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ApiError } from './api/errors'
import { SessionProvider } from './auth/session'
import { USE_MOCKS } from './lib/config'
import { router } from './router'
import { SelectedItemProvider } from './state/selectedItem'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Un 4xx (404, 403, 422…) no cambia al reintentar; solo se reintentan fallas de red o del servidor.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
})

async function enableMocks() {
  if (!USE_MOCKS) return
  const { worker } = await import('./mocks/browser')
  await worker.start({ onUnhandledFrame: 'bypass' })
}

enableMocks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SelectedItemProvider>
            <RouterProvider router={router} />
          </SelectedItemProvider>
        </SessionProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
})
