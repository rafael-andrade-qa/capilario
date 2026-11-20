import { describe, expect, it } from 'vitest'
import { compareFileName, compareMessage, momentFileName, momentMessage, type MomentInfo } from './share'

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

describe('nomes de arquivo', () => {
  it('sem acento, curtos e descritivos', () => {
    expect(momentFileName(gel)).toBe('capilar-seco-19-11-gelatina-modeladora-supervolume.pdf')
    expect(momentFileName({ ...none, stageType: 'next_day' })).toBe('capilar-dia-seguinte-18-11-sem-finalizador.pdf')
    expect(compareFileName(none, gel)).toBe('capilar-comparativo-seco-18-11-x-19-11.pdf')
  })
})
