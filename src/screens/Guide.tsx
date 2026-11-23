// Guia dos tipos de produto: escolha uma etapa da rotina e veja só os tipos dela. Tocar num tipo
// abre a explicação inteira.
import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { TypeSheet } from '../components/ProductGuide'
import { typesByStep, type ProductType, type RoutineStep } from '../lib/productGuide'
import { href } from '../lib/router'

export function Guide({ params }: { params: URLSearchParams }) {
  const groups = typesByStep()
  const first = groups.find((g) => g.step.id === params.get('etapa')) ?? groups[0]
  const [stepId, setStepId] = useState<RoutineStep>(first.step.id)
  const [open, setOpen] = useState<ProductType | null>(null)
  const index = groups.findIndex((g) => g.step.id === stepId)
  const group = groups[index]
  const next = groups[index + 1]
  const tabs = useRef<HTMLDivElement>(null)

  // A etapa escolhida fica à vista na faixa (que rola de lado).
  useEffect(() => {
    tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [stepId])

  return (
    <main className="page guide-page">
      <PageHeader title="Tipos de produto" back={{ label: 'Voltar ao histórico', href: href('/') }} />
      <p className="muted small guide-intro">Na ordem de uma rotina. Toque num tipo para saber mais.</p>

      <div ref={tabs} className="guide-tabs" role="tablist" aria-label="Etapas da rotina">
        {groups.map((g, i) => (
          <button
            key={g.step.id}
            type="button"
            role="tab"
            id={`etapa-${g.step.id}`}
            aria-selected={g.step.id === stepId}
            aria-controls="etapa-painel"
            className={`guide-tab ${g.step.id === stepId ? 'on' : ''}`}
            onClick={() => setStepId(g.step.id)}
          >
            <span className="guide-tab-n">{i + 1}</span>
            {g.step.label}
          </button>
        ))}
      </div>

      <section id="etapa-painel" className="card guide-panel" role="tabpanel" aria-labelledby={`etapa-${stepId}`}>
        <p className="muted small guide-step-text">{group.step.text}</p>
        <ul className="guide-list">
          {group.types.map(({ id, type }) => (
            <li key={id}>
              <button type="button" className="guide-row" onClick={() => setOpen(type)}>
                <span className="guide-row-text">
                  <strong>{type.label}</strong>
                  <span className="muted small">{type.short}</span>
                </span>
                <span className="guide-row-chev" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {next && (
        <button type="button" className="guide-next" onClick={() => setStepId(next.step.id)}>
          Próxima etapa: {next.step.label} →
        </button>
      )}

      {open && <TypeSheet type={open} inGuide onClose={() => setOpen(null)} />}
    </main>
  )
}
