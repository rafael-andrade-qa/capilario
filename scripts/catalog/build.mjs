// Monta o catálogo a partir das coletas (uma por loja, em ordem de preferência): filtra o que é
// de cabelo, classifica, limpa o nome, junta o mesmo produto de lojas diferentes (código de barras
// ou nome) e grava { brands, products } em JSON.
//
// Uso: node scripts/catalog/build.mjs <saida.json> <coleta1.jsonl> [coleta2.jsonl ...]
// Opcional: RANKS=ranks1.json,ranks2.json (posições de mais vendidos, ver topsellers.mjs).
import { readFileSync, writeFileSync } from 'node:fs'
import { CATEGORIES, audienceOf, brandDisplay, classify, cleanName, isHairProduct, mergeKey, plain, slug, vtexSized } from './normalize.mjs'

const [out, ...inputs] = process.argv.slice(2)
if (!out || !inputs.length) {
  console.error('uso: build.mjs <saida.json> <coleta.jsonl>...')
  process.exit(1)
}

// Marcas com nomes diferentes entre lojas (ou linha que a loja põe como marca).
const BRAND_ALIASES = {
  'lola from rio': 'lola cosmetics',
  lola: 'lola cosmetics',
  herbal: 'herbal essences',
  siage: 'eudora siage',
  'eudora siage': 'eudora siage',
  eudora: 'eudora siage',
  dercos: 'vichy',
  'loreal paris': "l'oreal paris",
  'l oreal paris': "l'oreal paris",
  'loreal professionnel': "l'oreal professionnel",
  'l oreal professionnel': "l'oreal professionnel",
  'k.pro': 'kpro',
  'k pro': 'kpro',
  'qod cosmetics': 'qod',
  'qod barber shop': 'qod',
  'bed head tigi': 'tigi',
  'bed head': 'tigi',
  'wella': 'wella professionals',
  'salonline': 'salon line',
  'kerastase': 'kerastase',
  'skala cosmeticos': 'skala',
  'novex': 'embelleze',
}
// Grafia preferida quando a das lojas não ajuda.
const BRAND_NAME = {
  'lola-cosmetics': 'Lola Cosmetics',
  'eudora-siage': 'Eudora Siàge',
  'l-oreal-paris': "L'Oréal Paris",
  'l-oreal-professionnel': "L'Oréal Professionnel",
  kpro: 'K.Pro',
  qod: 'QOD',
  kerastase: 'Kérastase',
  embelleze: 'Embelleze (Novex)',
}

// Palavras que não distinguem marca: "Alfaparf Milano" = "Alfaparf", "Truss Professional" = "Truss".
const KEY_NOISE = new Set(['cosmetics', 'cosmeticos', 'cosmetic', 'cosmetico', 'naturais', 'naturals', 'professional', 'professionals', 'profissional', 'milano', 'paris', 'brasil', 'brazil', 'hair', 'care', 'beauty', 'oficial', 'company', 'co', 'ltda', 'industria'])

