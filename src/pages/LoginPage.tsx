import { useState } from 'react'
import { Navigate } from 'react-router'
import { HOME_BY_ROLE } from '../auth/roles'
import { useSession } from '../auth/sessionContext'
import { ErrorMessage } from '../components/Feedback'
import { BUSINESS_NAME, USE_MOCKS } from '../lib/config'

export function LoginPage() {
  const { session, notice, login } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to={HOME_BY_ROLE[session.user.role]} replace />

  return (
    <div className="login">
      <section className="login-hero">
        <div className="brand">
          <strong>StockSmart</strong>
          <span>{BUSINESS_NAME}</span>
        </div>
        <div>
          <h1>Reponer a tiempo, comprar al mejor precio.</h1>
          <p>Control de stock, alertas de reposición y comparación automática de precios de proveedores.</p>
        </div>
        <span />
      </section>

      <section className="login-form">
        <form
          className="form"
          onSubmit={async (event) => {
            event.preventDefault()
            setSubmitting(true)
            setError(null)
            try {
              await login(email.trim(), password)
            } catch (caught) {
              setError(caught)
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <h1>Iniciar sesión</h1>
          <p className="muted">Ingresa con la cuenta que te asignó el administrador del negocio.</p>
          <label>
            Correo electrónico
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="usuario@negocio.cl"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {notice && error === null && <p className="notice">{notice}</p>}
          {error !== null && <ErrorMessage error={error} />}
          <button type="submit" className="block" disabled={submitting}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
          <p className="muted small">
            Las funciones dependen de tu rol: el Administrador(a) aprueba órdenes y configura el sistema; el
            Encargado(a) de bodega registra movimientos y conteos.
          </p>
          {USE_MOCKS && (
            <p className="notice small">
              Datos simulados: <code>admin@negocio.cl</code> o <code>bodega@negocio.cl</code>, contraseña{' '}
              <code>stocksmart-demo</code>.
            </p>
          )}
        </form>
      </section>
    </div>
  )
}
