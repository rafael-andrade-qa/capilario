import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo JS dos scripts (sem tipos)
import { CATEGORIES } from '../../scripts/catalog/normalize.mjs'
import { CATEGORY_LABEL } from './catalog'
import { ROUTINE_STEPS } from './routine'
import { PRODUCT_TYPES, STEPS, pdfAbout, typeAndBrand, typesByStep } from './productGuide'

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

  it('as etapas do guia são as mesmas da rotina e da prateleira', () => {
    expect(STEPS.map((s) => [s.id, s.label])).toEqual(ROUTINE_STEPS.map((s) => [s.id, s.label]))
  })

  it('agrupa na ordem da rotina, sem etapa vazia', () => {
    const groups = typesByStep()
    expect(groups.map((g) => g.step.id)).toEqual(STEPS.map((s) => s.id))
    expect(groups.flatMap((g) => g.types).length).toBe(Object.keys(PRODUCT_TYPES).length)
    expect(groups.find((g) => g.step.id === 'hold')!.types.map((t) => t.id)).toEqual(['gelatina', 'geleia', 'gel', 'mousse'])
  })

  it('explicação do PDF e marca com o tipo', () => {
    const geleia = { product_mode: 'named', category: 'geleia' }
    expect(pdfAbout(geleia)).toEqual({ title: 'O que é geleia', text: expect.stringMatching(/^Gel leve.*Etapa da rotina: fixar\.$/) })
    expect(pdfAbout({ product_mode: 'named' })).toBeNull()
    expect(typeAndBrand(geleia, 'Widi Care')).toBe('Geleia · Widi Care')
    expect(typeAndBrand({ product_mode: 'named', category: null }, 'Widi Care')).toBe('Widi Care')
    expect(typeAndBrand(geleia, null)).toBe('Geleia')
  })
})

