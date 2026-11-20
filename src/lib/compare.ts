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
}

const byRecent = (x: CompareItem, y: CompareItem) => Date.parse(y.capturedAt) - Date.parse(x.capturedAt)

/** Sugestão para um tipo: A = mais recente desse tipo; B = o anterior do mesmo tipo. */
export function defaultPair(items: CompareItem[], type: StageType): { a: string; b: string } | null {
  const same = items.filter((i) => i.type === type).sort(byRecent)
  return same.length >= 2 ? { a: same[0].id, b: same[1].id } : null
}

/** Tipo inicial: o da etapa mais recente que tenha com quem comparar. */
export function initialType(items: CompareItem[]): StageType | null {
  for (const i of [...items].sort(byRecent)) if (defaultPair(items, i.type)) return i.type
  return null
}

/** B continua válido se for outra etapa, do mesmo tipo de A. */
export function isCompatible(a: CompareItem, b: CompareItem): boolean {
  return a.id !== b.id && a.type === b.type
}
