export const REPO_URL = 'https://github.com/Majidraza12/incident-detection-project'

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6 lg:px-8">
        <p className="label-mono">Majid Raza · CS-495 · Illinois Institute of Technology · 2026</p>
        <div className="flex items-center gap-5">
          <span className="label-mono hidden sm:inline">PyTorch · FastAPI · React</span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2 underline decoration-amber/60 underline-offset-4 hover:text-amber"
          >
            Source ↗
          </a>
        </div>
      </div>
    </footer>
  )
}
