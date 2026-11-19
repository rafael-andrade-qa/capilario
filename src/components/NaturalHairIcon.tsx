// Ícone padrão de "Sem finalizador": três fios ondulados soltos, abrindo nas pontas (cabelo natural),
// centralizados e com o mesmo espaçamento, sem enfeites que pareçam sujeira em tamanho pequeno.
export function NaturalHairIcon({ className = '' }: { className?: string }) {
  return (
    <div className={`photo-frame icon-thumb ${className}`} role="img" aria-label="Sem finalizador">
      <svg viewBox="0 0 36 48" width="100%" height="100%" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 8c-3 5 3 9 0 15s-4 10-2 17" />
          <path d="M18 7c-3 5 3 10 0 16s3 10 0 17" />
          <path d="M24 8c3 5-3 9 0 15s4 10 2 17" />
        </g>
      </svg>
    </div>
  )
}
