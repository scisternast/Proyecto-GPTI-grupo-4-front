import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { USE_MOCKS } from '../api/config'
import { useAuth } from '../auth/useAuth'
import { SessionStatus } from '../auth/RequireAuth'
import { ErrorMessage } from '../components/Feedback'

export function LoginPage() {
  const auth = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({ mutationFn: auth.login })
  const from: unknown = location.state?.from
  const destination = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') &&
    from.split(/[?#]/)[0] !== '/login' ? from : '/'

  if (auth.token) {
    if (auth.user && !auth.error) return <Navigate to={destination} replace />
    return <main className="content login"><SessionStatus /></main>
  }

  return (
    <main className="content login">
      <form className="card form" onSubmit={(event) => {
        event.preventDefault()
        login.mutate({ email: email.trim(), password }, { onSuccess: () => setPassword('') })
      }}>
        <span className="brand">StockSmart</span>
        <h1>Iniciar sesión</h1>
        <p className="muted">Ingresa con tu cuenta para consultar y registrar el inventario.</p>
        {USE_MOCKS && <p className="notice">Datos simulados · usa una cuenta de demostración del README.</p>}
        {auth.expired && <p className="notice" role="status">Tu sesión venció. Vuelve a iniciar sesión.</p>}
        <label>
          Correo
          <input type="email" autoComplete="username" required maxLength={254}
            value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" required
            value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {login.error && <ErrorMessage error={login.error} />}
        <button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  )
}
