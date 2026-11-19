// Recupera arquivos órfãos: objetos do bucket que nunca foram associados a uma foto salva
// (ex.: a aba foi fechada no meio do envio). Roda na SUA máquina, nunca no app.
//
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SECRET_KEY=sb_secret_... node scripts/clean-orphans.mjs
//   ... node scripts/clean-orphans.mjs --apagar      # apaga de fato (padrão: só lista)
//
// Considera órfão só o que tem mais de 24 h, para não atrapalhar um envio em andamento.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SECRET_KEY (chave secreta: só no terminal, nunca no repositório).')
  process.exit(1)
}
const apply = process.argv.includes('--apagar')
const BUCKET = 'capilar-photos'
const cutoff = Date.now() - 24 * 60 * 60 * 1000
const sb = createClient(url, key, { auth: { persistSession: false } })

async function listAll(prefix) {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset })
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

const objects = []
for (const user of await listAll('')) {
  for (const stage of await listAll(user.name)) {
    for (const file of await listAll(`${user.name}/${stage.name}`)) {
      if (file.id) objects.push({ path: `${user.name}/${stage.name}/${file.name}`, created: Date.parse(file.created_at) })
    }
  }
}

const linked = new Set()
for (let i = 0; i < objects.length; i += 200) {
  const chunk = objects.slice(i, i + 200).map((o) => o.path)
  const { data, error } = await sb.from('photos').select('storage_path').in('storage_path', chunk)
  if (error) throw error
  for (const r of data) linked.add(r.storage_path)
}

const orphans = objects.filter((o) => !linked.has(o.path) && o.created < cutoff)
console.log(`${objects.length} objetos, ${linked.size} associados, ${orphans.length} órfãos com mais de 24 h.`)
for (const o of orphans) console.log('  ', o.path)
if (apply && orphans.length) {
  const { error } = await sb.storage.from(BUCKET).remove(orphans.map((o) => o.path))
  if (error) throw error
  console.log('Órfãos apagados.')
} else if (orphans.length) {
  console.log('Nada foi apagado. Rode com --apagar para remover.')
}
