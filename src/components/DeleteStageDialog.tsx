// Confirmação de exclusão de uma etapa. Usada no detalhe da etapa e no gesto de deslizar do histórico.
import { useEffect, useRef, useState } from 'react'
import { deleteStage } from '../lib/api'
import { STAGE_LABEL, formatDateTime, productLabel, type Experiment, type Stage } from '../lib/domain'
import { useHistory } from '../lib/state'

interface Props {
  stage: Stage
  experiment: Experiment
  onCancel: () => void
  onDeleted: () => void
}

export function DeleteStageDialog({ stage, experiment, onCancel, onDeleted }: Props) {
  const { removeStage } = useHistory()
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

  const n = stage.photos.length
  const last = experiment.stages.length <= 1

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteStage(
        stage.id,
        stage.photos.map((p) => p.storage_path),
      )
      removeStage(stage.id)
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
        aria-labelledby="delete-title"
        aria-describedby="delete-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-title">Excluir esta etapa?</h2>
        <div id="delete-desc">
          <p>
            <strong>{STAGE_LABEL[stage.stage_type]}</strong> · {formatDateTime(stage.captured_at)}
            <br />
            <span className="muted small">{productLabel(experiment)}</span>
          </p>
          <p>
            {n === 1 ? 'A foto' : `As ${n} fotos`}
            {stage.notes ? ' e a observação ' : ' '}
            {n === 1 && !stage.notes ? 'será apagada' : 'serão apagadas'}. Não dá para desfazer.
          </p>
          {last && <p className="muted small">É a única etapa deste produto, então ele também sai do histórico.</p>}
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
