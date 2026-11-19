// Comparador: primeiro a etapa (Molhado, Seco, Dia seguinte), depois os dois registros.
// Molhado só compara com Molhado; Seco e Dia seguinte também entre si (ver lib/compare.ts).
import { useEffect, useMemo } from 'react'
import { PhotoView } from '../components/PhotoView'
import { compatibleTypes, defaultPair, initialAngle, initialType, isCompatible, missingSide, type CompareItem } from '../lib/compare'
import {
  ANGLES,
  ANGLE_LABEL,
  STAGE_LABEL,
  STAGE_TYPES,
  brandLabel,
  formatShortDate,
  formatShortDateTime,
  photoByAngle,
  productLabel,
  publishedStages,
  sortHistory,
  stageOptionLabel,
  type Angle,
  type Experiment,
  type Stage,
  type StageType,
} from '../lib/domain'
import { href, navigate } from '../lib/router'
import { useHistory, useSignedUrls } from '../lib/state'

interface Entry {
  stage: Stage
  experiment: Experiment
}

const isAngle = (v: string | null): v is Angle => !!v && (ANGLES as readonly string[]).includes(v)
const isType = (v: string | null): v is StageType => !!v && (STAGE_TYPES as readonly string[]).includes(v)
const toItem = (e: Entry): CompareItem => ({ id: e.stage.id, type: e.stage.stage_type, capturedAt: e.stage.captured_at })
const anglesOf = (e?: Entry): Angle[] => (e ? e.stage.photos.map((p) => p.angle) : [])

function compareUrl(type: StageType, a?: string, b?: string, angle?: Angle) {
  const q = new URLSearchParams({ etapa: type })
  if (a) q.set('a', a)
  if (b) q.set('b', b)
  if (angle) q.set('angulo', angle)
  return `/comparar?${q.toString()}`
}

