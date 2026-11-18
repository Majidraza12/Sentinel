import { motion } from 'motion/react'
import { pct, type Prediction } from '../../lib/api'
import { MODEL_NAME } from '../../lib/models'

function insight(r: Prediction) {
  const ps = r.frames.map((f) => f.p_violent)
  if (r.model.timeline_kind === 'running') {
    const isFinal = (p: number) => (p >= 0.5) === (r.label === 'Violent')
    // Last frame where the running belief was on the other side of 0.5.
    let lastOther = -1
    ps.forEach((p, i) => {
      if (!isFinal(p)) lastOther = i
    })
    const flips = ps.slice(1).filter((p, i) => p >= 0.5 !== ps[i] >= 0.5).length
    if (lastOther === -1) return `Leaned ${r.label.toLowerCase()} from the first frame and never changed its mind.`
    return `Settled on ${r.label.toLowerCase()} at frame ${lastOther + 2} of ${ps.length}` +
      (flips > 1 ? `, after changing its mind ${flips} times.` : '.')
  }
  const hot = ps.filter((p) => p >= 0.5).length
  return `${hot} of ${ps.length} frames look violent on their own. The verdict uses the average of the frame features.`
}

export default function Verdict({ result }: { result: Prediction }) {
  const violent = result.label === 'Violent'
  const gt = result.source.ground_truth
  const correct = gt ? gt === result.label : null

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="label-mono mb-2">Verdict · {MODEL_NAME[result.model.id] ?? result.model.name}</div>
        <motion.div
          key={result.model.id + result.source.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-end gap-3"
        >
          <span
            className={`font-display text-[56px] font-black uppercase leading-[0.85] tracking-wide sm:text-[64px] ${
              violent ? 'text-violent' : 'text-calm'
            }`}
          >
            {violent ? 'Violent' : 'Non-violent'}
          </span>
        </motion.div>
        <div className="mt-2 font-mono text-[12px] text-ink-2">
          confidence <span className="text-ink tabular-nums">{pct(result.confidence)}</span>
        </div>
      </div>

      {/* P(violent) gauge with the decision threshold */}
      <div>
        <div className="mb-1.5 flex justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
          <span>Non-violent</span>
          <span>P(violent) {pct(result.p_violent)}</span>
          <span>Violent</span>
        </div>
        <div className="relative h-2.5 bg-panel-2">
          <div className="absolute inset-y-0 left-1/2 w-px bg-amber/70" />
          <motion.div
            className={`absolute inset-y-0 ${violent ? 'bg-violent' : 'bg-calm'}`}
            initial={false}
            animate={
              violent
                ? { left: '50%', width: `${(result.p_violent - 0.5) * 100}%` }
                : { left: `${result.p_violent * 100}%`, width: `${(0.5 - result.p_violent) * 100}%` }
            }
            transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          />
          <motion.div
            className="absolute -top-1 h-[18px] w-[3px] bg-ink"
            initial={false}
            animate={{ left: `calc(${result.p_violent * 100}% - 1.5px)` }}
            transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          />
        </div>
      </div>

      {gt && (
        <div
          className={`flex items-center gap-3 border px-3 py-2.5 text-[13px] ${
            correct ? 'border-calm/40 bg-calm/5' : 'border-amber/50 bg-amber/5'
          }`}
        >
          <span className={`font-mono text-base ${correct ? 'text-calm' : 'text-amber'}`}>{correct ? '✓' : '✗'}</span>
          <span className="text-ink-2">
            Ground truth: <span className="text-ink">{gt}</span>.{' '}
            {correct ? 'The model got this one right.' : 'The model got this one wrong.'}
          </span>
        </div>
      )}

      <p className="text-[13px] leading-relaxed text-ink-2">{insight(result)}</p>
    </div>
  )
}

export function Telemetry({ result }: { result: Prediction }) {
  const v = result.video
  const items: [string, string][] = [
    ['Decode', `${result.timing_ms.decode.toFixed(0)} ms`],
    ['Inference', `${result.timing_ms.inference.toFixed(0)} ms`],
    ['Device', result.device.toUpperCase()],
    ['Source', `${v.total_frames} fr @ ${v.fps.toFixed(0)} fps`],
    ['Resolution', `${v.width}×${v.height}`],
    ['Sampled', `${result.frames.length} frames`],
  ]
  return (
    <dl className="grid grid-cols-3 gap-px border border-line bg-line sm:grid-cols-6">
      {items.map(([k, val]) => (
        <div key={k} className="bg-panel px-3 py-2.5">
          <dt className="label-mono !text-[9px]">{k}</dt>
          <dd className="mt-1 truncate font-mono text-[12px] tabular-nums text-ink">{val}</dd>
        </div>
      ))}
    </dl>
  )
}
