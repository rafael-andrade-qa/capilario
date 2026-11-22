// Núcleo de "Analisar finalização", sem nada específico do Deno: a IA chega como dependência,
// então os testes do app (vitest) exercitam o pedido, a leitura da resposta e o custo sem rede.
//
// O app manda as fotos já recortadas e reduzidas (768×1024, ~1.000 tokens cada); a função junta
// o contexto (produto, horários, observações da pessoa e análises anteriores) e pede à IA uma
// leitura em JSON (saída estruturada).

export const MOMENTS = ['wet', 'dry', 'next_day'] as const
export type Moment = (typeof MOMENTS)[number]
export const ANGLES = ['front', 'left', 'right', 'back'] as const
export type Angle = (typeof ANGLES)[number]

const MOMENT_LABEL: Record<Moment, string> = { wet: 'Molhado (logo depois de finalizar)', dry: 'Seco (no mesmo dia)', next_day: 'Dia seguinte' }
const ANGLE_LABEL: Record<Angle, string> = { front: 'frente', left: 'lado esquerdo', right: 'lado direito', back: 'trás' }

export const MAX_IMAGES = 16
export const MAX_IMAGE_BYTES = 1_500_000
/** Até onde vai uma observação sugerida (o campo aceita 4000; aqui é para ser curto). */
const MAX_NOTE = 420

export type AnalyzeErrorCode = 'invalid_input' | 'refused' | 'ai_failed'
export class AnalyzeError extends Error {
  code: AnalyzeErrorCode
  constructor(code: AnalyzeErrorCode, message: string = code) {
    super(message)
    this.code = code
  }
}

