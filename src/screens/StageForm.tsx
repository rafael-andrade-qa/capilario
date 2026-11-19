// Formulário único para: Novo registro, Adicionar etapa e Completar fotos.
//
// Consistência do envio:
//  * IDs de experimento, etapa e fotos são reservados ao abrir o formulário/escolher o arquivo
//    e permanecem estáveis durante as tentativas (o caminho não depende do ângulo).
//  * Uploads já confirmados são reaproveitados em "Tentar novamente".
//  * A finalização grava experimento + etapa + fotos numa única transação (finalize_stage),
//    idempotente. Se a resposta se perder, consultamos o banco antes de declarar falha.
//  * Arquivos descartados só são apagados depois de confirmar no banco que não foram associados.
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { PhotoView } from '../components/PhotoView'
import { AmbiguousError, finalizeStage, linkedPhotoIds, removeUnlinkedObjects, type FinalizePhoto } from '../lib/api'
import {
  ANGLES,
  ANGLE_LABEL,
  STAGE_LABEL,
  STAGE_TYPES,
  formatDateTime,
  localInputToIso,
  missingAngles,
  photoByAngle,
  productFromForm,
  productLabel,
  toLocalInputValue,
  type Angle,
  type Experiment,
  type Stage,
  type StageType,
} from '../lib/domain'
import { EXT_BY_MIME, INPUT_ACCEPT, MAX_PHOTOS, canDisplay, detectMime, formatBytes, validateFile, type AcceptedMime } from '../lib/files'
import { href, navigate } from '../lib/router'
import { assignInOrder, clearSlot, emptySlots, filledAngles, setSlot, swapSlots, type Slots } from '../lib/slots'
import { findStage, useHistory, useSignedUrls } from '../lib/state'
import { uploadPhoto } from '../lib/upload'
import { uuid } from '../lib/uuid'

type RouteProps =
  | { kind: 'new'; userId: string }
  | { kind: 'add'; userId: string; experimentId: string }
  | { kind: 'complete'; userId: string; stageId: string }

export function StageFormRoute(props: RouteProps) {
  const { experiments } = useHistory()
  if (props.kind === 'new') return <StageForm kind="new" userId={props.userId} />
  if (experiments === null) return <main className="page muted center">Carregando…</main>
  if (props.kind === 'add') {
    const experiment = experiments.find((e) => e.id === props.experimentId)
    if (!experiment) return <NotFound text="Experimento não encontrado." />
    return <StageForm key={experiment.id} kind="add" userId={props.userId} experiment={experiment} />
  }
  const found = findStage(experiments, props.stageId)
  if (!found) return <NotFound text="Etapa não encontrada." />
  return <StageForm key={found.stage.id} kind="complete" userId={props.userId} experiment={found.experiment} stage={found.stage} />
}

function NotFound({ text }: { text: string }) {
  return (
    <main className="page">
      <a className="back" href={href('/')}>← Histórico</a>
      <p className="muted">{text}</p>
    </main>
  )
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

interface Item {
  key: string // = id da foto
  file: File
  mime: string
  preview: string | null
  invalid: string | null
  checking: boolean
  status: UploadStatus
  progress: number
  uploadError: string | null
}

type Phase = 'editing' | 'uploading' | 'partial' | 'finalizing' | 'error'

interface FormProps {
  kind: 'new' | 'add' | 'complete'
  userId: string
  experiment?: Experiment
  stage?: Stage
}

async function runPool<T>(list: T[], limit: number, fn: (t: T) => Promise<void>) {
  const queue = [...list]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!)
  })
  await Promise.all(workers)
}

