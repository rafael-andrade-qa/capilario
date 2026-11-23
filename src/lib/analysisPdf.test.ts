// Análise da IA no PDF: separar o texto da pessoa da análise, as observações com rótulo e a leitura.
import { describe, expect, it } from 'vitest'
import { splitNote } from './analysisText'
import { pdfNotes, pdfReading } from './finalizationShare'

describe('splitNote', () => {
  it('separa o texto da pessoa da análise', () => {
    expect(splitNote('Mechas firmes.\n\nAnálise: Ondas 2B.')).toEqual({ own: 'Mechas firmes.', analysis: 'Ondas 2B.' })
    expect(splitNote('Análise: Ondas 2B.')).toEqual({ own: null, analysis: 'Ondas 2B.' })
    expect(splitNote('Só meu. Análise: no meio não conta.')).toEqual({ own: 'Só meu. Análise: no meio não conta.', analysis: null })
    expect(splitNote(null)).toEqual({ own: null, analysis: null })
  })
})

describe('observações do PDF', () => {
  const stages = [
    { stage_type: 'wet' as const, notes: 'Análise: Ondas no molhado.' },
    { stage_type: 'dry' as const, notes: 'Macio.\n\nAnálise: Ondas 2B.' },
    { stage_type: 'next_day' as const, notes: null },
  ]
  it('finalização: cada uma com o momento, e a da IA com rótulo', () => {
    expect(pdfNotes(stages, true, true)).toEqual([
      { title: 'Molhado · análise da IA', text: 'Ondas no molhado.' },
      { title: 'Seco', text: 'Macio.' },
      { title: 'Seco · análise da IA', text: 'Ondas 2B.' },
    ])
  })
  it('sem a análise: só o que a pessoa escreveu', () => {
    expect(pdfNotes(stages, false, true)).toEqual([{ title: 'Seco', text: 'Macio.' }])
  })
  it('momento: o texto da pessoa sem título e a análise como "Análise da IA"', () => {
    expect(pdfNotes([stages[1]], true, false)).toEqual([{ text: 'Macio.' }, { title: 'Análise da IA', text: 'Ondas 2B.' }])
  })
})

describe('leitura da IA no PDF', () => {
  it('tipo com tendência, as 4 notas e quem fez', () => {
    const r = pdfReading({
      created_at: new Date(2026, 10, 22, 15, 0).toISOString(),
      result: {
        product: 'Geleia',
        hair_type: 'Ondulado 2B',
        tendency: 'tende a 2C/3A',
        traits: ['fio médio'],
        scores: { definition: 8, frizz_control: 7, volume: 6, day2: null },
        summary: 'Bom equilíbrio.',
        notes: { wet: '', dry: '', next_day: '' },
      },
    })
    expect(r.title).toBe('Ondulado 2B · tende a 2C/3A')
    expect(r.scores.map((s) => `${s.label} ${s.value ?? '—'}`)).toEqual(['Definição 8', 'Controle do frizz 7', 'Volume 6', 'Dia seguinte —'])
    expect(r.credit).toBe('Análise feita por IA em 22/11')
  })
})
