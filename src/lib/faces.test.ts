import { describe, expect, it } from 'vitest'
import { largestBlob } from './faces'

describe('largestBlob (mancha de cabelo)', () => {
  it('fica com a maior região e ignora pontinhos soltos', () => {
    const mw = 10
    const mh = 8
    const m = new Uint8Array(mw * mh)
    const on = (x: number, y: number) => (m[y * mw + x] = 1)
    for (let y = 2; y <= 5; y++) for (let x = 3; x <= 7; x++) on(x, y) // cabeça
    on(0, 0) // ruído
    on(9, 7)
    expect(largestBlob(m, mw, mh)).toEqual({ x: 3, y: 2, w: 5, h: 4, area: 20 })
  })
  it('não liga a borda direita de uma linha com a esquerda da seguinte', () => {
    const m = new Uint8Array([0, 0, 1, 1, 0, 0])
    expect(largestBlob(m, 3, 2)).toMatchObject({ area: 1 })
  })
  it('máscara vazia: nada', () => {
    expect(largestBlob(new Uint8Array(9), 3, 3)).toBeNull()
  })
})
