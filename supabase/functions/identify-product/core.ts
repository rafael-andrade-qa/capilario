// Núcleo de "Identificar pela foto", sem nada específico do Deno: a IA e o fetch chegam
// como dependências, então os testes do app (vitest) exercitam tudo isto sem rede.
//
// Fluxo: a foto da embalagem vai para o Claude, que lê marca e nome e busca na web as
// páginas do produto; daqui abrimos essas páginas e pegamos a "foto de vitrine" de cada
// uma (a do JSON-LD de produto ou a og:image), baixamos até 3 e devolvemos ao app.
// Além das páginas que a IA indica, aproveitamos os resultados da busca dela que parecem
// ser do mesmo produto; em lojas VTEX que montam a página no navegador, usamos o catálogo
// público da loja.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_CANDIDATES = 3
const MAX_PAGES = 8
/** Páginas grandes são lidas só até aqui: a foto de vitrine fica no começo do HTML. */
const MAX_PAGE_BYTES = 3 * 1024 * 1024
const MAX_CANDIDATE_BYTES = 3 * 1024 * 1024
const MIN_CANDIDATE_BYTES = 2 * 1024
const PAGE_TIMEOUT_MS = 8000
const IMAGE_TIMEOUT_MS = 8000
const USER_AGENT = 'Mozilla/5.0 (compatible; ProjetoCapilar/1.0)'

export type Log = (msg: string) => void
const silent: Log = () => {}

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp'
const IMAGE_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

export type IdentifyErrorCode = 'invalid_image' | 'not_identified' | 'ai_failed'

export class IdentifyError extends Error {
  code: IdentifyErrorCode
  constructor(code: IdentifyErrorCode, message: string = code) {
    super(message)
    this.code = code
  }
}

// ---------- IA ----------

export const SYSTEM_PROMPT = `Você identifica produtos de cabelo (shampoo, condicionador, máscara, creme de pentear, gelatina, mousse, óleo, leave-in e afins) a partir de uma foto da embalagem tirada pela pessoa, para um diário de cuidados com o cabelo no Brasil.

1. Leia na foto a marca e o nome do produto. A foto pode estar torta, escura ou cortada; use o que der para ler.
2. Use a busca na web para confirmar o produto e achar páginas dele: o site oficial da marca e páginas de produto de farmácias e lojas grandes do Brasil (por exemplo Drogasil, Droga Raia, Araujo, Pague Menos, Época Cosméticos). Só páginas do produto exato, na versão simples (não kits, buscas, listas ou categorias).
3. Termine chamando report_product uma única vez.

Regras do report_product:
- brand: a marca como ela se escreve (ex.: "Salon Line", "Widi Care").
- product_name: o nome do produto sem a marca e sem tamanho ou volume, como aparece na embalagem e no site, com maiúsculas normais de título em português (ex.: "Todecacho Gelatina Super Definição").
- confidence: high quando leu claramente e a busca confirmou; medium quando leu mas não confirmou bem; low quando está adivinhando.
- Se a foto não for de um produto de cabelo ou não der para ler nada, use found=false e deixe os textos vazios.`

export const REPORT_TOOL = {
  name: 'report_product',
  description: 'Entrega o produto identificado. Chame uma única vez, no fim.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      found: { type: 'boolean', description: 'Se identificou um produto de cabelo.' },
      brand: { type: 'string', description: 'Marca, como ela se escreve. Vazio se não leu.' },
      product_name: { type: 'string', description: 'Nome do produto sem a marca e sem volume. Vazio se não leu.' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      page_urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'Até 8 URLs de páginas deste produto exato (sem kits): site da marca e farmácias ou lojas grandes do Brasil.',
      },
    },
    required: ['found', 'brand', 'product_name', 'confidence', 'page_urls'],
    additionalProperties: false,
  },
} as const

export interface Report {
  found: boolean
  brand: string
  product_name: string
  confidence: 'high' | 'medium' | 'low'
  page_urls: string[]
  /** Resultados da busca da IA (todas as consultas), para aproveitar os que forem do produto. */
  search_urls: string[]
}

/** Bloco de conteúdo da resposta, só com o que usamos. */
export interface Block {
  type: string
  name?: string
  input?: unknown
  [k: string]: unknown
}
export interface Turn {
  stop_reason: string | null
  content: Block[]
}
export type Message = { role: 'user' | 'assistant'; content: unknown }
/** Uma chamada à API de mensagens (a função injeta o SDK; os testes, uma resposta pronta). */
export type Sender = (messages: Message[]) => Promise<Turn>

