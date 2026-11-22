// Fotos mais leves, preparadas no próprio aparelho antes do envio:
//  - a foto: no máximo 2048 px no lado maior (foto de câmera de 12 MP, 3 a 5 MB, vira ~0,5 MB);
//    foto que já é pequena sobe como está, sem perder qualidade;
//  - a miniatura: 720 px no lado maior (~40 KB), usada nas listas, onde a foto aparece pequena.
// O enquadramento é guardado em frações da imagem, então vale igual para a foto e a miniatura.
// A data em que a foto foi tirada é lida do arquivo original antes, então nada se perde.

/** Lado maior da foto enviada. */
export const MAX_SIDE = 2048
/** Até este tamanho, uma foto que já cabe em MAX_SIDE sobe sem ser recomprimida. */
export const KEEP_BYTES = 2.5 * 1024 * 1024
/** Lado maior da miniatura. */
export const THUMB_SIDE = 720

/** Caminho da miniatura de uma foto: mesmo lugar, com _t.jpg no fim ("a/b/c.png" → "a/b/c_t.jpg"). */
export function thumbPath(path: string): string {
  return path.replace(/\.[a-z0-9]+$/i, '') + '_t.jpg'
}

/** É o caminho de uma miniatura? */
export function isThumbPath(path: string): boolean {
  return path.endsWith('_t.jpg')
}

/** Tamanho final cabendo em `max` no lado maior, sem nunca aumentar. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }
}

/** A foto precisa ser reduzida/recomprimida antes do envio? */
export function needsResize(w: number, h: number, bytes: number): boolean {
  return Math.max(w, h) > MAX_SIDE || bytes > KEEP_BYTES
}

export interface PreparedImage {
  /** O que sobe como a foto (o próprio arquivo, se já era leve). */
  file: Blob
  mime: string
  /** Miniatura em JPEG; null se o navegador não conseguiu gerar (a lista usa a foto). */
  thumb: Blob | null
}

// <img> respeita a orientação gravada pela câmera (foto "deitada" aparece em pé), então o que
// for desenhado no canvas sai igual ao que o app mostra.
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler a imagem.'))
    }
    img.src = url
  })
}

async function encode(img: HTMLImageElement, max: number, quality: number): Promise<Blob | null> {
  const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, max)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#fff' // PNG com transparência: fundo branco no JPEG
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b && b.size > 0 ? b : null), 'image/jpeg', quality),
  )
  canvas.width = 0 // libera a memória do canvas logo (iPhone tem limite baixo)
  canvas.height = 0
  return blob
}

/**
 * Prepara uma foto para envio: reduz se for grande e gera a miniatura.
 * Fora do navegador (testes de integração) ou se algo falhar, devolve o arquivo como veio.
 */
export async function prepareImage(file: Blob, mime: string): Promise<PreparedImage> {
  if (typeof document === 'undefined') return { file, mime, thumb: null }
  let img: HTMLImageElement
  try {
    img = await loadImage(file)
  } catch {
    return { file, mime, thumb: null }
  }
  let out: PreparedImage = { file, mime, thumb: null }
  if (needsResize(img.naturalWidth, img.naturalHeight, file.size)) {
    const small = await encode(img, MAX_SIDE, 0.85).catch(() => null)
    if (small && small.size < file.size) out = { file: small, mime: 'image/jpeg', thumb: null }
  }
  out.thumb = await encode(img, THUMB_SIDE, 0.78).catch(() => null)
  return out
}
