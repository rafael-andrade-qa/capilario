// Ícones das ações do produto no histórico (o texto fica no aria-label/title do botão).

/** Adicionar etapa. */
export function PlusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

/** Imagem (moldura, montanha e sol). */
export function ImageIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
        <circle cx="15.5" cy="9.5" r="1.6" />
        <path d="M4 17l5-5 4 4 2.5-2.5 4.5 4.5" />
      </g>
    </svg>
  )
}

/** Editar (lápis). */
export function EditIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" />
        <path d="M14.5 7.5l3 3" />
      </g>
    </svg>
  )
}

/** Concluir (visto). */
export function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
