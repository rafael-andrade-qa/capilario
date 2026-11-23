// Início, em duas abas. Dias: cada finalização (dia de lavagem), da mais nova à mais antiga, com a
// rotina do dia, o clima e os três momentos. Produtos: um produto por linha, recolhido; tocar abre
// as finalizações daquele produto. A aba escolhida fica lembrada no aparelho.
import { useEffect, useMemo, useState } from 'react'
import { DeleteProductDialog } from '../components/DeleteProductDialog'
import { useToast, useToastOnce } from '../components/Toasts'
import { TrashIcon } from '../components/TrashIcon'
import { CompareIcon, DropIcon, EditIcon, MoreIcon, PlusIcon } from '../components/ActionIcons'
import { weatherLong } from '../lib/weather'
import { PhotoView } from '../components/PhotoView'
import { HistorySkeleton } from '../components/Skeleton'
import { PdfIcon, PdfShareSheet, type PdfOption } from '../components/PdfShareSheet'
import { finalizationOption } from '../lib/finalizationShare'
import { fetchAnalyses, type FinalizationAnalysis } from '../lib/analysis'
import { AnalyzeSheet, SparkIcon } from '../components/FinalizationAnalysis'
import { DeleteFinalizationSheet } from '../components/DeleteFinalizationSheet'
import type { FinalizationChoice } from '../components/FinalizationStrip'
import { SearchField } from '../components/SearchField'
import { ProductThumb, coverPhoto, productThumbPath } from '../components/ProductThumb'
import {
  MOMENT_SLUG,
  STAGE_LABEL,
  STAGE_TYPES,
  brandLabel,
  canAddMoment,
  finalizationWhen,
  finalizationsOf,
  formatDateRange,
  formatDateTime,
  formatTime,
  nextMoment,
  productFullLabel,
  productLabel,
  publishedStages,
  sortHistory,
  type Experiment,
  type Finalization,
  type Stage,
  NO_FINISHER_ID,
} from '../lib/domain'
import { href, navigate } from '../lib/router'
import { ProductAbout } from '../components/ProductGuide'
import { productType } from '../lib/productGuide'
import { signOut, useHistory, useThumbUrls } from '../lib/state'
import { allFinalizations, diffRoutine, draftOf, itemName, routineExtra, schedule, sortRoutine, stepLabel, type Routines, type RoutineStep } from '../lib/routine'
import { compareUrl } from '../lib/compare'

/** A partir de quantos produtos a busca aparece. */
const SEARCH_FROM = 6

