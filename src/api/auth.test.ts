import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearSession, getAccessToken, getSessionSnapshot, saveSession } from '../auth/session'
import { handlers, resetMockData } from '../mocks/handlers'
import { api, API_URL, unwrap } from './client'

const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  resetMockData()
  clearSession()
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

async function login(email = 'admin@stocksmart.test') {
  saveSession(await unwrap(api.POST('/auth/login', { body: { email, password: 'stocksmart-demo' } })))
}

describe('autenticación HTTP', () => {
  it('rechaza la lectura sin sesión y envía Bearer después del login', async () => {
    await expect(unwrap(api.GET('/items'))).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    await login()
    expect((await unwrap(api.GET('/auth/me'))).role).toBe('ADMIN')
    expect((await unwrap(api.GET('/items'))).length).toBe(3)
  })

  it('no envía el token anterior al endpoint de login', async () => {
    await login()
    server.use(http.post(`${API_URL}/auth/login`, ({ request }) => {
      expect(request.headers.has('Authorization')).toBe(false)
      return HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials' } }, { status: 401 })
    }))
    await expect(login()).rejects.toMatchObject({ status: 401 })
    expect(getAccessToken()).toBe('mock-admin-token')
  })

  it('cierra la sesión cuando el servidor invalida el token', async () => {
    await login()
    server.use(http.get(`${API_URL}/items`, () =>
      HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Expired token' } }, { status: 401 })))
    await expect(unwrap(api.GET('/items'))).rejects.toMatchObject({ status: 401 })
    expect(getAccessToken()).toBeNull()
    expect(getSessionSnapshot().expired).toBe(true)
  })

  it('un 401 tardío de una sesión antigua conserva la nueva sesión', async () => {
    await login()
    server.use(http.get(`${API_URL}/items`, () => {
      saveSession({ access_token: 'new-session-token', token_type: 'bearer', expires_in: 1800 })
      return HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Old token' } }, { status: 401 })
    }))
    await expect(unwrap(api.GET('/items'))).rejects.toMatchObject({ status: 401 })
    expect(getAccessToken()).toBe('new-session-token')
  })

  it('traduce 403 y conserva la sesión de bodega', async () => {
    await login('bodega@stocksmart.test')
    expect((await unwrap(api.GET('/auth/me'))).role).toBe('WAREHOUSE')
    await expect(unwrap(api.POST('/items', {
      body: { name: 'No permitido', base_unit: 'kg', initial_quantity: '1', initial_unit: 'kg', timezone: 'America/Santiago' },
    }))).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'Tu cuenta no tiene permiso para realizar esta acción.' })
    expect(getAccessToken()).toBe('mock-warehouse-token')
    const movement = await unwrap(api.POST('/movements', { body: { item_id: 1, kind: 'ENTRY', quantity: '1', unit: 'kg' } }))
    expect(movement.created_by?.id).toBe(2)
  })

  it('traduce el límite de intentos del login sin guardar una sesión', async () => {
    server.use(http.post(`${API_URL}/auth/login`, () =>
      HttpResponse.json({ error: { code: 'LOGIN_THROTTLED', message: 'Try later' } }, { status: 429 })))
    await expect(login()).rejects.toMatchObject({ status: 429, code: 'LOGIN_THROTTLED', message: expect.stringContaining('15 minutos') })
    expect(getAccessToken()).toBeNull()
  })

  it('cierra sesión y deja de enviar el Bearer', async () => {
    await login()
    clearSession()
    await expect(unwrap(api.GET('/auth/me'))).rejects.toMatchObject({ status: 401 })
  })
})
