import type { ErrorBody } from './types'

// El backend responde los errores en inglés; el frontend los traduce por `code`.
const MESSAGES: Record<string, string> = {
  ALREADY_CORRECTED: 'Este movimiento ya fue reversado o corregido.',
  AMOUNT_OUT_OF_RANGE: 'La cantidad es demasiado grande.',
  AMOUNT_PRECISION: 'La cantidad admite como máximo seis decimales en la unidad base.',
  BEFORE_INITIAL_STOCK: 'La fecha no puede ser anterior al stock inicial del insumo.',
  CORRECTION_NOTE_REQUIRED: 'La corrección necesita una nota que la explique.',
  EMPTY_UPDATE: 'No hay cambios que guardar.',
  FUTURE_MOVEMENT: 'La fecha no puede estar en el futuro.',
  HISTORICAL_NEGATIVE_STOCK: 'Con ese cambio el stock habría quedado negativo en algún momento del historial.',
  HISTORICAL_RECONCILIATION_CONFLICT:
    'El cambio altera un periodo ya cerrado por un conteo físico. Registra una corrección en su lugar.',
  INITIAL_STOCK_ALREADY_EXISTS: 'El insumo ya tiene stock inicial. Reversa el anterior primero.',
  INITIAL_STOCK_HAS_DEPENDENT_MOVEMENTS: 'No se puede reemplazar el stock inicial porque tiene movimientos posteriores.',
  INITIAL_STOCK_REQUIRED: 'El insumo no tiene stock inicial activo.',
  INVALID_AMOUNT: 'La cantidad no es válida.',
  INVALID_CORRECTION_TARGET: 'Ese movimiento no se puede corregir.',
  INVALID_MOVEMENT_KIND: 'Tipo de movimiento no válido.',
  INVALID_NAME: 'El nombre no es válido.',
  INVALID_PERIOD: 'El periodo no es válido: el inicio debe ser anterior al término.',
  INVALID_REVERSAL_TIME: 'La fecha de la reversa no es válida.',
  INVALID_TIMESTAMP: 'La fecha de la operación no es válida. Revisa la fecha o intenta de nuevo en unos segundos.',
  INVALID_TIMEZONE: 'Zona horaria no reconocida.',
  INVALID_UNIT: 'La unidad no corresponde a la unidad base del insumo.',
  ITEM_NOT_FOUND: 'El insumo no existe.',
  MOVEMENT_NOT_FOUND: 'El movimiento no existe.',
  NEGATIVE_STOCK: 'No hay stock suficiente para esa salida.',
  PHYSICAL_COUNT_REQUIRED: 'Se necesita un conteo físico para continuar.',
  STOCK_LEDGER_MISMATCH: 'El saldo no coincide con el historial. Avisa al equipo de backend.',
  // Autenticación
  UNAUTHENTICATED: 'Correo o contraseña incorrectos, o la sesión venció.',
  LOGIN_THROTTLED: 'Demasiados intentos fallidos. Espera 15 minutos y vuelve a intentar.',
  FORBIDDEN: 'Tu rol no permite esta acción.',
  // Sugerencias y decisiones
  SUGGESTION_NOT_FOUND: 'La sugerencia no existe.',
  ORDER_IN_TRANSIT: 'El insumo ya tiene una orden en tránsito: regístrala como recibida antes de pedir otra.',
  INSUFFICIENT_HISTORY: 'Aún no hay consumo calculable para este insumo.',
  NO_PURCHASE_REQUIRED: 'No hace falta reponer: la cantidad sugerida es 0.',
  INSUFFICIENT_CURRENT_PRICES: 'Se necesitan precios vigentes de al menos 2 proveedores distintos.',
  OUT_OF_RANGE: 'La cantidad de formatos está fuera de rango.',
  REJECTION_REASON_REQUIRED: 'Indica el motivo del rechazo.',
  INVALID_DECISION: 'Decisión no válida.',
  DECISION_CONFLICT: 'La sugerencia ya fue decidida por otra persona.',
  INVALID_LEAD_TIME: 'La fecha de entrega quedaría fuera de rango.',
  STALE_SUGGESTION: 'El inventario cambió desde que se generó la sugerencia: genera una nueva.',
  STALE_PRICES: 'Los precios cambiaron o vencieron desde que se generó la sugerencia: genera una nueva.',
  STALE_FORMAT: 'Cambió el mínimo de compra del producto: genera una nueva sugerencia.',
  // Generales
  DATABASE_UNAVAILABLE: 'La base de datos no está disponible en este momento. Intenta de nuevo en unos minutos.',
  HTTP_404: 'La ruta no existe en el backend.',
  // Proveedores, productos, precios y órdenes (integración 2)
  SUPPLIER_EXISTS: 'Ya existe un proveedor con ese nombre.',
  SUPPLIER_NOT_FOUND: 'El proveedor no existe.',
  ADAPTER_IN_USE: 'Ese adaptador ya está asignado a otro proveedor.',
  ADAPTER_REQUIRED: 'El proveedor necesita un adaptador de scraping para esta acción.',
  PRODUCT_EXISTS: 'Ese producto ya está registrado para este proveedor.',
  PRODUCT_NOT_FOUND: 'El producto no existe.',
  PRODUCT_IN_USE: 'El producto ya tiene precios u órdenes: desactívalo y registra uno nuevo.',
  FORMAT_MISMATCH: 'El formato no coincide con la cantidad por formato o la unidad del insumo.',
  INVALID_SOURCE:
    'La URL debe ser la página pública del producto en el sitio del proveedor (Central Mayorista: …/p/producto; Jumbo y Santa Isabel: …/producto/p).',
  INVALID_UPDATE: 'Ese cambio no está permitido.',
  PRICE_WORKER_BUSY: 'Ya se están obteniendo precios en este momento. Intenta de nuevo en unos minutos.',
  ORDER_NOT_FOUND: 'La orden no existe.',
  ORDER_NOT_APPROVED: 'La orden no está aprobada.',
  ORDER_INCOMPLETE: 'A la orden le faltan datos de producto o cantidad.',
  ORDER_FORMAT_MISMATCH: 'El formato del producto cambió desde que se aprobó la orden.',
  FIXED_FORMAT_MISMATCH: 'En formatos fijos se recibe la cantidad completa aprobada.',
  ACTUAL_WEIGHT_REQUIRED: 'Ingresa el peso recibido: el producto es de peso variable.',
  INVALID_RECEIPT_DATE: 'La fecha de recepción debe estar entre la aprobación y hoy.',
  INVALID_RECEIPT_LINK: 'La recepción no coincide con la orden.',
  RECEIPT_CONFLICT: 'La orden ya fue recibida con otros datos.',
  RECEIPT_REVERSED: 'La entrada de esta recepción fue anulada.',
  ORDER_RECEIPT_IMMUTABLE: 'Esta entrada es la recepción de una orden y no se puede anular.',
  INVALID_REQUEST: 'Revisa los datos del formulario.',
  NETWORK_ERROR: 'No se pudo conectar con el servidor.',
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly body: ErrorBody | undefined

  constructor(status: number, body: ErrorBody | undefined, fallbackCode = 'UNKNOWN') {
    const code = body?.error?.code ?? fallbackCode
    super(MESSAGES[code] ?? body?.error?.message ?? `Error inesperado (${status}).`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

/** Mensaje en español para mostrar al usuario a partir de cualquier error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof TypeError) return MESSAGES.NETWORK_ERROR
  return 'Ocurrió un error inesperado.'
}
