import type { ReactNode } from 'react'

interface PanelProps {
  title?: string
  code?: string
  right?: ReactNode
  bracket?: boolean
  className?: string
  bodyClassName?: string
  children: ReactNode
}

/** Bordered console panel with a mono header strip. */
export default function Panel({ title, code, right, bracket, className = '', bodyClassName = '', children }: PanelProps) {
  return (
    <section className={`border border-line bg-panel/90 ${bracket ? 'bracket' : ''} ${className}`}>
      {title && (
        <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          {code && <span className="font-mono text-[10px] text-amber">{code}</span>}
          <h2 className="label-mono !text-ink-2">{title}</h2>
          {right && <div className="ml-auto">{right}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
