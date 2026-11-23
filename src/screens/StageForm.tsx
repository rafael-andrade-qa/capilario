// Formulário de fotos, numa tela só, para: Nova finalização dentro de um produto, próximo
// momento de uma finalização (+ Seco, + Dia seguinte) e Completar fotos de um momento.
// O produto já é conhecido em todos os casos (cadastrar produto é outra tela).
//
// Consistência do envio:
//  * IDs de experimento, etapa e fotos são reservados ao abrir o formulário/escolher o arquivo
//    e permanecem estáveis durante as tentativas (o caminho não depende do ângulo).
//  * Uploads já confirmados são reaproveitados em "Tentar novamente".
//  * A finalização grava experimento + etapa + fotos numa única transação (finalize_stage),
//    idempotente. Se a resposta se perder, consultamos o banco antes de declarar falha.
//  * Arquivos descartados só são apagados depois de confirmar no banco que não foram associados.
import { PageSkeleton } from '../components/Skeleton'
import { takePendingRoutine } from './RoutineEdit'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { DateTimeField } from '../components/DateTimeField'
import { PageHeader } from '../components/PageHeader'
import { PhotoView } from '../components/PhotoView'
import { AmbiguousError, uploadThumb, finalizeStage, linkedPhotoIds, removeUnlinkedObjects, saveRoutine, setPhotoCrops, type FinalizePhoto } from '../lib/api'
import { medianDate, photoTakenAt } from '../lib/exif'
import { analyzePhoto, warmUpAnalysis, type Analysis } from '../lib/faces'
import { cropStyle, momentCrops, type Crop } from '../lib/framing'
import {
  ANGLES,
  ANGLE_LABEL,
  STAGE_LABEL,
  STAGE_TYPES,
  formatDateTime,
  finalizationWhen,
  findFinalization,
  localInputToIso,
  momentFromSlug,
  missingAngles,
  photoByAngle,
  productFromForm,
  brandLabel,
  productLabel,
  toLocalInputValue,
  type Angle,
  type Experiment,
  type Finalization,
  type Stage,
  type StageType,
  NO_FINISHER_ID,
} from '../lib/domain'
import { EXT_BY_MIME, INPUT_ACCEPT, canDisplay, detectMime, validateFile, type AcceptedMime } from '../lib/files'
import { href, navigate } from '../lib/router'
import { assignInOrder, clearSlot, emptySlots, filledAngles, setSlot, swapSlots, type Slots } from '../lib/slots'
import { findStage, useHistory, useSignedUrls } from '../lib/state'
import { uploadPhoto } from '../lib/upload'
import { prepareImage, type PreparedImage } from '../lib/images'
import { uuid } from '../lib/uuid'

type RouteProps =
  | { kind: 'add'; userId: string; experimentId: string; finalizationId?: string | null }
  | { kind: 'complete'; userId: string; stageId: string }
  | { kind: 'moment'; userId: string; finalizationId: string; moment: string }

export { NO_FINISHER_ID }

export function StageFormRoute(props: RouteProps) {
  const { experiments } = useHistory()
  if (experiments === null) return <PageSkeleton />
  if (props.kind === 'add') {
    if (props.experimentId === NO_FINISHER_ID) {
      // Sem finalizador: usa o do histórico; se ainda não existe, a primeira finalização o cria.
      const existing = experiments.find((e) => e.product_mode === 'none')
      return (
        <StageForm
          key="sem-finalizador"
          kind="add"
          userId={props.userId}
          experiment={existing ?? newNoFinisher()}
          createsNoFinisher={!existing}
          presetFinalizationId={props.finalizationId ?? undefined}
        />
      )
    }
    const experiment = experiments.find((e) => e.id === props.experimentId)
    if (!experiment) return <NotFound text="Produto não encontrado." />
    return <StageForm key={experiment.id} kind="add" userId={props.userId} experiment={experiment} presetFinalizationId={props.finalizationId ?? undefined} />
  }
  if (props.kind === 'moment') {
    const type = momentFromSlug(props.moment)
    const hit = findFinalization(experiments, props.finalizationId)
    if (!hit || !type) return <NotFound text="Finalização não encontrada." />
    if (hit.finalization.moments[type]) return <NotFound text={`Esta finalização já tem o ${STAGE_LABEL[type]}.`} />
    return (
      <StageForm
        key={`${hit.finalization.id}-${type}`}
        kind="moment"
        userId={props.userId}
        experiment={hit.experiment}
        finalization={hit.finalization}
        momentType={type}
      />
    )
  }
  const found = findStage(experiments, props.stageId)
  if (!found) return <NotFound text="Momento não encontrado." />
  return <StageForm key={found.stage.id} kind="complete" userId={props.userId} experiment={found.experiment} stage={found.stage} />
}

