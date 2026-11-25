import { describe, expect, it } from 'vitest'
import {
  cleanFileName,
  compareFileName,
  compareMessage,
  finalizationFileName,
  finalizationMessage,
  momentFileName,
  momentMessage,
  type FinalizationInfo,
  type MomentInfo,
} from './share'

// Horário local (o teste roda no fuso do computador; montamos a data local).
const local = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).toISOString()

const gel: MomentInfo = {
  productName: 'Gelatina Modeladora Supervolume',
  brand: 'Widi Care',
  noFinisher: false,
  stageType: 'dry',
  capturedAt: local(19, 10, 23),
  notes: '  Muita definição, pouco frizz. ',
}
const none: MomentInfo = { productName: 'Sem finalizador', brand: null, noFinisher: true, stageType: 'dry', capturedAt: local(18, 9, 5) }

const SIGN = '\n\nFeito com o Capilário, meu diário do cabelo.'

describe('mensagens prontas', () => {
  it('momento: curta (a observação está no PDF) e assinada pelo app', () => {
    expect(momentMessage(gel)).toBe(
      `Olha como ficou meu cabelo seco, com Gelatina Modeladora Supervolume (Widi Care), em 19/11 às 10:23.\nAs fotos estão no PDF.${SIGN}`,
    )
    expect(momentMessage({ ...none, stageType: 'next_day' })).toBe(`Olha como ficou meu cabelo no dia seguinte, sem finalizador, em 18/11 às 09:05.\nAs fotos estão no PDF.${SIGN}`)
  })
  it('momento com análise da IA: avisa que ela está no PDF', () => {
    expect(momentMessage({ ...gel, ai: true })).toContain('\nAs fotos estão no PDF, com a análise da IA.\n')
  })
  it('comparativo: esquerda e direita', () => {
    expect(compareMessage(none, gel)).toBe(
      `Comparando meu cabelo seco em duas finalizações:\n• à esquerda (A), em 18/11 às 09:05, sem finalizador;\n• à direita (B), em 19/11 às 10:23, com Gelatina Modeladora Supervolume (Widi Care).\n\nAs fotos estão lado a lado no PDF.${SIGN}`,
    )
    // Com rotina: os selos curtos e o que mudou.
    expect(compareMessage({ ...gel, routine: 'Shampoo · Gelatina' }, { ...none, routine: 'Shampoo' }, ['Só em A: fixar'])).toBe(
      'Comparando meu cabelo seco em duas finalizações:\n• à esquerda (A), em 19/11 às 10:23, com Shampoo · Gelatina;\n• à direita (B), em 18/11 às 09:05, com Shampoo.\n\nO que mudou: Só em A: fixar.\n\nAs fotos estão lado a lado no PDF.' + SIGN,
    )
  })
})

describe('finalização inteira', () => {
  const fin: FinalizationInfo = {
    productName: 'Gelatina Modeladora Supervolume',
    brand: 'Widi Care',
    noFinisher: false,
    moments: [
      { stageType: 'wet', capturedAt: local(19, 10, 23) },
      { stageType: 'dry', capturedAt: local(19, 13, 5), notes: 'Definição boa.' },
      { stageType: 'next_day', capturedAt: local(20, 8, 40) },
    ],
  }
  it('mensagem: curta, com os momentos (os horários estão no PDF) e assinada pelo app', () => {
    expect(finalizationMessage(fin)).toBe(
      `Olha a evolução do meu cabelo com Gelatina Modeladora Supervolume (Widi Care), na finalização de 19/11.\nMolhado, seco e dia seguinte lado a lado no PDF, com as minhas observações.${SIGN}`,
    )
    expect(finalizationMessage({ ...fin, noFinisher: true, moments: fin.moments.slice(0, 1) })).toBe(
      `Olha a evolução do meu cabelo sem finalizador, na finalização de 19/11.\nAs fotos do molhado estão no PDF.${SIGN}`,
    )
  })
  it('mensagem com a análise da IA', () => {
    const second = (f: FinalizationInfo) => finalizationMessage(f).split('\n')[1]
    expect(second({ ...fin, ai: true })).toBe('Molhado, seco e dia seguinte lado a lado no PDF, com as minhas observações e a análise da IA.')
    const onlyAi = { ...fin, moments: fin.moments.map((m) => ({ ...m, notes: m.notes ? 'Análise: Ondas.' : null })) }
    expect(second({ ...onlyAi, ai: true })).toBe('Molhado, seco e dia seguinte lado a lado no PDF, com a análise da IA.')
    expect(second({ ...onlyAi, ai: false })).toBe('Molhado, seco e dia seguinte lado a lado no PDF.')
  })
  it('nome do arquivo', () => {
    expect(finalizationFileName(fin)).toBe('Finalização 19-11 - Gelatina Modeladora Supervolume')
  })
})

describe('nomes de arquivo', () => {
  it('dizem o que é: momento, data e produto', () => {
    expect(momentFileName(gel)).toBe('Seco 19-11 - Gelatina Modeladora Supervolume')
    expect(momentFileName({ ...none, stageType: 'next_day' })).toBe('Dia seguinte 18-11 - Sem finalizador')
    expect(compareFileName(none, gel)).toBe('Comparativo Seco 18-11 x 19-11')
  })
  it('nome editado: sem caracteres proibidos, sem .pdf repetido, nunca vazio', () => {
    expect(cleanFileName('  Meu cabelo: antes/depois?  ')).toBe('Meu cabelo- antes-depois-')
    expect(cleanFileName('Seco 19-11.PDF')).toBe('Seco 19-11')
    expect(cleanFileName('   ')).toBe('Capilário')
    expect(cleanFileName('a'.repeat(200))).toHaveLength(120)
  })
})
