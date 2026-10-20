import type { ErrorBody } from './types'

// El backend responde los errores en inglés; el frontend los traduce por `code`.
const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'El correo o la contraseña no son válidos, o la sesión venció.',
  FORBIDDEN: 'Tu cuenta no tiene permiso para realizar esta acción.',
  LOGIN_THROTTLED: 'Demasiados intentos de acceso. Espera 15 minutos antes de volver a intentar.',
  ORDER_RECEIPT_IMMUTABLE: 'Este movimiento corresponde a una recepción de orden y no se puede reversar aquí.',
  HTTP_503: 'El servidor no está disponible. Vuelve a intentarlo en unos momentos.',
  ALREADY_CORRECTED: 'Este movimiento ya fue reversado o corregido.',
  AMOUNT_OUT_OF_RANGE: 'La cantidad es demasiado grande.',
  AMOUNT_PRECISION: 'La cantidad admite como máximo seis decimales en la unidad base.',
  BEFORE_INITIAL_STOCK: 'La fecha no puede ser anterior al stock inicial del insumo.',
  CORRECTION_NOTE_REQUIRED: 'La corrección necesita una nota que la explique.',
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
  INVALID_TIMESTAMP: 'La fecha debe incluir zona horaria.',
  INVALID_TIMEZONE: 'Zona horaria no reconocida.',
  INVALID_UNIT: 'La unidad no corresponde a la unidad base del insumo.',
  ITEM_NOT_FOUND: 'El insumo no existe.',
  MOVEMENT_NOT_FOUND: 'El movimiento no existe.',
  NEGATIVE_STOCK: 'No hay stock suficiente para esa salida.',
  PHYSICAL_COUNT_REQUIRED: 'Se necesita un conteo físico para continuar.',
  STOCK_LEDGER_MISMATCH: 'El saldo no coincide con el historial. Avisa al equipo de backend.',
  INVALID_REQUEST: 'Revisa los datos del formulario.',
  NETWORK_ERROR: 'No se pudo conectar con el servidor.',
  NOT_IMPLEMENTED: 'Esta función todavía no está disponible en el backend.',
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
