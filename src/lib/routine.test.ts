import { describe, expect, it } from 'vitest'
import type { Experiment, Stage } from './domain'
import { PRODUCT_TYPES } from './productGuide'
import {
  ROUTINE_STEPS,
  changeSummary,
  diffRoutine,
  draftOf,
  lastRoutine,
  principalOf,
  productScores,
  routineTable,
  routineText,
  schedule,
  sortRoutine,
  stepOfCategory,
  type RoutineItem,
} from './routine'

const product = (id: string, name: string, category: string | null, stages: Partial<Stage>[] = []): Experiment =>
  ({
    id,
    product_mode: 'named',
    product_name: name,
    brand: null,
    photo_path: null,
    category,
    created_at: '2026-11-01T00:00:00Z',
    stages: stages.map((s, i) => ({ id: `${id}-s${i}`, experiment_id: id, stage_type: 'wet', notes: null, is_favorite: false, created_at: '', photos: [{ id: 'p', angle: 'front' }], ...s })),
  }) as Experiment

const shampooA = product('sa', 'Shampoo A', 'shampoo')
const shampooB = product('sb', 'Shampoo B', 'shampoo')
const mask = product('mk', 'Máscara', 'mascara')
const geleia = product('gl', 'Geleia', 'geleia', [
  { finalization_id: 'f1', captured_at: '2026-11-20T10:00:00Z' },
  { finalization_id: 'f2', captured_at: '2026-11-23T10:00:00Z' },
])
const all = [shampooA, shampooB, mask, geleia]
const item = (finalization_id: string, experiment_id: string, step: RoutineItem['step'], position: number, mask_kind: RoutineItem['mask_kind'] = null): RoutineItem => ({
  finalization_id,
  experiment_id,
  step,
  position,
  mask_kind,
})
const routines = {
  f1: [item('f1', 'gl', 'hold', 2), item('f1', 'sa', 'wash', 0), item('f1', 'mk', 'mask', 1, 'H')],
  f2: [item('f2', 'sb', 'wash', 0), item('f2', 'mk', 'mask', 1, 'N'), item('f2', 'gl', 'hold', 2)],
}

describe('etapas', () => {
  it('todo tipo do catálogo cai numa etapa da rotina; sem tipo vai para fixar', () => {
    const steps = new Set(ROUTINE_STEPS.map((s) => s.id))
    for (const c of Object.keys(PRODUCT_TYPES)) expect(steps.has(stepOfCategory(c)), c).toBe(true)
    expect(stepOfCategory('shampoo')).toBe('wash')
    expect(stepOfCategory('condicionador')).toBe('condition')
    expect(stepOfCategory('mascara')).toBe('mask')
    expect(stepOfCategory('leave_in')).toBe('prep')
    expect(stepOfCategory('creme_pentear')).toBe('shape')
    expect(stepOfCategory('geleia')).toBe('hold')
    expect(stepOfCategory('oleo')).toBe('finish')
    expect(stepOfCategory('cera')).toBe('finish')
    expect(stepOfCategory('reativador')).toBe('finish')
    expect(stepOfCategory('shampoo_seco')).toBe('wash')
    expect(stepOfCategory('finalizador')).toBe('shape')
    expect(stepOfCategory(null)).toBe('hold')
  })
  it('ordena por etapa e depois pela ordem da pessoa', () => {
    expect(sortRoutine(routines.f1).map((i) => i.experiment_id)).toEqual(['sa', 'mk', 'gl'])
  })
  it('principal: fixar, senão pentear, senão finalizar; sem nenhum, Sem finalizador', () => {
    expect(principalOf([{ experimentId: 'sa', step: 'wash' }, { experimentId: 'cr', step: 'shape' }, { experimentId: 'gl', step: 'hold' }])).toBe('gl')
    expect(principalOf([{ experimentId: 'cr', step: 'shape' }, { experimentId: 'ol', step: 'finish' }])).toBe('cr')
    expect(principalOf([{ experimentId: 'sa', step: 'wash' }])).toBeNull()
  })
})

describe('rotina de partida e diferenças', () => {
  it('a última finalização dá a rotina para começar', () => {
    const last = lastRoutine(all, routines)
    expect(last.from?.id).toBe('f2')
    expect(last.items).toEqual([
      { experimentId: 'sb', step: 'wash', maskKind: null },
      { experimentId: 'mk', step: 'mask', maskKind: 'N' },
      { experimentId: 'gl', step: 'hold', maskKind: null },
    ])
    expect(lastRoutine(all, {}).items).toEqual([])
  })
  it('produto excluído some do rascunho', () => {
    expect(draftOf(routines.f1, [mask, geleia]).map((i) => i.experimentId)).toEqual(['mk', 'gl'])
  })
  it('mostra só as etapas que mudaram (inclusive o tipo da máscara) e as iguais', () => {
    const { changed, same } = diffRoutine(draftOf(routines.f1, all), draftOf(routines.f2, all), all)
    expect(changed).toEqual([
      { step: 'wash', before: ['Shampoo A'], after: ['Shampoo B'] },
      { step: 'mask', before: ['Máscara (hidratação)'], after: ['Máscara (nutrição)'] },
    ])
    expect(same).toEqual(['hold'])
    expect(changeSummary(changed)).toBe('Mudou: lavar e máscara.')
    expect(changeSummary([])).toBe('Igual à anterior.')
  })
  it('cronograma das máscaras, da mais antiga à mais nova', () => {
    expect(schedule(all, routines).map((m) => m.kind)).toEqual(['H', 'N'])
  })
  it('rotina em texto para o PDF, a mensagem e a IA', () => {
    expect(routineText(routines.f2, all)).toBe('Lavar: Shampoo B · Máscara: Máscara (nutrição) · Fixar: Geleia')
    expect(routineText([], all)).toBeNull()
  })
  it('rotina em tabela para o PDF: etapa, produto e marca; a etapa só na primeira linha dela', () => {
    const withBrand = [{ ...shampooA, brand: 'Marca S' }, ...all.slice(1)]
    expect(routineTable([...routines.f2, item('f2', 'sa', 'wash', 1)], withBrand)).toEqual([
      ['Lavar', 'Shampoo B', ''],
      ['', 'Shampoo A', 'Marca S'],
      ['Máscara', 'Máscara (nutrição)', ''],
      ['Fixar', 'Geleia', ''],
    ])
    expect(routineTable([item('f2', 'gl', 'hold', 0)], all)).toBeNull() // só o produto principal
  })
})

describe('com o produto na rotina', () => {
  it('média das notas com e sem o produto, sem contar dia seguinte vazio', () => {
    const scores = new Map([
      ['f1', { definition: 6, frizz_control: 5, volume: 4, day2: -1 }],
      ['f2', { definition: 8, frizz_control: 7, volume: 6, day2: 7 }],
      ['f3', { definition: 9, frizz_control: 6, volume: 6, day2: null }],
    ])
    const r = productScores(['f2', 'f3'], scores)
    expect(r.with).toBe(2)
    expect(r.without).toBe(1)
    expect(r.rows.find((x) => x.key === 'definition')).toEqual({ key: 'definition', with: 8.5, without: 6 })
    expect(r.rows.find((x) => x.key === 'day2')).toEqual({ key: 'day2', with: 7, without: null })
  })
})
