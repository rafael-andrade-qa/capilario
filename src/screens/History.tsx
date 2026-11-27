// Início, em duas abas. Diário: o dia mais recente grande (fotos, rotina, clima); os anteriores numa
// linha cada, separados por mês; tocar abre a tela do dia. Produtos: a prateleira, uma linha por
// produto, agrupados por etapa da rotina; tocar abre a tela do produto. A aba fica lembrada.
import { useEffect, useMemo, useState } from 'react'
import { useToastOnce } from '../components/Toasts'
import { AccountIcon, CompareIcon, PlusIcon } from '../components/ActionIcons'
import { PhotoView } from '../components/PhotoView'
import { HistorySkeleton } from '../components/Skeleton'
import { SearchField } from '../components/SearchField'
import { ProductThumb, coverPhoto, productThumbPath } from '../components/ProductThumb'
import { DayChips, DayWeather, FinalizationMenu, MomentStrip, dayCover, stagesOf } from '../components/DayParts'
import { STAGE_LABEL, STAGE_TYPES, brandLabel, finalizationWhen, finalizationsOf, formatTime, productLabel, sortHistory, type Experiment, type Finalization } from '../lib/domain'
import { href, navigate } from '../lib/router'
import { useHistory, useThumbUrls } from '../lib/state'
import { PhotosNudge } from '../components/PlanCard'
import { refreshPlan } from '../lib/plan'
import { ROUTINE_STEPS, allFinalizations, diffRoutine, draftOf, finalizationsWith, schedule, stepOfCategory, type Routines, type RoutineStep } from '../lib/routine'

/** A partir de quantos produtos a busca aparece (ao lado do "+", na mesma linha). */
const SEARCH_FROM = 2

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function History({
  saved,
  deleted,
  productPhotoFailed = false,
  productSaved = null,
  created = null,
}: {
  saved: string | null
  deleted: string | null
  productPhotoFailed?: boolean
  productSaved?: string | null
  /** Produto recém-cadastrado (escolheu registrar Depois). */
  created?: string | null
}) {
  const { experiments, error, loading, reload, routines } = useHistory()
  // O total de fotos muda ao salvar e ao excluir: o aviso do limite acompanha o histórico.
  useEffect(() => {
    if (experiments) void refreshPlan()
  }, [experiments])
  const [tab, setTab] = useState<Tab>(readTab)
  const pickTab = (t: Tab) => {
    setTab(t)
    writeTab(t)
  }
  const [query, setQuery] = useState('')

  const list = useMemo(() => sortHistory(experiments ?? []), [experiments])
  // Avisos que chegam pelo endereço (depois de salvar, excluir ou editar): uma vez só.
  const savedText = saved && experiments ? savedLabel(list, saved) : null
  useToastOnce(savedText ? saved : null, savedText ?? '')
  useToastOnce(saved && productPhotoFailed ? `foto-${saved}` : null, 'A foto do produto não foi enviada. Toque no lápis do produto para tentar de novo.', 'error')
  useToastOnce(deleted, 'Momento excluído.')
  useToastOnce(productSaved, 'Produto atualizado.')
  useToastOnce(created, 'Produto cadastrado.')

  const all = useMemo(() => allFinalizations(list), [list])
  const shelf = useMemo(() => list.filter((e) => e.product_mode !== 'none'), [list])
  const usedCount = useMemo(() => {
    const out = new Map<string, number>()
    for (const e of shelf) out.set(e.id, finalizationsWith(e.id, list, routines).length)
    return out
  }, [shelf, list, routines])
  const visible = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return shelf
    return shelf.filter((e) => normalize(`${productLabel(e)} ${brandLabel(e) ?? ''}`).includes(q))
  }, [shelf, query])

  const paths = useMemo(() => {
    const out = new Set<string>()
    if (tab === 'dias') {
      all.forEach(({ finalization: f }, i) => {
        if (i === 0) for (const s of stagesOf(f)) coverPhoto(s) && out.add(coverPhoto(s)!.storage_path)
        else dayCover(f) && out.add(dayCover(f)!.storage_path)
      })
    } else {
      for (const e of shelf) {
        const t = productThumbPath(e)
        if (t) out.add(t)
      }
    }
    return [...out]
  }, [tab, all, shelf])
  const { urls } = useThumbUrls(paths) // miniaturas: aqui as fotos aparecem pequenas

  return (
    <main className="page home-page">
      <header className="topbar">
        <h1 className="wordmark">capilário</h1>
        <div className="topbar-actions">
          <CompareButton />
          <a className="icon-btn" href={href('/conta')} aria-label="Minha conta" title="Minha conta">
            <AccountIcon />
          </a>
        </div>
      </header>

      <div className="home-cta">
        <a className="btn btn-primary btn-block" href={href('/rotina/nova')}>
          + Nova finalização
        </a>
      </div>
      <PhotosNudge />

      {error && (
        <p className="alert alert-error">
          {error}{' '}
          <button className="btn btn-small" onClick={() => void reload()}>
            Tentar de novo
          </button>
        </p>
      )}
      {experiments === null && loading && <HistorySkeleton />}

      {experiments !== null && list.length === 0 && (
        <section className="empty-state card">
          <h2>Registre sua primeira finalização</h2>
          <p className="muted">
            Toque em <strong>+ Nova finalização</strong>, conte o que você usou e tire as fotos do cabelo: molhado, seco e no dia seguinte. Depois é
            só comparar.
          </p>
          <a className="link empty-secondary" href={href('/produto/novo')}>
            + Novo produto
          </a>
        </section>
      )}

      {list.length > 0 && (
        <div className="tabs" role="tablist" aria-label="Ver por">
          <button type="button" role="tab" aria-selected={tab === 'dias'} className={`tab ${tab === 'dias' ? 'on' : ''}`} onClick={() => pickTab('dias')}>
            Diário
          </button>
          <button type="button" role="tab" aria-selected={tab === 'produtos'} className={`tab ${tab === 'produtos' ? 'on' : ''}`} onClick={() => pickTab('produtos')}>
            Produtos
          </button>
        </div>
      )}

      {tab === 'dias' && experiments !== null && list.length > 0 && <DaysView experiments={list} all={all} routines={routines} urls={urls} saved={saved} />}

      {/* Busca e "+" numa linha só (com um produto só, só o "+", à direita). */}
      {tab === 'produtos' && list.length > 0 && (
        <div className={`shelf-bar ${shelf.length >= SEARCH_FROM ? '' : 'only-add'}`}>
          {shelf.length >= SEARCH_FROM && <SearchField value={query} onChange={setQuery} placeholder="Buscar produto ou marca" label="Buscar produto ou marca" />}
          <a className="icon-btn shelf-add" href={href('/produto/novo')} aria-label="Novo produto" title="Novo produto">
            <PlusIcon />
          </a>
        </div>
      )}
      {tab === 'produtos' && query && visible.length === 0 && <p className="muted center small">Nenhum produto com “{query.trim()}”.</p>}
      {tab === 'produtos' && list.length > 0 && shelf.length === 0 && <p className="muted center small">Nenhum produto cadastrado ainda.</p>}
      {tab === 'produtos' && visible.length > 0 && <Shelf products={visible} used={usedCount} urls={urls} />}
    </main>
  )
}

