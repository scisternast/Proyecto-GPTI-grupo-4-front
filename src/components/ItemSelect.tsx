import { useItems } from '../api/queries'
import { useSelectedItem } from '../state/useSelectedItem'
import { ErrorMessage } from './Feedback'

/** Selector del insumo activo, compartido entre pantallas. */
export function ItemSelect({ label = 'Insumo' }: { label?: string }) {
  const items = useItems()
  const { id, select } = useSelectedItem()

  if (items.error) return <ErrorMessage error={items.error} />

  return (
    <label className="item-select">
      {label}
      <select value={id ?? ''} onChange={(event) => select(Number(event.target.value))} disabled={!items.data}>
        {!items.data && <option value="">Cargando…</option>}
        {items.data?.length === 0 && <option value="">No hay insumos</option>}
        {items.data?.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  )
}
