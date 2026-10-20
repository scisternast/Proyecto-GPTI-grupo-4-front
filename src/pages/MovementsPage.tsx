import { useState } from 'react'
import { useCreateMovement, useMovements, useReverseMovement } from '../api/queries'
import type { Movement } from '../api/types'
import { ErrorMessage, Loading } from '../components/Feedback'
import { formatDateTime, formatQuantity, localInputToIso, UNITS_BY_BASE } from '../lib/format'
import { MOVEMENT_KIND } from '../lib/labels'
import { useCurrentItem } from './useCurrentItem'

const REVERSIBLE = new Set(['ENTRY', 'EXIT'])

export function MovementsPage() {
  const item = useCurrentItem()
  const movements = useMovements(item.id)
  const reverse = useReverseMovement(item.id)
  const reversedIds = new Set(movements.data?.map((m) => m.invalidates_movement_id).filter((id) => id !== null))

  return (
    <div>
      <MovementForm />

      <h2>Historial</h2>
      {reverse.error && <ErrorMessage error={reverse.error} />}
      {movements.isPending && <Loading />}
      {movements.error && <ErrorMessage error={movements.error} />}
      {movements.data && (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th className="num">Cantidad</th>
              <th className="num">Efecto ({item.base_unit})</th>
              <th className="num">Saldo ({item.base_unit})</th>
              <th>Usuario</th>
              <th>Nota</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...movements.data].reverse().map((movement) => (
              <tr key={movement.id} className={reversedIds.has(movement.id) ? 'struck' : undefined}>
                <td>{formatDateTime(movement.occurred_at)}</td>
                <td>{describeKind(movement)}</td>
                <td className="num">{formatQuantity(movement.input_quantity, movement.input_unit)}</td>
                <td className="num">{signed(movement.delta)}</td>
                <td className="num">{formatQuantity(movement.balance_after)}</td>
                <td>{movement.created_by?.name ?? '—'}</td>
                <td>{movement.note}</td>
                <td>
                  {REVERSIBLE.has(movement.kind) && !reversedIds.has(movement.id) && (
                    <button
                      className="link"
                      disabled={reverse.isPending}
                      onClick={() => {
                        if (confirm('¿Reversar este movimiento? Quedará registrado en el historial.')) {
                          reverse.mutate(movement.id)
                        }
                      }}
                    >
                      Reversar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function describeKind(movement: Movement) {
  const label = MOVEMENT_KIND[movement.kind] ?? movement.kind
  return movement.invalidates_movement_id ? `${label} de #${movement.invalidates_movement_id}` : label
}

function signed(value: string) {
  const text = formatQuantity(value)
  return Number(value) > 0 ? `+${text}` : text
}

function MovementForm() {
  const item = useCurrentItem()
  const create = useCreateMovement()
  const units = UNITS_BY_BASE[item.base_unit]
  const [kind, setKind] = useState<'ENTRY' | 'EXIT'>('EXIT')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState(units[0])
  const [occurredAt, setOccurredAt] = useState('')
  const [note, setNote] = useState('')

  return (
    <form
      className="card form"
      onSubmit={(event) => {
        event.preventDefault()
        create.mutate(
          {
            item_id: item.id,
            kind,
            quantity,
            unit,
            occurred_at: localInputToIso(occurredAt),
            note: note.trim() || null,
          },
          {
            onSuccess: () => {
              setQuantity('')
              setOccurredAt('')
              setNote('')
            },
          },
        )
      }}
    >
      <h2>Registrar movimiento</h2>
      <div className="row">
        <label>
          Tipo
          <select value={kind} onChange={(event) => setKind(event.target.value as 'ENTRY' | 'EXIT')}>
            <option value="EXIT">Salida</option>
            <option value="ENTRY">Entrada</option>
          </select>
        </label>
        <label>
          Cantidad
          <input
            required
            type="number"
            min={0}
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label>
          Unidad
          <select value={unit} onChange={(event) => setUnit(event.target.value)}>
            {units.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Fecha (opcional)
          <input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
        </label>
      </div>
      <label>
        Nota
        <input value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {create.error && <ErrorMessage error={create.error} />}
      <button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Guardando…' : 'Registrar'}
      </button>
    </form>
  )
}
