import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { api, ApiError, type ModelInfo, type Prediction, type Sample } from '../lib/api'
import { useAsync } from '../lib/hooks'
import Panel from '../components/Panel'
import SourcePanel from '../components/console/SourcePanel'
import Monitor from '../components/console/Monitor'
import Timeline from '../components/console/Timeline'
import { MODEL_COLOR } from '../lib/models'
import Verdict, { Telemetry } from '../components/console/Verdict'

type Source =
  | { kind: 'sample'; sample: Sample }
  | { kind: 'upload'; file: File; uploadId: string | null }

export default function ConsolePage() {
  const models = useAsync(api.models)
  const samples = useAsync(api.samples)

  const [modelId, setModelId] = useState<string | null>(null)
  const [overlay, setOverlay] = useState(false)
  const [source, setSource] = useState<Source | null>(null)
  // Results for the current source, keyed by model id.
  const [results, setResults] = useState<Record<string, Prediction>>({})
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (models.data && !modelId) setModelId((models.data.find((m) => m.default) ?? models.data[0])?.id ?? null)
  }, [models.data, modelId])

  const otherModel = useMemo(
    () => models.data?.find((m) => m.id !== modelId) ?? null,
    [models.data, modelId],
  )

  const run = useCallback(async (src: Source, model: string, seq: number) => {
    setPending((p) => new Set(p).add(model))
    try {
      let r: Prediction
      if (src.kind === 'sample') r = await api.predictSample(src.sample.id, model)
      else if (src.uploadId) r = await api.repredictUpload(src.uploadId, model)
      else {
        r = await api.predictUpload(src.file, model)
        src.uploadId = r.source.id
        r.source.name = src.file.name
      }
      if (seq !== requestSeq.current) return // a newer source was picked meanwhile
      if (src.kind === 'upload') r.source.name = src.file.name
      setResults((prev) => ({ ...prev, [model]: r }))
    } catch (e) {
      if (seq !== requestSeq.current) return
      setError(e instanceof ApiError ? e.message : 'Something went wrong running the model.')
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(model)
        return next
      })
    }
  }, [])

  const pickSource = (src: Source) => {
    if (!modelId) return
    const seq = ++requestSeq.current
    setSource(src)
    setResults({})
    setError(null)
    setHover(null)
    setCurrentTime(0)
    // On narrow screens the monitor sits below the clip list; bring it into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    run(src, modelId, seq).then(() => {
      if (overlay && otherModel && seq === requestSeq.current) run(src, otherModel.id, seq)
    })
  }

  const switchModel = (id: string) => {
    setModelId(id)
    if (source && !results[id] && !pending.has(id)) run(source, id, requestSeq.current)
  }

  const toggleOverlay = () => {
    const next = !overlay
    setOverlay(next)
    if (next && source && otherModel && !results[otherModel.id] && !pending.has(otherModel.id) && results[modelId!]) {
      run(source, otherModel.id, requestSeq.current)
    }
  }

  const result = modelId ? results[modelId] ?? null : null
  const compare = overlay && otherModel ? results[otherModel.id] ?? null : null
  const analyzing = !!modelId && pending.has(modelId)
  const previewUrl = result?.source.preview_url ?? (source?.kind === 'sample' ? `/api/samples/${source.sample.id}/preview.webm` : null)

  // Map video time onto the 16 sampled frames (fractional index) for the playhead.
  const playhead = useMemo(() => {
    if (!result) return null
    const times = result.frames.map((f) => f.time_sec)
    if (times.some((t) => t === null)) return null
    const ts = times as number[]
    if (currentTime <= ts[0]) return 0
    for (let i = 1; i < ts.length; i++) {
      if (currentTime <= ts[i]) return i - 1 + (currentTime - ts[i - 1]) / (ts[i] - ts[i - 1] || 1)
    }
    return ts.length - 1
  }, [result, currentTime])

  const seek = (i: number) => {
    const t = result?.frames[i].time_sec
    if (videoRef.current && t !== null && t !== undefined) {
      videoRef.current.currentTime = t
      videoRef.current.pause()
    }
  }

  const cameraLabel =
    source?.kind === 'sample'
      ? `${source.sample.camera} · evt ${source.sample.event}`
      : source?.kind === 'upload'
        ? source.file.name.slice(0, 28)
        : 'cam —'

  return (
    <div className="flex flex-col gap-6">
      <Intro />

      <div className="grid gap-6 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <div className="flex min-h-0 flex-col gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
          <ModelSwitch
            models={models.data}
            modelId={modelId}
            onChange={switchModel}
            overlay={overlay}
            onToggleOverlay={toggleOverlay}
            otherModel={otherModel}
            pending={pending}
          />
          <SourcePanel
            samples={samples.data}
            samplesError={samples.error}
            selectedSampleId={source?.kind === 'sample' ? source.sample.id : null}
            modelId={modelId ?? 'cnn_lstm'}
            busy={analyzing}
            onPickSample={(s) => pickSource({ kind: 'sample', sample: s })}
            onUpload={(f) => pickSource({ kind: 'upload', file: f, uploadId: null })}
          />
        </div>

        <div ref={stageRef} className="flex min-w-0 scroll-mt-20 flex-col gap-6">
          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <Monitor
              videoRef={videoRef}
              previewUrl={previewUrl}
              cameraLabel={cameraLabel}
              analyzing={analyzing}
              result={result}
              currentTime={currentTime}
              onTimeUpdate={setCurrentTime}
            />
            <Panel bodyClassName="p-5" className="flex flex-col">
              {result ? (
                <Verdict result={result} />
              ) : (
                <AwaitingVerdict analyzing={analyzing} error={error} />
              )}
              {error && result && <p className="mt-4 text-sm text-violent">{error}</p>}
            </Panel>
          </div>

          {result ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
              <Panel
                title="Frame-by-frame reasoning"
                code="§ 16"
                bodyClassName="px-4 pb-5 pt-12 sm:px-5"
                right={<span className="label-mono hidden sm:inline">hover to inspect · click to jump video</span>}
              >
                <Timeline
                  primary={result}
                  compare={compare}
                  activeIndex={hover}
                  playhead={playhead}
                  onHover={setHover}
                  onSeek={seek}
                />
                <p className="mt-5 max-w-3xl text-[13px] leading-relaxed text-muted">
                  {result.model.timeline_kind === 'running' ? (
                    <>
                      The CNN-LSTM reads frames in order. Each point is its prediction <em>if it stopped after that
                      frame</em>. The last point is the final answer.
                    </>
                  ) : (
                    <>
                      The mean-pool model has no notion of order. Each point is how violent that single frame looks
                      to it. The final answer comes from the average frame feature, so it can differ from the
                      average of these points.
                    </>
                  )}{' '}
                  {overlay && !compare && otherModel && pending.has(otherModel.id) && 'Loading comparison…'}
                </p>
              </Panel>
              <Telemetry result={result} />
            </motion.div>
          ) : (
            <EmptyTimeline />
          )}
        </div>
      </div>
    </div>
  )
}

