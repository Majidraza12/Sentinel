import { motion } from 'motion/react'
import { api, pct, type Metrics, type MetricRow } from '../lib/api'
import { useAsync } from '../lib/hooks'
import Panel from '../components/Panel'
import LineChart, { type Series } from '../components/charts/LineChart'
import { MODEL_COLOR, MODEL_NAME } from '../lib/models'


export default function ResultsPage() {
  const { data, error, loading } = useAsync(api.metrics)

  if (loading) return <p className="label-mono py-20 text-center">Loading metrics…</p>
  if (error || !data) return <p className="py-20 text-center text-violent">Could not load metrics: {error?.message}</p>

  return (
    <div className="flex flex-col gap-10">
      <header className="border-b border-line pb-6">
        <div className="label-mono mb-2 !text-amber">Evaluation · held-out test set</div>
        <h1 className="font-display text-[42px] font-black uppercase leading-[0.9] tracking-wide sm:text-[56px]">
          How well does it work?
        </h1>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-ink-2">
          Every number on this page is read live from the experiment logs in <code className="font-mono text-[12px] text-ink">outputs/</code>.
          Nothing is hand-typed. The test set is small (53 clips), so the ablation is reported as mean ± std over 3 seeds.
        </p>
      </header>

      <HeadlineStats data={data} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] [&>*]:min-w-0">
        <Panel title="Confusion matrix · CNN-LSTM (weighted)" code="A" bodyClassName="p-5">
          {data.headline.confusion ? (
            <ConfusionMatrix cm={data.headline.confusion} />
          ) : (
            <p className="text-sm text-muted">Run <code>python server/precompute.py</code> to generate.</p>
          )}
        </Panel>
        <Panel title="Ablation · does the LSTM help?" code="B" bodyClassName="p-5">
          <Ablation rows={data.ablation} />
        </Panel>
      </div>

      <Panel title="Training dynamics · loss per epoch, 3 seeds each" code="C" bodyClassName="p-5">
        <TrainingCurves data={data} />
      </Panel>

      <Limitations />
    </div>
  )
}

function HeadlineStats({ data }: { data: Metrics }) {
  const r = data.headline.report
  const stats = [
    { k: 'Test accuracy', v: pct(r.accuracy, 0), sub: `${r.support} held-out clips` },
    { k: 'Violent recall', v: pct(r.violent.recall, 0), sub: 'incidents caught' },
    { k: 'Violent precision', v: pct(r.violent.precision, 0), sub: 'alerts that were real' },
    { k: 'Non-violent recall', v: pct(r['non-violent'].recall, 0), sub: 'the weak spot', warn: true },
  ]
  return (
    <div className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
      {stats.map((s, i) => (
        <motion.div
          key={s.k}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07 }}
          className="bg-panel px-5 py-5"
        >
          <div className="label-mono">{s.k}</div>
          <div className={`mt-2 font-display text-[54px] font-black leading-none tabular-nums ${s.warn ? 'text-amber' : 'text-ink'}`}>
            {s.v}
          </div>
          <div className="mt-1.5 text-[12px] text-muted">{s.sub}</div>
        </motion.div>
      ))}
    </div>
  )
}

