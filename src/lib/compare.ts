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
// Molhado só com Molhado. Seco e Dia seguinte com o mesmo tipo e também entre si
// (ver como o Seco amanheceu). O tipo escolhido manda no lado A; o lado B oferece
// primeiro o mesmo tipo e, depois, o tipo vizinho.
export function compatibleTypes(type: StageType): StageType[] {
  if (type === 'wet') return ['wet']
  return type === 'dry' ? ['dry', 'next_day'] : ['next_day', 'dry']
}

export interface CompareItem {
  id: string
  type: StageType
  capturedAt: string
}

const byRecent = (x: CompareItem, y: CompareItem) => Date.parse(y.capturedAt) - Date.parse(x.capturedAt)

/** Sugestão para um tipo: A = mais recente desse tipo; B = o anterior do mesmo tipo, senão o mais recente compatível. */
export function defaultPair(items: CompareItem[], type: StageType): { a: string; b: string } | null {
  const sorted = [...items].sort(byRecent)
  const a = sorted.find((i) => i.type === type)
  if (!a) return null
  for (const t of compatibleTypes(type)) {
    const b = sorted.find((i) => i.type === t && i.id !== a.id)
    if (b) return { a: a.id, b: b.id }
  }
  return null
}

/** Tipo inicial: o da etapa mais recente que tenha com quem comparar. */
export function initialType(items: CompareItem[]): StageType | null {
  for (const i of [...items].sort(byRecent)) if (defaultPair(items, i.type)) return i.type
  return null
}

/** B continua válido se for outra etapa, de tipo compatível com A. */
export function isCompatible(a: CompareItem, b: CompareItem): boolean {
  return a.id !== b.id && compatibleTypes(a.type).includes(b.type)
}
