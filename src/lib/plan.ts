// Planos Grátis e Pro: o que a conta pode fazer, quanto já usou e quando renova (my_plan no banco).
// Quando um limite é atingido, o app abre o "Conheça o Pro" (evento capilar:limite).
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type PlanName = 'free' | 'pro'
export type Period = 'day' | 'week' | 'month'
export type LimitKind = 'analyses' | 'identify' | 'photos'

export interface Quota {
  limit: number
  period: Period
  used: number
  /** Dia (AAAA-MM-DD) em que a cota volta. */
  renews_on: string
}
export interface Plan {
  plan: PlanName
  pro_until: string | null
  analyses: Quota
  identify: Quota
  photos: { limit: number; used: number }
}

/** O que cada plano oferece (para comparar no "Conheça o Pro"). */
export const PLAN_FEATURES: { label: string; free: string; pro: string }[] = [
  { label: 'Análise com IA', free: '1 por mês', pro: '1 por dia' },
  { label: 'Identificar pela foto', free: '3 por semana', pro: '10 por dia' },
  { label: 'Fotos guardadas', free: 'até 300', pro: 'até 1.000' },
]

export const PLAN_LABEL: Record<PlanName, string> = { free: 'Grátis', pro: 'Pro' }

const PERIOD: Record<Period, string> = { day: 'hoje', week: 'nesta semana', month: 'neste mês' }
export const periodLabel = (p: Period) => PERIOD[p]

/** "30/11" a partir de "2026-11-30". */
export function shortDate(day: string): string {
  const [, m, d] = day.split('-')
  return `${d}/${m}`
}

/** Quanto falta para a cota renovar, em português ("amanhã", "na segunda", "em 01/12"). */
export function renewsText(q: Pick<Quota, 'period' | 'renews_on'>): string {
  if (q.period === 'day') return 'renova amanhã'
  if (q.period === 'week') return 'renova na segunda'
  return `renova em ${shortDate(q.renews_on)}`
}

export const left = (q: { limit: number; used: number }) => Math.max(0, q.limit - q.used)

/** Perto do limite de fotos: 80% ou mais. */
export const photosNearLimit = (p: Plan) => p.photos.used >= Math.floor(p.photos.limit * 0.8)

export async function fetchPlan(): Promise<Plan> {
  const { data, error } = await supabase.rpc('my_plan')
  if (error) throw new Error(error.message)
  const p = data as Plan
  return { ...p, analyses: { ...p.analyses, used: Number(p.analyses.used) }, identify: { ...p.identify, used: Number(p.identify.used) }, photos: { ...p.photos, used: Number(p.photos.used) } }
}

// ---------------------------------------------------------------------------
// Estado compartilhado: um pedido para todas as telas; atualiza depois de gastar uma cota.
// ---------------------------------------------------------------------------
let current: Plan | null = null
let loading: Promise<void> | null = null
const listeners = new Set<(p: Plan | null) => void>()

function publish(p: Plan | null) {
  current = p
  for (const l of listeners) l(p)
}

/** Busca o plano de novo (depois de analisar, identificar ou salvar fotos). */
export function refreshPlan(): Promise<void> {
  loading = fetchPlan()
    .then(publish)
    .catch(() => undefined)
    .finally(() => {
      loading = null
    })
  return loading
}

/** Ao sair da conta, nada do plano anterior fica. */
export function clearPlan() {
  publish(null)
}

export function usePlan(): Plan | null {
  const [plan, setPlan] = useState<Plan | null>(current)
  useEffect(() => {
    listeners.add(setPlan)
    if (!current && !loading) void refreshPlan()
    return () => {
      listeners.delete(setPlan)
    }
  }, [])
  return plan
}

// ---------------------------------------------------------------------------
// Limite atingido: avisa a tela (o "Conheça o Pro" abre por cima de tudo).
// ---------------------------------------------------------------------------
export const LIMIT_EVENT = 'capilar:limite'

export function limitReached(kind: LimitKind | 'pro') {
  void refreshPlan()
  window.dispatchEvent(new CustomEvent(LIMIT_EVENT, { detail: kind }))
}

/** Abre o "Conheça o Pro" sem limite atingido (botão na conta, no aviso de fotos). */
export const openPro = () => window.dispatchEvent(new CustomEvent(LIMIT_EVENT, { detail: 'pro' }))
