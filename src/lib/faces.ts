// Análise da foto no próprio aparelho (MediaPipe), para o enquadramento automático: onde está o
// rosto (BlazeFace) e onde está o cabelo (segmentação de cabelo, que funciona até de costas).
// Nada sai do celular. A biblioteca (~15 MB) e os modelos (~1 MB) só carregam quando usados.
//
// O modelo de rosto é de "curta distância": acha bem rostos grandes na imagem. Foto de tripé, de
// longe, tem rosto pequeno; por isso procuramos em várias escalas: a imagem inteira e, se não
// achar com confiança, quadrados sobrepostos na parte de cima da foto (onde fica o rosto).
import type { FaceDetector, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import { searchTiles, type Box } from './framing'

const base = import.meta.env.BASE_URL
type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
let fileset: Promise<Fileset> | null = null
let detector: Promise<FaceDetector | null> | null = null
let segmenter: Promise<ImageSegmenter | null> | null = null

function vision() {
  fileset ??= import('@mediapipe/tasks-vision').then(({ FilesetResolver }) => FilesetResolver.forVisionTasks(`${base}mediapipe/${import.meta.env.VITE_MEDIAPIPE_VERSION}`))
  return fileset
}

function loadFaces(): Promise<FaceDetector | null> {
  detector ??= (async () => {
    try {
      const { FaceDetector } = await import('@mediapipe/tasks-vision')
      return await FaceDetector.createFromOptions(await vision(), {
        baseOptions: { modelAssetPath: `${base}models/blaze_face_short_range.tflite`, delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      })
    } catch {
      return null // sem suporte (ou falha ao carregar): segue sem enquadramento automático
    }
  })()
  return detector
}

function loadHair(): Promise<ImageSegmenter | null> {
  segmenter ??= (async () => {
    try {
      const { ImageSegmenter } = await import('@mediapipe/tasks-vision')
      return await ImageSegmenter.createFromOptions(await vision(), {
        baseOptions: { modelAssetPath: `${base}models/hair_segmenter.tflite`, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })
    } catch {
      return null
    }
  })()
  return segmenter
}

export interface Analysis {
  W: number
  H: number
  face: Box | null
  hair: Box | null
}

const TILE_PX = 384
const HAIR_PX = 512

async function findFace(bmp: ImageBitmap, canvas: HTMLCanvasElement): Promise<Box | null> {
  const det = await loadFaces()
  if (!det) return null
  const ctx = canvas.getContext('2d')!
  const found: { best: { box: Box; score: number } | null } = { best: null }
  for (const level of searchTiles(bmp.width, bmp.height)) {
    for (const t of level) {
      const s = Math.min(1, TILE_PX / Math.max(t.w, t.h))
      canvas.width = Math.max(1, Math.round(t.w * s))
      canvas.height = Math.max(1, Math.round(t.h * s))
      ctx.drawImage(bmp, t.x, t.y, t.w, t.h, 0, 0, canvas.width, canvas.height)
      for (const d of det.detect(canvas).detections) {
        const b = d.boundingBox
        const score = d.categories[0]?.score ?? 0
        if (!b || b.width <= 0 || score <= (found.best?.score ?? 0)) continue
        found.best = { score, box: { x: t.x + b.originX / s, y: t.y + b.originY / s, w: b.width / s, h: b.height / s } }
      }
    }
    if (found.best && found.best.score >= 0.75) break // achou com confiança nesta escala
  }
  return found.best?.box ?? null
}

/** Caixa (na escala da imagem) da maior mancha de cabelo dentro do quadrado `t`. */
function hairIn(seg: ImageSegmenter, bmp: ImageBitmap, canvas: HTMLCanvasElement, t: Box): Box | null {
  canvas.width = HAIR_PX
  canvas.height = HAIR_PX
  canvas.getContext('2d')!.drawImage(bmp, t.x, t.y, t.w, t.h, 0, 0, HAIR_PX, HAIR_PX)
  const r = seg.segment(canvas)
  try {
    const m = r.categoryMask
    if (!m) return null
    const blob = largestBlob(m.getAsUint8Array(), m.width, m.height)
    if (!blob || blob.area < m.width * m.height * 0.004) return null
    const sx = t.w / m.width
    const sy = t.h / m.height
    return { x: t.x + blob.x * sx, y: t.y + blob.y * sy, w: blob.w * sx, h: blob.h * sy }
  } finally {
    r.close()
  }
}

/** Maior região conectada de pixels marcados (ignora pontinhos soltos no fundo). */
export function largestBlob(mask: Uint8Array, mw: number, mh: number): (Box & { area: number }) | null {
  const seen = new Uint8Array(mw * mh)
  const stack: number[] = []
  let best: (Box & { area: number }) | null = null
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue
    let minx = mw
    let miny = mh
    let maxx = 0
    let maxy = 0
    let area = 0
    seen[i] = 1
    stack.push(i)
    while (stack.length) {
      const j = stack.pop()!
      const x = j % mw
      const y = (j - x) / mw
      area++
      if (x < minx) minx = x
      if (x > maxx) maxx = x
      if (y < miny) miny = y
      if (y > maxy) maxy = y
      if (x > 0 && mask[j - 1] && !seen[j - 1]) (seen[j - 1] = 1), stack.push(j - 1)
      if (x < mw - 1 && mask[j + 1] && !seen[j + 1]) (seen[j + 1] = 1), stack.push(j + 1)
      if (y > 0 && mask[j - mw] && !seen[j - mw]) (seen[j - mw] = 1), stack.push(j - mw)
      if (y < mh - 1 && mask[j + mw] && !seen[j + mw]) (seen[j + mw] = 1), stack.push(j + mw)
    }
    if (!best || area > best.area) best = { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, area }
  }
  return best
}

/** Cabelo em dois passos: no quadrado de cima da foto e, depois, de perto em volta do que achou. */
async function findHair(bmp: ImageBitmap, canvas: HTMLCanvasElement): Promise<Box | null> {
  const seg = await loadHair()
  if (!seg) return null
  const W = bmp.width
  const H = bmp.height
  const side = Math.min(W, H)
  const first = hairIn(seg, bmp, canvas, { x: (W - side) / 2, y: 0, w: side, h: side })
  if (!first) return null
  const s2 = Math.min(side, Math.max(first.w, first.h) * 2.2)
  const cx = first.x + first.w / 2
  const cy = first.y + first.h * 0.8
  const near = { x: Math.max(0, Math.min(W - s2, cx - s2 / 2)), y: Math.max(0, Math.min(H - s2, cy - s2 / 2)), w: s2, h: s2 }
  return hairIn(seg, bmp, canvas, near) ?? first
}

/** Tamanho da imagem, o rosto mais confiável e o cabelo (caixas na escala original). */
/**
 * Adianta o download e a preparação dos modelos (≈5 MB na primeira vez, depois ficam guardados),
 * para o enquadramento ficar pronto assim que a pessoa escolher as fotos.
 */
export function warmUpAnalysis(): void {
  void loadFaces()
  void loadHair()
}

export async function analyzePhoto(image: Blob): Promise<Analysis | null> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(image)
  } catch {
    return null
  }
  const W = bmp.width
  const H = bmp.height
  const canvas = document.createElement('canvas')
  try {
    const face = await findFace(bmp, canvas).catch(() => null)
    const hair = await findHair(bmp, canvas).catch(() => null)
    return { W, H, face, hair }
  } finally {
    bmp.close()
  }
}

/** Analisa uma foto já salva (URL assinada do Storage). */
export async function analyzeUrl(url: string): Promise<Analysis | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return analyzePhoto(await res.blob())
  } catch {
    return null
  }
}
