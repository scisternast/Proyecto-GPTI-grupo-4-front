import { useState } from 'react'
import {
  useAllProducts,
  useAllScrapeRuns,
  useCreateProduct,
  useItems,
  useSaveSupplier,
  useUpdateProduct,
} from '../api/queries'
import type {
  Adapter,
  ItemState,
  ScrapeConfigInput,
  ScrapeRun,
  Supplier,
  SupplierProduct,
  SupplierProductCreate,
  SupplierUpdate,
} from '../api/types'
import { Badge, ErrorMessage, Loading, PageHeader } from '../components/Feedback'
import { formatDateTime, formatQuantity, UNIT_LABEL } from '../lib/format'
import { RUN_STATUS } from '../lib/labels'
import { ADAPTERS, runResults, scrapeErrorMessage } from '../lib/procurement'

export function SuppliersPage() {
  const { suppliers, products, error: productsError } = useAllProducts()
  const items = useItems()
  const runsBySupplier = useAllScrapeRuns((suppliers.data ?? []).map((s) => s.id))
  // null = formulario cerrado; 'new' = nuevo proveedor; número = editar ese proveedor.
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const edit = (next: number | 'new' | null) => {
    setEditing(next)
    setSavedMessage(null)
  }
  const editingSupplier = typeof editing === 'number' ? suppliers.data?.find((s) => s.id === editing) : undefined

  return (
    <section>
      <PageHeader
        eyebrow="Configuración"
        title="Proveedores"
        actions={<button onClick={() => edit('new')}>+ Nuevo proveedor</button>}
      />

      <div className="card">
        {suppliers.isPending && <Loading />}
        {suppliers.error && <ErrorMessage error={suppliers.error} />}
        {suppliers.data?.length === 0 && <p className="muted">Aún no hay proveedores.</p>}
        {suppliers.data && suppliers.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Fuente de precios (URL)</th>
                  <th className="num">Entrega</th>
                  <th className="num">Productos</th>
                  <th>Último scraping</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {suppliers.data.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className={editing === supplier.id ? 'selected' : !supplier.is_active ? 'muted-row' : undefined}
                  >
                    <td>
                      <strong>{supplier.name}</strong>
                      {!supplier.is_active && <Badge>Inactivo</Badge>}
                    </td>
                    <td>
                      {supplier.price_source_url ? (
                        <a className="mono" href={supplier.price_source_url} target="_blank" rel="noreferrer">
                          {supplier.price_source_url}
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="num">{supplier.lead_time_days} días</td>
                    <td className="num">{products.filter((p) => p.supplier_id === supplier.id && p.is_active).length}</td>
                    <td>
                      <LastRun run={runsBySupplier.get(supplier.id)?.[0]} />
                    </td>
                    <td>
                      <button className="secondary small" onClick={() => edit(supplier.id)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="split split-even">
        {editing !== null && (editing === 'new' || editingSupplier) ? (
          <div className="stack">
            {savedMessage && <p className="notice success">{savedMessage}</p>}
            <SupplierForm
              key={editing}
              supplier={editingSupplier}
              onDone={(id) => {
                setEditing(id)
                setSavedMessage('Proveedor guardado.')
              }}
              onCancel={() => edit(null)}
            />
          </div>
        ) : (
          <div className="card muted">Elige un proveedor para editarlo, ver sus productos o crea uno nuevo.</div>
        )}

        <div className="card">
          <h2>Registro de fallos al obtener precios</h2>
          <small className="muted">Los 8 más recientes</small>
          <p className="muted">
            Cuando un sitio no responde o cambia su estructura, el sistema registra el fallo y sigue usando el último
            precio obtenido mientras esté vigente (7 días). Si ya venció, ese proveedor se excluye de la comparación.
          </p>
          <FailureLog suppliers={suppliers.data ?? []} runsBySupplier={runsBySupplier} products={products} />
        </div>
      </div>

      {editingSupplier && (
        <Products
          key={editingSupplier.id}
          supplier={editingSupplier}
          products={products.filter((p) => p.supplier_id === editingSupplier.id)}
          items={items.data ?? []}
          error={productsError}
        />
      )}
    </section>
  )
}

function LastRun({ run }: { run: ScrapeRun | undefined }) {
  if (!run) return <span className="muted">Sin corridas</span>
  return (
    <span className="stack-tight">
      <Badge tone={run.status === 'OK' ? 'ok' : run.status === 'ERROR' ? 'danger' : 'warn'}>
        {RUN_STATUS[run.status] ?? run.status}
      </Badge>
      <small className="muted">{formatDateTime(run.finished_at ?? run.started_at)}</small>
    </span>
  )
}

function FailureLog({
  suppliers,
  runsBySupplier,
  products,
}: {
  suppliers: Supplier[]
  runsBySupplier: Map<number, ScrapeRun[]>
  products: SupplierProduct[]
}) {
  const productName = new Map(products.map((p) => [p.id, p.name_on_site]))
  const failures = suppliers
    .flatMap((supplier) =>
      (runsBySupplier.get(supplier.id) ?? [])
        .filter((run) => run.status === 'ERROR' || run.status === 'PARTIAL')
        .map((run) => ({ run, supplierName: supplier.name })),
    )
    .sort((a, b) => Date.parse(b.run.started_at) - Date.parse(a.run.started_at))
    .slice(0, 8)

  if (failures.length === 0) return <p className="muted">No hay fallos registrados.</p>
  return (
    <ul className="list">
      {failures.map(({ run, supplierName }) => {
        const results = runResults(run)
        return (
          <li key={run.id} className="list-block">
            <div className="card-header">
              <strong>{supplierName}</strong>
              <span className="muted">{formatDateTime(run.started_at)}</span>
            </div>
            {results === null ? (
              <p>{run.message}</p>
            ) : (
              results
                .filter((r) => r.status === 'ERROR')
                .map((r) => (
                  <p key={r.supplier_product_id}>
                    <small className="muted">{productName.get(r.supplier_product_id) ?? `Producto #${r.supplier_product_id}`}: </small>
                    {scrapeErrorMessage(r.error_code)}
                  </p>
                ))
            )}
          </li>
        )
      })}
    </ul>
  )
}

function SupplierForm({
  supplier,
  onDone,
  onCancel,
}: {
  supplier: Supplier | undefined
  onDone: (id: number) => void
  onCancel: () => void
}) {
  const save = useSaveSupplier()
  const [name, setName] = useState(supplier?.name ?? '')
  const [leadTime, setLeadTime] = useState(supplier ? String(supplier.lead_time_days) : '')
  const [url, setUrl] = useState(supplier?.price_source_url ?? '')
  const [adapter, setAdapter] = useState<Adapter | ''>((supplier?.adapter as Adapter | null) ?? '')
  const [active, setActive] = useState(supplier?.is_active ?? true)

  return (
    <form
      className="card form"
      onSubmit={(event) => {
        event.preventDefault()
        const values = {
          name: name.trim(),
          lead_time_days: Number(leadTime),
          price_source_url: url.trim() || null,
          adapter: adapter || null,
          is_active: active,
        }
        if (!supplier) {
          save.mutate({ id: null, create: values }, { onSuccess: (saved) => onDone(saved.id) })
          return
        }
        // PATCH solo con lo que cambió (un cuerpo vacío responde 422 EMPTY_UPDATE).
        const update: SupplierUpdate = {}
        for (const key of Object.keys(values) as (keyof typeof values)[]) {
          if (values[key] !== supplier[key]) Object.assign(update, { [key]: values[key] })
        }
        if (Object.keys(update).length === 0) onDone(supplier.id)
        else save.mutate({ id: supplier.id, update }, { onSuccess: (saved) => onDone(saved.id) })
      }}
    >
      <h2>{supplier ? `Editar ${supplier.name}` : 'Nuevo proveedor'}</h2>
      <div className="row">
        <label className="grow">
          Nombre *
          <input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Entrega (días) *
          <input required type="number" min={0} step={1} value={leadTime} onChange={(event) => setLeadTime(event.target.value)} />
        </label>
      </div>
      <label>
        URL de la fuente de precios
        <input type="url" className="mono" value={url} onChange={(event) => setUrl(event.target.value)} />
      </label>
      <div className="row">
        <label>
          Adaptador de scraping
          <select value={adapter} onChange={(event) => setAdapter(event.target.value as Adapter | '')}>
            <option value="">Sin adaptador</option>
            {ADAPTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Activo (se usa en la alerta y la comparación)
        </label>
      </div>
      <p className="muted small">
        El tiempo de entrega se usa para anticipar la alerta de reposición, de modo que la compra llegue antes del
        quiebre. Sin adaptador no se obtienen precios automáticamente.
      </p>
      {save.error && <ErrorMessage error={save.error} />}
      <div className="actions">
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar proveedor'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Products({
  supplier,
  products,
  items,
  error,
}: {
  supplier: Supplier
  products: SupplierProduct[]
  items: ItemState[]
  error: unknown
}) {
  const update = useUpdateProduct()
  const [adding, setAdding] = useState(false)
  const itemById = new Map(items.map((item) => [item.id, item]))

  return (
    <div className="card section">
      <div className="card-header">
        <h2>Productos de {supplier.name}</h2>
        {!adding && (
          <button className="secondary small" onClick={() => setAdding(true)}>
            + Agregar producto
          </button>
        )}
      </div>
      <p className="muted small">
        Cada producto vincula un insumo con su ficha en el sitio del proveedor. Para cambiar la URL o el formato de un
        producto con precios u órdenes, desactívalo y registra uno nuevo: el historial se conserva.
      </p>
      {error !== null && <ErrorMessage error={error} />}
      {update.error && <ErrorMessage error={update.error} />}
      {products.length === 0 && !adding && <p className="muted">Este proveedor aún no tiene productos.</p>}
      {products.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Producto en el sitio</th>
                <th className="num">Formato</th>
                <th className="num">Mín.</th>
                <th>Scraping</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const item = itemById.get(product.item_id)
                return (
                  <tr key={product.id} className={product.is_active ? undefined : 'muted-row'}>
                    <td>{item?.name ?? `#${product.item_id}`}</td>
                    <td>
                      <a href={product.url} target="_blank" rel="noreferrer">
                        {product.name_on_site}
                      </a>
                    </td>
                    <td className="num">{formatQuantity(product.pack_quantity, item?.base_unit)}</td>
                    <td className="num">{product.min_packs}</td>
                    <td>
                      {product.scrape_config ? (
                        <Badge tone="ok">Configurado</Badge>
                      ) : (
                        <Badge tone="warn">Sin configurar</Badge>
                      )}
                    </td>
                    <td>
                      <button
                        className="secondary small"
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({
                            supplierId: supplier.id,
                            productId: product.id,
                            body: { is_active: !product.is_active },
                          })
                        }
                      >
                        {product.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding && <ProductForm supplier={supplier} items={items} onClose={() => setAdding(false)} />}
    </div>
  )
}

/** Formato de la página pública que acepta cada adaptador (backend/scraper/normalize.py). */
const URL_HINT: Record<string, string> = {
  central: 'https://www.centralmayorista.cl/p/nombre-del-producto',
  jumbo: 'https://www.jumbo.cl/nombre-del-producto/p',
  santa_isabel: 'https://www.santaisabel.cl/nombre-del-producto/p',
}

function ProductForm({ supplier, items, onClose }: { supplier: Supplier; items: ItemState[]; onClose: () => void }) {
  const create = useCreateProduct()
  const [itemId, setItemId] = useState(items[0]?.id ?? 0)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [packQuantity, setPackQuantity] = useState('')
  const [minPacks, setMinPacks] = useState('1')
  // Configuración para el scraping (scrape_config): opcional, pero sin ella no se obtienen precios.
  const [sku, setSku] = useState('')
  const [brand, setBrand] = useState('')
  const [tokens, setTokens] = useState('')
  const [format, setFormat] = useState('')
  const [content, setContent] = useState('')
  const [contentUnit, setContentUnit] = useState('')
  const [unitsPerPack, setUnitsPerPack] = useState('1')
  const [variableWeight, setVariableWeight] = useState(false)

  const item = items.find((i) => i.id === itemId)
  const baseUnit = item?.base_unit ?? 'kg'
  const scrapeFields = [sku, brand, tokens, format, content, contentUnit]
  const configured = scrapeFields.some((value) => value.trim() !== '')

  return (
    <form
      className="form subform"
      onSubmit={(event) => {
        event.preventDefault()
        const scrapeConfig: ScrapeConfigInput | null = configured
          ? {
              sku: sku.trim(),
              brand: brand.trim(),
              expected_name_tokens: tokens.split(',').map((t) => t.trim()).filter(Boolean),
              pack: {
                commercial_format: format.trim(),
                content_quantity: content,
                content_unit: contentUnit,
                units_per_pack: Number(unitsPerPack),
                base_unit: baseUnit,
                is_variable_weight: variableWeight,
              },
            }
          : null
        const body: SupplierProductCreate = {
          item_id: itemId,
          name_on_site: name.trim(),
          url: url.trim(),
          pack_quantity: packQuantity,
          min_packs: Number(minPacks),
          is_active: true,
          scrape_config: scrapeConfig,
        }
        create.mutate({ supplierId: supplier.id, body }, { onSuccess: onClose })
      }}
    >
      <h3>Nuevo producto de {supplier.name}</h3>
      <div className="row">
        <label>
          Insumo *
          <select required value={itemId} onChange={(event) => setItemId(Number(event.target.value))}>
            {items.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Nombre en el sitio *
          <input required maxLength={300} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
      </div>
      <label>
        URL del producto *
        <input
          required
          type="url"
          className="mono"
          value={url}
          placeholder={URL_HINT[supplier.adapter ?? ''] ?? 'https://…'}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <div className="row">
        <label>
          Cantidad por formato ({UNIT_LABEL[baseUnit]}) *
          <input
            required
            type="number"
            min={0}
            step="any"
            value={packQuantity}
            placeholder="Ej.: 0,125 para 125 g"
            onChange={(event) => setPackQuantity(event.target.value)}
          />
        </label>
        <label>
          Mínimo de formatos *
          <input required type="number" min={1} step={1} value={minPacks} onChange={(event) => setMinPacks(event.target.value)} />
        </label>
      </div>

      <fieldset className="plain">
        <legend>Configuración para obtener el precio (scraping)</legend>
        <p className="muted small">
          Opcional. Sin ella el producto queda registrado, pero al actualizar precios se informa «falta configurar». Si
          completas un campo, completa todos.
        </p>
        <div className="row">
          <label>
            SKU
            <input required={configured} value={sku} onChange={(event) => setSku(event.target.value)} />
          </label>
          <label>
            Marca
            <input required={configured} value={brand} onChange={(event) => setBrand(event.target.value)} />
          </label>
        </div>
        <label>
          Palabras esperadas en el nombre (separadas por coma)
          <input required={configured} value={tokens} placeholder="pech, pollo, asada" onChange={(event) => setTokens(event.target.value)} />
        </label>
        <div className="row">
          <label className="grow">
            Formato comercial
            <input required={configured} value={format} placeholder="paquete 125 g" onChange={(event) => setFormat(event.target.value)} />
          </label>
          <label>
            Contenido
            <input required={configured} type="number" min={0} step="any" value={content} onChange={(event) => setContent(event.target.value)} />
          </label>
          <label>
            Unidad del contenido
            <select required={configured} value={contentUnit} onChange={(event) => setContentUnit(event.target.value)}>
              <option value="">—</option>
              {['g', 'kg', 'mL', 'L', 'unidad'].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Unidades por paquete
            <input type="number" min={1} step={1} value={unitsPerPack} onChange={(event) => setUnitsPerPack(event.target.value)} />
          </label>
        </div>
        {baseUnit === 'kg' && (
          <label className="checkbox">
            <input type="checkbox" checked={variableWeight} onChange={(event) => setVariableWeight(event.target.checked)} />
            Peso variable (al recibir se registra el peso medido)
          </label>
        )}
      </fieldset>

      {create.error && <ErrorMessage error={create.error} />}
      <div className="actions">
        <button type="submit" disabled={create.isPending || items.length === 0}>
          {create.isPending ? 'Guardando…' : 'Agregar producto'}
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
