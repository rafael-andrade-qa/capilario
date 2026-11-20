// Escolher a marca: todas as marcas do catálogo numa folha, com busca, as mais usadas no topo
// e o resto de A a Z (com letras para se achar). Tocar escolhe e fecha.
import { useEffect, useMemo, useRef, useState } from 'react'
import { allBrands, type CatalogBrand } from '../lib/catalog'
import { SearchField } from './SearchField'

const plain = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const letterOf = (name: string) => {
  const c = plain(name).charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

export function BrandSheet({
  selected,
  onPick,
  onClose,
}: {
  selected: CatalogBrand | null
  onPick: (b: CatalogBrand | null) => void
  onClose: () => void
}) {
  const [brands, setBrands] = useState<CatalogBrand[] | null>(null)
  const [query, setQuery] = useState('')
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void allBrands().then((b) => alive && setBrands(b))
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheet.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      alive = false
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const q = plain(query)
  const top = useMemo(() => (brands ? [...brands].sort((a, b) => b.product_count - a.product_count).slice(0, 8) : []), [brands])
  const filtered = useMemo(() => (brands ?? []).filter((b) => !q || plain(b.name).includes(q)), [brands, q])
  const groups = useMemo(() => {
    const m = new Map<string, CatalogBrand[]>()
    for (const b of filtered) {
      const l = letterOf(b.name)
      if (!m.has(l)) m.set(l, [])
      m.get(l)!.push(b)
    }
    return [...m.entries()]
  }, [filtered])

  const row = (b: CatalogBrand) => (
    <li key={b.id}>
      <button type="button" className={`brand-row ${selected?.id === b.id ? 'on' : ''}`} aria-pressed={selected?.id === b.id} onClick={() => onPick(b)}>
        <span className="brand-name">{b.name}</span>
        <span className="muted small">
          {b.product_count} {b.product_count === 1 ? 'produto' : 'produtos'}
        </span>
      </button>
    </li>
  )

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={sheet} className="sheet brand-sheet" role="dialog" aria-modal="true" aria-label="Escolher marca" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="brand-sheet-head">
          <h2 className="sheet-title">Marcas</h2>
          <button type="button" className="link" onClick={onClose}>
            Fechar
          </button>
        </div>
        <SearchField value={query} onChange={setQuery} placeholder="Buscar marca" label="Buscar marca" />
        <div className="brand-scroll">
          {brands === null && <p className="muted small center">Carregando marcas…</p>}
          {brands && !q && (
            <>
              <button type="button" className={`brand-row all ${selected ? '' : 'on'}`} aria-pressed={!selected} onClick={() => onPick(null)}>
                <span className="brand-name">Todas as marcas</span>
              </button>
              <h3 className="brand-letter">Mais usadas</h3>
              <ul className="brand-list">{top.map(row)}</ul>
            </>
          )}
          {brands && filtered.length === 0 && <p className="muted small center">Nenhuma marca com “{query.trim()}”.</p>}
          {groups.map(([letter, list]) => (
            <section key={letter} aria-label={`Marcas com ${letter}`}>
              <h3 className="brand-letter">{letter}</h3>
              <ul className="brand-list">{list.map(row)}</ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
