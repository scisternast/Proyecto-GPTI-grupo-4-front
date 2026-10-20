import createClient, { type Middleware } from 'openapi-fetch'
import { getAccessToken, invalidateSession } from '../auth/session'
import { API_URL } from './config'
import { ApiError } from './errors'
import type { paths } from './schema'
import type { ErrorBody } from './types'

export { API_URL } from './config'

const auth: Middleware = {
  onRequest({ request, schemaPath }) {
    if (schemaPath === '/auth/login') return request
    const accessToken = getAccessToken()
    if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`)
    return request
  },
  onResponse({ request, response, schemaPath }) {
    if (response.status === 401 && schemaPath !== '/auth/login') {
      invalidateSession(request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '')
    }
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
