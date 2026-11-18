import { motion } from 'motion/react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import Panel from '../components/Panel'
import { REPO_URL } from '../components/Footer'

const STAGES = [
  { k: 'Input', t: 'Video clip', d: 'Any length, any resolution. Typical clip is about 5 s at 15 fps.' },
  { k: 'Sample', t: '16 frames', d: 'Evenly spaced across the whole clip, each resized to 224×224.' },
  { k: 'Encode', t: 'ResNet-18', d: 'ImageNet-pretrained, fine-tuned. The same weights run on every frame, giving one 512-d vector each.' },
  { k: 'Aggregate', t: 'LSTM · 256', d: 'Reads the 16 vectors in order. The ablation swaps this for a plain average.' },
  { k: 'Classify', t: 'Dropout → Linear', d: 'Two logits, then softmax gives P(violent). Threshold 0.5.' },
]

export default function MethodPage() {
  const metrics = useAsync(api.metrics)
  const splits = metrics.data?.dataset.splits

  return (
    <div className="flex flex-col gap-10">
      <header className="border-b border-line pb-6">
        <div className="label-mono mb-2 !text-amber">Method</div>
        <h1 className="font-display text-[42px] font-black uppercase leading-[0.9] tracking-wide sm:text-[56px]">
          From pixels to a verdict
        </h1>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-ink-2">
          A CNN-LSTM in PyTorch. A pretrained image network describes each frame, a recurrent network reads those
          descriptions in order, and a linear head makes the call.
        </p>
      </header>

      {/* model pipeline */}
      <section>
        <div className="label-mono mb-4">Model pipeline</div>
        <ol className="grid gap-px border border-line bg-line md:grid-cols-5">
          {STAGES.map((s, i) => (
            <motion.li
              key={s.k}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="relative bg-panel p-5"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-amber">0{i + 1}</span>
                <span className="label-mono">{s.k}</span>
              </div>
              <div className="mt-3 font-display text-[28px] font-extrabold uppercase leading-none tracking-wide">{s.t}</div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{s.d}</p>
              {i < STAGES.length - 1 && (
                <span className="absolute -right-[9px] top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rotate-45 border-r-2 border-t-2 border-amber bg-panel md:block" />
              )}
            </motion.li>
          ))}
        </ol>
        <TensorShapes />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Data" code="D" bodyClassName="p-5">
          <p className="text-[13px] leading-relaxed text-ink-2">
            About 350 surveillance-style clips of staged fights and normal activity. Each of the 175 events was filmed
            by two cameras. Classes are imbalanced (about 2:1 violent), which is handled with an inverse-frequency
            weighted loss.
          </p>
          {splits && (
            <table className="mt-5 w-full text-left text-[13px]">
              <thead>
                <tr className="label-mono">
                  <th className="pb-2 font-normal">Split</th>
                  <th className="pb-2 text-right font-normal">Violent</th>
                  <th className="pb-2 text-right font-normal">Non-violent</th>
                  <th className="pb-2 text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {Object.entries(splits).map(([name, c]) => (
                  <tr key={name} className="border-t border-line">
                    <td className="py-2 font-sans capitalize text-ink">{name}</td>
                    <td className="py-2 text-right text-ink-2">{c.Violent}</td>
                    <td className="py-2 text-right text-ink-2">{c['Non-Violent']}</td>
                    <td className="py-2 text-right text-ink">{c.Violent + c['Non-Violent']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Experimental discipline" code="E" bodyClassName="p-5">
          <ul className="flex flex-col gap-3 text-[13px] leading-relaxed text-ink-2">
            {[
              ['Seeded runs', 'Python, NumPy, and torch RNGs plus cuDNN determinism, with seeded DataLoader shuffling.'],
              ['Best-by-val checkpoints', 'Keep the epoch with the lowest validation loss, not the last (most overfit) one.'],
              ['Controlled ablation', 'LSTM vs mean-pool. Same backbone, splits, seeds, and hyperparameters. Only the aggregation changes.'],
              ['Mean ± std over seeds', 'Seed noise on 53 clips is as big as the effect being measured, so one run proves nothing.'],
              ['No serve skew', 'This web app samples and preprocesses frames exactly like the evaluation code. Its test-set predictions reproduce the reported 47/53.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-amber" />
                <span>
                  <span className="text-ink">{t}.</span> {d}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="System architecture" code="S" bodyClassName="p-5">
        <SystemDiagram />
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <div className="label-mono mb-3">REST API</div>
            <ul className="flex flex-col gap-1.5 font-mono text-[11.5px]">
              {[
                ['GET', '/api/models', 'available checkpoints'],
                ['GET', '/api/samples', 'held-out test clips + verdicts'],
                ['POST', '/api/samples/{id}/predict', 'score a test clip'],
                ['POST', '/api/predict', 'upload + score a video'],
                ['POST', '/api/uploads/{id}/predict', 're-score with another model'],
                ['GET', '/api/…/preview.webm', 'browser-playable transcode'],
                ['GET', '/api/metrics', 'logged experiment results'],
              ].map(([m, p, d]) => (
                <li key={p} className="flex flex-wrap items-baseline gap-x-3">
                  <span className={`w-10 ${m === 'GET' ? 'text-series-b' : 'text-amber'}`}>{m}</span>
                  <span className="text-ink">{p}</span>
                  <span className="font-sans text-[12px] text-muted">{d}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="label-mono mb-3">Stack</div>
            <div className="flex flex-wrap gap-1.5">
              {['PyTorch', 'torchvision', 'OpenCV', 'scikit-learn', 'FastAPI', 'Uvicorn', 'pytest', 'React 19', 'TypeScript', 'Vite', 'Tailwind CSS', 'Motion', 'Docker'].map((s) => (
                <span key={s} className="border border-line px-2 py-1 font-mono text-[10.5px] text-ink-2">
                  {s}
                </span>
              ))}
            </div>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 border border-amber/60 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-amber transition-colors hover:bg-amber hover:text-bg"
            >
              View source on GitHub ↗
            </a>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function TensorShapes() {
  const shapes = ['[1, 16, 3, 224, 224]', '[16, 512]', '[16, 256]', '[256]', '[2]']
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted">
      <span className="label-mono mr-1">Tensor shapes</span>
      {shapes.map((s, i) => (
        <span key={s} className="flex items-center gap-2">
          <span className="border border-line bg-panel px-2 py-0.5 text-ink-2">{s}</span>
          {i < shapes.length - 1 && <span className="text-amber">→</span>}
        </span>
      ))}
    </div>
  )
}

function SystemDiagram() {
  const box = 'border border-line-2 bg-panel-2 px-4 py-3'
  return (
    <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1.3fr_auto_1fr]">
      <div className={box}>
        <div className="label-mono">Browser</div>
        <div className="mt-1 font-display text-xl font-bold uppercase">React SPA</div>
        <div className="mt-1 text-[12px] text-muted">Vite · TypeScript · Tailwind</div>
      </div>
      <Arrow label="JSON / multipart" />
      <div className={`${box} border-amber/60`}>
        <div className="label-mono !text-amber">Server</div>
        <div className="mt-1 font-display text-xl font-bold uppercase">FastAPI</div>
        <div className="mt-1 text-[12px] text-muted">
          Validates uploads, samples frames, serializes inference behind a lock, transcodes previews to WebM, and serves the built SPA.
        </div>
      </div>
      <Arrow label="tensors" />
      <div className={box}>
        <div className="label-mono">Model</div>
        <div className="mt-1 font-display text-xl font-bold uppercase">PyTorch</div>
        <div className="mt-1 text-[12px] text-muted">2 checkpoints, loaded once at startup</div>
      </div>
    </div>
  )
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <span className="label-mono !text-[8px]">{label}</span>
      <svg width="48" height="10" className="rotate-90 md:rotate-0" aria-hidden>
        <path d="M0 5h44m-5-4 5 4-5 4" stroke="var(--color-amber)" strokeWidth="1.5" fill="none" />
      </svg>
    </div>
  )
}
