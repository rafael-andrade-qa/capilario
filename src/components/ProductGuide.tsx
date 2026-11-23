// O que é cada tipo de produto: a linha "Geleia · define e controla o frizz" dentro do produto
// aberto e a folha com a explicação inteira (o que é, etapa, como usar, combina com).
import { useState } from 'react'
import { useSheet } from './FinalizationStrip'
import { NO_FINISHER_GUIDE, productType, stepOf, type ProductType } from '../lib/productGuide'
import { href } from '../lib/router'

/** Linha do tipo no produto aberto; tocar abre a explicação. Sem tipo: convida a escolher. */
export function ProductAbout({ experimentId, mode, category }: { experimentId: string; mode: 'named' | 'none' | 'unspecified'; category?: string | null }) {
  const [open, setOpen] = useState(false)
  if (mode === 'none') {
    return (
      <>
        <button type="button" className="product-about" onClick={() => setOpen(true)} aria-label="O que é Sem finalizador">
          <span className="type-chip">Referência</span>
          <span className="muted small product-about-text">{NO_FINISHER_GUIDE.short}</span>
          <span className="product-about-more small">O que é?</span>
        </button>
        {open && <NoFinisherSheet onClose={() => setOpen(false)} />}
      </>
    )
  }
  const type = productType(category)
  if (!type) {
    if (mode !== 'named') return null
    return (
      <a className="product-about product-about-missing" href={href(`/produto/${experimentId}/editar`)}>
        <span className="muted small">Que tipo de produto é este? Escolha para ver pra que serve.</span>
        <span className="product-about-more small">Escolher</span>
      </a>
    )
  }
  return (
    <>
      <button type="button" className="product-about" onClick={() => setOpen(true)} aria-label={`O que é ${type.label.toLowerCase()}`}>
        <span className="type-chip">{type.label}</span>
        <span className="muted small product-about-text">{type.short}</span>
        <span className="product-about-more small">O que é?</span>
      </button>
      {open && <TypeSheet type={type} onClose={() => setOpen(false)} />}
    </>
  )
}

export function TypeSheet({ type, onClose }: { type: ProductType; onClose: () => void }) {
  const sheet = useSheet(onClose)
  const step = stepOf(type.step)
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={sheet} className="sheet guide-sheet" role="dialog" aria-modal="true" aria-label={type.label} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <h2 className="sheet-title">{type.label}</h2>
        <TypeBody type={type} />
        <p className="small guide-step-note muted">
          <strong>Etapa: {step.label}.</strong> {step.text}
        </p>
        <div className="pdf-actions">
          <a className="btn btn-ghost" href={href('/guia')} onClick={onClose}>
            Ver todos os tipos
          </a>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}

/** O que é, como usar e combina com (na folha e no guia). */
export function TypeBody({ type }: { type: ProductType }) {
  return (
    <dl className="guide-body">
      <dt>O que é</dt>
      <dd>{type.what}</dd>
      <dt>Como usar</dt>
      <dd>{type.how}</dd>
      <dt>Combina com</dt>
      <dd>{type.pairs}</dd>
    </dl>
  )
}

function NoFinisherSheet({ onClose }: { onClose: () => void }) {
  const sheet = useSheet(onClose)
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={sheet} className="sheet guide-sheet" role="dialog" aria-modal="true" aria-label={NO_FINISHER_GUIDE.label} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <h2 className="sheet-title">{NO_FINISHER_GUIDE.label}</h2>
        <dl className="guide-body">
          <dt>O que é</dt>
          <dd>{NO_FINISHER_GUIDE.what}</dd>
          <dt>Pra que serve</dt>
          <dd>{NO_FINISHER_GUIDE.why}</dd>
        </dl>
        <div className="pdf-actions">
          <a className="btn btn-ghost" href={href('/guia')} onClick={onClose}>
            Ver todos os tipos
          </a>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
