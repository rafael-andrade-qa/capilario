// Catálogo compartilhado: só leitura para quem entrou, busca tolerante e vínculo com o produto.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, localEnv, testUser, tinyJpeg, type TestUser } from './helpers'

const admin = adminClient()
const tag = randomUUID().slice(0, 6).replace(/[0-9]/g, 'x') // só letras: entra na busca como palavra
const brandA = `marca-a-${tag}`
const brandB = `marca-b-${tag}`

const product = (id: string, brand_id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: `${id}-${tag}`,
  brand_id,
  name,
  retail_name: name,
  category: 'finalizador',
  audience: 'unissex',
  popularity: 0,
  source: 'teste',
  search_text: `${brand_id.replace(/-/g, ' ')} ${name}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase(),
  ...extra,
})

describe('catálogo', () => {
  let me: TestUser
  beforeAll(async () => {
    me = await testUser('catalogo')
    const b = await admin.from('catalog_brands').insert([
      { id: brandA, name: `Marca A ${tag}`, audience: 'geral', product_count: 2 },
      { id: brandB, name: `Marca B ${tag}`, audience: 'masculino', product_count: 1 },
    ])
    if (b.error) throw b.error
    const p = await admin.from('catalog_products').insert([
      product('gelatina', brandA, `Todecacho Gelatina Super Definição ${tag}`, { popularity: 5 }),
      product('creme', brandA, `Todecacho Creme de Pentear ${tag}`, { popularity: 9 }),
      product('pomada', brandB, `Pomada Modeladora Efeito Matte ${tag}`, { audience: 'masculino' }),
    ])
    if (p.error) throw p.error
  })

  afterAll(async () => {
    await admin.from('catalog_brands').delete().in('id', [brandA, brandB])
  })

  const search = (q: string, extra: Record<string, unknown> = {}) => me.client.rpc('search_catalog', { p_query: q, ...extra })

  it('todas as palavras, sem acento, mais populares primeiro', async () => {
    const r = await search(`todecacho ${tag}`)
    expect(r.error).toBeNull()
    expect(r.data?.map((x: { id: string }) => x.id)).toEqual([`creme-${tag}`, `gelatina-${tag}`])
    const accent = await search(`definicao gelatina ${tag}`)
    expect(accent.data?.map((x: { id: string }) => x.id)).toEqual([`gelatina-${tag}`])
    expect(accent.data?.[0]).toMatchObject({ brand: `Marca A ${tag}`, brand_id: brandA, category: 'finalizador' })
  })

  it('aguenta erro de digitação', async () => {
    const r = await search(`todecaxo gelatna ${tag}`)
    expect(r.data?.[0]?.id).toBe(`gelatina-${tag}`)
  })

  it('filtra por marca e por público', async () => {
    const byBrand = await search('', { p_brand: brandB })
    expect(byBrand.data?.map((x: { id: string }) => x.id)).toEqual([`pomada-${tag}`])
    const men = await search(tag, { p_audience: 'masculino' })
    expect(men.data?.map((x: { id: string }) => x.id)).toEqual([`pomada-${tag}`])
  })

  it('quem entrou só lê; sem login nem lê', async () => {
    const ins = await me.client.from('catalog_products').insert(product('invasor', brandA, 'Invasor'))
    expect(ins.error?.code).toBe('42501')
    const upd = await me.client.from('catalog_brands').update({ name: 'x' }).eq('id', brandA).select('id')
    expect(upd.error?.code ?? (upd.data?.length === 0 ? 'nada' : 'mudou')).not.toBe('mudou')
    const anonRead = await anonClient().from('catalog_products').select('id').limit(1)
    expect(anonRead.error?.code).toBe('42501')
    const anonSearch = await anonClient().rpc('search_catalog', { p_query: tag })
    expect(anonSearch.error).not.toBeNull()
  })

  it('cadastrar produto guarda de qual item do catálogo veio', async () => {
    const id = randomUUID()
    const r = await me.client.rpc('create_product', { p_experiment_id: id, p_name: 'Todecacho Gelatina', p_brand: 'Marca A', p_catalog_id: `gelatina-${tag}` })
    expect(r.error).toBeNull()
    const { data } = await admin.from('experiments').select('catalog_product_id').eq('id', id).single()
    expect(data?.catalog_product_id).toBe(`gelatina-${tag}`)

    // Item que não existe: cadastra mesmo assim, sem vínculo. Chamada antiga (3 argumentos) segue valendo.
    const id2 = randomUUID()
    expect((await me.client.rpc('create_product', { p_experiment_id: id2, p_name: 'Outro', p_brand: 'X', p_catalog_id: 'nao-existe' })).error).toBeNull()
    const id3 = randomUUID()
    expect((await me.client.rpc('create_product', { p_experiment_id: id3, p_name: 'Mais um', p_brand: 'X' })).error).toBeNull()
    const rows = await admin.from('experiments').select('id, catalog_product_id').in('id', [id2, id3])
    expect(rows.data?.every((x) => x.catalog_product_id === null)).toBe(true)
  })

  it('fotos do catálogo: públicas para ler; usuário não envia', async () => {
    const path = `teste/${tag}.jpg`
    const up = await admin.storage.from('catalog').upload(path, tinyJpeg(), { contentType: 'image/jpeg', upsert: true })
    expect(up.error).toBeNull()
    const res = await fetch(`${localEnv().url}/storage/v1/object/public/catalog/${path}`)
    expect(res.status).toBe(200)
    const mine = await me.client.storage.from('catalog').upload(`teste/${tag}-meu.jpg`, tinyJpeg(), { contentType: 'image/jpeg' })
    expect(mine.error).not.toBeNull()
    await admin.storage.from('catalog').remove([path])
  })
})