/** Comparar: sempre abre; sem dois momentos, a tela mostra um exemplo de como fica. */
function CompareButton() {
  return (
    <button className="icon-btn" onClick={() => navigate('/comparar')} aria-label="Comparar" title="Comparar">
      <CompareIcon />
    </button>
  )
}

/** Aviso depois de salvar: "Seco salvo.", "Dia seguinte salvo." */
function savedLabel(list: Experiment[], stageId: string): string {
  for (const e of list) {
    const st = e.stages.find((x) => x.id === stageId)
    if (st) return `${STAGE_LABEL[st.stage_type]} salvo.`
  }
  return 'Salvo.'
}

type Tab = 'dias' | 'produtos'
const TAB_KEY = 'capilar:inicio:aba'
function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'produtos' ? 'produtos' : 'dias'
  } catch {
    return 'dias'
  }
}
function writeTab(t: Tab) {
  try {
    localStorage.setItem(TAB_KEY, t)
  } catch {
    // sem armazenamento: só não lembra a aba
  }
}

const KIND_CLASS = { H: 'kind-h', N: 'kind-n', R: 'kind-r' } as const
const KIND_NAME = { H: 'hidratação', N: 'nutrição', R: 'reconstrução' } as const

/** "Novembro" (e o ano, se não for o atual). */
function monthLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const m = d.toLocaleDateString('pt-BR', { month: 'long' })
  const name = m[0].toUpperCase() + m.slice(1)
  return d.getFullYear() === now.getFullYear() ? name : `${name} de ${d.getFullYear()}`
}

