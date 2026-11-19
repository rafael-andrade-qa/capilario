import { useMemo } from 'react'
import { PhotoView } from '../components/PhotoView'
import {
  ANGLES,
  ANGLE_LABEL,
  STAGE_LABEL,
  formatDate,
  formatDateTime,
  photoByAngle,
  productLabel,
  publishedStages,
  sortHistory,
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

export function History({ saved }: { saved: string | null }) {
  const { experiments, error, loading, reload } = useHistory()
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
        <a className="btn btn-primary btn-large" href={href('/novo')}>
          + Novo registro
        </a>
        <CompareButton total={totalStages} />
      </div>

      {saved && <p className="alert alert-success" role="status">Registro salvo.</p>}
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
            <section key={exp.id} className="card experiment" aria-label={`Experimento ${productLabel(exp)}`}>
              <header className="experiment-head">
                <div>
                  <h2 className={exp.product_mode === 'named' ? '' : 'muted-title'}>{productLabel(exp)}</h2>
                  <p className="muted small">
                    {formatDate(stages[0].captured_at)}
                    {stages.length > 1 && formatDate(stages[stages.length - 1].captured_at) !== formatDate(stages[0].captured_at)
                      ? ` – ${formatDate(stages[stages.length - 1].captured_at)}`
                      : ''}
                    {' · '}
                    {stages.length} {stages.length === 1 ? 'etapa' : 'etapas'}
                  </p>
                </div>
                <a className="btn btn-small" href={href(`/experimento/${exp.id}/nova-etapa`)}>
                  + Adicionar etapa
                </a>
              </header>
              <ol className="stage-list">
                {stages.map((s) => {
                  const cover = coverPhoto(s)
                  return (
                    <li key={s.id}>
                      <a className={`stage-row ${saved === s.id ? 'highlight' : ''}`} href={href(`/etapa/${s.id}`)}>
                        <PhotoView className="thumb" url={cover ? urls[cover.storage_path] : undefined} alt={cover ? ANGLE_LABEL[cover.angle] : ''} />
                        <div className="stage-row-text">
                          <strong>
                            {STAGE_LABEL[s.stage_type]} {s.is_favorite && <span className="star" aria-label="favorita">★</span>}
                          </strong>
                          <span className="muted small">{formatDateTime(s.captured_at)}</span>
                          <span className="muted small">
                            {s.photos.length}/4 ângulos
                            {s.notes ? ` · ${s.notes}` : ''}
                          </span>
                        </div>
                      </a>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}
      </div>
    </main>
  )
}

function CompareButton({ total }: { total: number }) {
  if (total >= 2) {
    return (
      <button className="btn btn-large" onClick={() => navigate('/comparar')}>
        Comparar
      </button>
    )
  }
  const missing = 2 - total
  return (
    <div className="compare-disabled">
      <button className="btn btn-large" disabled aria-describedby="compare-hint">
        Comparar
      </button>
      <span id="compare-hint" className="muted small">
        {missing === 2 ? 'Registre duas etapas para comparar.' : 'Falta mais 1 etapa para comparar.'}
      </span>
    </div>
  )
}
