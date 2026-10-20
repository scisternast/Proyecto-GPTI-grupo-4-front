/** Nombre del negocio que aparece bajo la marca (en el mockup: «[Nombre del negocio]»). */
export const BUSINESS_NAME = import.meta.env.VITE_BUSINESS_NAME ?? 'Negocio de ejemplo'

/** Backend simulado (MSW): solo con `--mode mock`, para que un build normal nunca publique datos falsos. */
export const USE_MOCKS = import.meta.env.MODE === 'mock' && import.meta.env.VITE_USE_MOCKS === 'true'
