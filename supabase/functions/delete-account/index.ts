// Função "delete-account" (Supabase Edge Function, Deno): exclui a conta de quem chama.
// Confere a sessão, apaga os arquivos da pessoa no armazenamento (tudo fica em <id>/…) e depois
// o usuário. O banco apaga o resto em cascata (produtos, finalizações, fotos, rotinas, análises,
// cotas). O app confere a senha antes de chamar. A chave de serviço fica só aqui no servidor.
const BUCKET = 'capilar-photos'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}

const base = () => Deno.env.get('SUPABASE_URL') ?? ''

/** Chave de serviço: a nova (sb_secret_…) se houver; senão a antiga (JWT). */
function serviceHeaders(): Record<string, string> {
  let key = ''
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    key = keys.default ?? Object.values(keys)[0] ?? ''
  } catch {
    key = ''
  }
  if (!key) key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!key) throw new Error('sem chave de serviço')
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` }
}

/** Quem está chamando (pela sessão do app). */
async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? ''
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!auth.startsWith('Bearer ') || !apikey) return null
  const res = await fetch(`${base()}/auth/v1/user`, { headers: { authorization: auth, apikey } })
  if (!res.ok) return null
  const user = (await res.json()) as { id?: string }
  return typeof user.id === 'string' ? user.id : null
}

/** Todos os arquivos debaixo de uma pasta (as pastas vêm sem id e são abertas também). */
async function listAll(headers: Record<string, string>, prefix: string): Promise<string[]> {
  const out: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${base()}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!res.ok) throw new Error(`list_${res.status}`)
    const items = (await res.json()) as { name: string; id: string | null }[]
    for (const it of items) {
      const path = `${prefix}${it.name}`
      if (it.id) out.push(path)
      else out.push(...(await listAll(headers, `${path}/`)))
    }
    if (items.length < 1000) return out
  }
}

async function removeFiles(headers: Record<string, string>, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const res = await fetch(`${base()}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }),
    })
    if (!res.ok) throw new Error(`remove_${res.status}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  try {
    const id = await callerId(req)
    if (!id) return reply(401, { error: 'not_authenticated' })
    const headers = serviceHeaders()
    const files = await listAll(headers, `${id}/`)
    await removeFiles(headers, files)
    const res = await fetch(`${base()}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers })
    if (!res.ok) throw new Error(`delete_user_${res.status} ${await res.text()}`)
    console.log('delete-account', `files=${files.length}`)
    return reply(200, { deleted: true, files: files.length })
  } catch (e) {
    console.error('delete-account', (e as Error).message)
    return reply(500, { error: 'delete_failed' })
  }
})
