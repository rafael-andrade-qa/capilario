import { useMemo, useState } from 'react'
import { DeleteStageDialog } from '../components/DeleteStageDialog'
import { PhotoView } from '../components/PhotoView'
import { SwipeRow, type SwipeOpen } from '../components/SwipeRow'
import {
  ANGLES,
  ANGLE_LABEL,
  STAGE_LABEL,
  brandLabel,
  formatDateRange,
  formatDateTime,
  formatShortDateTime,
  photoByAngle,
  productFullLabel,
  productLabel,
  publishedStages,
  sortHistory,
  type Experiment,
  type Stage,
} from '../lib/domain'
import { href, navigate } from '../lib/router'
import { signOut, useHistory, useSignedUrls } from '../lib/state'

/** Foto representativa de uma etapa: a primeira na ordem Frente, Esquerdo, Direito, Costas. */
function coverPhoto(stage: Stage) {
  for (const a of ANGLES) {
    const p = photoByAngle(stage, a)
    if (p) return p
  }
  return undefined
}

export function History({ saved, deleted }: { saved: string | null; deleted: boolean }) {
  const { experiments, error, loading, reload } = useHistory()
  const [swiped, setSwiped] = useState<{ id: string; dir: SwipeOpen } | null>(null)
  const [toDelete, setToDelete] = useState<{ stage: Stage; experiment: Experiment } | null>(null)
  const [deletedHere, setDeletedHere] = useState(false)
  const list = useMemo(() => sortHistory(experiments ?? []), [experiments])
  const totalStages = list.reduce((n, e) => n + publishedStages(e).length, 0)
  const covers = list.flatMap((e) => publishedStages(e).map((s) => coverPhoto(s)?.storage_path)).filter(Boolean) as string[]
  const { urls } = useSignedUrls(covers)

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
      {(deleted || deletedHere) && !saved && <p className="alert alert-success" role="status">Etapa excluída.</p>}
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

      <div className="stack">
        {list.map((exp) => {
          const stages = publishedStages(exp)
          return (
            <section key={exp.id} className="card experiment" aria-label={`Experimento ${productFullLabel(exp)}`}>
              <header className="experiment-head">
                <div className="experiment-title">
                  <h2 className={exp.product_mode === 'named' ? '' : 'muted-title'} title={productFullLabel(exp)}>
                    {productLabel(exp)}
                  </h2>
                  <p className="muted small experiment-sub">
                    {brandLabel(exp) && <span className="brand-name">{brandLabel(exp)}</span>}
                    <span className="dates">{formatDateRange(stages[0].captured_at, stages[stages.length - 1].captured_at)}</span>
                  </p>
                </div>
                <a
                  className="icon-btn"
                  href={href(`/experimento/${exp.id}/nova-etapa`)}
                  aria-label={`Adicionar etapa em ${productLabel(exp)}`}
                  title="Adicionar etapa"
                >
                  <PlusIcon />
                </a>
              </header>
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
                            {s.notes && <span className="muted small">{s.notes}</span>}
                          </div>
                        </a>
                      </SwipeRow>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}
      </div>

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
            setDeletedHere(true)
          }}
        />
      )}
    </main>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
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
