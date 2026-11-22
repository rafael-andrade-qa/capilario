// Sessão e histórico compartilhados entre as telas.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { clearSignedUrlCache, fetchHistory, signedUrls } from './api'
import type { Experiment, Stage } from './domain'

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------
interface SessionState {
  session: Session | null
  ready: boolean
}
const SessionContext = createContext<SessionState>({ session: null, ready: false })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, ready: false })
  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => alive && setState({ session: data.session, ready: true }))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        clearSignedUrlCache()
        clearHistoryCache()
      }
      setState({ session, ready: true })
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])
  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)

export async function signOut() {
  clearSignedUrlCache()
  clearHistoryCache()
  await supabase.auth.signOut()
  window.location.hash = '/'
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------
interface HistoryState {
  experiments: Experiment[] | null
  error: string | null
  loading: boolean
  reload: () => Promise<void>
  patchStage: (id: string, patch: Partial<Stage>) => void
  removeStage: (id: string) => void
  removeExperiment: (id: string) => void
}
const HistoryContext = createContext<HistoryState | null>(null)

// O último histórico fica guardado no aparelho (por conta): ao abrir o app ele aparece na hora e
// é atualizado por trás. Só textos e caminhos; as fotos continuam vindo do servidor, protegidas.
const CACHE_PREFIX = 'capilar:historico:v1:'

export function readHistoryCache(userId: string): Experiment[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_PREFIX + userId) ?? 'null')
    return Array.isArray(v?.experiments) ? (v.experiments as Experiment[]) : null
  } catch {
    return null
  }
}

function writeHistoryCache(userId: string, experiments: Experiment[]) {
  try {
    localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify({ savedAt: Date.now(), experiments }))
  } catch {
    // sem espaço ou armazenamento bloqueado: segue sem guardar
  }
}

/** Ao sair da conta, nada do histórico fica no aparelho. */
export function clearHistoryCache() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k)
  } catch {
    // ignora
  }
}

export function HistoryProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [experiments, setExperiments] = useState<Experiment[] | null>(() => readHistoryCache(userId))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setExperiments(await fetchHistory())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const patchStage = useCallback((id: string, patch: Partial<Stage>) => {
    setExperiments((prev) =>
      prev?.map((e) => ({ ...e, stages: e.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)) })) ?? prev,
    )
  }, [])

  const removeStage = useCallback((id: string) => {
    // Igual ao banco: o momento sai e o produto fica (mesmo sem nenhum momento).
    setExperiments((prev) => prev?.map((e) => (e.stages.some((s) => s.id === id) ? { ...e, stages: e.stages.filter((s) => s.id !== id) } : e)) ?? prev)
  }, [])

  const removeExperiment = useCallback((id: string) => {
    setExperiments((prev) => prev?.filter((e) => e.id !== id) ?? prev)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (experiments) writeHistoryCache(userId, experiments)
  }, [userId, experiments])

  const value = useMemo(
    () => ({ experiments, error, loading, reload, patchStage, removeStage, removeExperiment }),
    [experiments, error, loading, reload, patchStage, removeStage, removeExperiment],
  )
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>
}

export function useHistory(): HistoryState {
  const ctx = useContext(HistoryContext)
  if (!ctx) throw new Error('HistoryProvider ausente')
  return ctx
}

export function findStage(experiments: Experiment[] | null, stageId: string): { stage: Stage; experiment: Experiment } | null {
  for (const experiment of experiments ?? []) {
    const stage = experiment.stages.find((s) => s.id === stageId)
    if (stage) return { stage, experiment }
  }
  return null
}

// ---------------------------------------------------------------------------
// URLs assinadas para um conjunto de caminhos
// ---------------------------------------------------------------------------
export function useSignedUrls(paths: string[]): { urls: Record<string, string>; error: string | null } {
  const key = [...new Set(paths)].sort().join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!key) return
    let alive = true
    const list = key.split('|')
    const load = () =>
      signedUrls(list)
        .then((u) => alive && (setUrls(u), setError(null)))
        .catch((e: Error) => alive && setError(e.message))
    void load()
    const timer = window.setInterval(load, 8 * 60 * 1000) // renova antes de expirar (10 min)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [key])
  return { urls, error }
}
