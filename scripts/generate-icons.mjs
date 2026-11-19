// Gera os ícones PNG do PWA sem dependências externas (desenho procedural de ondas).
// Uso: npm run icons
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const BG = [122, 75, 42] // #7a4b2a
const FG = [251, 239, 226] // creme

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Desenha o ícone. `inset` = margem de segurança (maskable), `rounded` = cantos arredondados transparentes. */
function draw(size, { rounded, inset }) {
  const buf = Buffer.alloc(size * size * 4)
  const S = 3 // supersampling
  const radius = rounded ? 0.22 : 0
  const waves = [-0.2, 0, 0.2]
  const amp = 0.06
  const period = 0.42
  const thick = 0.045
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgCov = 0
      let fgCov = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (px + (sx + 0.5) / S) / size
          const v = (py + (sy + 0.5) / S) / size
          // fundo (quadrado com cantos arredondados opcionais)
          let inside = true
          if (radius > 0) {
            const cx = Math.min(Math.max(u, radius), 1 - radius)
            const cy = Math.min(Math.max(v, radius), 1 - radius)
            inside = (u - cx) ** 2 + (v - cy) ** 2 <= radius ** 2
          }
          if (!inside) continue
          bgCov++
          // ondas (coordenadas dentro da área segura)
          const x = (u - 0.5) / (1 - 2 * inset)
          const y = (v - 0.5) / (1 - 2 * inset)
          if (Math.abs(x) > 0.36) continue
          for (const off of waves) {
            const f = off + amp * Math.sin((2 * Math.PI * x) / period + off * 6)
            const df = amp * ((2 * Math.PI) / period) * Math.cos((2 * Math.PI * x) / period + off * 6)
            const d = Math.abs(y - f) / Math.sqrt(1 + df * df)
            if (d < thick / 2) {
              fgCov++
              break
            }
          }
        }
      }
      const total = S * S
      const a = bgCov / total
      const t = bgCov ? fgCov / bgCov : 0
      const i = (py * size + px) * 4
      for (let c = 0; c < 3; c++) buf[i + c] = Math.round(BG[c] * (1 - t) + FG[c] * t)
      buf[i + 3] = Math.round(a * 255)
    }
  }
  return png(size, buf)
}

const targets = [
  ['icon-192.png', 192, { rounded: true, inset: 0.08 }],
  ['icon-512.png', 512, { rounded: true, inset: 0.08 }],
  ['icon-maskable-512.png', 512, { rounded: false, inset: 0.2 }],
  ['apple-touch-icon.png', 180, { rounded: false, inset: 0.1 }],
  ['favicon-32.png', 32, { rounded: true, inset: 0.02 }],
]
for (const [name, size, opts] of targets) {
  writeFileSync(join(outDir, name), draw(size, opts))
  console.log('gerado', name)
}
