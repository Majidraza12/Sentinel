import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <div className="label-mono !text-amber">Error 404</div>
      <h1 className="font-display text-6xl font-black uppercase tracking-wide">Lost signal</h1>
      <p className="text-ink-2">There's no feed at this address.</p>
      <Link to="/" className="mt-2 border border-amber/60 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-amber hover:bg-amber hover:text-bg">
        Back to console
      </Link>
    </div>
  )
}
