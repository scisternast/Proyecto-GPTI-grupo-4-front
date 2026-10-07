import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useCreateItem } from '../api/queries'
import type { BaseUnit } from '../api/types'
import { ErrorMessage } from '../components/Feedback'
import { TIME_ZONE, UNITS_BY_BASE } from '../lib/format'

export function NewItemPage() {
  const navigate = useNavigate()
  const createItem = useCreateItem()
  const [name, setName] = useState('')
  const [baseUnit, setBaseUnit] = useState<BaseUnit>('kg')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('kg')
  const [safeStock, setSafeStock] = useState('')

  return (
    <section>
      <h1>Nuevo insumo</h1>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault()
          createItem.mutate(
            {
              name: name.trim(),
              base_unit: baseUnit,
              initial_quantity: quantity,
              initial_unit: unit,
              timezone: TIME_ZONE,
              manual_safe_stock: safeStock === '' ? null : safeStock,
            },
            { onSuccess: (item) => navigate(`/insumos/${item.id}`) },
          )
        }}
      >
        <label>
          Nombre
          <input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Unidad base
          <select
            value={baseUnit}
            onChange={(event) => {
              const next = event.target.value as BaseUnit
              setBaseUnit(next)
              setUnit(UNITS_BY_BASE[next][0])
            }}
          >
            <option value="kg">Kilogramos (kg)</option>
            <option value="L">Litros (L)</option>
            <option value="unidad">Unidades</option>
          </select>
        </label>
        <div className="row">
          <label>
            Stock inicial
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
              {UNITS_BY_BASE[baseUnit].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Stock seguro manual ({baseUnit}, opcional)
          <input
            type="number"
            min={0}
            step="any"
            value={safeStock}
            placeholder="Vacío = automático según consumo"
            onChange={(event) => setSafeStock(event.target.value)}
          />
        </label>
        {createItem.error && <ErrorMessage error={createItem.error} />}
        <button type="submit" disabled={createItem.isPending}>
          {createItem.isPending ? 'Guardando…' : 'Crear insumo'}
        </button>
      </form>
    </section>
  )
}
