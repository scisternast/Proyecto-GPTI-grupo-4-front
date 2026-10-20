import { API_URL } from '../api/config'
import type { TokenResponse } from '../api/types'

type Session = { token: string | null; expiresAt: number | null; expired: boolean }
const storageKey = `stocksmart.session:${API_URL}`
const listeners = new Set<() => void>()

function restoreSession(): Session {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (raw) {
      const saved: unknown = JSON.parse(raw)
      if (saved && typeof saved === 'object' && 'token' in saved && 'expiresAt' in saved &&
          typeof saved.token === 'string' && saved.token.length > 0 &&
          typeof saved.expiresAt === 'number' && Number.isFinite(saved.expiresAt)) {
        if (saved.expiresAt > Date.now()) return { token: saved.token, expiresAt: saved.expiresAt, expired: false }
        sessionStorage.removeItem(storageKey)
        return { token: null, expiresAt: null, expired: true }
      }
      sessionStorage.removeItem(storageKey)
    }
  } catch {
    // Si el navegador bloquea el almacenamiento, la sesión funciona en memoria.
  }
  return { token: null, expiresAt: null, expired: false }
}

let session = restoreSession()

export function getSessionSnapshot() {
  return session
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function saveSession(result: TokenResponse) {
  session = { token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000, expired: false }
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ token: session.token, expiresAt: session.expiresAt }))
  } catch { /* Se conserva la sesión en memoria. */ }
  listeners.forEach((listener) => listener())
}

export function clearSession(expired = false) {
  session = { token: null, expiresAt: null, expired }
  try { sessionStorage.removeItem(storageKey) } catch { /* Almacenamiento bloqueado. */ }
  listeners.forEach((listener) => listener())
}

export function getAccessToken() {
  if (session.expiresAt !== null && session.expiresAt <= Date.now()) clearSession(true)
  return session.token
}

/** Un 401 tardío de una sesión anterior no debe cerrar una sesión nueva. */
export function invalidateSession(token: string) {
  if (token && token === session.token) clearSession(true)
}
