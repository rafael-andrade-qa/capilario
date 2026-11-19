import { useEffect, useMemo } from 'react'
import { PhotoView } from '../components/PhotoView'
import { initialAngle, missingSide } from '../lib/compare'
import {
  ANGLES,
  ANGLE_LABEL,
  STAGE_LABEL,
  formatDateTime,
  photoByAngle,
  productLabel,
  publishedStages,
  sortHistory,
  stageOptionLabel,
  type Angle,
  type Experiment,
  type Stage,
} from '../lib/domain'
import { href, navigate } from '../lib/router'
import { useHistory, useSignedUrls } from '../lib/state'

interface Entry {
  stage: Stage
  experiment: Experiment
}

const isAngle = (v: string | null): v is Angle => !!v && (ANGLES as readonly string[]).includes(v)

export function Compare({ params }: { params: URLSearchParams }) {
  const { experiments } = useHistory()
  const groups = useMemo(() => sortHistory(experiments ?? []), [experiments])
  const entries = useMemo(() => {
    const map = new Map<string, Entry>()
    for (const experiment of groups) for (const stage of publishedStages(experiment)) map.set(stage.id, { stage, experiment })
    return map
  }, [groups])
  // Mais recentes primeiro (para a pré-seleção).
  const recent = useMemo(
    () => [...entries.values()].sort((x, y) => Date.parse(y.stage.captured_at) - Date.parse(x.stage.captured_at)),
    [entries],
  )

  const aId = params.get('a')
  const bId = params.get('b')
  const angleParam = params.get('angulo')
  const a = aId ? entries.get(aId) : undefined
  const b = bId ? entries.get(bId) : undefined

  const anglesOf = (e?: Entry): Angle[] => (e ? e.stage.photos.map((p) => p.angle) : [])
  const angle: Angle = isAngle(angleParam) ? angleParam : initialAngle(anglesOf(a), anglesOf(b)).angle

  // Completa a URL: pré-seleciona as duas etapas mais recentes e fixa o ângulo (recarregar mantém a tela).
  useEffect(() => {
    if (experiments === null || recent.length < 2) return
    let na = a?.stage.id
    let nb = b?.stage.id
    if (!na) na = recent.find((e) => e.stage.id !== nb)?.stage.id
    if (!nb) nb = recent.find((e) => e.stage.id !== na)?.stage.id
    if (!na || !nb) return
    const ang = isAngle(angleParam) ? angleParam : initialAngle(anglesOf(entries.get(na)), anglesOf(entries.get(nb))).angle
    if (na !== aId || nb !== bId || ang !== angleParam) {
      navigate(`/comparar?a=${na}&b=${nb}&angulo=${ang}`, { replace: true })
    }
  }, [experiments, aId, bId, angleParam, recent])

  const paths = [a, b].flatMap((e) => (e ? e.stage.photos.map((p) => p.storage_path) : []))
  const { urls, error } = useSignedUrls(paths)

  if (experiments === null) return <main className="page muted center">Carregando…</main>

  if (entries.size < 2) {
    return (
      <main className="page">
        <a className="back" href={href('/')}>← Histórico</a>
        <h1>Comparar</h1>
        <p className="alert alert-info">
          {entries.size === 0 ? 'Você ainda não tem etapas salvas.' : 'Você tem só 1 etapa salva.'} Registre pelo menos duas etapas para comparar.
        </p>
        <a className="btn btn-primary" href={href('/novo')}>
          Novo registro
        </a>
      </main>
    )
  }

  function choose(side: 'a' | 'b', id: string) {
    let na = side === 'a' ? id : aId
    let nb = side === 'b' ? id : bId
    // Escolher no lado A a etapa que está no B (ou vice-versa) troca os lados: as duas continuam distintas.
    if (na && na === nb) {
      if (side === 'a') nb = aId
      else na = bId
    }
    const ang = initialAngle(anglesOf(na ? entries.get(na) : undefined), anglesOf(nb ? entries.get(nb) : undefined)).angle
    navigate(`/comparar?a=${na ?? ''}&b=${nb ?? ''}&angulo=${ang}`, { replace: true })
  }

  function setAngle(next: Angle) {
    navigate(`/comparar?a=${aId ?? ''}&b=${bId ?? ''}&angulo=${next}`, { replace: true })
  }

  const missing = a && b ? missingSide(anglesOf(a), anglesOf(b), angle) : null

  return (
    <main className="page compare-page">
      <a className="back" href={href('/')}>← Histórico</a>
      <h1>Comparar</h1>

      <div className="compare-pickers">
        {(['a', 'b'] as const).map((side) => {
          const current = side === 'a' ? aId : bId
          const other = side === 'a' ? bId : aId
          const otherSide = side === 'a' ? 'B' : 'A'
          return (
            <label key={side} className="field">
              <span>{side === 'a' ? 'Registro A' : 'Registro B'}</span>
              <select value={current ?? ''} onChange={(e) => choose(side, e.target.value)} data-testid={`select-${side}`}>
                {!current && <option value="">Escolha uma etapa</option>}
                {groups.map((exp) => (
                  <optgroup key={exp.id} label={productLabel(exp)}>
                    {publishedStages(exp).map((s) => (
                      <option key={s.id} value={s.id}>
                        {stageOptionLabel(s, exp)}
                        {s.id === other ? ` (no ${otherSide}: troca os lados)` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )
        })}
      </div>

      <div className="segmented angles" role="tablist" aria-label="Ângulo">
        {ANGLES.map((x) => {
          const inA = !!a && !!photoByAngle(a.stage, x)
          const inB = !!b && !!photoByAngle(b.stage, x)
          return (
            <button
              key={x}
              role="tab"
              aria-selected={angle === x}
              className={`seg ${angle === x ? 'on' : ''} ${!inA && !inB ? 'dim' : ''}`}
              onClick={() => setAngle(x)}
            >
              {ANGLE_LABEL[x]}
              <span className="avail" aria-hidden>
                {inA ? 'A' : '–'}
                {inB ? 'B' : '–'}
              </span>
            </button>
          )
        })}
      </div>

      {missing && (
        <p className="alert alert-info" role="status">
          {missing === 'both'
            ? `Nenhum dos registros tem foto de ${ANGLE_LABEL[angle]}.`
            : `O registro ${missing === 'a' ? 'A' : 'B'} não tem foto de ${ANGLE_LABEL[angle]}.`}
        </p>
      )}
      {error && <p className="alert alert-error">{error}</p>}

      <div className="compare-grid">
        {([['A', a], ['B', b]] as const).map(([label, e]) => {
          const p = e ? photoByAngle(e.stage, angle) : undefined
          return (
            <figure key={label} className="compare-side" data-testid={`side-${label}`}>
              {p ? (
                <PhotoView className="compare-frame" url={urls[p.storage_path]} alt={`Registro ${label}: ${ANGLE_LABEL[angle]}`} />
              ) : (
                <div className="photo-frame compare-frame empty">Sem foto deste ângulo</div>
              )}
              {e && (
                <figcaption className="compare-meta">
                  <strong>
                    {label} · {STAGE_LABEL[e.stage.stage_type]} {e.stage.is_favorite && <span className="star">★</span>}
                  </strong>
                  <span>{formatDateTime(e.stage.captured_at)}</span>
                  <span>{productLabel(e.experiment)}</span>
                  {e.stage.notes && <span className="notes">{e.stage.notes}</span>}
                </figcaption>
              )}
            </figure>
          )
        })}
      </div>
    </main>
  )
}
