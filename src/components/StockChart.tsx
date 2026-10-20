import { useState } from 'react'
import type { ItemState } from '../api/types'
import { dayKey, formatQuantity, formatShortDate, todayKey } from '../lib/format'
import { dailyClosingBalances, type LedgerRow, nextDay } from '../lib/ledger'

const WIDTH = 640
const HEIGHT = 280
const PAD = { top: 28, right: 24, bottom: 32, left: 40 }
const HISTORY_DAYS = 14
const MAX_PROJECTION_DAYS = 30

interface Point {
  day: string
  value: number
  kind: 'registered' | 'projected'
}

/**
 * Stock registrado (sólido) y proyectado (punteado), con el stock seguro y el tiempo de entrega.
 * La proyección usa solo lo que entrega el backend: consumo diario, stock seguro y tiempo de entrega.
 */
export function StockChart({ item, ledger }: { item: ItemState; ledger: LedgerRow[] }) {
  const [hover, setHover] = useState<Point | null>(null)
  const today = todayKey()
  const a = item.assessment
  const unit = item.base_unit
  const stock = Number(item.current_stock)
  const daily = a.daily_average === null ? null : Number(a.daily_average)
  const safe = a.safe_stock === null ? null : Number(a.safe_stock)
  const lead = a.lead_time_days ?? null

  const registered: Point[] = dailyClosingBalances(ledger, nextDay(today, -HISTORY_DAYS)).map((p) => ({
    day: p.day,
    value: p.balance,
    kind: 'registered',
  }))

  const projected: Point[] = []
  if (daily && daily > 0) {
    const days = Math.min(Math.ceil(stock / daily), MAX_PROJECTION_DAYS)
    for (let offset = 1; offset <= days; offset++) {
      projected.push({ day: nextDay(today, offset), value: Math.max(stock - daily * offset, 0), kind: 'projected' })
    }
  }

  const points = [...registered, ...projected]
  if (points.length < 2) {
    return <p className="muted">Aún no hay historia suficiente para graficar.</p>
  }

  const firstDay = points[0].day
  const lastDay = points.at(-1)!.day
  const totalDays = Math.max(daysBetween(firstDay, lastDay), 1)
  const maxValue = Math.max(...points.map((p) => p.value), safe ?? 0) * 1.1 || 1
  const x = (day: string) => PAD.left + (daysBetween(firstDay, day) / totalDays) * (WIDTH - PAD.left - PAD.right)
  const y = (value: number) => PAD.top + (1 - value / maxValue) * (HEIGHT - PAD.top - PAD.bottom)
  const path = (list: Point[]) => list.map((p, i) => `${i ? 'L' : 'M'}${x(p.day)},${y(p.value)}`).join(' ')

  const ticks = niceTicks(maxValue)
  const arrivalDay = lead !== null ? nextDay(today, lead) : null
  const arrival = arrivalDay ? points.find((p) => p.day === arrivalDay) : undefined
  const depletionDay = a.depletion_at && a.depletion_status === 'PROJECTED' ? dayKey(a.depletion_at) : null
  const depletion = depletionDay && depletionDay <= lastDay ? depletionDay : null
  const xLabels = [firstDay, registered[Math.floor(registered.length / 2)]?.day, today, arrivalDay, depletion].filter(
    (d, i, list): d is string => Boolean(d) && list.indexOf(d) === i && d! <= lastDay,
  )

  function onPointerMove(event: React.PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect()
    const svgX = ((event.clientX - box.left) / box.width) * WIDTH
    const nearest = points.reduce((best, p) => (Math.abs(x(p.day) - svgX) < Math.abs(x(best.day) - svgX) ? p : best))
    setHover(nearest)
  }

  return (
    <figure className="chart">
      <ul className="chart-legend">
        <li>
          <span className="key key-solid" /> Registrado
        </li>
        {projected.length > 0 && (
          <li>
            <span className="key key-dashed" /> Proyección
          </li>
        )}
        {safe !== null && (
          <li>
            <span className="key key-safe" /> Stock seguro
          </li>
        )}
        {arrivalDay && (
          <li>
            <span className="key key-band" /> Tiempo de entrega
          </li>
        )}
      </ul>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Stock de ${item.name}: hoy ${formatQuantity(stock, unit)}${depletion ? `, quiebre proyectado el ${formatShortDate(a.depletion_at)}` : ''}.`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className="tick" x={PAD.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
              {formatQuantity(tick)}
            </text>
          </g>
        ))}

        {arrivalDay && arrivalDay <= lastDay && (
          <g>
            <rect className="band" x={x(today)} y={PAD.top} width={x(arrivalDay) - x(today)} height={HEIGHT - PAD.top - PAD.bottom} />
            <text className="annotation" x={(x(today) + x(arrivalDay)) / 2} y={PAD.top - 8} textAnchor="middle">
              Entrega {lead} {lead === 1 ? 'día' : 'días'}
            </text>
          </g>
        )}

        {safe !== null && <line className="safe" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(safe)} y2={y(safe)} />}

        <path className="line" d={path(registered)} />
        {projected.length > 0 && <path className="line projected" d={path([registered.at(-1)!, ...projected])} />}

        <circle className="dot" cx={x(today)} cy={y(stock)} r={4} />
        {arrival && (
          <g>
            <circle className="dot dot-info" cx={x(arrival.day)} cy={y(arrival.value)} r={4} />
            <text className="annotation" x={x(arrival.day) + 8} y={y(arrival.value) - 10}>
              Llega pedido · {formatQuantity(Math.max(0, Number(a.projected_stock_at_arrival ?? arrival.value)))}
            </text>
          </g>
        )}
        {depletion && (
          <g>
            <circle className="dot dot-danger" cx={x(depletion)} cy={y(0)} r={5} />
            <text className="annotation annotation-danger" x={x(depletion) - 10} y={y(0) - 4} textAnchor="end">
              Quiebre
            </text>
          </g>
        )}

        {xLabels.map((day) => (
          <text key={day} className={`tick${day === today ? ' tick-strong' : ''}`} x={x(day)} y={HEIGHT - 10} textAnchor="middle">
            {day === today ? 'Hoy' : formatShortDate(`${day}T12:00:00Z`)}
          </text>
        ))}

        {hover && (
          <g pointerEvents="none">
            <line className="crosshair" x1={x(hover.day)} x2={x(hover.day)} y1={PAD.top} y2={HEIGHT - PAD.bottom} />
            <circle className="dot" cx={x(hover.day)} cy={y(hover.value)} r={4} />
          </g>
        )}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={WIDTH - PAD.left - PAD.right}
          height={HEIGHT - PAD.top - PAD.bottom}
          fill="transparent"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover && (
        <div className="chart-tooltip" style={{ left: `${(x(hover.day) / WIDTH) * 100}%` }}>
          <strong>{formatQuantity(hover.value, unit)}</strong>
          <span>
            {hover.day === today ? 'Hoy' : formatShortDate(`${hover.day}T12:00:00Z`)} ·{' '}
            {hover.kind === 'registered' ? 'registrado' : 'proyectado'}
          </span>
        </div>
      )}
    </figure>
  )
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
}

function niceTicks(max: number): number[] {
  const rough = max / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough
  const ticks: number[] = []
  for (let value = 0; value <= max; value += step) ticks.push(value)
  return ticks
}
