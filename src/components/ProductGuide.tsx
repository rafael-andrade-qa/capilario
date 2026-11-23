// O tipo do produto: o selo "Geleia ⓘ" dentro do produto aberto e a folha com a explicação
// inteira (o que é, como usar, combina com, etapa).
import { useState } from 'react'
import { InfoIcon, PlusIcon } from './ActionIcons'
import { useSheet } from './FinalizationStrip'
import { NO_FINISHER_GUIDE, productType, stepOf, type ProductType } from '../lib/productGuide'
import { href } from '../lib/router'

/** Selo do tipo no produto aberto; tocar abre a explicação. Sem tipo: um selo para escolher. */
export function ProductAbout({ experimentId, mode, category }: { experimentId: string; mode: 'named' | 'none' | 'unspecified'; category?: string | null }) {
  const [open, setOpen] = useState(false)
  if (mode === 'none') {
    return (
      <>
        <button type="button" className="type-tag" onClick={() => setOpen(true)} aria-label="O que é Sem finalizador">
          Referência <InfoIcon />
        </button>
        {open && <NoFinisherSheet onClose={() => setOpen(false)} />}
      </>
    )
  }
  const type = productType(category)
  if (!type) {
    if (mode !== 'named') return null
    return (
      <a className="type-tag type-tag-missing" href={href(`/produto/${experimentId}/editar`)} aria-label="Escolher o tipo do produto">
        <PlusIcon size={13} /> Tipo do produto
      </a>
    )
  }
  return (
    <>
      <button type="button" className="type-tag" onClick={() => setOpen(true)} aria-label={`O que é ${type.label.toLowerCase()}`}>
        {type.label} <InfoIcon />
      </button>
      {open && <TypeSheet type={type} onClose={() => setOpen(false)} />}
    </>
  )
}

/** A explicação de um tipo. No guia (inGuide) não precisa do link para o guia. */
export function TypeSheet({ type, onClose, inGuide = false }: { type: ProductType; onClose: () => void; inGuide?: boolean }) {
  const sheet = useSheet(onClose)
  const step = stepOf(type.step)
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={sheet} className="sheet guide-sheet" role="dialog" aria-modal="true" aria-label={type.label} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <h2 className="sheet-title">{type.label}</h2>
        <p className="guide-sheet-sub">
          <span className="type-chip">Etapa: {step.label}</span>
        </p>
        <TypeBody type={type} />
        <div className="pdf-actions">
          {!inGuide && (
            <a className="btn btn-ghost" href={href(`/guia?etapa=${type.step}`)} onClick={onClose}>
              Ver todos os tipos
            </a>
          )}
          <button type="button" className={`btn btn-primary ${inGuide ? 'btn-block' : ''}`} onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}

/** O que é, como usar e combina com. */
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
