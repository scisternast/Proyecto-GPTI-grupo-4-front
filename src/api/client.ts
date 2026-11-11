import createClient, { type Middleware } from 'openapi-fetch'
import { ApiError } from './errors'
import type { paths } from './schema'
import type { ErrorBody } from './types'

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')

// Token JWT de la sesión (POST /auth/login). Todas las rutas, salvo el login, lo exigen.
let accessToken: string | null = null
export function setAccessToken(token: string | null) {
  accessToken = token
}

export interface CsvResult { imported: number; movement_ids: number[]; replayed: boolean }
export interface CsvRowError { row: number; code: string; message: string }

export class CsvImportError extends Error {
  readonly details: CsvRowError[]
  constructor(message: string, details: CsvRowError[] = []) { super(message); this.details = details }
}

/** Send the original bytes so the server validates encoding, size and every row. */
export async function importCsv(file: File): Promise<CsvResult> {
  if (file.size > 1_048_576) throw new CsvImportError('El archivo supera el máximo de 1 MiB.')
  const response = await globalThis.fetch(`${API_URL}/movements/import-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: file,
  })
  if (response.status === 401) onUnauthorized()
  const body = await response.json()
  if (!response.ok) {
    if (body.error?.code === 'CSV_REJECTED') throw new CsvImportError(body.error.message, body.error.details)
    throw new ApiError(response.status, body)
  }
  return body as CsvResult
}

// Lo registra la sesión: un 401 fuera del login significa token vencido o inválido.
let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

const auth: Middleware = {
  onRequest({ request }) {
    if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`)
    return request
  },
  onResponse({ request, response }) {
    if (response.status === 401 && !new URL(request.url).pathname.endsWith('/auth/login')) onUnauthorized()
    return response
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
