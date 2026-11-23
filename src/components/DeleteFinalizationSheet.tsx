// Lixinho da barra do produto: escolhe QUAL finalização excluir (como no PDF e na análise), em
// vez de apagar o produto inteiro. Excluir o produto inteiro continua possível, num link embaixo,
// que abre a confirmação de sempre.
import { useState } from 'react'
import { deleteFinalization } from '../lib/api'
import { STAGE_TYPES, type Finalization, type StageType } from '../lib/domain'
import { useHistory } from '../lib/state'
import { FinalizationStrip, stripIntro, useSheet, type FinalizationChoice } from './FinalizationStrip'

const ARTICLE: Record<StageType, string> = { wet: 'o molhado', dry: 'o seco', next_day: 'o dia seguinte' }

/** "o molhado, o seco e o dia seguinte" */
function momentsText(fin: Finalization): string {
  const list = STAGE_TYPES.filter((t) => fin.moments[t]).map((t) => ARTICLE[t])
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}` : (list[0] ?? 'os momentos')
}

export function DeleteFinalizationSheet({
  product,
  choices,
  onClose,
  onDeleted,
  onDeleteProduct,
}: {
  product: string
  choices: FinalizationChoice[]
  onClose: () => void
  onDeleted: () => void
  onDeleteProduct: () => void
}) {
  const { removeStage } = useHistory()
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sheet = useSheet(() => !busy && onClose())
  const choice = choices[index]
  const fin = choice?.fin
  const stages = fin ? STAGE_TYPES.flatMap((t) => (fin.moments[t] ? [fin.moments[t]!] : [])) : []
  const photos = stages.reduce((n, s) => n + s.photos.length, 0)
  const heading = 'Excluir finalização'

  async function confirm() {
    if (!fin || busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteFinalization(
        fin.id,
        stages.flatMap((s) => s.photos.map((p) => p.storage_path)),
      )
      stages.forEach((s) => removeStage(s.id))
      onDeleted()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={() => !busy && onClose()}>
      <div ref={sheet} className="sheet delete-sheet" role="dialog" aria-modal="true" aria-label={heading} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <h2 className="sheet-title">{heading}</h2>
        <p className="muted small pdf-intro">{stripIntro(choices.length, product)}</p>
        <FinalizationStrip
          choices={choices}
          index={index}
          onSelect={(i) => {
            setIndex(i)
            setError(null)
          }}
          locked={busy}
        />
        {fin && (
          <p className="delete-warning small" role="note">
            Sai {momentsText(fin)} de {choice.label}, com {photos === 1 ? 'a foto' : `as ${photos} fotos`} e a análise da IA, se tiver. O produto fica. Não dá
            para desfazer.
          </p>
        )}
        {error && <p className="alert alert-error">{error}</p>}
        <div className="pdf-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className={`btn btn-danger ${busy ? 'is-busy' : ''}`} onClick={() => void confirm()} disabled={busy || !fin}>
            {busy ? 'Excluindo…' : 'Excluir'}
          </button>
        </div>
        <p className="delete-product-row">
          <button type="button" className="text-action danger-text" onClick={onDeleteProduct} disabled={busy}>
            Excluir o produto inteiro
          </button>
        </p>
      </div>
    </div>
  )
}
