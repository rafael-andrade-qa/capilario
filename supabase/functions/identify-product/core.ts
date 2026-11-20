// Núcleo de "Identificar pela foto", sem nada específico do Deno: a IA, o catálogo e o fetch
// chegam como dependências, então os testes do app (vitest) exercitam tudo isto sem rede.
//
// Fluxo barato (centavos por mil):
//   1. A IA (Claude Haiku 5.5, sem busca na web) só lê o rótulo: marca e nome.
//   2. Procura o produto no catálogo do app (foto pronta, já padronizada).
//   3. Se não estiver lá, procura nas buscas públicas das lojas (VTEX) e baixa até 3 fotos.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_CANDIDATES = 3
const MAX_CANDIDATE_BYTES = 3 * 1024 * 1024
const MIN_CANDIDATE_BYTES = 2 * 1024
const STORE_TIMEOUT_MS = 6000
const IMAGE_TIMEOUT_MS = 8000
const USER_AGENT = 'Mozilla/5.0 (compatible; ProjetoCapilar/1.0)'

/** Lojas com busca pública (VTEX) e robots.txt que permite acesso automático. */
export const STORES = ['www.epocacosmeticos.com.br', 'www.drogariasaopaulo.com.br', 'www.paguemenos.com.br']

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp'
const IMAGE_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

export type Log = (msg: string) => void
const silent: Log = () => {}

export type IdentifyErrorCode = 'invalid_image' | 'not_identified' | 'ai_failed'

export class IdentifyError extends Error {
  code: IdentifyErrorCode
  constructor(code: IdentifyErrorCode, message: string = code) {
    super(message)
    this.code = code
  }
}

// ---------- IA: só ler o rótulo ----------

export const SYSTEM_PROMPT = `Você lê embalagens de produtos de cabelo (shampoo, condicionador, máscara, creme de pentear, gelatina, geleia, mousse, pomada, cera, óleo, leave-in e afins) em fotos tiradas por pessoas no Brasil, para um diário de cuidados com o cabelo.

Leia na foto a marca e o nome do produto. A foto pode estar torta, escura ou cortada; use o que der para ler.
- brand: a marca como ela se escreve (ex.: "Salon Line", "Widi Care", "QOD").
- product_name: o nome do produto sem a marca e sem tamanho ou volume, com maiúsculas normais de título em português (ex.: "Todecacho Gelatina Super Definição", "Modelando a Juba Geleia Seladora").
- confidence: high quando leu marca e nome com clareza; medium quando leu parte; low quando está adivinhando.
- Se a foto não for de um produto de cabelo ou não der para ler nada, use found=false e deixe os textos vazios.`

/** Formato da resposta (saída estruturada: a API garante JSON válido neste formato). */
export const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    brand: { type: 'string' },
    product_name: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['found', 'brand', 'product_name', 'confidence'],
  additionalProperties: false,
} as const

export interface Report {
  found: boolean
  brand: string
  product_name: string
  confidence: 'high' | 'medium' | 'low'
}

/** Bloco de conteúdo da resposta, só com o que usamos. */
export interface Block {
  type: string
  text?: string
  [k: string]: unknown
}
export interface Turn {
  stop_reason: string | null
  content: Block[]
  usage?: { input_tokens?: number; output_tokens?: number }
}
export type Message = { role: 'user' | 'assistant'; content: unknown }
/** Uma chamada à API de mensagens (a função injeta o SDK; os testes, uma resposta pronta). */
export type Sender = (messages: Message[]) => Promise<Turn>

export async function askClaude(send: Sender, image: string, mime: ImageMime, log: Log = silent): Promise<Report> {
  const turn = await send([
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: image } },
        { type: 'text', text: 'Leia a marca e o nome deste produto.' },
      ],
    },
  ])
  if (turn.usage) log(`usage in=${turn.usage.input_tokens ?? 0} out=${turn.usage.output_tokens ?? 0}`)
  if (turn.stop_reason === 'refusal') throw new IdentifyError('not_identified', 'refusal')
  const text = turn.content.find((b) => b.type === 'text')?.text
  if (!text) throw new IdentifyError('not_identified', 'no_report')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new IdentifyError('not_identified', 'bad_json')
  }
  return cleanReport(parsed)
}

