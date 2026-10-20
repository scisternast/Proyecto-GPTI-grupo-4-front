import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
const storageKey = 'stocksmart.session:http://mock.api'

beforeEach(() => {
  vi.resetModules()
  storage.clear()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('sesión de la pestaña', () => {
  it('restaura una sesión vigente al recargar sin persistir la contraseña', async () => {
    const session = await import('./session')
    session.saveSession({ access_token: 'test-token', token_type: 'bearer', expires_in: 1800 })
    expect(JSON.parse(storage.get(storageKey)!)).toEqual({ token: 'test-token', expiresAt: expect.any(Number) })
    vi.resetModules()
    expect((await import('./session')).getAccessToken()).toBe('test-token')
  })

  it('elimina una sesión vencida al recargar', async () => {
    storage.set(storageKey, JSON.stringify({ token: 'old-token', expiresAt: Date.now() - 1 }))
    const session = await import('./session')
    expect(session.getSessionSnapshot()).toEqual({ token: null, expiresAt: null, expired: true })
    expect(storage.has(storageKey)).toBe(false)
  })

  it('deja de entregar el token al cumplirse expires_in', async () => {
    vi.useFakeTimers()
    const session = await import('./session')
    session.saveSession({ access_token: 'short-token', token_type: 'bearer', expires_in: 1 })
    vi.advanceTimersByTime(1000)
    expect(session.getAccessToken()).toBeNull()
    expect(session.getSessionSnapshot().expired).toBe(true)
  })

  it('descarta almacenamiento mal formado', async () => {
    storage.set(storageKey, '{broken')
    expect((await import('./session')).getAccessToken()).toBeNull()
  })

  it('permite entrar y salir si el navegador bloquea el almacenamiento', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('Blocked') },
      setItem: () => { throw new Error('Blocked') },
      removeItem: () => { throw new Error('Blocked') },
    })
    const session = await import('./session')
    session.saveSession({ access_token: 'memory-token', token_type: 'bearer', expires_in: 1800 })
    expect(session.getAccessToken()).toBe('memory-token')
    session.clearSession()
    expect(session.getAccessToken()).toBeNull()
  })
})
