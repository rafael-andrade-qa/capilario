// Rotina da finalização: o que a pessoa usou naquele dia, por etapa (lavar → finalizar).
// A finalização fica no produto principal (o finalizador; sem ele, "Sem finalizador"), e esse
// produto também está na rotina. As etapas e o mapa por tipo são os mesmos do banco
// (supabase/migrations/20261124000100_routine.sql).
import { brandLabel, finalizationsOf, productLabel, type Experiment, type Finalization } from './domain'
import { productType } from './productGuide'

export type RoutineStep = 'wash' | 'condition' | 'mask' | 'prep' | 'shape' | 'hold' | 'finish'
export type MaskKind = 'H' | 'N' | 'R'

export const ROUTINE_STEPS: { id: RoutineStep; label: string; short: string; add: string }[] = [
  { id: 'wash', label: 'Lavar', short: 'Lavar', add: 'Shampoo, co-wash…' },
  { id: 'condition', label: 'Condicionar', short: 'Condicionar', add: 'Condicionador' },
  { id: 'mask', label: 'Máscara', short: 'Máscara', add: 'Hidratação, nutrição…' },
  { id: 'prep', label: 'Preparar', short: 'Preparar', add: 'Leave-in, protetor…' },
  { id: 'shape', label: 'Definir', short: 'Definir', add: 'Creme de pentear…' },
  { id: 'hold', label: 'Fixar', short: 'Fixar', add: 'Gelatina, geleia, mousse…' },
  { id: 'finish', label: 'Finalizar', short: 'Finalizar', add: 'Óleo, sérum…' },
]

export const MASK_KINDS: { id: MaskKind; label: string }[] = [
  { id: 'H', label: 'Hidratação' },
  { id: 'N', label: 'Nutrição' },
  { id: 'R', label: 'Reconstrução' },
]
export const maskKindLabel = (k: MaskKind | null | undefined) => MASK_KINDS.find((m) => m.id === k)?.label ?? null

export interface RoutineItem {
  finalization_id: string
  experiment_id: string
  step: RoutineStep
  position: number
  mask_kind: MaskKind | null
}

/** Rotinas por finalização. */
export type Routines = Record<string, RoutineItem[]>

/** Etapa de um produto pelo tipo dele (a do guia, igual à routine_step_of do banco). Sem tipo: fixar (o uso mais comum no app). */
export function stepOfCategory(category: string | null | undefined): RoutineStep {
  return productType(category)?.step ?? 'hold'
}

export const stepLabel = (s: RoutineStep) => ROUTINE_STEPS.find((x) => x.id === s)!.label
const stepIndex = (s: RoutineStep) => ROUTINE_STEPS.findIndex((x) => x.id === s)

/** Itens na ordem da rotina (etapa, depois a ordem em que a pessoa pôs). */
export function sortRoutine<T extends Pick<RoutineItem, 'step' | 'position'>>(items: T[]): T[] {
  return [...items].sort((a, b) => stepIndex(a.step) - stepIndex(b.step) || a.position - b.position)
}

/** Rascunho de rotina (na tela): produto, etapa e o tipo da máscara. */
export interface DraftItem {
  experimentId: string
  step: RoutineStep
  maskKind: MaskKind | null
}

/**
 * Produto principal (onde a finalização fica): o primeiro de fixar, senão de pentear e
 * definir, senão de finalizar. Nenhum deles: Sem finalizador (null).
 */
export function principalOf(items: Pick<DraftItem, 'experimentId' | 'step'>[]): string | null {
  for (const step of ['hold', 'shape', 'finish'] as RoutineStep[]) {
    const hit = items.find((i) => i.step === step)
    if (hit) return hit.experimentId
  }
  return null
}

/** Finalização mais recente (de qualquer produto), com o produto dela. */
export function allFinalizations(experiments: Experiment[]): { experiment: Experiment; finalization: Finalization }[] {
  return experiments
    .flatMap((experiment) => finalizationsOf(experiment).map((finalization) => ({ experiment, finalization })))
    .sort((a, b) => Date.parse(b.finalization.start) - Date.parse(a.finalization.start))
}