export async function askClaude(send: Sender, image: string, mime: ImageMime): Promise<Report> {
  const messages: Message[] = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: image } },
        { type: 'text', text: 'Identifique este produto.' },
      ],
    },
  ]
  const searchUrls: string[] = []
  // A busca roda num laço do lado da Anthropic; "pause_turn" pede para reenviar e continuar.
  for (let i = 0; i < 4; i++) {
    const turn = await send(messages)
    searchUrls.push(...searchResultUrls(turn.content))
    const call = turn.content.find((b) => b.type === 'tool_use' && b.name === 'report_product')
    if (call) return { ...cleanReport(call.input), search_urls: [...new Set(searchUrls.filter(isSafeUrl))] }
    if (turn.stop_reason === 'refusal') throw new IdentifyError('not_identified', 'refusal')
    if (turn.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: turn.content })
  }
  throw new IdentifyError('not_identified', 'no_report')
}

/** URLs dos blocos web_search_tool_result (o conteúdo é uma lista; em erro, um objeto). */
function searchResultUrls(content: Block[]): string[] {
  const out: string[] = []
  for (const b of content) {
    if (b.type !== 'web_search_tool_result' || !Array.isArray(b.content)) continue
    for (const r of b.content as { url?: unknown }[]) if (typeof r?.url === 'string') out.push(r.url)
  }
  return out
}

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** O endereço parece ser deste produto? (palavras do nome no caminho, sem kits). */
export function looksLikeProductUrl(url: string, productName: string): boolean {
  const path = plain(decodeURIComponent(new URL(url).pathname))
  if (/\bkit\b|kit-|\/busca|\/search|\/categoria/.test(path)) return false
  const words = [...new Set(plain(productName).split(/[^a-z0-9]+/).filter((w) => w.length >= 4))]
  if (!words.length) return false
  const hits = words.filter((w) => path.includes(w)).length
  // A maioria das palavras: "Encrespando a Juba Geleia" não passa por "Modelando a Juba Geleia Seladora".
  return hits >= Math.max(Math.min(2, words.length), Math.ceil(words.length * 0.6))
}

/** Páginas a abrir: as indicadas pela IA, depois os resultados da busca que parecem do produto. */
export function pagesToTry(report: Report): string[] {
  const out = [...report.page_urls]
  for (const u of report.search_urls) {
    if (out.length >= MAX_PAGES) break
    if (!out.includes(u) && looksLikeProductUrl(u, report.product_name)) out.push(u)
  }
  return out.slice(0, MAX_PAGES)
}

function cleanReport(input: unknown): Omit<Report, 'search_urls'> {
  const r = (input ?? {}) as Partial<Record<keyof Report, unknown>>
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
  const brand = text(r.brand, 100)
  const product_name = text(r.product_name, 200)
  const confidence = r.confidence === 'high' || r.confidence === 'medium' ? r.confidence : 'low'
  const urls = Array.isArray(r.page_urls) ? r.page_urls.filter((u): u is string => typeof u === 'string' && isSafeUrl(u)) : []
  return {
    found: r.found === true && !!product_name,
    brand,
    product_name,
    confidence,
    page_urls: [...new Set(urls)].slice(0, MAX_PAGES),
  }
}

// ---------- Rede (páginas e imagens) ----------

/** Só https público: nada de IP literal, localhost ou nomes internos (evita SSRF). */
export function isSafeUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false
  if (u.port && u.port !== '443') return false
  const host = u.hostname.toLowerCase()
  if (!host.includes('.') || host.startsWith('[')) return false
  if (/^\d+(\.\d+){3}$/.test(host)) return false
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(host)) return false
  return true
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>

/** fetch com redirecionamentos conferidos um a um, tempo e tamanho máximos. */
export async function safeFetch(
  fetchFn: FetchFn,
  url: string,
  opts: { timeoutMs: number; maxBytes: number; accept: string; truncate?: boolean },
) {
  let current = url
  for (let hop = 0; hop < 4; hop++) {
    if (!isSafeUrl(current)) throw new Error('unsafe_url')
    const res = await fetchFn(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs),
      headers: { 'user-agent': USER_AGENT, accept: opts.accept, 'accept-language': 'pt-BR,pt;q=0.9' },
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      await res.body?.cancel()
      if (!loc) throw new Error('bad_redirect')
      current = new URL(loc, current).toString()
      continue
    }
    if (!res.ok) {
      await res.body?.cancel()
      throw new Error(`http_${res.status}`)
    }
    const declared = Number(res.headers.get('content-length') ?? '0')
    if (declared > opts.maxBytes && !opts.truncate) {
      await res.body?.cancel()
      throw new Error('too_big')
    }
    return { url: current, bytes: await readLimited(res, opts.maxBytes, !!opts.truncate), contentType: res.headers.get('content-type') ?? '' }
  }
  throw new Error('too_many_redirects')
}

