// Opções de envio em PDF do momento e da finalização inteira (molhado → seco → dia seguinte),
// usadas no histórico e no detalhe do momento. As URLs das fotos são assinadas na hora de montar.
//
// Análise da IA: quando existe, entra no PDF por padrão (a leitura da finalização e a observação
// da IA de cada momento, com rótulo, separada do que a pessoa escreveu). A folha deixa tirar:
// cada opção traz também a versão sem a análise (noAi).
import type { PdfOption } from '../components/PdfShareSheet'
import type { FinalizationAnalysis } from './analysis'
import { splitNote } from './analysisText'
import { signedUrls } from './api'
import {
  ANGLES,
  ANGLE_LABEL,
  STAGE_LABEL,
  STAGE_TYPES,
  brandLabel,
  formatDateTime,
  photoByAngle,
  productLabel,
  type Angle,
  type Experiment,
  type Finalization,
  type Stage,
} from './domain'
import { finalizationPdf, momentPdf, type Banner, type PdfReading } from './pdf'
import { finalizationFileName, finalizationInfo, finalizationMessage, momentFileName, momentInfo, momentMessage, whenText } from './share'

/** Embalagem do produto para a capa do PDF (é ela que diz qual produto é). */
export async function productHero(exp: Experiment, label = ''): Promise<Banner['heroes'][number]> {
  if (exp.photo_path) {
    const url = (await signedUrls([exp.photo_path]).catch(() => ({}) as Record<string, string>))[exp.photo_path]
    if (url) return { label, photo: { label: '', url } }
  }
  return { label, photo: null, placeholder: exp.product_mode === 'none' ? 'Sem finalizador' : 'Sem foto da embalagem' }
}

/** "20/11" */
export const dayMonth = (iso: string) => whenText(iso).split(' às ')[0]

/**
 * Observações do PDF: o texto da pessoa e, se for incluir, a análise da IA com rótulo.
 * Na finalização, cada uma leva o nome do momento ("Seco", "Seco · análise da IA").
 */
export function pdfNotes(stages: Pick<Stage, 'stage_type' | 'notes'>[], withAi: boolean, titled: boolean): { title?: string; text: string }[] {
  return stages.flatMap((s) => {
    const { own, analysis } = splitNote(s.notes)
    const name = STAGE_LABEL[s.stage_type]
    return [
      ...(own ? [titled ? { title: name, text: own } : { text: own }] : []),
      ...(withAi && analysis ? [{ title: titled ? `${name} · análise da IA` : 'Análise da IA', text: analysis }] : []),
    ]
  })
}

/** Leitura da IA no formato do PDF. */
export function pdfReading(a: Pick<FinalizationAnalysis, 'created_at' | 'result'>): PdfReading {
  const r = a.result
  return {
    title: r.tendency ? `${r.hair_type} · ${r.tendency}` : r.hair_type,
    traits: r.traits ?? [],
    scores: [
      { label: 'Definição', value: r.scores.definition },
      { label: 'Controle do frizz', value: r.scores.frizz_control },
      { label: 'Volume', value: r.scores.volume },
      { label: 'Dia seguinte', value: r.scores.day2 },
    ],
    summary: r.summary ?? '',
    credit: `Análise feita por IA em ${dayMonth(a.created_at)}`,
  }
}

export function finalizationOption(
  experiment: Experiment,
  f: Finalization,
  label = 'Finalização inteira',
  analysis: FinalizationAnalysis | null = null,
): PdfOption {
  const stages = STAGE_TYPES.flatMap((t) => (f.moments[t] ? [f.moments[t]!] : []))
  const angles = ANGLES.filter((a) => stages.some((s) => photoByAngle(s, a)))
  const info = finalizationInfo(experiment, f)
  const names = stages.map((s) => STAGE_LABEL[s.stage_type]).join(', ')
  const hasAi = !!analysis || stages.some((s) => splitNote(s.notes).analysis)
  const version = (withAi: boolean): Pick<PdfOption, 'message' | 'build'> => ({
    message: finalizationMessage({ ...info, ai: withAi && hasAi }),
    build: async () => {
      const urls = await signedUrls(stages.flatMap((s) => s.photos.map((p) => p.storage_path)))
      return finalizationPdf({
        banner: {
          kicker: 'Evolução da finalização',
          title: productLabel(experiment),
          brand: brandLabel(experiment) || null,
          pill: `${dayMonth(f.start)} · ${stages.map((s) => STAGE_LABEL[s.stage_type]).join(' → ')}`,
          heroes: [await productHero(experiment)],
        },
        columns: stages.map((s) => ({ title: STAGE_LABEL[s.stage_type], subtitle: whenText(s.captured_at) })),
        rows: angles.map((a) => ({
          label: ANGLE_LABEL[a],
          cells: stages.map((s) => {
            const p = photoByAngle(s, a)
            return p ? { label: ANGLE_LABEL[a], url: urls[p.storage_path], crop: p.crop } : null
          }),
        })),
        notes: pdfNotes(stages, withAi, true) as { title: string; text: string }[],
        reading: withAi && analysis ? pdfReading(analysis) : undefined,
      })
    },
  })
  return {
    label,
    summary: `${names} lado a lado`,
    fileName: finalizationFileName(info),
    ...version(true),
    ...(hasAi ? { noAi: version(false) } : {}),
  }
}

/** PDF de um momento: as fotos e a observação (a da IA, com rótulo, se houver). */
export function momentOption(experiment: Experiment, stage: Stage, present: Angle[], urls: Record<string, string>): PdfOption {
  const info = momentInfo(experiment, stage)
  const hasAi = !!splitNote(stage.notes).analysis
  const version = (withAi: boolean): Pick<PdfOption, 'message' | 'build'> => ({
    message: momentMessage({ ...info, ai: withAi && hasAi }),
    build: async () =>
      momentPdf({
        banner: {
          kicker: `Momento · ${STAGE_LABEL[stage.stage_type]}`,
          title: productLabel(experiment),
          brand: brandLabel(experiment) || null,
          pill: formatDateTime(stage.captured_at),
          heroes: [await productHero(experiment)],
        },
        notes: pdfNotes([stage], withAi, false),
        photos: present.map((ang) => {
          const p = photoByAngle(stage, ang)!
          return { label: ANGLE_LABEL[ang], url: urls[p.storage_path], crop: p.crop }
        }),
      }),
  })
  return {
    label: 'Este momento',
    summary: `${present.length} ${present.length === 1 ? 'foto' : 'fotos'} do ${STAGE_LABEL[stage.stage_type]}`,
    fileName: momentFileName(info),
    ...version(true),
    ...(hasAi ? { noAi: version(false) } : {}),
  }
}
