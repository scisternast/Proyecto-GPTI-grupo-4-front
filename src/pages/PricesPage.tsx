import { Link } from 'react-router'
import { type PricesView, useAllProducts, useAllScrapeRuns, useItem, usePrices, useRefreshPrices } from '../api/queries'
import type { ItemState, PriceOffer, PriceState, ScrapeRun, Supplier, SupplierProduct } from '../api/types'
import { HorizontalBars } from '../components/Charts'
import { Badge, ErrorMessage, Loading, PageHeader } from '../components/Feedback'
import { ItemSelect } from '../components/ItemSelect'
import { dayKey, formatCLP, formatDateTime, formatPercent, formatQuantity, formatShortDate, todayKey, UNIT_LABEL } from '../lib/format'
import { lastResultFor, PRICE_STATE, scrapeErrorMessage } from '../lib/procurement'
import { useSelectedItem } from '../state/useSelectedItem'

// Mockup «Comparar precios». Precios con IVA (C14), sin despacho (C4), solo vigentes y con al menos
// 2 proveedores distintos (Arquitectura.md §4.3). La comparación la calcula el backend.
export function PricesPage() {
  const { id } = useSelectedItem()
  const item = useItem(id)
  const prices = usePrices(id)
  const refresh = useRefreshPrices()
  const catalog = useAllProducts()
  const runs = useAllScrapeRuns((catalog.suppliers.data ?? []).map((s) => s.id))
  const data = prices.data
  const lastObserved = data?.offers
    .map((o) => o.observed_at)
    .filter((d): d is string => d !== null)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0]

  return (
    <section>
      <ItemSelect />
      <PageHeader
        eyebrow={
          item.data &&
          data &&
          `${item.data.name} · ${data.required_quantity === null ? 'cantidad no calculable' : `${formatQuantity(data.required_quantity, item.data.base_unit)} a comprar`}`
        }
        title="Comparar precios"
        actions={
          <>
            {lastObserved && <span className="muted small">Última obtención: {relativeDateTime(lastObserved)}</span>}
            <button
              className="secondary"
              disabled={id === null || refresh.isPending}
              onClick={() => id !== null && refresh.mutate(id)}
            >
              ↻ {refresh.isPending ? 'Consultando sitios…' : 'Volver a obtener precios'}
            </button>
          </>
        }
      />
      {refresh.isPending && (
        <p className="notice small">
          Se consultan las páginas públicas de cada proveedor con pausas de 2 segundos: puede tardar un poco.
        </p>
      )}
      {refresh.error && <ErrorMessage error={refresh.error} />}
      {prices.isPending && id !== null && <Loading />}
      {prices.error && <ErrorMessage error={prices.error} />}
      {data && item.data && (
        <Comparison
          item={item.data}
          data={data}
          suppliers={catalog.suppliers.data ?? []}
          products={catalog.products}
          runs={runs}
        />
      )}
    </section>
  )
}

interface ComparisonProps {
  item: ItemState
  data: PricesView
  suppliers: Supplier[]
  products: SupplierProduct[]
  runs: Map<number, ScrapeRun[]>
}

