import { useEffect, useState } from 'react'
import { DeleteStageDialog } from '../components/DeleteStageDialog'
import { PhotoView } from '../components/PhotoView'
import { updateStage } from '../lib/api'
import { ANGLES, ANGLE_LABEL, STAGE_LABEL, brandLabel, formatDateTime, missingAngles, photoByAngle, productLabel, type Angle } from '../lib/domain'
import { href, navigate } from '../lib/router'
import { findStage, useHistory, useSignedUrls } from '../lib/state'

function CompareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="7" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="13.5" y="5" width="7" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  )
}

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
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  const present = ANGLES.filter((a) => photoByAngle(stage, a))

  return (
    <main className="page">
      <a className="back" href={href('/')}>← Histórico</a>
      <header className="detail-head">
        <div className="detail-title">
          <h1>{STAGE_LABEL[stage.stage_type]}</h1>
          <p className="muted small">
            {productLabel(experiment)}
            {brandLabel(experiment) && ` · ${brandLabel(experiment)}`} · {formatDateTime(stage.captured_at)}
          </p>
        </div>
        <div className="detail-actions">
          <a className="icon-btn" href={href(`/comparar?a=${stage.id}`)} aria-label="Comparar esta etapa" title="Comparar">
            <CompareIcon />
          </a>
          <button
            className={`icon-btn ${stage.is_favorite ? 'on' : ''}`}
            onClick={() => void toggleFavorite()}
            disabled={savingFav}
            aria-pressed={stage.is_favorite}
            aria-label="Favorita"
            title={stage.is_favorite ? 'Remover dos favoritos' : 'Favoritar'}
          >
            <span aria-hidden="true">{stage.is_favorite ? '★' : '☆'}</span>
          </button>
        </div>
      </header>

      {urlError && <p className="alert alert-error">{urlError}</p>}

      <div className="angle-grid">
        {present.map((a) => {
          const p = photoByAngle(stage, a)!
          return (
            <figure key={a} className="angle-cell">
              <button className="photo-button" onClick={() => setViewer(a)} aria-label={`Ampliar ${ANGLE_LABEL[a]}`}>
                <PhotoView url={urls[p.storage_path]} alt={ANGLE_LABEL[a]} />
              </button>
              <figcaption>{ANGLE_LABEL[a]}</figcaption>
            </figure>
          )
        })}
      </div>

      {missing.length > 0 && (
        <div className="missing-row">
          <span className="muted small">Faltam</span>
          {missing.map((a) => (
            <a key={a} className="chip" href={href(`/etapa/${stage.id}/completar`)} aria-label={`Adicionar foto: ${ANGLE_LABEL[a]}`}>
              + {ANGLE_LABEL[a]}
            </a>
          ))}
        </div>
      )}

      <section className="notes-box">
        <label className="field">
          <span>Observação</span>
          <textarea rows={2} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} placeholder="Como ficou? Volume, definição, frizz…" />
        </label>
        {message && <p className={`alert ${message.kind === 'ok' ? 'alert-success' : 'alert-error'}`}>{message.text}</p>}
        {notesChanged && (
          <button className="btn btn-primary btn-block" onClick={() => void saveNotes()} disabled={savingNotes}>
            {savingNotes ? 'Salvando…' : 'Salvar observação'}
          </button>
        )}
      </section>

      <button className="btn btn-ghost btn-block danger-text" onClick={() => setConfirmDelete(true)}>
        Excluir etapa
      </button>

      {confirmDelete && (
        <DeleteStageDialog
          stage={stage}
          experiment={experiment}
          onCancel={() => setConfirmDelete(false)}
          onDeleted={() => navigate('/?excluida=1', { replace: true })}
        />
      )}

      {viewer && viewerPhoto && (
        <div className="viewer" role="dialog" aria-label={ANGLE_LABEL[viewer]} onClick={() => setViewer(null)}>
          <img src={urls[viewerPhoto.storage_path]} alt={ANGLE_LABEL[viewer]} />
          <button className="btn viewer-close">Fechar</button>
        </div>
      )}
    </main>
  )
}