function Intro() {
  return (
    <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="label-mono mb-2 !text-amber">Live inference console</div>
        <h1 className="font-display text-[42px] font-black uppercase leading-[0.9] tracking-wide sm:text-[56px]">
          Is there violence in this clip?
        </h1>
      </div>
      <p className="max-w-md text-[14px] leading-relaxed text-ink-2">
        A ResNet-18 + LSTM network trained on surveillance footage. It reads 16 frames from a clip and decides
        whether it shows violence. Below you can see how its belief changes frame by frame.
      </p>
    </div>
  )
}

function ModelSwitch({
  models,
  modelId,
  onChange,
  overlay,
  onToggleOverlay,
  otherModel,
  pending,
}: {
  models: ModelInfo[] | null
  modelId: string | null
  onChange: (id: string) => void
  overlay: boolean
  onToggleOverlay: () => void
  otherModel: ModelInfo | null
  pending: Set<string>
}) {
  const current = models?.find((m) => m.id === modelId)
  return (
    <Panel title="Model" code="M" bodyClassName="p-3">
      <div className="grid grid-cols-2 gap-1 bg-bg p-1" role="radiogroup" aria-label="Model">
        {(models ?? []).map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={m.id === modelId}
            onClick={() => onChange(m.id)}
            className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
              m.id === modelId ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink-2'
            }`}
          >
            <span className="h-2 w-2" style={{ background: MODEL_COLOR[m.id] }} />
            {m.short}
            {pending.has(m.id) && <span className="rec-dot font-mono text-[10px] text-amber">●</span>}
          </button>
        ))}
        {!models && <div className="col-span-2 h-9 animate-pulse bg-panel-2" />}
      </div>
      {current && <p className="mt-2.5 px-1 text-[12px] leading-relaxed text-muted">{current.description}</p>}
      {otherModel && (
        <label className="mt-2 flex cursor-pointer items-center gap-2.5 px-1 py-1 text-[12px] text-ink-2">
          <input
            type="checkbox"
            checked={overlay}
            onChange={onToggleOverlay}
            className="h-3.5 w-3.5 accent-[var(--color-amber)]"
          />
          Overlay {otherModel.short} on the timeline
        </label>
      )}
    </Panel>
  )
}

function AwaitingVerdict({ analyzing, error }: { analyzing: boolean; error: string | null }) {
  if (error) {
    return (
      <div className="flex h-full flex-col justify-center gap-2">
        <div className="label-mono !text-violent">Error</div>
        <p className="text-sm text-ink-2">{error}</p>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="label-mono">Verdict</div>
      <div className="font-display text-[44px] font-black uppercase leading-none tracking-wide text-line-2">
        {analyzing ? 'Thinking…' : 'Awaiting clip'}
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        {analyzing
          ? 'Decoding the video and running 16 frames through the network.'
          : 'Choose a test clip on the left. Try the "Model missed" filter to see where it fails.'}
      </p>
    </div>
  )
}

function EmptyTimeline() {
  return (
    <Panel title="Frame-by-frame reasoning" code="§ 16" bodyClassName="p-5">
      <div className="grid grid-cols-8 gap-[3px] opacity-40 sm:grid-cols-16" aria-hidden>
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} className="aspect-square border border-dashed border-line-2" />
        ))}
      </div>
      <p className="mt-4 text-[13px] text-muted">
        The 16 frames the model actually looks at will appear here, with its violence probability for each.
      </p>
    </Panel>
  )
}
