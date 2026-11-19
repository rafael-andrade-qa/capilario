// Tipos e rótulos do domínio. Valores em inglês no banco, rótulos em pt-BR na interface.

export const ANGLES = ['front', 'left', 'right', 'back'] as const
export type Angle = (typeof ANGLES)[number]

export const ANGLE_LABEL: Record<Angle, string> = {
  front: 'Frente',
  left: 'Esquerdo',
  right: 'Direito',
  back: 'Costas',
}

export const STAGE_TYPES = ['wet', 'dry', 'next_day'] as const
export type StageType = (typeof STAGE_TYPES)[number]

export const STAGE_LABEL: Record<StageType, string> = {
  wet: 'Molhado',
  dry: 'Seco',
  next_day: 'Dia seguinte',
}

export type ProductMode = 'unspecified' | 'none' | 'named'

export interface Photo {
  id: string
  stage_id: string
  angle: Angle
  storage_path: string
  mime_type: string
  created_at: string
}

export interface Stage {
  id: string
  experiment_id: string
  stage_type: StageType
  captured_at: string
  notes: string | null
  is_favorite: boolean
  created_at: string
  photos: Photo[]
}

export interface Experiment {
  id: string
  product_mode: ProductMode
  product_name: string | null
  /** Marca (opcional, só com produto nomeado). Aparece discreta, abaixo do nome. */
  brand: string | null
  /** Foto da embalagem (opcional), usada como miniatura do produto no histórico. */
  photo_path: string | null
  created_at: string
  stages: Stage[]
}

export function productLabel(e: Pick<Experiment, 'product_mode' | 'product_name'>): string {
  if (e.product_mode === 'none') return 'Sem finalizador'
  if (e.product_mode === 'named' && e.product_name) return e.product_name
  return 'Produto não informado'
}

/** Marca para exibir abaixo do nome (null quando não há). */
export function brandLabel(e: Pick<Experiment, 'product_mode' | 'brand'>): string | null {
  return e.product_mode === 'named' && e.brand ? e.brand : null
}

/** Nome completo para textos de acessibilidade e confirmações: "Produto (Marca)". */
export function productFullLabel(e: Pick<Experiment, 'product_mode' | 'product_name' | 'brand'>): string {
  const brand = brandLabel(e)
  return brand ? `${productLabel(e)} (${brand})` : productLabel(e)
}

export interface ProductForm {
  product_mode: ProductMode
  product_name: string | null
  brand: string | null
}

/**
 * Deriva o produto a partir do formulário: "Sem finalizador" marcado vence (e ignora nome e marca);
 * texto em branco = não informado. O formulário exige nome ou "Sem finalizador" antes de salvar.
 */
export function productFromForm(noFinisher: boolean, name: string, brand = ''): ProductForm {
  if (noFinisher) return { product_mode: 'none', product_name: null, brand: null }
  const trimmed = name.trim()
  if (trimmed) return { product_mode: 'named', product_name: trimmed, brand: brand.trim() || null }
  return { product_mode: 'unspecified', product_name: null, brand: null }
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}
export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} às ${formatTime(iso)}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Data curta: 19/11 no ano corrente, 19/11/2025 nos outros. */
export function formatShortDate(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const base = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`
  return d.getFullYear() === now.getFullYear() ? base : `${base}/${d.getFullYear()}`
}

/** Data e hora curtas: 19/11 08:57. */
export function formatShortDateTime(iso: string, now = new Date()): string {
  return `${formatShortDate(iso, now)} ${formatTime(iso)}`
}

/** Intervalo compacto: 19/11, 18–19/11 (mesmo mês) ou 30/10 – 02/11. */
export function formatDateRange(fromIso: string, toIso: string, now = new Date()): string {
  const a = formatShortDate(fromIso, now)
  const b = formatShortDate(toIso, now)
  if (a === b) return a
  const da = new Date(fromIso)
  const db = new Date(toIso)
  if (da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth()) {
    return `${pad2(da.getDate())}–${b}`
  }
  return `${a} – ${b}`
}

/** Valor para <input type="datetime-local"> no fuso local do aparelho. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Converte o valor do datetime-local (horário local) para ISO com fuso (UTC). */
export function localInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const ts = (iso: string) => Date.parse(iso)

/** Etapas publicadas = etapas com pelo menos uma foto confirmada. */
export function publishedStages(e: Experiment): Stage[] {
  return e.stages
    .filter((s) => s.photos.length > 0)
    .sort((a, b) => ts(a.captured_at) - ts(b.captured_at) || ts(a.created_at) - ts(b.created_at))
}

/** Experimentos com etapas publicadas, do mais recente (última etapa) para o mais antigo. */
export function sortHistory(experiments: Experiment[]): Experiment[] {
  const latest = (e: Experiment) => {
    const st = publishedStages(e)
    return st.length ? ts(st[st.length - 1].captured_at) : 0
  }
  return experiments
    .filter((e) => publishedStages(e).length > 0)
    .sort((a, b) => latest(b) - latest(a) || ts(b.created_at) - ts(a.created_at))
}

/**
 * Rótulo de seleção de etapa (o tipo já aparece no grupo): data e produto.
 * O horário só entra quando é preciso desempatar (mesmo dia, mesmo produto).
 */
export function stageOptionLabel(stage: Stage, experiment: Experiment, now = new Date(), withTime = false): string {
  const when = withTime ? formatShortDateTime(stage.captured_at, now) : formatShortDate(stage.captured_at, now)
  return `${when} · ${productLabel(experiment)}`
}

export function photoByAngle(stage: Pick<Stage, 'photos'>, angle: Angle): Photo | undefined {
  return stage.photos.find((p) => p.angle === angle)
}

export function missingAngles(stage: Pick<Stage, 'photos'>): Angle[] {
  return ANGLES.filter((a) => !photoByAngle(stage, a))
}