export function Compare({ params }: { params: URLSearchParams }) {
  const { experiments } = useHistory()
  const groups = useMemo(() => sortHistory(experiments ?? []), [experiments])
  const entries = useMemo(() => {
    const map = new Map<string, Entry>()
    for (const experiment of groups) for (const stage of publishedStages(experiment)) map.set(stage.id, { stage, experiment })
    return map
  }, [groups])
  // Mais recentes primeiro.
  const recent = useMemo(
    () => [...entries.values()].sort((x, y) => Date.parse(y.stage.captured_at) - Date.parse(x.stage.captured_at)),
    [entries],
  )
  const items = useMemo(() => recent.map(toItem), [recent])
  // Opções mostram só a data; o horário entra quando há dois registros iguais no mesmo dia.
  const optionLabel = useMemo(() => {
    const key = (e: Entry) => `${e.stage.stage_type}|${e.experiment.id}|${formatShortDate(e.stage.captured_at)}`
    const count = new Map<string, number>()
    for (const e of recent) count.set(key(e), (count.get(key(e)) ?? 0) + 1)
    return (e: Entry) => stageOptionLabel(e.stage, e.experiment, new Date(), (count.get(key(e)) ?? 0) > 1)
  }, [recent])

  const aId = params.get('a')
  const bId = params.get('b')
  const angleParam = params.get('angulo')
  const typeParam = params.get('etapa')

  // Estado resolvido: o tipo vem do registro A; sem A, do parâmetro ou do histórico.
  const a0 = aId ? entries.get(aId) : undefined
  const type: StageType | null = a0?.stage.stage_type ?? (isType(typeParam) ? typeParam : initialType(items))
  let a = a0
  let b = bId ? entries.get(bId) : undefined
  if (type && !a) {
    const pair = defaultPair(items, type)
    a = pair ? entries.get(pair.a) : recent.find((e) => e.stage.stage_type === type)
    b = pair ? entries.get(pair.b) : undefined
  }
  if (a && (!b || !isCompatible(toItem(a), toItem(b)))) {
    b = recent.find((e) => isCompatible(toItem(a!), toItem(e)))
  }
  const angle: Angle = isAngle(angleParam) ? angleParam : initialAngle(anglesOf(a), anglesOf(b)).angle

  // Mantém a URL igual ao que está na tela (recarregar preserva a comparação).
  const target = type ? compareUrl(type, a?.stage.id, b?.stage.id, a && b ? angle : undefined) : null
  useEffect(() => {
    if (experiments === null || !target) return
    if (window.location.hash !== '#' + target) navigate(target, { replace: true })
  }, [experiments, target])

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

  const countOf = (t: StageType) => items.filter((i) => i.type === t).length

  function chooseType(t: StageType) {
    const pair = defaultPair(items, t)
    const first = pair?.a ?? items.find((i) => i.type === t)?.id
    const ea = first ? entries.get(first) : undefined
    const eb = pair ? entries.get(pair.b) : undefined
    navigate(compareUrl(t, ea?.stage.id, eb?.stage.id, ea && eb ? initialAngle(anglesOf(ea), anglesOf(eb)).angle : undefined), { replace: true })
  }

  function choose(side: 'a' | 'b', id: string) {
    if (!type) return
    let na = side === 'a' ? id : a?.stage.id
    let nb = side === 'b' ? id : b?.stage.id
    // Escolher no A o registro que está no B troca os lados.
    if (na && na === nb) nb = side === 'a' ? a?.stage.id : nb
    const ea = na ? entries.get(na) : undefined
    const eb = nb ? entries.get(nb) : undefined
    navigate(compareUrl(type, na, nb, initialAngle(anglesOf(ea), anglesOf(eb)).angle), { replace: true })
  }

  function setAngle(next: Angle) {
    if (type) navigate(compareUrl(type, a?.stage.id, b?.stage.id, next), { replace: true })
  }

  const optionsOf = (t: StageType) => recent.filter((e) => e.stage.stage_type === t)
  const missing = a && b ? missingSide(anglesOf(a), anglesOf(b), angle) : null
  const crossType = !!a && !!b && a.stage.stage_type !== b.stage.stage_type

  return (
    <main className="page compare-page">
      <a className="back" href={href('/')}>← Histórico</a>
      <h1>Comparar</h1>

      <div className="segmented type-picker" role="radiogroup" aria-label="Etapa">
        {STAGE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            className={`seg ${type === t ? 'on' : ''}`}
            onClick={() => chooseType(t)}
            disabled={countOf(t) === 0}
          >
            {STAGE_LABEL[t]}
          </button>
        ))}
      </div>

      {type && a && !b && (
        <p className="alert alert-info" role="status">
          {type === 'wet'
            ? 'Só há 1 registro Molhado. Molhado se compara com Molhado: registre outro para comparar.'
            : `Só há 1 registro ${STAGE_LABEL[type]} e nenhum ${STAGE_LABEL[compatibleTypes(type)[1]]}. Registre outro para comparar.`}
        </p>
      )}
      {!type && (
        <p className="alert alert-info" role="status">
          Compare etapas iguais (Molhado com Molhado) ou Seco com Dia seguinte. Registre mais uma etapa para comparar.
        </p>
      )}

      {type && a && b && (
        <>
          <div className="compare-pickers">
            <label className="pick-row">
              <span className="pick-tag" aria-hidden="true">A</span>
              <select aria-label="Registro A" value={a.stage.id} onChange={(e) => choose('a', e.target.value)} data-testid="select-a">
                {optionsOf(type).map((e) => (
                  <option key={e.stage.id} value={e.stage.id}>
                    {optionLabel(e)}
                    {e.stage.id === b.stage.id ? ' (em B)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="pick-row">
              <span className="pick-tag" aria-hidden="true">B</span>
              <select aria-label="Registro B" value={b.stage.id} onChange={(e) => choose('b', e.target.value)} data-testid="select-b">
                {compatibleTypes(type).map((t) => {
                  const options = optionsOf(t).filter((e) => e.stage.id !== a.stage.id)
                  if (!options.length) return null
                  return (
                    <optgroup key={t} label={STAGE_LABEL[t]}>
                      {options.map((e) => (
                        <option key={e.stage.id} value={e.stage.id}>
                          {optionLabel(e)}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            </label>
          </div>

          <div className="segmented angles" role="tablist" aria-label="Ângulo">
            {ANGLES.map((x) => {
              const inA = !!photoByAngle(a.stage, x)
              const inB = !!photoByAngle(b.stage, x)
              return (
                <button
                  key={x}
                  role="tab"
                  aria-selected={angle === x}
                  className={`seg ${angle === x ? 'on' : ''} ${!inA && !inB ? 'dim' : !inA || !inB ? 'half' : ''}`}
                  onClick={() => setAngle(x)}
                >
                  {ANGLE_LABEL[x]}
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
              const p = photoByAngle(e.stage, angle)
              return (
                <figure key={label} className="compare-side" data-testid={`side-${label}`}>
                  {p ? (
                    <PhotoView className="compare-frame" url={urls[p.storage_path]} alt={`Registro ${label}: ${ANGLE_LABEL[angle]}`} />
                  ) : (
                    <div className="photo-frame compare-frame empty">Sem foto deste ângulo</div>
                  )}
                  <figcaption className="compare-meta">
                    <strong>
                      {label} · {crossType ? `${STAGE_LABEL[e.stage.stage_type]} · ` : ''}
                      {formatShortDateTime(e.stage.captured_at)} {e.stage.is_favorite && <span className="star">★</span>}
                    </strong>
                    <span className="clamp-2">{productLabel(e.experiment)}</span>
                    {brandLabel(e.experiment) && <span className="muted one-line">{brandLabel(e.experiment)}</span>}
                    {e.stage.notes && <span className="notes clamp-2">{e.stage.notes}</span>}
                  </figcaption>
                </figure>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
