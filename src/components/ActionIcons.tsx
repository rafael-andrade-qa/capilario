// Ícones das ações do produto no histórico (o texto fica no aria-label/title do botão).

/** Adicionar etapa. */
export function PlusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

/** Foto do produto (imagem: moldura, montanha e sol). */
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
