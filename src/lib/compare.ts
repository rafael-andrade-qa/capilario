import { ANGLES, type Angle, type StageType } from './domain'

export interface InitialAngle {
  angle: Angle
  /** Qual lado está sem foto nesse ângulo (null quando os dois têm). */
  missing: 'a' | 'b' | 'both' | null
}

/**
 * Ângulo inicial do comparador: o primeiro que existe nos dois registros.
 * Sem ângulo em comum, o primeiro que tenha foto em algum lado, avisando o lado vazio.
 */
export function initialAngle(a: readonly Angle[], b: readonly Angle[]): InitialAngle {
  const common = ANGLES.find((x) => a.includes(x) && b.includes(x))
  if (common) return { angle: common, missing: null }
  const any = ANGLES.find((x) => a.includes(x) || b.includes(x))
  if (!any) return { angle: 'front', missing: 'both' }
  return { angle: any, missing: missingSide(a, b, any) }
}

export function missingSide(a: readonly Angle[], b: readonly Angle[], angle: Angle): InitialAngle['missing'] {
  const hasA = a.includes(angle)
  const hasB = b.includes(angle)
  if (hasA && hasB) return null
  if (!hasA && !hasB) return 'both'
  return hasA ? 'b' : 'a'
}

// ---------------------------------------------------------------------------
// Quais etapas faz sentido comparar
// ---------------------------------------------------------------------------
// Só a mesma etapa: Molhado com Molhado, Seco com Seco, Dia seguinte com Dia seguinte.
// Misturar etapas mistura duas variáveis (o produto e o tempo/noite de sono).

/** Ângulos que os dois registros têm: só esses dão para comparar. */
export function commonAngles(a: readonly Angle[], b: readonly Angle[]): Angle[] {
  return ANGLES.filter((x) => a.includes(x) && b.includes(x))
}

export interface CompareItem {
  id: string
  type: StageType
  capturedAt: string
  /** Finalização a que o momento pertence (o par padrão é de duas finalizações diferentes). */
  finalizationId?: string
}

const byRecent = (x: CompareItem, y: CompareItem) => Date.parse(y.capturedAt) - Date.parse(x.capturedAt)

const finOf = (i: CompareItem) => i.finalizationId ?? i.id

/** Sugestão para um tipo: A = a mais recente, B = a anterior (de outra finalização). */
export function defaultPair(items: CompareItem[], type: StageType): { a: string; b: string } | null {
  const same = items.filter((i) => i.type === type).sort(byRecent)
  if (same.length < 2) return null
  const b = same.find((i) => finOf(i) !== finOf(same[0])) ?? same[1]
  return { a: same[0].id, b: b.id }
}

/**
 * Tipo inicial: a última finalização contra a penúltima, no momento que as duas têm (Seco de
 * preferência, depois Molhado e Dia seguinte). Sem momento em comum: o da etapa mais recente
 * que tenha com quem comparar.
 */
export function initialType(items: CompareItem[]): StageType | null {
  const latest = new Map<string, number>()
  for (const i of items) latest.set(finOf(i), Math.max(latest.get(finOf(i)) ?? 0, Date.parse(i.capturedAt)))
  const [f1, f2] = [...latest.entries()].sort((x, y) => y[1] - x[1]).map(([f]) => f)
  if (f1 && f2) {
    for (const t of ['dry', 'wet', 'next_day'] as StageType[]) {
      const has = (f: string) => items.some((i) => finOf(i) === f && i.type === t)
      if (has(f1) && has(f2)) return t
    }
  }
  for (const i of [...items].sort(byRecent)) if (defaultPair(items, i.type)) return i.type
  return null
}

/** B continua válido se for outra etapa, do mesmo tipo de A. */
export function isCompatible(a: CompareItem, b: CompareItem): boolean {
  return a.id !== b.id && a.type === b.type
}

/** Endereço do Comparar com o momento, os dois registros e o ângulo. */
export function compareUrl(type: StageType, a?: string, b?: string, angle?: Angle) {
  const q = new URLSearchParams({ etapa: type })
  if (a) q.set('a', a)
  if (b) q.set('b', b)
  if (angle) q.set('angulo', angle)
  return `/comparar?${q.toString()}`
}