function NotFound({ text }: { text: string }) {
  return (
    <main className="page">
      <PageHeader title="Registro" back={{ label: 'Voltar ao histórico', href: href('/') }} />
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
  /** Quando a foto foi tirada (metadados do arquivo); undefined = ainda lendo. */
  takenAt?: Date | null
  /** Tamanho e rosto, para o enquadramento automático; undefined = ainda analisando. */
  analysis?: Analysis | null
  /** O que sobe de fato: a foto reduzida (se era grande) e a miniatura. */
  ready?: PreparedImage
}

/** Formato do arquivo que sobe (a foto reduzida vira JPEG). */
const uploadMime = (it: Item) => it.ready?.mime ?? it.mime
const filePath = (userId: string, stageId: string, it: Item) =>
  `${userId}/${stageId}/${it.key}.${EXT_BY_MIME[uploadMime(it) as AcceptedMime] ?? 'bin'}`

type Phase = 'editing' | 'uploading' | 'partial' | 'finalizing' | 'error'

function newNoFinisher(): Experiment {
  return { id: uuid(), product_mode: 'none', product_name: null, brand: null, photo_path: null, created_at: new Date().toISOString(), stages: [] }
}

interface FormProps {
  kind: 'add' | 'complete' | 'moment'
  /** Sem finalizador ainda não existe no banco: a finalização o cria. */
  createsNoFinisher?: boolean
  userId: string
  experiment?: Experiment
  stage?: Stage
  finalization?: Finalization
  momentType?: StageType
  /** Finalização nova com id já escolhido (vem da rotina, que é gravada junto). */
  presetFinalizationId?: string
}

async function runPool<T>(list: T[], limit: number, fn: (t: T) => Promise<void>) {
  const queue = [...list]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!)
  })
  await Promise.all(workers)
}

