import type { Prediction } from '../../lib/api'
import { pct } from '../../lib/api'
import { useElementWidth } from '../../lib/hooks'
import { MODEL_COLOR, MODEL_NAME } from '../../lib/models'

const SERIES_LABEL: Record<string, string> = {
  running: 'running belief',
  per_frame: 'per-frame score',
}

const H = 190
const PAD_T = 12
const PAD_B = 12
const GUTTER = 44

interface Props {
  primary: Prediction
  compare: Prediction | null
  activeIndex: number | null
  playhead: number | null
  onHover: (i: number | null) => void
  onSeek: (i: number) => void
}

export default function Timeline({ primary, compare, activeIndex, playhead, onHover, onSeek }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const n = primary.frames.length
  const series = [primary, ...(compare ? [compare] : [])]

  const x = (i: number) => ((i + 0.5) / n) * width
  const y = (p: number) => PAD_T + (1 - p) * (H - PAD_T - PAD_B)
  const path = (r: Prediction) => r.frames.map((f, i) => `${i ? 'L' : 'M'}${x(i)},${y(f.p_violent)}`).join('')
  const color = (r: Prediction) => MODEL_COLOR[r.model.id] ?? 'var(--color-amber)'

  const active = activeIndex !== null ? primary.frames[activeIndex] : null

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {series.map((r, k) => (
          <span key={r.model.id} className="flex items-center gap-2 text-[12px] text-ink-2">
            <svg width="22" height="8" aria-hidden>
              <line x1="0" x2="22" y1="4" y2="4" stroke={color(r)} strokeWidth="2" strokeDasharray={k ? '5 3' : undefined} />
            </svg>
            <span className="text-ink">{MODEL_NAME[r.model.id] ?? r.model.name}</span>
            <span className="text-muted">{SERIES_LABEL[r.model.timeline_kind]}</span>
          </span>
        ))}
        <span className="flex items-center gap-2 text-[12px] text-muted">
          <svg width="22" height="8" aria-hidden>
            <line x1="0" x2="22" y1="4" y2="4" stroke="var(--color-amber)" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="2 3" />
          </svg>
          decision threshold 0.5
        </span>
        <span className="label-mono ml-auto !text-[9px]">y = P(violent)</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: `${GUTTER}px 1fr` }}>
        {/* y axis */}
        <div className="relative" style={{ height: H }} aria-hidden>
          {[1, 0.5, 0].map((p) => (
            <span
              key={p}
              className="absolute right-2 -translate-y-1/2 font-mono text-[9px] tabular-nums text-muted"
              style={{ top: y(p) }}
            >
              {p === 1 ? '100%' : p === 0.5 ? '50%' : '0%'}
            </span>
          ))}
        </div>

        {/* chart */}
        <div ref={ref} className="relative" style={{ height: H }} onMouseLeave={() => onHover(null)}>
          {width > 0 && (
            <svg width={width} height={H} className="block overflow-visible" role="img"
              aria-label={`Violence probability across ${n} sampled frames`}>
              <defs>
                <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={color(primary)} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={color(primary)} stopOpacity="0" />
                </linearGradient>
              </defs>

              {[0, 0.25, 0.75, 1].map((p) => (
                <line key={p} x1={0} x2={width} y1={y(p)} y2={y(p)} stroke="var(--color-line)" strokeWidth="1" />
              ))}
              <line x1={0} x2={width} y1={y(0.5)} y2={y(0.5)} stroke="var(--color-amber)" strokeOpacity="0.55"
                strokeDasharray="2 3" />

              {/* hover crosshair */}
              {activeIndex !== null && (
                <line x1={x(activeIndex)} x2={x(activeIndex)} y1={PAD_T - 6} y2={H - PAD_B + 6}
                  stroke="var(--color-ink-2)" strokeOpacity="0.5" />
              )}

              {/* video playhead */}
              {playhead !== null && (
                <g>
                  <line x1={x(playhead)} x2={x(playhead)} y1={0} y2={H} stroke="var(--color-ink)" strokeOpacity="0.85"
                    strokeWidth="1" />
                  <path d={`M${x(playhead) - 4},0 L${x(playhead) + 4},0 L${x(playhead)},6 Z`} fill="var(--color-ink)" />
                </g>
              )}

              <path d={`${path(primary)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill="url(#area-fill)" />

              {series.map((r, k) => (
                <g key={r.model.id}>
                  <path d={path(r)} fill="none" stroke={color(r)} strokeWidth="2" strokeLinejoin="round"
                    strokeDasharray={k ? '5 3' : undefined} />
                  {r.frames.map((f, i) => (
                    <circle key={i} cx={x(i)} cy={y(f.p_violent)} r={i === activeIndex ? 5.5 : 3.5}
                      fill={color(r)} stroke="var(--color-panel)" strokeWidth="2" />
                  ))}
                </g>
              ))}

              {/* hit targets, one column per frame */}
              {primary.frames.map((_, i) => (
                <rect key={i} x={x(i) - width / n / 2} y={0} width={width / n} height={H} fill="transparent"
                  className="cursor-pointer" onMouseEnter={() => onHover(i)} onClick={() => onSeek(i)} />
              ))}
            </svg>
          )}

          {active && activeIndex !== null && width > 0 && (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-[150px] -translate-y-[calc(100%+6px)] border border-line-2 bg-bg/95 px-3 py-2 shadow-xl"
              style={{
                left: Math.min(Math.max(x(activeIndex) - 75, 0), width - 150),
              }}
            >
              <div className="label-mono mb-1.5">
                Frame {activeIndex + 1}/{n}
                {active.time_sec !== null && <> · {active.time_sec.toFixed(2)}s</>}
              </div>
              {series.map((r, k) => (
                <div key={r.model.id} className="flex items-center justify-between gap-4 text-[12px]">
                  <span className="flex items-center gap-1.5 text-ink-2">
                    <svg width="12" height="6" aria-hidden>
                      <line x1="0" x2="12" y1="3" y2="3" stroke={color(r)} strokeWidth="2" strokeDasharray={k ? '3 2' : undefined} />
                    </svg>
                    {MODEL_NAME[r.model.id] ?? r.model.name}
                  </span>
                  <span className="font-mono tabular-nums text-ink">{pct(r.frames[activeIndex].p_violent)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* evidence strip, aligned to the chart columns */}
        <div className="label-mono flex items-center justify-end pr-2 !text-[8px]">Frame</div>
        <div className="mt-2 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {primary.frames.map((f, i) => {
            const isActive = i === activeIndex
            const hot = f.p_violent >= 0.5
            return (
              <button
                key={i}
                onMouseEnter={() => onHover(i)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(i)}
                onBlur={() => onHover(null)}
                onClick={() => onSeek(i)}
                aria-label={`Frame ${i + 1}: ${pct(f.p_violent)} violent. Jump video here.`}
                className={`group relative aspect-square overflow-hidden border transition-all ${
                  isActive ? 'z-10 scale-[1.18] border-amber shadow-lg shadow-black' : 'border-line'
                }`}
              >
                {f.thumbnail ? (
                  <img src={f.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="block h-full w-full bg-panel-2" />
                )}
                <span
                  className={`absolute inset-x-0 bottom-0 h-[3px] ${hot ? 'bg-violent' : 'bg-calm'}`}
                  style={{ opacity: 0.35 + Math.abs(f.p_violent - 0.5) * 1.3 }}
                />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