export interface InputImage {
  moment: Moment
  angle: Angle
  /** JPEG em base64. */
  data: string
}
export interface AnalyzeInput {
  finalization_id: string
  images: InputImage[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const B64 = /^[A-Za-z0-9+/]+={0,2}$/

export function validateInput(body: unknown): AnalyzeInput {
  const b = body as { finalization_id?: unknown; images?: unknown }
  if (!b || typeof b.finalization_id !== 'string' || !UUID.test(b.finalization_id)) throw new AnalyzeError('invalid_input')
  if (!Array.isArray(b.images) || b.images.length === 0 || b.images.length > MAX_IMAGES) throw new AnalyzeError('invalid_input')
  const images = b.images.map((raw) => {
    const i = raw as Partial<InputImage>
    if (!MOMENTS.includes(i.moment as Moment) || !ANGLES.includes(i.angle as Angle)) throw new AnalyzeError('invalid_input')
    if (typeof i.data !== 'string' || !i.data || !B64.test(i.data) || (i.data.length * 3) / 4 > MAX_IMAGE_BYTES) throw new AnalyzeError('invalid_input')
    return { moment: i.moment as Moment, angle: i.angle as Angle, data: i.data }
  })
  return { finalization_id: b.finalization_id, images }
}

// ---------- contexto ----------

export interface MomentContext {
  moment: Moment
  /** Horário já formatado (ex.: "20/11 14:53"). */
  when: string
  /** Observação da própria pessoa (sem a análise anterior da IA). */
  notes: string | null
}
export interface PastAnalysis {
  product: string
  when: string
  hair_type: string
  scores: Scores
  summary: string
}
export interface AnalyzeContext {
  /** "Nome do produto (Marca)" ou "Sem finalizador". */
  product: string
  moments: MomentContext[]
  past: PastAnalysis[]
}

/** Marca que separa o texto da pessoa da análise da IA dentro da observação. */
export const ANALYSIS_MARK = 'Análise: '

/** Só o que a pessoa escreveu (tira a análise da IA, que fica no fim, depois de "Análise: "). */
export function ownNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  const i = notes.startsWith(ANALYSIS_MARK) ? 0 : notes.indexOf(`\n\n${ANALYSIS_MARK}`)
  const own = (i < 0 ? notes : notes.slice(0, i)).trim()
  return own || null
}

export const SYSTEM_PROMPT = `Você analisa fotos de cabelo com o olhar de um barbeiro especialista em cabelos ondulados e cacheados, com noção de tricologia. É para um diário pessoal em que a pessoa testa produtos de finalização (cremes, gelatinas, geleias, mousses) e fotografa o resultado: molhado logo depois de finalizar, seco no mesmo dia e no dia seguinte, de frente, dos lados e de trás.

Escreva em português do Brasil, direto e concreto, como um profissional falando com o cliente. Use o vocabulário do meio: ondulado/cacheado com a classificação 2A–4C, definição, mechas agrupadas, frizz (em halo, no topo, na coroa), volume, brilho, casca do gel, ressecamento, porosidade das pontas, dia 2.

Como avaliar:
- Classifique o tipo de cabelo pelo que as fotos mostram (padrão natural); se com fixação ele fecha mais, diga em "tendency" (ex.: "tende a 2C/3A"); senão deixe vazio.
- traits: até 4 características curtas e úteis (ex.: "pontas porosas", "fio médio", "boa densidade").
- scores de 0 a 10, comparáveis entre produtos:
  definition = quanto as ondas/cachos ficam marcados e agrupados no seco;
  frizz_control = 10 é sem frizz;
  volume = 10 é muito volume (não é bom nem ruim, só intensidade);
  day2 = quanto a finalização segura no dia seguinte (use -1 se não houver fotos do dia seguinte).
- summary: 1 a 2 frases sobre o produto nesta finalização; se houver análises anteriores, compare com elas pelo nome do produto.
- notes: uma observação por momento que tem fotos (2 a 3 frases curtas, até ~300 caracteres), no estilo de anotação de diário. Não repita o nome do produto. Para momento sem fotos, texto vazio.
- Leve em conta as observações que a própria pessoa escreveu (rotina, sensação ao toque), sem repeti-las.
- Seja honesto: se a foto não permite avaliar algo (luz, ângulo, cabelo escondido), diga isso em vez de inventar.
- Couro cabeludo: só comente se algo estiver claramente visível, em tom neutro e sem diagnóstico (ex.: "vale acompanhar"). Você não é médico.`

/** Formato da resposta (saída estruturada: a API garante JSON válido neste formato). */
export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    hair_type: { type: 'string' },
    tendency: { type: 'string' },
    traits: { type: 'array', items: { type: 'string' } },
    scores: {
      type: 'object',
      properties: {
        definition: { type: 'integer' },
        frizz_control: { type: 'integer' },
        volume: { type: 'integer' },
        day2: { type: 'integer' },
      },
      required: ['definition', 'frizz_control', 'volume', 'day2'],
      additionalProperties: false,
    },
    summary: { type: 'string' },
    notes: {
      type: 'object',
      properties: { wet: { type: 'string' }, dry: { type: 'string' }, next_day: { type: 'string' } },
      required: ['wet', 'dry', 'next_day'],
      additionalProperties: false,
    },
  },
  required: ['hair_type', 'tendency', 'traits', 'scores', 'summary', 'notes'],
  additionalProperties: false,
} as const

export interface Scores {
  definition: number
  frizz_control: number
  volume: number
  /** null quando não há dia seguinte. */
  day2: number | null
}
export interface AnalysisResult {
  product: string
  hair_type: string
  tendency: string
  traits: string[]
  scores: Scores
  summary: string
  notes: Record<Moment, string>
}

function scoreLine(s: Scores): string {
  return `definição ${s.definition}, controle do frizz ${s.frizz_control}, volume ${s.volume}, dia 2 ${s.day2 ?? 'sem fotos'}`
}

