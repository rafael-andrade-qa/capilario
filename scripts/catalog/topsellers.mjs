// Ranking de mais vendidos (ordem "OrderByTopSaleDESC" da própria loja), para o catálogo mostrar
// primeiro o que as pessoas mais usam. Grava { "<host>|<productId>": posição }.
//
// Uso: node scripts/catalog/topsellers.mjs <host> <fq[,fq...]> <saida.json>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import zlib from 'node:zlib'

const [host, roots, out] = process.argv.slice(2)
const UA = 'Mozilla/5.0 (compatible; ProjetoCapilar/1.0)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': UA, accept: 'application/json', 'accept-encoding': 'gzip' }, timeout: 30000 }, (res) => {
      const stream = res.headers['content-encoding'] === 'gzip' ? res.pipe(zlib.createGunzip()) : res
      const chunks = []
      stream.on('data', (c) => chunks.push(c))
      stream.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (e) {
          reject(e)
        }
      })
      stream.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

const ranks = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {}
for (const root of roots.split(',')) {
  let pos = 0
  for (let from = 0; from < 2500; from += 50) {
    await sleep(350)
    let items = []
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        items = await getJson(`https://${host}/api/catalog_system/pub/products/search?fq=${encodeURIComponent(root)}&O=OrderByTopSaleDESC&_from=${from}&_to=${from + 49}`)
        break
      } catch {
        await sleep(2000 * (attempt + 1))
      }
    }
    if (!Array.isArray(items) || !items.length) break
    for (const p of items) {
      const k = `${host}|${p.productId}`
      pos++
      if (!(k in ranks) || ranks[k] > pos) ranks[k] = pos
    }
  }
  console.log(`${root}: ${pos}`)
}
writeFileSync(out, JSON.stringify(ranks))
