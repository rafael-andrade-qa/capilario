// PDF da finalização inteira (molhado → seco → dia seguinte): monta a opção de envio usada no
// histórico e no detalhe do momento. As URLs das fotos são assinadas na hora de montar.
import type { PdfOption } from '../components/PdfShareSheet'
import { signedUrls } from './api'
import { ANGLES, ANGLE_LABEL, STAGE_LABEL, STAGE_TYPES, brandLabel, photoByAngle, productLabel, type Experiment, type Finalization } from './domain'
import { finalizationPdf, type Banner } from './pdf'
import { finalizationFileName, finalizationInfo, finalizationMessage, whenText } from './share'

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

export function finalizationOption(experiment: Experiment, f: Finalization, label = 'Finalização inteira'): PdfOption {
  const stages = STAGE_TYPES.flatMap((t) => (f.moments[t] ? [f.moments[t]!] : []))
  const angles = ANGLES.filter((a) => stages.some((s) => photoByAngle(s, a)))
  const info = finalizationInfo(experiment, f)
  const names = stages.map((s) => STAGE_LABEL[s.stage_type]).join(', ')
  return {
    label,
    summary: `${names} lado a lado`,
    message: finalizationMessage(info),
    fileName: finalizationFileName(info),
    build: async () => {
      const urls = await signedUrls(stages.flatMap((s) => s.photos.map((p) => p.storage_path)))
      const blob = await finalizationPdf({
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
        notes: stages.filter((s) => s.notes?.trim()).map((s) => ({ title: STAGE_LABEL[s.stage_type], text: s.notes!.trim() })),
      })
      return blob
    },
  }
}