/** Conteúdo da mensagem: contexto em texto e cada foto com o rótulo antes dela. */
export function buildContent(images: InputImage[], ctx: AnalyzeContext): unknown[] {
  const lines = [`Produto desta finalização: ${ctx.product}.`]
  for (const m of MOMENTS) {
    const mc = ctx.moments.find((x) => x.moment === m)
    const n = images.filter((i) => i.moment === m).length
    if (!mc && !n) continue
    lines.push(`- ${MOMENT_LABEL[m]}${mc ? `, ${mc.when}` : ''}: ${n} foto(s).${mc?.notes ? ` Observação da pessoa: "${mc.notes}"` : ''}`)
  }
  if (ctx.past.length) {
    lines.push('', 'Análises anteriores (outras finalizações), para comparar:')
    for (const p of ctx.past) lines.push(`- ${p.product} (${p.when}): ${p.hair_type}; ${scoreLine(p.scores)}. ${p.summary}`)
  }
  const content: unknown[] = [{ type: 'text', text: lines.join('\n') }]
  const ordered = [...images].sort((a, b) => MOMENTS.indexOf(a.moment) - MOMENTS.indexOf(b.moment) || ANGLES.indexOf(a.angle) - ANGLES.indexOf(b.angle))
  for (const img of ordered) {
    content.push({ type: 'text', text: `${MOMENT_LABEL[img.moment]} · ${ANGLE_LABEL[img.angle]}:` })
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.data } })
  }
  content.push({ type: 'text', text: 'Analise esta finalização e responda no formato pedido.' })
  return content
}

// ---------- resposta ----------

export interface Usage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}
export interface Turn {
  model?: string
  stop_reason: string | null
  content: { type: string; text?: string }[]
  usage?: Usage
}

const clamp = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0)
const text = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, max) : '')

/** Lê e limpa a resposta. Momentos sem fotos ficam sem observação; sem dia seguinte, day2 = null. */
export function parseResult(turn: Turn, product: string, present: Set<Moment>): AnalysisResult {
  if (turn.stop_reason === 'refusal') throw new AnalyzeError('refused')
  const block = turn.content.find((b) => b.type === 'text' && b.text)
  if (!block?.text) throw new AnalyzeError('ai_failed', `sem texto (stop=${turn.stop_reason})`)
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(block.text)
  } catch {
    throw new AnalyzeError('ai_failed', 'json inválido')
  }
  const s = (raw.scores ?? {}) as Record<string, unknown>
  const n = (raw.notes ?? {}) as Record<string, unknown>
  const hair = text(raw.hair_type, 60)
  if (!hair) throw new AnalyzeError('ai_failed', 'sem tipo de cabelo')
  const day2 = present.has('next_day') && typeof s.day2 === 'number' && s.day2 >= 0 ? clamp(s.day2) : null
  return {
    product,
    hair_type: hair,
    tendency: text(raw.tendency, 60),
    traits: (Array.isArray(raw.traits) ? raw.traits : []).map((t) => text(t, 40)).filter(Boolean).slice(0, 4),
    scores: { definition: clamp(s.definition), frizz_control: clamp(s.frizz_control), volume: clamp(s.volume), day2 },
    summary: text(raw.summary, 400),
    notes: {
      wet: present.has('wet') ? text(n.wet, MAX_NOTE) : '',
      dry: present.has('dry') ? text(n.dry, MAX_NOTE) : '',
      next_day: present.has('next_day') ? text(n.next_day, MAX_NOTE) : '',
    },
  }
}

// ---------- custo ----------

/** Preço por milhão de tokens (US$), da tabela oficial; o cache lê a 10% e grava a 125% da entrada. */
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-fable-5-2': { input: 8, output: 40 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
}

/** Custo da chamada em dólares (null se o modelo não estiver na tabela). */
export function costUsd(model: string, u: Usage | undefined): number | null {
  const p = PRICES[model]
  if (!p || !u) return null
  const input = (u.input_tokens ?? 0) + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0)
  const cost = (input * p.input + (u.output_tokens ?? 0) * p.output) / 1_000_000
  return Math.round(cost * 100_000) / 100_000
}
