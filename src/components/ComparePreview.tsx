// Comparar antes de ter o que comparar: um exemplo desenhado de como a tela fica (duas
// finalizações lado a lado) e o caminho para registrar. Quem tocou no botão quer ver a tela.
import { href } from '../lib/router'

/** Cabelo cacheado em volta da cabeça: mais armado e irregular (A) ou mais definido (B). */
function HairSketch({ spread, curl, frizz }: { spread: number; curl: number; frizz: boolean }) {
  const n = 17
  // Cachos por cima e pelos lados, descendo até a altura do queixo.
  const curls = Array.from({ length: n }, (_, i) => {
    const t = Math.PI * (-0.18 + (1.36 * i) / (n - 1))
    return { x: 60 + Math.cos(t) * spread, y: 66 - Math.sin(t) * spread, r: frizz && i % 2 ? curl * 0.75 : curl }
  })
  return (
    <svg className="preview-sketch" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
      <path d="M20 150c2-22 18-32 40-32s38 10 40 32z" className="sk-body" />
      <ellipse cx="60" cy="68" rx={spread} ry={spread + 2} className="sk-hair" />
      {curls.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={c.r} className="sk-hair" />
      ))}
      <rect x="53" y="88" width="14" height="34" rx="6" className="sk-skin" />
      <ellipse cx="60" cy="76" rx="17" ry="22" className="sk-skin" />
    </svg>
  )
}

export function ComparePreview({ moments }: { moments: number }) {
  return (
    <>
      <p className="preview-lead">
        {moments === 0
          ? 'Você ainda não tem finalizações. Veja como esta tela fica quando tiver:'
          : 'Você tem 1 momento salvo. Falta mais um igual para comparar. Veja como fica:'}
      </p>

      <figure className="compare-preview" aria-label="Exemplo de comparação">
        <span className="preview-tag">Exemplo</span>
        <div className="segmented preview-seg" aria-hidden="true">
          <span className="seg">Molhado</span>
          <span className="seg on">Seco</span>
          <span className="seg">Dia seguinte</span>
        </div>
        <div className="compare-grid">
          <div className="preview-side">
            <div className="preview-photo">
              <span className="pick-tag">A</span>
              <HairSketch spread={38} curl={12} frizz />
            </div>
            <span className="preview-meta">
              <b>Seco · 12/11</b>
              <span>Creme de pentear</span>
            </span>
          </div>
          <div className="preview-side">
            <div className="preview-photo">
              <span className="pick-tag">B</span>
              <HairSketch spread={31} curl={9} frizz={false} />
            </div>
            <span className="preview-meta">
              <b>Seco · 26/11</b>
              <span>Creme + gelatina</span>
            </span>
          </div>
        </div>
      </figure>

      <ul className="preview-points">
        <li>Duas finalizações lado a lado, no mesmo ângulo: frente, lados ou costas.</li>
        <li>O que mudou na rotina de uma para a outra.</li>
        <li>Um PDF com as duas, pronto para mandar no WhatsApp.</li>
      </ul>
      <p className="muted small preview-rule">Compara-se momento com momento igual: Molhado com Molhado, Seco com Seco, Dia seguinte com Dia seguinte.</p>

      <a className="btn btn-primary btn-block" href={href('/rotina/nova')}>
        + Nova finalização
      </a>
    </>
  )
}
