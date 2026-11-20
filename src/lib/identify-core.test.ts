// Núcleo da função identify-product, sem rede: IA e fetch falsos.
import { describe, expect, it } from 'vitest'
import {
  askClaude,
  extractImageUrls,
  identify,
  isSafeUrl,
  looksLikeProductUrl,
  pagesToTry,
  safeFetch,
  sniffImage,
  validateInput,
  vtexCatalogUrl,
  vtexImages,
  type FetchFn,
  type Sender,
  type Turn,
} from '../../supabase/functions/identify-product/core.ts'

const jpeg = (size = 4000) => {
  const b = new Uint8Array(size)
  b.set([0xff, 0xd8, 0xff, 0xe0])
  return b
}

const report = (input: Record<string, unknown>): Turn => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', name: 'report_product', input }],
})

const okReport = {
  found: true,
  brand: ' Salon Line ',
  product_name: 'Todecacho   Gelatina Super Definição',
  confidence: 'high',
  page_urls: ['https://loja.example.com/gelatina', 'https://marca.example.com/p/gelatina', 'http://inseguro.example.com/x', 'https://10.0.0.1/x'],
}

describe('isSafeUrl', () => {
  it('aceita https público e recusa o resto', () => {
    expect(isSafeUrl('https://www.salonline.com.br/produto')).toBe(true)
    expect(isSafeUrl('http://www.salonline.com.br/produto')).toBe(false)
    expect(isSafeUrl('https://127.0.0.1/a')).toBe(false)
    expect(isSafeUrl('https://[::1]/a')).toBe(false)
    expect(isSafeUrl('https://localhost/a')).toBe(false)
    expect(isSafeUrl('https://kong/a')).toBe(false)
    expect(isSafeUrl('https://db.internal/a')).toBe(false)
    expect(isSafeUrl('https://user:pw@site.com/a')).toBe(false)
    expect(isSafeUrl('https://site.com:8443/a')).toBe(false)
    expect(isSafeUrl('nada')).toBe(false)
  })
})

describe('extractImageUrls', () => {
  it('prefere a imagem do JSON-LD de produto, depois og:image; resolve caminhos relativos', () => {
    const html = `<html><head>
      <meta property="og:image" content="/img/og.jpg?a=1&amp;b=2">
      <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
      <script type="application/ld+json">{"@graph":[{"@type":"Organization","logo":"https://x.com/logo.png"},{"@type":"Product","name":"Gelatina","image":["https://cdn.example.com/pack.jpg",{"url":"https://cdn.example.com/pack2.jpg"}]}]}</script>
      <script type="application/ld+json">{ quebrado </script>
      <meta property="og:image" content="http://inseguro.com/a.jpg">
    </head></html>`
    expect(extractImageUrls(html, 'https://loja.example.com/p/gelatina')).toEqual([
      'https://cdn.example.com/pack.jpg',
      'https://cdn.example.com/pack2.jpg',
      'https://loja.example.com/img/og.jpg?a=1&b=2',
      'https://cdn.example.com/tw.jpg',
    ])
  })

  it('aceita atributos fora de ordem e aspas simples', () => {
    const html = `<meta content='https://cdn.example.com/a.webp' property='og:image' />`
    expect(extractImageUrls(html, 'https://loja.example.com/')).toEqual(['https://cdn.example.com/a.webp'])
  })
})

describe('sniffImage', () => {
  it('reconhece pelo conteúdo', () => {
    expect(sniffImage(jpeg())).toBe('image/jpeg')
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe('image/png')
    expect(sniffImage(new TextEncoder().encode('RIFF1234WEBPVP8 '))).toBe('image/webp')
    expect(sniffImage(new TextEncoder().encode('<html>'))).toBeNull()
  })
})

describe('validateInput', () => {
  it('só aceita base64 de JPEG, PNG ou WebP', () => {
    expect(validateInput({ image: 'QUJD', mime: 'image/jpeg' })).toEqual({ image: 'QUJD', mime: 'image/jpeg' })
    expect(() => validateInput({ image: 'QUJD', mime: 'image/gif' })).toThrow('invalid_image')
    expect(() => validateInput({ image: 'não é base64', mime: 'image/png' })).toThrow('invalid_image')
    expect(() => validateInput({ image: '', mime: 'image/png' })).toThrow('invalid_image')
    expect(() => validateInput({ image: 'A'.repeat(8 * 1024 * 1024), mime: 'image/png' })).toThrow('invalid_image')
  })
})

