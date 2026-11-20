// Novo produto e Editar produto: nome, marca e foto da embalagem.
// Cadastrar não pede foto de cabelo; ao salvar, convida a registrar a primeira finalização
// (Registrar agora ou Depois). Editar vale para todas as finalizações do produto.
// No cadastro, "Identificar pela foto" preenche nome e marca e traz a foto oficial padronizada.
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { CameraIcon } from '../components/ActionIcons'
import { PageHeader } from '../components/PageHeader'
import { PhotoView } from '../components/PhotoView'
import { ProductThumb } from '../components/ProductThumb'
import { useToast } from '../components/Toasts'
import { createProduct, removeProductPhoto, setProductPhoto, updateExperiment } from '../lib/api'
import { brandLabel, finalizationsOf, productLabel, type Experiment } from '../lib/domain'
import { INPUT_ACCEPT, detectMime, validateFile } from '../lib/files'
import { identifyFromPhoto, type Candidate } from '../lib/identify'
import { CatalogPicker, type CatalogChoice } from './CatalogPicker'
import { href, navigate } from '../lib/router'
import { useHistory, useSession, useSignedUrls } from '../lib/state'
import { uuid } from '../lib/uuid'

const normalize = (v: string | null | undefined) =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

export function ProductEditRoute({ experimentId }: { experimentId: string }) {
  const { experiments } = useHistory()
  if (experiments === null) return <main className="page muted center">Carregando…</main>
  const experiment = experiments.find((e) => e.id === experimentId)
  if (!experiment || experiment.product_mode !== 'named') {
    return (
      <main className="page">
        <PageHeader title="Editar produto" back={{ label: 'Voltar ao histórico', href: href('/') }} />
        <p className="muted">Produto não encontrado.</p>
      </main>
    )
  }
  return <ProductEdit key={experiment.id} mode="edit" experiment={experiment} others={experiments.filter((e) => e.id !== experiment.id)} />
}

export function ProductNewRoute() {
  const { experiments } = useHistory()
  const [draft] = useState<Experiment>(() => ({
    id: uuid(),
    product_mode: 'named',
    product_name: null,
    brand: null,
    photo_path: null,
    created_at: new Date().toISOString(),
    stages: [],
  }))
  // Primeiro o catálogo; o formulário vem com o produto escolhido, com a foto para identificar
  // ou vazio (à mão).
  const [step, setStep] = useState<{ kind: 'search' } | { kind: 'form'; initial?: CatalogChoice; identify?: File }>({ kind: 'search' })
  if (experiments === null) return <main className="page muted center">Carregando…</main>
  if (step.kind === 'search') {
    return (
      <CatalogPicker
        others={experiments}
        onPick={(choice) => setStep({ kind: 'form', initial: choice })}
        onManual={() => setStep({ kind: 'form' })}
        onIdentify={(file) => setStep({ kind: 'form', identify: file })}
      />
    )
  }
  return (
    <ProductEdit
      mode="new"
      experiment={draft}
      others={experiments}
      initial={step.initial}
      identifyFile={step.identify}
      onBack={() => setStep({ kind: 'search' })}
    />
  )
}



/** owned: o preview é desta foto (escolhida na galeria); as fotos encontradas têm o seu. */
type PhotoChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'new'; file: File; mime: string; preview: string; error: string | null; owned: boolean }

