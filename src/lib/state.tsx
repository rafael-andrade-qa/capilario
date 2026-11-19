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
      if (!session) clearSignedUrlCache()
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

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [experiments, setExperiments] = useState<Experiment[] | null>(null)
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
    // Igual ao banco: se era a última etapa, o experimento sai junto.
    setExperiments(
      (prev) =>
        prev?.flatMap((e) => {
          if (!e.stages.some((s) => s.id === id)) return [e]
          const stages = e.stages.filter((s) => s.id !== id)
          return stages.length ? [{ ...e, stages }] : []
        }) ?? prev,
    )
  }, [])

  const removeExperiment = useCallback((id: string) => {
    setExperiments((prev) => prev?.filter((e) => e.id !== id) ?? prev)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

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