/** Lê até `max` bytes; acima disso falha, ou (truncate) devolve só o começo. */
async function readLimited(res: Response, max: number, truncate: boolean): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer()).slice(0, max)
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (total + value.byteLength > max) {
      await reader.cancel()
      if (!truncate) throw new Error('too_big')
      parts.push(value.subarray(0, max - total))
      total = max
      break
    }
    total += value.byteLength
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.byteLength
  }
  return out
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : null
}

/** Fotos de vitrine de uma página de produto, da mais confiável para a menos. */
export function extractImageUrls(html: string, pageUrl: string): string[] {
  const found: string[] = []
  // 1) JSON-LD de produto: costuma ser a embalagem em fundo branco.
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectProductImages(JSON.parse(m[1].trim()), found)
    } catch {
      /* JSON-LD quebrado: ignora */
    }
  }
  // 2) og:image / twitter:image / image_src.
  const metaNames = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']
  const metas: { rank: number; url: string }[] = []
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], 'property') ?? attr(m[0], 'name') ?? '').toLowerCase()
    const rank = metaNames.indexOf(key)
    const content = attr(m[0], 'content')
    if (rank >= 0 && content) metas.push({ rank, url: content })
  }
  metas.sort((a, b) => a.rank - b.rank)
  found.push(...metas.map((x) => x.url))
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if ((attr(m[0], 'rel') ?? '').toLowerCase() === 'image_src') {
      const h = attr(m[0], 'href')
      if (h) found.push(h)
    }
  }
  return cleanImageUrls(found, pageUrl)
}

/** Absolutas, seguras, sem logotipos e sem repetir a mesma imagem em outro tamanho. */
function cleanImageUrls(found: string[], base: string): string[] {
  const out: string[] = []
  const paths = new Set<string>()
  for (const raw of found) {
    let u: URL
    try {
      u = new URL(decodeEntities(raw.trim()), base)
    } catch {
      continue
    }
    const abs = u.toString()
    if (!isSafeUrl(abs) || /logo|favicon|banner|sprite|placeholder/i.test(u.pathname)) continue
    const key = u.origin + u.pathname
    if (paths.has(key)) continue
    paths.add(key)
    out.push(abs)
  }
  return out
}

/**
 * Lojas VTEX (endereço terminando em /p) às vezes montam a página no navegador e o HTML vem
 * sem a foto; o catálogo público da própria loja tem as imagens do produto.
 */
export function vtexCatalogUrl(pageUrl: string): string | null {
  const u = new URL(pageUrl)
  if (!/\/[^/]+\/p\/?$/.test(u.pathname)) return null
  return `${u.origin}/api/catalog_system/pub/products/search${u.pathname.replace(/\/$/, '')}`
}

export function vtexImages(json: unknown, base: string): string[] {
  const found: string[] = []
  const products = Array.isArray(json) ? json : []
  for (const p of products.slice(0, 1) as { items?: { images?: { imageUrl?: unknown }[] }[] }[]) {
    for (const item of (p.items ?? []).slice(0, 1)) {
      for (const img of item.images ?? []) if (typeof img.imageUrl === 'string') found.push(img.imageUrl)
    }
  }
  return cleanImageUrls(found, base)
}

function collectProductImages(node: unknown, out: string[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 6) return
  if (Array.isArray(node)) {
    for (const n of node) collectProductImages(n, out, depth + 1)
    return
  }
  const obj = node as Record<string, unknown>
  const type = obj['@type']
  const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'))
  if (isProduct) pushImage(obj.image, out)
  for (const k of ['@graph', 'mainEntity', 'itemListElement']) collectProductImages(obj[k], out, depth + 1)
}

function pushImage(v: unknown, out: string[]): void {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => pushImage(x, out))
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.url === 'string') out.push(o.url)
    else if (typeof o.contentUrl === 'string') out.push(o.contentUrl)
  }
}

/** Tipo real da imagem pelos primeiros bytes (o cabeçalho do servidor pode mentir). */
export function sniffImage(b: Uint8Array): ImageMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (
    b.length >= 12 &&
    String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' &&
    String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP'
  )
    return 'image/webp'
  return null
}

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function base64Size(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - pad
}

export interface Candidate {
  image: string
  mime: ImageMime
  source: string
  page: string
}

const shortUrl = (url: string) => {
  const u = new URL(url)
  return (u.hostname.replace(/^www\./, '') + u.pathname).slice(0, 90)
}