/** Aba Diário: o dia mais recente grande; os anteriores numa linha cada, por mês. */
function DaysView({
  experiments,
  all,
  routines,
  urls,
  saved,
}: {
  experiments: Experiment[]
  all: { experiment: Experiment; finalization: Finalization }[]
  routines: Routines
  urls: Record<string, string>
  saved: string | null
}) {
  const sched = useMemo(() => schedule(experiments, routines), [experiments, routines])
  const byId = useMemo(() => new Map(experiments.map((e) => [e.id, e])), [experiments])
  const [legend, setLegend] = useState(false)
  if (!all.length) {
    return (
      <section className="card empty-days">
        <p className="muted">
          Nenhuma finalização ainda. Toque em <strong>+ Nova finalização</strong> e conte o que você usou.
        </p>
      </section>
    )
  }
  const whenOf = (f: Finalization) =>
    all.some((o) => o.finalization !== f && finalizationWhen(o.finalization) === finalizationWhen(f)) ? `${finalizationWhen(f)}, ${formatTime(f.start)}` : finalizationWhen(f)
  // O que mudou em relação à anterior (só quando as duas têm rotina).
  const changedOf = (i: number) => {
    const prev = all[i + 1]
    const before = prev ? draftOf(routines[prev.finalization.id], experiments) : []
    const now = draftOf(routines[all[i].finalization.id], experiments)
    return before.length && now.length ? new Set<RoutineStep>(diffRoutine(before, now, experiments).changed.map((c) => c.step)) : new Set<RoutineStep>()
  }

  const [first, ...rest] = all
  const months: { label: string; items: { experiment: Experiment; finalization: Finalization; index: number }[] }[] = []
  rest.forEach((r, k) => {
    const label = monthLabel(r.finalization.start)
    const last = months[months.length - 1]
    if (last?.label === label) last.items.push({ ...r, index: k + 1 })
    else months.push({ label, items: [{ ...r, index: k + 1 }] })
  })
  const firstWhen = whenOf(first.finalization)

  return (
    <>
      {sched.length > 0 && (
        <div className="schedule" aria-label="Cronograma capilar">
          <button type="button" className="schedule-toggle muted small" aria-expanded={legend} onClick={() => setLegend((v) => !v)}>
            Cronograma
          </button>
          <ol>
            {sched.map((m) => (
              <li
                key={m.finalizationId}
                className={`schedule-kind ${KIND_CLASS[m.kind]}`}
                title={`${KIND_NAME[m.kind]} · ${finalizationWhen({ start: m.start })}`}
                aria-label={`${KIND_NAME[m.kind]}, ${finalizationWhen({ start: m.start })}`}
              >
                {m.kind}
              </li>
            ))}
          </ol>
          {legend && <p className="muted small schedule-legend">H hidratação · N nutrição · R reconstrução (a máscara de cada finalização)</p>}
        </div>
      )}

      <ol className="day-list">
        <li className="card day-card" aria-label={`Finalização de ${firstWhen}`}>
          <div className="day-head">
            <a className="day-title" href={href(`/finalizacao/${first.finalization.id}`)}>
              {firstWhen}
            </a>
            <DayWeather fin={first.finalization} />
            <FinalizationMenu experiment={first.experiment} fin={first.finalization} when={firstWhen} />
          </div>
          <DayChips experiment={first.experiment} items={routines[first.finalization.id] ?? []} byId={byId} changed={changedOf(0)} />
          <MomentStrip
            finalization={first.finalization}
            urls={urls}
            saved={saved}
            latest={finalizationsOf(first.experiment)[0]?.id === first.finalization.id}
            when={firstWhen}
            humidity={false}
          />
        </li>
      </ol>

      {months.map((m) => (
        <section key={m.label} className="month" aria-label={m.label}>
          <h2 className="month-title">{m.label}</h2>
          <ol className="day-rows">
            {m.items.map(({ experiment, finalization: f, index }) => {
              const when = whenOf(f)
              const cover = dayCover(f)
              const has = STAGE_TYPES.filter((t) => f.moments[t])
              return (
                <li key={f.id} aria-label={`Finalização de ${when}`}>
                  <a className="day-row" href={href(`/finalizacao/${f.id}`)}>
                    <PhotoView className="day-thumb" url={cover ? urls[cover.storage_path] : undefined} crop={cover?.crop} alt="" />
                    <span className="day-row-text">
                      <span className="day-row-head">
                        <strong>{when}</strong>
                        <span className="day-dots" aria-label={`Registrado: ${has.map((t) => STAGE_LABEL[t]).join(', ')}`}>
                          {STAGE_TYPES.map((t) => (
                            <span key={t} className={`day-dot ${f.moments[t] ? '' : 'off'}`} />
                          ))}
                        </span>
                        <DayWeather fin={f} />
                      </span>
                      <DayChips experiment={experiment} items={routines[f.id] ?? []} byId={byId} changed={changedOf(index)} />
                    </span>
                  </a>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </>
  )
}

/** Aba Produtos: uma linha por produto, agrupados pela etapa da rotina. */
function Shelf({ products, used, urls }: { products: Experiment[]; used: Map<string, number>; urls: Record<string, string> }) {
  const groups = ROUTINE_STEPS.map((s) => ({ step: s, items: products.filter((p) => stepOfCategory(p.category) === s.id) })).filter((g) => g.items.length)
  return (
    <>
      {groups.map(({ step, items }) => (
        <section key={step.id} className="shelf-group" aria-label={step.label}>
          <h2 className="month-title">{step.label}</h2>
          <ul className="card shelf-list">
            {items.map((p) => {
              const n = used.get(p.id) ?? 0
              return (
                <li key={p.id}>
                  <a className="shelf-row" href={href(`/produto/${p.id}`)}>
                    <ProductThumb experiment={p} urls={urls} className="shelf-thumb" />
                    <span className="shelf-text">
                      <span className="shelf-name">{productLabel(p)}</span>
                      <span className="muted small shelf-meta">
                        {[brandLabel(p), n ? `${n} ${n === 1 ? 'finalização' : 'finalizações'}` : 'nenhuma finalização ainda'].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shelf-chev" aria-hidden="true">
                      ›
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