function ConfusionMatrix({ cm }: { cm: number[][] }) {
  const labels = ['Non-violent', 'Violent']
  const max = Math.max(...cm.flat())
  const total = cm.flat().reduce((a, b) => a + b, 0)
  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-[2px]">
        <div />
        {labels.map((l) => (
          <div key={l} className="label-mono pb-2 text-center">
            Pred. {l}
          </div>
        ))}
        {cm.map((row, i) => (
          <div key={i} className="contents">
            <div className="label-mono flex items-center justify-end pr-3 text-right">
              True
              <br />
              {labels[i]}
            </div>
            {row.map((v, j) => {
              const correct = i === j
              const intensity = 0.12 + (v / max) * 0.55
              return (
                <div
                  key={j}
                  title={`True ${labels[i]}, predicted ${labels[j]}: ${v} clips`}
                  className="relative flex aspect-[4/3] flex-col items-center justify-center"
                  style={{
                    background: correct
                      ? `color-mix(in oklab, var(--color-calm) ${intensity * 100}%, var(--color-panel))`
                      : `color-mix(in oklab, var(--color-violent) ${intensity * 100}%, var(--color-panel))`,
                  }}
                >
                  <span className="font-display text-[44px] font-black leading-none tabular-nums text-ink">{v}</span>
                  <span className="mt-1 font-mono text-[10px] text-ink-2">
                    {correct ? '✓ correct' : '✗ error'} · {pct(v / total, 0)}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
        Misses are lopsided. Only <span className="text-ink">{cm[1][0]}</span> of {cm[1][0] + cm[1][1]} violent clips slip
        through, but <span className="text-ink">{cm[0][1]}</span> of {cm[0][0] + cm[0][1]} calm clips raise a false alarm.
        Class-weighted loss tilts the model toward catching incidents.
      </p>
    </div>
  )
}

function Ablation({ rows }: { rows: MetricRow[] }) {
  const lo = 0.8
  const hi = 1.0
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  const keyOf = (name: string) => (name.startsWith('CNN-LSTM') ? 'cnn_lstm' : 'frame_mean')

  return (
    <div>
      <div className="mb-1 grid grid-cols-[84px_1fr] items-end gap-3 pr-12 sm:grid-cols-[110px_1fr] sm:gap-4">
        <div />
        <div className="relative h-5">
          {[0.8, 0.85, 0.9, 0.95, 1.0].map((t) => (
            <span key={t} className="absolute -translate-x-1/2 font-mono text-[9px] text-muted" style={{ left: pos(t) }}>
              {Math.round(t * 100)}%
            </span>
          ))}
        </div>
      </div>
      {rows.map((r) => {
        const key = keyOf(String(r.model))
        const metrics: [string, number, number][] = [
          ['Test acc', Number(r.test_acc_mean), Number(r.test_acc_std)],
          ['Val acc', Number(r.val_acc_mean), Number(r.val_acc_std)],
          ['Violent F1', Number(r.violent_f1_mean), Number(r.violent_f1_std)],
        ]
        return (
          <div key={key} className="border-t border-line py-3">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="h-2 w-2" style={{ background: MODEL_COLOR[key] }} />
              <span className="text-ink">{MODEL_NAME[key]}</span>
              <span className="font-mono text-[10px] text-muted">{Number(r.num_params).toLocaleString()} params</span>
            </div>
            {metrics.map(([label, mean, std]) => (
              <div key={label} className="grid grid-cols-[84px_1fr] items-center gap-3 py-1 pr-12 sm:grid-cols-[110px_1fr] sm:gap-4">
                <span className="label-mono !text-[9px]">{label}</span>
                <div className="relative h-4" title={`${label}: ${pct(mean)} ± ${pct(std)}`}>
                  {[0.8, 0.85, 0.9, 0.95, 1.0].map((t) => (
                    <span key={t} className="absolute inset-y-0 w-px bg-line" style={{ left: pos(t) }} />
                  ))}
                  <span
                    className="absolute top-1/2 h-[2px] -translate-y-1/2"
                    style={{
                      left: pos(Math.max(mean - std, lo)),
                      width: `calc(${pos(Math.min(mean + std, hi))} - ${pos(Math.max(mean - std, lo))})`,
                      background: MODEL_COLOR[key],
                    }}
                  />
                  <span
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel"
                    style={{ left: pos(mean), background: MODEL_COLOR[key] }}
                  />
                  <span
                    className="absolute top-1/2 -translate-y-1/2 pl-3 font-mono text-[10px] tabular-nums text-ink-2"
                    style={{ left: pos(Math.min(mean + std, hi)) }}
                  >
                    {pct(mean)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      })}
      <div className="mt-2 border-l-2 border-amber bg-amber/5 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        <span className="font-medium text-ink">Finding: no.</span> Averaging frame features matches the LSTM within
        seed noise, with 7% fewer parameters and half the variance. At this data scale the signal is in single-frame
        appearance, not temporal order. Dots are means, bars are ±1 std over 3 seeds.
      </div>
    </div>
  )
}

function TrainingCurves({ data }: { data: Metrics }) {
  // Shared y-scale across both small multiples so they're comparable.
  const maxLoss = Math.max(
    ...Object.values(data.histories).flat().flatMap((r) => [Number(r.val_loss), Number(r.train_loss)]),
  )
  const yMax = Math.ceil(maxLoss / 0.2) * 0.2
  const yTicks = Array.from({ length: Math.round(yMax / 0.2) + 1 }, (_, i) => +(i * 0.2).toFixed(1))

  const bestEpoch = (run: string, seed: number) =>
    Number(data.runs.find((r) => r.run_name === run && Number(r.seed) === seed)?.best_epoch)

  const panel = (model: 'cnn_lstm' | 'frame_mean') => {
    const series: Series[] = []
    for (const seed of [0, 1, 2]) {
      const h = data.histories[`${model}_seed${seed}`]
      if (!h) continue
      const best = bestEpoch(model, seed)
      const bestRow = h.find((r) => Number(r.epoch) === best)
      series.push({
        id: `val-${seed}`,
        label: `Val · seed ${seed}`,
        color: MODEL_COLOR[model],
        opacity: 1 - seed * 0.22,
        points: h.map((r) => ({ x: Number(r.epoch), y: Number(r.val_loss) })),
        marker: bestRow ? { x: best, y: Number(bestRow.val_loss) } : undefined,
      })
      series.push({
        id: `train-${seed}`,
        label: `Train · seed ${seed}`,
        color: 'var(--color-ink-2)',
        dashed: true,
        opacity: 0.75 - seed * 0.2,
        points: h.map((r) => ({ x: Number(r.epoch), y: Number(r.train_loss) })),
      })
    }
    return (
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <span className="h-2 w-2" style={{ background: MODEL_COLOR[model] }} />
          {MODEL_NAME[model]}
        </div>
        <LineChart
          series={series}
          xLabel="Epoch"
          yLabel="Loss"
          xTicks={[1, 2, 3, 4, 5]}
          yDomain={[0, yMax]}
          yTicks={yTicks}
          formatY={(v) => v.toFixed(2)}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-ink-2">
        <span className="flex items-center gap-2">
          <svg width="22" height="8" aria-hidden>
            <line x1="0" x2="22" y1="4" y2="4" stroke="var(--color-ink-2)" strokeWidth="2" />
          </svg>
          Validation loss (model color)
        </span>
        <span className="flex items-center gap-2">
          <svg width="22" height="8" aria-hidden>
            <line x1="0" x2="22" y1="4" y2="4" stroke="var(--color-ink-2)" strokeWidth="2" strokeDasharray="5 4" />
          </svg>
          Training loss
        </span>
        <span className="flex items-center gap-2">
          <svg width="12" height="12" aria-hidden>
            <circle cx="6" cy="6" r="4.5" fill="var(--color-panel)" stroke="var(--color-ink-2)" strokeWidth="2" />
          </svg>
          Checkpoint kept (best validation loss)
        </span>
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        {panel('cnn_lstm')}
        {panel('frame_mean')}
      </div>
      <p className="mt-5 max-w-3xl text-[13px] leading-relaxed text-ink-2">
        Training loss keeps falling while validation loss bottoms out early. The CNN-LSTM memorizes its 245 training
        clips within 1–2 epochs. That's why every run keeps the checkpoint with the best validation loss instead of the
        last epoch.
      </p>
    </div>
  )
}

function Limitations() {
  const items = [
    {
      t: 'Small test set',
      d: '53 clips. One clip is about 1.9 points of accuracy, so treat every number as indicative, not definitive.',
    },
    {
      t: 'Cross-camera leakage',
      d: 'Each event was filmed by two cameras and splits were made per clip. For most test events, the other camera’s view is in the training set, so test scores are likely optimistic.',
    },
    {
      t: 'Overfitting',
      d: 'A full ResNet-18 fine-tuned on 245 clips memorizes them. Best-by-val checkpointing reduces the damage but doesn’t remove it.',
    },
    {
      t: 'Narrow domain',
      d: 'Trained on staged, fixed-camera clips. Expect worse results on phone footage, crowds, or very different lighting.',
    },
  ]
  return (
    <section>
      <div className="label-mono mb-4 !text-amber">Honest limitations</div>
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.t} className="bg-panel p-5">
            <h3 className="font-display text-xl font-bold uppercase tracking-wide">{it.t}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{it.d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
