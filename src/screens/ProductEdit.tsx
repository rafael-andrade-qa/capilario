// Editar produto: corrigir nome e marca e trocar ou remover a foto da embalagem.
// Vale para todas as finalizações do produto.
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { PhotoView } from '../components/PhotoView'
import { removeProductPhoto, setProductPhoto, updateExperiment } from '../lib/api'
import { finalizationsOf, type Experiment } from '../lib/domain'
import { INPUT_ACCEPT, detectMime, validateFile } from '../lib/files'
import { href, navigate } from '../lib/router'
import { useHistory, useSession, useSignedUrls } from '../lib/state'

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
  return <ProductEdit key={experiment.id} experiment={experiment} others={experiments.filter((e) => e.id !== experiment.id)} />
}

type PhotoChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; file: File; mime: string; preview: string; error: string | null }

function ProductEdit({ experiment, others }: { experiment: Experiment; others: Experiment[] }) {
  const { session } = useSession()
  const { reload } = useHistory()
  const [name, setName] = useState(experiment.product_name ?? '')
  const [brand, setBrand] = useState(experiment.brand ?? '')
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const { urls } = useSignedUrls(experiment.photo_path ? [experiment.photo_path] : [])
  const fins = finalizationsOf(experiment).length

  useEffect(() => () => { if (photo.kind === 'new') URL.revokeObjectURL(photo.preview) }, [photo])

  function onPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhoto({ kind: 'new', file, mime: detectMime(file), preview: URL.createObjectURL(file), error: validateFile(file) })
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
    if (!changed) {
      navigate('/')
      return
    }
    const problem = validate()
    setMessage(problem)
    if (problem) return
    setBusy(true)
    try {
      if (nameChanged) await updateExperiment(experiment.id, name, brand)
      if (photo.kind === 'new') await setProductPhoto(session.user.id, experiment.id, photo.file, photo.mime)
      if (photo.kind === 'remove') await removeProductPhoto(experiment.id)
      await reload()
      navigate('/?produto=salvo', { replace: true })
    } catch (e) {
      setMessage((e as Error).message)
      setBusy(false)
    }
  }

  const currentUrl = experiment.photo_path ? urls[experiment.photo_path] : undefined
  const showPhoto = photo.kind === 'new' ? (photo.error ? null : photo.preview) : photo.kind === 'keep' ? currentUrl : null
  const hasPhoto = photo.kind === 'new' || (photo.kind === 'keep' && !!experiment.photo_path)

  return (
    <main className="page form-page">
      <PageHeader title="Editar produto" back={{ label: 'Voltar ao histórico', href: href('/') }} />
      <section className="card form-fields">
        <p className="muted small edit-scope">
          Vale para {fins === 1 ? 'a finalização' : `as ${fins} finalizações`} deste produto.
        </p>
        <div className="field">
          <label htmlFor="e-produto" className="field-label">
            Produto<span className="req" aria-hidden="true"> *</span>
          </label>
          <input id="e-produto" type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} required aria-required="true" maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="e-marca" className="field-label">
            Marca<span className="req" aria-hidden="true"> *</span>
          </label>
          <input id="e-marca" type="text" value={brand} onChange={(e) => setBrand(e.target.value)} disabled={busy} required aria-required="true" maxLength={100} />
        </div>
        <div className="field">
          <span className="field-label">Foto do produto</span>
          <div className="product-photo-field">
            <button
              type="button"
              className="product-photo-pick"
              onClick={() => input.current?.click()}
              disabled={busy}
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
                <button type="button" className="link danger small-link" onClick={() => setPhoto(experiment.photo_path ? { kind: 'remove' } : { kind: 'keep' })} disabled={busy}>
                  Remover foto
                </button>
              )}
            </div>
          </div>
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
        <button type="button" className="btn btn-primary btn-block btn-large" onClick={() => void save()} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </section>
    </main>
  )
}
