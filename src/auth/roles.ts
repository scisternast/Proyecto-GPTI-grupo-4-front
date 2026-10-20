import type { Role } from '../api/types'

/** Pantalla de inicio de cada rol: el Encargado(a) de bodega solo ve Movimientos y Conteo y merma. */
export const HOME_BY_ROLE: Record<Role, string> = { ADMIN: '/', WAREHOUSE: '/movimientos' }
