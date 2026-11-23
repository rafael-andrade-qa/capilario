// Escolher uma finalização numa folha (analisar com IA, excluir): faixa horizontal de cartões
// com miniaturas, data e momentos, igual à do PDF. Altura fixa e desliza para o lado, então serve
// igual para 2 ou 20 finalizações.
import { useEffect, useRef, type ReactNode } from 'react'
import type { Finalization } from '../lib/domain'
import type { Crop } from '../lib/framing'
import { PhotoView } from './PhotoView'

/** Uma finalização na faixa: miniaturas, data e momentos. */
export interface FinalizationChoice {
  fin: Finalization
  label: string
  detail: string
  thumbs: { url?: string; crop?: Crop | null }[]
}

/** Abre a folha com a página travada atrás, foco nela e Esc para fechar. */
export function useSheet(onClose: () => void) {
  const sheet = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheet.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  return sheet
}

export function FinalizationStrip({
  choices,
  index,
  onSelect,
  locked = false,
  mark,
}: {
  choices: FinalizationChoice[]
  index: number
  onSelect: (i: number) => void
  /** Enquanto algo roda, só a escolhida fica habilitada. */
  locked?: boolean
  /** Marca ao lado da data (ex.: já analisada). */
  mark?: (fin: Finalization) => ReactNode
}) {
  return (
    <div className="pdf-strip" role="radiogroup" aria-label="Finalização">
      {choices.map((c, i) => (
        <button
          key={c.fin.id}
          type="button"
          role="radio"
          aria-checked={i === index}
          className="pdf-card"
          disabled={locked && i !== index}
          onClick={(e) => {
            onSelect(i)
            e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
          }}
        >
          <span className="pdf-card-thumbs" aria-hidden="true">
            {c.thumbs.map((t, j) => (
              <PhotoView key={j} url={t.url} crop={t.crop} alt="" />
            ))}
          </span>
          <strong className="pdf-card-label">
            {c.label}
            {mark?.(c.fin)}
          </strong>
          <span className="muted pdf-card-detail">{c.detail}</span>
          {i === index && (
            <span className="pdf-card-check" aria-hidden="true">
              ✓
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/** "Escolha uma das 3 finalizações de X (deslize para ver todas):" */
export function stripIntro(n: number, product: string, verb = 'Escolha'): string {
  if (n > 2) return `${verb} uma das ${n} finalizações de ${product} (deslize para ver todas):`
  if (n === 2) return `${verb} a finalização de ${product}:`
  return `Finalização de ${product}:`
}
