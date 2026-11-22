import { describe, expect, it } from 'vitest'
import { fitWithin, isThumbPath, needsResize, thumbPath } from './images'

describe('thumbPath', () => {
  it('troca a extensão por _t.jpg, no mesmo lugar', () => {
    expect(thumbPath('u/s/abc.jpg')).toBe('u/s/abc_t.jpg')
    expect(thumbPath('u/produto-x/abc.PNG')).toBe('u/produto-x/abc_t.jpg')
    expect(thumbPath('u/s/abc.webp')).toBe('u/s/abc_t.jpg')
  })
  it('reconhece miniaturas', () => {
    expect(isThumbPath('u/s/abc_t.jpg')).toBe(true)
    expect(isThumbPath('u/s/abc.jpg')).toBe(false)
  })
})

describe('fitWithin', () => {
  it('reduz pelo lado maior, mantendo a proporção', () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ w: 2048, h: 1536 })
    expect(fitWithin(3024, 4032, 720)).toEqual({ w: 540, h: 720 })
  })
  it('nunca aumenta', () => {
    expect(fitWithin(1152, 1536, 2048)).toEqual({ w: 1152, h: 1536 })
  })
})

describe('needsResize', () => {
  it('foto de câmera grande: reduz', () => {
    expect(needsResize(4032, 3024, 3_500_000)).toBe(true)
  })
  it('foto pequena e leve: sobe como está', () => {
    expect(needsResize(1152, 1536, 480_000)).toBe(false)
  })
  it('pequena mas pesada (PNG): recomprime', () => {
    expect(needsResize(1800, 1800, 6_000_000)).toBe(true)
  })
})
