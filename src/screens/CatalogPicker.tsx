// Novo produto, primeiro passo: achar o produto no catálogo (com foto pronta).
//  - Busca por nome ou marca (sem acento, aguenta erro de digitação), com lupa.
//  - Filtros separados e coerentes: Marca (todas as marcas, numa folha com busca) e Público
//    (Todos | Masculino: linhas masculinas, pomadas, ceras e pastas).
//  - Resultados em páginas de 5 (cabe na tela, sem rolar), com Anterior e Próxima.
//  - Não achou: Pela foto ou Cadastrar à mão, sempre no rodapé.
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { CameraIcon } from '../components/ActionIcons'
import { BrandSheet } from '../components/BrandSheet'
import { PageHeader } from '../components/PageHeader'
import { SearchField } from '../components/SearchField'
import { useToast } from '../components/Toasts'
import { CATEGORY_LABEL, catalogImageUrl, catalogPhotoFile, searchCatalog, type CatalogBrand, type CatalogItem } from '../lib/catalog'
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

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<{ items: CatalogItem[]; hasNext: boolean } | null>(null)
  const [failed, setFailed] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const [brandsOpen, setBrandsOpen] = useState(false)
  const idInput = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  const closeBrands = useCallback(() => setBrandsOpen(false), [])

  const owned = new Set(others.filter((e) => e.product_mode === 'named').map((e) => `${plain(e.brand)}|${plain(e.product_name)}`))

  // Mudou busca ou filtro: volta para a primeira página.
  useEffect(() => setPage(0), [query, brand, male])

  useEffect(() => {
    const my = ++seq.current
    const t = setTimeout(
      () => {
        searchCatalog(query, { brand: brand?.id, audience: male ? 'masculino' : null, page })
          .then((r) => {
            if (my !== seq.current) return
            setResult(r)
            setFailed(false)
          })
          .catch(() => {
            if (my !== seq.current) return
            setResult({ items: [], hasNext: false })
            setFailed(true)
          })
      },
      query ? 250 : 0,
    )
    return () => clearTimeout(t)
  }, [query, brand, male, page])

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

  const items = result?.items ?? null
  const searching = !!query.trim()
  const caption = searching ? `Resultados para “${query.trim()}”` : brand ? `Mais usados de ${brand.name}` : 'Mais usados'

  return (
    <main className="page form-page catalog-page">
      <PageHeader title="Novo produto" back={{ label: 'Voltar ao histórico', href: href('/') }} />
      <SearchField value={query} onChange={setQuery} placeholder="Buscar produto ou marca" label="Buscar no catálogo" />

      <div className="catalog-filters">
        <div className="brand-filter">
          <button
            type="button"
            className={`filter-btn ${brand ? 'on' : ''}`}
            onClick={() => setBrandsOpen(true)}
            aria-haspopup="dialog"
            aria-label={brand ? `Marca: ${brand.name}. Trocar marca` : 'Filtrar por marca'}
          >
            <span className="filter-text">{brand ? brand.name : 'Marca'}</span>
            <Chevron />
          </button>
          {brand && (
            <button type="button" className="filter-clear" onClick={() => setBrand(null)} aria-label="Limpar marca">
              ✕
            </button>
          )}
        </div>
        <div className="segmented audience-filter" role="radiogroup" aria-label="Público">
          {[
            ['Todos', false],
            ['Masculino', true],
          ].map(([label, value]) => (
            <label key={String(label)} className={`seg ${male === value ? 'on' : ''}`}>
              <input type="radio" name="publico" checked={male === value} onChange={() => setMale(value as boolean)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <p className="muted small catalog-caption" aria-live="polite">
        {items === null ? 'Carregando…' : caption}
        {items && page > 0 && ` · página ${page + 1}`}
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
      {items && (page > 0 || result?.hasNext) && (
        <nav className="pager" aria-label="Páginas">
          <button type="button" className="btn btn-small" onClick={() => setPage(page - 1)} disabled={page === 0}>
            ‹ Anterior
          </button>
          <span className="muted small">Página {page + 1}</span>
          <button type="button" className="btn btn-small" onClick={() => setPage(page + 1)} disabled={!result?.hasNext}>
            Próxima ›
          </button>
        </nav>
      )}

      <section className="save-bar catalog-fallback" aria-label="Não achou o produto?">
        <p className="muted small catalog-fallback-title">Não achou o produto?</p>
        <div className="catalog-fallback-actions">
          <button type="button" className="btn btn-outline-brand" onClick={() => idInput.current?.click()}>
            <CameraIcon size={18} /> Pela foto
          </button>
          <button type="button" className="btn" onClick={onManual}>
            Cadastrar à mão
          </button>
        </div>
        <input ref={idInput} type="file" accept={INPUT_ACCEPT} hidden onChange={onIdentifyPicked} data-testid="catalog-identify-input" />
      </section>

      {brandsOpen && (
        <BrandSheet
          selected={brand}
          onClose={closeBrands}
          onPick={(b) => {
            setBrand(b)
            setBrandsOpen(false)
          }}
        />
      )}
    </main>
  )
}
