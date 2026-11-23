// Análise da finalização: o núcleo da função (sem rede) e as regras do app para as sugestões.
import { describe, expect, it } from 'vitest'
import {
  AnalyzeError,
  buildContent,
  costUsd,
  ownNotes,
  parseResult,
  validateInput,
  type InputImage,
} from '../../supabase/functions/analyze-finalization/core'
import { mergeNote, suggestedMoments } from './analysis'

const ID = '6e66cb89-35fa-42ed-833c-e34df5b50cbb'
const img = (moment: InputImage['moment'], angle: InputImage['angle']): InputImage => ({ moment, angle, data: 'AAAA' })

describe('validateInput', () => {
  it('aceita a finalização com fotos', () => {
    const v = validateInput({ finalization_id: ID, images: [img('wet', 'front'), img('dry', 'back')] })
    expect(v.images).toHaveLength(2)
  })
  it('recusa id inválido, momento ou ângulo desconhecido, base64 quebrado e lista vazia ou grande', () => {
    expect(() => validateInput({ finalization_id: 'x', images: [img('wet', 'front')] })).toThrow(AnalyzeError)
    expect(() => validateInput({ finalization_id: ID, images: [{ moment: 'ontem', angle: 'front', data: 'AAAA' }] })).toThrow(AnalyzeError)
    expect(() => validateInput({ finalization_id: ID, images: [{ moment: 'wet', angle: 'top', data: 'AAAA' }] })).toThrow(AnalyzeError)
    expect(() => validateInput({ finalization_id: ID, images: [{ moment: 'wet', angle: 'front', data: 'não é base64' }] })).toThrow(AnalyzeError)
    expect(() => validateInput({ finalization_id: ID, images: [] })).toThrow(AnalyzeError)
    expect(() => validateInput({ finalization_id: ID, images: Array.from({ length: 17 }, () => img('wet', 'front')) })).toThrow(AnalyzeError)
  })
})

describe('buildContent', () => {
  it('põe o contexto primeiro e cada foto com o rótulo antes, em ordem de momento e ângulo', () => {
    const content = buildContent([img('dry', 'left'), img('wet', 'back'), img('wet', 'front')], {
      product: 'Geleia Seladora (Widi Care)',
      moments: [
        { moment: 'wet', when: '20/11 14:53', notes: 'Toalha e dedos.' },
        { moment: 'dry', when: '20/11 15:38', notes: null },
      ],
      past: [{ product: 'Creme (Widi)', when: '18/11', hair_type: 'Ondulado 2B', scores: { definition: 4, frizz_control: 9, volume: 5, day2: 6 }, summary: 'Alinha.' }],
    }) as { type: string; text?: string }[]
    expect(content[0].text).toContain('Geleia Seladora (Widi Care)')
    expect(content[0].text).toContain('Observação da pessoa: "Toalha e dedos."')
    expect(content[0].text).toContain('Creme (Widi) (18/11): Ondulado 2B; definição 4')
    const labels = content.filter((c) => c.type === 'text').slice(1, -1).map((c) => c.text)
    expect(labels).toEqual(['Molhado (logo depois de finalizar) · frente:', 'Molhado (logo depois de finalizar) · trás:', 'Seco (no mesmo dia) · lado esquerdo:'])
    expect(content.filter((c) => c.type === 'image')).toHaveLength(3)
  })
})

describe('parseResult', () => {
  const turn = (obj: unknown, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'thinking' }, { type: 'text', text: JSON.stringify(obj) }] })
  const good = {
    hair_type: ' Ondulado 2B ',
    tendency: 'tende a 2C/3A',
    traits: ['pontas porosas', 'fio médio', 'boa densidade', 'redemoinho na coroa', 'quinta'],
    scores: { definition: 8.4, frizz_control: 14, volume: -3, day2: 7 },
    summary: 'Melhor equilíbrio até aqui.',
    notes: { wet: 'Ondas já aparecem.', dry: 'Ondas uniformes.', next_day: 'Inventado.' },
  }
  it('limpa: notas de 0 a 10, até 4 características, sem observação para momento sem foto', () => {
    const r = parseResult(turn(good), 'Geleia', new Set(['wet', 'dry']))
    expect(r.hair_type).toBe('Ondulado 2B')
    expect(r.traits).toHaveLength(4)
    expect(r.scores).toEqual({ definition: 8, frizz_control: 10, volume: 0, day2: null })
    expect(r.notes).toEqual({ wet: 'Ondas já aparecem.', dry: 'Ondas uniformes.', next_day: '' })
    expect(r.product).toBe('Geleia')
  })
  it('dia 2 vale quando há fotos do dia seguinte; -1 vira sem nota', () => {
    expect(parseResult(turn(good), 'G', new Set(['wet', 'dry', 'next_day'])).scores.day2).toBe(7)
    expect(parseResult(turn({ ...good, scores: { ...good.scores, day2: -1 } }), 'G', new Set(['next_day'])).scores.day2).toBeNull()
  })
  it('recusa e resposta quebrada viram erro com código', () => {
    expect(() => parseResult(turn(good, 'refusal'), 'G', new Set())).toThrow(expect.objectContaining({ code: 'refused' }))
    expect(() => parseResult({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{oops' }] }, 'G', new Set())).toThrow(expect.objectContaining({ code: 'ai_failed' }))
    expect(() => parseResult(turn({ ...good, hair_type: '' }), 'G', new Set())).toThrow(expect.objectContaining({ code: 'ai_failed' }))
  })
})

describe('custo', () => {
  it('calcula pelo preço do modelo, com cache', () => {
    expect(costUsd('claude-opus-5-5', { input_tokens: 14_000, output_tokens: 3_000 })).toBeCloseTo(0.116, 5)
    expect(costUsd('claude-haiku-5-5', { input_tokens: 14_000, output_tokens: 3_000 })).toBeCloseTo(0.0029, 5)
    expect(costUsd('claude-sonnet-5-5', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 10_000 })).toBeCloseTo(0.002, 5)
    expect(costUsd('modelo-novo', { input_tokens: 1 })).toBeNull()
  })
})

describe('observação com a análise', () => {
  it('campo vazio: só a análise, marcada', () => {
    expect(mergeNote(null, 'Ondas 2B.')).toBe('Análise: Ondas 2B.')
  })
  it('texto da pessoa fica e a análise vai embaixo', () => {
    expect(mergeNote('Mechas firmes.', 'Ondas 2B.')).toBe('Mechas firmes.\n\nAnálise: Ondas 2B.')
  })
  it('analisar de novo troca a análise anterior, sem duplicar', () => {
    expect(mergeNote('Mechas firmes.\n\nAnálise: Velha.', 'Nova.')).toBe('Mechas firmes.\n\nAnálise: Nova.')
    expect(mergeNote('Análise: Velha.', 'Nova.')).toBe('Análise: Nova.')
  })
  it('a função separa o texto da pessoa da análise', () => {
    expect(ownNotes('Mechas firmes.\n\nAnálise: Velha.')).toBe('Mechas firmes.')
    expect(ownNotes('Análise: Velha.')).toBeNull()
    expect(ownNotes('Só meu.')).toBe('Só meu.')
  })
  it('só os momentos com foto e sugestão recebem', () => {
    const stage = (id: string) => ({ id }) as never
    const fin = { moments: { wet: stage('a'), dry: stage('b') } }
    const a = { result: { notes: { wet: 'x', dry: ' ', next_day: 'y' } } } as never
    expect(suggestedMoments(fin, a)).toEqual(['wet'])
  })
})
