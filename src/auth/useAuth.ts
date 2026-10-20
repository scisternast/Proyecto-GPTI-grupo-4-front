import { createContext, useContext } from 'react'
import type { LoginCreate, User } from '../api/types'

type Auth = {
  token: string | null
  user: User | undefined
  isLoading: boolean
  error: Error | null
  expired: boolean
  login: (body: LoginCreate) => Promise<void>
  logout: () => void
  retry: () => void
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth requiere AuthProvider')
  return auth
}
