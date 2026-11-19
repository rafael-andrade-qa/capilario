// Roteamento por hash: funciona em qualquer subcaminho (GitHub Pages) e sobrevive a recarregamentos.
import { useSyncExternalStore } from 'react'

export interface Route {
  path: string
  params: URLSearchParams
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

const snapshot = () => window.location.hash

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?')
  return { path: path || '/', params: new URLSearchParams(query) }
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, snapshot, snapshot)
  return parseHash(hash)
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const target = '#' + to
  if (opts.replace) {
    window.history.replaceState(window.history.state, '', target)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else if (window.location.hash !== target) {
    window.location.hash = to
  }
  window.scrollTo(0, 0)
}

export function href(to: string): string {
  return '#' + to
}

/** Casa um caminho com um padrão do tipo /etapa/:id. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/')
  const s = path.split('/')
  if (p.length !== s.length) return null
  const out: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) out[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return out
}
