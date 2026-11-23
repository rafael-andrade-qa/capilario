import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo JS dos scripts (sem tipos)
import { H, W, packshot } from './packshot.mjs'

// Foto de estúdio sintética: fundo cinza claro (#ececec), produto cinza com faixa preta no meio.
async function studioPhoto() {
  const product = await sharp({ create: { width: 200, height: 300, channels: 3, background: '#cdcdcd' } })
    .composite([{ input: { create: { width: 200, height: 40, channels: 3, background: '#111111' } }, left: 0, top: 130 }])
    .png()
    .toBuffer()
  return sharp({ create: { width: 600, height: 800, channels: 3, background: '#ececec' } })
    .composite([{ input: product, left: 120, top: 300 }]) // fora do centro de propósito
    .png()
    .toBuffer()
}

async function pixels(webp: Buffer) {
  const { data, info } = await sharp(webp).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { info, at: (x: number, y: number) => data[(y * info.width + x) * 3] }
}

describe('packshot', () => {
  it('fundo colorido vira branco e o produto fica centralizado no retrato 3:4', async () => {
    const out = await packshot(await studioPhoto(), { background: '#ececec' })
    const { info, at } = await pixels(out)
    expect([info.width, info.height]).toEqual([W, H])
    // Fundo branco nas bordas e cantos.
    for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3], [10, H / 2]]) expect(at(x, y)).toBeGreaterThan(250)
    // Produto no centro (clareado na mesma proporção, mas ainda cinza) e a faixa escura no meio.
    expect(at(W / 2, H / 2 - 120)).toBeGreaterThan(200)
    expect(at(W / 2, H / 2 - 120)).toBeLessThan(240)
    expect(at(W / 2, H / 2)).toBeLessThan(40)
  })

  it('sem cor de fundo, nada muda de cor (o fundo cinza fica)', async () => {
    const { at } = await pixels(await packshot(await studioPhoto()))
    expect(Math.abs(at(W / 2, 100) - 0xec)).toBeLessThan(4)
    // Com a cor do fundo, o produto clareia na proporção do fundo (0xcd * 255 / 0xec ≈ 221).
    const lit = await pixels(await packshot(await studioPhoto(), { background: '#ececec' }))
    expect(Math.abs(lit.at(W / 2, H / 2 - 120) - 221)).toBeLessThan(6)
  })
})
