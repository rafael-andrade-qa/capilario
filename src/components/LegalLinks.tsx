// Links para os termos e a privacidade (login e Minha conta).
import { href } from '../lib/router'

/** Rodapé com os documentos. */
export function LegalLinks({ from }: { from?: 'conta' }) {
  const q = from ? `?de=${from}` : ''
  return (
    <nav className="legal-links small" aria-label="Documentos">
      <a href={href('/termos' + q)}>Termos de uso</a>
      <span aria-hidden="true">·</span>
      <a href={href('/privacidade' + q)}>Privacidade</a>
    </nav>
  )
}
