import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { ErrorMessage, Loading } from '../components/Feedback'
import { useAuth } from './useAuth'

export function SessionStatus() {
  const auth = useAuth()
  if (auth.isLoading) return <Loading />
  if (!auth.error) return null
  return (
    <div className="card form">
      <ErrorMessage error={auth.error} />
      <button onClick={auth.retry}>Reintentar conexión</button>
      <button className="link" onClick={auth.logout}>Volver al acceso</button>
    </div>
  )
}

export function RequireAuth() {
  const auth = useAuth()
  const location = useLocation()
  if (!auth.token) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />
  }
  if (auth.isLoading || auth.error) return <main className="content"><SessionStatus /></main>
  return auth.user ? <Outlet /> : null
}

export function RequireAdmin() {
  const { user } = useAuth()
  if (user?.role === 'ADMIN') return <Outlet />
  return (
    <section className="card form">
      <h1>Acceso restringido</h1>
      <p>La creación de insumos requiere una cuenta de administrador.</p>
      <Link to="/">Volver al panel</Link>
    </section>
  )
}
