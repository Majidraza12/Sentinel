import { useState } from 'react'
import { useElementWidth } from '../../lib/hooks'

export interface Series {
  id: string
  label: string
  color: string
  dashed?: boolean
  opacity?: number
  points: { x: number; y: number }[]
  /** Highlighted point (e.g. best epoch), drawn as a ring. */
  marker?: { x: number; y: number }
}

interface Props {
  series: Series[]
  height?: number
  xLabel: string
  yLabel: string
  xTicks: number[]
  yDomain: [number, number]
  yTicks: number[]
  formatY?: (v: number) => string
  formatX?: (v: number) => string
}

const PAD = { t: 10, r: 12, b: 42, l: 44 }

/** Small SVG line chart with a crosshair + tooltip on the nearest x. */
export default function LineChart({
  series,
  height = 236,
  xLabel,
  yLabel,
  xTicks,
  yDomain,
  yTicks,
  formatY = (v) => v.toFixed(2),
  formatX = (v) => String(v),
}: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hoverX, setHoverX] = useState<number | null>(null)

  const [x0, x1] = [Math.min(...xTicks), Math.max(...xTicks)]
  const innerW = Math.max(width - PAD.l - PAD.r, 1)
  const innerH = height - PAD.t - PAD.b
  const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0 || 1)) * innerW
  const sy = (v: number) => PAD.t + (1 - (v - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerH

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const v = x0 + ((e.clientX - rect.left) / rect.width) * (x1 - x0)
    setHoverX(xTicks.reduce((best, t) => (Math.abs(t - v) < Math.abs(best - v) ? t : best), xTicks[0]))
  }

  const tooltipRows =
    hoverX === null
      ? []
      : series
          .map((s) => ({ s, p: s.points.find((p) => p.x === hoverX) }))
          .filter((r): r is { s: Series; p: { x: number; y: number } } => !!r.p)

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} className="block" role="img" aria-label={`${yLabel} by ${xLabel}`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={width - PAD.r} y1={sy(t)} y2={sy(t)} stroke="var(--color-line)" />
              <text x={PAD.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="fill-muted font-mono text-[9px]">
                {formatY(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={sx(t)} y={height - PAD.b + 16} textAnchor="middle" className="fill-muted font-mono text-[9px]">
              {formatX(t)}
            </text>
          ))}
          <text x={PAD.l + innerW / 2} y={height - 4} textAnchor="middle" className="fill-muted font-mono text-[9px] uppercase tracking-[0.14em]">
            {xLabel}
          </text>

          {hoverX !== null && (
            <line x1={sx(hoverX)} x2={sx(hoverX)} y1={PAD.t} y2={PAD.t + innerH} stroke="var(--color-ink-2)" strokeOpacity="0.45" />
          )}

          {series.map((s) => (
            <g key={s.id} opacity={s.opacity ?? 1}>
              <path
                d={s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join('')}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '5 4' : undefined}
              />
              {hoverX !== null &&
                s.points
                  .filter((p) => p.x === hoverX)
                  .map((p) => (
                    <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r="4" fill={s.color} stroke="var(--color-panel)" strokeWidth="2" />
                  ))}
              {s.marker && (
                <circle cx={sx(s.marker.x)} cy={sy(s.marker.y)} r="5.5" fill="var(--color-panel)" stroke={s.color} strokeWidth="2" />
              )}
            </g>
          ))}

          <rect
            x={PAD.l}
            y={PAD.t}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHoverX(null)}
          />
        </svg>
      )}

      {hoverX !== null && tooltipRows.length > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[170px] border border-line-2 bg-bg/95 px-3 py-2 shadow-xl"
          style={{ left: Math.min(sx(hoverX) + 10, width - 180) }}
        >
          <div className="label-mono mb-1">
            {xLabel} {formatX(hoverX)}
          </div>
          {tooltipRows.map(({ s, p }) => (
            <div key={s.id} className="flex items-center justify-between gap-4 text-[11px]">
              <span className="flex items-center gap-1.5 text-ink-2">
                <svg width="12" height="6" aria-hidden>
                  <line x1="0" x2="12" y1="3" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '3 2' : undefined} />
                </svg>
                {s.label}
              </span>
              <span className="font-mono tabular-nums text-ink">{formatY(p.y)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