function StageForm({ kind, userId, experiment, stage, finalization, momentType, createsNoFinisher = false, presetFinalizationId }: FormProps) {
  const { reload } = useHistory()

  // IDs reservados uma vez por formulário.
  const [stageId] = useState(() => stage?.id ?? uuid())
  const [newFinalizationId] = useState(() => presetFinalizationId ?? uuid())
  // Nova finalização = finalização nova; próximo momento = a finalização escolhida.
  const finalizationId = kind === 'moment' ? finalization!.id : kind === 'complete' ? stage!.finalization_id : newFinalizationId

  const lockedAngles: Angle[] = kind === 'complete' && stage ? ANGLES.filter((a) => photoByAngle(stage, a)) : []
  const allowedAngles: Angle[] = kind === 'complete' && stage ? missingAngles(stage) : [...ANGLES]

  const [slots, setSlots] = useState<Slots<string>>(emptySlots)
  const [items, setItems] = useState<Record<string, Item>>({})
  const itemsRef = useRef(items)
  const [selected, setSelected] = useState<Angle | null>(null)

  // Uma finalização nova quase sempre começa no Molhado.
  const [stageType, setStageType] = useState<StageType | null>(kind === 'moment' ? momentType! : kind === 'complete' ? null : 'wet')
  const [capturedAt, setCapturedAt] = useState(() => toLocalInputValue(new Date()))
  // Data e horário vêm das fotos até a pessoa mexer no campo.
  const [dateTouched, setDateTouched] = useState(false)
  const [dateFromPhotos, setDateFromPhotos] = useState(false)
  const analysisRef = useRef<Record<string, Promise<void>>>({})
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
    (item: Item) => filePath(userId, stageId, item),
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
          if (it.status !== 'idle') pending.push({ photoId: it.key, path: filePath(userId, stageId, it) })
        }
      }
      for (const it of Object.values(itemsRef.current)) if (it.preview) URL.revokeObjectURL(it.preview)
      if (pending.length) void removeUnlinkedObjects(pending)
    }
  }, [userId, stageId])

  // Começa a baixar os modelos do enquadramento automático enquanto a pessoa escolhe as fotos.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (idle) idle(warmUpAnalysis)
    else window.setTimeout(warmUpAnalysis, 800)
  }, [])

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

  // Lê o horário e procura o rosto de cada foto nova, em segundo plano.
  function analyze(list: Item[]) {
    for (const it of list) {
      if (it.invalid) continue
      void photoTakenAt(it.file).then((takenAt) => updateItem(it.key, { takenAt }))
      analysisRef.current[it.key] = analyzePhoto(it.file).then((analysis) => updateItem(it.key, { analysis }))
    }
  }

  function checkDisplayable(list: Item[]) {
    analyze(list)
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
        ? `Só cabem ${allowedAngles.length} fotos por momento. ${ignored} ${ignored === 1 ? 'foto foi ignorada' : 'fotos foram ignoradas'}.`
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

  const photoTimes = filledItems.map((i) => i.takenAt).filter((d): d is Date => d instanceof Date)
  const photoTime = medianDate(photoTimes)
  const photoTimeValue = photoTime ? toLocalInputValue(photoTime) : null
  useEffect(() => {
    if (kind === 'complete' || dateTouched || !photoTimeValue) return
    setCapturedAt(photoTimeValue)
    setDateFromPhotos(true)
  }, [kind, dateTouched, photoTimeValue])

  // Enquadramento automático pela cabeça (cabelo + rosto), na escala do rosto da frente.
  const analyzed = filled
    .map((angle) => ({ angle, it: items[slots[angle]!] }))
    .filter(({ it }) => it?.analysis)
    .map(({ angle, it }) => ({ key: it.key, W: it.analysis!.W, H: it.analysis!.H, face: it.analysis!.face, hair: it.analysis!.hair, angle }))
  const autoCrops: Record<string, Crop> = momentCrops(analyzed)
  const invalidCount = filledItems.filter((i) => i.invalid).length
  const checkingCount = filledItems.filter((i) => i.checking).length
  const doneCount = filledItems.filter((i) => i.status === 'done').length
  const failedItems = filledItems.filter((i) => i.status === 'error')

  const experimentId = kind === 'complete' ? stage!.experiment_id : experiment!.id

  function validate(): string | null {
    if (kind !== 'complete') {
      if (!stageType) return 'Escolha o momento: Molhado, Seco ou Dia seguinte.'
      if (!localInputToIso(capturedAt)) return 'Informe uma data e horário válidos.'
    }
    if (!filled.length) return 'Escolha ao menos uma foto.'
    if (invalidCount) return 'Troque ou remova os arquivos marcados com problema.'
    if (checkingCount) return 'Aguarde a verificação das fotos.'
    return null
  }

  /** Guarda o enquadramento automático das fotos salvas (espera a análise, até 10 s). */
  async function saveAutoCrops(done: { angle: Angle; key: string }[]) {
    try {
      const pending = done.map(({ key }) => analysisRef.current[key]).filter(Boolean)
      await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, 10000))])
      const list = done
        .map(({ angle, key }) => ({ angle, it: itemsRef.current[key] }))
        .filter(({ it }) => it?.analysis)
        .map(({ angle, it }) => ({ key: it.key, W: it.analysis!.W, H: it.analysis!.H, face: it.analysis!.face, hair: it.analysis!.hair, angle }))
      const crops = momentCrops(list)
      await setPhotoCrops(Object.entries(crops).map(([photoId, crop]) => ({ photoId, crop })))
    } catch {
      // O enquadramento é um extra: se falhar, a foto aparece preenchendo o quadro.
    }
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
          updateItem(key, { status: 'uploading', progress: 0, uploadError: null })
          try {
            // Reduz a foto grande e gera a miniatura no aparelho (uma vez só, mesmo tentando de novo).
            if (!itemsRef.current[key].ready) updateItem(key, { ready: await prepareImage(itemsRef.current[key].file, itemsRef.current[key].mime) })
            const it = itemsRef.current[key]
            await uploadPhoto({
              path: pathFor(it),
              file: it.ready!.file,
              contentType: uploadMime(it),
              onProgress: (f) => updateItem(key, { progress: f }),
            })
            await uploadThumb(pathFor(it), it.ready!.thumb)
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
        return { id: key, angle, storage_path: pathFor(it), mime_type: uploadMime(it), size_bytes: (it.ready?.file ?? it.file).size }
      })
      try {
        await finalizeStage({
          experimentId,
          stageId,
          photos,
          newExperiment: createsNoFinisher ? productFromForm(true, '') : null,
          newStage:
            kind === 'complete'
              ? null
              : { stage_type: stageType!, captured_at: localInputToIso(capturedAt)!, notes: notes.trim() || null, finalization_id: finalizationId },
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
      // Finalização nova que veio da rotina: grava a rotina junto (a finalização já existe).
      if (kind === 'add') {
        const pending = takePendingRoutine(finalizationId)
        if (pending) await saveRoutine(finalizationId, pending).catch(() => undefined)
      }
      await saveAutoCrops(done)
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

  const title = kind === 'complete' ? 'Completar fotos' : kind === 'moment' ? STAGE_LABEL[momentType!] : 'Nova finalização'
  const capturedIso = localInputToIso(capturedAt)
  const lockedUrls = useSignedUrls(lockedAngles.map((a) => photoByAngle(stage!, a)!.storage_path)).urls

  return (
    <main className="page form-page">
      <PageHeader
        title={title}
        back={{ label: 'Voltar', href: href(kind === 'complete' ? `/etapa/${stageId}` : '/') }}
      />

      {kind === 'complete' && stage && experiment && (
        <p className="muted">
          {STAGE_LABEL[stage.stage_type]} · {productLabel(experiment)} · {formatDateTime(stage.captured_at)}
        </p>
      )}

      {/* Uma tela só: (momento), data, fotos e observação ----------------------- */}
      {(
        <section className="card form-fields compact-form">
          {kind !== 'complete' && (
            <>
              <div className="field moment-head">
                <p className="moment-context muted small">
                  {kind === 'moment' ? (
                    <>
                      Finalização de {finalizationWhen(finalization!).replace(/^(Hoje|Ontem)$/, (w) => w.toLowerCase())} · <span>{productLabel(experiment!)}</span>
                    </>
                  ) : (
                    <>
                      <span>{productLabel(experiment!)}</span>
                      {brandLabel(experiment!) && <> · {brandLabel(experiment!)}</>}
                    </>
                  )}
                </p>
                {kind === 'add' && (
                  <div className="segmented moment-picker" role="radiogroup" aria-label="Momento" aria-required="true">
                    {STAGE_TYPES.map((t) => (
                      <label key={t} className={`seg ${stageType === t ? 'on' : ''}`}>
                        <input type="radio" name="stage" value={t} checked={stageType === t} onChange={() => setStageType(t)} disabled={busy} />
                        {STAGE_LABEL[t]}
                      </label>
                    ))}
                  </div>
                )}
                <span id="f-data-label" className="visually-hidden">
                  Data e horário
                </span>
                <DateTimeField
                  id="f-data"
                  labelledBy="f-data-label"
                  value={capturedAt}
                  onChange={(v) => {
                    setDateTouched(true)
                    setDateFromPhotos(false)
                    setCapturedAt(v)
                  }}
                  disabled={busy}
                />
                {!capturedIso && <small className="slot-error">Data inválida</small>}
                {capturedIso && dateFromPhotos && <small className="muted small date-from-photo">Horário tirado das fotos.</small>}
              </div>
            </>
          )}
          <div className="field">
            <div className="label-row">
              <span className="field-label">
                Fotos
                {kind !== 'complete' && <Req />}
              </span>
              <span className="muted small">{filled.length + lockedAngles.length}/4</span>
            </div>
            <button
              type="button"
              className={`btn btn-block ${filled.length ? '' : 'btn-outline-brand'}`}
              onClick={() => galleryInput.current?.click()}
              disabled={busy || allowedAngles.every((a) => slots[a] !== null)}
            >
              {filled.length ? '+ Mais fotos da galeria' : '+ Escolher da galeria'}
            </button>
          </div>
          <input ref={galleryInput} type="file" accept={INPUT_ACCEPT} multiple hidden onChange={onGalleryPicked} data-testid="gallery-input" />
          <input ref={slotInput} type="file" accept={INPUT_ACCEPT} hidden onChange={onSlotPicked} data-testid="slot-input" />
          {notice && <p className="alert alert-info">{notice}</p>}

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
                      <PhotoView url={lockedUrls[lockedPhoto.storage_path]} crop={lockedPhoto.crop} alt={ANGLE_LABEL[angle]} />
                    ) : it ? (
                      it.preview && !it.invalid ? (
                        <div className={`photo-frame ${autoCrops[it.key] ? 'cropped' : 'fit-cover'}`}>
                          <img
                            src={it.preview}
                            alt={`Pré-visualização ${ANGLE_LABEL[angle]}`}
                            style={autoCrops[it.key] ? cropStyle(autoCrops[it.key]) : undefined}
                          />
                        </div>
                      ) : (
                        <div className="photo-frame empty invalid">{it.file.name}</div>
                      )
                    ) : (
                      <div className="photo-frame empty plus" aria-hidden="true">
                        +
                      </div>
                    )}
                    {it && <StatusBadge item={it} />}
                    {locked && <span className="badge">Publicada</span>}
                  </button>
                  <div className="slot-label">{ANGLE_LABEL[angle]}</div>
                  {it?.invalid && <p className="slot-error">{it.invalid}</p>}
                  {it?.uploadError && it.status === 'error' && <p className="slot-error">Falhou: {it.uploadError}</p>}
                  {it && (
                    <div className="slot-actions">
                      <button type="button" className="mini-btn" onClick={() => pickForSlot(angle)} disabled={busy} aria-label="Trocar" title="Trocar arquivo">
                        ↻
                      </button>
                      <button type="button" className="mini-btn danger" onClick={() => removeSlot(angle)} disabled={busy} aria-label="Remover" title="Remover">
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className={`muted small hint ${kind !== 'complete' && !selected ? 'visually-hidden' : ''}`}>
            {selected
              ? `Toque em outro espaço para trocar com ${ANGLE_LABEL[selected]}.`
              : `Toque em duas fotos para trocá-las de lugar. Esquerdo e direito: lado da pessoa na foto.`}
          </p>

          {kind !== 'complete' && (
            <div className="field">
              <label htmlFor="f-obs" className="field-label">
                Observação
              </label>
              <textarea id="f-obs" rows={2} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} disabled={busy} placeholder="Como ficou? Volume, definição, frizz…" />
            </div>
          )}

        </section>
      )}

      {/* Barra fixa: um único botão principal ao alcance do polegar ------------- */}
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
          <button type="button" className={`btn btn-primary btn-block btn-large ${busy ? 'is-busy' : ''}`} onClick={() => void save(false)} disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        )}
      </section>
    </main>
  )
}

/** Marca de campo obrigatório (o leitor de tela usa aria-required no campo). */
function Req() {
  return (
    <span className="req" aria-hidden="true">
      {' *'}
    </span>
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
