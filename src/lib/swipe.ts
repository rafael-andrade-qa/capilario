// Gestos do visualizador de fotos: para o lado troca de foto, para baixo fecha.
export type Axis = 'x' | 'y'
export type SwipeResult = 'next' | 'prev' | 'close' | 'stay'

/** Decide a direção do gesto depois de um pequeno movimento (evita tremida virar arrasto). */
export function lockAxis(dx: number, dy: number, slop = 8): Axis | null {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
}

/** Na primeira e na última foto o arrasto "pesa" (elástico), mostrando que acabou. */
export function edgeResist(dx: number, canPrev: boolean, canNext: boolean): number {
  if ((dx > 0 && !canPrev) || (dx < 0 && !canNext)) return dx * 0.3
  return dx
}

/** Ao soltar: passou de ~20% da largura (ou foi um gesto rápido) troca; para baixo, fecha. */
export function swipeOutcome(
  g: { dx: number; dy: number; ms: number; width: number; height: number; axis: Axis | null },
  canPrev: boolean,
  canNext: boolean,
): SwipeResult {
  const ms = Math.max(g.ms, 1)
  if (g.axis === 'x') {
    const far = Math.abs(g.dx) > g.width * 0.2
    const flick = Math.abs(g.dx) > 30 && Math.abs(g.dx) / ms > 0.45
    if (!far && !flick) return 'stay'
    if (g.dx < 0) return canNext ? 'next' : 'stay'
    return canPrev ? 'prev' : 'stay'
  }
  if (g.axis === 'y' && g.dy > 0) {
    const far = g.dy > g.height * 0.18
    const flick = g.dy > 40 && g.dy / ms > 0.45
    if (far || flick) return 'close'
  }
  return 'stay'
}
