// Função "analyze-finalization" (Supabase Edge Function, Deno).
// Recebe { finalization_id, images: [{ moment, angle, data }] } do app, com a sessão do usuário.
// Confere que a finalização é da pessoa, consome uma análise do dia, manda as fotos à IA e guarda
// a leitura em finalization_analyses (substitui a anterior). Tudo no banco acontece como o
// próprio usuário (RLS normal). A chave da Anthropic fica só nos segredos do Supabase.
//
// Segredos opcionais para testar custo × qualidade sem mexer no código:
//   ANALYZE_MODEL  (padrão claude-opus-5-5; ex.: claude-sonnet-5-5, claude-haiku-5-5)
//   ANALYZE_EFFORT (padrão medium; low | medium | high)
import Anthropic from '@anthropic-ai/sdk'
import {
  AnalyzeError,
  ANALYSIS_SCHEMA,
  SYSTEM_PROMPT,
  buildContent,
  costUsd,
  ownNotes,
  parseResult,
  validateInput,
  type AnalyzeInput,
  type Moment,
  type PastAnalysis,
  type Turn,
} from './core.ts'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}

/** Cabeçalhos para falar com o banco como o próprio usuário (o RLS vale normalmente). */
function userHeaders(req: Request): Record<string, string> | null {
  const auth = req.headers.get('authorization') ?? ''
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!auth.startsWith('Bearer ') || !apikey) return null
  return { authorization: auth, apikey, 'content-type': 'application/json' }
}

const rest = (path: string) => `${Deno.env.get('SUPABASE_URL')}/rest/v1/${path}`

async function getJson<T>(headers: Record<string, string>, path: string): Promise<T> {
  const res = await fetch(rest(path), { headers })
  if (res.status === 401 || res.status === 403) throw new HttpError(401, 'not_authenticated')
  if (!res.ok) throw new Error(`rest_${res.status}`)
  return (await res.json()) as T
}

class HttpError extends Error {
  status: number
  constructor(status: number, code: string) {
    super(code)
    this.status = status
  }
}

const WHEN = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const DAY = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })

interface StageRow {
  id: string
  stage_type: Moment
  captured_at: string
  notes: string | null
  experiment_id: string
  humidity: number | null
  temperature: number | null
}
interface ExperimentRow {
  product_mode: string
  product_name: string | null
  brand: string | null
}

/** "82% de umidade, 24°C" para a IA levar o clima em conta (frizz de dia úmido não é culpa do produto). */
function weatherOf(s: StageRow): string | null {
  if (s.humidity == null || s.temperature == null) return null
  return `${s.humidity}% de umidade, ${Math.round(Number(s.temperature))}°C`
}

function productOf(e: ExperimentRow | undefined): string {
  if (!e) return 'Produto não informado'
  if (e.product_mode === 'none') return 'Sem finalizador'
  if (e.product_mode === 'named' && e.product_name) return e.brand ? `${e.product_name} (${e.brand})` : e.product_name
  return 'Produto não informado'
}

/** Consome uma análise do dia; devolve quantas restam. */
async function consumeQuota(headers: Record<string, string>): Promise<number> {
  const res = await fetch(rest('rpc/consume_analyze_quota'), { method: 'POST', headers, body: '{}' })
  const body = await res.json().catch(() => ({}))
  if (res.ok) return typeof body === 'number' ? body : 0
  if (body?.message === 'analyze_limit' || body?.message === 'analyze_app_limit') throw new HttpError(429, body.message)
  if (res.status === 401 || res.status === 403 || body?.message === 'not_authenticated') throw new HttpError(401, 'not_authenticated')
  throw new Error(`quota_${res.status}`)
}

async function askClaude(apiKey: string, input: AnalyzeInput, content: unknown[]): Promise<{ turn: Turn; model: string }> {
  const client = new Anthropic({ apiKey, baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined, maxRetries: 0, timeout: 120_000 })
  const model = Deno.env.get('ANALYZE_MODEL') || 'claude-opus-5-5'
  const effort = Deno.env.get('ANALYZE_EFFORT') || 'medium'
  // Se a IA recusar por engano (filtro de segurança), a própria API tenta outro modelo.
  const fallback = /^claude-(opus-5-5|sonnet-5-5|fable-5-2)$/.test(model)
  // deno-lint-ignore no-explicit-any
  const params: any = {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
    output_config: { effort, format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
    ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  }
  // deno-lint-ignore no-explicit-any
  const turn: any = fallback ? await client.beta.messages.create(params) : await client.messages.create(params)
  const used = typeof turn.model === 'string' && turn.model ? turn.model : model
  console.log('analyze', `model=${used} effort=${effort} imgs=${input.images.length} in=${turn.usage?.input_tokens ?? 0} out=${turn.usage?.output_tokens ?? 0} stop=${turn.stop_reason}`)
  return { turn, model: used }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return reply(503, { error: 'not_configured' })
  const headers = userHeaders(req)
  if (!headers) return reply(401, { error: 'not_authenticated' })

  let input: AnalyzeInput
  try {
    input = validateInput(await req.json())
  } catch {
    return reply(400, { error: 'invalid_input' })
  }

  try {
    // A finalização precisa ser da pessoa (o RLS só devolve os momentos dela).
    const stages = await getJson<StageRow[]>(
      headers,
      `stages?finalization_id=eq.${input.finalization_id}&select=id,stage_type,captured_at,notes,experiment_id,humidity,temperature&order=captured_at`,
    )
    if (!stages.length) return reply(404, { error: 'not_found' })
    const [experiment] = await getJson<ExperimentRow[]>(headers, `experiments?id=eq.${stages[0].experiment_id}&select=product_mode,product_name,brand`)
    const past = await getJson<{ created_at: string; result: Record<string, unknown> }[]>(
      headers,
      `finalization_analyses?finalization_id=neq.${input.finalization_id}&select=created_at,result&order=created_at.desc&limit=8`,
    )
    const product = productOf(experiment)
    const present = new Set<Moment>(input.images.map((i) => i.moment))
    const content = buildContent(input.images, {
      product,
      moments: stages.map((s) => ({ moment: s.stage_type, when: WHEN.format(new Date(s.captured_at)), notes: ownNotes(s.notes), weather: weatherOf(s) })),
      past: past.map(
        (p): PastAnalysis => ({
          product: String(p.result.product ?? ''),
          when: DAY.format(new Date(p.created_at)),
          hair_type: String(p.result.hair_type ?? ''),
          scores: p.result.scores as PastAnalysis['scores'],
          summary: String(p.result.summary ?? ''),
        }),
      ),
    })

    const left = await consumeQuota(headers)
    const { turn, model } = await askClaude(apiKey, input, content)
    const result = parseResult(turn, product, present)
    const usage = { input_tokens: turn.usage?.input_tokens ?? 0, output_tokens: turn.usage?.output_tokens ?? 0, cost_usd: costUsd(model, turn.usage) }

    const save = await fetch(rest('finalization_analyses?on_conflict=finalization_id'), {
      method: 'POST',
      headers: { ...headers, prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ finalization_id: input.finalization_id, model, result, usage, notes_state: 'pending', created_at: new Date().toISOString() }),
    })
    if (!save.ok) throw new Error(`save_${save.status} ${await save.text()}`)
    const [row] = await save.json()
    return reply(200, { analysis: row, quota_left: left })
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.message })
    const code = e instanceof AnalyzeError ? e.code : 'ai_failed'
    console.error('analyze', code, (e as Error).message)
    return reply(code === 'invalid_input' ? 400 : 502, { error: code })
  }
})
