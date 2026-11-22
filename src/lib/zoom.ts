// Zoom só de visualização (no visualizador de fotos): escala e deslocamento da foto dentro do
// quadro. O ponto p do quadro aparece em t + s·p (origem no canto de cima, à esquerda).
export interface View {
  s: number
  x: number
  y: number
}

export const NO_ZOOM: View = { s: 1, x: 0, y: 0 }
export const MAX_ZOOM = 4
/** Toque duplo: aproxima até aqui (ou volta ao normal se já estiver aproximado). */
export const DOUBLE_TAP_ZOOM = 2.5

/** Mantém a foto cobrindo o quadro inteiro (sem sobrar borda vazia). */
export function clampView(v: View, W: number, H: number): View {
  const s = Math.min(MAX_ZOOM, Math.max(1, v.s))
  if (s === 1) return NO_ZOOM
  return { s, x: Math.min(0, Math.max(W - s * W, v.x)), y: Math.min(0, Math.max(H - s * H, v.y)) }
}

/** Aproxima (factor > 1) ou afasta em volta do ponto (cx, cy) do quadro, que fica parado. */
export function zoomAt(v: View, factor: number, cx: number, cy: number, W: number, H: number): View {
  const s = Math.min(MAX_ZOOM, Math.max(1, v.s * factor))
  const k = s / v.s
  return clampView({ s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }, W, H)
}

/** Arrasta a foto aproximada. */
export function panBy(v: View, dx: number, dy: number, W: number, H: number): View {
  return clampView({ s: v.s, x: v.x + dx, y: v.y + dy }, W, H)
}

/** Toque duplo: normal → aproximado no ponto tocado; aproximado → normal. */
export function toggleZoom(v: View, cx: number, cy: number, W: number, H: number): View {
  return v.s > 1.05 ? NO_ZOOM : zoomAt(NO_ZOOM, DOUBLE_TAP_ZOOM, cx, cy, W, H)
}
