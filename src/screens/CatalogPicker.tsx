// Novo produto, primeiro passo: achar o produto no catálogo (com foto pronta).
// Busca por nome ou marca (sem acento, aguenta erro de digitação), atalhos das marcas mais
// comuns e o filtro Masculino (pomadas, ceras e marcas masculinas). Se não achar: identificar
// pela foto ou cadastrar à mão.
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { CameraIcon } from '../components/ActionIcons'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/Toasts'
import { CATEGORY_LABEL, PAGE_SIZE, catalogImageUrl, catalogPhotoFile, searchCatalog, topBrands, type CatalogBrand, type CatalogItem } from '../lib/catalog'
import type { Experiment } from '../lib/domain'
import { INPUT_ACCEPT, validateFile } from '../lib/files'
import { href } from '../lib/router'

export interface CatalogChoice {
  name: string
  brand: string
  catalogId: string
  photo: File | null
}

const plain = (v: string | null | undefined) =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

export function CatalogPicker({
  others,
  onPick,
  onManual,
  onIdentify,
}: {
  others: Experiment[]
  onPick: (choice: CatalogChoice) => void
  onManual: () => void
  onIdentify: (file: File) => void
}) {
  const notify = useToast()
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState<CatalogBrand | null>(null)
  const [male, setMale] = useState(false)
  const [brands, setBrands] = useState<CatalogBrand[]>([])
  const [items, setItems] = useState<CatalogItem[] | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const idInput = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  const owned = new Set(others.filter((e) => e.product_mode === 'named').map((e) => `${plain(e.brand)}|${plain(e.product_name)}`))

  useEffect(() => {
    let alive = true
    void topBrands(14, male ? 'masculino' : undefined).then((b) => alive && setBrands(b))
    return () => {
      alive = false
    }
  }, [male])

  useEffect(() => {
    const my = ++seq.current
    const t = setTimeout(
      () => {
        searchCatalog(query, { brand: brand?.id, audience: male ? 'masculino' : null })
          .then((r) => {
            if (my !== seq.current) return
            setItems(r)
            setMore(r.length === PAGE_SIZE)
            setFailed(false)
          })
          .catch(() => {
            if (my !== seq.current) return
            setItems([])
            setFailed(true)
          })
      },
      query ? 250 : 0,
    )
    return () => clearTimeout(t)
  }, [query, brand, male])

  async function loadMore() {
    if (!items || loadingMore) return
    setLoadingMore(true)
    const my = seq.current
    try {
      const r = await searchCatalog(query, { brand: brand?.id, audience: male ? 'masculino' : null, offset: items.length })
      if (my !== seq.current) return
      setItems([...items, ...r])
      setMore(r.length === PAGE_SIZE)
    } catch {
      notify('Não foi possível carregar mais agora.', 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  async function pick(item: CatalogItem) {
    if (picking) return
    setPicking(item.id)
    let photo: File | null = null
    if (item.image_path) photo = await catalogPhotoFile(item.image_path).catch(() => null)
    setPicking(null)
    onPick({ name: item.name, brand: item.brand, catalogId: item.id, photo })
  }

  function onIdentifyPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = validateFile(file)
    if (problem) notify(problem, 'error')
    else onIdentify(file)
  }

  const caption = brand
    ? `${brand.name}${male ? ' · masculino' : ''}`
    : query.trim()
      ? `Resultados para “${query.trim()}”${male ? ' · masculino' : ''}`
      : male
        ? 'Mais usados · masculino'
        : 'Mais usados'

  return (
    <main className="page form-page catalog-page">
      <PageHeader title="Novo produto" back={{ label: 'Voltar ao histórico', href: href('/') }} />
      <input
        type="search"
        className="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar produto ou marca"
        aria-label="Buscar no catálogo"
        enterKeyHint="search"
      />
      <div className="catalog-chips" role="group" aria-label="Filtros">
        <button
          type="button"
          className={`chip-btn${male ? ' on' : ''}`}
          aria-pressed={male}
          onClick={() => {
            setMale(!male)
            setBrand(null)
          }}
        >
          Masculino
        </button>
        {brand && !brands.some((b) => b.id === brand.id) && (
          <button type="button" className="chip-btn on" aria-pressed="true" onClick={() => setBrand(null)}>
            {brand.name}
          </button>
        )}
        {brands.map((b) => (
          <button key={b.id} type="button" className={`chip-btn${brand?.id === b.id ? ' on' : ''}`} aria-pressed={brand?.id === b.id} onClick={() => setBrand(brand?.id === b.id ? null : b)}>
            {b.name}
          </button>
        ))}
      </div>

      <p className="muted small catalog-caption" aria-live="polite">
        {items === null ? 'Carregando…' : caption}
      </p>

      {items && items.length > 0 && (
        <ul className="card catalog-list" aria-label="Produtos do catálogo">
          {items.map((item) => {
            const mine = owned.has(`${plain(item.brand)}|${plain(item.name)}`)
            const img = catalogImageUrl(item.image_path)
            return (
              <li key={item.id}>
                <button type="button" className="catalog-row" onClick={() => void pick(item)} disabled={mine || !!picking} aria-busy={picking === item.id}>
                  <span className="catalog-thumb">{img ? <img src={img} alt="" loading="lazy" decoding="async" /> : null}</span>
                  <span className="catalog-text">
                    <span className="catalog-name">{item.name}</span>
                    <span className="muted small">
                      {item.brand} · {CATEGORY_LABEL[item.category] ?? 'Produto'}
                    </span>
                    {mine && <span className="small catalog-owned">Já está no seu histórico</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {items && items.length === 0 && (
        <p className="muted center small catalog-empty">
          {failed ? 'Não foi possível buscar no catálogo agora.' : 'Nada no catálogo com essa busca. Tente pela foto ou cadastre à mão.'}
        </p>
      )}
      {more && (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? 'Carregando…' : 'Ver mais'}
        </button>
      )}

      <section className="save-bar catalog-fallback" aria-label="Não achou?">
        <span className="muted small">Não achou?</span>
        <div className="catalog-fallback-actions">
          <button type="button" className="btn btn-outline-brand" onClick={() => idInput.current?.click()}>
            <CameraIcon size={18} /> Pela foto
          </button>
          <button type="button" className="btn btn-ghost" onClick={onManual}>
            Cadastrar à mão
          </button>
        </div>
        <input ref={idInput} type="file" accept={INPUT_ACCEPT} hidden onChange={onIdentifyPicked} data-testid="catalog-identify-input" />
      </section>
    </main>
  )
}
