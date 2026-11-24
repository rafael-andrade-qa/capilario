// Enviar em PDF: textos prontos (mensagem que acompanha o arquivo e nome do arquivo) e o
// compartilhamento do aparelho. Os textos são funções puras (testadas em share.test.ts).
import { splitNote } from './analysisText'
import { aboutLine } from './productGuide'
import { STAGE_LABEL, STAGE_TYPES, brandLabel, productLabel, type Experiment, type Finalization, type Stage, type StageType } from './domain'

export interface MomentInfo {
  productName: string
  brand: string | null
  noFinisher: boolean
  stageType: StageType
  capturedAt: string
  notes?: string | null
  /** O PDF leva a análise da IA (a mensagem avisa). */
  ai?: boolean
  /** "Geleia: define e controla o frizz..." (pra quem recebe saber o que é o produto). */
  about?: string | null
  /** Rotina em selos curtos ("Shampoo · Máscara N · Mousse"), quando registrada. */
  routine?: string | null
}

export function momentInfo(experiment: Experiment, stage: Stage): MomentInfo {
  return {
    productName: productLabel(experiment),
    brand: brandLabel(experiment) || null,
    noFinisher: experiment.product_mode === 'none',
    stageType: stage.stage_type,
    capturedAt: stage.captured_at,
    notes: stage.notes,
    about: aboutLine(experiment),
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
  // "Minha observação" é só o que a pessoa escreveu; a análise da IA vai no PDF, com rótulo.
  const notes = splitNote(m.notes).own
  return [
    `Olha como ficou meu cabelo ${MOMENT_WORD[m.stageType]}, ${productPhrase(m)}, em ${whenText(m.capturedAt)}.`,
    notes ? `Minha observação: ${notes}` : null,
    m.about ? `${m.about}` : null,
    m.ai ? 'As fotos estão no PDF, com a análise da IA.' : 'As fotos estão no PDF.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Mensagem pronta para mandar junto com o PDF do comparativo. */
/**
 * Mensagem do comparativo: duas finalizações (o dia e o que foi usado), e o que mudou entre elas.
 * Sem rotina registrada, diz o produto (ou "sem finalizador").
 */
export function compareMessage(a: MomentInfo, b: MomentInfo, changes: string[] = []): string {
  const used = (m: MomentInfo) => (m.routine ? `com ${m.routine}` : productPhrase(m))
  return [
    `Comparando meu cabelo ${MOMENT_WORD[a.stageType]} em duas finalizações:`,
    `• à esquerda (A), em ${whenText(a.capturedAt)}, ${used(a)};`,
    `• à direita (B), em ${whenText(b.capturedAt)}, ${used(b)}.`,
    '',
    ...(changes.length ? [`O que mudou: ${changes.join('; ')}.`, ''] : []),
    'As fotos estão lado a lado no PDF.',
  ].join('\n')
}

export interface FinalizationInfo {
  productName: string
  brand: string | null
  noFinisher: boolean
  /** Momentos registrados, na ordem molhado → seco → dia seguinte. */
  moments: { stageType: StageType; capturedAt: string; notes?: string | null }[]
  /** O PDF leva a análise da IA (a mensagem avisa). */
  ai?: boolean
  about?: string | null
  /** Rotina do dia em texto. */
  routine?: string | null
}

export function finalizationInfo(experiment: Experiment, f: Pick<Finalization, 'moments'>): FinalizationInfo {
  const base = momentInfo(experiment, { stage_type: 'wet', captured_at: '', notes: null } as Stage)
  return {
    productName: base.productName,
    brand: base.brand,
    noFinisher: base.noFinisher,
    about: base.about,
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
  const notes = f.moments.some((m) => splitNote(m.notes).own)
  const extra = notes && f.ai ? ', com as minhas observações e a análise da IA' : notes ? ', com as minhas observações' : f.ai ? ', com a análise da IA' : ''
  return [
    `Olha como meu cabelo evoluiu ${product}, na finalização de ${whenText(start).split(' às ')[0]}:`,
    ...lines,
    '',
    ...(f.routine ? [`Rotina do dia: ${f.routine}.`, ''] : []),
    ...(f.about ? [f.about, ''] : []),
    `As fotos estão lado a lado no PDF${extra}.`,
  ].join('\n')
}

const day = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}`
}

/**
 * Nome do arquivo como a pessoa escreveu, sem o ".pdf": tira caracteres que os sistemas não
 * aceitam em nome de arquivo, espaços sobrando e limita o tamanho. Vazio vira "Capilário".
 */
export function cleanFileName(name: string): string {
  const s = name
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim()
  return s || 'Capilário'
}

const productName = (m: Pick<MomentInfo, 'noFinisher' | 'productName'>) => (m.noFinisher ? 'Sem finalizador' : m.productName)

// Nomes de arquivo que dizem o que é (sem o .pdf; a pessoa pode editar antes de enviar).

/** "Seco 19-11 - Gelatina Supervolume" */
export function momentFileName(m: MomentInfo): string {
  return cleanFileName(`${STAGE_LABEL[m.stageType]} ${day(m.capturedAt)} - ${productName(m)}`)
}

/** "Comparativo Seco 18-11 x 19-11 - Sem finalizador x Gelatina Supervolume" */
export function compareFileName(a: MomentInfo, b: MomentInfo): string {
  return cleanFileName(`Comparativo ${STAGE_LABEL[a.stageType]} ${day(a.capturedAt)} x ${day(b.capturedAt)}`)
}

/** "Finalização 19-11 - Gelatina Supervolume" */
export function finalizationFileName(f: FinalizationInfo): string {
  return cleanFileName(`Finalização ${day(f.moments[0]?.capturedAt ?? new Date().toISOString())} - ${productName(f)}`)
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
