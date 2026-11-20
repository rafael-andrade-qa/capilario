// Coletor do catálogo: lê o catálogo público (API de busca VTEX) de uma loja, só no departamento
// indicado, e grava um JSON por linha com os campos que usamos. Respeita o robots.txt das lojas
// (a API não é bloqueada), faz poucas requisições por vez e se identifica sem dados pessoais.
//
// A API devolve no máximo 2.500 itens por consulta; quando um ramo passa disso, ele é dividido
// pelas subcategorias (descobertas nos próprios produtos) e, se ainda assim não couber, por marca.
//
// Uso: node scripts/catalog/vtex-harvest.mjs <host> <fq-raiz[,fq-raiz...]> <saida.jsonl>
//   ex.: node scripts/catalog/vtex-harvest.mjs www.epocacosmeticos.com.br C:/1000037/ /tmp/epoca.jsonl
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import https from 'node:https'
import zlib from 'node:zlib'

/** GET simples com node:https (o fetch do Node travava em respostas grandes comprimidas). */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': UA, accept: 'application/json', 'accept-encoding': 'gzip' }, timeout: 30000 }, (res) => {
      const enc = res.headers['content-encoding']
      const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : res
      const chunks = []
      stream.on('data', (c) => chunks.push(c))
      stream.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }))
      stream.on('error', reject)
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

const [host, rootFq, out] = process.argv.slice(2)
if (!host || !rootFq || !out) {
  console.error('uso: vtex-harvest.mjs <host> <fq-raiz> <saida.jsonl>')
  process.exit(1)
}

const UA = 'Mozilla/5.0 (compatible; ProjetoCapilar/1.0)'
const PAGE = 50
const MAX_WINDOW = 2500
const DELAY_MS = 350
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let requests = 0
async function get(params) {
  const url = `https://${host}/api/catalog_system/pub/products/search?${params}`
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(DELAY_MS * (attempt + 1))
    requests++
    try {
      const res = await httpGet(url)
      if (res.status === 429 || res.status >= 500) {
        await sleep(3000 * (attempt + 1))
        continue
      }
      const total = Number(String(res.headers['resources'] ?? '0/0').split('/')[1] ?? 0)
      const body = res.status >= 200 && res.status < 300 ? JSON.parse(res.text) : []
      return { total, items: Array.isArray(body) ? body : [] }
    } catch {
      await sleep(2000 * (attempt + 1))
    }
  }
  throw new Error(`falhou: ${url}`)
}

const seen = new Set()
if (existsSync(out)) for (const l of readFileSync(out, 'utf8').split('\n')) if (l) seen.add(JSON.parse(l).productId)
let saved = seen.size

function keep(p) {
  if (seen.has(p.productId)) return
  seen.add(p.productId)
  const items = (p.items ?? []).map((it) => ({
    ean: it.ean || null,
    size: it.name ?? null,
    image: it.images?.[0]?.imageUrl ?? null,
  }))
  const row = {
    store: host,
    productId: p.productId,
    name: p.productName,
    brand: p.brand,
    brandId: p.brandId,
    categories: p.categories,
    categoriesIds: p.categoriesIds,
    linkText: p.linkText,
    audience: p['Público'] ?? null,
    hairTypes: p['Tipos de Cabelos'] ?? null,
    line: p['Linha'] ?? null,
    items,
  }
  appendFileSync(out, JSON.stringify(row) + '\n')
  saved++
}

/** Varre uma consulta inteira (cabe na janela de 2.500). */
async function sweep(fq, total) {
  for (let from = 0; from < Math.min(total, MAX_WINDOW); from += PAGE) {
    const { items } = await get(`${fq}&_from=${from}&_to=${Math.min(from + PAGE, total) - 1}`)
    items.forEach(keep)
    if (!items.length) break
  }
}

/** Amostra (várias ordenações) para descobrir subcategorias e marcas de um ramo grande. */
async function sample(fq) {
  const cats = new Map()
  const brands = new Map()
  for (const order of ['OrderByNameASC', 'OrderByNameDESC', 'OrderByReleaseDateDESC', 'OrderByTopSaleDESC']) {
    for (let from = 0; from < MAX_WINDOW; from += PAGE) {
      const { items } = await get(`${fq}&O=${order}&_from=${from}&_to=${from + PAGE - 1}`)
      if (!items.length) break
      for (const p of items) {
        keep(p)
        for (const c of p.categoriesIds ?? []) cats.set(c, (cats.get(c) ?? 0) + 1)
        brands.set(p.brandId, (brands.get(p.brandId) ?? 0) + 1)
      }
    }
  }
  return { cats, brands }
}

const fqParam = (fq) => `fq=${encodeURIComponent(fq)}`

async function harvest(fq, depth = 0) {
  const { total } = await get(`${fq}&_from=0&_to=0`)
  const pad = '  '.repeat(depth)
  console.log(`${pad}${decodeURIComponent(fq)} total=${total} (salvos ${saved}, req ${requests})`)
  if (total <= MAX_WINDOW) return sweep(fq, total)

  const catFq = decodeURIComponent(fq).match(/C:(\/[\d/]+\/)/)?.[1]
  const { cats, brands } = await sample(fq)
  if (catFq) {
    const level = catFq.split('/').filter(Boolean).length
    const children = [...cats.keys()].filter((c) => c.startsWith(catFq) && c.split('/').filter(Boolean).length === level + 1)
    if (children.length > 1) {
      for (const c of children) await harvest(fqParam(`C:${c}`), depth + 1)
      return
    }
  }
  // Folha grande demais: divide por marca.
  for (const b of brands.keys()) await harvest(`${fq}&${fqParam(`B:${b}`)}`, depth + 1)
}

// Várias raízes separadas por vírgula (ex.: C:/1160/,C:/1161/).
for (const root of rootFq.split(",")) await harvest(fqParam(root.trim()))
console.log(`fim: ${saved} produtos, ${requests} requisições`)
