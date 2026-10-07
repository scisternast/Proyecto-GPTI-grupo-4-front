// Textos en español para los valores enumerados del contrato.

export const ALERT_STATUS: Record<string, string> = {
  LOW_STOCK: 'Stock bajo',
  OK: 'OK',
  INSUFFICIENT_HISTORY: 'Sin historial suficiente',
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
  COUNT_ADJUSTMENT: 'Ajuste por conteo',
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
