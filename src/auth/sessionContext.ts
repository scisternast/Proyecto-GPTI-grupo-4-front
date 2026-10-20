import { createContext, useContext } from 'react'
import type { User } from '../api/types'

export interface Session {
  token: string
  user: User
  /** Vencimiento del token (ms desde epoch), según `expires_in` del login. */
  expiresAt: number
}

export interface SessionContextValue {
  session: Session | null
  /** Aviso para mostrar en el login (p. ej., «Tu sesión venció»). */
  notice: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession debe usarse dentro de SessionProvider')
  return value
}

/** Usuario con sesión iniciada; solo para componentes bajo <RequireAuth>. */
export function useUser(): User {
  const { session } = useSession()
  if (!session) throw new Error('No hay sesión iniciada')
  return session.user
}
