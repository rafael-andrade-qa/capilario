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

// ---------------------------------------------------------------------------------------------
// Enquadramento pela cabeça (cabelo + rosto). O foco é o cabelo, com o rosto aparecendo: o topo
// do cabelo fica logo abaixo da borda de cima e a cabeça preenche o quadro, com pouco ombro.
// Proporções medidas em fotos reais (frente, perfis e costas, de perto e de tripé).

export type PhotoAngle = 'front' | 'left' | 'right' | 'back'

export interface HeadInfo {
  W: number
  H: number
  /** Caixa do rosto (sobrancelha ao queixo), do detector de rosto. */
  face: Box | null
  /** Caixa do cabelo, da segmentação de cabelo. */
  hair: Box | null
  angle: PhotoAngle
}

/** Rosto (caixa do detector) = esta fração da altura do quadro. É a escala: não depende do cabelo,
 * então um cabelo mais volumoso aparece maior (dá para comparar volume). */
export const HEAD_FACE_HEIGHT = 0.55
/** Espaço acima do topo do cabelo, em fração da altura do quadro. */
export const HEAD_TOP_MARGIN = 0.04
/** Onde fica o centro do rosto no quadro (só para a oval-guia do editor). */
export const HEAD_FACE_CENTER_Y = 0.61
/** Sem rosto confiável: altura do quadro = altura do cabelo × fator (frente, perfil, costas). */
const HAIR_TO_FRAME: Record<PhotoAngle, number> = { front: 2.05, left: 1.65, right: 1.65, back: 1.36 }
/** Folga mínima embaixo do queixo/nuca (ou do fim do cabelo) e nas laterais do cabelo. */
const MIN_BOTTOM = 0.08
const SIDE_FILL = 0.97

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

/** O rosto só vale para a escala de frente (de perfil a caixa encolhe; de costas é engano). */
const faceForScale = (p: HeadInfo) => (p.angle === 'front' ? p.face : null)
/** De costas o detector às vezes "acha" rosto na nuca: ignora. */
const usableFace = (p: HeadInfo) => (p.angle === 'back' ? null : p.face)

/** Altura do quadro (px) que a própria foto sugere, ou null sem nada detectado. */
export function headFrameHeight(p: HeadInfo): number | null {
  const f = faceForScale(p)
  if (f) return f.h / HEAD_FACE_HEIGHT
  if (p.hair) return p.hair.h * HAIR_TO_FRAME[p.angle]
  if (p.face) return p.face.h / HEAD_FACE_HEIGHT / (p.angle === 'front' ? 1 : 0.7)
  return null
}

/**
 * Recorte de uma foto pela cabeça. `frameH` (px) força a escala (a mesma do momento todo); sem
 * ele, usa a escala da própria foto. Se a cabeça não couber, afasta o necessário.
 */
export function headCrop(p: HeadInfo, frameH?: number | null): Crop {
  const face = usableFace(p)
  const head = p.hair && face ? union(p.hair, face) : p.hair ?? face
  let ch = frameH ?? headFrameHeight(p)
  if (!head || !ch) return coverCrop(p.W, p.H)
  const top = p.hair ? p.hair.y : face!.y - face!.h * 0.55
  // Fim do que precisa aparecer: o queixo (ou, sem rosto, estimado pelo cabelo; de costas, a
  // nuca) e, se o cabelo for comprido, até onde ele termina.
  const chin = face ? face.y + face.h : p.hair!.y + p.hair!.h * (p.angle === 'back' ? 1 : 1.35)
  const bottom = Math.max(chin, p.hair ? p.hair.y + p.hair.h : chin)
  ch = Math.max(ch, (bottom - top) / (1 - HEAD_TOP_MARGIN - MIN_BOTTOM), head.w / SIDE_FILL / FRAME)
  const cw = ch * FRAME
  const cx = head.x + head.w / 2
  return normalize({ x: cx - cw / 2, y: top - HEAD_TOP_MARGIN * ch, w: cw, h: ch }, p.W, p.H)
}

/** Mesmo aparelho e mesma pose (tamanhos quase iguais): dá para usar a mesma escala em pixels. */
const sameCamera = (a: { W: number; H: number }, b: { W: number; H: number }) =>
  Math.abs(a.W - b.W) / a.W < 0.03 && Math.abs(a.H - b.H) / a.H < 0.03

/**
 * Recortes de um momento inteiro: cada foto é centralizada na própria cabeça (a pessoa se mexe
 * entre um ângulo e outro), mas a escala vem do rosto da foto de frente quando as fotos são da
 * mesma câmera, para frente, perfis e costas ficarem do mesmo tamanho.
 */
export function momentCrops(photos: (HeadInfo & { key: string })[]): Record<string, Crop> {
  const out: Record<string, Crop> = {}
  const ref = photos.find((p) => faceForScale(p))
  const refH = ref ? headFrameHeight(ref) : null
  for (const p of photos) {
    const own = headFrameHeight(p)
    let frame = ref && refH && sameCamera(ref, p) ? refH : own
    // A pessoa se aproxima/afasta entre uma foto e outra (selfie de frente, perfil de mais
    // longe): a escala da frente vale só enquanto não deixa a cabeça pequena ou cortada demais.
    if (frame && own) frame = Math.min(Math.max(frame, own * 0.9), own * 1.08)
    out[p.key] = headCrop(p, frame)
  }
  return out
}
