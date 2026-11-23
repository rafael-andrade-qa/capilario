// Detalhe do momento: fotos, observação e favorita. O lápis liga o modo de edição: corrigir data
// e horário, trocar a foto de um ângulo, remover (menos a última), pôr foto num ângulo vazio e
// ajustar o enquadramento (à mão ou automático, em todas as fotos de uma vez).
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { weatherLong } from '../lib/weather'
import { CheckIcon, CloseIcon, CropIcon, DropIcon, EditIcon } from '../components/ActionIcons'
import { DeleteStageDialog } from '../components/DeleteStageDialog'
import { useToast } from '../components/Toasts'
import { PageHeader } from '../components/PageHeader'
import { TrashIcon } from '../components/TrashIcon'
import { PhotoView } from '../components/PhotoView'
import { PhotoViewer } from '../components/PhotoViewer'
import { PageSkeleton } from '../components/Skeleton'
import { DateTimeField } from '../components/DateTimeField'
import { FramingEditor } from '../components/FramingEditor'
import { PdfIcon, PdfShareSheet } from '../components/PdfShareSheet'
import { finalizationOption, momentOption } from '../lib/finalizationShare'
import { deletePhoto, movePhoto, replacePhoto, setPhotoCrops, updateStage } from '../lib/api'
import { MoveAngleSheet, SwapIcon } from '../components/MoveAngleSheet'
import { AnalysisCard, AnalysisSuggestion, useFinalizationAnalysis } from '../components/FinalizationAnalysis'
import { analyzeUrl } from '../lib/faces'
import { momentCrops, type Crop } from '../lib/framing'
import { INPUT_ACCEPT, canDisplay, detectMime, validateFile } from '../lib/files'
import {
  ANGLES,
  ANGLE_LABEL,
  STAGE_LABEL,
  STAGE_TYPES,
  brandLabel,
  finalizationsOf,
  formatDateTime,
  formatShortDateTime,
  localInputToIso,
  missingAngles,
  photoByAngle,
  productLabel,
  toLocalInputValue,
  type Angle,
} from '../lib/domain'
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
  const notify = useToast()
  const [viewer, setViewer] = useState<Angle | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [working, setWorking] = useState<Angle | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<Angle | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const pickFor = useRef<Angle | null>(null)
  const [adjusting, setAdjusting] = useState<Angle | null>(null)
  const [framing, setFraming] = useState(false)
  const [savingTime, setSavingTime] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [moving, setMoving] = useState<Angle | null>(null)

  useEffect(() => {
    setNotes(stage?.notes ?? '')
    // só ao trocar de etapa ou quando o servidor mudar a nota
  }, [stage?.id, stage?.notes])

  const fin = found ? finalizationsOf(found.experiment).find((f) => f.id === found.stage.finalization_id) : undefined
  const ai = useFinalizationAnalysis(fin, (changes) => changes.forEach((c) => patchStage(c.stageId, { notes: c.notes })))

  if ((!found || !stage) && (experiments === null || loading)) return <PageSkeleton />
  if (!found || !stage) {
    return (
      <main className="page">
        <PageHeader title="Momento" back={{ label: 'Voltar ao histórico', href: href('/') }} />
        <p className="muted">Momento não encontrado.</p>
      </main>
    )
  }
  const { experiment } = found
  const missing = missingAngles(stage)
  const notesChanged = (notes.trim() || null) !== (stage.notes ?? null)

  async function saveNotes() {
    if (savingNotes || !stage) return
    setSavingNotes(true)
    const value = notes.trim() || null
    try {
      await updateStage(stage.id, { notes: value })
      patchStage(stage.id, { notes: value })
      notify('Observação salva.')
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setSavingNotes(false)
    }
  }

  /** A estrela muda na hora; se o servidor recusar, volta e avisa. */
  async function toggleFavorite() {
    if (savingFav || !stage) return
    setSavingFav(true)
    const next = !stage.is_favorite
    patchStage(stage.id, { is_favorite: next })
    try {
      await updateStage(stage.id, { is_favorite: next })
    } catch (e) {
      patchStage(stage.id, { is_favorite: !next })
      notify(`Não foi possível ${next ? 'favoritar' : 'tirar dos favoritos'}: ${(e as Error).message}`, 'error')
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
      notify(invalid, 'error')
      return
    }
    const had = !!photoByAngle(stage, angle)
    setWorking(angle)
    try {
      await replacePhoto(session.user.id, stage.id, angle, file, detectMime(file))
      await reload()
      notify(had ? `Foto de ${ANGLE_LABEL[angle]} trocada.` : `Foto de ${ANGLE_LABEL[angle]} adicionada.`)
    } catch (err) {
      notify((err as Error).message, 'error')
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
    try {
      await deletePhoto(p.id)
      await reload()
      notify(`Foto de ${ANGLE_LABEL[angle]} removida.`)
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setWorking(null)
    }
  }

  const present = ANGLES.filter((a) => photoByAngle(stage, a))

  /** Foto no ângulo errado: leva para o certo (troca com a que estiver lá). */
  async function moveTo(from: Angle, to: Angle) {
    const p = stage ? photoByAngle(stage, from) : undefined
    setMoving(null)
    if (!p || working) return
    setWorking(from)
    try {
      const { swappedWith } = await movePhoto(p.id, to)
      await reload()
      notify(swappedWith ? `${ANGLE_LABEL[from]} e ${ANGLE_LABEL[to]} trocados.` : `Foto movida para ${ANGLE_LABEL[to]}.`)
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setWorking(null)
    }
  }

  async function saveTime(value: string) {
    const iso = localInputToIso(value)
    if (!iso || !stage || savingTime) return
    if (new Date(iso).getTime() > Date.now() + 10 * 60 * 1000) {
      notify('O horário não pode ficar no futuro.', 'error')
      return
    }
    setSavingTime(true)
    try {
      await updateStage(stage.id, { captured_at: iso })
      patchStage(stage.id, { captured_at: iso })
      notify('Horário atualizado.')
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setSavingTime(false)
    }
  }

  async function saveCrop(angle: Angle, crop: Crop) {
    const p = stage ? photoByAngle(stage, angle) : undefined
    if (!p) return
    try {
      await setPhotoCrops([{ photoId: p.id, crop }])
      await reload()
      setAdjusting(null)
      notify(`Enquadramento de ${ANGLE_LABEL[angle]} salvo.`)
    } catch (e) {
      notify((e as Error).message, 'error')
    }
  }

  /** Enquadra todas as fotos do momento pela cabeça, na mesma escala (rosto da frente). */
  async function frameAll() {
    if (!stage || framing) return
    setFraming(true)
    try {
      const list = []
      for (const a of present) {
        const p = photoByAngle(stage, a)!
        const url = urls[p.storage_path]
        const r = url ? await analyzeUrl(url) : null
        if (r) list.push({ key: p.id, W: r.W, H: r.H, face: r.face, hair: r.hair, angle: a })
      }
      if (!list.length) throw new Error('Não foi possível analisar as fotos agora.')
      const crops = momentCrops(list)
      await setPhotoCrops(Object.entries(crops).map(([photoId, crop]) => ({ photoId, crop })))
      await reload()
      const found = list.filter((x) => x.hair || (x.face && x.angle !== 'back')).length
      notify(found ? 'Fotos enquadradas.' : 'Não achei a cabeça nas fotos; elas foram centralizadas. Ajuste à mão se precisar.', found ? 'success' : 'info')
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setFraming(false)
    }
  }

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
          <button className="icon-btn" onClick={() => setPdfOpen(true)} disabled={present.length === 0} aria-label="Enviar PDF" title="Enviar PDF">
            <PdfIcon />
          </button>
          <button
            className={`icon-btn ${stage.is_favorite ? 'on' : ''}`}
            onClick={() => void toggleFavorite()}
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
          <button className="icon-btn danger-icon" onClick={() => setConfirmDelete(true)} disabled={!!working} aria-label="Excluir momento" title="Excluir momento">
            <TrashIcon />
          </button>
        </div>
        }
      />
      <p className="muted small detail-sub" title={`${productLabel(experiment)}${brandLabel(experiment) ? ` · ${brandLabel(experiment)}` : ''} · ${formatDateTime(stage.captured_at)}`}>
        <span className="detail-sub-product">{productLabel(experiment)}</span>
        <span className="detail-sub-when"> · {formatShortDateTime(stage.captured_at)}</span>
      </p>
      {weatherLong(stage) && (
        <p className="muted small detail-weather" data-testid="stage-weather">
          <DropIcon size={12} /> {weatherLong(stage)}
        </p>
      )}

      {urlError && <p className="alert alert-error">{urlError}</p>}

      {editing && (
        <section className="edit-moment">
          <div className="field">
            <span id="d-data-label" className="field-label">
              Data e horário
            </span>
            <DateTimeField id="d-data" labelledBy="d-data-label" value={toLocalInputValue(new Date(stage.captured_at))} onChange={(v) => void saveTime(v)} disabled={savingTime} />
          </div>
          <button type="button" className={`btn btn-outline-brand btn-block ${framing ? 'is-busy' : ''}`} onClick={() => void frameAll()} disabled={framing || !!working}>
            {framing ? 'Enquadrando…' : 'Enquadrar todas automaticamente'}
          </button>
          <p className="muted small edit-hint">Toque numa foto para trocar, ou num ângulo vazio para adicionar. Ângulo errado? Toque no nome dele.</p>
        </section>
      )}
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
                    <PhotoView url={urls[p.storage_path]} crop={p.crop} alt={ANGLE_LABEL[a]} />
                  ) : (
                    <div className="photo-frame empty plus" aria-hidden="true">
                      +
                    </div>
                  )}
                  {working === a && <span className="badge">Enviando…</span>}
                </button>
                <figcaption className={`cell-bar ${p ? '' : 'solo'}`}>
                  {p && confirmRemove !== a ? (
                    <button
                      type="button"
                      className="cell-label cell-move"
                      onClick={() => setMoving(a)}
                      disabled={!!working || framing}
                      aria-label={`Trocar ângulo: ${ANGLE_LABEL[a]}`}
                      title="Foto no ângulo errado? Toque para trocar"
                    >
                      <span>{ANGLE_LABEL[a]}</span>
                      <SwapIcon />
                    </button>
                  ) : (
                    <span className={`cell-label ${confirmRemove === a ? 'danger' : ''}`}>{confirmRemove === a ? 'Remover?' : ANGLE_LABEL[a]}</span>
                  )}
                  {p && confirmRemove !== a && (
                    <button
                      type="button"
                      className="cell-icon"
                      onClick={() => setAdjusting(a)}
                      disabled={!!working || framing || !urls[p.storage_path]}
                      aria-label={`Ajustar enquadramento: ${ANGLE_LABEL[a]}`}
                      title="Ajustar enquadramento"
                    >
                      <CropIcon />
                    </button>
                  )}
                  {p && present.length > 1 && (
                    <button
                      type="button"
                      className={`cell-icon danger ${confirmRemove === a ? 'confirm' : ''}`}
                      onClick={() => void remove(a)}
                      disabled={!!working}
                      aria-label={confirmRemove === a ? `Confirmar remoção: ${ANGLE_LABEL[a]}` : `Remover foto: ${ANGLE_LABEL[a]}`}
                      title={confirmRemove === a ? 'Toque de novo para remover' : 'Remover foto'}
                    >
                      <CloseIcon />
                    </button>
                  )}
                </figcaption>
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
                <PhotoView url={urls[p.storage_path]} crop={p.crop} alt={ANGLE_LABEL[a]} />
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

      {ai.analysis && <AnalysisCard analysis={ai.analysis} />}

      <section className="notes-box">
        <label className="field">
          <span>Observação</span>
          <textarea rows={2} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} placeholder="Como ficou? Volume, definição, frizz…" />
        </label>
        {fin && <AnalysisSuggestion api={ai} fin={fin} moment={stage.stage_type} />}
        {notesChanged && (
          <button className={`btn btn-primary btn-block ${savingNotes ? 'is-busy' : ''}`} onClick={() => void saveNotes()} disabled={savingNotes}>
            {savingNotes ? 'Salvando…' : 'Salvar observação'}
          </button>
        )}
      </section>

      {confirmDelete && (
        <DeleteStageDialog
          stage={stage}
          experiment={experiment}
          onCancel={() => setConfirmDelete(false)}
          onDeleted={() => navigate(`/?excluida=${stage.id}`, { replace: true })}
        />
      )}

      {moving && photoByAngle(stage, moving) && (
        <MoveAngleSheet stage={stage} angle={moving} urls={urls} onPick={(to) => void moveTo(moving, to)} onClose={() => setMoving(null)} />
      )}

      {adjusting && photoByAngle(stage, adjusting) && urls[photoByAngle(stage, adjusting)!.storage_path] && (
        <FramingEditor
          url={urls[photoByAngle(stage, adjusting)!.storage_path]}
          title={ANGLE_LABEL[adjusting]}
          angle={adjusting}
          initial={photoByAngle(stage, adjusting)!.crop}
          onCancel={() => setAdjusting(null)}
          onSave={(crop) => saveCrop(adjusting, crop)}
        />
      )}

      {pdfOpen && (
        <PdfShareSheet
          heading="Enviar PDF"
          onClose={() => setPdfOpen(false)}
          options={[
            momentOption(experiment, stage, present, urls),
            ...(fin && STAGE_TYPES.filter((t) => fin.moments[t]).length > 1 ? [finalizationOption(experiment, fin, undefined, ai.analysis)] : []),
          ]}
        />
      )}

      {viewer && viewerPhoto && present.includes(viewer) && (
        <PhotoViewer
          photos={present.map((a) => {
            const p = photoByAngle(stage, a)!
            return { key: a, label: ANGLE_LABEL[a], url: urls[p.storage_path], crop: p.crop }
          })}
          index={present.indexOf(viewer)}
          context={`${STAGE_LABEL[stage.stage_type]} · ${formatShortDateTime(stage.captured_at)}`}
          onIndex={(i) => setViewer(present[i])}
          onClose={() => setViewer(null)}
        />
      )}
    </main>
  )
}
