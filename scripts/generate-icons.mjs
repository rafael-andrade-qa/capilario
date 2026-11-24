// Gera os ícones PNG do PWA a partir do logo do Capilário (um diário aberto com uma onda em
// cada página), desenhado em SVG e rasterizado com o sharp.
// Uso: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const CAFE = '#7a4b2a'
const CREME = '#fbf7f3'
const CARAMELO = '#d49a6a'

/**
 * O logo numa grade de 120. `rounded` = cantos arredondados transparentes (senão o fundo vai
 * até a borda: o iOS e o Android arredondam sozinhos); `scale` = tamanho do desenho dentro do
 * quadrado (menor no maskable, que é cortado em círculo); `bold` engrossa os traços (favicon).
 */
function svg({ rounded, scale, bold = false }) {
  const book = bold ? 10 : 6
  const wave = bold ? 8 : 5
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="${rounded ? 28 : 0}" fill="${CAFE}"/>
  <g transform="translate(60 62) scale(${scale}) translate(-60 -62)">
    <path d="M60 36 C48 28 32 28 22 32 L22 88 C32 84 48 84 60 92 C72 84 88 84 98 88 L98 32 C88 28 72 28 60 36 Z M60 36 L60 92"
      fill="none" stroke="${CREME}" stroke-width="${book}" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M29 62 q7 -8 14 0 t12 0 M66 62 q7 -8 14 0 t12 0"
      fill="none" stroke="${CARAMELO}" stroke-width="${wave}" stroke-linecap="round"/>
  </g>
</svg>`
}

const targets = [
  ['icon-192.png', 192, { rounded: true, scale: 1 }],
  ['icon-512.png', 512, { rounded: true, scale: 1 }],
  ['icon-maskable-512.png', 512, { rounded: false, scale: 0.72 }],
  ['apple-touch-icon.png', 180, { rounded: false, scale: 0.95 }],
  ['favicon-32.png', 32, { rounded: true, scale: 1.05, bold: true }],
]
for (const [name, size, opts] of targets) {
  const png = await sharp(Buffer.from(svg(opts)), { density: 72 * (size / 120) * 2 })
    .resize(size, size)
    .png()
    .toBuffer()
  writeFileSync(join(outDir, name), png)
  console.log('gerado', name)
}
writeFileSync(join(outDir, 'logo.svg'), svg({ rounded: true, scale: 1 }))
console.log('gerado logo.svg')
