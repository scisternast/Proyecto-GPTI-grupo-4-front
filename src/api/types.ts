// Alias legibles de los tipos generados desde OpenAPI (src/api/schema.d.ts).
// No edites schema.d.ts a mano: regenéralo con `npm run api:types` o `npm run api:pull`.
import type { components } from './schema'

type Schemas = components['schemas']

export type LoginCreate = Schemas['LoginCreate']
export type TokenResponse = Schemas['TokenResponse']
export type User = Schemas['UserResponse']

export type ItemState = Schemas['ItemStateResponse']
export type ItemCreate = Schemas['ItemCreate']
export type Assessment = Schemas['AssessmentResponse']
export type Consumption = Schemas['ConsumptionResponse']
export type Movement = Schemas['MovementResponse']
export type MovementCreate = Schemas['MovementCreate']
export type Count = Schemas['CountResponse']
export type CountCreate = Schemas['CountCreate']
export type Alert = Schemas['AlertResponse']
export type ShortageRate = Schemas['ShortageRateResponse']
export type ErrorBody = Schemas['ErrorResponse']

export type BaseUnit = ItemState['base_unit']
export type CountCause = NonNullable<CountCreate['cause']>
