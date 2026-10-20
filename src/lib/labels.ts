// Textos en español para los valores enumerados del contrato.

export const ALERT_STATUS: Record<string, string> = {
  LOW_STOCK: 'Reponer',
  OK: 'OK',
  INSUFFICIENT_HISTORY: 'Sin historial',
  IN_TRANSIT: 'En tránsito',
}

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador(a)',
  WAREHOUSE: 'Encargado(a) de bodega',
}

export const SUGGESTION_STATUS: Record<string, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
}

export const ORDER_STATUS: Record<string, string> = {
  APPROVED: 'Aprobada · en tránsito',
  RECEIVED: 'Recibida',
}

export const RUN_STATUS: Record<string, string> = {
  RUNNING: 'En curso',
  OK: 'Correcto',
  PARTIAL: 'Parcial',
  ERROR: 'Falló',
}

export const ALERT_SOURCE: Record<string, string> = {
  MANUAL_THRESHOLD: 'Umbral manual',
  AUTOMATIC: 'Automático',
}

export const CONSUMPTION_STATUS: Record<string, string> = {
  INSUFFICIENT_HISTORY: 'Sin historial suficiente',
  PRELIMINARY: 'Preliminar',
  ESTABLISHED: 'Establecido',
}

export const DEPLETION_STATUS: Record<string, string> = {
  INSUFFICIENT_HISTORY: 'Sin historial suficiente',
  ZERO_CONSUMPTION: 'Sin consumo registrado',
  PROJECTED: 'Proyectado',
  OUT_OF_RANGE: 'Fuera del rango de proyección',
}

export const MOVEMENT_KIND: Record<string, string> = {
  INITIAL: 'Stock inicial',
  ENTRY: 'Entrada',
  EXIT: 'Salida',
  COUNT_ADJUSTMENT: 'Conteo',
  REVERSAL: 'Reversa',
  CORRECTION: 'Corrección',
}

export const COUNT_CAUSES = [
  'vencimiento',
  'deterioro',
  'error de registro',
  'desconocida',
  'otra',
] as const
