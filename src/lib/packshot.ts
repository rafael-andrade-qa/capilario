// Foto do produto "do nosso jeito": corta o fundo branco sobrando, centraliza a embalagem num
// retrato 3:4 (o formato das miniaturas) com fundo branco e a mesma margem para todas.

export const PACKSHOT_W = 900
export const PACKSHOT_H = 1200
const PAD = 0.08
const ANALYSIS_MAX = 600

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Caixa do conteúdo (RGBA): tudo que não é quase branco nem transparente. Linhas e colunas com
 * pouquíssimos pixels de conteúdo (sujeira, sombra leve) não contam. null = imagem só de fundo.
 */
export function contentBox(data: Uint8ClampedArray, width: number, height: number, white = 238): Box | null {
  const cols = new Uint32Array(width)
  const rows = new Uint32Array(height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const bg = data[i + 3] < 24 || (data[i] >= white && data[i + 1] >= white && data[i + 2] >= white)
      if (!bg) {
        cols[x]++
        rows[y]++
      }
    }
  }
  const minCol = Math.max(2, Math.round(height * 0.004))
  const minRow = Math.max(2, Math.round(width * 0.004))
  const first = (a: Uint32Array, min: number) => a.findIndex((v) => v >= min)
  const last = (a: Uint32Array, min: number) => {
    for (let i = a.length - 1; i >= 0; i--) if (a[i] >= min) return i
    return -1
  }
  const x0 = first(cols, minCol)
  const y0 = first(rows, minRow)
  if (x0 < 0 || y0 < 0) return null
  const x1 = last(cols, minCol)
  const y1 = last(rows, minRow)
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** Onde desenhar um conteúdo w×h dentro do retrato, centralizado, com margem e sem distorcer. */
export function fitInFrame(w: number, h: number, frameW = PACKSHOT_W, frameH = PACKSHOT_H, pad = PAD) {
  const m = Math.round(Math.min(frameW, frameH) * pad)
  const scale = Math.min((frameW - 2 * m) / w, (frameH - 2 * m) / h)
  const dw = Math.round(w * scale)
  const dh = Math.round(h * scale)
  return { dx: Math.round((frameW - dw) / 2), dy: Math.round((frameH - dh) / 2), dw, dh }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('canvas')
  return { c, ctx }
}

const toBlob = (c: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), type, quality))

/** Gera a foto padronizada (JPEG) a partir de qualquer imagem. */
export async function toPackshot(blob: Blob): Promise<File> {
  const bmp = await createImageBitmap(blob)
  try {
    const s = Math.min(1, ANALYSIS_MAX / Math.max(bmp.width, bmp.height))
    const aw = Math.max(1, Math.round(bmp.width * s))
    const ah = Math.max(1, Math.round(bmp.height * s))
    const a = canvas(aw, ah)
    a.ctx.drawImage(bmp, 0, 0, aw, ah)
    const box = contentBox(a.ctx.getImageData(0, 0, aw, ah).data, aw, ah)
    // Sem conteúdo claro (ou quase nada): usa a imagem inteira.
    const useBox = box && box.w > aw * 0.05 && box.h > ah * 0.05 ? box : { x: 0, y: 0, w: aw, h: ah }
    const sx = useBox.x / s
    const sy = useBox.y / s
    const sw = Math.min(bmp.width - sx, useBox.w / s)
    const sh = Math.min(bmp.height - sy, useBox.h / s)
    const out = canvas(PACKSHOT_W, PACKSHOT_H)
    out.ctx.fillStyle = '#ffffff'
    out.ctx.fillRect(0, 0, PACKSHOT_W, PACKSHOT_H)
    const { dx, dy, dw, dh } = fitInFrame(sw, sh)
    out.ctx.imageSmoothingQuality = 'high'
    out.ctx.drawImage(bmp, sx, sy, sw, sh, dx, dy, dw, dh)
    const jpg = await toBlob(out.c, 'image/jpeg', 0.9)
    return new File([jpg], 'produto.jpg', { type: 'image/jpeg' })
  } finally {
    bmp.close()
  }
}

/** Reduz a foto (lado maior ≤ maxSide) e devolve JPEG em base64, para mandar à identificação. */
export async function downscaleToBase64(blob: Blob, maxSide = 1280): Promise<string> {
  const bmp = await createImageBitmap(blob)
  try {
    const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * s))
    const h = Math.max(1, Math.round(bmp.height * s))
    const { c, ctx } = canvas(w, h)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bmp, 0, 0, w, h)
    const jpg = await toBlob(c, 'image/jpeg', 0.85)
    const bytes = new Uint8Array(await jpg.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin)
  } finally {
    bmp.close()
  }
}
