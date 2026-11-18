import { useMemo, useRef, useState } from 'react'
import { api, type Sample } from '../../lib/api'

type Filter = 'all' | 'Violent' | 'Non-Violent' | 'missed'

const ACCEPT = '.mp4,.avi,.mov,.mkv,.webm,.m4v'
const MAX_BYTES = 100 * 1024 * 1024

interface Props {
  samples: Sample[] | null
  samplesError: Error | null
  selectedSampleId: string | null
  modelId: string
  busy: boolean
  onPickSample: (s: Sample) => void
  onUpload: (f: File) => void
}

export default function SourcePanel(props: Props) {
  const [tab, setTab] = useState<'samples' | 'upload'>('samples')

  return (
    <section className="flex min-h-0 flex-col border border-line bg-panel/90">
      <div className="grid grid-cols-2 border-b border-line" role="tablist">
        {(
          [
            ['samples', 'Test clips', props.samples ? String(props.samples.length) : '…'],
            ['upload', 'Upload', '↑'],
          ] as const
        ).map(([key, label, badge]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              tab === key ? 'bg-panel-2 text-ink shadow-[inset_0_-2px_0_var(--color-amber)]' : 'text-muted hover:text-ink-2'
            }`}
          >
            {label}
            <span className="font-mono text-[10px] text-muted">{badge}</span>
          </button>
        ))}
      </div>
      {tab === 'samples' ? <SampleBrowser {...props} /> : <UploadZone busy={props.busy} onUpload={props.onUpload} />}
    </section>
  )
}

function SampleBrowser({ samples, samplesError, selectedSampleId, modelId, busy, onPickSample }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(() => {
    const c = { all: 0, Violent: 0, 'Non-Violent': 0, missed: 0 }
    for (const s of samples ?? []) {
      c.all++
      c[s.label]++
      if (s.test_predictions[modelId]?.correct === false) c.missed++
    }
    return c
  }, [samples, modelId])

  const visible = useMemo(
    () =>
      (samples ?? []).filter((s) =>
        filter === 'all' ? true : filter === 'missed' ? s.test_predictions[modelId]?.correct === false : s.label === filter,
      ),
    [samples, filter, modelId],
  )

  if (samplesError) {
    return <p className="p-5 text-sm text-violent">Could not load clips: {samplesError.message}</p>
  }

  const chips: [Filter, string][] = [
    ['all', 'All'],
    ['Violent', 'Violent'],
    ['Non-Violent', 'Non-violent'],
    ['missed', 'Model missed'],
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="px-4 pt-4 text-[13px] leading-relaxed text-ink-2">
        Held-out <span className="text-ink">test-set</span> clips. The model never saw these during training.
      </p>
      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        {chips.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
              filter === key ? 'border-amber bg-amber/10 text-amber' : 'border-line text-muted hover:border-line-2 hover:text-ink-2'
            }`}
          >
            {label} <span className="opacity-60">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="grid max-h-[520px] min-h-0 flex-1 auto-rows-max grid-cols-3 content-start gap-2 overflow-y-auto px-4 pb-4 sm:grid-cols-4 lg:max-h-none lg:grid-cols-3">
        {!samples &&
          Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-square w-full animate-pulse bg-panel-2" />)}
        {visible.map((s) => {
          const verdict = s.test_predictions[modelId]
          const selected = s.id === selectedSampleId
          return (
            <button
              key={s.id}
              disabled={busy}
              onClick={() => onPickSample(s)}
              title={`${s.label} · ${s.camera} · event ${s.event}${verdict ? ` · model said ${verdict.predicted}` : ''}`}
              className={`group relative block overflow-hidden border text-left transition-all disabled:cursor-wait ${
                selected ? 'border-amber ring-1 ring-amber' : 'border-line hover:border-line-2'
              }`}
            >
              <img
                src={api.thumbnailUrl(s.id)}
                alt=""
                loading="lazy"
                className="block aspect-square w-full object-cover grayscale-[35%] transition duration-300 group-hover:scale-105 group-hover:grayscale-0"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
              <span className="absolute left-1.5 top-1.5 font-mono text-[9px] uppercase text-white/75">{s.camera}</span>
              {verdict && !verdict.correct && (
                <span className="absolute right-1.5 top-1.5 bg-amber px-1 font-mono text-[8px] font-medium uppercase text-bg">
                  Missed
                </span>
              )}
              <span className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 ${s.label === 'Violent' ? 'bg-violent' : 'bg-calm'}`} />
                <span className="truncate font-mono text-[9px] uppercase tracking-wide text-white/90">
                  {s.label === 'Violent' ? 'Violent' : 'Non-viol.'} #{s.event}
                </span>
              </span>
            </button>
          )
        })}
        {samples && visible.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted">No clips match this filter.</p>
        )}
      </div>
    </div>
  )
}

function UploadZone({ busy, onUpload }: { busy: boolean; onUpload: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = (file: File | undefined) => {
    if (!file) return
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPT.split(',').includes(ext)) return setError(`"${ext}" isn't a supported video type.`)
    if (file.size > MAX_BYTES) return setError('That file is over the 100 MB limit.')
    setError(null)
    onUpload(file)
  }

  return (
    <div className="flex flex-1 flex-col p-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          accept(e.dataTransfer.files[0])
        }}
        className={`bracket flex min-h-[260px] flex-1 flex-col items-center justify-center gap-4 border border-dashed px-6 text-center transition-colors disabled:cursor-wait ${
          drag ? 'border-amber bg-amber/5' : 'border-line-2 hover:border-amber/60 hover:bg-panel-2'
        }`}
      >
        <svg viewBox="0 0 48 48" className={`h-12 w-12 transition-transform ${drag ? '-translate-y-1' : ''}`} aria-hidden>
          <rect x="6" y="12" width="28" height="24" fill="none" stroke="var(--color-ink-2)" strokeWidth="2" />
          <path d="M34 20l8-5v18l-8-5z" fill="none" stroke="var(--color-ink-2)" strokeWidth="2" />
          <path d="M20 30V19m-5 5 5-5 5 5" stroke="var(--color-amber)" strokeWidth="2.2" fill="none" />
        </svg>
        <span className="font-display text-2xl font-bold uppercase tracking-wide">Drop a video clip</span>
        <span className="text-sm text-ink-2">or click to browse</span>
        <span className="label-mono">MP4 · AVI · MOV · MKV · WEBM · up to 100 MB</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && <p className="mt-3 text-sm text-violent">{error}</p>}
      <p className="mt-4 text-[13px] leading-relaxed text-muted">
        Works best on short (2–10 s), fixed-camera clips like the training data. The clip is sampled into 16
        evenly-spaced frames, the same way the model was trained and tested.
      </p>
    </div>
  )
}
