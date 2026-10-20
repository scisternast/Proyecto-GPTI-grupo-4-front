export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '')

// La simulación requiere seleccionar el modo mock; un build normal usa el backend.
export const USE_MOCKS = import.meta.env.MODE === 'mock' && import.meta.env.VITE_USE_MOCKS === 'true'
