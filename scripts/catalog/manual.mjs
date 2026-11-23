// Produtos cadastrados à mão (data/manual.json): marcas que não estão nas lojas coletadas, com
// foto e dados do site oficial. Entram no catálogo pelo build.mjs (toda vez que ele roda) ou
// direto num catálogo pronto:
//
//   node scripts/catalog/manual.mjs <catalogo.json|.json.gz>
//
// Depois: photos.mjs para as fotos e upload.mjs com ONLY=<ids> para subir só esses.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { CATEGORIES, plain } from './normalize.mjs'

const MANUAL = fileURLToPath(new URL('./data/manual.json', import.meta.url))

/** Texto de busca igual ao do build.mjs: marca, nome, linha, tipo, nome da loja e códigos. */
export function searchText(p, brandName) {
  const words = plain([brandName, p.name, p.line ?? '', CATEGORIES[p.category], p.retail_name, p.eans.join(' ')].join(' '))
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter(Boolean)
  return [...new Set(words)].join(' ')
}

/** Junta os produtos à mão num catálogo { brands, products } (o da mão vence no mesmo id). */
export function withManual(catalog, manual = JSON.parse(readFileSync(MANUAL, 'utf8'))) {
  const names = new Map([...catalog.brands, ...manual.brands].map((b) => [b.id, b.name]))
  for (const p of manual.products) {
    if (!CATEGORIES[p.category]) throw new Error(`${p.id}: tipo desconhecido ${p.category}`)
    if (!names.has(p.brand_id)) throw new Error(`${p.id}: marca ${p.brand_id} não está em brands`)
  }
  const ids = new Set(manual.products.map((p) => p.id))
  const products = [
    ...catalog.products.filter((p) => !ids.has(p.id)),
    ...manual.products.map((p) => ({ ...p, brand: names.get(p.brand_id), search_text: searchText(p, names.get(p.brand_id)) })),
  ]
  const brands = new Map(catalog.brands.map((b) => [b.id, b]))
  for (const b of manual.brands) brands.set(b.id, { ...brands.get(b.id), ...b })
  const counts = new Map()
  for (const p of products) counts.set(p.brand_id, (counts.get(p.brand_id) ?? 0) + 1)
  return {
    brands: [...brands.values()].filter((b) => counts.has(b.id)).map((b) => ({ ...b, product_count: counts.get(b.id) })),
    products,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2]
  if (!file) {
    console.error('uso: manual.mjs <catalogo.json|.json.gz>')
    process.exit(1)
  }
  const gz = file.endsWith('.gz')
  const raw = readFileSync(file)
  const out = withManual(JSON.parse(gz ? gunzipSync(raw) : raw))
  const json = JSON.stringify(out)
  writeFileSync(file, gz ? gzipSync(json, { level: 9 }) : json)
  console.log(`${out.products.length} produtos, ${out.brands.length} marcas`)
}