const brandKeyOf = (brand) => {
  const p = plain(brand).replace(/[^a-z0-9.&' ]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (BRAND_ALIASES[p]) return slug(BRAND_ALIASES[p])
  const core = p.split(' ').filter((w) => !KEY_NOISE.has(w))
  const k = core.length ? core.join(' ') : p
  return slug(BRAND_ALIASES[k] ?? k)
}

// Mais vendidos: "<loja>|<productId>" -> posição (1 = mais vendido).
const ranks = {}
for (const file of (process.env.RANKS ?? '').split(',').filter(Boolean)) Object.assign(ranks, JSON.parse(readFileSync(file, 'utf8')))

const rows = []
inputs.forEach((file, priority) => {
  for (const line of readFileSync(file, 'utf8').split('\n')) if (line) rows.push({ ...JSON.parse(line), priority })
})

// Formas de escrever cada marca (para tirar do nome e escolher a grafia).
const brandForms = new Map()
for (const r of rows) {
  if (!r.brand) continue
  const k = brandKeyOf(r.brand)
  if (!brandForms.has(k)) brandForms.set(k, [])
  brandForms.get(k).push(r.brand.trim())
}

const products = new Map() // mergeKey -> produto
const byEan = new Map() // ean -> mergeKey
let dropped = 0

for (const r of rows) {
  if (!r.brand || !r.name || !isHairProduct(r.name, r.categories)) {
    dropped++
    continue
  }
  const brandKey = brandKeyOf(r.brand)
  const forms = [...new Set([...(brandForms.get(brandKey) ?? []), BRAND_ALIASES[plain(r.brand)] ?? ''])].filter(Boolean)
  const name = cleanName(r.name, r.brand, forms)
  const category = classify(name, r.categories ?? [])
  if (!category) {
    dropped++
    continue
  }
  const eans = (r.items ?? []).map((i) => i.ean).filter((e) => e && /^\d{8,14}$/.test(e))
  let key = mergeKey(brandKey, name)
  const viaEan = eans.map((e) => byEan.get(e)).find((k) => k && k.startsWith(`${brandKey}|`))
  if (!products.has(key) && viaEan) key = viaEan

  const image = (r.items ?? []).map((i) => i.image).find(Boolean)
  const p = products.get(key) ?? {
    key,
    brandKey,
    name,
    retail_name: r.name.replace(/\s+/g, ' ').trim(),
    category,
    audience: 'unissex',
    line: null,
    hair_types: new Set(),
    eans: new Set(),
    sizes: new Set(),
    image: null,
    imagePriority: 99,
    sources: new Set(),
    bestRank: Infinity,
    source: r.store,
    source_url: null,
    priority: r.priority,
  }
  // Loja preferida decide nome, tipo e fonte.
  if (r.priority < p.priority) {
    Object.assign(p, { name, retail_name: r.name.replace(/\s+/g, ' ').trim(), category, source: r.store, priority: r.priority })
  }
  const aud = audienceOf(r.name, r.audience, r.categories ?? [])
  if (aud !== 'unissex' && p.audience === 'unissex') p.audience = aud
  if (!p.line && Array.isArray(r.line) && r.line[0]) p.line = String(r.line[0]).trim()
  for (const h of r.hairTypes ?? []) p.hair_types.add(String(h).trim())
  for (const e of eans) {
    p.eans.add(e)
    if (!byEan.has(e)) byEan.set(e, key)
  }
  for (const i of r.items ?? []) {
    const size = String(i.size ?? '').match(/\d+(?:[.,]\d+)?\s?(?:ml|l|g|kg)\b/i)?.[0]
    if (size) p.sizes.add(size.replace(/\s/g, '').toLowerCase())
  }
  if (image && r.priority < p.imagePriority) {
    p.image = vtexSized(image)
    p.imagePriority = r.priority
    p.source_url = `https://${r.store}/${r.linkText}/p`
  }
  p.sources.add(r.store)
  const rank = ranks[`${r.store}|${r.productId}`]
  if (rank && rank < p.bestRank) p.bestRank = rank
  products.set(key, p)
}

// Ids estáveis e únicos: marca + nome.
const used = new Set()
const finalProducts = []
for (const p of products.values()) {
  if (!p.image) continue // sem foto não entra: a graça do catálogo é a foto pronta
  let id = `${p.brandKey}-${slug(p.name)}`.slice(0, 120).replace(/-+$/, '')
  for (let n = 2; used.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`
  used.add(id)
  const brand = BRAND_NAME[p.brandKey] ?? brandDisplay(brandForms.get(p.brandKey) ?? [p.brandKey])
  const search = plain([brand, p.name, p.line ?? '', CATEGORIES[p.category], p.retail_name, [...p.eans].join(' ')].join(' '))
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter(Boolean)
  finalProducts.push({
    id,
    brand_id: p.brandKey,
    brand,
    name: p.name,
    retail_name: p.retail_name,
    line: p.line,
    category: p.category,
    audience: p.audience,
    hair_types: [...p.hair_types].slice(0, 10),
    eans: [...p.eans].slice(0, 20),
    sizes: [...p.sizes].slice(0, 10),
    image_src: p.image,
    source: p.source,
    source_url: p.source_url,
    search_text: [...new Set(search)].join(' '),
    // Em mais lojas e mais vendido sobe na busca.
    popularity: p.sources.size * 500 + (Number.isFinite(p.bestRank) ? Math.max(0, 2501 - p.bestRank) : 0),
  })
}

const brands = new Map()
for (const p of finalProducts) {
  const b = brands.get(p.brand_id) ?? { id: p.brand_id, name: p.brand, product_count: 0, male: 0, female: 0 }
  b.product_count++
  if (p.audience === 'masculino') b.male++
  if (p.audience === 'feminino') b.female++
  brands.set(p.brand_id, b)
}
const brandRows = [...brands.values()].map((b) => ({
  id: b.id,
  name: b.name,
  audience:
    b.product_count >= 3 && b.male / b.product_count >= 0.6
      ? 'masculino'
      : b.product_count >= 3 && b.female / b.product_count >= 0.6
        ? 'feminino'
        : 'geral',
  product_count: b.product_count,
}))

// Marca masculina (ou feminina): os produtos dela entram no filtro mesmo sem a palavra no nome.
const brandAudience = new Map(brandRows.map((b) => [b.id, b.audience]))
for (const p of finalProducts) {
  const ba = brandAudience.get(p.brand_id)
  if (p.audience === 'unissex' && (ba === 'masculino' || ba === 'feminino')) p.audience = ba
}

writeFileSync(out, JSON.stringify({ brands: brandRows, products: finalProducts }))
const byCat = {}
for (const p of finalProducts) byCat[p.category] = (byCat[p.category] ?? 0) + 1
console.log(`linhas ${rows.length}, fora ${dropped}, produtos ${finalProducts.length}, marcas ${brandRows.length}`)
console.log('masculinos', finalProducts.filter((p) => p.audience === 'masculino').length, 'marcas masculinas', brandRows.filter((b) => b.audience === 'masculino').length)
console.log(Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '))
