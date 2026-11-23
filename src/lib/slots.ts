// Lógica pura de distribuição das fotos selecionadas nos espaços de ângulo.
import { ANGLES, type Angle } from './domain'

export type Slots<T> = Record<Angle, T | null>

export function emptySlots<T>(): Slots<T> {
  return { front: null, left: null, back: null, right: null }
}

/**
 * Coloca os itens nos espaços vagos, na ordem retornada pelo seletor.
 * `allowed` limita os espaços utilizáveis (ex.: só os ângulos que faltam em "Completar fotos").
 * Retorna os itens que não couberam.
 */
export function assignInOrder<T>(slots: Slots<T>, items: T[], allowed: readonly Angle[] = ANGLES): { slots: Slots<T>; overflow: T[] } {
  const next = { ...slots }
  const queue = [...items]
  for (const angle of ANGLES) {
    if (!allowed.includes(angle) || next[angle] !== null) continue
    const item = queue.shift()
    if (item === undefined) break
    next[angle] = item
  }
  return { slots: next, overflow: queue }
}

/** Troca o conteúdo de dois espaços (um deles pode estar vazio = mover). */
export function swapSlots<T>(slots: Slots<T>, a: Angle, b: Angle): Slots<T> {
  if (a === b) return slots
  return { ...slots, [a]: slots[b], [b]: slots[a] }
}

export function clearSlot<T>(slots: Slots<T>, angle: Angle): Slots<T> {
  return { ...slots, [angle]: null }
}

export function setSlot<T>(slots: Slots<T>, angle: Angle, item: T): Slots<T> {
  return { ...slots, [angle]: item }
}

export function filledAngles<T>(slots: Slots<T>): Angle[] {
  return ANGLES.filter((a) => slots[a] !== null)
}
