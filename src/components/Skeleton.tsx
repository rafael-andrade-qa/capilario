// Esqueletos de carregamento: blocos no formato do conteúdo que vai chegar, pulsando de leve na
// cor do app. Só aparecem se a espera passar de ~300 ms (para não piscar em carregamentos
// rápidos) e ficam parados para quem pediu "reduzir movimento". O leitor de tela ouve só o aviso.
import type { CSSProperties, ReactNode } from 'react'

/** Um bloco do esqueleto (linha de texto, miniatura, foto…). */
export function Bone({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`sk ${className}`} style={style} aria-hidden="true" />
}

/** Área carregando: anuncia para o leitor de tela e aparece com um pequeno atraso. */
export function SkeletonRegion({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`sk-region ${className}`} role="status" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  )
}

/** Lista de produtos do histórico: miniatura e duas linhas por produto. */
export function HistorySkeleton() {
  const widths = [72, 58, 80, 64]
  return (
    <SkeletonRegion label="Carregando histórico…" className="card product-list sk-history">
      {widths.map((w, i) => (
        <div key={i} className="sk-row">
          <Bone className="sk-thumb" />
          <span className="sk-lines">
            <Bone className="sk-line" style={{ width: `${w}%` }} />
            <Bone className="sk-line sm" style={{ width: `${w - 22}%` }} />
          </span>
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Lista do catálogo: as mesmas linhas da lista real (miniatura branca e duas linhas). */
export function CatalogSkeleton({ rows }: { rows: number }) {
  return (
    <SkeletonRegion label="Buscando no catálogo…" className="card catalog-list sk-catalog">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-row catalog-row">
          <Bone className="sk-thumb catalog" />
          <span className="sk-lines">
            <Bone className="sk-line" style={{ width: `${62 + ((i * 17) % 30)}%` }} />
            <Bone className="sk-line sm" style={{ width: `${34 + ((i * 11) % 20)}%` }} />
          </span>
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Lista de marcas. */
export function BrandsSkeleton() {
  return (
    <SkeletonRegion label="Carregando marcas…" className="sk-brands">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="sk-row brand">
          <Bone className="sk-line" style={{ width: `${38 + ((i * 23) % 40)}%` }} />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Tela aberta direto pelo endereço, antes do histórico chegar: título e grade de fotos. */
export function PageSkeleton({ label = 'Carregando…' }: { label?: string }) {
  return (
    <main className="page">
      <SkeletonRegion label={label} className="sk-page">
        <div className="sk-head">
          <Bone className="sk-icon" />
          <Bone className="sk-title" />
        </div>
        <Bone className="sk-line sm" style={{ width: '55%' }} />
        <div className="sk-grid">
          {[0, 1, 2, 3].map((i) => (
            <Bone key={i} className="sk-photo" />
          ))}
        </div>
      </SkeletonRegion>
    </main>
  )
}
