// Carrega o catálogo no Supabase: fotos no bucket público "catalog" e linhas em catalog_brands /
// catalog_products. Só entram produtos com foto pronta. Itens que saíram do catálogo são apagados
// (o histórico de ninguém muda: o produto guarda cópia de nome, marca e foto).
//
// Precisa da chave secreta (só no ambiente, nunca no repositório):
//   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/catalog/upload.mjs <catalogo.json> <pasta-fotos> [limite]
// Só alguns (ex.: os cadastrados à mão), sem apagar nada: ONLY=id1,id2 antes do comando.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'

const [catalogFile, photoDir, limitArg] = process.argv.slice(2)
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!catalogFile || !photoDir || !url || !key) {
  console.error('uso: SUPABASE_URL=... SUPABASE_SECRET_KEY=... upload.mjs <catalogo.json> <pasta-fotos> [limite]')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const raw = readFileSync(catalogFile)
const catalog = JSON.parse(catalogFile.endsWith('.gz') ? gunzipSync(raw) : raw)
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((s) => s.trim())) : null
let products = catalog.products.filter((p) => (!only || only.has(p.id)) && existsSync(`${photoDir}/${p.id}.webp`))
if (only && products.length !== only.size) throw new Error(`ONLY: ${only.size - products.length} id(s) sem produto ou sem foto`)
if (limitArg) products = products.sort((a, b) => b.popularity - a.popularity).slice(0, Number(limitArg))
const brandIds = new Set(products.map((p) => p.brand_id))
const counts = new Map()
for (const p of products) counts.set(p.brand_id, (counts.get(p.brand_id) ?? 0) + 1)
const brands = catalog.brands.filter((b) => brandIds.has(b.id)).map((b) => ({ ...b, product_count: only ? b.product_count : (counts.get(b.id) ?? 0) })) // com ONLY, a contagem do catálogo inteiro
console.log(`${products.length} produtos com foto, ${brands.length} marcas`)

// 1) Fotos (retoma pelo registro local do que já subiu para este destino).
const sentFile = `${photoDir}/_enviadas-${new URL(url).hostname}.json`
const sent = new Set(existsSync(sentFile) ? JSON.parse(readFileSync(sentFile, 'utf8')) : [])
const queue = products.filter((p) => !sent.has(p.id))
let n = 0
async function worker() {
  for (;;) {
    const p = queue.shift()
    if (!p) return
    const body = readFileSync(`${photoDir}/${p.id}.webp`)
    for (let attempt = 0; attempt < 4; attempt++) {
      const { error } = await db.storage.from('catalog').upload(`p/${p.id}.webp`, body, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
      if (!error) {
        sent.add(p.id)
        break
      }
      if (attempt === 3) console.error('foto falhou', p.id, error.message)
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    }
    if (++n % 500 === 0) {
      writeFileSync(sentFile, JSON.stringify([...sent]))
      console.log(`fotos: ${n}/${queue.length + n}`)
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker))
writeFileSync(sentFile, JSON.stringify([...sent]))
console.log(`fotos ok (${sent.size})`)

// 2) Marcas e produtos.
async function upsert(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}
await upsert('catalog_brands', brands)
await upsert(
  'catalog_products',
  products
    .filter((p) => sent.has(p.id))
    .map(({ brand: _brand, image_src: _src, image_bg: _bg, ...p }) => ({ ...p, image_path: `p/${p.id}.webp`, updated_at: new Date().toISOString() })),
)
console.log('linhas ok')

// 3) O que saiu do catálogo (não quando sobe só alguns).
if (only) {
  console.log(`fim: ${products.length} produto(s) enviados`)
  process.exit(0)
}
const keep = new Set(products.filter((p) => sent.has(p.id)).map((p) => p.id))
const stale = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('catalog_products').select('id').range(from, from + 999)
  if (error) throw error
  for (const r of data) if (!keep.has(r.id)) stale.push(r.id)
  if (data.length < 1000) break
}
for (let i = 0; i < stale.length; i += 200) {
  const ids = stale.slice(i, i + 200)
  await db.from('catalog_products').delete().in('id', ids)
  await db.storage.from('catalog').remove(ids.map((id) => `p/${id}.webp`))
}
const { data: allBrands, error: brandErr } = await db.from('catalog_brands').select('id').range(0, 9999)
if (brandErr) throw brandErr
const emptyBrands = allBrands.map((b) => b.id).filter((id) => !brandIds.has(id))
for (let i = 0; i < emptyBrands.length; i += 200) await db.from('catalog_brands').delete().in('id', emptyBrands.slice(i, i + 200))
console.log(`fim: ${keep.size} produtos, ${stale.length} removidos, ${emptyBrands.length} marcas vazias removidas`)