function Comparison({ item, data, suppliers, products, runs }: ComparisonProps) {
  const unit = UNIT_LABEL[item.base_unit]
  const qty = data.required_quantity === null ? null : formatQuantity(data.required_quantity, item.base_unit)
  const { comparison } = data
  const optionFor = (offer: PriceOffer) => comparison.options.find((o) => o.supplier_product_id === offer.supplier_product_id)
  const best = comparison.recommended
  const nextBest =
    best && comparison.options.find((o) => o.supplier_id !== best.supplier_id && o.total_clp === comparison.next_best_total_clp)
  const product = new Map(products.map((p) => [p.id, p]))
  const leadTime = new Map(suppliers.map((s) => [s.id, s.lead_time_days]))
  const expired = data.offers.filter((o) => o.state === 'EXPIRED')
  const currentSuppliers = new Set(comparison.options.map((o) => o.supplier_id)).size

  if (data.offers.length === 0) {
    return (
      <div className="card">
        <p className="muted">
          {item.name} todavía no tiene productos de proveedores. Regístralos en Configuración → Proveedores para obtener
          precios.
        </p>
      </div>
    )
  }

  return (
    <>
      {expired.map((offer) => (
        <div key={offer.supplier_product_id} className="banner banner-warn">
          <span className="banner-icon" aria-hidden>
            ◷
          </span>
          <p>
            <strong>{offer.supplier} quedó fuera de la comparación.</strong> Su último precio scrapeado (
            {formatShortDate(offer.observed_at)}) venció el {formatShortDate(offer.valid_until)}.
            {comparison.status === 'COMPARABLE_WITH_CONTEXT_ASSUMPTIONS' &&
              ` La sugerencia usa los ${comparison.options.length} precios vigentes.`}
          </p>
        </div>
      ))}
      <ComparisonStatus status={comparison.status} currentSuppliers={currentSuppliers} />

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="num">Precio / {unit} (IVA incl.)</th>
                <th>Fecha</th>
                <th>Vigente hasta</th>
                <th className="num">Total{qty && ` (${qty})`}</th>
                <th>Entrega</th>
                <th>Estado del precio</th>
              </tr>
            </thead>
            <tbody>
              {data.offers.map((offer) => {
                const option = optionFor(offer)
                const isBest = best?.supplier_product_id === offer.supplier_product_id
                const info = product.get(offer.supplier_product_id)
                return (
                  <tr key={offer.supplier_product_id} className={isBest ? 'selected' : option ? undefined : 'muted-row'}>
                    <td>
                      <strong>{offer.supplier}</strong>
                      {isBest && (
                        <div>
                          <Badge tone="primary">Más conveniente</Badge>
                        </div>
                      )}
                      {info && (
                        <small className="block muted">
                          <a href={info.url} target="_blank" rel="noreferrer">
                            {info.name_on_site}
                          </a>
                        </small>
                      )}
                    </td>
                    <td className="num mono">{formatCLP(offer.unit_price_clp)}</td>
                    <td>{formatShortDate(offer.observed_at)}</td>
                    <td>{formatShortDate(offer.valid_until)}</td>
                    <td className="num mono">
                      {option ? (
                        <>
                          {isBest ? <strong>{formatCLP(option.total_clp)}</strong> : formatCLP(option.total_clp)}
                          <small className="block muted">
                            {option.packs} × {formatQuantity(offer.pack_quantity, item.base_unit)}
                          </small>
                        </>
                      ) : (
                        'Excluido'
                      )}
                    </td>
                    <td>{leadTime.has(offer.supplier_id) ? `${leadTime.get(offer.supplier_id)} días` : '—'}</td>
                    <td>
                      <PriceStatus offer={offer} runs={runs.get(offer.supplier_id) ?? []} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="split split-even">
        <div className="card">
          <h2>Total por proveedor{qty && ` (${qty})`}</h2>
          {comparison.options.length > 0 ? (
            <HorizontalBars
              label={`Total por proveedor${qty ? ` para ${qty}` : ''}`}
              data={comparison.options.map((option) => ({
                key: option.supplier_product_id,
                label: option.supplier,
                value: Number(option.total_clp),
                valueLabel: formatCLP(option.total_clp),
                highlight: option.supplier_product_id === best?.supplier_product_id,
                detail: `${option.packs} formatos · ${formatQuantity(option.purchased_quantity, item.base_unit)}`,
              }))}
            />
          ) : (
            <p className="muted">No hay precios vigentes para calcular totales.</p>
          )}
          <ul className="hbars">
            {data.offers
              .filter((offer) => !optionFor(offer))
              .map((offer) => (
                <li key={offer.supplier_product_id} className="muted">
                  <strong>{offer.supplier}</strong>
                  <span className="small">{PRICE_STATE[offer.state as PriceState]?.label ?? offer.state}, excluido</span>
                </li>
              ))}
          </ul>
          <p className="footnote">
            Total = precio del formato × formatos completos para cubrir la cantidad sugerida. Los precios incluyen IVA,
            tal como los publican los sitios de los proveedores. Cada precio se obtiene por Web Scraping y vale 7 días;
            si el sitio falla se usa el último precio mientras siga vigente. El despacho no se incluye porque el
            scraping no lo obtiene.
          </p>
        </div>

        <div className="card savings">
          <h2>Ahorro frente a la siguiente mejor opción vigente</h2>
          {best && nextBest && comparison.savings_clp !== undefined ? (
            <>
              <p className="hero-figure">
                {formatCLP(comparison.savings_clp)} <small>{formatPercent(comparison.potential_savings_percent)}</small>
              </p>
              <p className="muted">
                Comprando {formatQuantity(best.purchased_quantity, item.base_unit)} a {best.supplier} (
                {formatCLP(best.total_clp)}) en lugar de {nextBest.supplier} ({formatCLP(nextBest.total_clp)}).
              </p>
            </>
          ) : (
            <p className="muted">Se necesitan precios vigentes de al menos 2 proveedores para calcular el ahorro.</p>
          )}
          <Link className="button block" to="/ordenes">
            Ver orden sugerida
          </Link>
        </div>
      </div>
    </>
  )
}

function ComparisonStatus({ status, currentSuppliers }: { status: PricesView['comparison']['status']; currentSuppliers: number }) {
  if (status === 'INSUFFICIENT_CURRENT_PRICES') {
    return (
      <div className="banner banner-warn">
        <p>
          <strong>No se puede comparar:</strong> hay precios vigentes de {currentSuppliers}{' '}
          {currentSuppliers === 1 ? 'proveedor' : 'proveedores'}; se necesitan al menos 2 proveedores distintos.
        </p>
      </div>
    )
  }
  if (status === 'NO_PURCHASE_REQUIRED') {
    return (
      <div className="banner banner-info">
        <p>
          <strong>No hace falta comprar ahora:</strong> la cantidad sugerida es 0 (stock suficiente u orden en tránsito).
        </p>
      </div>
    )
  }
  if (status === 'INSUFFICIENT_HISTORY') {
    return (
      <div className="banner">
        <p>Aún no hay consumo calculable: no se puede estimar la cantidad a comprar ni recomendar un proveedor.</p>
      </div>
    )
  }
  return null
}

function PriceStatus({ offer, runs }: { offer: PriceOffer; runs: ScrapeRun[] }) {
  const state = PRICE_STATE[offer.state as PriceState] ?? { label: offer.state, tone: 'muted' as const }
  const last = lastResultFor(runs, offer.supplier_product_id)
  const failed = last?.result.status === 'ERROR'
  const when = last ? (dayKey(last.run.started_at) === todayKey() ? 'hoy' : `el ${formatShortDate(last.run.started_at)}`) : ''

  if (offer.state === 'CURRENT') {
    return failed ? (
      <div className="stack-tight">
        <Badge tone="warn">Scraping falló {when}</Badge>
        <small className="muted">
          Se usa precio del {formatShortDate(offer.observed_at)}, vigente hasta el {formatShortDate(offer.valid_until)}
        </small>
      </div>
    ) : (
      <small className="muted">
        {last ? 'Scraping correcto' : 'Obtenido'} · {relativeDateTime(offer.observed_at!)}
      </small>
    )
  }
  return (
    <div className="stack-tight">
      <Badge tone={state.tone}>{state.label}</Badge>
      <small className="muted">
        {failed ? scrapeErrorMessage(last.result.error_code) : offer.state === 'MISSING' ? 'Aún no se obtiene precio' : 'Excluido de la comparación'}
      </small>
    </div>
  )
}

/** «hoy 09:40» o «28/09 · 09:40». */
function relativeDateTime(value: string) {
  const text = formatDateTime(value)
  return dayKey(value) === todayKey() ? `hoy ${text.split(' · ')[1]}` : text
}
