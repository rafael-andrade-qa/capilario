// Comparador: primeiro a etapa (Molhado, Seco, Dia seguinte), depois os dois registros.
// Só a mesma etapa; cada lista esconde o que já está do outro lado; só os ângulos que
// os dois registros têm ficam clicáveis (ver lib/compare.ts).
import { PageSkeleton } from '../components/Skeleton'
import { compareLines, compareRoutines, diffRoutine, draftOf, routineShort, stepLabel } from '../lib/routine'
import { DropIcon } from '../components/ActionIcons'
import { weatherLong, withHumidity } from '../lib/weather'
import { useEffect, useMemo, useState } from 'react'
import { Dropdown, type DropdownOption } from '../components/Dropdown'
import { PageHeader } from '../components/PageHeader'
import { PdfIcon, PdfShareSheet } from '../components/PdfShareSheet'
import { comparePdf } from '../lib/pdf'
import { dayMonth } from '../lib/finalizationShare'
import { compareFileName, compareMessage, momentInfo } from '../lib/share'
import { PhotoView } from '../components/PhotoView'
import { coverPhoto } from '../components/ProductThumb'
import { commonAngles, compareUrl, defaultPair, initialAngle, initialType, isCompatible, missingSide, type CompareItem } from '../lib/compare'
import {
  ANGLES,
  ANGLE_LABEL,
  STAGE_LABEL,
  STAGE_TYPES,
  finalizationWhen,
  formatDateTime,
  formatShortDate,
  formatShortDateTime,
  photoByAngle,
  productLabel,
  publishedStages,
  sortHistory,
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
const toItem = (e: Entry): CompareItem => ({
  id: e.stage.id,
  type: e.stage.stage_type,
  capturedAt: e.stage.captured_at,
  finalizationId: e.stage.finalization_id,
})
const anglesOf = (e?: Entry): Angle[] => (e ? e.stage.photos.map((p) => p.angle) : [])


/** Balão de fala: ver a observação do registro. */
function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 10h8M8 13h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function Compare({ params }: { params: URLSearchParams }) {
  const { experiments, routines } = useHistory()
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
  const optionWhen = useMemo(() => {
    const key = (e: Entry) => `${e.stage.stage_type}|${e.experiment.id}|${formatShortDate(e.stage.captured_at)}`
    const count = new Map<string, number>()
    for (const e of recent) count.set(key(e), (count.get(key(e)) ?? 0) + 1)
    return (e: Entry) => ((count.get(key(e)) ?? 0) > 1 ? formatShortDateTime(e.stage.captured_at) : formatShortDate(e.stage.captured_at))
  }, [recent])

  const [pdfOpen, setPdfOpen] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
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
  const common = commonAngles(anglesOf(a), anglesOf(b))
  // Ângulo da URL só vale se os dois tiverem a foto; senão, o primeiro em comum.
  const angle: Angle = isAngle(angleParam) && common.includes(angleParam) ? angleParam : initialAngle(anglesOf(a), anglesOf(b)).angle

  // Mantém a URL igual ao que está na tela (recarregar preserva a comparação).
  const target = type ? compareUrl(type, a?.stage.id, b?.stage.id, a && b ? angle : undefined) : null
  useEffect(() => {
    if (experiments === null || !target) return
    if (window.location.hash !== '#' + target) navigate(target, { replace: true })
  }, [experiments, target])

  const paths = [
    ...[a, b].flatMap((e) => (e ? e.stage.photos.map((p) => p.storage_path) : [])),
    ...recent.map((e) => coverPhoto(e.stage)?.storage_path).filter((p): p is string => !!p),
  ]
  const { urls, error } = useSignedUrls(paths)

  if (experiments === null) return <PageSkeleton />

  if (entries.size < 2) {
    return (
      <main className="page">
        <PageHeader title="Comparar" back={{ label: 'Voltar ao histórico', href: href('/') }} />
        <p className="alert alert-info">
          {entries.size === 0 ? 'Você ainda não tem fotos salvas.' : 'Você tem só 1 momento salvo.'} Registre pelo menos dois momentos iguais para comparar.
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
    const na = side === 'a' ? id : a?.stage.id
    const nb = side === 'b' ? id : b?.stage.id
    const ea = na ? entries.get(na) : undefined
    const eb = nb ? entries.get(nb) : undefined
    navigate(compareUrl(type, na, nb, initialAngle(anglesOf(ea), anglesOf(eb)).angle), { replace: true })
  }

  function setAngle(next: Angle) {
    if (type) navigate(compareUrl(type, a?.stage.id, b?.stage.id, next), { replace: true })
  }

  const optionsOf = (t: StageType) => recent.filter((e) => e.stage.stage_type === t)
  // Cada lado é uma finalização: a rotina em selos curtos (sem rotina, o produto ou "Sem finalizador").
  const routineOf = (e: Entry) => {
    const r = routineShort(routines[e.stage.finalization_id], groups)
    if (e.experiment.product_mode !== 'named') return r ? `${r} · sem finalizador` : 'Sem finalizador'
    return r ?? productLabel(e.experiment)
  }
  const heroOf = (e: Entry, label: string) => {
    const c = coverPhoto(e.stage)
    return { label, photo: c ? { label, url: urls[c.storage_path], crop: c.crop } : null }
  }
  const changeLines =
    a && b && a.stage.finalization_id !== b.stage.finalization_id
      ? compareLines(compareRoutines(draftOf(routines[a.stage.finalization_id], groups), draftOf(routines[b.stage.finalization_id], groups), groups))
      : []
  const toOption = (e: Entry): DropdownOption => ({
    value: e.stage.id,
    // O dia primeiro (com a rotina, é ele que identifica a finalização); o produto embaixo.
    label: optionWhen(e),
    sublabel: routineOf(e),
    thumb: <PhotoView className="dd-thumb" url={urls[coverPhoto(e.stage)?.storage_path ?? '']} crop={coverPhoto(e.stage)?.crop} alt="" />,
  })
  // Aviso só quando não há nenhum ângulo em comum (os outros nem dá para escolher).
  const missing = a && b && !common.length ? missingSide(anglesOf(a), anglesOf(b), angle) : null

  return (
    <main className="page compare-page">
      <PageHeader
        title="Comparar"
        back={{ label: 'Voltar ao histórico', href: href('/') }}
        right={
          a && b && common.length > 0 ? (
            <button className="icon-btn" onClick={() => setPdfOpen(true)} aria-label="Enviar PDF do comparativo" title="Enviar PDF">
              <PdfIcon />
            </button>
          ) : undefined
        }
      />

      <div className="segmented type-picker" role="radiogroup" aria-label="Momento">
        {STAGE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            className={`seg ${type === t ? 'on' : ''}`}
            onClick={() => chooseType(t)}
            disabled={countOf(t) < 2}
            title={countOf(t) < 2 ? `Precisa de 2 registros ${STAGE_LABEL[t]} para comparar` : undefined}
          >
            {STAGE_LABEL[t]}
          </button>
        ))}
      </div>

      {type && a && !b && (
        <p className="alert alert-info" role="status">
          Só há 1 registro {STAGE_LABEL[type]}. Cada momento se compara com o mesmo momento: registre outro {STAGE_LABEL[type]} para comparar.
        </p>
      )}
      {!type && (
        <p className="alert alert-info" role="status">
          Compare momentos iguais: Molhado com Molhado, Seco com Seco, Dia seguinte com Dia seguinte. Registre mais um momento para comparar.
        </p>
      )}

      {type && a && b && (
        <>
          <div className="compare-pickers">
            <Dropdown
              label="Registro A"
              testId="select-a"
              prefix={<span className="pick-tag" aria-hidden="true">A</span>}
              value={a.stage.id}
              onChange={(v) => choose('a', v)}
              options={optionsOf(type)
                .filter((e) => e.stage.id !== b.stage.id)
                .map(toOption)}
            />
            <Dropdown
              label="Registro B"
              testId="select-b"
              prefix={<span className="pick-tag" aria-hidden="true">B</span>}
              value={b.stage.id}
              onChange={(v) => choose('b', v)}
              options={optionsOf(type)
                .filter((e) => e.stage.id !== a.stage.id)
                .map(toOption)}
            />
          </div>

          <div className="segmented angles" role="tablist" aria-label="Ângulo">
            {ANGLES.map((x) => {
              const inA = !!photoByAngle(a.stage, x)
              const inB = !!photoByAngle(b.stage, x)
              const both = inA && inB
              return (
                <button
                  key={x}
                  role="tab"
                  aria-selected={angle === x}
                  className={`seg ${angle === x && both ? 'on' : ''}`}
                  onClick={() => setAngle(x)}
                  disabled={!both}
                  title={both ? undefined : inA || inB ? `Só o registro ${inA ? 'A' : 'B'} tem foto de ${ANGLE_LABEL[x]}` : `Nenhum dos dois tem foto de ${ANGLE_LABEL[x]}`}
                >
                  {ANGLE_LABEL[x]}
                </button>
              )
            })}
          </div>

          {missing && (
            <p className="alert alert-info" role="status">
              Esses dois registros não têm foto do mesmo ângulo.
            </p>
          )}
          {error && <p className="alert alert-error">{error}</p>}

          {pdfOpen && (
            <PdfShareSheet
              heading="Enviar PDF do comparativo"
              onClose={() => setPdfOpen(false)}
              options={[{
              label: 'Comparativo',
              summary: `${common.length} ${common.length === 1 ? 'ângulo' : 'ângulos'} lado a lado`,
              message: compareMessage(
                { ...momentInfo(a.experiment, a.stage), routine: routineShort(routines[a.stage.finalization_id], groups) ? routineOf(a) : null },
                { ...momentInfo(b.experiment, b.stage), routine: routineShort(routines[b.stage.finalization_id], groups) ? routineOf(b) : null },
                changeLines,
              ),
              fileName: compareFileName(momentInfo(a.experiment, a.stage), momentInfo(b.experiment, b.stage)),
              build: async () =>
                comparePdf({
                  banner: {
                    kicker: `Comparativo · ${STAGE_LABEL[type]}`,
                    title: `Finalizações ${dayMonth(a.stage.captured_at)} × ${dayMonth(b.stage.captured_at)}`,
                    brand: null,
                    pill: 'mesmos ângulos lado a lado',
                    heroes: [heroOf(a, 'A'), heroOf(b, 'B')],
                  },
                  a: { title: routineOf(a), subtitle: withHumidity(formatDateTime(a.stage.captured_at), a.stage) },
                  b: { title: routineOf(b), subtitle: withHumidity(formatDateTime(b.stage.captured_at), b.stage) },
                  notes: changeLines.length ? [{ title: 'O que mudou', text: changeLines.join('. ') + '.' }] : [],
                  rows: common.map((ang) => {
                    const pa = photoByAngle(a.stage, ang)!
                    const pb = photoByAngle(b.stage, ang)!
                    return {
                      label: ANGLE_LABEL[ang],
                      a: { label: ANGLE_LABEL[ang], url: urls[pa.storage_path], crop: pa.crop },
                      b: { label: ANGLE_LABEL[ang], url: urls[pb.storage_path], crop: pb.crop },
                    }
                  }),
                }),
              }]}
            />
          )}

          <div className="compare-grid">
            {([['A', a], ['B', b]] as const).map(([label, e]) => {
              const p = photoByAngle(e.stage, angle)
              return (
                <figure key={label} className="compare-side" data-testid={`side-${label}`}>
                  {p ? (
                    <PhotoView className="compare-frame" url={urls[p.storage_path]} crop={p.crop} alt={`Registro ${label}: ${ANGLE_LABEL[angle]}`} />
                  ) : (
                    <div className="photo-frame compare-frame empty">Sem foto deste ângulo</div>
                  )}
                  {/* Sempre duas linhas, iguais dos dois lados: a finalização (dia); embaixo horário e
                      umidade. A rotina está no seletor e no "O que mudou". Observação só ao tocar. */}
                  <figcaption className="compare-meta">
                    <span className="compare-line">
                      <strong className="one-line">
                        {label} · {finalizationWhen({ start: e.stage.captured_at })}
                      </strong>
                      {e.stage.is_favorite && <span className="star" aria-label="Favorito">★</span>}
                      {e.stage.notes && (
                        <button
                          type="button"
                          className={`note-btn ${showNotes ? 'on' : ''}`}
                          onClick={() => setShowNotes((v) => !v)}
                          aria-expanded={showNotes}
                          aria-label={`Observação de ${label}`}
                          title={showNotes ? 'Esconder observação' : 'Ver observação'}
                        >
                          <NoteIcon />
                        </button>
                      )}
                    </span>
                    <span className="compare-sub muted">
                      <span className="compare-when">{formatShortDateTime(e.stage.captured_at)}</span>
                      {e.stage.humidity != null && (
                        <span className="compare-humidity" title={weatherLong(e.stage) ?? undefined} aria-label={"umidade " + e.stage.humidity + "%"}>
                          {' · '}
                          <DropIcon />
                          {e.stage.humidity}%
                        </span>
                      )}
                    </span>
                    {showNotes && e.stage.notes && <span className="notes">{e.stage.notes}</span>}
                  </figcaption>
                </figure>
              )
            })}
          </div>

          {/* O que mudou fica embaixo das fotos: elas vêm primeiro. */}
          {a.stage.finalization_id !== b.stage.finalization_id && <CompareChanges a={a.stage} b={b.stage} />}
        </>
      )}
    </main>
  )
}

