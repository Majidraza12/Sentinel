import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/', label: 'Console', code: '01' },
  { to: '/results', label: 'Results', code: '02' },
  { to: '/method', label: 'Method', code: '03' },
]

type Health = 'checking' | 'online' | 'offline'

function useServerHealth(): Health {
  const [health, setHealth] = useState<Health>('checking')
  useEffect(() => {
    let alive = true
    const check = () =>
      fetch('/api/health')
        .then((r) => alive && setHealth(r.ok ? 'online' : 'offline'))
        .catch(() => alive && setHealth('offline'))
    check()
    const id = setInterval(check, 15000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  return health
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      <path d="M5 11V5h6M21 5h6v6M27 21v6h-6M11 27H5v-6" stroke="var(--color-amber)" strokeWidth="2.2" fill="none" />
      <circle cx="16" cy="16" r="3.6" fill="var(--color-violent)" />
    </svg>
  )
}

export default function Header() {
  const health = useServerHealth()
  const now = useClock()
  const stamp = now.toISOString().replace('T', ' ').slice(0, 19)

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:px-8">
        <NavLink to="/" className="flex items-center gap-3" aria-label="Sentinel home">
          <Logo />
          <span className="hidden font-display text-[26px] font-extrabold uppercase leading-none tracking-wide sm:inline">
            Sentinel<span className="text-amber">.</span>
          </span>
        </NavLink>

        <nav className="flex items-center sm:ml-6 sm:gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `group relative flex items-baseline gap-1.5 px-2.5 py-2 text-sm transition-colors sm:px-3 ${
                  isActive ? 'text-ink' : 'text-muted hover:text-ink-2'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="hidden font-mono text-[9px] text-muted sm:inline">{item.code}</span>
                  <span className="font-medium">{item.label}</span>
                  <span
                    className={`absolute inset-x-2 -bottom-[13px] h-[2px] bg-amber transition-transform duration-300 ${
                      isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-50'
                    }`}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-5">
          <span className="hidden font-mono text-[11px] tabular-nums text-muted lg:inline">{stamp} UTC</span>
          <span
            className="flex items-center gap-2 border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]"
            title={health === 'offline' ? 'Backend not reachable on /api' : 'Inference server status'}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                health === 'online' ? 'bg-calm' : health === 'offline' ? 'bg-violent' : 'bg-amber rec-dot'
              }`}
            />
            <span className="hidden text-ink-2 sm:inline">
              {health === 'online' ? 'Model online' : health === 'offline' ? 'Offline' : 'Linking'}
            </span>
          </span>
        </div>
      </div>
    </header>
  )
}
