import { describe, expect, it } from 'vitest'
import { assignInOrder, clearSlot, emptySlots, filledAngles, swapSlots } from './slots'
import { initialAngle, missingSide } from './compare'
import { productFromForm, productLabel, publishedStages, sortHistory, stageOptionLabel, type Experiment, type Stage } from './domain'
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
    expect(productFromForm(true, 'Creme X')).toEqual({ product_mode: 'none', product_name: null })
    expect(productFromForm(false, '   ')).toEqual({ product_mode: 'unspecified', product_name: null })
    expect(productFromForm(false, ' Ondulando a Gema ')).toEqual({ product_mode: 'named', product_name: 'Ondulando a Gema' })
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
    created_at: '2026-11-01T10:00:00+00:00',
    stages: [stage('s2', '2026-11-01T15:00:00+00:00'), stage('s1', '2026-11-01T10:00:00.5+00:00'), stage('vazia', '2026-11-20T10:00:00+00:00', 0)],
  }
  const e2: Experiment = {
    id: 'e2',
    product_mode: 'none',
    product_name: null,
    created_at: '2026-11-05T10:00:00+00:00',
    stages: [stage('s3', '2026-11-03T10:00:00+00:00')],
  }
  const e3: Experiment = { id: 'e3', product_mode: 'unspecified', product_name: null, created_at: '2026-11-10T10:00:00+00:00', stages: [] }

  it('mostra só etapas com foto, em ordem cronológica', () => {
    expect(publishedStages(e1).map((s) => s.id)).toEqual(['s1', 's2'])
  })
  it('ordena experimentos pela etapa publicada mais recente e esconde experimentos vazios', () => {
    expect(sortHistory([e1, e2, e3]).map((e) => e.id)).toEqual(['e2', 'e1'])
  })
  it('rótulo de seleção traz data, horário, etapa e produto', () => {
    const label = stageOptionLabel(e1.stages[0], e1)
    expect(label).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2} · Seco · Gema$/)
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