describe('askClaude', () => {
  it('continua depois de pause_turn e limpa a resposta', async () => {
    const calls: number[] = []
    const send: Sender = async (messages) => {
      calls.push(messages.length)
      if (calls.length === 1) return { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', name: 'web_search' }] }
      return report(okReport)
    }
    const r = await askClaude(send, 'QUJD', 'image/jpeg')
    expect(calls).toEqual([1, 2])
    expect(r).toEqual({
      found: true,
      brand: 'Salon Line',
      product_name: 'Todecacho Gelatina Super Definição',
      confidence: 'high',
      page_urls: ['https://loja.example.com/gelatina', 'https://marca.example.com/p/gelatina'],
      search_urls: [],
    })
  })

  it('guarda os resultados da busca de todas as rodadas', async () => {
    const results = (urls: string[]) => ({
      type: 'web_search_tool_result',
      content: urls.map((url) => ({ type: 'web_search_result', url, title: 'x' })),
    })
    let n = 0
    const send: Sender = async () =>
      n++ === 0
        ? { stop_reason: 'pause_turn', content: [results(['https://a.example.com/p1', 'http://inseguro.example.com/x'])] }
        : { stop_reason: 'tool_use', content: [results(['https://b.example.com/p2', 'https://a.example.com/p1']), ...report(okReport).content] }
    const r = await askClaude(send, 'QUJD', 'image/jpeg')
    expect(r.search_urls).toEqual(['https://a.example.com/p1', 'https://b.example.com/p2'])
  })

  it('sem chamar report_product: não identificado', async () => {
    const send: Sender = async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Não sei.' }] })
    await expect(askClaude(send, 'QUJD', 'image/jpeg')).rejects.toThrow('no_report')
  })

  it('found sem nome vira não encontrado', async () => {
    const r = await askClaude(async () => report({ ...okReport, product_name: '  ' }), 'QUJD', 'image/jpeg')
    expect(r.found).toBe(false)
  })
})

describe('identify', () => {
  const pages: Record<string, () => Response> = {
    'https://loja.example.com/gelatina': () =>
      new Response(`<meta property="og:image" content="https://cdn.example.com/a.jpg"><meta name="twitter:image" content="https://cdn.example.com/a2.jpg">`),
    'https://marca.example.com/p/gelatina': () => new Response(null, { status: 302, headers: { location: '/p/gelatina-nova' } }),
    'https://marca.example.com/p/gelatina-nova': () =>
      new Response(`<script type="application/ld+json">{"@type":"Product","image":"https://cdn.example.com/b.jpg"}</script>`),
    'https://cdn.example.com/a.jpg': () => new Response(jpeg()),
    'https://cdn.example.com/a2.jpg': () => new Response(jpeg(100)), // pequena demais (ícone): fica de fora
    'https://cdn.example.com/b.jpg': () => new Response(jpeg()),
  }
  const fakeFetch: FetchFn = async (url) => (pages[url] ?? (() => new Response('nada', { status: 404 })))()

  it('devolve nome, marca e uma foto por página, já em base64', async () => {
    const r = await identify({ image: 'QUJD', mime: 'image/jpeg' }, { send: async () => report(okReport), fetch: fakeFetch })
    expect(r.found).toBe(true)
    if (!r.found) return
    expect(r.brand).toBe('Salon Line')
    expect(r.name).toBe('Todecacho Gelatina Super Definição')
    expect(r.candidates.map((c) => [c.source, c.mime])).toEqual([
      ['loja.example.com', 'image/jpeg'],
      ['marca.example.com', 'image/jpeg'],
    ])
    expect(r.candidates[0].image.startsWith('/9j/')).toBe(true)
  })

  it('não segue redirecionamento para endereço interno', async () => {
    const evil: FetchFn = async (url) =>
      url === 'https://loja.example.com/gelatina'
        ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })
        : new Response('nada', { status: 404 })
    const r = await identify({ image: 'QUJD', mime: 'image/jpeg' }, { send: async () => report(okReport), fetch: evil })
    expect(r.found && r.candidates).toEqual([])
  })

  it('erro da IA vira ai_failed; não identificado vira found=false', async () => {
    await expect(
      identify({ image: 'QUJD', mime: 'image/jpeg' }, { send: async () => Promise.reject(new Error('overloaded')), fetch: fakeFetch }),
    ).rejects.toMatchObject({ code: 'ai_failed' })
    const r = await identify({ image: 'QUJD', mime: 'image/jpeg' }, { send: async () => ({ stop_reason: 'end_turn', content: [] }), fetch: fakeFetch })
    expect(r).toEqual({ found: false })
  })
})