function StageForm({ kind, userId, experiment, stage }: FormProps) {
  const { experiments, reload } = useHistory()

  // IDs reservados uma vez por formulário.
  const [stageId] = useState(() => stage?.id ?? uuid())
  const [newExperimentId] = useState(() => uuid())
  const [startNewExperiment, setStartNewExperiment] = useState(kind === 'new')
  const experimentId = kind === 'complete' ? stage!.experiment_id : startNewExperiment ? newExperimentId : experiment!.id

  const lockedAngles: Angle[] = kind === 'complete' && stage ? ANGLES.filter((a) => photoByAngle(stage, a)) : []
  const allowedAngles: Angle[] = kind === 'complete' && stage ? missingAngles(stage) : [...ANGLES]

  const [slots, setSlots] = useState<Slots<string>>(emptySlots)
  const [items, setItems] = useState<Record<string, Item>>({})
  const itemsRef = useRef(items)
  const [selected, setSelected] = useState<Angle | null>(null)

  const [stageType, setStageType] = useState<StageType | null>(null)
  const [capturedAt, setCapturedAt] = useState(() => toLocalInputValue(new Date()))
  const [productName, setProductName] = useState(experiment?.product_mode === 'named' ? experiment.product_name ?? '' : '')
  const [noFinisher, setNoFinisher] = useState(experiment?.product_mode === 'none')
  const [notes, setNotes] = useState('')

  const [phase, setPhase] = useState<Phase>('editing')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [message, setMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const finalizedRef = useRef(false)
  const finalizeAttemptedRef = useRef(false)
  const discardedRef = useRef<{ photoId: string; path: string }[]>([])

  const galleryInput = useRef<HTMLInputElement>(null)
  const slotInput = useRef<HTMLInputElement>(null)
  const slotTarget = useRef<Angle | null>(null)

  const pathFor = useCallback(
    (item: Item) => `${userId}/${stageId}/${item.key}.${EXT_BY_MIME[item.mime as AcceptedMime] ?? 'bin'}`,
    [userId, stageId],
  )

  const commitItems = useCallback((next: Record<string, Item>) => {
    itemsRef.current = next
    setItems(next)
  }, [])
  const updateItem = useCallback(
    (key: string, patch: Partial<Item>) => {
      const cur = itemsRef.current[key]
      if (cur) commitItems({ ...itemsRef.current, [key]: { ...cur, ...patch } })
    },
    [commitItems],
  )

  // Descarta um item: libera a pré-visualização e agenda a limpeza do arquivo enviado (se houver).
  const discardItem = useCallback(
    (key: string) => {
      const it = itemsRef.current[key]
      if (!it) return
      if (it.preview) URL.revokeObjectURL(it.preview)
      if (it.status !== 'idle') discardedRef.current.push({ photoId: it.key, path: pathFor(it) })
      const rest = { ...itemsRef.current }
      delete rest[key]
      commitItems(rest)
    },
    [commitItems, pathFor],
  )

  // Ao sair do formulário sem concluir: remove arquivos que comprovadamente não foram associados.
  useEffect(() => {
    return () => {
      const pending = [...discardedRef.current]
      if (!finalizedRef.current) {
        for (const it of Object.values(itemsRef.current)) {
          if (it.status !== 'idle') pending.push({ photoId: it.key, path: `${userId}/${stageId}/${it.key}.${EXT_BY_MIME[it.mime as AcceptedMime] ?? 'bin'}` })
        }
      }
      for (const it of Object.values(itemsRef.current)) if (it.preview) URL.revokeObjectURL(it.preview)
      if (pending.length) void removeUnlinkedObjects(pending)
    }
  }, [userId, stageId])

  // Aviso do navegador ao fechar a aba no meio de um envio.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const unsaved = !finalizedRef.current && Object.values(itemsRef.current).length > 0
      if (busyRef.current || unsaved) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  function makeItem(file: File): Item {
    const mime = detectMime(file)
    const invalid = validateFile(file)
    return {
      key: uuid(),
      file,
      mime,
      preview: invalid ? null : URL.createObjectURL(file),
      invalid,
      checking: !invalid,
      status: 'idle',
      progress: 0,
      uploadError: null,
    }
  }

  function checkDisplayable(list: Item[]) {
    for (const it of list) {
      if (it.invalid) continue
      void canDisplay(it.file).then((ok) => {
        updateItem(
          it.key,
          ok
            ? { checking: false }
            : { checking: false, invalid: 'O navegador não consegue exibir este arquivo. Troque por um JPEG, PNG ou WebP.' },
        )
      })
    }
  }

  function onGalleryPicked(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setMessage(null)
    const vacant = allowedAngles.filter((a) => slots[a] === null).length
    const accepted = files.slice(0, vacant)
    const ignored = files.length - accepted.length
    const newItems = accepted.map(makeItem)
    commitItems({ ...itemsRef.current, ...Object.fromEntries(newItems.map((i) => [i.key, i])) })
    const { slots: next } = assignInOrder(slots, newItems.map((i) => i.key), allowedAngles)
    setSlots(next)
    setSelected(null)
    setNotice(
      ignored > 0
        ? `Só cabem ${allowedAngles.length} fotos por etapa. ${ignored} ${ignored === 1 ? 'foto foi ignorada' : 'fotos foram ignoradas'}.`
        : null,
    )
    checkDisplayable(newItems)
  }

  function onSlotPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const angle = slotTarget.current
    slotTarget.current = null
    if (!file || !angle) return
    setMessage(null)
    const old = slots[angle]
    if (old) discardItem(old)
    const item = makeItem(file)
    commitItems({ ...itemsRef.current, [item.key]: item })
    setSlots(setSlot(slots, angle, item.key))
    if (phase === 'partial') setPhase('editing')
    setSelected(null)
    checkDisplayable([item])
  }

  function pickForSlot(angle: Angle) {
    slotTarget.current = angle
    slotInput.current?.click()
  }

  function onSlotTap(angle: Angle) {
    if (busy || lockedAngles.includes(angle)) return
    if (selected === null) {
      if (slots[angle]) setSelected(angle)
      else pickForSlot(angle)
    } else if (selected === angle) {
      setSelected(null)
    } else {
      setSlots(swapSlots(slots, selected, angle))
      setSelected(null)
    }
  }

  function removeSlot(angle: Angle) {
    const key = slots[angle]
    if (!key) return
    discardItem(key)
    setSlots(clearSlot(slots, angle))
    if (phase === 'partial') setPhase('editing')
    setSelected(null)
  }

  const filled = filledAngles(slots)
  const filledItems = filled.map((a) => items[slots[a]!]).filter(Boolean)
  const invalidCount = filledItems.filter((i) => i.invalid).length
  const checkingCount = filledItems.filter((i) => i.checking).length
  const doneCount = filledItems.filter((i) => i.status === 'done').length
  const failedItems = filledItems.filter((i) => i.status === 'error')

  const productNames = useMemo(
    () => [...new Set((experiments ?? []).filter((e) => e.product_mode === 'named').map((e) => e.product_name!))].sort(),
    [experiments],
  )

  function validate(): string | null {
    if (kind !== 'complete' && !stageType) return 'Escolha a etapa: Molhado, Seco ou Dia seguinte.'
    if (!filled.length) return 'Escolha ao menos uma foto.'
    if (invalidCount) return 'Troque ou remova os arquivos marcados com problema.'
    if (checkingCount) return 'Aguarde a verificação das fotos.'
    if (kind !== 'complete' && !localInputToIso(capturedAt)) return 'Informe uma data e horário válidos.'
    return null
  }

  async function save(onlyCompleted = false) {
    if (busyRef.current) return // bloqueia toque repetido
    const problem = validate()
    if (problem) {
      setMessage(problem)
      return
    }
    busyRef.current = true
    setBusy(true)
    setMessage(null)
    setSelected(null)
    const entries = filled.map((angle) => ({ angle, key: slots[angle]! }))
    try {
      if (!onlyCompleted) {
        setPhase('uploading')
        const pending = entries.filter((e) => itemsRef.current[e.key]?.status !== 'done')
        await runPool(pending, 2, async ({ key }) => {
          const it = itemsRef.current[key]
          updateItem(key, { status: 'uploading', progress: 0, uploadError: null })
          try {
            await uploadPhoto({
              path: pathFor(it),
              file: it.file,
              contentType: it.mime,
              onProgress: (f) => updateItem(key, { progress: f }),
            })
            updateItem(key, { status: 'done', progress: 1 })
          } catch (err) {
            updateItem(key, { status: 'error', uploadError: (err as Error).message || 'Falha no envio' })
          }
        })
      }

      const done = entries.filter((e) => itemsRef.current[e.key]?.status === 'done')
      const failed = entries.filter((e) => itemsRef.current[e.key]?.status !== 'done')
      if (!done.length || (failed.length && !onlyCompleted)) {
        setPhase('partial')
        return
      }

      setPhase('finalizing')
      finalizeAttemptedRef.current = true
      const photos: FinalizePhoto[] = done.map(({ angle, key }) => {
        const it = itemsRef.current[key]
        return { id: key, angle, storage_path: pathFor(it), mime_type: it.mime, size_bytes: it.file.size }
      })
      try {
        await finalizeStage({
          experimentId,
          stageId,
          photos,
          newExperiment: kind !== 'complete' && startNewExperiment ? productFromForm(noFinisher, productName) : null,
          newStage:
            kind === 'complete'
              ? null
              : { stage_type: stageType!, captured_at: localInputToIso(capturedAt)!, notes: notes.trim() || null },
        })
      } catch (err) {
        if (!(err instanceof AmbiguousError)) throw err
        // Resposta perdida: o banco é a fonte da verdade.
        const linked = await linkedPhotoIds(photos.map((p) => p.id)).catch(() => null)
        if (!linked || !photos.every((p) => linked.has(p.id))) {
          throw new Error('Não foi possível confirmar o salvamento. Verifique a conexão e toque em Salvar de novo; nada será duplicado.')
        }
      }

      finalizedRef.current = true
      // Fotos que falharam e foram deixadas de fora: entram na limpeza.
      for (const { key } of failed) discardItem(key)
      const toClean = [...discardedRef.current]
      discardedRef.current = []
      void removeUnlinkedObjects(toClean)
      await reload()
      if (kind === 'complete') navigate(`/etapa/${stageId}`, { replace: true })
      else navigate(`/?salvo=${stageId}`, { replace: true })
    } catch (err) {
      setPhase('error')
      setMessage((err as Error).message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const title = kind === 'new' ? 'Novo registro' : kind === 'add' ? 'Adicionar etapa' : 'Completar fotos'
  const product = productFromForm(noFinisher, productName)
  const capturedIso = localInputToIso(capturedAt)
  const lockedUrls = useSignedUrls(lockedAngles.map((a) => photoByAngle(stage!, a)!.storage_path)).urls

  return (
    <main className="page form-page">
      <a className="back" href={href(kind === 'complete' ? `/etapa/${stageId}` : '/')}>
        ← Voltar
      </a>
      <h1>{title}</h1>

      {kind === 'complete' && stage && experiment && (
        <p className="muted">
          {STAGE_LABEL[stage.stage_type]} · {productLabel(experiment)} · {formatDateTime(stage.captured_at)}
        </p>
      )}

      {/* Fotos ------------------------------------------------------------ */}
      <section className="card stack">
        <div className="section-head">
          <h2>Fotos</h2>
          <span className="muted small">{filled.length + lockedAngles.length}/4</span>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => galleryInput.current?.click()}
          disabled={busy || allowedAngles.every((a) => slots[a] !== null)}
        >
          {filled.length ? 'Escolher mais fotos da galeria' : `Escolher ${kind === 'complete' ? 'fotos' : 'de 1 a 4 fotos'} da galeria`}
        </button>
        <input ref={galleryInput} type="file" accept={INPUT_ACCEPT} multiple hidden onChange={onGalleryPicked} data-testid="gallery-input" />
        <input ref={slotInput} type="file" accept={INPUT_ACCEPT} hidden onChange={onSlotPicked} data-testid="slot-input" />
        {notice && <p className="alert alert-info">{notice}</p>}
        <p className="muted small">
          {selected
            ? `Toque em outro espaço para trocar com ${ANGLE_LABEL[selected]}.`
            : 'Toque numa foto e depois em outro espaço para corrigir o ângulo. Esquerdo/direito é o lado da pessoa fotografada.'}
        </p>

        <div className="slot-grid">
          {ANGLES.map((angle) => {
            const locked = lockedAngles.includes(angle)
            const key = slots[angle]
            const it = key ? items[key] : undefined
            const lockedPhoto = locked && stage ? photoByAngle(stage, angle) : undefined
            return (
              <div key={angle} className="slot" data-angle={angle}>
                <button
                  type="button"
                  className={`slot-target ${selected === angle ? 'selected' : ''} ${selected && selected !== angle && !locked ? 'drop' : ''} ${locked ? 'locked' : ''}`}
                  onClick={() => onSlotTap(angle)}
                  disabled={busy || locked}
                  aria-label={`${ANGLE_LABEL[angle]}${it ? `: ${it.file.name}` : locked ? ': já publicada' : ': vazio'}`}
                  aria-pressed={selected === angle}
                >
                  {lockedPhoto ? (
                    <PhotoView url={lockedUrls[lockedPhoto.storage_path]} alt={ANGLE_LABEL[angle]} />
                  ) : it ? (
                    it.preview && !it.invalid ? (
                      <div className="photo-frame">
                        <img src={it.preview} alt={`Pré-visualização ${ANGLE_LABEL[angle]}`} />
                      </div>
                    ) : (
                      <div className="photo-frame empty invalid">{it.file.name}</div>
                    )
                  ) : (
                    <div className="photo-frame empty">+ Foto</div>
                  )}
                  {it && <StatusBadge item={it} />}
                  {locked && <span className="badge">Publicada</span>}
                </button>
                <div className="slot-label">{ANGLE_LABEL[angle]}</div>
                {it?.invalid && <p className="slot-error">{it.invalid}</p>}
                {it?.uploadError && it.status === 'error' && <p className="slot-error">Falhou: {it.uploadError}</p>}
                {it && (
                  <div className="slot-actions">
                    <button type="button" className="link" onClick={() => pickForSlot(angle)} disabled={busy}>
                      Trocar
                    </button>
                    <button type="button" className="link danger" onClick={() => removeSlot(angle)} disabled={busy}>
                      Remover
                    </button>
                  </div>
                )}
                {it && !it.invalid && <div className="slot-meta muted small">{formatBytes(it.file.size)}</div>}
              </div>
            )
          })}
        </div>
      </section>

      {/* Etapa, data, produto, observação -------------------------------- */}
      {kind !== 'complete' && (
        <section className="card stack">
          <fieldset className="field">
            <legend>Etapa</legend>
            <div className="segmented" role="radiogroup">
              {STAGE_TYPES.map((t) => (
                <label key={t} className={`seg ${stageType === t ? 'on' : ''}`}>
                  <input type="radio" name="stage" value={t} checked={stageType === t} onChange={() => setStageType(t)} disabled={busy} />
                  {STAGE_LABEL[t]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="field">
            <span>Data e horário</span>
            <input type="datetime-local" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} disabled={busy} />
            <small className="muted">{capturedIso ? `${formatDateTime(capturedIso)} (horário deste aparelho)` : 'Data inválida'}</small>
          </label>

          {kind === 'add' && !startNewExperiment ? (
            <div className="field">
              <span>Produto</span>
              <p className="inherited">{productLabel(experiment!)}</p>
              <button type="button" className="link" onClick={() => setStartNewExperiment(true)} disabled={busy || finalizeAttemptedRef.current}>
                Usou outro produto ou finalização? Criar novo experimento
              </button>
            </div>
          ) : (
            <div className="field">
              <label className="field">
                <span>Produto</span>
                <input
                  type="text"
                  list="product-names"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Ex.: Ondulando a Gema"
                  disabled={busy || noFinisher}
                  maxLength={200}
                />
              </label>
              <datalist id="product-names">
                {productNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <label className="check">
                <input type="checkbox" checked={noFinisher} onChange={(e) => setNoFinisher(e.target.checked)} disabled={busy} />
                Sem finalizador
              </label>
              <small className="muted">Será salvo como: {productLabel(product)}</small>
              {kind === 'add' && (
                <button type="button" className="link" onClick={() => setStartNewExperiment(false)} disabled={busy || finalizeAttemptedRef.current}>
                  Voltar a usar o experimento “{productLabel(experiment!)}”
                </button>
              )}
            </div>
          )}

          <label className="field">
            <span>Observação (opcional)</span>
            <textarea rows={3} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} disabled={busy} placeholder="Como ficou? Volume, definição, frizz…" />
          </label>
        </section>
      )}

      {/* Progresso e ações ----------------------------------------------- */}
      <section className="save-bar">
        {phase === 'uploading' && busy && (
          <p className="alert alert-info" role="status">
            Enviando fotos… {doneCount} de {filled.length} concluídas
          </p>
        )}
        {phase === 'finalizing' && busy && (
          <p className="alert alert-info" role="status">
            Salvando registro…
          </p>
        )}
        {phase === 'partial' && !busy && (
          <div className="alert alert-error" role="alert">
            <p>
              {failedItems.length === 1 ? '1 foto não foi enviada.' : `${failedItems.length} fotos não foram enviadas.`} Seus dados continuam aqui.
            </p>
            <div className="row-actions">
              <button type="button" className="btn btn-primary" onClick={() => void save(false)}>
                Tentar novamente
              </button>
              {doneCount > 0 && (
                <button type="button" className="btn" onClick={() => void save(true)}>
                  Salvar só {doneCount === 1 ? 'a foto concluída' : `as ${doneCount} fotos concluídas`}
                </button>
              )}
            </div>
          </div>
        )}
        {message && (
          <p className="alert alert-error" role="alert">
            {message}
          </p>
        )}
        {phase !== 'partial' && (
          <button type="button" className="btn btn-primary btn-block btn-large" onClick={() => void save(false)} disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        )}
        <a className="btn btn-ghost btn-block" href={href(kind === 'complete' ? `/etapa/${stageId}` : '/')} aria-disabled={busy}>
          Cancelar
        </a>
        <p className="muted small center">Até {MAX_PHOTOS} fotos JPEG, PNG ou WebP, com até 15 MB cada.</p>
      </section>
    </main>
  )
}

function StatusBadge({ item }: { item: Item }) {
  if (item.checking) return <span className="badge">Verificando…</span>
  if (item.status === 'uploading') return <span className="badge">Enviando {Math.round(item.progress * 100)}%</span>
  if (item.status === 'done') return <span className="badge ok">✓ Enviada</span>
  if (item.status === 'error') return <span className="badge err">Falhou</span>
  if (item.invalid) return <span className="badge err">Não aceita</span>
  return null
}
