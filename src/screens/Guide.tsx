// Guia dos tipos de produto: as etapas de uma rotina, na ordem, e o que entra em cada uma.
import { PageHeader } from '../components/PageHeader'
import { TypeBody } from '../components/ProductGuide'
import { NO_FINISHER_GUIDE, typesByStep } from '../lib/productGuide'
import { href } from '../lib/router'

export function Guide() {
  const groups = typesByStep()
  return (
    <main className="page guide-page">
      <PageHeader title="Tipos de produto" back={{ label: 'Voltar ao histórico', href: href('/') }} />
      <p className="muted guide-intro">
        Pra que serve cada tipo, sem falar de marca. As etapas estão na ordem de uma rotina: nem todo mundo usa todas, mas a ordem vale para o
        que você usar.
      </p>
      <ol className="guide-route" aria-label="Ordem da rotina">
        {groups.map((g) => (
          <li key={g.step.id}>{g.step.label}</li>
        ))}
      </ol>

      <section className="card guide-group">
        <h2 className="guide-group-title">Referência</h2>
        <details className="guide-item">
          <summary>
            <strong>{NO_FINISHER_GUIDE.label}</strong>
            <span className="muted small">{NO_FINISHER_GUIDE.short}</span>
          </summary>
          <dl className="guide-body">
            <dt>O que é</dt>
            <dd>{NO_FINISHER_GUIDE.what}</dd>
            <dt>Pra que serve</dt>
            <dd>{NO_FINISHER_GUIDE.why}</dd>
          </dl>
        </details>
      </section>

      {groups.map((g, i) => (
        <section key={g.step.id} className="card guide-group" aria-label={g.step.label}>
          <h2 className="guide-group-title">
            <span className="guide-n">{i + 1}</span> {g.step.label}
          </h2>
          <p className="muted small guide-group-text">{g.step.text}</p>
          {g.types.map(({ id, type }) => (
            <details key={id} className="guide-item">
              <summary>
                <strong>{type.label}</strong>
                <span className="muted small">{type.short}</span>
              </summary>
              <TypeBody type={type} />
            </details>
          ))}
        </section>
      ))}
    </main>
  )
}
