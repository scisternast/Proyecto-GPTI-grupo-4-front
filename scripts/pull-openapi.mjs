// Descarga el contrato OpenAPI desde el backend en ejecución y lo guarda en openapi/openapi.json.
// Uso: npm run api:pull  (usa VITE_API_URL o http://127.0.0.1:8000)
import { writeFile } from 'node:fs/promises'

const baseUrl = (process.env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')
const url = `${baseUrl}/openapi.json`

const response = await fetch(url, { signal: AbortSignal.timeout(120_000) }).catch((error) => {
  console.error(`No se pudo conectar a ${url}. ¿Está corriendo el backend?\n${error.message}`)
  process.exit(1)
})
if (!response.ok) {
  console.error(`${url} respondió ${response.status}`)
  process.exit(1)
}
const spec = await response.json()
await writeFile('openapi/openapi.json', `${JSON.stringify(spec, null, 2)}\n`)
console.log(`Contrato actualizado desde ${url}`)