function cleanReport(input: unknown): Report {
  const r = (input ?? {}) as Partial<Record<keyof Report, unknown>>
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
  const brand = text(r.brand, 100)
  const product_name = text(r.product_name, 200)
  const confidence = r.confidence === 'high' || r.confidence === 'medium' ? r.confidence : 'low'
  return { found: r.found === true && !!product_name, brand, product_name, confidence }
}

// ---------- Mesmo produto? ----------

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Palavras que contam no nome: 4+ letras, sem números (tamanhos) e sem as da marca. */
function words(s: string, brandWords: Set<string>): string[] {
  return [...new Set(plain(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !/\d/.test(w) && !brandWords.has(w)))]
}

/**
 * O item (do catálogo ou de uma loja) é o produto lido no rótulo? Marca compatível e:
 *  - quase todas as palavras do item (3/4) aparecem no que foi lido: "Encrespando a Juba
 *    Geleia" não é "Modelando a Juba Geleia Seladora";
 *  - pelo menos metade do que foi lido está no item: o rótulo pode trazer frases a mais
 *    ("Definição e Muito Brilho") e a loja pode trazer marca e tamanho no nome.
 */
export function sameProduct(read: { name: string; brand: string }, item: { name: string; brand: string }): boolean {
  const rb = plain(read.brand).replace(/[^a-z0-9]/g, '')
  const ib = plain(item.brand).replace(/[^a-z0-9]/g, '')
  const itemText = plain(`${item.brand} ${item.name}`)
  const brandOk = !!rb && (rb.includes(ib) || ib.includes(rb) || itemText.replace(/[^a-z0-9]/g, '').includes(rb))
  if (!brandOk) return false
  const brandWords = new Set(plain(`${read.brand} ${item.brand}`).split(/[^a-z0-9]+/).filter(Boolean))
  brandWords.add(rb)
  brandWords.add(ib)
  const rw = new Set(words(read.name, brandWords))
  const iw = words(item.name, brandWords)
  if (!rw.size || !iw.length) return false
  const hits = iw.filter((w) => rw.has(w)).length
  return hits >= Math.min(2, iw.length) && hits / iw.length >= 0.75 && hits / rw.size >= 0.5
}

// ---------- Catálogo do app ----------

export interface CatalogHit {
  id: string
  name: string
  brand: string
  image_path: string | null
}
/** Itens do catálogo da mesma marca, mais parecidos primeiro (RPC match_catalog, como o usuário). */
export type CatalogSearch = (read: { name: string; brand: string }) => Promise<CatalogHit[]>

export async function findInCatalog(search: CatalogSearch, read: { name: string; brand: string }, log: Log = silent): Promise<CatalogHit | null> {
  const hits = await search(read).catch(() => [])
  log(`catalog candidates=${hits.length}`)
  return hits.find((h) => sameProduct(read, h)) ?? null
}

// ---------- Lojas (busca pública VTEX) ----------

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
export async function safeFetch(fetchFn: FetchFn, url: string, opts: { timeoutMs: number; maxBytes: number; accept: string }) {
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
    if (declared > opts.maxBytes) {
      await res.body?.cancel()
      throw new Error('too_big')
    }
    return { url: current, bytes: await readLimited(res, opts.maxBytes), contentType: res.headers.get('content-type') ?? '' }
  }
  throw new Error('too_many_redirects')
}

async function readLimited(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer()).slice(0, max)
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      throw new Error('too_big')
    }
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