// Produtos abertos, lembrados enquanto o app estiver em uso (voltar do detalhe não fecha tudo).
// Ao abrir o app, tudo começa recolhido; se o app voltar do segundo plano depois de um tempo
// (ficou "fechado"), recolhe de novo.
const openMemory = new Set<string>()
const COLLAPSE_AFTER_MS = 5 * 60 * 1000
let hiddenAt: number | null = null
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now()
    else if (hiddenAt !== null && Date.now() - hiddenAt > COLLAPSE_AFTER_MS) {
      openMemory.clear()
      window.dispatchEvent(new Event('capilar:recolher'))
    }
  })
}

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
  const { experiments, error, loading, reload, patchStage, routines } = useHistory()
  const [tab, setTab] = useState<Tab>(readTab)
  const pickTab = (t: Tab) => {
    setTab(t)
    writeTab(t)
  }
  const [productToDelete, setProductToDelete] = useState<Experiment | null>(null)
  const [pdfFor, setPdfFor] = useState<Experiment | null>(null)
  // Análises das finalizações do produto do PDF (buscadas ao tocar, antes de abrir a folha).
  const [pdfAnalyses, setPdfAnalyses] = useState<Map<string, FinalizationAnalysis>>(() => new Map())
  const openPdf = (exp: Experiment) =>
    void fetchAnalyses(finalizationsOf(exp).map((f) => f.id))
      .catch(() => new Map<string, FinalizationAnalysis>())
      .then((m) => {
        setPdfAnalyses(m)
        setPdfFor(exp)
      })
  const [aiFor, setAiFor] = useState<Experiment | null>(null)
  const [deleteFor, setDeleteFor] = useState<Experiment | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set(openMemory))

  // Mais recente primeiro; "Sem finalizador" fica sempre fixo no topo.
  const recent = useMemo(() => sortHistory(experiments ?? []), [experiments])
  const list = useMemo(() => [...recent.filter((e) => e.product_mode === 'none'), ...recent.filter((e) => e.product_mode !== 'none')], [recent])
  const notify = useToast()
  // Avisos que chegam pelo endereço (depois de salvar, excluir ou editar): uma vez só.
  const savedText = saved && experiments ? savedLabel(list, saved) : null
  useToastOnce(savedText ? saved : null, savedText ?? '')
  useToastOnce(saved && productPhotoFailed ? `foto-${saved}` : null, 'A foto do produto não foi enviada. Toque no lápis do produto para tentar de novo.', 'error')
  useToastOnce(deleted, 'Momento excluído.')
  useToastOnce(productSaved, 'Produto atualizado.')
  useToastOnce(created, 'Produto cadastrado.')
  const totalStages = list.reduce((n, e) => n + publishedStages(e).length, 0)

  // Tudo começa recolhido. Depois de salvar ou cadastrar: abre só o produto em questão.
  useEffect(() => {
    if (!list.length) return
    setOpen((prev) => {
      const next = new Set(prev)
      if (saved) {
        const exp = list.find((e) => e.stages.some((s) => s.id === saved))
        if (exp) next.add(exp.id)
      }
      if (created && list.some((e) => e.id === created)) next.add(created)
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next
    })
  }, [list, saved, created])

  // Voltou do segundo plano depois de muito tempo: recolhe tudo.
  useEffect(() => {
    const collapse = () => setOpen(new Set())
    window.addEventListener('capilar:recolher', collapse)
    return () => window.removeEventListener('capilar:recolher', collapse)
  }, [])

  useEffect(() => {
    openMemory.clear()
    for (const id of open) openMemory.add(id)
  }, [open])

  // Em quantas finalizações cada produto entrou pela rotina (de qualquer produto principal).
  const usedCount = useMemo(() => {
    // Só finalizações que ainda existem (a rotina guardada pode ser de uma que foi excluída).
    const alive = new Set(list.flatMap((e) => publishedStages(e).map((s) => s.finalization_id)))
    const out = new Map<string, number>()
    for (const [fin, items] of Object.entries(routines)) if (alive.has(fin)) for (const i of items) out.set(i.experiment_id, (out.get(i.experiment_id) ?? 0) + 1)
    return out
  }, [routines, list])
  const usedIn = (e: Experiment) => usedCount.get(e.id) ?? 0

  const visible = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return list
    return list.filter((e) => normalize(`${productLabel(e)} ${brandLabel(e) ?? ''}`).includes(q))
  }, [list, query])

  const paths = useMemo(() => {
    const out = new Set<string>()
    for (const e of list) {
      const t = productThumbPath(e)
      if (t) out.add(t)
      if (open.has(e.id) || tab === 'dias') for (const s of publishedStages(e)) {
        const c = coverPhoto(s)
        if (c) out.add(c.storage_path)
      }
    }
    return [...out]
  }, [list, open, tab])
  const { urls } = useThumbUrls(paths) // miniaturas: aqui as fotos aparecem pequenas

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <main className="page home-page">
      <header className="topbar">
        <h1>Projeto Capilar</h1>
        <div className="topbar-actions">
          <CompareButton total={totalStages} loading={experiments === null} />
          <AccountMenu />
        </div>
      </header>

      <div className="home-cta">
        <a className="btn btn-primary btn-block" href={href('/rotina/nova')}>
          + Nova finalização
        </a>
      </div>

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

      {tab === 'dias' && experiments !== null && list.length > 0 && <DaysView experiments={list} routines={routines} urls={urls} saved={saved} />}

      {tab === 'produtos' && list.length > 0 && (
        <a className="btn btn-ghost btn-block new-product" href={href('/produto/novo')}>
          + Novo produto
        </a>
      )}

      {tab === 'produtos' && list.length >= SEARCH_FROM && (
        <SearchField value={query} onChange={setQuery} placeholder="Buscar produto ou marca" label="Buscar produto ou marca" />
      )}
      {tab === 'produtos' && query && visible.length === 0 && <p className="muted center small">Nenhum produto com “{query.trim()}”.</p>}

      {tab === 'produtos' && visible.length > 0 && (
        <div className="card product-list">
          {!query && !list.some((e) => e.product_mode === 'none') && <NoFinisherRow open={open.has(NO_FINISHER_ID)} onToggle={() => toggle(NO_FINISHER_ID)} />}
          {visible.map((exp) => {
            const stages = publishedStages(exp)
            const fins = finalizationsOf(exp)
            const isOpen = open.has(exp.id)
            const brand = brandLabel(exp)
            return (
              <section key={exp.id} className={`experiment ${isOpen ? 'open' : ''}`} aria-label={`Produto ${productFullLabel(exp)}`}>
                <h2 className="product-title">
                  <button
                    type="button"
                    className="product-toggle"
                    aria-expanded={isOpen}
                    aria-controls={`produto-${exp.id}`}
                    onClick={() => toggle(exp.id)}
                  >
                    <ProductThumb experiment={exp} urls={urls} />
                    <span className="product-text">
                      <span className={`product-name ${exp.product_mode === 'named' ? '' : 'muted-title'}`}>{productLabel(exp)}</span>
                      <span className="muted small experiment-sub">
                        {brand && <span className="brand-name">{brand}</span>}
                        <span className="dates">
                          {stages.length ? (
                            <>
                              {formatDateRange(stages[0].captured_at, stages[stages.length - 1].captured_at)} · {fins.length}{' '}
                              {fins.length === 1 ? 'finalização' : 'finalizações'}
                            </>
                          ) : usedIn(exp) > 0 ? (
                            `Em ${usedIn(exp)} ${usedIn(exp) === 1 ? 'finalização' : 'finalizações'}`
                          ) : (
                            'Nenhuma finalização ainda'
                          )}
                        </span>
                      </span>
                    </span>
                    <ChevronIcon />
                  </button>
                </h2>

                {isOpen && (
                  <div id={`produto-${exp.id}`} className="product-body">
                    <div className="product-top">
                      <ProductAbout experimentId={exp.id} mode={exp.product_mode} category={exp.category} />
                      {exp.product_mode === 'named' && (
                        <a className="link small insight-link" href={href(`/produto/${exp.id}`)}>
                          Como fica com ele
                        </a>
                      )}
                    </div>
                    {fins.length === 0 && (
                      <div className="fin-empty">
                        <p className="muted small">Registre a primeira finalização com este produto: molhado, seco e dia seguinte.</p>
                        <a className="btn btn-outline-brand btn-block" href={href(newFinalizationHref(exp))}>
                          + Registrar finalização
                        </a>
                      </div>
                    )}
                    <ol className="fin-list">
                      {fins.map((f, i) => (
                        <FinalizationRow
                          key={f.id}
                          finalization={f}
                          urls={urls}
                          saved={saved}
                          latest={i === 0}
                          withTime={fins.some((o) => o !== f && finalizationWhen(o) === finalizationWhen(f))}
                        />
                      ))}
                    </ol>
                    <div className="product-actions">
                      <a
                        className="icon-btn product-add"
                        href={href(newFinalizationHref(exp))}
                        aria-label={`Nova finalização com ${productLabel(exp)}`}
                        title="Nova finalização com este produto"
                      >
                        <PlusIcon />
                      </a>
                      {fins.length > 0 && (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setAiFor(exp)}
                          aria-label={`Analisar com IA uma finalização de ${productLabel(exp)}`}
                          title="Analisar com IA"
                        >
                          <SparkIcon size={20} />
                        </button>
                      )}
                      {fins.length > 0 && (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => openPdf(exp)}
                          aria-label={`Enviar PDF de uma finalização de ${productLabel(exp)}`}
                          title="Enviar PDF de uma finalização"
                        >
                          <PdfIcon />
                        </button>
                      )}
                      {exp.product_mode === 'named' && (
                        <a
                          className="icon-btn"
                          href={href(`/produto/${exp.id}/editar`)}
                          aria-label={`Editar produto ${productLabel(exp)}`}
                          title="Editar produto"
                        >
                          <EditIcon />
                        </a>
                      )}
                      <button
                        type="button"
                        className="icon-btn danger-icon product-delete"
                        onClick={() => (fins.length > 0 ? setDeleteFor(exp) : setProductToDelete(exp))}
                        aria-label={fins.length > 0 ? `Excluir uma finalização de ${productLabel(exp)}` : `Excluir produto ${productLabel(exp)}`}
                        title={fins.length > 0 ? 'Excluir uma finalização' : 'Excluir produto'}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
      {pdfFor && (
        <PdfShareSheet
          heading="Enviar PDF da finalização"
          intro={(() => {
            const n = finalizationsOf(pdfFor).length
            return n > 2 ? `Escolha uma das ${n} finalizações de ${productLabel(pdfFor)} (deslize para ver todas):` : `Escolha a finalização de ${productLabel(pdfFor)}:`
          })()}
          pick="list"
          options={finalizationChoices(pdfFor, urls, pdfAnalyses, (id) => routineExtra(routines[id], list))}
          onClose={() => setPdfFor(null)}
        />
      )}

      {aiFor && (
        <AnalyzeSheet
          product={productLabel(aiFor)}
          choices={finalizationCards(aiFor, urls)}
          onNotes={(changes) => changes.forEach((c) => patchStage(c.stageId, { notes: c.notes }))}
          onClose={() => setAiFor(null)}
        />
      )}

      {deleteFor && (
        <DeleteFinalizationSheet
          product={productLabel(deleteFor)}
          choices={finalizationCards(deleteFor, urls)}
          onClose={() => setDeleteFor(null)}
          onDeleted={() => {
            setDeleteFor(null)
            notify('Finalização excluída.')
          }}
          onDeleteProduct={() => {
            setProductToDelete(deleteFor)
            setDeleteFor(null)
          }}
        />
      )}

      {productToDelete && (
        <DeleteProductDialog
          experiment={productToDelete}
          onCancel={() => setProductToDelete(null)}
          onDeleted={() => {
            setProductToDelete(null)
            notify('Produto excluído.')
          }}
        />
      )}
    </main>
  )
}

function ChevronIcon() {
  return (
    <svg className="chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

/** Comparar: habilitado com ao menos dois momentos. */
function CompareButton({ total, loading }: { total: number; loading: boolean }) {
  const ready = !loading && total >= 2
  return (
    <button className="icon-btn" onClick={() => navigate('/comparar')} disabled={!ready} aria-label="Comparar" title="Comparar">
      <CompareIcon />
    </button>
  )
}

/** Conta: o Sair fica num menu (é raro e não precisa ocupar o topo). */
function AccountMenu() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (!(e.target as HTMLElement).closest?.('.account-menu')) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('click', close)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="account-menu">
      <button className="icon-btn" aria-label="Conta" title="Conta" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
        <MoreIcon />
      </button>
      {open && (
        <div className="account-pop" role="menu">
          <button type="button" role="menuitem" className="account-item" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      )}
    </div>
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

/** Cartões das folhas (PDF e análise): um por finalização, a mais recente primeiro. */
function finalizationCards(exp: Experiment, urls: Record<string, string>): (FinalizationChoice & { when: string })[] {
  const fins = finalizationsOf(exp)
  return fins.map((f) => {
    const when = fins.some((o) => o !== f && finalizationWhen(o) === finalizationWhen(f)) ? `${finalizationWhen(f)}, ${formatTime(f.start)}` : finalizationWhen(f)
    const stages = STAGE_TYPES.flatMap((t) => (f.moments[t] ? [f.moments[t]!] : []))
    return {
      fin: f,
      when,
      label: when,
      detail: stages.map((st) => STAGE_LABEL[st.stage_type]).join(' · '),
      thumbs: stages.map((st) => {
        const c = coverPhoto(st)
        return { url: c ? urls[c.storage_path] : undefined, crop: c?.crop }
      }),
    }
  })
}

/** Opções do PDF: uma por finalização, com data, momentos e miniaturas. */
function finalizationChoices(
  exp: Experiment,
  urls: Record<string, string>,
  analyses: Map<string, FinalizationAnalysis>,
  routineOf: (finalizationId: string) => string | null,
): PdfOption[] {
  return finalizationCards(exp, urls).map(({ fin, when, detail, thumbs }) => ({
    ...finalizationOption(exp, fin, when, analyses.get(fin.id) ?? null, routineOf(fin.id)),
    detail,
    thumbs,
  }))
}

/** Uma finalização: os três momentos lado a lado; o que falta vira atalho (nos primeiros dias). */
function FinalizationRow({
  finalization: f,
  urls,
  saved,
  latest,
  withTime,
}: {
  finalization: Finalization
  urls: Record<string, string>
  saved: string | null
  latest: boolean
  withTime: boolean
}) {
  const when = withTime ? `${finalizationWhen(f)}, ${formatTime(f.start)}` : finalizationWhen(f)
  return (
    <li className="fin" aria-label={`Finalização de ${when}`}>
      <div className="fin-when muted small">{when}</div>
      <MomentStrip finalization={f} urls={urls} saved={saved} latest={latest} when={when} />
    </li>
  )
}

/** Os três momentos lado a lado; o que falta vira atalho (só na mais recente do produto, nos primeiros dias). */
function MomentStrip({
  finalization: f,
  urls,
  saved,
  latest,
  when,
  humidity = true,
}: {
  finalization: Finalization
  urls: Record<string, string>
  saved: string | null
  latest: boolean
  when: string
  /** Mostrar a umidade em cada momento (no Diário ela já está no cabeçalho do dia). */
  humidity?: boolean
}) {
  const next = nextMoment(f)
  // Completar só a mais recente do produto, nos primeiros dias (refazer = finalização nova).
  const addable = latest && canAddMoment(f)
  const first = STAGE_TYPES.findIndex((t) => f.moments[t])
  return (
      <div className="fin-strip">
        {STAGE_TYPES.map((t, i) => {
          const st = f.moments[t]
          if (st) return <MomentTile key={t} stage={st} urls={urls} highlight={saved === st.id} humidity={humidity} />
          if (addable && i > first) {
            return (
              <a
                key={t}
                className={`moment-add ${t === next ? 'next' : ''}`}
                href={href(`/finalizacao/${f.id}/${MOMENT_SLUG[t]}`)}
                aria-label={`Registrar ${STAGE_LABEL[t]} da finalização de ${when}`}
              >
                <span className="moment-frame" aria-hidden="true">
                  +
                </span>
                <span className="moment-label">{STAGE_LABEL[t]}</span>
              </a>
            )
          }
          return (
            <div key={t} className="moment-empty" aria-hidden="true">
              <span className="moment-frame">—</span>
              <span className="moment-label">{STAGE_LABEL[t]}</span>
            </div>
          )
        })}
      </div>
  )
}

function MomentTile({ stage, urls, highlight, humidity = true }: { stage: Stage; urls: Record<string, string>; highlight: boolean; humidity?: boolean }) {
  const cover = coverPhoto(stage)
  return (
    <a className={`moment-tile ${highlight ? 'highlight' : ''}`} href={href(`/etapa/${stage.id}`)} title={formatDateTime(stage.captured_at)}>
      <span className="moment-frame">
        <PhotoView className="moment-photo" url={cover ? urls[cover.storage_path] : undefined} crop={cover?.crop} alt="" />
        {stage.photos.length < 4 && (
          <span className="count-pill" title="Fotos deste momento (de 4 ângulos)">
            {stage.photos.length}/4
          </span>
        )}
        {stage.is_favorite && (
          <span className="star" aria-label="favorita">
            ★
          </span>
        )}
      </span>
      <span className="moment-label">{STAGE_LABEL[stage.stage_type]}</span>
      <span className="moment-time muted">
        <time dateTime={stage.captured_at}>{formatTime(stage.captured_at)}</time>
        {humidity && stage.humidity != null && (
          <span className="moment-humidity" title={weatherLong(stage) ?? undefined} aria-label={`umidade ${stage.humidity}%`}>
            <DropIcon />
            {stage.humidity}%
          </span>
        )}
      </span>
    </a>
  )
}

/** "Sem finalizador" fica sempre na lista, mesmo antes da primeira finalização sem produto. */
function NoFinisherRow({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const placeholder: Experiment = { id: NO_FINISHER_ID, product_mode: 'none', product_name: null, brand: null, photo_path: null, created_at: '', stages: [] }
  return (
    <section className={`experiment fixed-product ${open ? 'open' : ''}`} aria-label="Produto Sem finalizador">
      <h2 className="product-title">
        <button type="button" className="product-toggle" aria-expanded={open} aria-controls="produto-sem-finalizador" onClick={onToggle}>
          <ProductThumb experiment={placeholder} urls={{}} />
          <span className="product-text">
            <span className="product-name muted-title">Sem finalizador</span>
            <span className="muted small experiment-sub">
              <span className="dates">Só lavado, sem creme nem gel</span>
            </span>
          </span>
          <ChevronIcon />
        </button>
      </h2>
      {open && (
        <div id="produto-sem-finalizador" className="product-body">
          <ProductAbout experimentId={NO_FINISHER_ID} mode="none" />
          <div className="fin-empty">
            <p className="muted small">Registre como o cabelo fica sem nenhum produto, para comparar com os outros.</p>
            <a className="btn btn-outline-brand btn-block" href={href(`/produto/${NO_FINISHER_ID}/nova-finalizacao`)}>
              + Registrar finalização
            </a>
          </div>
        </div>
      )}
    </section>
  )
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

/** Nova finalização a partir de um produto: a rotina já vem com ele (Sem finalizador vai direto às fotos). */
function newFinalizationHref(exp: Experiment): string {
  return exp.product_mode === 'named' ? `/rotina/nova?com=${exp.id}` : `/produto/${exp.id}/nova-finalizacao`
}

const KIND_CLASS = { H: 'kind-h', N: 'kind-n', R: 'kind-r' } as const
const KIND_NAME = { H: 'hidratação', N: 'nutrição', R: 'reconstrução' } as const

/** Aba Dias: as finalizações de todos os produtos, com a rotina, o clima e os momentos. */
function DaysView({ experiments, routines, urls, saved }: { experiments: Experiment[]; routines: Routines; urls: Record<string, string>; saved: string | null }) {
  const all = useMemo(() => allFinalizations(experiments), [experiments])
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
        {all.map(({ experiment, finalization: f }, i) => {
          const prev = all[i + 1]
          const items = sortRoutine(routines[f.id] ?? [])
          // Destaca o que mudou só quando as duas têm rotina (contra um dia sem rotina, tudo seria "novo").
          const before = prev ? draftOf(routines[prev.finalization.id], experiments) : []
          const now = draftOf(routines[f.id], experiments)
          const changed =
            before.length && now.length ? new Set<RoutineStep>(diffRoutine(before, now, experiments).changed.map((c) => c.step)) : new Set<RoutineStep>()
          const when = all.some((o) => o.finalization !== f && finalizationWhen(o.finalization) === finalizationWhen(f))
            ? `${finalizationWhen(f)}, ${formatTime(f.start)}`
            : finalizationWhen(f)
          const weather = (['dry', 'wet', 'next_day'] as const).map((t) => f.moments[t]).find((s) => s?.humidity != null)
          const latest = finalizationsOf(experiment)[0]?.id === f.id
          const pair = prev ? comparePair(f, prev.finalization) : null
          return (
            <li key={f.id} className="card day-card" aria-label={`Finalização de ${when}`}>
              <div className="day-head">
                <strong>{when}</strong>
                {weather && (
                  <span className="muted small day-weather" title={weatherLong(weather) ?? undefined}>
                    <DropIcon /> {weather.humidity}% · {Math.round(weather.temperature ?? 0)}°C
                  </span>
                )}
                <span className="day-icons">
                  <a className="icon-btn icon-btn-small" href={href(`/rotina/${f.id}`)} aria-label={`Editar a rotina de ${when}`} title="Editar rotina">
                    <EditIcon size={16} />
                  </a>
                  {pair && (
                    <a className="icon-btn icon-btn-small" href={href(compareUrl(pair.type, pair.a, pair.b))} aria-label={`Comparar ${when} com a anterior`} title="Comparar com a anterior">
                      <CompareIcon size={16} />
                    </a>
                  )}
                </span>
              </div>
              <ul className="day-chips" aria-label="Rotina">
                {items.length === 0 && <li className="day-chip">{experiment.product_mode === 'named' ? productLabel(experiment) : 'Sem finalizador'}</li>}
                {items.map((it) => {
                  const e = byId.get(it.experiment_id)
                  const isChanged = changed.has(it.step)
                  // Curto: o tipo ("Shampoo"); no que mudou, o nome, para saber o que entrou.
                  const label = isChanged || !e ? itemName(e) : (productType(e.category)?.label ?? itemName(e))
                  return (
                    <li key={it.experiment_id} className={`day-chip ${isChanged ? 'changed' : ''}`} title={`${stepLabel(it.step)}: ${itemName(e)}`}>
                      {label}
                      {it.mask_kind ? ` · ${it.mask_kind}` : ''}
                    </li>
                  )
                })}
              </ul>
              <MomentStrip finalization={f} urls={urls} saved={saved} latest={latest} when={when} humidity={false} />
            </li>
          )
        })}
      </ol>
    </>
  )
}

/** Mesmo momento nas duas finalizações (Seco de preferência), para comparar. */
function comparePair(a: Finalization, b: Finalization): { type: 'dry' | 'wet' | 'next_day'; a: string; b: string } | null {
  for (const t of ['dry', 'wet', 'next_day'] as const) {
    const x = a.moments[t]
    const y = b.moments[t]
    if (x && y) return { type: t, a: x.id, b: y.id }
  }
  return null
}
