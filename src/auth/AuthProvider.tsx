import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { api, unwrap } from '../api/client'
import type { LoginCreate } from '../api/types'
import { clearSession, getSessionSnapshot, invalidateSession, saveSession, subscribeSession } from './session'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot)
  const queryClient = useQueryClient()
  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: ({ signal }) => unwrap(api.GET('/auth/me', { signal })),
    enabled: session.token !== null,
    retry: false,
  })

  useEffect(() => {
    if (!session.token || session.expiresAt === null) {
      void queryClient.cancelQueries()
      queryClient.clear()
      return
    }
    const token = session.token
    const timer = setTimeout(() => invalidateSession(token), Math.max(0, session.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [session.token, session.expiresAt, queryClient])

  async function login(body: LoginCreate) {
    const result = await unwrap(api.POST('/auth/login', { body }))
    await queryClient.cancelQueries()
    queryClient.clear()
    saveSession(result)
  }

  function logout() {
    clearSession()
    void queryClient.cancelQueries()
    queryClient.clear()
  }

  return (
    <AuthContext.Provider value={{
      token: session.token,
      user: session.token ? me.data : undefined,
      isLoading: session.token !== null && me.isPending,
      error: session.token ? me.error : null,
      expired: session.expired,
      login,
      logout,
      retry: () => { void me.refetch() },
    }}>
      {children}
    </AuthContext.Provider>
  )
}
