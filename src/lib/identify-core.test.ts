// Núcleo da função identify-product, sem rede: IA, catálogo e lojas falsos.
import { describe, expect, it } from 'vitest'
import {
  askClaude,
  identify,
  isSafeUrl,
  safeFetch,
  sameProduct,
  sniffImage,
  storeMatches,
  validateInput,
  vtexSized,
  type CatalogSearch,
  type FetchFn,
  type Turn,
} from '../../supabase/functions/identify-product/core.ts'

const jpeg = (size = 4000) => {
  const b = new Uint8Array(size)
  b.set([0xff, 0xd8, 0xff, 0xe0])
  return b
}

const answer = (r: Record<string, unknown>): Turn => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify(r) }],
  usage: { input_tokens: 1700, output_tokens: 40 },
})

const juba = { found: true, brand: ' Widi Care ', product_name: 'Modelando a Juba   Geleia Seladora', confidence: 'high' }

describe('askClaude', () => {
  it('uma chamada só: lê a resposta estruturada e limpa os textos', async () => {
    const calls: unknown[] = []
    const logs: string[] = []
    const r = await askClaude(
      async (m) => {
        calls.push(m)
        return answer(juba)
      },
      'QUJD',
      'image/jpeg',
      (l) => logs.push(l),
    )
    expect(calls).toHaveLength(1)
    expect(r).toEqual({ found: true, brand: 'Widi Care', product_name: 'Modelando a Juba Geleia Seladora', confidence: 'high' })
    expect(logs).toContain('usage in=1700 out=40')
  })

  it('recusa, sem texto ou JSON quebrado: não identificado', async () => {
    await expect(askClaude(async () => ({ stop_reason: 'refusal', content: [] }), 'QUJD', 'image/jpeg')).rejects.toThrow('refusal')
    await expect(askClaude(async () => ({ stop_reason: 'end_turn', content: [] }), 'QUJD', 'image/jpeg')).rejects.toThrow('no_report')
    await expect(askClaude(async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{oi' }] }), 'QUJD', 'image/jpeg')).rejects.toThrow('bad_json')
  })

  it('found sem nome vira não encontrado', async () => {
    const r = await askClaude(async () => answer({ ...juba, product_name: ' ' }), 'QUJD', 'image/jpeg')
    expect(r.found).toBe(false)
  })
})

describe('sameProduct', () => {
  const read = { name: 'Modelando a Juba Geleia Seladora', brand: 'Widi Care' }
  it('nome de loja com marca e tamanho no meio', () => {
    expect(sameProduct(read, { name: 'Geleia Seladora Widi Care Modelando a Juba 300g', brand: 'WIDI CARE' })).toBe(true)
    expect(sameProduct(read, { name: 'Geleia Seladora Modelando a Juba', brand: 'Widi Care' })).toBe(true)
  })
  it('outro produto da mesma linha ou outra marca: não', () => {
    expect(sameProduct(read, { name: 'Encrespando a Juba Geleia Modeladora', brand: 'Widi Care' })).toBe(false)
    expect(sameProduct(read, { name: 'Modelando a Juba Geleia Seladora', brand: 'Salon Line' })).toBe(false)
  })
  it('marca que a loja escreve diferente, mas aparece no nome', () => {
    expect(sameProduct({ name: 'Todecacho Gelatina Super Definição', brand: 'Salon Line' }, { name: 'Gelatina Salon Line Todecacho Super Definição 300g', brand: 'Salonline' })).toBe(true)
  })
})

describe('lojas (busca VTEX)', () => {
  const read = { name: 'Modelando a Juba Geleia Seladora', brand: 'Widi Care' }
  const product = (productName: string, img: string, linkText = 'geleia') => ({
    productName,
    brand: 'Widi Care',
    linkText,
    items: [{ images: [{ imageUrl: img }] }],
  })
  it('só produtos que batem, sem kits, foto em 800px', () => {
    const json = [
      product('Geleia Seladora Widi Care Modelando a Juba 300g', 'https://loja.vteximg.com.br/arquivos/ids/123-55-55/a.jpg?v=1', 'geleia-seladora'),
      product('Kit Widi Care Modelando a Juba Geleia Seladora 2 unidades', 'https://loja.vteximg.com.br/arquivos/ids/124/k.jpg'),
      product('Encrespando a Juba Geleia', 'https://loja.vteximg.com.br/arquivos/ids/125/e.jpg'),
      product('Geleia Seladora Modelando a Juba', 'http://inseguro.example.com/x.jpg'),
    ]
    expect(storeMatches(json, 'www.loja.com.br', read)).toEqual([
      { url: 'https://loja.vteximg.com.br/arquivos/ids/123-800-800/a.jpg?v=1', page: 'https://www.loja.com.br/geleia-seladora/p' },
    ])
    expect(storeMatches({ erro: 1 }, 'www.loja.com.br', read)).toEqual([])
  })
  it('vtexSized', () => {
    expect(vtexSized('https://x.vteximg.com.br/arquivos/ids/9/a.png')).toBe('https://x.vteximg.com.br/arquivos/ids/9-800-800/a.png')
  })
})

describe('identify', () => {
  const vtex = (host: string) =>
    JSON.stringify([
      {
        productName: 'Geleia Seladora Widi Care Modelando a Juba 300g',
        brand: 'Widi Care',
        linkText: 'geleia',
        items: [{ images: [{ imageUrl: `https://${host}.vteximg.com.br/arquivos/ids/1/a.jpg` }] }],
      },
    ])
  const storeFetch: FetchFn = async (url) => {
    const u = new URL(url)
    if (u.pathname.startsWith('/api/catalog_system')) return new Response(vtex(u.hostname.split('.')[1]))
    if (u.hostname.endsWith('vteximg.com.br')) return new Response(jpeg())
    return new Response('nada', { status: 404 })
  }

  it('produto no catálogo: usa o catálogo e nem consulta as lojas', async () => {
    let storeCalls = 0
    const catalog: CatalogSearch = async () => [
      { id: 'outro', name: 'Encrespando a Juba Geleia', brand: 'Widi Care', image_path: 'p/outro.webp' },
      { id: 'widi-care-geleia', name: 'Geleia Seladora Modelando a Juba', brand: 'Widi Care', image_path: 'p/widi.webp' },
    ]
    const r = await identify({ image: 'QUJD', mime: 'image/jpeg' }, {
      send: async () => answer(juba),
      catalog,
      fetch: async (u, i) => {
        storeCalls++
        return storeFetch(u, i)
      },
    })
    expect(r).toEqual({
      found: true,
      brand: 'Widi Care',
      name: 'Geleia Seladora Modelando a Juba',
      confidence: 'high',
      catalog: { id: 'widi-care-geleia', name: 'Geleia Seladora Modelando a Juba', brand: 'Widi Care', image_path: 'p/widi.webp' },
      candidates: [],
    })
    expect(storeCalls).toBe(0)
  })

  it('fora do catálogo: uma foto por loja, até 3', async () => {
    const r = await identify({ image: 'QUJD', mime: 'image/jpeg' }, { send: async () => answer(juba), catalog: async () => [], fetch: storeFetch })
    expect(r.found).toBe(true)
    if (!r.found) return
    expect(r.catalog).toBeNull()
    expect(r.candidates.map((c) => c.source)).toEqual(['epocacosmeticos.com.br', 'drogariasaopaulo.com.br', 'paguemenos.com.br'])
    expect(r.candidates[0].image.startsWith('/9j/')).toBe(true)
  })

  it('erro da IA vira ai_failed; não identificado vira found=false', async () => {
    await expect(
      identify({ image: 'QUJD', mime: 'image/jpeg' }, { send: async () => Promise.reject(new Error('overloaded')), fetch: storeFetch }),
    ).rejects.toMatchObject({ code: 'ai_failed' })
    const r = await identify({ image: 'QUJD', mime: 'image/jpeg' }, { send: async () => answer({ found: false, brand: '', product_name: '', confidence: 'low' }), fetch: storeFetch })
    expect(r).toEqual({ found: false })
  })
})

describe('segurança e entrada', () => {
  it('isSafeUrl', () => {
    expect(isSafeUrl('https://www.salonline.com.br/produto')).toBe(true)
    expect(isSafeUrl('http://www.salonline.com.br/produto')).toBe(false)
    expect(isSafeUrl('https://127.0.0.1/a')).toBe(false)
    expect(isSafeUrl('https://localhost/a')).toBe(false)
    expect(isSafeUrl('https://kong/a')).toBe(false)
  })
  it('não segue redirecionamento para endereço interno; imagem grande demais', async () => {
    const evil: FetchFn = async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })
    await expect(safeFetch(evil, 'https://loja.example.com/x', { timeoutMs: 1000, maxBytes: 1000, accept: '*/*' })).rejects.toThrow('unsafe_url')
    await expect(safeFetch(async () => new Response(new Uint8Array(5000)), 'https://loja.example.com/i.jpg', { timeoutMs: 1000, maxBytes: 1000, accept: '*/*' })).rejects.toThrow('too_big')
  })
  it('sniffImage e validateInput', () => {
    expect(sniffImage(jpeg())).toBe('image/jpeg')
    expect(sniffImage(new TextEncoder().encode('<html>'))).toBeNull()
    expect(validateInput({ image: 'QUJD', mime: 'image/jpeg' })).toEqual({ image: 'QUJD', mime: 'image/jpeg' })
    expect(() => validateInput({ image: 'QUJD', mime: 'image/gif' })).toThrow('invalid_image')
    expect(() => validateInput({ image: 'A'.repeat(8 * 1024 * 1024), mime: 'image/png' })).toThrow('invalid_image')
  })
})
