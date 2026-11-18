import { AnimatePresence, motion } from 'motion/react'
import type { Ref } from 'react'
import { pct, type Prediction } from '../../lib/api'

interface Props {
  videoRef: Ref<HTMLVideoElement>
  previewUrl: string | null
  cameraLabel: string
  analyzing: boolean
  result: Prediction | null
  currentTime: number
  onTimeUpdate: (t: number) => void
}

function timecode(t: number) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const f = Math.floor((t % 1) * 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`
}

export default function Monitor({ videoRef, previewUrl, cameraLabel, analyzing, result, currentTime, onTimeUpdate }: Props) {
  const violent = result?.label === 'Violent'

  return (
    <div className="bracket relative aspect-video w-full overflow-hidden border border-line bg-black">
      {previewUrl ? (
        <video
          key={previewUrl}
          ref={videoRef}
          src={previewUrl}
          autoPlay
          muted
          loop
          playsInline
          onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
          className="h-full w-full object-contain"
        />
      ) : (
        <NoSignal />
      )}

      <div className="scanlines pointer-events-none absolute inset-0" />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 p-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/85 sm:p-4 sm:text-[11px]">
        <div className="flex items-start justify-between">
          <span className="flex items-center gap-2 bg-black/40 px-1.5 py-0.5">
            <span className="rec-dot h-2 w-2 rounded-full bg-violent" />
            {previewUrl ? 'Rec' : 'Standby'}
          </span>
          <span className="bg-black/40 px-1.5 py-0.5">{cameraLabel}</span>
        </div>
        {previewUrl && (
          <div className="absolute bottom-3 left-3 bg-black/40 px-1.5 py-0.5 tabular-nums sm:bottom-4 sm:left-4">
            T+{timecode(currentTime)}
          </div>
        )}
      </div>

      {/* Analyzing sweep */}
      <AnimatePresence>
        {analyzing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/45"
          >
            <div className="analyzing-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-amber/25 to-transparent" />
            <div className="relative flex flex-col items-center gap-2">
              <span className="font-display text-3xl font-extrabold uppercase tracking-[0.12em] text-amber">
                Analyzing
              </span>
              <span className="label-mono !text-white/70">Sampling 16 frames → ResNet-18 → head</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verdict stamp */}
      <AnimatePresence>
        {result && !analyzing && (
          <motion.div
            key={result.model.id + result.source.id}
            initial={{ opacity: 0, scale: 1.25, rotate: -4 }}
            animate={{ opacity: 1, scale: 1, rotate: -4 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            className={`pointer-events-none absolute bottom-3 right-3 border-2 px-3 py-1 sm:bottom-4 sm:right-4 ${
              violent ? 'border-violent text-violent' : 'border-calm text-calm'
            } bg-black/55`}
          >
            <span className="font-display text-xl font-black uppercase tracking-[0.1em] sm:text-2xl">
              {violent ? '⚠ Violent' : '✓ Non-violent'}
            </span>
            <span className="ml-2 font-mono text-[11px] tabular-nums text-white/80">{pct(result.confidence)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NoSignal() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="static-noise absolute inset-0" />
      <div className="relative flex flex-col items-center gap-3 px-6 text-center">
        <span className="font-display text-4xl font-black uppercase tracking-[0.2em] text-ink/80 sm:text-5xl">
          No signal
        </span>
        <span className="text-sm text-ink-2">Pick a held-out test clip or drop in your own video.</span>
      </div>
    </div>
  )
}
