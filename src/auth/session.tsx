import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { api, setAccessToken, setUnauthorizedHandler, unwrap } from '../api/client'
import { type Session, SessionContext } from './sessionContext'

const STORAGE_KEY = 'stocksmart.session'
const EXPIRED = 'Tu sesión venció. Vuelve a ingresar.'

// sessionStorage: la sesión vive solo en esta pestaña y se pierde al cerrarla.
function readStored(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const stored = raw ? (JSON.parse(raw) as Session) : null
    // Un token vencido no sirve: se descarta antes de llamar a la API.
    return stored && stored.expiresAt > Date.now() ? stored : null
  } catch {
    return null
  }
}

function store(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sin almacenamiento (modo privado): la sesión dura hasta recargar.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(() => {
    const stored = readStored()
    setAccessToken(stored?.token ?? null)
    return stored
  })

  function start(next: Session | null, message: string | null = null) {
    setAccessToken(next?.token ?? null)
    store(next)
    setSession(next)
    setNotice(message)
    // Otro usuario (o ninguno) no debe ver datos en caché del anterior.
    queryClient.clear()
  }

  // Un 401 de cualquier ruta (token vencido o revocado) cierra la sesión.
  useEffect(() => {
    setUnauthorizedHandler(() => start(null, EXPIRED))
  })

  // Cierra la sesión cuando vence el token, aunque no se haga ninguna petición.
  useEffect(() => {
    if (!session) return
    const timer = setTimeout(() => start(null, EXPIRED), session.expiresAt - Date.now())
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo depende de la sesión vigente
  }, [session])

  async function login(email: string, password: string) {
    const token = await unwrap(api.POST('/auth/login', { body: { email, password } }))
    setAccessToken(token.access_token)
    try {
      const user = await unwrap(api.GET('/auth/me'))
      start({ token: token.access_token, user, expiresAt: Date.now() + token.expires_in * 1000 })
    } catch (error) {
      setAccessToken(null)
      throw error
    }
  }

  return (
    <SessionContext.Provider value={{ session, notice, login, logout: () => start(null) }}>{children}</SessionContext.Provider>
  )
}
