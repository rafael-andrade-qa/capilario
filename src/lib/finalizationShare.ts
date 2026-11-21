// PDF da finalização inteira (molhado → seco → dia seguinte): monta a opção de envio usada no
// histórico e no detalhe do momento. As URLs das fotos são assinadas na hora de montar.
import type { PdfOption } from '../components/PdfShareSheet'
import { signedUrls } from './api'
import { ANGLES, ANGLE_LABEL, STAGE_LABEL, STAGE_TYPES, formatDateTime, photoByAngle, type Experiment, type Finalization } from './domain'
import { finalizationPdf } from './pdf'
import { finalizationFileName, finalizationInfo, finalizationMessage, productTitle, whenText } from './share'

export function finalizationOption(experiment: Experiment, f: Finalization, label = 'Finalização inteira'): PdfOption {
  const stages = STAGE_TYPES.flatMap((t) => (f.moments[t] ? [f.moments[t]!] : []))
  const angles = ANGLES.filter((a) => stages.some((s) => photoByAngle(s, a)))
  const info = finalizationInfo(experiment, f)
  const names = stages.map((s) => STAGE_LABEL[s.stage_type]).join(', ')
  return {
    label,
    summary: `${names} lado a lado`,
    message: finalizationMessage(info),
    build: async () => {
      const urls = await signedUrls(stages.flatMap((s) => s.photos.map((p) => p.storage_path)))
      const blob = await finalizationPdf({
        title: productTitle(experiment),
        subtitle: `Finalização de ${formatDateTime(f.start)}`,
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
      return { blob, fileName: finalizationFileName(info) }
    },
  }
}
