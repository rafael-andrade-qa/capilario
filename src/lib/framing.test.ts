import { describe, expect, it } from 'vitest'
import { FRAME, HEAD_FACE_HEIGHT, HEAD_TOP_MARGIN, coverCrop, cropStyle, headCrop, isCrop, momentCrops, panCrop, zoomCrop } from './framing'

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

// Caixas medidas em fotos reais (tripé, 9:16): frente, perfil e costas do mesmo momento.
const W = 1170
const H = 2058
const front = { W, H, angle: 'front' as const, face: { x: 252, y: 890, w: 670, h: 670 }, hair: { x: 242, y: 533, w: 718, h: 560 } }
const side = { W, H: 2063, angle: 'left' as const, face: { x: 521, y: 935, w: 424, h: 424 }, hair: { x: 126, y: 603, w: 686, h: 759 } }
const back = { W, H: 2068, angle: 'back' as const, face: { x: 617, y: 1220, w: 241, h: 241 }, hair: { x: 203, y: 555, w: 720, h: 864 } }
const px = (c: { x: number; y: number; w: number; h: number }, w: number, h: number) => ({ x: c.x * w, y: c.y * h, w: c.w * w, h: c.h * h })

describe('headCrop (pela cabeça)', () => {
  it('frente: rosto na fração padrão, cabelo logo abaixo da borda de cima, centralizado', () => {
    const c = px(headCrop(front), W, H)
    expect(c.w / c.h).toBeCloseTo(FRAME, 3)
    expect(front.face.h / c.h).toBeCloseTo(HEAD_FACE_HEIGHT, 2)
    expect((front.hair.y - c.y) / c.h).toBeCloseTo(HEAD_TOP_MARGIN, 2)
    expect(c.x + c.w / 2).toBeCloseTo(front.hair.x + front.hair.w / 2, -1)
    // aproxima bem mais que o quadro cheio (antes sobrava ombro)
    expect(c.h).toBeLessThan(coverCrop(W, H).h * H * 0.95)
  })

  it('costas: ignora o "rosto" falso na nuca e centraliza no cabelo', () => {
    const c = px(headCrop(back), W, back.H)
    expect(c.x + c.w / 2).toBeCloseTo(back.hair.x + back.hair.w / 2, -1)
    expect(c.y).toBeLessThan(back.hair.y)
    expect(c.y + c.h).toBeGreaterThan(back.hair.y + back.hair.h) // nuca inteira
  })

  it('perfil: o cabelo inteiro e o queixo cabem no quadro', () => {
    const c = px(headCrop(side), W, side.H)
    expect(c.x).toBeLessThanOrEqual(side.hair.x)
    expect(c.x + c.w).toBeGreaterThanOrEqual(side.face.x + side.face.w - 1)
    expect(c.y + c.h).toBeGreaterThan(side.face.y + side.face.h)
  })

  it('sem nada detectado: preenche o quadro centralizado', () => {
    expect(headCrop({ W, H, angle: 'front', face: null, hair: null })).toEqual(coverCrop(W, H))
  })

  it('cabelo curto: a cabeça preenche o quadro, com pouco pescoço', () => {
    const c = px(headCrop(front), W, H)
    const chin = front.face.y + front.face.h
    expect((chin - c.y) / c.h).toBeGreaterThan(0.82) // queixo perto de baixo
    expect((chin - c.y) / c.h).toBeLessThan(0.93)
  })

  it('cabelo comprido: o quadro vai até onde o cabelo termina', () => {
    const long = { ...front, hair: { x: 200, y: 533, w: 800, h: 1300 } } // desce até o peito
    const c = px(headCrop(long), W, H)
    expect(c.y + c.h).toBeGreaterThan(533 + 1300)
    expect(c.y).toBeLessThan(533)
  })

  it('cabelo volumoso não é cortado: afasta o necessário', () => {
    const big = { ...front, hair: { x: 100, y: 300, w: 980, h: 800 } }
    const c = px(headCrop(big), W, H)
    expect(c.x).toBeLessThanOrEqual(100)
    expect(c.x + c.w).toBeGreaterThanOrEqual(1080)
    expect(c.y).toBeLessThan(300)
  })
})

describe('zoom e arraste', () => {
  const W = 1080
  const H = 1920 // (sombreia as constantes de cima)
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
  it('mesma câmera: todos na escala do rosto da frente, cada um centrado na própria cabeça', () => {
    const r = momentCrops([
      { key: 'frente', ...front },
      { key: 'perfil', ...side },
      { key: 'costas', ...back },
    ])
    const h = (k: string, ih: number) => r[k].h * ih
    expect(h('perfil', side.H)).toBeCloseTo(h('frente', H), -1)
    expect(h('costas', back.H)).toBeCloseTo(h('frente', H), -1)
    expect(r.costas.x).not.toBeCloseTo(r.frente.x, 2)
  })

  it('câmera diferente: cada foto usa a própria escala', () => {
    const r = momentCrops([
      { key: 'frente', ...front },
      { key: 'outra', W: 3000, H: 4000, angle: 'back', face: null, hair: { x: 1000, y: 600, w: 1000, h: 1200 } },
    ])
    expect(r.outra.h * 4000).toBeCloseTo(1200 * 1.36, -1)
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
