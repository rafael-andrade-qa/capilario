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

describe('mensagens prontas', () => {
  it('momento: produto, momento, quando e a observação', () => {
    expect(momentMessage(gel)).toBe(
      'Olha como ficou meu cabelo seco, com Gelatina Modeladora Supervolume (Widi Care), em 19/11 às 10:23.\n\nMinha observação: Muita definição, pouco frizz.\n\nAs fotos estão no PDF.',
    )
    expect(momentMessage({ ...none, stageType: 'next_day' })).toBe('Olha como ficou meu cabelo no dia seguinte, sem finalizador, em 18/11 às 09:05.\n\nAs fotos estão no PDF.')
  })
  it('comparativo: esquerda e direita', () => {
    expect(compareMessage(none, gel)).toBe(
      'Comparando meu cabelo seco:\n• à esquerda, sem finalizador, em 18/11 às 09:05;\n• à direita, com Gelatina Modeladora Supervolume (Widi Care), em 19/11 às 10:23.\n\nAs fotos estão lado a lado no PDF.',
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
  it('mensagem: a evolução, com horário de cada momento', () => {
    expect(finalizationMessage(fin)).toBe(
      'Olha como meu cabelo evoluiu com Gelatina Modeladora Supervolume (Widi Care), na finalização de 19/11:\n• molhado às 10:23;\n• seco às 13:05;\n• no dia seguinte, em 20/11 às 08:40.\n\nAs fotos estão lado a lado no PDF, com as minhas observações.',
    )
    expect(finalizationMessage({ ...fin, noFinisher: true, moments: fin.moments.slice(0, 1) })).toBe(
      'Olha como meu cabelo evoluiu sem finalizador, na finalização de 19/11:\n• molhado às 10:23.\n\nAs fotos estão lado a lado no PDF.',
    )
  })
  it('nome do arquivo', () => {
    expect(finalizationFileName(fin)).toBe('Finalização 19-11 - Gelatina Modeladora Supervolume')
  })
})

describe('nomes de arquivo', () => {
  it('dizem o que é: momento, data e produto', () => {
    expect(momentFileName(gel)).toBe('Seco 19-11 - Gelatina Modeladora Supervolume')
    expect(momentFileName({ ...none, stageType: 'next_day' })).toBe('Dia seguinte 18-11 - Sem finalizador')
    expect(compareFileName(none, gel)).toBe('Comparativo Seco 18-11 x 19-11 - Sem finalizador x Gelatina Modeladora Supervolume')
    expect(compareFileName(gel, gel)).toBe('Comparativo Seco 19-11 x 19-11 - Gelatina Modeladora Supervolume')
  })
  it('nome editado: sem caracteres proibidos, sem .pdf repetido, nunca vazio', () => {
    expect(cleanFileName('  Meu cabelo: antes/depois?  ')).toBe('Meu cabelo- antes-depois-')
    expect(cleanFileName('Seco 19-11.PDF')).toBe('Seco 19-11')
    expect(cleanFileName('   ')).toBe('Projeto Capilar')
    expect(cleanFileName('a'.repeat(200))).toHaveLength(120)
  })
})