/** O que mudou entre as duas finalizações: só as etapas diferentes, o clima e o que ficou igual. */
function CompareChanges({ a, b }: { a: Stage; b: Stage }) {
  const { experiments, routines } = useHistory()
  const list = experiments ?? []
  const ra = draftOf(routines[a.finalization_id], list)
  const rb = draftOf(routines[b.finalization_id], list)
  if (!ra.length && !rb.length) return null
  // De B para A: cada etapa diz o que A e B usaram.
  const { changed, same } = diffRoutine(rb, ra, list)
  // Trocou (tem produto nos dois): uma linha na tabela. Só de um lado: uma frase corrida.
  const swapped = changed.filter((c) => c.before.length && c.after.length)
  const onlyA = changed.filter((c) => !c.before.length).map((c) => stepLabel(c.step).toLowerCase())
  const onlyB = changed.filter((c) => !c.after.length).map((c) => stepLabel(c.step).toLowerCase())
  const air = (s: Stage) => (s.humidity != null ? `${s.humidity}% · ${Math.round(s.temperature ?? 0)}°C` : '—')
  const climate = a.humidity != null || b.humidity != null
  // Resumo numa linha: até duas etapas pelo nome; mais que isso, a conta.
  const parts = [
    !changed.length
      ? 'Mesma rotina'
      : changed.length <= 2
        ? `Mudou: ${changed.map((c) => stepLabel(c.step).toLowerCase()).join(', ')}`
        : `Mudaram ${changed.length} etapas`,
  ]
  if (a.humidity != null && b.humidity != null) parts.push(`umidade ${a.humidity}% × ${b.humidity}%`)
  return (
    <section className="compare-changes" aria-label="O que mudou">
      <details className="card compare-changes-box">
        <summary className="compare-changes-summary">
          <span className="compare-changes-text">{parts.join(' · ')}</span>
        </summary>
        {(swapped.length > 0 || climate) && (
          <table className="changes-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Etapa</span>
                </th>
                <th scope="col">A</th>
                <th scope="col">B</th>
              </tr>
            </thead>
            <tbody>
              {swapped.map((c) => (
                <tr key={c.step}>
                  <th scope="row">{stepLabel(c.step)}</th>
                  <td title={c.after.join(', ')}>{c.after.join(', ')}</td>
                  <td title={c.before.join(', ')}>{c.before.join(', ')}</td>
                </tr>
              ))}
              {climate && (
                <tr>
                  <th scope="row">Clima</th>
                  <td>{air(a)}</td>
                  <td>{air(b)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {onlyA.length > 0 && <p className="small compare-same">Só em A: {onlyA.join(', ')}.</p>}
        {onlyB.length > 0 && <p className="small compare-same">Só em B: {onlyB.join(', ')}.</p>}
        {changed.length > 0 && same.length > 0 && <p className="muted small compare-same">Igual nos dois: {same.map((x) => stepLabel(x).toLowerCase()).join(', ')}.</p>}
        {changed.length > 1 && <p className="muted small compare-same">Mudou mais de uma coisa: para saber o efeito de um produto, troque só ele de uma vez.</p>}
      </details>
    </section>
  )
}