describe('páginas a abrir', () => {
  const name = 'Modelando a Juba Geleia Seladora'
  it('aceita a página do produto e recusa kit, busca e produto parecido da mesma linha', () => {
    expect(looksLikeProductUrl('https://www.drogasil.com.br/widi-care-geleia-seladora-modelando-a-juba-300g.html', name)).toBe(true)
    expect(looksLikeProductUrl('https://www.drogariaspacheco.com.br/geleia-capilar-seladora-widi-care-modelando-a-juba-300g/p', name)).toBe(true)
    expect(looksLikeProductUrl('https://www.drogasil.com.br/widi-care-modelando-a-juba-kit-2-geleia-seladora-300g-1448126.html', name)).toBe(false)
    expect(looksLikeProductUrl('https://m.magazineluiza.com.br/busca/geleia+modeladora+juba+seladora/', name)).toBe(false)
    expect(looksLikeProductUrl('https://www.casasbahia.com.br/encrespando-a-juba-geleia-modeladora-widi-care/p/1558116025', name)).toBe(false)
  })

  it('primeiro as indicadas pela IA, depois os resultados que parecem do produto; no máximo 8', () => {
    const search = Array.from({ length: 12 }, (_, i) => `https://loja${i}.example.com/geleia-seladora-modelando-juba`)
    const pages = pagesToTry({
      found: true,
      brand: 'Widi Care',
      product_name: name,
      confidence: 'high',
      page_urls: ['https://marca.example.com/produto'],
      search_urls: ['https://outra.example.com/shampoo-qualquer', ...search],
    })
    expect(pages[0]).toBe('https://marca.example.com/produto')
    expect(pages).toHaveLength(8)
    expect(pages).not.toContain('https://outra.example.com/shampoo-qualquer')
  })
})

describe('VTEX', () => {
  it('monta o endereço do catálogo só para páginas /p', () => {
    expect(vtexCatalogUrl('https://www.drogariaspacheco.com.br/geleia-capilar-seladora/p')).toBe(
      'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/geleia-capilar-seladora/p',
    )
    expect(vtexCatalogUrl('https://www.drogasil.com.br/geleia.html')).toBeNull()
  })

  it('lê as imagens do primeiro item, sem repetir tamanho', () => {
    const json = [
      {
        items: [
          {
            images: [
              { imageUrl: 'https://cdn.example.com/arquivos/ids/1/frente.png?v=1' },
              { imageUrl: 'https://cdn.example.com/arquivos/ids/1/frente.png?v=2' },
              { imageUrl: 'https://cdn.example.com/arquivos/ids/2/verso.png' },
              { imageUrl: 'https://cdn.example.com/logo.png' },
            ],
          },
        ],
      },
    ]
    expect(vtexImages(json, 'https://loja.example.com/api')).toEqual([
      'https://cdn.example.com/arquivos/ids/1/frente.png?v=1',
      'https://cdn.example.com/arquivos/ids/2/verso.png',
    ])
    expect(vtexImages({ erro: true }, 'https://loja.example.com/api')).toEqual([])
  })
})

describe('safeFetch', () => {
  it('página grande: lê só o começo (truncate); imagem grande: recusa', async () => {
    const big = () => new Response(new Uint8Array(5000))
    const page = await safeFetch(async () => big(), 'https://loja.example.com/p', { timeoutMs: 1000, maxBytes: 1000, accept: '*/*', truncate: true })
    expect(page.bytes.byteLength).toBe(1000)
    await expect(safeFetch(async () => big(), 'https://loja.example.com/i.jpg', { timeoutMs: 1000, maxBytes: 1000, accept: '*/*' })).rejects.toThrow('too_big')
  })
})
