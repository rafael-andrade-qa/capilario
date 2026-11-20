import { describe, expect, it } from 'vitest'
import { FACE_CENTER_Y, FACE_HEIGHT, coverCrop, cropStyle, faceCrop, isCrop, momentCrops, panCrop, zoomCrop } from './framing'

const aspect = (c: { w: number; h: number }, W: number, H: number) => (c.w * W) / (c.h * H)

describe('coverCrop', () => {
  it('vídeo em pé (9:16): corta em cima e embaixo, sem faixas', () => {
    const c = coverCrop(1080, 1920)
    expect(c.x).toBe(0)
    expect(c.w).toBe(1)
    expect(aspect(c, 1080, 1920)).toBeCloseTo(0.75, 3)
    expect(c.y).toBeCloseTo((1 - c.h) / 2, 3)
  })
  it('foto deitada: corta nas laterais', () => {
    const c = coverCrop(4000, 3000)
    expect(c.y).toBe(0)
    expect(c.h).toBe(1)
    expect(aspect(c, 4000, 3000)).toBeCloseTo(0.75, 3)
  })
  it('foto já 3:4: inteira', () => {
    expect(coverCrop(900, 1200)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})

describe('faceCrop', () => {
  it('pessoa longe da câmera: aproxima até o rosto ocupar a fração padrão', () => {
    const W = 1080
    const H = 1920
    const face = { x: 480, y: 600, w: 120, h: 150 }
    const c = faceCrop(W, H, face)
    expect(aspect(c, W, H)).toBeCloseTo(0.75, 3)
    expect((face.h / (c.h * H))).toBeCloseTo(FACE_HEIGHT, 2)
    // rosto centralizado na horizontal e na altura combinada
    const cx = (c.x + c.w / 2) * W
    expect(cx).toBeCloseTo(face.x + face.w / 2, 0)
    const faceCenterInCrop = (face.y + face.h / 2 - c.y * H) / (c.h * H)
    expect(faceCenterInCrop).toBeCloseTo(FACE_CENTER_Y, 2)
  })

  it('rosto perto da borda: o recorte não sai da imagem', () => {
    const c = faceCrop(1000, 1000, { x: 0, y: 0, w: 200, h: 250 })
    expect(c.x).toBe(0)
    expect(c.y).toBe(0)
    expect(c.x + c.w).toBeLessThanOrEqual(1)
    expect(c.y + c.h).toBeLessThanOrEqual(1)
  })

  it('rosto enorme (muito perto): usa o maior recorte que cabe', () => {
    const c = faceCrop(900, 1200, { x: 100, y: 100, w: 700, h: 900 })
    expect(c.w).toBeCloseTo(1, 3)
    expect(c.h).toBeCloseTo(1, 3)
  })

  it('fotos tiradas de distâncias diferentes ficam na mesma escala', () => {
    const near = faceCrop(1200, 1600, { x: 450, y: 400, w: 300, h: 380 })
    const far = faceCrop(1080, 1920, { x: 490, y: 700, w: 100, h: 127 })
    expect(380 / (near.h * 1600)).toBeCloseTo(127 / (far.h * 1920), 2)
  })
})

describe('zoom e arraste', () => {
  const W = 1080
  const H = 1920
  it('zoom aproxima mantendo 3:4 e o centro; não passa do limite', () => {
    const c = coverCrop(W, H)
    const z = zoomCrop(c, 2, W, H)
    expect(z.w).toBeCloseTo(c.w / 2, 3)
    expect(aspect(z, W, H)).toBeCloseTo(0.75, 3)
    expect(z.x + z.w / 2).toBeCloseTo(c.x + c.w / 2, 3)
    expect(zoomCrop(c, 0.1, W, H)).toEqual(c) // afastar além da imagem: fica no máximo
    expect(zoomCrop(c, 1000, W, H).w).toBeCloseTo(1 / 6, 2)
  })
  it('arrastar move o recorte no sentido contrário, sem sair da imagem', () => {
    const z = zoomCrop(coverCrop(W, H), 2, W, H)
    const p = panCrop(z, 0.1, 0, W, H)
    expect(p.x).toBeCloseTo(z.x - 0.1 * z.w, 3)
    expect(panCrop(z, 5, 5, W, H)).toMatchObject({ x: 0, y: 0 })
  })
})

describe('momentCrops', () => {
  it('costas sem rosto usam o recorte da frente (mesmo tripé); tamanho diferente: preencher', () => {
    const face = { x: 480, y: 600, w: 120, h: 150 }
    const r = momentCrops([
      { key: 'frente', W: 1080, H: 1920, face, front: true },
      { key: 'costas', W: 1080, H: 1920, face: null, front: false },
      { key: 'outra', W: 3000, H: 4000, face: null, front: false },
    ])
    expect(r.costas).toEqual(r.frente)
    expect(r.outra).toEqual(coverCrop(3000, 4000))
  })
})

describe('cropStyle e isCrop', () => {
  it('estilo da imagem para mostrar o recorte', () => {
    expect(cropStyle({ x: 0.25, y: 0.1, w: 0.5, h: 0.4 })).toEqual({ width: '200.000%', height: '250.000%', left: '-50.000%', top: '-25.000%' })
  })
  it('valida como o banco', () => {
    expect(isCrop({ x: 0, y: 0, w: 1, h: 1 })).toBe(true)
    expect(isCrop({ x: 0.5, y: 0, w: 0.6, h: 1 })).toBe(false)
    expect(isCrop({ x: 0, y: 0, w: 1 })).toBe(false)
    expect(isCrop(null)).toBe(false)
  })
})

describe('searchTiles', () => {
  it('inteira, depois quadrados cobrindo a parte de cima, sempre dentro da imagem', async () => {
    const { searchTiles } = await import('./framing')
    const levels = searchTiles(1080, 1920)
    expect(levels[0]).toEqual([{ x: 0, y: 0, w: 1080, h: 1920 }])
    for (const tiles of levels.slice(1)) {
      for (const t of tiles) {
        expect(t.x).toBeGreaterThanOrEqual(0)
        expect(t.y).toBeGreaterThanOrEqual(0)
        expect(t.x + t.w).toBeLessThanOrEqual(1080)
        expect(t.y + t.h).toBeLessThanOrEqual(1920)
      }
      expect(Math.max(...tiles.map((t) => t.y + t.h))).toBeLessThanOrEqual(1920 * 0.75 + tiles[0].h / 2 + 1)
    }
    expect(levels[2].length).toBeLessThan(40)
  })
})
