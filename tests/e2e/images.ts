// Imagens sintéticas para os testes (nenhuma foto pessoal no repositório).
import { deflateSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePng(width: number, height: number, rgb: Buffer, level = 6): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // RGB
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** PNG retrato (3:4) com cor sólida e uma faixa: cada ângulo fica visualmente distinto. */
export function colorPng(r: number, g: number, b: number, w = 120, h = 160): Buffer {
  const rgb = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      const band = y > h * 0.4 && y < h * 0.6
      rgb[i] = band ? 255 - r : r
      rgb[i + 1] = band ? 255 - g : g
      rgb[i + 2] = band ? 255 - b : b
    }
  return encodePng(w, h, rgb)
}

/** "Foto de vitrine" sintética: fundo branco largo e um frasco colorido fora do centro. */
export function packshotPng(r: number, g: number, b: number, w = 400, h = 300): Buffer {
  const rgb = Buffer.alloc(w * h * 3, 255)
  for (let y = Math.round(h * 0.2); y < Math.round(h * 0.9); y++)
    for (let x = Math.round(w * 0.1); x < Math.round(w * 0.3); x++) {
      const i = (y * w + x) * 3
      rgb[i] = r
      rgb[i + 1] = g
      rgb[i + 2] = b
    }
  return encodePng(w, h, rgb)
}

/** PNG de ruído (não comprime) com ~bytes: força o upload retomável (> 6 MB). */
export function noisyPng(approxBytes: number): Buffer {
  const side = Math.ceil(Math.sqrt(approxBytes / 3))
  return encodePng(side, side, randomBytes(side * side * 3), 0)
}

export interface TestFile {
  name: string
  mimeType: string
  buffer: Buffer
}

export const FRONT: TestFile = { name: 'frente.png', mimeType: 'image/png', buffer: colorPng(200, 40, 40) }
export const LEFT: TestFile = { name: 'esquerdo.png', mimeType: 'image/png', buffer: colorPng(40, 160, 60) }
export const RIGHT: TestFile = { name: 'direito.png', mimeType: 'image/png', buffer: colorPng(40, 80, 200) }
export const BACK: TestFile = { name: 'costas.png', mimeType: 'image/png', buffer: colorPng(220, 180, 30) }
