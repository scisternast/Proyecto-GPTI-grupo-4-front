import { useState } from 'react'

export interface BarDatum {
  key: string | number
  label: string
  value: number
  /** Texto del valor (ya formateado) que va junto a la barra. */
  valueLabel: string
  /** La barra destacada (la recomendada, el conteo más reciente). */
  highlight?: boolean
  /** Detalle extra para el tooltip. */
  detail?: string
}

/** Barras horizontales desde cero, con el valor al final de cada barra (Precios: total por proveedor). */
export function HorizontalBars({ data, label }: { data: BarDatum[]; label: string }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <ul className="hbars" aria-label={label}>
      {data.map((d) => (
        <li key={d.key} title={d.detail ? `${d.label}: ${d.valueLabel} · ${d.detail}` : `${d.label}: ${d.valueLabel}`}>
          <strong>{d.label}</strong>
          <span className="hbar-track">
            <span className={`hbar${d.highlight ? ' hbar-highlight' : ''}`} style={{ width: `${(d.value / max) * 100}%` }} />
          </span>
          <span className="num">{d.valueLabel}</span>
        </li>
      ))}
    </ul>
  )
}

const HEIGHT = 200
const PAD = { top: 24, bottom: 28, left: 36, right: 12 }

/** Columnas verticales desde cero, con el valor sobre cada columna (Métricas: merma por conteo). */
export function ColumnChart({ data, label, formatTick }: { data: BarDatum[]; label: string; formatTick: (v: number) => string }) {
  const [hover, setHover] = useState<BarDatum | null>(null)
  const width = Math.max(320, PAD.left + PAD.right + data.length * 96)
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const ticks = [0, max / 2, max]
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const slot = (width - PAD.left - PAD.right) / Math.max(data.length, 1)
  const barWidth = Math.min(24, slot * 0.6)
  const y = (v: number) => PAD.top + plotHeight * (1 - v / max)

  return (
    <figure className="chart column-chart">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={label}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className="tick" x={PAD.left - 6} y={y(tick)} textAnchor="end" dominantBaseline="middle">
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.left + slot * (i + 0.5)
          const top = y(d.value)
          const h = HEIGHT - PAD.bottom - top
          return (
            <g
              key={d.key}
              tabIndex={0}
              onPointerEnter={() => setHover(d)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(d)}
              onBlur={() => setHover(null)}
            >
              {/* Zona de hover más grande que la barra. */}
              <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotHeight} fill="transparent" />
              <path
                className={`column${d.highlight ? ' column-highlight' : ''}${hover?.key === d.key ? ' column-hover' : ''}`}
                d={roundedTop(cx - barWidth / 2, top, barWidth, h, Math.min(4, h))}
              />
              <text className="annotation" x={cx} y={top - 6} textAnchor="middle">
                {d.valueLabel}
              </text>
              <text className={`tick${d.highlight ? ' tick-strong' : ''}`} x={cx} y={HEIGHT - 8} textAnchor="middle">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      {hover && (
        <div
          className="chart-tooltip"
          style={{ left: `${((PAD.left + slot * (data.indexOf(hover) + 0.5)) / width) * 100}%` }}
        >
          <strong>{hover.valueLabel}</strong>
          <span>
            {hover.label}
            {hover.detail && ` · ${hover.detail}`}
          </span>
        </div>
      )}
    </figure>
  )
}

/** Barra con esquinas redondeadas arriba y recta en la base. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return ''
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

function niceMax(value: number) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return ([1, 2, 4, 5, 8, 10].map((m) => m * magnitude).find((m) => m >= value * 1.1) ?? value * 1.2)
}
