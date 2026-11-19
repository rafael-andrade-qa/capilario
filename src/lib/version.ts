// Detecta versão nova publicada: compara o script principal da página atual com o da
// página no servidor. Útil no app instalado (iPhone), que volta do segundo plano sem recarregar.
import { useEffect, useState } from 'react'

const SCRIPT_RE = /assets\/index-[\w-]+\.js/

function currentScript(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')
  return el?.src.match(SCRIPT_RE)?.[0] ?? null
}

async function latestScript(): Promise<string | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}?v=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  return (await res.text()).match(SCRIPT_RE)?.[0] ?? null
}

export function useNewVersion(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    const current = currentScript()
    if (!current) return // desenvolvimento: sem build
    let busy = false
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        const latest = await latestScript()
        if (latest && latest !== current) setAvailable(true)
      } catch {
        // sem rede: tenta de novo depois
      } finally {
        busy = false
      }
    }
    document.addEventListener('visibilitychange', check)
    const timer = window.setInterval(check, 30 * 60 * 1000)
    void check()
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.clearInterval(timer)
    }
  }, [])
  return available
}
