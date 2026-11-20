// Histórico: um produto por linha, recolhido. Tocar abre as finalizações daquele produto,
// cada uma com os três momentos lado a lado (Molhado, Seco, Dia seguinte) e um atalho para o
// próximo. O produto mais recente começa aberto; o que você abre/fecha é lembrado na sessão.
import { useEffect, useMemo, useState } from 'react'
import { DeleteProductDialog } from '../components/DeleteProductDialog'
import { NO_FINISHER_ID } from './StageForm'
import { useToast, useToastOnce } from '../components/Toasts'
import { TrashIcon } from '../components/TrashIcon'
import { EditIcon, PlusIcon } from '../components/ActionIcons'
import { PhotoView } from '../components/PhotoView'
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
} from '../lib/domain'
import { href, navigate } from '../lib/router'
import { signOut, useHistory, useSignedUrls } from '../lib/state'

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
  const { experiments, error, loading, reload } = useHistory()
  const [productToDelete, setProductToDelete] = useState<Experiment | null>(null)
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
      if (open.has(e.id)) for (const s of publishedStages(e)) {
        const c = coverPhoto(s)
        if (c) out.add(c.storage_path)
      }
    }
    return [...out]
  }, [list, open])
  const { urls } = useSignedUrls(paths)

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <main className="page">
      <header className="topbar">
        <h1>Projeto Capilar</h1>
        <button className="btn btn-ghost btn-small" onClick={() => void signOut()}>
          Sair
        </button>
      </header>

      <div className="actions-bar">
        <a className="btn btn-primary" href={href('/produto/novo')}>
          + Novo produto
        </a>
        <CompareButton total={totalStages} />
      </div>

      {error && (
        <p className="alert alert-error">
          {error}{' '}
          <button className="btn btn-small" onClick={() => void reload()}>
            Tentar de novo
          </button>
        </p>
      )}
      {experiments === null && loading && <p className="muted center">Carregando histórico…</p>}

      {experiments !== null && list.length === 0 && (
        <section className="empty-state card">
          <h2>Comece pelo produto que você vai testar</h2>
          <p className="muted">
            Cadastre o produto e, dentro dele, registre cada finalização: o cabelo molhado, seco e no dia seguinte. Assim dá para comparar os
            produtos.
          </p>
          <a className="btn btn-primary" href={href('/produto/novo')}>
            Cadastrar produto
          </a>
          <a className="link empty-secondary" href={href(`/produto/${NO_FINISHER_ID}/nova-finalizacao`)}>
            Ou registre sem finalizador
          </a>
        </section>
      )}

      {list.length >= SEARCH_FROM && (
        <SearchField value={query} onChange={setQuery} placeholder="Buscar produto ou marca" label="Buscar produto ou marca" />
      )}
      {query && visible.length === 0 && <p className="muted center small">Nenhum produto com “{query.trim()}”.</p>}

      {visible.length > 0 && (
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
                    {fins.length === 0 && (
                      <div className="fin-empty">
                        <p className="muted small">Registre a primeira finalização com este produto: molhado, seco e dia seguinte.</p>
                        <a className="btn btn-outline-brand btn-block" href={href(`/produto/${exp.id}/nova-finalizacao`)}>
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
                        href={href(`/produto/${exp.id}/nova-finalizacao`)}
                        aria-label={`Nova finalização com ${productLabel(exp)}`}
                        title="Nova finalização com este produto"
                      >
                        <PlusIcon />
                      </a>
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
                        onClick={() => setProductToDelete(exp)}
                        aria-label={`Excluir produto ${productLabel(exp)}`}
                        title="Excluir produto"
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

function CompareButton({ total }: { total: number }) {
  if (total >= 2) {
    return (
      <button className="btn" onClick={() => navigate('/comparar')}>
        Comparar
      </button>
    )
  }
  const missing = 2 - total
  return (
    <div className="compare-disabled">
      <button className="btn" disabled aria-describedby="compare-hint">
        Comparar
      </button>
      <span id="compare-hint" className="muted small">
        {missing === 2 ? 'Registre dois momentos para comparar.' : 'Falta mais 1 momento para comparar.'}
      </span>
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
  const next = nextMoment(f)
  // Completar só a mais recente do produto, nos primeiros dias (refazer = finalização nova).
  const addable = latest && canAddMoment(f)
  const first = STAGE_TYPES.findIndex((t) => f.moments[t])
  return (
    <li className="fin" aria-label={`Finalização de ${when}`}>
      <div className="fin-when muted small">{when}</div>
      <div className="fin-strip">
        {STAGE_TYPES.map((t, i) => {
          const st = f.moments[t]
          if (st) return <MomentTile key={t} stage={st} urls={urls} highlight={saved === st.id} />
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
    </li>
  )
}

function MomentTile({ stage, urls, highlight }: { stage: Stage; urls: Record<string, string>; highlight: boolean }) {
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
      <time className="moment-time muted" dateTime={stage.captured_at}>
        {formatTime(stage.captured_at)}
      </time>
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
              <span className="dates">Para quando você não usou produto</span>
            </span>
          </span>
          <ChevronIcon />
        </button>
      </h2>
      {open && (
        <div id="produto-sem-finalizador" className="product-body">
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