/** Rotina de uma finalização como rascunho, só com produtos que ainda existem. */
export function draftOf(routine: RoutineItem[] | undefined, experiments: Experiment[]): DraftItem[] {
  const ids = new Set(experiments.filter((e) => e.product_mode === 'named').map((e) => e.id))
  return sortRoutine(routine ?? [])
    .filter((i) => ids.has(i.experiment_id))
    .map((i) => ({ experimentId: i.experiment_id, step: i.step, maskKind: i.mask_kind }))
}

/** Rotina para começar uma finalização nova: a da última finalização (vazia se não houver). */
export function lastRoutine(experiments: Experiment[], routines: Routines): { items: DraftItem[]; from: Finalization | null } {
  for (const { finalization } of allFinalizations(experiments)) {
    const items = draftOf(routines[finalization.id], experiments)
    if (items.length) return { items, from: finalization }
  }
  return { items: [], from: null }
}

export interface StepChange {
  step: RoutineStep
  before: string[]
  after: string[]
}

/** Nome do item na rotina: o produto e, na máscara, o tipo do cronograma. */
export function itemName(e: Experiment | undefined, maskKind: MaskKind | null = null): string {
  const name = e ? productLabel(e) : 'Produto excluído'
  const kind = maskKindLabel(maskKind)
  // "Máscara Nutrição" já diz o tipo: não repete "(nutrição)".
  const plain = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return kind && !plain(name).includes(plain(kind)) ? `${name} (${kind.toLowerCase()})` : name
}

/**
 * O que mudou de uma rotina para outra, etapa por etapa, e as etapas iguais (com produto).
 * a = antes, b = depois.
 */
export function diffRoutine(
  a: Pick<DraftItem, 'experimentId' | 'step' | 'maskKind'>[],
  b: Pick<DraftItem, 'experimentId' | 'step' | 'maskKind'>[],
  experiments: Experiment[],
): { changed: StepChange[]; same: RoutineStep[] } {
  const byId = new Map(experiments.map((e) => [e.id, e]))
  const names = (items: typeof a, step: RoutineStep) => items.filter((i) => i.step === step).map((i) => itemName(byId.get(i.experimentId), i.maskKind))
  const changed: StepChange[] = []
  const same: RoutineStep[] = []
  for (const { id } of ROUTINE_STEPS) {
    const before = names(a, id)
    const after = names(b, id)
    if (!before.length && !after.length) continue
    if (before.join('|') === after.join('|')) same.push(id)
    else changed.push({ step: id, before, after })
  }
  return { changed, same }
}

/** "Mudou: shampoo e máscara." / "Igual à anterior." / null sem anterior. */
export function changeSummary(changed: StepChange[]): string {
  if (!changed.length) return 'Igual à anterior.'
  const parts = changed.map((c) => stepLabel(c.step).toLowerCase())
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
  return `Mudou: ${list}.`
}

/** Cronograma capilar: o tipo de máscara das últimas finalizações (da mais antiga à mais nova). */
export function schedule(experiments: Experiment[], routines: Routines, max = 8): { finalizationId: string; kind: MaskKind; start: string }[] {
  const out: { finalizationId: string; kind: MaskKind; start: string }[] = []
  for (const { finalization } of allFinalizations(experiments)) {
    const mask = (routines[finalization.id] ?? []).find((i) => i.step === 'mask' && i.mask_kind)
    if (mask?.mask_kind) out.push({ finalizationId: finalization.id, kind: mask.mask_kind, start: finalization.start })
    if (out.length >= max) break
  }
  return out.reverse()
}

/** Finalizações em que o produto entrou (de qualquer produto principal). */
export function finalizationsWith(experimentId: string, experiments: Experiment[], routines: Routines) {
  return allFinalizations(experiments).filter(
    ({ experiment, finalization }) => experiment.id === experimentId || (routines[finalization.id] ?? []).some((i) => i.experiment_id === experimentId),
  )
}

/** Rotina em texto, para o PDF, a mensagem e a IA: "Lavar: Shampoo X · Fixar: Geleia Y". */
export function routineText(items: RoutineItem[] | undefined, experiments: Experiment[]): string | null {
  if (!items?.length) return null
  const byId = new Map(experiments.map((e) => [e.id, e]))
  const groups = ROUTINE_STEPS.flatMap(({ id, label }) => {
    const names = sortRoutine(items)
      .filter((i) => i.step === id)
      .map((i) => itemName(byId.get(i.experiment_id), i.mask_kind))
    return names.length ? [`${label}: ${names.join(', ')}`] : []
  })
  return groups.length ? groups.join(' · ') : null
}

