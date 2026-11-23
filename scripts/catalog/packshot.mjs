// Foto do catálogo "do nosso jeito": corta a sobra do fundo e centraliza num retrato 3:4
// (480x640) de fundo branco, com a mesma margem (8%) que o app usa nas fotos encontradas pela IA.
// Usado por photos.mjs (e testado em packshot.test.ts).
import sharp from 'sharp'

export const W = 480
export const H = 640
const MARGIN = Math.round(W * 0.08)

/**
 * Fundo de estúdio colorido (ex.: o cinza claro das fotos da marca) vira branco, como numa
 * correção de exposição: cada canal é esticado para a cor do fundo virar 255 (o produto clareia
 * na mesma proporção e a sombra suave quase some). Depois, o que ainda tem a cor do fundo e encosta
 * na borda vira branco puro, sem mexer no produto.
 */
async function whitenBackground(input, color, tolerance = 3) {
  const bg = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
  const { data, info } = await sharp(input).rotate().flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  for (let i = 0; i < data.length; i++) data[i] = Math.min(255, Math.round((data[i] * 255) / bg[i % 3]))
  const near = (p) => data[p * 3] >= 255 - tolerance && data[p * 3 + 1] >= 255 - tolerance && data[p * 3 + 2] >= 255 - tolerance
  const seen = new Uint8Array(w * h)
  const stack = []
  const push = (p) => {
    if (!seen[p] && near(p)) {
      seen[p] = 1
      stack.push(p)
    }
  }
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x)
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1)
  while (stack.length) {
    const p = stack.pop()
    data[p * 3] = data[p * 3 + 1] = data[p * 3 + 2] = 255
    const x = p % w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (p >= w) push(p - w)
    if (p < w * (h - 1)) push(p + w)
  }
  return sharp(data, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer()
}

/** Corta a sobra branca e encaixa no retrato com margem. `background`: cor do fundo a clarear. */
export async function packshot(input, { background } = {}) {
  const flat = background
    ? await whitenBackground(input, background)
    : await sharp(input).rotate().flatten({ background: '#ffffff' }).toBuffer()
  let trimmed
  try {
    trimmed = await sharp(flat).trim({ background: '#ffffff', threshold: 18 }).toBuffer()
  } catch {
    trimmed = flat // imagem toda de uma cor: sem corte
  }
  const fitted = await sharp(trimmed)
    .resize(W - 2 * MARGIN, H - 2 * MARGIN, { fit: 'inside', withoutEnlargement: false, kernel: 'lanczos3' })
    .toBuffer({ resolveWithObject: true })
  const left = Math.round((W - fitted.info.width) / 2)
  const top = Math.round((H - fitted.info.height) / 2)
  return sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([{ input: fitted.data, left, top }])
    .webp({ quality: 78, effort: 5 })
    .toBuffer()
}
