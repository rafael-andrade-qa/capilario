import { describe, expect, it } from 'vitest'
import { assignInOrder, clearSlot, emptySlots, filledAngles, swapSlots } from './slots'
import { compatibleTypes, defaultPair, initialAngle, initialType, isCompatible, missingSide, type CompareItem } from './compare'
import {
  formatDateRange,
  formatShortDate,
  brandLabel,
  productFromForm,
  productFullLabel,
  productLabel,
  publishedStages,
  sortHistory,
  stageOptionLabel,
  type Experiment,
  type Stage,
} from './domain'
import { MAX_BYTES, detectMime, validateFile } from './files'

describe('distribuição nos ângulos', () => {
  it('usa a ordem do seletor como ponto de partida', () => {
    const { slots, overflow } = assignInOrder(emptySlots<string>(), ['1', '2', '3', '4', '5'])
    expect(slots).toEqual({ front: '1', left: '2', right: '3', back: '4' })
    expect(overflow).toEqual(['5'])
  })

  it('troca dois ângulos e move para espaço vazio', () => {
    let s = assignInOrder(emptySlots<string>(), ['1', '2']).slots
    s = swapSlots(s, 'front', 'left')
    expect(s).toEqual({ front: '2', left: '1', right: null, back: null })
    s = swapSlots(s, 'front', 'back')
    expect(s).toEqual({ front: null, left: '1', right: null, back: '2' })
  })

  it('preenche só os espaços vagos permitidos (Completar fotos)', () => {
    const { slots } = assignInOrder(emptySlots<string>(), ['x', 'y', 'z'], ['right', 'back'])
    expect(slots).toEqual({ front: null, left: null, right: 'x', back: 'y' })
  })

  it('remove uma seleção', () => {
    const s = clearSlot(assignInOrder(emptySlots<string>(), ['1', '2']).slots, 'front')
    expect(filledAngles(s)).toEqual(['left'])
  })
})

describe('ângulo inicial do comparador', () => {
  it('abre no primeiro ângulo comum', () => {
    expect(initialAngle(['left', 'back'], ['front', 'back', 'left'])).toEqual({ angle: 'left', missing: null })
  })
  it('sem ângulo comum, abre no primeiro com foto e avisa o lado vazio', () => {
    expect(initialAngle(['back'], ['left'])).toEqual({ angle: 'left', missing: 'a' })
    expect(initialAngle(['front'], ['back'])).toEqual({ angle: 'front', missing: 'b' })
  })
  it('não troca de ângulo: indica ausência no lado certo', () => {
    expect(missingSide(['front'], ['front', 'left'], 'left')).toBe('a')
    expect(missingSide(['front'], [], 'front')).toBe('b')
    expect(missingSide([], [], 'front')).toBe('both')
  })
})

describe('produto', () => {
  it('diferencia Sem finalizador de Produto não informado', () => {
    expect(productFromForm(true, 'Creme X', 'Marca')).toEqual({ product_mode: 'none', product_name: null, brand: null })
    expect(productFromForm(false, '   ', 'Marca')).toEqual({ product_mode: 'unspecified', product_name: null, brand: null })
    expect(productFromForm(false, ' Ondulando a Gema ')).toEqual({ product_mode: 'named', product_name: 'Ondulando a Gema', brand: null })
    expect(productFromForm(false, 'Creme de Pentear', ' Widi Care ')).toEqual({ product_mode: 'named', product_name: 'Creme de Pentear', brand: 'Widi Care' })
    expect(productFullLabel({ product_mode: 'named', product_name: 'Creme', brand: 'Widi' })).toBe('Creme (Widi)')
    expect(brandLabel({ product_mode: 'none', brand: 'x' })).toBeNull()
    expect(productLabel({ product_mode: 'none', product_name: null })).toBe('Sem finalizador')
    expect(productLabel({ product_mode: 'unspecified', product_name: null })).toBe('Produto não informado')
  })
})

function stage(id: string, captured: string, photos = 1): Stage {
  return {
    id,
    experiment_id: 'e',
    stage_type: 'dry',
    captured_at: captured,
    notes: null,
    is_favorite: false,
    created_at: captured,
    photos: Array.from({ length: photos }, (_, i) => ({
      id: `${id}-${i}`,
      stage_id: id,
      angle: (['front', 'left', 'right', 'back'] as const)[i],
      storage_path: `u/${id}/${i}.jpg`,
      mime_type: 'image/jpeg',
      created_at: captured,
    })),
  }
}

