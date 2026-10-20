import { useState } from 'react'
import { Link } from 'react-router'
import { useAllProducts, useCreateItem, useItems, useMovements, useUpdateItem } from '../api/queries'
import type { BaseUnit, ItemState, ItemUpdate, Supplier } from '../api/types'
import { AlertBadge, ErrorMessage, Loading, PageHeader } from '../components/Feedback'
import { formatQuantity, joinNames, TIME_ZONE, UNIT_LABEL } from '../lib/format'
import { ALERT_STATUS } from '../lib/labels'
import { buildLedger } from '../lib/ledger'
import { useSelectedItem } from '../state/useSelectedItem'

const BASE_UNITS: { value: BaseUnit; label: string }[] = [
  { value: 'unidad', label: 'Unidad (u)' },
  { value: 'kg', label: 'Kilogramo (kg)' },
  { value: 'L', label: 'Litro (L)' },
]

export function ItemsPage() {
  const items = useItems()
  const { suppliers, products } = useAllProducts()
  /** Proveedores activos que venden cada insumo (vía sus productos activos). */
  const suppliersOf = (itemId: number) =>
    (suppliers.data ?? []).filter((s) => s.is_active && products.some((p) => p.item_id === itemId && p.supplier_id === s.id && p.is_active))
  const { select } = useSelectedItem()
  // null = formulario cerrado; 'new' = nuevo insumo; número = editar ese insumo.
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  // La confirmación vive aquí: al crear, el formulario pasa a modo edición y se vuelve a montar.
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const edit = (next: number | 'new' | null) => {
    setEditing(next)
    setSavedMessage(null)
  }
  const editingItem = typeof editing === 'number' ? items.data?.find((item) => item.id === editing) : undefined

  return (
    <section>
      <PageHeader
        eyebrow="Configuración"
        title="Insumos"
        actions={
          <button onClick={() => edit('new')}>
            + Nuevo insumo
          </button>
        }
      />
      <div className="split">
        <div className="card">
          <h2>Insumos registrados</h2>
          {items.isPending && <Loading />}
          {items.error && <ErrorMessage error={items.error} />}
          {items.data?.length === 0 && <p className="muted">Aún no hay insumos. Crea el primero.</p>}
          <ul className="cards">
            {items.data?.map((item) => (
              <li key={item.id}>
                <button
                  className={`item-card${editing === item.id ? ' selected' : ''}`}
                  onClick={() => {
                    edit(item.id)
                    select(item.id)
                  }}
                >
                  <span className="item-card-title">
                    <strong>{item.name}</strong>
                    {item.assessment.alert_status !== 'OK' && (
                      <AlertBadge status={item.assessment.alert_status} label={ALERT_STATUS[item.assessment.alert_status]} />
                    )}
                  </span>
                  <span className="muted">
                    Stock {formatQuantity(item.current_stock, item.base_unit)} · stock seguro{' '}
                    {formatQuantity(item.assessment.safe_stock, item.base_unit)} (
                    {item.manual_safe_stock === null ? 'automático' : 'manual'})
                  </span>
                  {suppliersOf(item.id).length > 0 && (
                    <span className="muted">Proveedores {joinNames(suppliersOf(item.id).map((s) => s.name))}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {editing !== null && (editing === 'new' || editingItem) ? (
          <div className="stack">
            {savedMessage && <p className="notice success">{savedMessage}</p>}
            <ItemForm
              key={editing}
              item={editingItem}
              suppliers={editingItem ? suppliersOf(editingItem.id) : []}
              allSuppliers={suppliers.data ?? []}
              onDone={(id, created) => {
                setEditing(id)
                setSavedMessage(created ? 'Insumo creado.' : 'Insumo guardado.')
              }}
              onCancel={() => edit(null)}
            />
          </div>
        ) : (
          <div className="card muted">Elige un insumo para editarlo o crea uno nuevo.</div>
        )}
      </div>
    </section>
  )
}

interface ItemFormProps {
  item: ItemState | undefined
  suppliers: Supplier[]
  allSuppliers: Supplier[]
  onDone: (id: number, created: boolean) => void
  onCancel: () => void
}

function ItemForm({ item, suppliers, allSuppliers, onDone, onCancel }: ItemFormProps) {
  const isNew = item === undefined
  const create = useCreateItem()
  const update = useUpdateItem()
  const movements = useMovements(item?.id ?? null)
  const [name, setName] = useState(item?.name ?? '')
  const [baseUnit, setBaseUnit] = useState<BaseUnit>(item?.base_unit ?? 'unidad')
  const [initial, setInitial] = useState('')
  const [manual, setManual] = useState(item ? item.manual_safe_stock !== null : false)
  const [safeStock, setSafeStock] = useState(item?.manual_safe_stock ? String(Number(item.manual_safe_stock)) : '')

  const unitLabel = UNIT_LABEL[baseUnit]
  const activeInitial = movements.data && buildLedger(movements.data).find((m) => m.kind === 'INITIAL' && !m.invalidated)
  const mutation = isNew ? create : update

  return (
    <form
      className="card form"
      onSubmit={async (event) => {
        event.preventDefault()
        const manualSafeStock = manual && safeStock !== '' ? safeStock : null
        try {
          if (isNew) {
            const created = await create.mutateAsync({
              name: name.trim(),
              base_unit: baseUnit,
              initial_quantity: initial,
              initial_unit: baseUnit,
              timezone: TIME_ZONE,
              manual_safe_stock: manualSafeStock,
            })
            onDone(created.id, true)
            return
          }
          // PATCH solo con lo que cambió (un cuerpo vacío responde 422 EMPTY_UPDATE).
          const body: ItemUpdate = {}
          if (name.trim() !== item.name) body.name = name.trim()
          const current = item.manual_safe_stock === null ? null : Number(item.manual_safe_stock)
          if ((manualSafeStock === null ? null : Number(manualSafeStock)) !== current) body.manual_safe_stock = manualSafeStock
          if (Object.keys(body).length > 0) await update.mutateAsync({ id: item.id, body })
          onDone(item.id, false)
        } catch {
          // El error queda en `mutation.error` y se muestra en el formulario.
        }
      }}
    >
      <div className="card-header">
        <h2>{isNew ? 'Nuevo insumo' : 'Editar insumo'}</h2>
        <span className="muted small">* Campo obligatorio</span>
      </div>
      <div className="row">
        <label className="grow">
          Nombre del insumo *
          <input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Unidad de medida *
          <select
            value={baseUnit}
            disabled={!isNew}
            title={isNew ? undefined : 'La unidad no se puede cambiar después de crear el insumo'}
            onChange={(event) => setBaseUnit(event.target.value as BaseUnit)}
          >
            {BASE_UNITS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="row">
        <label>
          Stock inicial ({unitLabel}) *
          {isNew ? (
            <input
              required
              type="number"
              min={0}
              step="any"
              value={initial}
              onChange={(event) => setInitial(event.target.value)}
            />
          ) : (
            <input disabled value={activeInitial ? formatQuantity(activeInitial.delta) : '—'} />
          )}
          {!isNew && (
            <small className="muted">
              Stock actual: <strong>{formatQuantity(item.current_stock, item.base_unit)}</strong> (según movimientos).
            </small>
          )}
        </label>

        <fieldset className="choice choice-column grow">
          <legend>Stock seguro</legend>
          <label className={!manual ? 'selected' : undefined}>
            <input type="radio" name="safe" checked={!manual} onChange={() => setManual(false)} />
            <span>
              <strong>Automático · 1 semana de consumo</strong>
              <small className="muted">
                {item?.consumption.weekly_average
                  ? `Hoy sería ${formatQuantity(item.consumption.weekly_average, item.base_unit)} (consumo promedio semanal)`
                  : 'Se calcula cuando haya historia de consumo'}
              </small>
            </span>
          </label>
          <label className={manual ? 'selected' : undefined}>
            <input type="radio" name="safe" checked={manual} onChange={() => setManual(true)} />
            <strong>Fijar manualmente</strong>
            <span className="input-unit">
              <input
                type="number"
                min={0}
                step="any"
                required={manual}
                disabled={!manual}
                value={safeStock}
                aria-label="Stock seguro manual"
                onChange={(event) => setSafeStock(event.target.value)}
              />
              <span>{unitLabel}</span>
            </span>
          </label>
          <small className="muted">
            Se emite una alerta cuando el stock proyectado a la llegada de la reposición es menor o igual al stock
            seguro.
          </small>
        </fieldset>
      </div>

      {/* El vínculo insumo ↔ proveedor es un producto del proveedor (URL y formato): se gestiona en Proveedores. */}
      <fieldset className="choice" disabled>
        <legend>Proveedores</legend>
        {allSuppliers
          .filter((s) => s.is_active)
          .map((supplier) => {
            const sells = suppliers.some((s) => s.id === supplier.id)
            return (
              <label key={supplier.id} className={sells ? 'selected' : undefined}>
                <input type="checkbox" checked={sells} readOnly />
                <span>
                  <strong>{supplier.name}</strong>
                  <small className="muted">Entrega {supplier.lead_time_days} días</small>
                </span>
              </label>
            )
          })}
      </fieldset>
      <p className="muted small">
        {isNew ? 'Después de crear el insumo, ' : ''}
        <Link to="/proveedores">regístralo como producto en Proveedores</Link> para asociarlo: cada proveedor necesita la
        URL y el formato del producto en su sitio.
      </p>

      {mutation.error && <ErrorMessage error={mutation.error} />}
      <div className="actions">
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : 'Guardar insumo'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
