// Enfeites da marca: o logo (o diário aberto com uma onda em cada página) e os fios ondulados
// do fundo. Os fios são só decoração: ficam atrás do conteúdo e somem aos poucos para baixo.

/** O logo em SVG (nítido em qualquer tela), igual ao ícone do app. */
export function LogoMark({ size = 84, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <rect width="120" height="120" rx="30" fill="#7a4b2a" />
      <path
        d="M60 36 C48 28 32 28 22 32 L22 88 C32 84 48 84 60 92 C72 84 88 84 98 88 L98 32 C88 28 72 28 60 36 Z M60 36 L60 92"
        fill="none"
        stroke="#fbf7f3"
        strokeWidth="6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M29 62 q7 -8 14 0 t12 0 M66 62 q7 -8 14 0 t12 0" fill="none" stroke="#d49a6a" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Fios ondulados (a onda do logo) para o fundo. Sem viewBox: o desenho fica sempre do mesmo
 * tamanho (em px) e a largura da tela só mostra mais ou menos fios, sem esticar no computador.
 * `scale` aumenta tudo (a tela de entrada usa fios maiores); `top` = onde fica o primeiro fio.
 */
export function Strands({ className, rows = 7, scale = 1, top = 40 }: { className: string; rows?: number; scale?: number; top?: number }) {
  const waves = " t50 0".repeat(60)
  return (
    <svg className={`strands ${className}`} aria-hidden="true">
      <g transform={`scale(${scale})`}>
        {Array.from({ length: rows }, (_, i) => (
          <path
            key={i}
            d={`M${-20 - (i % 2) * 25} ${top + i * 34} q25 -${14 + i * 2} 50 0${waves}`}
            fill="none"
            strokeWidth={(i % 3 === 1 ? 3 : 2) / scale}
          />
        ))}
      </g>
    </svg>
  )
}