/** Imagem VTEX num tamanho fixo (a URL aceita "ids/<id>-<largura>-<altura>/"). */
export function vtexSized(url: string, w = 800, h = 800): string {
  return url.replace(/\/ids\/(\d+)(?:-\d+-\d+)?\//, `/ids/$1-${w}-${h}/`)
}

interface VtexProduct {
  productName?: unknown
  brand?: unknown
  linkText?: unknown
  items?: { images?: { imageUrl?: unknown }[] }[]
}

/** Fotos dos produtos da busca da loja que batem com o rótulo lido. */
export function storeMatches(json: unknown, host: string, read: { name: string; brand: string }): { url: string; page: string }[] {
  const out: { url: string; page: string }[] = []
  for (const p of (Array.isArray(json) ? json : []) as VtexProduct[]) {
    const name = typeof p.productName === 'string' ? p.productName : ''
    const brand = typeof p.brand === 'string' ? p.brand : ''
    if (!name || /\bkit\b/i.test(name) || !sameProduct(read, { name, brand })) continue
    const img = p.items?.[0]?.images?.[0]?.imageUrl
    if (typeof img !== 'string') continue
    const url = vtexSized(img)
    if (isSafeUrl(url)) out.push({ url, page: `https://${host}/${typeof p.linkText === 'string' ? p.linkText : ''}/p` })
  }
  return out
}

async function searchStore(fetchFn: FetchFn, host: string, read: { name: string; brand: string }, log: Log) {
  for (const q of [`${read.brand} ${read.name}`, read.name]) {
    const url = `https://${host}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(q)}&_from=0&_to=9`
    try {
      const r = await safeFetch(fetchFn, url, { timeoutMs: STORE_TIMEOUT_MS, maxBytes: 4 * 1024 * 1024, accept: 'application/json' })
      const found = storeMatches(JSON.parse(new TextDecoder().decode(r.bytes)), host, read)
      log(`store ${host} q=${q.length} matches=${found.length}`)
      if (found.length) return found
    } catch (e) {
      log(`store ${host} fail ${(e as Error).message}`)
    }
  }
  return []
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

/** Fotos oficiais nas lojas: uma por loja primeiro (variedade), até 3. */
export async function storeCandidates(fetchFn: FetchFn, read: { name: string; brand: string }, log: Log = silent): Promise<Candidate[]> {
  const perStore = await Promise.all(STORES.map((h) => searchStore(fetchFn, h, read, log)))
  const queue: { url: string; page: string }[] = []
  const seen = new Set<string>()
  const longest = Math.max(0, ...perStore.map((s) => s.length))
  for (let i = 0; i < longest; i++) {
    for (const s of perStore) {
      const c = s[i]
      const key = c ? c.url.split('?')[0] : ''
      if (c && !seen.has(key)) {
        seen.add(key)
        queue.push(c)
      }
    }
  }
  const tries = await Promise.allSettled(
    queue.slice(0, MAX_CANDIDATES + 2).map(async ({ url, page }) => {
      const r = await safeFetch(fetchFn, url, { timeoutMs: IMAGE_TIMEOUT_MS, maxBytes: MAX_CANDIDATE_BYTES, accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8' })
      const mime = sniffImage(r.bytes)
      if (!mime) throw new Error(`not_an_image ${r.contentType}`)
      if (r.bytes.byteLength < MIN_CANDIDATE_BYTES) throw new Error('too_small')
      return { image: toBase64(r.bytes), mime, source: new URL(page).hostname.replace(/^www\./, ''), page }
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
  | {
      found: true
      brand: string
      name: string
      confidence: Report['confidence']
      /** O produto já está no catálogo do app (foto pronta): o app usa esta. */
      catalog: CatalogHit | null
      candidates: Candidate[]
    }

export function validateInput(input: IdentifyInput): { image: string; mime: ImageMime } {
  const { image, mime } = input
  if (typeof mime !== 'string' || !IMAGE_MIMES.includes(mime)) throw new IdentifyError('invalid_image')
  if (typeof image !== 'string' || !image || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new IdentifyError('invalid_image')
  if (base64Size(image) > MAX_IMAGE_BYTES) throw new IdentifyError('invalid_image')
  return { image, mime: mime as ImageMime }
}

export async function identify(
  input: { image: string; mime: ImageMime },
  deps: { send: Sender; fetch: FetchFn; catalog?: CatalogSearch; log?: Log },
): Promise<IdentifyResult> {
  const log = deps.log ?? silent
  let report: Report
  try {
    report = await askClaude(deps.send, input.image, input.mime, log)
  } catch (e) {
    log(`ai ${(e as Error).message}`)
    if (e instanceof IdentifyError && e.code === 'not_identified') return { found: false }
    if (e instanceof IdentifyError) throw e
    throw new IdentifyError('ai_failed', (e as Error).message)
  }
  log(`report found=${report.found} conf=${report.confidence}`)
  if (!report.found) return { found: false }
  const read = { name: report.product_name, brand: report.brand }

  const hit = deps.catalog ? await findInCatalog(deps.catalog, read, log) : null
  if (hit) {
    log(`catalog hit ${hit.id}`)
    return { found: true, brand: hit.brand, name: hit.name, confidence: report.confidence, catalog: hit, candidates: [] }
  }
  const candidates = await storeCandidates(deps.fetch, read, log)
  return { found: true, brand: report.brand, name: report.product_name, confidence: report.confidence, catalog: null, candidates }
}
