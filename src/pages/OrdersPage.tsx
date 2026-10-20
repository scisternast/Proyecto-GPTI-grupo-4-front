import { useState } from 'react'
import { ApiError } from '../api/errors'
import {
  useAllProducts,
  useCreateSuggestion,
  useDecideSuggestion,
  useItem,
  useOrders,
  useReceiveOrder,
  useSuggestions,
} from '../api/queries'
import {
  type ItemState,
  type Order,
  type OrderReceipt,
  snapshotOf,
  type Suggestion,
  type Supplier,
  type SupplierProduct,
  type User,
} from '../api/types'
import { useUser } from '../auth/sessionContext'
import { Badge, ErrorMessage, Loading, PageHeader } from '../components/Feedback'
import { ItemSelect } from '../components/ItemSelect'
import { dateInputToOccurredAt, dayKey, formatCLP, formatPercent, formatQuantity, formatShortDate, todayKey, UNIT_LABEL } from '../lib/format'
import { useSelectedItem } from '../state/useSelectedItem'

const DAY = 86_400_000
const STALE = ['STALE_SUGGESTION', 'STALE_PRICES', 'STALE_FORMAT']

/** Datos para mostrar un producto: proveedor, plazo y si es de peso variable. */
interface Catalog {
  product: (id: number | null) => SupplierProduct | undefined
  supplier: (productId: number | null) => Supplier | undefined
}

