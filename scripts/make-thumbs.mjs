// Gera as miniaturas que faltam (<foto>_t.jpg, 720 px no lado maior) para fotos enviadas antes de o
// app criar miniaturas. Roda na SUA máquina, nunca no app. As fotos passam só pela memória.
//
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SECRET_KEY=sb_secret_... node scripts/make-thumbs.mjs
//   ... node scripts/make-thumbs.mjs --gravar     # envia de fato (padrão: só lista o que falta)
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SECRET_KEY (chave secreta: só no terminal, nunca no repositório).')
  process.exit(1)
}
const apply = process.argv.includes('--gravar')
const BUCKET = 'capilar-photos'
const THUMB_SIDE = 720 // igual a src/lib/images.ts
const thumbPath = (p) => p.replace(/\.[a-z0-9]+$/i, '') + '_t.jpg'
const sb = createClient(url, key, { auth: { persistSession: false } })

async function all(table, column) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(column).not(column, 'is', null).range(from, from + 999)
    if (error) throw error
    out.push(...data.map((r) => r[column]))
    if (data.length < 1000) return out
  }
}

// Arquivos que existem em cada pasta (para não refazer miniatura que já está lá).
const listed = new Map()
async function exists(path) {
  const dir = path.slice(0, path.lastIndexOf('/'))
  if (!listed.has(dir)) {
    const names = new Set()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb.storage.from(BUCKET).list(dir, { limit: 1000, offset })
      if (error) throw error
      for (const f of data) names.add(f.name)
      if (data.length < 1000) break
    }
    listed.set(dir, names)
  }
  return listed.get(dir).has(path.slice(dir.length + 1))
}

const photos = [...(await all('photos', 'storage_path')), ...(await all('experiments', 'photo_path'))]
const todo = []
for (const p of photos) if (!(await exists(thumbPath(p)))) todo.push(p)
console.log(`${photos.length} fotos, ${photos.length - todo.length} com miniatura, ${todo.length} sem.`)

if (!apply) {
  if (todo.length) console.log('Nada foi enviado. Rode com --gravar para gerar as miniaturas.')
  process.exit(0)
}

let done = 0
let bytes = 0
for (const p of todo) {
  const { data, error } = await sb.storage.from(BUCKET).download(p)
  if (error) {
    console.log('  falhou ao baixar:', p, error.message)
    continue
  }
  // rotate(): aplica a orientação gravada pela câmera, como o navegador faz ao mostrar a foto.
  const thumb = await sharp(Buffer.from(await data.arrayBuffer()))
    .rotate()
    .resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer()
  const up = await sb.storage.from(BUCKET).upload(thumbPath(p), thumb, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' })
  if (up.error && !/exists|duplicate/i.test(up.error.message)) {
    console.log('  falhou ao enviar:', thumbPath(p), up.error.message)
    continue
  }
  done++
  bytes += thumb.length
}
console.log(`${done} miniaturas geradas (média de ${Math.round(bytes / Math.max(1, done) / 1024)} KB).`)
