// Função "identify-product" (Supabase Edge Function, Deno).
// Recebe { image: base64, mime } do app, com a sessão do usuário, e devolve nome, marca e
// até 3 fotos oficiais. A chave da Anthropic fica só aqui, nos segredos do Supabase
// (ANTHROPIC_API_KEY); nunca vai para o app.
import Anthropic from '@anthropic-ai/sdk'
import { IdentifyError, REPORT_TOOL, SYSTEM_PROMPT, identify, validateInput, type Sender } from './core.ts'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}

/** Consome uma identificação do dia em nome do usuário (o próprio RPC confere a sessão). */
async function consumeQuota(req: Request): Promise<'ok' | 'unauthenticated' | 'limit'> {
  const auth = req.headers.get('authorization') ?? ''
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!auth.startsWith('Bearer ') || !apikey) return 'unauthenticated'
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/consume_identify_quota`, {
    method: 'POST',
    headers: { authorization: auth, apikey, 'content-type': 'application/json' },
    body: '{}',
  })
  if (res.ok) {
    await res.body?.cancel()
    return 'ok'
  }
  const body = await res.json().catch(() => ({}))
  if (body?.message === 'identify_limit') return 'limit'
  if (res.status === 401 || res.status === 403 || body?.message === 'not_authenticated') return 'unauthenticated'
  throw new Error(`quota_${res.status}`)
}

function makeSender(apiKey: string): Sender {
  const client = new Anthropic({ apiKey, baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined, maxRetries: 1, timeout: 50_000 })
  const model = Deno.env.get('IDENTIFY_MODEL') || 'claude-opus-5-5'
  const haiku = model.startsWith('claude-haiku')
  const webSearch = {
    type: haiku ? 'web_search_20250305' : 'web_search_20260209',
    name: 'web_search',
    max_uses: 3,
    user_location: { type: 'approximate', country: 'BR', timezone: 'America/Sao_Paulo' },
  }
  return async (messages) => {
    // deno-lint-ignore no-explicit-any
    const params: any = {
      model,
      max_tokens: 4096,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      tools: [webSearch, REPORT_TOOL],
      tool_choice: { type: 'auto' },
      messages,
      // Se a IA recusar por engano, a própria API tenta outro modelo (não existe para o Haiku).
      ...(haiku ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
    }
    const res = haiku ? await client.messages.create(params) : await client.beta.messages.create(params)
    // deno-lint-ignore no-explicit-any
    return res as any
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return reply(503, { error: 'not_configured' })

  let input: { image: string; mime: 'image/jpeg' | 'image/png' | 'image/webp' }
  try {
    input = validateInput(await req.json())
  } catch {
    return reply(400, { error: 'invalid_image' })
  }

  try {
    const quota = await consumeQuota(req)
    if (quota === 'unauthenticated') return reply(401, { error: 'not_authenticated' })
    if (quota === 'limit') return reply(429, { error: 'identify_limit' })
  } catch (e) {
    console.error('quota', (e as Error).message)
    return reply(500, { error: 'server_error' })
  }

  try {
    const result = await identify(input, {
      send: makeSender(apiKey),
      fetch: (url, init) => fetch(url, init),
      log: (m) => console.log('identify', m),
    })
    return reply(200, result)
  } catch (e) {
    const code = e instanceof IdentifyError ? e.code : 'ai_failed'
    console.error('identify', code, (e as Error).message)
    return reply(code === 'invalid_image' ? 400 : 502, { error: code })
  }
})
