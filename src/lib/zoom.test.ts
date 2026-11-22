import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, NO_ZOOM, clampView, panBy, toggleZoom, zoomAt } from './zoom'

const W = 300
const H = 400

describe('zoom de visualização', () => {
  it('o ponto da pinça fica parado ao aproximar', () => {
    const v = zoomAt(NO_ZOOM, 2, 100, 100, W, H)
    expect(v.s).toBe(2)
    // o ponto (100,100) da foto continua em (100,100) na tela
    expect(v.x + v.s * ((100 - v.x) / v.s)).toBeCloseTo(100)
    expect(v).toEqual({ s: 2, x: -100, y: -100 })
  })

  it('não passa do máximo nem fica menor que o quadro', () => {
    expect(zoomAt(NO_ZOOM, 50, 150, 200, W, H).s).toBe(MAX_ZOOM)
    expect(zoomAt({ s: 2, x: -100, y: -100 }, 0.1, 150, 200, W, H)).toEqual(NO_ZOOM)
  })

  it('arrastar não deixa aparecer borda vazia', () => {
    const v = { s: 2, x: -100, y: -100 }
    expect(panBy(v, 500, 500, W, H)).toEqual({ s: 2, x: 0, y: 0 })
    expect(panBy(v, -500, -900, W, H)).toEqual({ s: 2, x: -300, y: -400 })
    expect(panBy(NO_ZOOM, 50, 50, W, H)).toEqual(NO_ZOOM) // sem zoom não arrasta
  })

  it('toque duplo aproxima no ponto e, de novo, volta ao normal', () => {
    const v = toggleZoom(NO_ZOOM, 150, 200, W, H)
    expect(v.s).toBe(2.5)
    expect(toggleZoom(v, 10, 10, W, H)).toEqual(NO_ZOOM)
  })

  it('clampView normaliza', () => {
    expect(clampView({ s: 0.5, x: 10, y: 10 }, W, H)).toEqual(NO_ZOOM)
  })
})