export type ScoreKey = 'definition' | 'frizz_control' | 'volume' | 'day2'
export const SCORE_LABEL: Record<ScoreKey, string> = { definition: 'Definição', frizz_control: 'Controle do frizz', volume: 'Volume', day2: 'Dia seguinte' }

/**
 * Média das notas da IA nas finalizações com o produto e nas outras (as analisadas). Dia
 * seguinte sem fotos (nulo ou negativo) não entra na média.
 */
export function productScores(
  withIds: string[],
  scores: Map<string, Partial<Record<ScoreKey, number | null>>>,
): { with: number; without: number; rows: { key: ScoreKey; with: number | null; without: number | null }[] } {
  const inSet = new Set(withIds)
  const avg = (ids: string[], key: ScoreKey) => {
    const vals = ids.map((id) => scores.get(id)?.[key]).filter((v): v is number => typeof v === 'number' && v >= 0)
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
  }
  const all = [...scores.keys()]
  const yes = all.filter((id) => inSet.has(id))
  const no = all.filter((id) => !inSet.has(id))
  return {
    with: yes.length,
    without: no.length,
    rows: (Object.keys(SCORE_LABEL) as ScoreKey[]).map((key) => ({ key, with: avg(yes, key), without: avg(no, key) })),
  }
}

/**
 * Rotina como tabela do PDF: [etapa, produto, marca] por produto, na ordem da rotina (a etapa só
 * na primeira linha dela). Só quando tem mais que o produto principal (senão repete o título).
 */
export function routineTable(items: RoutineItem[] | undefined, experiments: Experiment[]): string[][] | null {
  if (!items || items.length < 2) return null
  const byId = new Map(experiments.map((e) => [e.id, e]))
  return sortRoutine(items).map((i, k, all) => {
    const e = byId.get(i.experiment_id)
    return [k > 0 && all[k - 1].step === i.step ? '' : stepLabel(i.step), itemName(e, i.mask_kind), (e && brandLabel(e)) || '']
  })
}

/** Rotina em selos curtos: "Shampoo · Máscara N · Mousse" (tipo de cada produto). Vazia: null. */
export function routineShort(items: RoutineItem[] | undefined, experiments: Experiment[]): string | null {
  if (!items?.length) return null
  const byId = new Map(experiments.map((e) => [e.id, e]))
  return sortRoutine(items)
    .map((i) => {
      const e = byId.get(i.experiment_id)
      const label = e ? (productType(e.category)?.label ?? productLabel(e)) : 'Produto'
      return i.mask_kind ? `${label} ${i.mask_kind}` : label
    })
    .join(' · ')
}

export interface RoutineDiff {
  /** Etapas com produto nos dois lados, mas diferentes: o que A e B usaram. */
  swapped: { step: RoutineStep; a: string[]; b: string[] }[]
  onlyA: RoutineStep[]
  onlyB: RoutineStep[]
  same: RoutineStep[]
}

/** Diferença entre as rotinas de A e B, separada em trocas e no que só um lado tem. */
export function compareRoutines(a: DraftItem[], b: DraftItem[], experiments: Experiment[]): RoutineDiff {
  const { changed, same } = diffRoutine(b, a, experiments)
  return {
    swapped: changed.filter((c) => c.before.length && c.after.length).map((c) => ({ step: c.step, a: c.after, b: c.before })),
    onlyA: changed.filter((c) => !c.before.length).map((c) => c.step),
    onlyB: changed.filter((c) => !c.after.length).map((c) => c.step),
    same,
  }
}

/** O que mudou em frases curtas (PDF e mensagem): "Fixar: Mousse × Gelatina", "Só em A: lavar, máscara". */
export function compareLines(d: RoutineDiff): string[] {
  const steps = (s: RoutineStep[]) => s.map((x) => stepLabel(x).toLowerCase()).join(', ')
  return [
    ...d.swapped.map((s) => `${stepLabel(s.step)}: ${s.a.join(', ')} × ${s.b.join(', ')}`),
    ...(d.onlyA.length ? [`Só em A: ${steps(d.onlyA)}`] : []),
    ...(d.onlyB.length ? [`Só em B: ${steps(d.onlyB)}`] : []),
  ]
}