describe('histórico', () => {
  const e1: Experiment = {
    id: 'e1',
    product_mode: 'named',
    product_name: 'Gema',
    brand: null,
    photo_path: null,
    created_at: '2026-11-01T10:00:00+00:00',
    stages: [stage('s2', '2026-11-01T15:00:00+00:00'), stage('s1', '2026-11-01T10:00:00.5+00:00'), stage('vazia', '2026-11-20T10:00:00+00:00', 0)],
  }
  const e2: Experiment = {
    id: 'e2',
    product_mode: 'none',
    product_name: null,
    brand: null,
    photo_path: null,
    created_at: '2026-11-05T10:00:00+00:00',
    stages: [stage('s3', '2026-11-03T10:00:00+00:00')],
  }
  const e3: Experiment = { id: 'e3', product_mode: 'unspecified', product_name: null, brand: null, photo_path: null, created_at: '2026-11-10T10:00:00+00:00', stages: [] }

  it('mostra só etapas com foto, em ordem cronológica', () => {
    expect(publishedStages(e1).map((s) => s.id)).toEqual(['s1', 's2'])
  })
  it('ordena experimentos pela etapa publicada mais recente e esconde experimentos vazios', () => {
    expect(sortHistory([e1, e2, e3]).map((e) => e.id)).toEqual(['e2', 'e1'])
  })
  it('rótulo de seleção traz data curta e produto; horário só para desempatar', () => {
    const now = new Date('2026-12-01T12:00:00Z')
    expect(stageOptionLabel(e1.stages[0], e1, now)).toMatch(/^\d{2}\/\d{2} · Gema$/)
    expect(stageOptionLabel(e1.stages[0], e1, now, true)).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2} · Gema$/)
  })
  it('datas curtas omitem o ano corrente e juntam intervalos do mesmo mês', () => {
    const now = new Date('2026-11-19T12:00:00')
    expect(formatShortDate('2026-11-19T12:00:00', now)).toBe('19/11')
    expect(formatShortDate('2025-11-19T12:00:00', now)).toBe('19/11/2025')
    expect(formatDateRange('2026-11-18T12:00:00', '2026-11-19T12:00:00', now)).toBe('18–19/11')
    expect(formatDateRange('2026-11-19T08:00:00', '2026-11-19T20:00:00', now)).toBe('19/11')
    expect(formatDateRange('2026-10-30T12:00:00', '2026-11-02T12:00:00', now)).toBe('30/10 – 02/11')
  })
})

describe('validação de arquivos', () => {
  it('aceita JPEG, PNG e WebP dentro do limite', () => {
    expect(validateFile({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(validateFile({ name: 'a.webp', type: '', size: 1000 })).toBeNull()
    expect(detectMime({ name: 'IMG_1.JPEG', type: '' })).toBe('image/jpeg')
  })
  it('recusa HEIC, outros formatos e arquivos grandes, com mensagem por arquivo', () => {
    expect(validateFile({ name: 'IMG_1.HEIC', type: 'image/heic', size: 1000 })).toMatch(/HEIC/)
    expect(validateFile({ name: 'a.gif', type: 'image/gif', size: 1000 })).toMatch(/não aceito/)
    expect(validateFile({ name: 'a.jpg', type: 'image/jpeg', size: MAX_BYTES + 1 })).toMatch(/grande demais/)
  })
})

describe('etapas comparáveis', () => {
  const item = (id: string, type: CompareItem['type'], day: number): CompareItem => ({
    id,
    type,
    capturedAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`,
  })
  const items = [item('w1', 'wet', 10), item('d1', 'dry', 11), item('w2', 'wet', 12), item('n1', 'next_day', 13), item('d2', 'dry', 14)]

  it('Molhado só com Molhado; Seco e Dia seguinte entre si', () => {
    expect(compatibleTypes('wet')).toEqual(['wet'])
    expect(compatibleTypes('dry')).toEqual(['dry', 'next_day'])
    expect(compatibleTypes('next_day')).toEqual(['next_day', 'dry'])
    expect(isCompatible(items[0], items[1])).toBe(false)
    expect(isCompatible(items[1], items[3])).toBe(true)
    expect(isCompatible(items[1], items[1])).toBe(false)
  })

  it('sugere as duas mais recentes do mesmo tipo, senão o tipo vizinho', () => {
    expect(defaultPair(items, 'wet')).toEqual({ a: 'w2', b: 'w1' })
    expect(defaultPair(items, 'dry')).toEqual({ a: 'd2', b: 'd1' })
    expect(defaultPair(items, 'next_day')).toEqual({ a: 'n1', b: 'd2' })
    expect(defaultPair([items[0]], 'wet')).toBeNull()
  })

  it('começa pelo tipo da etapa mais recente que tem par', () => {
    expect(initialType(items)).toBe('dry')
    expect(initialType([item('w', 'wet', 1), item('d', 'dry', 2)])).toBeNull()
    expect(initialType([item('w', 'wet', 1), item('w2', 'wet', 2), item('d', 'dry', 3)])).toBe('wet')
  })
})
