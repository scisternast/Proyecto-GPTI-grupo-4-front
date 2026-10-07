import createClient, { type Middleware } from 'openapi-fetch'
import { ApiError } from './errors'
import type { paths } from './schema'
import type { ErrorBody } from './types'

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')

// Pendiente (REQ-14, C8): el backend aún no tiene login. Cuando exista, guarda el JWT aquí.
let accessToken: string | null = null
export function setAccessToken(token: string | null) {
  accessToken = token
}

const auth: Middleware = {
  onRequest({ request }) {
    if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`)
    return request
  },
}

/** Cliente tipado con el contrato OpenAPI del backend. */
// `fetch` se resuelve en cada llamada para que MSW pueda interceptarlo en los tests.
export const api = createClient<paths>({ baseUrl: API_URL, fetch: (request) => globalThis.fetch(request) })
api.use(auth)

type FetchResult<T> = { data?: T; error?: unknown; response: Response }

/** Devuelve `data` o lanza ApiError con el sobre de error del backend. */
export async function unwrap<T>(promise: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await promise
  if (error !== undefined || !response.ok) {
    throw new ApiError(response.status, error as ErrorBody | undefined)
  }
  return data as T
}

/**
 * Para rutas acordadas en Arquitectura.md §5.3 que todavía no están en el contrato OpenAPI.
 * Cuando el backend las publique, regenera los tipos y cámbialas a `api.GET/POST`.
 */
export async function requestPending<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (response.status === 404 || response.status === 405) {
    throw new ApiError(response.status, undefined, 'NOT_IMPLEMENTED')
  }
  const body = await response.json().catch(() => undefined)
  if (!response.ok) throw new ApiError(response.status, body as ErrorBody | undefined)
  return body as T
}
