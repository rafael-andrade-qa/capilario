// Detalhe do momento: fotos, observação e favorita. O lápis liga o modo de edição das fotos:
// trocar a foto de um ângulo, remover (menos a última) ou pôr foto num ângulo vazio.
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { CheckIcon, EditIcon } from '../components/ActionIcons'
import { DeleteStageDialog } from '../components/DeleteStageDialog'
import { PageHeader } from '../components/PageHeader'
import { TrashIcon } from '../components/TrashIcon'
import { PhotoView } from '../components/PhotoView'
import { deletePhoto, replacePhoto, updateStage } from '../lib/api'
import { INPUT_ACCEPT, canDisplay, detectMime, validateFile } from '../lib/files'
import { ANGLES, ANGLE_LABEL, STAGE_LABEL, brandLabel, formatDateTime, formatShortDateTime, missingAngles, photoByAngle, productLabel, type Angle } from '../lib/domain'
import { href, navigate } from '../lib/router'
import { findStage, useHistory, useSession, useSignedUrls } from '../lib/state'

function CompareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="7" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="13.5" y="5" width="7" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  )
}

export function StageDetail({ stageId }: { stageId: string }) {
  const { experiments, patchStage, loading, reload } = useHistory()
  const { session } = useSession()
  const found = findStage(experiments, stageId)
  const stage = found?.stage
  const { urls, error: urlError } = useSignedUrls(stage?.photos.map((p) => p.storage_path) ?? [])

  const [notes, setNotes] = useState(stage?.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingFav, setSavingFav] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [viewer, setViewer] = useState<Angle | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [working, setWorking] = useState<Angle | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<Angle | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const pickFor = useRef<Angle | null>(null)

  useEffect(() => {
    setNotes(stage?.notes ?? '')
    // só ao trocar de etapa ou quando o servidor mudar a nota
  }, [stage?.id, stage?.notes])

  if (!found || !stage) {
    return (
      <main className="page">
        <PageHeader title="Momento" back={{ label: 'Voltar ao histórico', href: href('/') }} />
        <p className="muted">{experiments === null || loading ? 'Carregando…' : 'Momento não encontrado.'}</p>
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

  function pick(angle: Angle) {
    if (working) return
    setConfirmRemove(null)
    pickFor.current = angle
    fileInput.current?.click()
  }

  async function onPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const angle = pickFor.current
    pickFor.current = null
    if (!file || !angle || !stage || !session) return
    const invalid = validateFile(file) ?? ((await canDisplay(file)) ? null : 'O navegador não consegue exibir este arquivo. Use JPEG, PNG ou WebP.')
    if (invalid) {
      setMessage({ kind: 'error', text: invalid })
      return
    }
    const had = !!photoByAngle(stage, angle)
    setWorking(angle)
    setMessage(null)
    try {
      await replacePhoto(session.user.id, stage.id, angle, file, detectMime(file))
      await reload()
      setMessage({ kind: 'ok', text: had ? `Foto de ${ANGLE_LABEL[angle]} trocada.` : `Foto de ${ANGLE_LABEL[angle]} adicionada.` })
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setWorking(null)
    }
  }

  async function remove(angle: Angle) {
    const p = stage ? photoByAngle(stage, angle) : undefined
    if (!p || working) return
    if (confirmRemove !== angle) {
      setConfirmRemove(angle)
      return
    }
    setConfirmRemove(null)
    setWorking(angle)
    setMessage(null)
    try {
      await deletePhoto(p.id)
      await reload()
      setMessage({ kind: 'ok', text: `Foto de ${ANGLE_LABEL[angle]} removida.` })
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setWorking(null)
    }
  }

  const present = ANGLES.filter((a) => photoByAngle(stage, a))

  return (
    <main className="page">
      <PageHeader
        title={STAGE_LABEL[stage.stage_type]}
        back={{ label: 'Voltar ao histórico', href: href('/') }}
        right={
        <div className="detail-actions">
          <a className="icon-btn" href={href(`/comparar?a=${stage.id}`)} aria-label="Comparar este momento" title="Comparar">
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
          <button
            className={`icon-btn ${editing ? 'on-edit' : ''}`}
            onClick={() => {
              setEditing((v) => !v)
              setConfirmRemove(null)
            }}
            disabled={!!working}
            aria-pressed={editing}
            aria-label={editing ? 'Concluir edição das fotos' : 'Editar fotos'}
            title={editing ? 'Concluir' : 'Editar fotos'}
          >
            {editing ? <CheckIcon /> : <EditIcon />}
          </button>
          <button className="icon-btn danger-icon" onClick={() => setConfirmDelete(true)} aria-label="Excluir momento" title="Excluir momento">
            <TrashIcon />
          </button>
        </div>
        }
      />
      <p className="muted small detail-sub" title={`${productLabel(experiment)}${brandLabel(experiment) ? ` · ${brandLabel(experiment)}` : ''} · ${formatDateTime(stage.captured_at)}`}>
        <span className="detail-sub-product">{productLabel(experiment)}</span>
        <span className="detail-sub-when"> · {formatShortDateTime(stage.captured_at)}</span>
      </p>

      {urlError && <p className="alert alert-error">{urlError}</p>}

      {editing && <p className="muted small edit-hint">Toque numa foto para trocar. Ângulo vazio: toque para adicionar.</p>}
      <input ref={fileInput} type="file" accept={INPUT_ACCEPT} hidden onChange={(e) => void onPicked(e)} data-testid="detail-photo-input" />

      {editing ? (
        <div className="angle-grid editing">
          {ANGLES.map((a) => {
            const p = photoByAngle(stage, a)
            return (
              <figure key={a} className={`angle-cell ${working === a ? 'working' : ''}`} data-angle={a}>
                <button
                  className="photo-button"
                  onClick={() => pick(a)}
                  disabled={!!working}
                  aria-label={p ? `Trocar foto: ${ANGLE_LABEL[a]}` : `Adicionar foto: ${ANGLE_LABEL[a]}`}
                >
                  {p ? (
                    <PhotoView url={urls[p.storage_path]} alt={ANGLE_LABEL[a]} />
                  ) : (
                    <div className="photo-frame empty plus" aria-hidden="true">
                      +
                    </div>
                  )}
                  {working === a && <span className="badge">Enviando…</span>}
                </button>
                <figcaption>{ANGLE_LABEL[a]}</figcaption>
                {p && present.length > 1 && (
                  <button
                    type="button"
                    className={`link danger small-link remove-photo ${confirmRemove === a ? 'confirm' : ''}`}
                    onClick={() => void remove(a)}
                    disabled={!!working}
                    aria-label={confirmRemove === a ? `Confirmar remoção: ${ANGLE_LABEL[a]}` : `Remover foto: ${ANGLE_LABEL[a]}`}
                  >
                    {confirmRemove === a ? 'Toque de novo para remover' : 'Remover'}
                  </button>
                )}
              </figure>
            )
          })}
        </div>
      ) : (
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
      )}

      {!editing && missing.length > 0 && (
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
