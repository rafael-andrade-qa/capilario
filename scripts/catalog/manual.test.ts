import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo JS dos scripts (sem tipos)
import { withManual } from './manual.mjs'

const base = {
  brands: [{ id: 'widi-care', name: 'Widi Care', audience: 'geral', product_count: 1 }],
  products: [{ id: 'widi-care-gelatina', brand_id: 'widi-care', name: 'Gelatina', category: 'gelatina', eans: [] }],
}
const zacca = {
  id: 'zacca-cera-modeladora-efeito-brilho',
  brand_id: 'zacca',
  name: 'Cera Modeladora Efeito Brilho',
  retail_name: 'Zacca Cera Modeladora Alta Fixação Efeito Brilho/Molhado 70g',
  line: null,
  category: 'cera',
  eans: ['7908943500843'],
}
const manual = { brands: [{ id: 'zacca', name: 'Zacca', audience: 'masculino' }], products: [zacca] }

describe('produtos cadastrados à mão', () => {
  it('entram no catálogo com marca, contagem e texto de busca', () => {
    const out = withManual(base, manual)
    expect(out.products).toHaveLength(2)
    const p = out.products.find((x: { id: string }) => x.id === zacca.id)
    expect(p.brand).toBe('Zacca')
    expect(p.search_text).toBe('zacca cera modeladora efeito brilho alta fixacao molhado 70g 7908943500843')
    expect(out.brands).toContainEqual({ id: 'zacca', name: 'Zacca', audience: 'masculino', product_count: 1 })
    expect(out.brands).toContainEqual(base.brands[0])
  })
  it('rodar de novo não duplica (o da mão vence no mesmo id)', () => {
    const once = withManual(base, manual)
    expect(withManual(once, manual).products).toHaveLength(2)
  })
  it('recusa tipo ou marca que não existem', () => {
    expect(() => withManual(base, { ...manual, products: [{ ...zacca, category: 'perfume' }] })).toThrow('tipo desconhecido')
    expect(() => withManual(base, { brands: [], products: [zacca] })).toThrow('marca zacca')
  })
})
