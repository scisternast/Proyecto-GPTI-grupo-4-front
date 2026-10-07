import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section>
      <h1>Página no encontrada</h1>
      <Link to="/">Volver al panel</Link>
    </section>
  )
}
