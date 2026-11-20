// Enquadramento das fotos: um recorte 3:4 da imagem original, em frações de 0 a 1.
// O arquivo nunca muda; a tela mostra só o recorte. Funções puras (testadas em framing.test.ts).

/** Recorte em frações da imagem: x/y do canto superior esquerdo, w/h do tamanho. */
export interface Crop {
  x: number
  y: number
  w: number
  h: number
}

/** Retângulo em pixels. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Proporção do quadro (largura / altura): o mesmo 3:4 das miniaturas e do comparador. */
export const FRAME = 3 / 4

/** Quanto da altura do quadro o rosto ocupa, e onde fica o centro dele (de cima para baixo). */
export const FACE_HEIGHT = 0.27
export const FACE_CENTER_Y = 0.45

const round = (n: number) => Math.round(n * 10000) / 10000

/** Maior recorte 3:4 que cabe na imagem, centralizado (o "preencher" sem faixas). */
export function coverCrop(W: number, H: number): Crop {
  const cw = Math.min(W, H * FRAME)
  const ch = cw / FRAME
  return normalize({ x: (W - cw) / 2, y: (H - ch) / 2, w: cw, h: ch }, W, H)
}

/** Recorte em pixels -> frações, já dentro da imagem e com 4 casas. */
export function normalize(b: Box, W: number, H: number): Crop {
  const c = clampBox(b, W, H)
  return { x: round(c.x / W), y: round(c.y / H), w: round(c.w / W), h: round(c.h / H) }
}

export function toBox(c: Crop, W: number, H: number): Box {
  return { x: c.x * W, y: c.y * H, w: c.w * W, h: c.h * H }
}

/** Mantém o recorte 3:4 dentro da imagem: diminui se não couber e empurra para dentro. */
export function clampBox(b: Box, W: number, H: number): Box {
  let w = b.w
  let h = b.h
  const max = Math.min(W / w, H / h, 1)
  w *= max
  h *= max
  const x = Math.min(Math.max(b.x + (b.w - w) / 2, 0), W - w)
  const y = Math.min(Math.max(b.y + (b.h - h) / 2, 0), H - h)
  return { x, y, w, h }
}

/**
 * Recorte a partir do rosto: o rosto ocupa a mesma fração da altura em todas as fotos (mesma
 * escala para comparar), centralizado na horizontal e um pouco acima do meio, deixando espaço
 * para o volume do cabelo.
 */
export function faceCrop(W: number, H: number, face: Box): Crop {
  const ch = face.h / FACE_HEIGHT
  const cw = ch * FRAME
  const cx = face.x + face.w / 2
  const cy = face.y + face.h / 2
  return normalize({ x: cx - cw / 2, y: cy - FACE_CENTER_Y * ch, w: cw, h: ch }, W, H)
}

/** Menor recorte permitido (zoom máximo): 1/6 da imagem. */
const MIN_FRACTION = 1 / 6

/** Zoom em volta de um ponto (frações do quadro, 0.5/0.5 = centro). factor > 1 aproxima. */
export function zoomCrop(c: Crop, factor: number, W: number, H: number, at = { x: 0.5, y: 0.5 }): Crop {
  const b = toBox(c, W, H)
  const maxW = Math.min(W, H * FRAME)
  const w = Math.min(maxW, Math.max(maxW * MIN_FRACTION, b.w / factor))
  const h = w / FRAME
  const px = b.x + at.x * b.w
  const py = b.y + at.y * b.h
  return normalize({ x: px - at.x * w, y: py - at.y * h, w, h }, W, H)
}

/** Arrastar: dx/dy em frações do quadro (arrastar para a direita mostra o que está à esquerda). */
export function panCrop(c: Crop, dx: number, dy: number, W: number, H: number): Crop {
  const b = toBox(c, W, H)
  return normalize({ ...b, x: b.x - dx * b.w, y: b.y - dy * b.h }, W, H)
}

/**
 * Onde procurar o rosto, por escala: a imagem inteira; depois quadrados de 60% e de 35% do lado
 * menor, sobrepostos pela metade, só nos 3/4 de cima (rosto de quem está em pé fica lá).
 */
export function searchTiles(W: number, H: number): Box[][] {
  const levels: Box[][] = [[{ x: 0, y: 0, w: W, h: H }]]
  for (const frac of [0.6, 0.35]) {
    const side = Math.round(Math.min(W, H) * frac)
    const step = Math.max(1, Math.round(side / 2))
    const tiles: Box[] = []
    const maxY = Math.max(0, Math.min(H - side, H * 0.75 - side / 2))
    for (let y = 0; y <= maxY + 1; y += step) {
      for (let x = 0; x <= W - side + 1; x += step) tiles.push({ x: Math.min(x, W - side), y: Math.min(y, H - side), w: side, h: side })
    }
    levels.push(tiles)
  }
  return levels
}

/** Estilo da <img> dentro de um quadro 3:4 com overflow escondido, para mostrar só o recorte. */
export function cropStyle(c: Crop): { width: string; height: string; left: string; top: string } {
  return {
    width: `${(100 / c.w).toFixed(3)}%`,
    height: `${(100 / c.h).toFixed(3)}%`,
    left: `${((-c.x / c.w) * 100).toFixed(3)}%`,
    top: `${((-c.y / c.h) * 100).toFixed(3)}%`,
  }
}

/** Recorte válido (como o banco aceita)? */
export function isCrop(v: unknown): v is Crop {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  const ok = ['x', 'y', 'w', 'h'].every((k) => typeof c[k] === 'number' && Number.isFinite(c[k]))
  if (!ok) return false
  const { x, y, w, h } = c as unknown as Crop
  return x >= 0 && y >= 0 && w > 0.02 && h > 0.02 && x + w <= 1.001 && y + h <= 1.001
}

/**
 * Recortes de um momento inteiro (mesma câmera, mesmo lugar): fotos com rosto usam o rosto; as
 * sem rosto (costas, perfil) usam o recorte da foto de frente se as imagens têm o mesmo tamanho
 * (tripé parado) e, se não, o "preencher" centralizado.
 */
export function momentCrops(
  photos: { key: string; W: number; H: number; face: Box | null; front: boolean }[],
): Record<string, Crop> {
  const out: Record<string, Crop> = {}
  const withFace = photos.filter((p) => p.face)
  const ref = withFace.find((p) => p.front) ?? withFace[0]
  for (const p of photos) {
    if (p.face) out[p.key] = faceCrop(p.W, p.H, p.face)
    else if (ref && ref.W === p.W && ref.H === p.H) out[p.key] = faceCrop(ref.W, ref.H, ref.face!)
    else out[p.key] = coverCrop(p.W, p.H)
  }
  return out
}
