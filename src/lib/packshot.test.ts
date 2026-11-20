import { describe, expect, it } from 'vitest'
import { PACKSHOT_H, PACKSHOT_W, contentBox, fitInFrame } from './packshot'

function image(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = paint(x, y)
      d.set([r, g, b, a], (y * w + x) * 4)
    }
  return d
}
const white: [number, number, number, number] = [255, 255, 255, 255]

describe('contentBox', () => {
  it('acha a embalagem no meio do fundo branco', () => {
    const d = image(100, 80, (x, y) => (x >= 30 && x < 50 && y >= 10 && y < 70 ? [120, 60, 30, 255] : white))
    expect(contentBox(d, 100, 80)).toEqual({ x: 30, y: 10, w: 20, h: 60 })
  })

  it('trata transparente e quase branco como fundo; ignora um pixel solto', () => {
    const d = image(100, 100, (x, y) => {
      if (x === 2 && y === 2) return [0, 0, 0, 255] // sujeira
      if (x >= 40 && x < 60 && y >= 40 && y < 60) return [10, 10, 10, 255]
      if (x < 20) return [0, 0, 0, 0] // transparente
      return [245, 246, 244, 255] // quase branco
    })
    expect(contentBox(d, 100, 100)).toEqual({ x: 40, y: 40, w: 20, h: 20 })
  })

  it('só fundo: null', () => {
    expect(contentBox(image(10, 10, () => white), 10, 10)).toBeNull()
  })
})

describe('fitInFrame', () => {
  it('embalagem alta: ocupa a altura útil, centralizada', () => {
    const r = fitInFrame(200, 600)
    const m = Math.round(PACKSHOT_W * 0.08)
    expect(r.dh).toBe(PACKSHOT_H - 2 * m)
    expect(r.dx).toBe(Math.round((PACKSHOT_W - r.dw) / 2))
    expect(r.dw / r.dh).toBeCloseTo(200 / 600, 2)
  })

  it('embalagem larga: ocupa a largura útil', () => {
    const r = fitInFrame(800, 300)
    const m = Math.round(PACKSHOT_W * 0.08)
    expect(r.dw).toBe(PACKSHOT_W - 2 * m)
    expect(r.dy).toBe(Math.round((PACKSHOT_H - r.dh) / 2))
  })
})
