// Termos de uso e política de privacidade: abrem com ou sem conta (o login e o cadastro levam aqui).
import { useEffect } from 'react'
import { PageHeader } from '../components/PageHeader'
import { LEGAL_CONTACT, LEGAL_UPDATED, PRIVACY, TERMS, type LegalDoc } from '../lib/legal'
import { href } from '../lib/router'

const BULLET = '• '

function Body({ lines }: { lines: string[] }) {
  // Linhas seguidas que começam com "• " viram uma lista só.
  const out: (string | string[])[] = []
  for (const line of lines) {
    if (!line.startsWith(BULLET)) out.push(line)
    else if (Array.isArray(out[out.length - 1])) (out[out.length - 1] as string[]).push(line.slice(BULLET.length))
    else out.push([line.slice(BULLET.length)])
  }
  return (
    <>
      {out.map((part, i) =>
        Array.isArray(part) ? (
          <ul key={i}>
            {part.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{part}</p>
        ),
      )}
    </>
  )
}

export function Legal({ doc, params }: { doc: 'termos' | 'privacidade'; params: URLSearchParams }) {
  const content: LegalDoc = doc === 'termos' ? TERMS : PRIVACY
  const other = doc === 'termos' ? { to: '/privacidade', label: PRIVACY.title } : { to: '/termos', label: TERMS.title }
  // Volta para Minha conta quando veio de lá; senão, para o início (o login, para quem não entrou).
  const from = params.get('de') === 'conta' ? '?de=conta' : ''
  const back = href(from ? '/conta' : '/')
  // Do fim dos termos para a privacidade (e vice-versa), começa do alto.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [doc])

  return (
    <main className="page legal-page">
      <PageHeader title={content.title} back={{ label: 'Voltar', href: back }} />
      <p className="legal-intro">{content.intro}</p>
      {content.sections.map((s) => (
        <section key={s.title} className="legal-section">
          <h2>{s.title}</h2>
          <Body lines={s.body} />
        </section>
      ))}
      <p className="muted small legal-foot">
        Última atualização: {LEGAL_UPDATED}. Contato: <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>
      </p>
      <p className="legal-other">
        <a href={href(other.to + from)}>{other.label} →</a>
      </p>
    </main>
  )
}