function ProductEdit({
  mode,
  experiment,
  others,
  initial,
  identifyFile,
  onBack,
}: {
  mode: 'new' | 'edit'
  experiment: Experiment
  others: Experiment[]
  initial?: CatalogChoice
  identifyFile?: File
  onBack?: () => void
}) {
  const { session } = useSession()
  const { reload, experiments } = useHistory()
  const notify = useToast()
  const [created, setCreated] = useState(false)
  const brands = [...new Set(others.map((e) => e.brand).filter((b): b is string => !!b))].sort()
  const [name, setName] = useState(initial?.name ?? experiment.product_name ?? '')
  const [brand, setBrand] = useState(initial?.brand ?? experiment.brand ?? '')
  const [catalogId, setCatalogId] = useState<string | null>(initial?.catalogId ?? null)
  const [photo, setPhoto] = useState<PhotoChange>(() =>
    initial?.photo
      ? { kind: 'new', file: initial.photo, mime: initial.photo.type, preview: URL.createObjectURL(initial.photo), error: null, owned: true }
      : { kind: 'keep' },
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const idInput = useRef<HTMLInputElement>(null)
  const [identifying, setIdentifying] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [checkNote, setCheckNote] = useState(false)
  const { urls } = useSignedUrls(experiment.photo_path ? [experiment.photo_path] : [])
  const fins = finalizationsOf(experiment).length
  const locked = busy || identifying

  useEffect(() => () => { if (photo.kind === 'new' && photo.owned) URL.revokeObjectURL(photo.preview) }, [photo])
  useEffect(() => () => candidates.forEach((c) => URL.revokeObjectURL(c.preview)), [candidates])

  function onPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhoto({ kind: 'new', file, mime: detectMime(file), preview: URL.createObjectURL(file), error: validateFile(file), owned: true })
  }

  function pickCandidate(c: Candidate) {
    setPhoto({ kind: 'new', file: c.file, mime: c.file.type || 'image/jpeg', preview: c.preview, error: null, owned: false })
  }

  async function onIdentifyPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || locked) return
    const problem = validateFile(file)
    if (problem) {
      notify(problem, 'error')
      return
    }
    await runIdentify(file)
  }

  // Veio da busca do catálogo com a foto já escolhida: identifica logo ao abrir.
  const started = useRef(false)
  useEffect(() => {
    if (identifyFile && !started.current) {
      started.current = true
      void runIdentify(identifyFile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifyFile])

  async function runIdentify(file: File) {
    setIdentifying(true)
    setMessage(null)
    try {
      const r = await identifyFromPhoto(file)
      if (!r.found) {
        notify('Não reconheci um produto de cabelo nessa foto. Tente outra foto ou preencha à mão.', 'info')
        return
      }
      setName(r.name)
      setBrand(r.brand)
      setCheckNote(r.confidence !== 'high')
      // A função já procurou no catálogo; achou: nome, marca e foto dele.
      if (r.catalog) setCatalogId(r.catalog.id)
      const all = r.candidates
      setCandidates(all)
      if (all.length) {
        // Só põe a foto encontrada se a pessoa ainda não escolheu uma da galeria.
        if (!(photo.kind === 'new' && photo.owned)) pickCandidate(all[0])
        notify('Produto identificado. Confira e cadastre.', 'success')
      } else {
        notify('Achei o produto, mas não a foto oficial. Você pode pôr uma foto abaixo.', 'info')
      }
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setIdentifying(false)
    }
  }

  const nameChanged = name.trim() !== (experiment.product_name ?? '') || brand.trim() !== (experiment.brand ?? '')
  const changed = nameChanged || photo.kind !== 'keep'

  function validate(): string | null {
    if (!name.trim()) return 'Informe o nome do produto.'
    if (!brand.trim()) return 'Informe a marca do produto.'
    if (photo.kind === 'new' && photo.error) return 'Troque a foto do produto.'
    const dup = others.some((e) => e.product_mode === 'named' && normalize(e.product_name) === normalize(name) && normalize(e.brand) === normalize(brand))
    if (dup) return 'Já existe um produto com esse nome e essa marca no seu histórico.'
    return null
  }

  async function save() {
    if (busy || !session) return
    if (mode === 'edit' && !changed) {
      navigate('/')
      return
    }
    const problem = validate()
    setMessage(problem)
    if (problem) return
    setBusy(true)
    try {
      if (mode === 'new') {
        await createProduct(experiment.id, name, brand, catalogId)
        // O produto já está salvo; se a foto falhar, dá para pôr depois pelo lápis.
        if (photo.kind === 'new') {
          await setProductPhoto(session.user.id, experiment.id, photo.file, photo.mime).catch(() =>
            notify('A foto do produto não foi enviada. Toque no lápis do produto para tentar de novo.', 'error'),
          )
        }
        await reload()
        setCreated(true)
        setBusy(false)
        return
      }
      if (nameChanged) await updateExperiment(experiment.id, name, brand)
      if (photo.kind === 'new') await setProductPhoto(session.user.id, experiment.id, photo.file, photo.mime)
      if (photo.kind === 'remove') await removeProductPhoto(experiment.id)
      await reload()
      navigate(`/?produto=${Date.now()}`, { replace: true })
    } catch (e) {
      setMessage((e as Error).message)
      setBusy(false)
    }
  }

  if (created) {
    const saved = experiments?.find((e) => e.id === experiment.id) ?? { ...experiment, product_name: name.trim(), brand: brand.trim() }
    return <ProductCreated experiment={saved} />
  }

  const currentUrl = experiment.photo_path ? urls[experiment.photo_path] : undefined
  const showPhoto = photo.kind === 'new' ? (photo.error ? null : photo.preview) : photo.kind === 'keep' ? currentUrl : null
  const hasPhoto = photo.kind === 'new' || (photo.kind === 'keep' && !!experiment.photo_path)

  return (
    <main className="page form-page">
      <PageHeader
        title={mode === 'new' ? 'Novo produto' : 'Editar produto'}
        back={onBack ? { label: 'Voltar à busca', onClick: onBack, disabled: locked } : { label: 'Voltar ao histórico', href: href('/') }}
      />
      <section className="card form-fields">
        {mode === 'edit' && fins > 0 && (
          <p className="muted small edit-scope">
            Vale para {fins === 1 ? 'a finalização' : `as ${fins} finalizações`} deste produto.
          </p>
        )}
        {mode === 'new' && !initial && (
          <div className="identify">
            <button type="button" className="btn btn-outline-brand btn-block" onClick={() => idInput.current?.click()} disabled={locked} aria-busy={identifying}>
              {identifying ? <span className="spinner" aria-hidden="true" /> : <CameraIcon size={20} />}
              {identifying ? 'Identificando o produto…' : 'Identificar pela foto'}
            </button>
            <p className="muted small identify-hint">
              {identifying
                ? 'Lendo a embalagem e buscando a foto oficial. Leva uns segundos.'
                : 'Tire uma foto da embalagem: o app preenche o nome e a marca e busca a foto oficial.'}
            </p>
            <input ref={idInput} type="file" accept={INPUT_ACCEPT} hidden onChange={(e) => void onIdentifyPicked(e)} data-testid="identify-input" />
          </div>
        )}
        <div className="field">
          <label htmlFor="e-produto" className="field-label">
            Produto<span className="req" aria-hidden="true"> *</span>
          </label>
          <input
            id="e-produto"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={locked}
            required
            aria-required="true"
            maxLength={200}
            placeholder="Ex.: Creme de Pentear"
          />
        </div>
        <div className="field">
          <label htmlFor="e-marca" className="field-label">
            Marca<span className="req" aria-hidden="true"> *</span>
          </label>
          <input
            id="e-marca"
            type="text"
            list="e-marcas"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            disabled={locked}
            required
            aria-required="true"
            maxLength={100}
            placeholder="Ex.: Widi Care"
          />
          <datalist id="e-marcas">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          {checkNote && <p className="muted small check-note">Confira o nome e a marca: a foto não estava muito nítida.</p>}
        </div>
        <div className="field">
          <span className="field-label">Foto do produto</span>
          {candidates.length > 0 ? (
            <>
              <div className="candidate-strip" role="group" aria-label="Fotos encontradas">
                {candidates.map((c, i) => {
                  const on = photo.kind === 'new' && photo.file === c.file
                  return (
                    <button
                      key={c.preview}
                      type="button"
                      className={`candidate${on ? ' on' : ''}`}
                      aria-pressed={on}
                      aria-label={`Usar a foto ${i + 1}, de ${c.source}`}
                      onClick={() => pickCandidate(c)}
                      disabled={locked}
                    >
                      <img src={c.preview} alt="" />
                    </button>
                  )
                })}
                <button
                  type="button"
                  className={`candidate own${photo.kind === 'new' && photo.owned ? ' on' : ''}`}
                  aria-pressed={photo.kind === 'new' && photo.owned}
                  aria-label={photo.kind === 'new' && photo.owned ? 'Trocar a foto da galeria' : 'Usar uma foto da galeria'}
                  onClick={() => input.current?.click()}
                  disabled={locked}
                >
                  {photo.kind === 'new' && photo.owned && !photo.error ? <img src={photo.preview} alt="" /> : <span className="plus" aria-hidden="true">+</span>}
                </button>
              </div>
              <p className="muted small candidate-hint">Toque na foto que preferir. O + usa uma foto sua.</p>
            </>
          ) : (
          <div className="product-photo-field">
            <button
              type="button"
              className="product-photo-pick"
              onClick={() => input.current?.click()}
              disabled={locked}
              aria-label={hasPhoto ? 'Trocar foto do produto' : 'Adicionar foto do produto'}
            >
              {showPhoto ? (
                photo.kind === 'new' ? <img src={showPhoto} alt="" /> : <PhotoView url={showPhoto} alt="" />
              ) : (
                <span className="product-photo-empty" aria-hidden="true">
                  <span className="plus">+</span>
                </span>
              )}
            </button>
            <div className="product-photo-text">
              <span className="muted small">A embalagem vira a miniatura do produto no histórico.</span>
              {hasPhoto && (
                <button type="button" className="link danger small-link" onClick={() => setPhoto(experiment.photo_path ? { kind: 'remove' } : { kind: 'keep' })} disabled={locked}>
                  Remover foto
                </button>
              )}
            </div>
          </div>
          )}
          {photo.kind === 'new' && photo.error && <p className="slot-error">{photo.error}</p>}
          <input ref={input} type="file" accept={INPUT_ACCEPT} hidden onChange={onPicked} data-testid="edit-product-photo" />
        </div>
      </section>

      <section className="save-bar">
        {message && (
          <p className="alert alert-error" role="alert">
            {message}
          </p>
        )}
        <button type="button" className="btn btn-primary btn-block btn-large" onClick={() => void save()} disabled={locked}>
          {busy ? 'Salvando…' : mode === 'new' ? 'Cadastrar produto' : 'Salvar'}
        </button>
      </section>
    </main>
  )
}

/** Depois de cadastrar: registrar a primeira finalização agora ou depois. */
function ProductCreated({ experiment }: { experiment: Experiment }) {
  const { urls } = useSignedUrls(experiment.photo_path ? [experiment.photo_path] : [])
  return (
    <main className="page form-page">
      <PageHeader title="Produto cadastrado" back={{ label: 'Voltar ao histórico', href: href(`/?novo=${experiment.id}`) }} />
      <section className="card created-card" role="status">
        <ProductThumb experiment={experiment} urls={urls} />
        <div className="created-text">
          <strong>{productLabel(experiment)}</strong>
          {brandLabel(experiment) && <span className="muted small">{brandLabel(experiment)}</span>}
        </div>
      </section>
      <p className="created-question">Quer registrar a primeira finalização com ele agora?</p>
      <section className="save-bar">
        <a className="btn btn-primary btn-block btn-large" href={href(`/produto/${experiment.id}/nova-finalizacao`)}>
          Registrar finalização
        </a>
        <a className="btn btn-ghost btn-block" href={href(`/?novo=${experiment.id}`)}>
          Depois
        </a>
      </section>
    </main>
  )
}
