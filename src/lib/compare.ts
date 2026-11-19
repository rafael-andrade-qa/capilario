import { ANGLES, type Angle } from './domain'

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
