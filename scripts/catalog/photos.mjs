// Fotos do catálogo "do nosso jeito": baixa a foto de vitrine de cada produto e passa por
// packshot.mjs (retrato 3:4 480x640, fundo branco, margem de 8%). Grava WebP pequeno, um por
// produto. Foto de estúdio com fundo colorido: o produto diz a cor em "image_bg".
// Retoma de onde parou (pula o que já existe).
//
// Uso: node scripts/catalog/photos.mjs <catalogo.json> <pasta-saida>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import { packshot } from './packshot.mjs'

const [catalogFile, outDir] = process.argv.slice(2)
if (!catalogFile || !outDir) {
  console.error('uso: photos.mjs <catalogo.json> <pasta-saida>')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const UA = 'Mozilla/5.0 (compatible; ProjetoCapilar/1.0)'
const CONCURRENCY = 6
const MAX_BYTES = 8 * 1024 * 1024

function download(url, hops = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': UA, accept: 'image/webp,image/jpeg,image/png,image/*' }, timeout: 20000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 3) {
        res.resume()
        resolve(download(new URL(res.headers.location, url).toString(), hops + 1))
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`http_${res.statusCode}`))
        return
      }
      const chunks = []
      let total = 0
      res.on('data', (c) => {
        total += c.length
        if (total > MAX_BYTES) req.destroy(new Error('too_big'))
        else chunks.push(c)
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

const { products } = JSON.parse(readFileSync(catalogFile, 'utf8'))
const queue = products.filter((p) => p.image_src && !existsSync(`${outDir}/${p.id}.webp`))
console.log(`${products.length} produtos, ${queue.length} fotos a fazer`)

let done = 0
let failed = 0
const failures = []
async function worker() {
  for (;;) {
    const p = queue.shift()
    if (!p) return
    try {
      const img = await download(p.image_src)
      const out = await packshot(img, { background: p.image_bg })
      writeFileSync(`${outDir}/${p.id}.webp`, out)
      done++
    } catch (e) {
      failed++
      failures.push({ id: p.id, error: e.message })
    }
    if ((done + failed) % 250 === 0) console.log(`feitas ${done}, falhas ${failed}, faltam ${queue.length}`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
writeFileSync(`${outDir}/_falhas.json`, JSON.stringify(failures, null, 1))
console.log(`fim: feitas ${done}, falhas ${failed}`)
