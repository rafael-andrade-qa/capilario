// Confirmação para excluir um produto inteiro, com todas as etapas e fotos.
import { useEffect, useRef, useState } from 'react'
import { deleteExperiment, saveRoutine } from '../lib/api'
import { finalizationsOf, productFullLabel, type Experiment } from '../lib/domain'
import { draftOf, finalizationsWith } from '../lib/routine'
import { useHistory } from '../lib/state'

interface Props {
  experiment: Experiment
  onCancel: () => void
  onDeleted: () => void
}

export function DeleteProductDialog({ experiment, onCancel, onDeleted }: Props) {
  const { removeExperiment, routines, experiments, reload } = useHistory()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const all = experiments ?? []
  // Em quantas finalizações ele entrou; as que estão guardadas nele mudam de produto antes.
  const used = finalizationsWith(experiment.id, all, routines).length
  const owned = finalizationsOf(experiment)
  const paths = experiment.photo_path ? [experiment.photo_path] : []

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      for (const f of owned) await saveRoutine(f.id, draftOf(routines[f.id], all).filter((i) => i.experimentId !== experiment.id))
      await deleteExperiment(experiment.id, paths)
      removeExperiment(experiment.id)
      await reload()
      onDeleted()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onClick={() => !busy && onCancel()}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-product-title"
        aria-describedby="delete-product-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-product-title">Excluir este produto?</h2>
        <div id="delete-product-desc">
          <p>
            <strong>{productFullLabel(experiment)}</strong>
          </p>
          <p>
            {used === 0
              ? `O produto ainda não entrou em nenhuma finalização${experiment.photo_path ? '; a foto da embalagem será apagada' : ''}. Não dá para desfazer.`
              : `Ele sai da rotina ${used === 1 ? 'da finalização em que aparece' : `das ${used} finalizações em que aparece`}; as finalizações e as fotos continuam${experiment.photo_path ? '. A foto da embalagem é apagada' : ''}. Não dá para desfazer.`}
          </p>
        </div>
        {error && <p className="alert alert-error">{error}</p>}
        <div className="dialog-actions">
          <button ref={cancelRef} className="btn" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-danger" onClick={() => void confirm()} disabled={busy}>
            {busy ? 'Excluindo…' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}
