// Histórico: um produto por linha, recolhido. Tocar abre as etapas daquele produto.
// O produto mais recente começa aberto; o que você abre/fecha é lembrado durante a sessão.
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { DeleteProductDialog } from '../components/DeleteProductDialog'
import { DeleteStageDialog } from '../components/DeleteStageDialog'
import { TrashIcon } from '../components/TrashIcon'
import { ImageIcon, PlusIcon } from '../components/ActionIcons'
import { PhotoView } from '../components/PhotoView'
import { ProductThumb, coverPhoto, productThumbPath } from '../components/ProductThumb'
import { SwipeRow, type SwipeOpen } from '../components/SwipeRow'
import { setProductPhoto } from '../lib/api'
import {
  ANGLE_LABEL,
  STAGE_LABEL,
  brandLabel,
  formatDateRange,
  formatDateTime,
  formatShortDateTime,
  productFullLabel,
  productLabel,
  publishedStages,
  sortHistory,
  type Experiment,
  type Stage,
} from '../lib/domain'
import { INPUT_ACCEPT, detectMime, validateFile } from '../lib/files'
import { href, navigate } from '../lib/router'
import { signOut, useHistory, useSession, useSignedUrls } from '../lib/state'

/** A partir de quantos produtos a busca aparece. */
const SEARCH_FROM = 6

