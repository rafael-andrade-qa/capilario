import { useEffect, useState } from 'react'
import { PhotoView } from '../components/PhotoView'
import { updateStage } from '../lib/api'
import { ANGLES, ANGLE_LABEL, STAGE_LABEL, formatDateTime, missingAngles, photoByAngle, productLabel, type Angle } from '../lib/domain'
import { href } from '../lib/router'
import { findStage, useHistory, useSignedUrls } from '../lib/state'

export function StageDetail({ stageId }: { stageId: string }) {
  const { experiments, patchStage, loading } = useHistory()
  const found = findStage(experiments, stageId)
  const stage = found?.stage
  const { urls, error: urlError } = useSignedUrls(stage?.photos.map((p) => p.storage_path) ?? [])

  const [notes, setNotes] = useState(stage?.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingFav, setSavingFav] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [viewer, setViewer] = useState<Angle | null>(null)

  useEffect(() => {
    setNotes(stage?.notes ?? '')
    // só ao trocar de etapa ou quando o servidor mudar a nota
  }, [stage?.id, stage?.notes])

  if (!found || !stage) {
    return (
      <main className="page">
        <a className="back" href={href('/')}>← Histórico</a>
        <p className="muted">{experiments === null || loading ? 'Carregando…' : 'Etapa não encontrada.'}</p>
      </main>
    )
  }
  const { experiment } = found
  const missing = missingAngles(stage)
  const notesChanged = (notes.trim() || null) !== (stage.notes ?? null)

  async function saveNotes() {
    if (savingNotes || !stage) return
    setSavingNotes(true)
    setMessage(null)
    const value = notes.trim() || null
    try {
      await updateStage(stage.id, { notes: value })
      patchStage(stage.id, { notes: value })
      setMessage({ kind: 'ok', text: 'Observação salva.' })
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setSavingNotes(false)
    }
  }

  async function toggleFavorite() {
    if (savingFav || !stage) return
    setSavingFav(true)
    setMessage(null)
    const next = !stage.is_favorite
    try {
      await updateStage(stage.id, { is_favorite: next })
      patchStage(stage.id, { is_favorite: next })
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setSavingFav(false)
    }
  }

  const viewerPhoto = viewer ? photoByAngle(stage, viewer) : undefined

  return (
    <main className="page">
      <a className="back" href={href('/')}>← Histórico</a>
      <header className="detail-head">
        <div>
          <h1>{STAGE_LABEL[stage.stage_type]}</h1>
          <p className="muted">
            {productLabel(experiment)} · {formatDateTime(stage.captured_at)}
          </p>
        </div>
        <button
          className={`btn fav ${stage.is_favorite ? 'on' : ''}`}
          onClick={() => void toggleFavorite()}
          disabled={savingFav}
          aria-pressed={stage.is_favorite}
        >
          {stage.is_favorite ? '★ Favorita' : '☆ Favoritar'}
        </button>
      </header>

      {urlError && <p className="alert alert-error">{urlError}</p>}

      <div className="angle-grid">
        {ANGLES.map((a) => {
          const p = photoByAngle(stage, a)
          return (
            <figure key={a} className="angle-cell">
              {p ? (
                <button className="photo-button" onClick={() => setViewer(a)} aria-label={`Ampliar ${ANGLE_LABEL[a]}`}>
                  <PhotoView url={urls[p.storage_path]} alt={ANGLE_LABEL[a]} />
                </button>
              ) : (
                <a className="photo-frame empty" href={href(`/etapa/${stage.id}/completar`)}>
                  + Adicionar
                </a>
              )}
              <figcaption>{ANGLE_LABEL[a]}</figcaption>
            </figure>
          )
        })}
      </div>

      <div className="row-actions">
        {missing.length > 0 && (
          <a className="btn" href={href(`/etapa/${stage.id}/completar`)}>
            Completar fotos ({missing.length})
          </a>
        )}
        <a className="btn" href={href(`/comparar?a=${stage.id}`)}>
          Comparar esta etapa
        </a>
        <a className="btn" href={href(`/experimento/${experiment.id}/nova-etapa`)}>
          + Adicionar etapa
        </a>
      </div>

      <section className="card stack">
        <label className="field">
          <span>Observação</span>
          <textarea rows={3} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} placeholder="Como ficou? Volume, definição, frizz…" />
        </label>
        {message && <p className={`alert ${message.kind === 'ok' ? 'alert-success' : 'alert-error'}`}>{message.text}</p>}
        <button className="btn btn-primary" onClick={() => void saveNotes()} disabled={!notesChanged || savingNotes}>
          {savingNotes ? 'Salvando…' : 'Salvar observação'}
        </button>
      </section>

      {viewer && viewerPhoto && (
        <div className="viewer" role="dialog" aria-label={ANGLE_LABEL[viewer]} onClick={() => setViewer(null)}>
          <img src={urls[viewerPhoto.storage_path]} alt={ANGLE_LABEL[viewer]} />
          <button className="btn viewer-close">Fechar</button>
        </div>
      )}
    </main>
  )
}
