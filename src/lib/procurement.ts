import type { PriceState, ScrapeRun, ScrapeRunProductResult } from '../api/types'

/** Estado del precio de cada producto (`PriceOfferResponse.state`). */
export const PRICE_STATE: Record<PriceState, { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }> = {
  CURRENT: { label: 'Vigente', tone: 'ok' },
  EXPIRED: { label: 'Precio vencido', tone: 'danger' },
  MISSING: { label: 'Sin precio', tone: 'muted' },
  OUT_OF_STOCK: { label: 'Sin stock en el sitio', tone: 'warn' },
  INACTIVE: { label: 'Inactivo', tone: 'muted' },
  FUTURE_OBSERVATION: { label: 'Fecha futura', tone: 'warn' },
}

/** Códigos de falla del scraping (backend/scraper), en palabras del negocio. */
const SCRAPE_ERROR: Record<string, string> = {
  SCRAPE_CONFIG_REQUIRED: 'Falta configurar el producto para el scraping (SKU, marca y formato).',
  ROBOTS_DENIED: 'El sitio no permite la consulta automática (robots.txt).',
  ROBOTS_UNREADABLE: 'No se pudo leer el robots.txt del sitio.',
  ACCESS_BLOCKED: 'El sitio bloqueó la consulta.',
  RATE_LIMITED: 'El sitio limitó las consultas; se reintentará en la próxima corrida.',
  TIMEOUT: 'El sitio no respondió (tiempo de espera agotado).',
  NETWORK_ERROR: 'No se pudo conectar con el sitio.',
  HTTP_ERROR: 'El sitio respondió con un error.',
  REDIRECT_REJECTED: 'El sitio redirigió a una página no permitida.',
  PRODUCT_NOT_FOUND: 'No se encontró el producto en el sitio.',
  PRODUCT_MISMATCH: 'El producto del sitio no coincide con el configurado.',
  FORMAT_MISMATCH: 'El formato publicado no coincide con el configurado.',
  PRICE_MISSING: 'No se encontró el precio: la estructura del sitio cambió.',
  PRICE_AMBIGUOUS: 'El sitio muestra más de un precio posible.',
  PRICE_PARSE_ERROR: 'No se pudo leer el precio publicado.',
  INVALID_PRICE: 'El precio publicado no es válido.',
  INVALID_CURRENCY: 'El precio no está en pesos chilenos.',
  PARSING_ERROR: 'No se pudo leer la página del producto.',
  UNEXPECTED_FORMAT: 'La página tiene un formato inesperado.',
  AVAILABILITY_UNKNOWN: 'No se pudo saber si hay stock.',
  AVAILABILITY_CONFLICT: 'El sitio informa disponibilidad contradictoria.',
  QUOTE_CONFLICT: 'El precio contradice otro ya registrado a la misma hora.',
  CONFIGURATION_CHANGED: 'El producto cambió durante la consulta.',
  INVALID_SOURCE: 'La URL del producto no corresponde al proveedor.',
  SCRAPE_FAILED: 'Falló la consulta del precio.',
  UNEXPECTED_ERROR: 'Error inesperado al consultar el sitio.',
}

export function scrapeErrorMessage(code: string | undefined): string {
  return (code && SCRAPE_ERROR[code]) ?? `Falló la consulta (${code ?? 'sin código'}).`
}

/** Resultados por producto de una corrida; `null` si el mensaje es texto (corridas antiguas). */
export function runResults(run: ScrapeRun): ScrapeRunProductResult[] | null {
  if (!run.message) return []
  try {
    const parsed = JSON.parse(run.message) as { products?: ScrapeRunProductResult[] }
    return Array.isArray(parsed.products) ? parsed.products : null
  } catch {
    return null
  }
}

/** Resultado de la última corrida para un producto. */
export function lastResultFor(runs: ScrapeRun[], productId: number) {
  for (const run of runs) {
    const result = runResults(run)?.find((r) => r.supplier_product_id === productId)
    if (result) return { run, result }
  }
  return null
}

export const ADAPTERS = [
  { value: 'central', label: 'Central Mayorista' },
  { value: 'jumbo', label: 'Jumbo' },
  { value: 'santa_isabel', label: 'Santa Isabel' },
] as const