async function pageImages(fetchFn: FetchFn, page: string, log: Log): Promise<string[]> {
  let images: string[] = []
  let finalUrl = page
  try {
    const r = await safeFetch(fetchFn, page, { timeoutMs: PAGE_TIMEOUT_MS, maxBytes: MAX_PAGE_BYTES, accept: 'text/html,*/*;q=0.5', truncate: true })
    finalUrl = r.url
    images = extractImageUrls(new TextDecoder().decode(r.bytes), r.url)
    log(`page ok ${shortUrl(page)} imgs=${images.length}`)
  } catch (e) {
    log(`page fail ${shortUrl(page)} ${(e as Error).message}`)
  }
  const api = images.length ? null : vtexCatalogUrl(finalUrl)
  if (api) {
    try {
      const r = await safeFetch(fetchFn, api, { timeoutMs: PAGE_TIMEOUT_MS, maxBytes: MAX_PAGE_BYTES, accept: 'application/json' })
      images = vtexImages(JSON.parse(new TextDecoder().decode(r.bytes)), api)
      log(`vtex ok ${shortUrl(page)} imgs=${images.length}`)
    } catch (e) {
      log(`vtex fail ${shortUrl(page)} ${(e as Error).message}`)
    }
  }
  return images
}

export async function findCandidates(fetchFn: FetchFn, pageUrls: string[], log: Log = silent): Promise<Candidate[]> {
  const pages = await Promise.allSettled(pageUrls.map(async (page) => ({ page, images: await pageImages(fetchFn, page, log) })))
  // Uma foto por página primeiro (variedade), depois as demais.
  const ok = pages.flatMap((p) => (p.status === 'fulfilled' ? [p.value] : []))
  const queue: { url: string; page: string }[] = []
  const seen = new Set<string>()
  const maxPerPage = Math.max(0, ...ok.map((p) => p.images.length))
  for (let i = 0; i < maxPerPage; i++) {
    for (const p of ok) {
      const url = p.images[i]
      if (url && !seen.has(url)) {
        seen.add(url)
        queue.push({ url, page: p.page })
      }
    }
  }
  const tries = await Promise.allSettled(
    queue.slice(0, MAX_CANDIDATES + 3).map(async ({ url, page }) => {
      try {
        const r = await safeFetch(fetchFn, url, { timeoutMs: IMAGE_TIMEOUT_MS, maxBytes: MAX_CANDIDATE_BYTES, accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8' })
        const mime = sniffImage(r.bytes)
        if (!mime) throw new Error(`not_an_image ${r.contentType}`)
        if (r.bytes.byteLength < MIN_CANDIDATE_BYTES) throw new Error('too_small')
        return { image: toBase64(r.bytes), mime, source: new URL(page).hostname.replace(/^www\./, ''), page }
      } catch (e) {
        log(`img fail ${shortUrl(url)} ${(e as Error).message}`)
        throw e
      }
    }),
  )
  const out = tries.flatMap((t) => (t.status === 'fulfilled' ? [t.value] : [])).slice(0, MAX_CANDIDATES)
  log(`candidates=${out.length} of queue=${queue.length}`)
  return out
}

// ---------- Tudo junto ----------

export interface IdentifyInput {
  image: unknown
  mime: unknown
}
export type IdentifyResult =
  | { found: false }
  | { found: true; brand: string; name: string; confidence: Report['confidence']; candidates: Candidate[] }

export function validateInput(input: IdentifyInput): { image: string; mime: ImageMime } {
  const { image, mime } = input
  if (typeof mime !== 'string' || !IMAGE_MIMES.includes(mime)) throw new IdentifyError('invalid_image')
  if (typeof image !== 'string' || !image || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new IdentifyError('invalid_image')
  if (base64Size(image) > MAX_IMAGE_BYTES) throw new IdentifyError('invalid_image')
  return { image, mime: mime as ImageMime }
}

export async function identify(
  input: { image: string; mime: ImageMime },
  deps: { send: Sender; fetch: FetchFn; log?: Log },
): Promise<IdentifyResult> {
  const log = deps.log ?? silent
  let report: Report
  try {
    report = await askClaude(deps.send, input.image, input.mime)
  } catch (e) {
    log(`ai ${(e as Error).message}`)
    if (e instanceof IdentifyError && e.code === 'not_identified') return { found: false }
    if (e instanceof IdentifyError) throw e
    throw new IdentifyError('ai_failed', (e as Error).message)
  }
  log(`report found=${report.found} conf=${report.confidence} pages=${report.page_urls.length} search=${report.search_urls.length}`)
  if (!report.found) return { found: false }
  const candidates = await findCandidates(deps.fetch, pagesToTry(report), log)
  return { found: true, brand: report.brand, name: report.product_name, confidence: report.confidence, candidates }
}
