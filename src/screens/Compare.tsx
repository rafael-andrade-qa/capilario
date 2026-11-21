// Comparador: primeiro a etapa (Molhado, Seco, Dia seguinte), depois os dois registros.
// Só a mesma etapa; cada lista esconde o que já está do outro lado; só os ângulos que
// os dois registros têm ficam clicáveis (ver lib/compare.ts).
import { useEffect, useMemo, useState } from 'react'
import { Dropdown, type DropdownOption } from '../components/Dropdown'
import { PageHeader } from '../components/PageHeader'
import { PdfIcon, PdfShareSheet } from '../components/PdfShareSheet'
import { comparePdf } from '../lib/pdf'
import { dayMonth, productHero } from '../lib/finalizationShare'
import { compareFileName, compareMessage, momentInfo, productTitle } from '../lib/share'
import { PhotoView } from '../components/PhotoView'
import { ProductThumb, productThumbPath } from '../components/ProductThumb'
import { commonAngles, defaultPair, initialAngle, initialType, isCompatible, missingSide, type CompareItem } from '../lib/compare'
import {
  ANGLES,
  ANGLE_LABEL,
  STAGE_LABEL,
  STAGE_TYPES,
  brandLabel,
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
  noFinisher: e.experiment.product_mode === 'none',
})
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
  const optionWhen = useMemo(() => {
    const key = (e: Entry) => `${e.stage.stage_type}|${e.experiment.id}|${formatShortDate(e.stage.captured_at)}`
    const count = new Map<string, number>()
    for (const e of recent) count.set(key(e), (count.get(key(e)) ?? 0) + 1)
    return (e: Entry) => ((count.get(key(e)) ?? 0) > 1 ? formatShortDateTime(e.stage.captured_at) : formatShortDate(e.stage.captured_at))
  }, [recent])

  const [pdfOpen, setPdfOpen] = useState(false)
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
    ...recent.map((e) => productThumbPath(e.experiment, e.stage)).filter((p): p is string => !!p),
  ]
  const { urls, error } = useSignedUrls(paths)

  if (experiments === null) return <main className="page muted center">Carregando…</main>

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
  const toOption = (e: Entry): DropdownOption => ({
    value: e.stage.id,
    label: productLabel(e.experiment),
    sublabel: [optionWhen(e), brandLabel(e.experiment)].filter(Boolean).join(' · '),
    thumb: <ProductThumb experiment={e.experiment} stage={e.stage} urls={urls} className="dd-thumb" />,
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
              message: compareMessage(momentInfo(a.experiment, a.stage), momentInfo(b.experiment, b.stage)),
              fileName: compareFileName(momentInfo(a.experiment, a.stage), momentInfo(b.experiment, b.stage)),
              build: async () =>
                comparePdf({
                  banner: {
                    kicker: `Comparativo · ${STAGE_LABEL[type]}`,
                    title: a.experiment.id === b.experiment.id ? productLabel(a.experiment) : `${productLabel(a.experiment)} × ${productLabel(b.experiment)}`,
                    brand: a.experiment.id === b.experiment.id ? brandLabel(a.experiment) || null : null,
                    pill: `${dayMonth(a.stage.captured_at)} × ${dayMonth(b.stage.captured_at)} · mesmos ângulos lado a lado`,
                    heroes:
                      a.experiment.id === b.experiment.id
                        ? [await productHero(a.experiment)]
                        : [await productHero(a.experiment, 'A'), await productHero(b.experiment, 'B')],
                  },
                  a: { title: productTitle(a.experiment), subtitle: formatDateTime(a.stage.captured_at) },
                  b: { title: productTitle(b.experiment), subtitle: formatDateTime(b.stage.captured_at) },
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
                  <figcaption className="compare-meta">
                    <strong>
                      {label} · {formatShortDateTime(e.stage.captured_at)} {e.stage.is_favorite && <span className="star">★</span>}
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
