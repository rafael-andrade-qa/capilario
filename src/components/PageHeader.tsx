// Cabeçalho de uma linha: seta de voltar, título e ações à direita (economiza altura).
import type { ReactNode } from 'react'

interface Back {
  label: string
  href?: string
  onClick?: () => void
  disabled?: boolean
}

export function PageHeader({ title, back, right }: { title: ReactNode; back: Back; right?: ReactNode }) {
  const arrow = (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
  return (
    <header className="page-header">
      {back.href ? (
        <a className="back-btn" href={back.href} aria-label={back.label} title={back.label}>
          {arrow}
        </a>
      ) : (
        <button type="button" className="back-btn" onClick={back.onClick} disabled={back.disabled} aria-label={back.label} title={back.label}>
          {arrow}
        </button>
      )}
      <h1 className="page-title">{title}</h1>
      {right && <div className="page-header-right">{right}</div>}
    </header>
  )
}
