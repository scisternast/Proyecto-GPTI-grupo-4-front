import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsvImportError, importCsv, setAccessToken, setUnauthorizedHandler } from './client'

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); setUnauthorizedHandler(() => {}) })
describe('CSV API', () => {
  it('envía los bytes originales y JWT y conserva el resultado de idempotencia', async () => {
    setAccessToken('test-token')
    const result = { imported: 3, movement_ids: [1, 2, 3], replayed: false }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)))
    vi.stubGlobal('fetch', fetch)
    const file = new File(['insumo,cantidad'], 'entrada.csv')
    expect(await importCsv(file)).toEqual(result)
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: file,
      headers: { 'Content-Type': 'text/csv', Authorization: 'Bearer test-token' } })
  })
  it('conserva todos los errores por fila', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
      code: 'CSV_REJECTED', message: 'No se registró ningún movimiento', details: [
        { row: 2, code: 'ITEM_NOT_FOUND', message: 'no existe' },
        { row: 3, code: 'NEGATIVE_STOCK', message: 'stock negativo' },
      ],
    } }), { status: 422 })))
    await expect(importCsv(new File(['x'], 'x.csv'))).rejects.toMatchObject({ details: [
      { row: 2, code: 'ITEM_NOT_FOUND' }, { row: 3, code: 'NEGATIVE_STOCK' },
    ] })
  })
  it('limita el tamaño antes de enviar y conserva la expiración de sesión', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
      code: 'UNAUTHENTICATED', message: 'Token requerido',
    } }), { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    await expect(importCsv(new File([new Uint8Array(1_048_577)], 'grande.csv'))).rejects.toBeInstanceOf(CsvImportError)
    expect(fetch).not.toHaveBeenCalled()
    const expired = vi.fn(); setUnauthorizedHandler(expired)
    await expect(importCsv(new File(['x'], 'x.csv'))).rejects.toMatchObject({ status: 401 })
    expect(expired).toHaveBeenCalledOnce()
  })
})
