import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import type { Role } from '../api/types'
import { HOME_BY_ROLE } from './roles'
import { useSession } from './sessionContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { session } = useSession()
  if (session && session.user.role !== role) return <Navigate to={HOME_BY_ROLE[session.user.role]} replace />
  return children
}
