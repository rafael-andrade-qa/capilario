// Confirmação para excluir um produto inteiro, com todas as etapas e fotos.
import { useEffect, useRef, useState } from 'react'
import { deleteExperiment } from '../lib/api'
import { finalizationsOf, productFullLabel, publishedStages, type Experiment } from '../lib/domain'
import { useHistory } from '../lib/state'

interface Props {
  experiment: Experiment
  onCancel: () => void
  onDeleted: () => void
}

export function DeleteProductDialog({ experiment, onCancel, onDeleted }: Props) {
  const { removeExperiment } = useHistory()
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

  const stages = publishedStages(experiment)
  const fins = finalizationsOf(experiment).length
  const photos = stages.reduce((n, s) => n + s.photos.length, 0)
  const paths = [...experiment.stages.flatMap((s) => s.photos.map((p) => p.storage_path)), ...(experiment.photo_path ? [experiment.photo_path] : [])]

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteExperiment(experiment.id, paths)
      removeExperiment(experiment.id)
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
            {fins === 1 ? 'A finalização' : `As ${fins} finalizações`} e {photos === 1 ? 'a foto' : `as ${photos} fotos`} serão apagadas
            {experiment.photo_path ? ', junto com a foto do produto' : ''}. Não dá para desfazer.
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
