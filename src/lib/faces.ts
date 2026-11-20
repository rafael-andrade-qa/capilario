// Detecção de rosto no próprio aparelho (MediaPipe, modelo BlazeFace), para o enquadramento
// automático. Nada sai do celular. A biblioteca (~15 MB) só carrega na primeira vez que for usada.
//
// O modelo é de "curta distância": acha bem rostos grandes na imagem. Foto de tripé, de longe,
// tem rosto pequeno; por isso procuramos em várias escalas: a imagem inteira e, se não achar com
// confiança, quadrados sobrepostos na parte de cima da foto (onde fica o rosto).
import type { FaceDetector } from '@mediapipe/tasks-vision'
import { searchTiles, type Box } from './framing'

let detector: Promise<FaceDetector | null> | null = null

function load(): Promise<FaceDetector | null> {
  detector ??= (async () => {
    try {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const base = import.meta.env.BASE_URL
      const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe`)
      return await FaceDetector.createFromOptions(fileset, {
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

export interface Analysis {
  W: number
  H: number
  face: Box | null
}

const TILE_PX = 384

/** Tamanho da imagem e o rosto mais confiável encontrado (caixa na escala original). */
export async function analyzePhoto(image: Blob): Promise<Analysis | null> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(image)
  } catch {
    return null
  }
  const W = bmp.width
  const H = bmp.height
  try {
    const det = await load()
    if (!det) return { W, H, face: null }
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const found: { best: { box: Box; score: number } | null } = { best: null }
    for (const level of searchTiles(W, H)) {
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
    return { W, H, face: found.best?.box ?? null }
  } catch {
    return { W, H, face: null }
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
