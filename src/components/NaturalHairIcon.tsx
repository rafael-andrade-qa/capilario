// Ícone padrão de "Sem finalizador": fios ondulados soltos e uma folha (cabelo natural).
export function NaturalHairIcon({ className = '' }: { className?: string }) {
  return (
    <div className={`photo-frame icon-thumb ${className}`} role="img" aria-label="Sem finalizador">
      <svg viewBox="0 0 36 48" width="100%" height="100%" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M9 9c-3 6 4 9 1 16s3 10 0 16" />
          <path d="M17 7c-3 7 4 10 1 17s3 11 0 17" />
          <path d="M25 11c-3 6 4 9 1 15s3 9 0 14" />
        </g>
        <path d="M25 4.5c4.5-.4 7.3 1.7 7.5 5.6-4.4.4-7.1-1.6-7.5-5.6z" fill="currentColor" opacity="0.55" />
      </svg>
    </div>
  )
}