// Mockup «Órdenes de compra»: sugerida → aprobada → recibida (REQ-09, REQ-10, REQ-15, C3).
// StockSmart nunca compra solo: la orden existe recién cuando el Administrador(a) aprueba.
export function OrdersPage() {
  const { id } = useSelectedItem()
  const item = useItem(id)
  const orders = useOrders()
  const suggestions = useSuggestions(id)
  const { suppliers, products } = useAllProducts()

  const catalog: Catalog = {
    product: (productId) => products.find((p) => p.id === productId),
    supplier: (productId) => {
      const product = products.find((p) => p.id === productId)
      return suppliers.data?.find((s) => s.id === product?.supplier_id)
    },
  }
  const ofItem = (orders.data ?? []).filter((o) => o.item_id === id)
  const suggestionList = suggestions.data ?? []
  const suggestionOf = (order: Order) => suggestionList.find((s) => s.id === order.suggestion_id)
  const pendingSuggestion = suggestionList.find((s) => s.status === 'PENDING')
  const inTransit = ofItem.filter((o) => o.status === 'APPROVED').sort((a, b) => b.id - a.id)[0]

  const history = [
    ...ofItem.filter((o) => o !== inTransit).map((order) => ({ at: order.decided_at, order, suggestion: suggestionOf(order) })),
    ...suggestionList
      .filter((s) => s.status === 'REJECTED')
      .map((suggestion) => ({ at: suggestion.decided_at ?? suggestion.created_at, order: undefined, suggestion })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

  return (
    <section>
      <ItemSelect />
      <PageHeader eyebrow={item.data?.name} title="Órdenes de compra" />
      {orders.error && <ErrorMessage error={orders.error} />}
      {suggestions.error && <ErrorMessage error={suggestions.error} />}
      {(orders.isPending || suggestions.isPending || item.isPending) && id !== null && <Loading />}
      {orders.data && suggestions.data && item.data && (
        <div className="split split-wide">
          {pendingSuggestion ? (
            <OrderCard item={item.data} suggestion={pendingSuggestion} catalog={catalog} />
          ) : inTransit ? (
            <OrderCard item={item.data} order={inTransit} suggestion={suggestionOf(inTransit)} catalog={catalog} />
          ) : (
            <NoCurrentOrder item={item.data} />
          )}
          <div className="card">
            <h2>Historial de órdenes</h2>
            {history.length === 0 && <p className="muted">Aún no hay órdenes anteriores para este insumo.</p>}
            <ul className="list">
              {history.map(({ order, suggestion }) => (
                <HistoryRow
                  key={order ? `o${order.id}` : `s${suggestion!.id}`}
                  order={order}
                  suggestion={suggestion}
                  item={item.data}
                  catalog={catalog}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

function NoCurrentOrder({ item }: { item: ItemState }) {
  const create = useCreateSuggestion()
  const needsOrder = item.assessment.alert_status === 'LOW_STOCK'
  return (
    <div className="card">
      <h2>Sin orden en curso</h2>
      {needsOrder ? (
        <>
          <p>
            {item.name} está bajo el stock seguro proyectado. Genera la orden sugerida con los precios vigentes (
            {formatQuantity(item.assessment.suggested_quantity, item.base_unit)}).
          </p>
          {create.error && <ErrorMessage error={create.error} />}
          <button disabled={create.isPending} onClick={() => create.mutate(item.id)}>
            {create.isPending ? 'Generando…' : 'Generar orden sugerida'}
          </button>
        </>
      ) : (
        <p className="muted">No hay alerta de reposición para este insumo, así que no hace falta pedir.</p>
      )}
    </div>
  )
}

const STEPS = ['Sugerida', 'Aprobada', 'Recibida'] as const

interface OrderCardProps {
  item: ItemState
  order?: Order
  suggestion?: Suggestion
  catalog: Catalog
}

function OrderCard({ item, order, suggestion, catalog }: OrderCardProps) {
  const user = useUser()
  const unit = item.base_unit
  const productId = order?.supplier_product_id ?? suggestion?.supplier_product_id ?? null
  const supplier = catalog.supplier(productId)
  const purchased = order?.purchased_qty ?? suggestion?.purchased_qty ?? null
  const total = order?.total_clp ?? suggestion?.total_clp ?? null
  const unitPrice = purchased && total ? Number(total) / Number(purchased) : null
  const lead = supplier?.lead_time_days ?? null
  const expected =
    order?.expected_at ?? (suggestion && lead !== null ? new Date(Date.parse(suggestion.created_at) + lead * DAY).toISOString() : null)
  const savings = suggestion?.savings_clp ?? null
  const savingsPercent =
    savings !== null && suggestion?.next_best_total_clp ? (Number(savings) / Number(suggestion.next_best_total_clp)) * 100 : null
  const step = order ? 1 : 0

  return (
    <div className="card order-card">
      <div className="card-header">
        <h2>{order ? `Orden ${order.code}` : 'Orden sugerida'}</h2>
        {order ? <Badge tone="info">Aprobada · en tránsito</Badge> : <Badge tone="warn">Sugerida · pendiente de aprobación</Badge>}
      </div>

      <ol className="steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i <= step ? 'done' : undefined} aria-current={i === step ? 'step' : undefined}>
            {label}
          </li>
        ))}
      </ol>

      <dl className="facts">
        <div>
          <dt>Proveedor recomendado</dt>
          <dd>
            <strong>{supplier?.name ?? '—'}</strong>
          </dd>
        </div>
        <div>
          <dt>Precio por {UNIT_LABEL[unit]} (IVA incl.)</dt>
          <dd className="mono">{formatCLP(unitPrice === null ? null : Math.round(unitPrice))}</dd>
        </div>
        <div>
          <dt>Cantidad a comprar</dt>
          <dd className="mono">
            {formatQuantity(purchased, unit)}
            {(order?.packs ?? suggestion?.packs) != null && (
              <small className="block muted">{order?.packs ?? suggestion?.packs} formatos</small>
            )}
          </dd>
        </div>
        <div>
          <dt>Entrega estimada</dt>
          <dd>
            {formatShortDate(expected)}
            {lead !== null && ` (${lead} días)`}
          </dd>
        </div>
        <div>
          <dt>Total estimado (IVA incl.)</dt>
          <dd className="mono big">{formatCLP(total)}</dd>
        </div>
        <div>
          <dt>Ahorro vs. siguiente opción</dt>
          <dd className="mono accent">{savings === null ? '—' : `${formatCLP(savings)} · ${formatPercent(savingsPercent)}`}</dd>
        </div>
      </dl>

      {suggestion && (
        <div className="explain">
          <strong>Por qué esta sugerencia</strong>
          <p>{explanation(suggestion, unit, supplier?.name)}</p>
        </div>
      )}

      {order ? (
        <ReceiptForm
          order={order}
          unit={unit}
          decidedBy={nameOf(order.decided_by, user)}
          variableWeight={Boolean(catalog.product(productId)?.scrape_config?.pack.is_variable_weight)}
        />
      ) : user.role === 'ADMIN' ? (
        <Decision suggestion={suggestion!} />
      ) : (
        <p className="muted small">Solo un(a) Administrador(a) puede aprobar o rechazar.</p>
      )}
    </div>
  )
}

/** `created_by` y `decided_by` llegan como id: solo se conoce el nombre del usuario actual. */
function nameOf(userId: number | null, current: User): string | null {
  return userId !== null && userId === current.id ? current.name : null
}

/** Explica la sugerencia con los datos que el backend congeló al calcularla (`inputs_snapshot`). */
function explanation(s: Suggestion, unit: string, supplierName: string | undefined) {
  const snapshot = snapshotOf(s)
  const assessment = snapshot.inventory?.assessment
  const projected = assessment?.projected_stock_at_arrival ?? null
  const safe = assessment?.safe_stock ?? null
  const weekly = snapshot.inventory?.consumption.weekly_average ?? null
  const parts: string[] = []
  if (projected !== null && s.purchased_qty !== null) {
    const after = Math.max(0, Number(projected)) + Number(s.purchased_qty)
    const arrival =
      Number(projected) <= 0
        ? `El stock se agotaría antes de que llegue el pedido${Number(projected) < 0 ? ` (faltarían ${formatQuantity(-Number(projected), unit)})` : ''}`
        : `El pedido llega con ${formatQuantity(projected, unit)} en bodega${
            safe !== null && Number(projected) === Number(safe) ? ' (el stock seguro)' : safe !== null ? ` (stock seguro: ${formatQuantity(safe, unit)})` : ''
          }`
    parts.push(
      `${arrival} y deja ${formatQuantity(after, unit)}${
        weekly && Number(weekly) > 0 ? `, ${formatWeeks(after / Number(weekly))} de consumo (${formatQuantity(weekly, unit)}/semana)` : ''
      }.`,
    )
  }
  if (Number(s.in_transit_qty) > 0) parts.push(`Descuenta ${formatQuantity(s.in_transit_qty, unit)} ya en tránsito.`)
  if (s.packs) parts.push('La cantidad ya está redondeada a formatos completos.')
  if (supplierName) parts.push(`${supplierName} tiene el menor costo entre los precios vigentes (IVA incluido, sin despacho).`)
  return parts.join(' ')
}

function formatWeeks(weeks: number) {
  const rounded = Math.round(weeks * 10) / 10
  const words: Record<number, string> = { 1: 'una semana', 2: 'dos semanas', 3: 'tres semanas', 4: 'cuatro semanas' }
  return words[rounded] ?? `${formatQuantity(rounded)} semanas`
}

function Decision({ suggestion }: { suggestion: Suggestion }) {
  const decide = useDecideSuggestion()
  const create = useCreateSuggestion()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const stale = decide.error instanceof ApiError && STALE.includes(decide.error.code)

  // Si los datos cambiaron desde que se generó, el backend exige rechazarla y generar otra.
  async function regenerate() {
    await decide.mutateAsync({
      id: suggestion.id,
      decision: 'REJECT',
      reason: 'Datos desactualizados al aprobar; se generó una nueva sugerencia.',
    })
    await create.mutateAsync(suggestion.item_id)
  }

  return (
    <div className="order-actions">
      {decide.error && <ErrorMessage error={decide.error} />}
      {create.error && <ErrorMessage error={create.error} />}
      {stale ? (
        <div className="actions actions-wide">
          <button disabled={decide.isPending || create.isPending} onClick={() => regenerate().catch(() => {})}>
            {create.isPending || decide.isPending ? 'Generando…' : 'Rechazar y generar una nueva'}
          </button>
        </div>
      ) : rejecting ? (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault()
            decide.mutate({ id: suggestion.id, decision: 'REJECT', reason: reason.trim() })
          }}
        >
          <label>
            Motivo del rechazo *
            <input required maxLength={2000} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <div className="actions">
            <button type="submit" className="secondary" disabled={decide.isPending}>
              Confirmar rechazo
            </button>
            <button type="button" className="link" onClick={() => setRejecting(false)}>
              Volver
            </button>
          </div>
        </form>
      ) : (
        <div className="actions actions-wide">
          <button disabled={decide.isPending} onClick={() => decide.mutate({ id: suggestion.id, decision: 'APPROVE' })}>
            {decide.isPending ? 'Aprobando…' : 'Aprobar orden'}
          </button>
          <button className="secondary" onClick={() => setRejecting(true)}>
            Rechazar
          </button>
        </div>
      )}
      <p className="muted small">
        StockSmart nunca compra de forma automática: la orden se emite solo cuando el Administrador(a) la aprueba.
      </p>
    </div>
  )
}

function ReceiptForm({
  order,
  unit,
  decidedBy,
  variableWeight,
}: {
  order: Order
  unit: string
  decidedBy: string | null
  variableWeight: boolean
}) {
  const receive = useReceiveOrder()
  const [date, setDate] = useState(todayKey)
  const [weight, setWeight] = useState('')

  return (
    <form
      className="receipt"
      onSubmit={(event) => {
        event.preventDefault()
        const body: OrderReceipt = { received_at: dateInputToOccurredAt(date) ?? null }
        if (variableWeight) body.received_quantity = weight
        receive.mutate({ orderId: order.id, body })
      }}
    >
      <p>
        <strong>Orden aprobada y emitida</strong> el {formatShortDate(order.decided_at)}
        {decidedBy && ` por ${decidedBy}`}. En tránsito
        {order.expected_at && `: llega el ${formatShortDate(order.expected_at)}`}. Cuando llegue la mercadería, registra
        la recepción.
      </p>
      <div className="inline-form">
        <label>
          Fecha de recepción
          <input
            type="date"
            required
            min={dayKey(order.decided_at)}
            max={todayKey()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        {variableWeight && (
          <label>
            Peso recibido ({UNIT_LABEL[unit]}) *
            <input required type="number" min={0} step="any" value={weight} onChange={(event) => setWeight(event.target.value)} />
          </label>
        )}
        <button type="submit" className="grow" disabled={receive.isPending}>
          {receive.isPending ? 'Registrando…' : 'Registrar recepción'}
        </button>
      </div>
      {receive.error && <ErrorMessage error={receive.error} />}
      <p className="muted small">
        {variableWeight
          ? 'Producto de peso variable: se suma al stock el peso medido, como una entrada.'
          : `Al registrarla, el sistema suma automáticamente ${formatQuantity(order.purchased_qty, unit)} al stock como una entrada.`}
      </p>
    </form>
  )
}

function HistoryRow({
  order,
  suggestion,
  item,
  catalog,
}: {
  order?: Order
  suggestion?: Suggestion
  item: ItemState
  catalog: Catalog
}) {
  const user = useUser()
  const unit = item.base_unit
  const productId = order?.supplier_product_id ?? suggestion?.supplier_product_id ?? null
  const supplierName = catalog.supplier(productId)?.name ?? '—'
  const qty = order?.received_quantity ?? order?.purchased_qty ?? suggestion?.purchased_qty ?? null
  const amount = `${formatQuantity(qty, unit)} · ${formatCLP(order?.total_clp ?? suggestion?.total_clp)}`

  if (order) {
    return (
      <li className="list-block">
        <div className="card-header">
          <strong>
            {order.code} · {supplierName}
          </strong>
          <Badge tone="info">{order.status === 'RECEIVED' ? 'Recibida' : 'En tránsito'}</Badge>
        </div>
        <small className="muted">
          Aprobada {formatShortDate(order.decided_at)}
          {order.received_at && ` · recibida ${formatShortDate(order.received_at)}`} · {amount}
        </small>
      </li>
    )
  }
  const s = suggestion!
  const decidedBy = nameOf(s.decided_by, user)
  return (
    <li className="list-block">
      <div className="card-header">
        <strong>{supplierName}</strong>
        <Badge>Rechazada</Badge>
      </div>
      <small className="muted">
        Sugerida {formatShortDate(s.created_at)}
        {s.decided_at && ` · rechazada ${formatShortDate(s.decided_at)}`}
        {decidedBy && ` por ${decidedBy}`} · {amount}
      </small>
      {s.rejection_reason && <small className="muted">Motivo: «{s.rejection_reason}»</small>}
    </li>
  )
}
