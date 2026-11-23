// Tipo do produto: vem do catálogo ou da escolha, só aceita os tipos do guia e só a dona troca.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PRODUCT_TYPES } from '../../src/lib/productGuide'
import { adminClient, testUser, type TestUser } from './helpers'

const admin = adminClient()
const tag = randomUUID().slice(0, 8)
const brand = `tipo-${tag}`

describe('tipo do produto', () => {
  let a: TestUser
  let b: TestUser
  beforeAll(async () => {
    a = await testUser('tipo-a')
    b = await testUser('tipo-b')
    const r = await admin.from('catalog_brands').insert({ id: brand, name: `Marca ${tag}`, audience: 'geral', product_count: 1 })
    if (r.error) throw r.error
    const p = await admin.from('catalog_products').insert({
      id: `geleia-${tag}`,
      brand_id: brand,
      name: `Geleia ${tag}`,
      retail_name: `Geleia ${tag}`,
      category: 'geleia',
      audience: 'unissex',
      popularity: 0,
      source: 'teste',
      search_text: `geleia ${tag}`,
    })
    if (p.error) throw p.error
  })
  afterAll(async () => {
    await admin.from('catalog_brands').delete().eq('id', brand)
  })

  const create = (u: TestUser, name: string, extra: Record<string, unknown> = {}) =>
    u.client.rpc('create_product', { p_experiment_id: randomUUID(), p_name: name, p_brand: `Marca ${tag}`, ...extra })
  const typeOf = async (u: TestUser, name: string) =>
    (await u.client.from('experiments').select('id, category').eq('product_name', name).single()).data as { id: string; category: string | null }

  it('do catálogo: o tipo vem do item', async () => {
    expect((await create(a, `Geleia ${tag}`, { p_catalog_id: `geleia-${tag}` })).error).toBeNull()
    expect((await typeOf(a, `Geleia ${tag}`)).category).toBe('geleia')
  })

  it('escolhido na mão vale mais que o do catálogo; sem nenhum, fica vazio', async () => {
    expect((await create(a, `Outro ${tag}`, { p_catalog_id: `geleia-${tag}`, p_category: 'gelatina' })).error).toBeNull()
    expect((await typeOf(a, `Outro ${tag}`)).category).toBe('gelatina')
    expect((await create(a, `Sem tipo ${tag}`)).error).toBeNull()
    expect((await typeOf(a, `Sem tipo ${tag}`)).category).toBeNull()
  })

  it('aceita todos os tipos do guia e recusa outro', async () => {
    const { id } = await typeOf(a, `Sem tipo ${tag}`)
    for (const category of Object.keys(PRODUCT_TYPES)) {
      const r = await a.client.from('experiments').update({ category }).eq('id', id).select('id')
      expect(r.error, category).toBeNull()
    }
    const bad = await a.client.from('experiments').update({ category: 'perfume' }).eq('id', id).select('id')
    expect(bad.error?.code).toBe('23514')
    expect((await create(a, `Ruim ${tag}`, { p_category: 'perfume' })).error).not.toBeNull()
  })

  it('só a dona troca o tipo, e só o tipo (o nome continua pela função)', async () => {
    const { id } = await typeOf(a, `Geleia ${tag}`)
    const other = await b.client.from('experiments').update({ category: 'gel' }).eq('id', id).select('id')
    expect(other.data ?? []).toHaveLength(0)
    expect((await typeOf(a, `Geleia ${tag}`)).category).toBe('geleia')
    const name = await a.client.from('experiments').update({ product_name: 'Trocado' }).eq('id', id).select('id')
    expect(name.error?.code).toBe('42501')
  })
})
