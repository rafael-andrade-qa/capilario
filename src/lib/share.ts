// Enviar em PDF: textos prontos (mensagem que acompanha o arquivo e nome do arquivo) e o
// compartilhamento do aparelho. Os textos são funções puras (testadas em share.test.ts).
import { STAGE_TYPES, brandLabel, productLabel, type Experiment, type Finalization, type Stage, type StageType } from './domain'

export interface MomentInfo {
  productName: string
  brand: string | null
  noFinisher: boolean
  stageType: StageType
  capturedAt: string
  notes?: string | null
}

export function momentInfo(experiment: Experiment, stage: Stage): MomentInfo {
  return {
    productName: productLabel(experiment),
    brand: brandLabel(experiment) || null,
    noFinisher: experiment.product_mode === 'none',
    stageType: stage.stage_type,
    capturedAt: stage.captured_at,
    notes: stage.notes,
  }
}

/** "Gelatina Supervolume · Widi Care" (título do PDF). */
export function productTitle(experiment: Experiment): string {
  const brand = brandLabel(experiment)
  return brand ? `${productLabel(experiment)} · ${brand}` : productLabel(experiment)
}

const MOMENT_WORD: Record<StageType, string> = { wet: 'molhado', dry: 'seco', next_day: 'no dia seguinte' }

const pad = (n: number) => String(n).padStart(2, '0')

/** "19/11 às 10:23" no horário do aparelho. */
export function whenText(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "com Gelatina Supervolume (Widi Care)" ou "sem finalizador". */
export function productPhrase(m: MomentInfo): string {
  if (m.noFinisher) return 'sem finalizador'
  return `com ${m.productName}${m.brand ? ` (${m.brand})` : ''}`
}

/** Mensagem pronta para mandar junto com o PDF de um momento. */
export function momentMessage(m: MomentInfo): string {
  const notes = m.notes?.trim()
  return [
    `Olha como ficou meu cabelo ${MOMENT_WORD[m.stageType]}, ${productPhrase(m)}, em ${whenText(m.capturedAt)}.`,
    notes ? `Minha observação: ${notes}` : null,
    'As fotos estão no PDF.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Mensagem pronta para mandar junto com o PDF do comparativo. */
export function compareMessage(a: MomentInfo, b: MomentInfo): string {
  return [
    `Comparando meu cabelo ${MOMENT_WORD[a.stageType]}:`,
    `• à esquerda, ${productPhrase(a)}, em ${whenText(a.capturedAt)};`,
    `• à direita, ${productPhrase(b)}, em ${whenText(b.capturedAt)}.`,
    '',
    'As fotos estão lado a lado no PDF.',
  ].join('\n')
}

export interface FinalizationInfo {
  productName: string
  brand: string | null
  noFinisher: boolean
  /** Momentos registrados, na ordem molhado → seco → dia seguinte. */
  moments: { stageType: StageType; capturedAt: string; notes?: string | null }[]
}

export function finalizationInfo(experiment: Experiment, f: Pick<Finalization, 'moments'>): FinalizationInfo {
  const base = momentInfo(experiment, { stage_type: 'wet', captured_at: '', notes: null } as Stage)
  return {
    productName: base.productName,
    brand: base.brand,
    noFinisher: base.noFinisher,
    moments: STAGE_TYPES.flatMap((t) => {
      const s = f.moments[t]
      return s ? [{ stageType: t, capturedAt: s.captured_at, notes: s.notes }] : []
    }),
  }
}

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString()
const timeOnly = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Mensagem pronta para o PDF da finalização inteira (a evolução do cabelo). */
export function finalizationMessage(f: FinalizationInfo): string {
  const start = f.moments[0]?.capturedAt
  if (!start) return ''
  const product = productPhrase({ ...f, stageType: 'wet', capturedAt: start })
  const lines = f.moments.map((m, i) => {
    const when = sameDay(m.capturedAt, start) ? `às ${timeOnly(m.capturedAt)}` : `em ${whenText(m.capturedAt)}`
    const word = m.stageType === 'next_day' ? 'no dia seguinte,' : MOMENT_WORD[m.stageType]
    return `• ${word} ${when}${i === f.moments.length - 1 ? '.' : ';'}`
  })
  const notes = f.moments.some((m) => m.notes?.trim())
  return [
    `Olha como meu cabelo evoluiu ${product}, na finalização de ${whenText(start).split(' às ')[0]}:`,
    ...lines,
    '',
    notes ? 'As fotos estão lado a lado no PDF, com as minhas observações.' : 'As fotos estão lado a lado no PDF.',
  ].join('\n')
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')

const day = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}`
}

const productSlug = (m: MomentInfo) => (m.noFinisher ? 'sem-finalizador' : slug(m.productName))

/** capilar-seco-19-11-gelatina-supervolume.pdf */
export function momentFileName(m: MomentInfo): string {
  return `capilar-${slug(MOMENT_WORD[m.stageType].replace(/^no /, ''))}-${day(m.capturedAt)}-${productSlug(m)}.pdf`
}

/** capilar-comparativo-seco-18-11-x-19-11.pdf */
export function compareFileName(a: MomentInfo, b: MomentInfo): string {
  return `capilar-comparativo-${slug(MOMENT_WORD[a.stageType].replace(/^no /, ''))}-${day(a.capturedAt)}-x-${day(b.capturedAt)}.pdf`
}

/** capilar-finalizacao-19-11-gelatina-supervolume.pdf */
export function finalizationFileName(f: FinalizationInfo): string {
  const start = f.moments[0]?.capturedAt ?? new Date().toISOString()
  return `capilar-finalizacao-${day(start)}-${productSlug({ ...f, stageType: 'wet', capturedAt: start })}.pdf`
}

export type ShareResult = 'shared' | 'cancelled' | 'downloaded'

/**
 * Abre o compartilhamento do aparelho (WhatsApp, e-mail…) com o PDF e a mensagem. Onde não
 * há compartilhamento de arquivos (computador), baixa o PDF e copia a mensagem.
 * Precisa ser chamado direto no toque do botão (o iPhone exige).
 */
export async function shareFile(file: File, text: string, title: string): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // outro erro: cai no download
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  await navigator.clipboard?.writeText(text).catch(() => undefined)
  return 'downloaded'
}