// Produtos abertos, lembrados enquanto o app estiver aberto (voltar do detalhe não fecha tudo).
const openMemory = new Set<string>()
let openRemembered = false

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function History({ saved, deleted, productPhotoFailed = false }: { saved: string | null; deleted: boolean; productPhotoFailed?: boolean }) {
  const { experiments, error, loading, reload } = useHistory()
  const [swiped, setSwiped] = useState<{ id: string; dir: SwipeOpen } | null>(null)
  const [toDelete, setToDelete] = useState<{ stage: Stage; experiment: Experiment } | null>(null)
  const [deletedHere, setDeletedHere] = useState<string | null>(null)
  const [productToDelete, setProductToDelete] = useState<Experiment | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set(openMemory))

  const list = useMemo(() => sortHistory(experiments ?? []), [experiments])
  const totalStages = list.reduce((n, e) => n + publishedStages(e).length, 0)

  // Primeira visita: abre o produto mais recente. Depois de salvar: abre o produto da etapa salva.
  useEffect(() => {
    if (!list.length) return
    setOpen((prev) => {
      const next = new Set(prev)
      if (!openRemembered) next.add(list[0].id)
      if (saved) {
        const exp = list.find((e) => e.stages.some((s) => s.id === saved))
        if (exp) next.add(exp.id)
      }
      openRemembered = true
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next
    })
  }, [list, saved])

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
        <a className="btn btn-primary" href={href('/novo')}>
          + Novo registro
        </a>
        <CompareButton total={totalStages} />
      </div>

      {saved && <p className="alert alert-success" role="status">Registro salvo.</p>}
      {productPhotoFailed && (
        <p className="alert alert-error" role="alert">
          A foto do produto não foi enviada. Abra o produto e toque no ícone de imagem para tentar de novo.
        </p>
      )}
      {(deleted || deletedHere) && !saved && (
        <p className="alert alert-success" role="status">
          {deletedHere ?? 'Etapa excluída.'}
        </p>
      )}
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
          <h2>Nenhum registro ainda</h2>
          <p className="muted">Escolha de uma a quatro fotos da galeria para começar seu diário: frente, lados e costas.</p>
          <a className="btn btn-primary" href={href('/novo')}>
            Novo registro
          </a>
        </section>
      )}

      {list.length >= SEARCH_FROM && (
        <input
          type="search"
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar produto ou marca"
          aria-label="Buscar produto ou marca"
        />
      )}
      {query && visible.length === 0 && <p className="muted center small">Nenhum produto com “{query.trim()}”.</p>}

      {visible.length > 0 && (
        <div className="card product-list">
          {visible.map((exp) => {
            const stages = publishedStages(exp)
            const isOpen = open.has(exp.id)
            const brand = brandLabel(exp)
            return (
              <section key={exp.id} className={`experiment ${isOpen ? 'open' : ''}`} aria-label={`Experimento ${productFullLabel(exp)}`}>
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
                          {formatDateRange(stages[0].captured_at, stages[stages.length - 1].captured_at)} · {stages.length}{' '}
                          {stages.length === 1 ? 'etapa' : 'etapas'}
                        </span>
                      </span>
                    </span>
                    <ChevronIcon />
                  </button>
                </h2>

                {isOpen && (
                  <div id={`produto-${exp.id}`} className="product-body">
                    <ol className="stage-list">
                      {stages.map((s) => {
                        const cover = coverPhoto(s)
                        return (
                          <li key={s.id}>
                            <SwipeRow
                              open={swiped?.id === s.id ? swiped.dir : 0}
                              onOpenChange={(dir) => setSwiped(dir ? { id: s.id, dir } : null)}
                              actionText="Excluir"
                              actionLabel={`Excluir ${STAGE_LABEL[s.stage_type]} de ${formatDateTime(s.captured_at)}`}
                              onAction={() => setToDelete({ stage: s, experiment: exp })}
                            >
                              <a className={`stage-row ${saved === s.id ? 'highlight' : ''}`} href={href(`/etapa/${s.id}`)}>
                                <PhotoView className="thumb" url={cover ? urls[cover.storage_path] : undefined} alt={cover ? ANGLE_LABEL[cover.angle] : ''} />
                                <div className="stage-row-text">
                                  <div className="stage-row-top">
                                    <strong>
                                      {STAGE_LABEL[s.stage_type]}
                                      {s.is_favorite && <span className="star" aria-label="favorita"> ★</span>}
                                      {s.photos.length < 4 && (
                                        <span className="count-pill" title="Fotos desta etapa (de 4 ângulos)">
                                          {s.photos.length}/4
                                        </span>
                                      )}
                                    </strong>
                                    <time className="muted small" dateTime={s.captured_at} title={formatDateTime(s.captured_at)}>
                                      {formatShortDateTime(s.captured_at)}
                                    </time>
                                  </div>
                                  <span className={`muted small stage-note ${s.notes ? '' : 'empty'}`}>
                                    {s.notes ?? <span aria-label="Sem observação">—</span>}
                                  </span>
                                </div>
                              </a>
                            </SwipeRow>
                          </li>
                        )
                      })}
                    </ol>
                    <div className="product-actions">
                      <a
                        className="icon-btn product-add"
                        href={href(`/experimento/${exp.id}/nova-etapa`)}
                        aria-label={`Adicionar etapa em ${productLabel(exp)}`}
                        title="Adicionar etapa"
                      >
                        <PlusIcon />
                      </a>
                      {exp.product_mode === 'named' && <ProductPhotoButton experiment={exp} onDone={reload} />}
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

      {toDelete && (
        <DeleteStageDialog
          stage={toDelete.stage}
          experiment={toDelete.experiment}
          onCancel={() => {
            setToDelete(null)
            setSwiped(null)
          }}
          onDeleted={() => {
            setToDelete(null)
            setSwiped(null)
            setDeletedHere('Etapa excluída.')
          }}
        />
      )}

      {productToDelete && (
        <DeleteProductDialog
          experiment={productToDelete}
          onCancel={() => setProductToDelete(null)}
          onDeleted={() => {
            setProductToDelete(null)
            setDeletedHere('Produto excluído.')
          }}
        />
      )}
    </main>
  )
}

/** Envia ou troca a foto da embalagem do produto. */
function ProductPhotoButton({ experiment, onDone }: { experiment: Experiment; onDone: () => Promise<void> }) {
  const { session } = useSession()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !session) return
    const invalid = validateFile(file)
    if (invalid) {
      setMessage(invalid)
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      await setProductPhoto(session.user.id, experiment.id, file, detectMime(file))
      await onDone()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`icon-btn ${busy ? 'busy' : ''}`}
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-busy={busy}
        aria-label={busy ? 'Enviando foto do produto' : experiment.photo_path ? 'Trocar foto do produto' : 'Adicionar foto do produto'}
        title={busy ? 'Enviando foto…' : experiment.photo_path ? 'Trocar foto do produto' : 'Adicionar foto do produto'}
      >
        <ImageIcon />
      </button>
      <input ref={input} type="file" accept={INPUT_ACCEPT} hidden onChange={onPicked} data-testid={`product-photo-${experiment.id}`} />
      {message && <p className="slot-error product-photo-error">{message}</p>}
    </>
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
        {missing === 2 ? 'Registre duas etapas para comparar.' : 'Falta mais 1 etapa para comparar.'}
      </span>
    </div>
  )
}
