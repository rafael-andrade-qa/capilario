import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo JS dos scripts (sem tipos)
import { CATEGORIES } from '../../scripts/catalog/normalize.mjs'
import { CATEGORY_LABEL } from './catalog'
import { PRODUCT_TYPES, STEPS, aboutLine, pdfAbout, typeAndBrand, typesByStep } from './productGuide'
import { compareMessage, finalizationMessage, momentMessage, type MomentInfo } from './share'

describe('guia dos tipos', () => {
  it('cobre todos os tipos do catálogo, com o mesmo nome', () => {
    expect(Object.keys(PRODUCT_TYPES).sort()).toEqual(Object.keys(CATEGORIES).sort())
    for (const [id, label] of Object.entries(CATEGORIES)) expect(PRODUCT_TYPES[id].label).toBe(label)
    expect(Object.keys(CATEGORY_LABEL).sort()).toEqual(Object.keys(CATEGORIES).sort())
  })

  it('todo tipo tem texto completo e uma etapa da rotina', () => {
    const steps = new Set(STEPS.map((s) => s.id))
    for (const t of Object.values(PRODUCT_TYPES)) {
      for (const k of ['short', 'what', 'how', 'pairs'] as const) expect(t[k].length).toBeGreaterThan(10)
      expect(t.short.length).toBeLessThanOrEqual(60)
      expect(steps.has(t.step)).toBe(true)
    }
  })

  it('agrupa na ordem da rotina, sem etapa vazia', () => {
    const groups = typesByStep()
    expect(groups.map((g) => g.step.id)).toEqual(STEPS.map((s) => s.id))
    expect(groups.flatMap((g) => g.types).length).toBe(Object.keys(PRODUCT_TYPES).length)
    expect(groups.find((g) => g.step.id === 'hold')!.types.map((t) => t.id)).toEqual(['gelatina', 'geleia', 'gel', 'mousse'])
  })

  it('linha curta, explicação do PDF e marca com o tipo', () => {
    const geleia = { product_mode: 'named', category: 'geleia' }
    expect(aboutLine(geleia)).toBe('Geleia: define e controla o frizz, com fixação média.')
    expect(aboutLine({ product_mode: 'none' })).toBe('Sem finalizador: o cabelo só lavado, para comparar.')
    expect(aboutLine({ product_mode: 'named', category: null })).toBeNull()
    expect(pdfAbout(geleia)).toEqual({ title: 'O que é geleia', text: expect.stringMatching(/^Gel leve.*Etapa da rotina: fixar\.$/) })
    expect(pdfAbout({ product_mode: 'named' })).toBeNull()
    expect(typeAndBrand(geleia, 'Widi Care')).toBe('Geleia · Widi Care')
    expect(typeAndBrand({ product_mode: 'named', category: null }, 'Widi Care')).toBe('Widi Care')
    expect(typeAndBrand(geleia, null)).toBe('Geleia')
  })
})

describe('mensagens com o tipo', () => {
  const base: MomentInfo = {
    productName: 'Geleia Seladora',
    brand: 'Widi Care',
    noFinisher: false,
    stageType: 'dry',
    capturedAt: '2026-11-19T10:23:00',
    about: 'Geleia: define e controla o frizz, com fixação média.',
  }
  it('momento e finalização explicam o produto antes do aviso do PDF', () => {
    expect(momentMessage(base)).toBe(
      'Olha como ficou meu cabelo seco, com Geleia Seladora (Widi Care), em 19/11 às 10:23.\n\nGeleia: define e controla o frizz, com fixação média.\n\nAs fotos estão no PDF.',
    )
    const fin = finalizationMessage({ ...base, moments: [{ stageType: 'wet', capturedAt: '2026-11-19T10:00:00' }] })
    expect(fin).toContain('às 10:00.\n\nGeleia: define e controla o frizz, com fixação média.\n\nAs fotos estão lado a lado no PDF.')
  })
  it('comparativo compara finalizações: não explica produto por produto', () => {
    const none: MomentInfo = { ...base, noFinisher: true, about: 'Sem finalizador: o cabelo só lavado, para comparar.' }
    const msg = compareMessage(none, base)
    expect(msg).not.toContain('Geleia: define')
    expect(msg).toContain('sem finalizador')
  })
})
