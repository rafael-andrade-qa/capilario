// Um produto na rotina: em quais finalizações ele entrou (em qualquer etapa) e, com as análises
// da IA, como o cabelo fica com ele comparado com as finalizações sem ele.
import { useEffect, useMemo, useState } from 'react'
import { DeleteProductDialog } from '../components/DeleteProductDialog'
import { ProductAbout } from '../components/ProductGuide'
import { ProductThumb, productThumbPath } from '../components/ProductThumb'
import { useToast } from '../components/Toasts'
import { PageHeader } from '../components/PageHeader'
import { PageSkeleton } from '../components/Skeleton'
import { PhotoView } from '../components/PhotoView'
import { coverPhoto } from '../components/ProductThumb'
import { fetchAnalyses } from '../lib/analysis'
import { brandLabel, finalizationWhen, productLabel, STAGE_TYPES } from '../lib/domain'
import { SCORE_LABEL, allFinalizations, finalizationsWith, productScores, routineShort, sortRoutine, type ScoreKey } from '../lib/routine'
import { href, navigate } from '../lib/router'
import { useHistory, useThumbUrls } from '../lib/state'

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function ProductInsight({ experimentId }: { experimentId: string }) {
  const { experiments, routines } = useHistory()
  const experiment = experiments?.find((e) => e.id === experimentId)
  const list = useMemo(() => (experiments && experiment ? finalizationsWith(experiment.id, experiments, routines) : []), [experiments, experiment, routines])
  const allIds = useMemo(() => (experiments ? allFinalizations(experiments).map((f) => f.finalization.id) : []), [experiments])
  const [scores, setScores] = useState<Map<string, Partial<Record<ScoreKey, number | null>>> | null>(null)

  useEffect(() => {
    if (!allIds.length) return
    let alive = true
    fetchAnalyses(allIds)
      .then((m) => alive && setScores(new Map([...m].map(([id, a]) => [id, a.result.scores]))))
      .catch(() => alive && setScores(new Map()))
    return () => {
      alive = false
    }
  }, [allIds])

  const covers = useMemo(
    () =>
      list.flatMap(({ finalization: f }) => {
        const st = STAGE_TYPES.map((t) => f.moments[t]).find((s) => s)
        const c = st ? coverPhoto(st) : undefined
        return c ? [c.storage_path] : []
      }),
    [list],
  )
  const { urls } = useThumbUrls(useMemo(() => [...covers, ...(experiment ? [productThumbPath(experiment)].filter((p): p is string => !!p) : [])], [covers, experiment]))
  const [deleting, setDeleting] = useState(false)
  const notify = useToast()

  if (experiments === null) return <PageSkeleton />
  if (!experiment || experiment.product_mode !== 'named') {
    return (
      <main className="page">
        <PageHeader title="Produto" back={{ label: 'Voltar ao histórico', href: href('/') }} />
        <p className="muted">Produto não encontrado.</p>
      </main>
    )
  }

  const stats = scores ? productScores(list.map((f) => f.finalization.id), scores) : null
  return (
    <main className="page insight-page">
      <PageHeader title={productLabel(experiment)} back={{ label: 'Voltar aos produtos', href: href('/') }} />
      <div className="insight-head">
        <ProductThumb experiment={experiment} urls={urls} className="insight-pack" />
        <div className="insight-head-text">
          <p className="muted small insight-sub">
            {[brandLabel(experiment), `em ${list.length} ${list.length === 1 ? 'finalização' : 'finalizações'}`].filter(Boolean).join(' · ')}
          </p>
          <ProductAbout experimentId={experiment.id} mode={experiment.product_mode} category={experiment.category} />
        </div>
      </div>
      <div className="insight-actions">
        <a className="insight-act brand" href={href(`/rotina/nova?com=${experiment.id}`)} aria-label={`Nova finalização com ${productLabel(experiment)}`}>
          + Finalização
        </a>
        <a className="insight-act" href={href(`/produto/${experiment.id}/editar`)} aria-label={`Editar produto ${productLabel(experiment)}`}>
          Editar
        </a>
        <button type="button" className="insight-act danger-text" onClick={() => setDeleting(true)} aria-label={`Excluir produto ${productLabel(experiment)}`}>
          Excluir
        </button>
      </div>
      {deleting && (
        <DeleteProductDialog
          experiment={experiment}
          onCancel={() => setDeleting(false)}
          onDeleted={() => {
            notify('Produto excluído.')
            navigate('/', { replace: true })
          }}
        />
      )}

      <section className="card insight-scores" aria-label="Com ele na rotina">
        <h2 className="insight-title">Com ele na rotina</h2>
        {!stats && <p className="muted small">Carregando as análises…</p>}
        {stats && stats.with === 0 && (
          <p className="muted small">Nenhuma finalização com ele foi analisada pela IA ainda. Analise uma pelo menu ⋯ do dia, no Diário.</p>
        )}
        {stats && stats.with > 0 && (
          <>
            <p className="muted small">
              Média das análises da IA: {stats.with} com ele{stats.without ? `, ${stats.without} sem ele` : ''}.
            </p>
            <dl className="score-list">
              {stats.rows.map((r) => {
                const delta = r.with != null && r.without != null ? Math.round((r.with - r.without) * 10) / 10 : null
                return (
                  <div key={r.key} className="score-row">
                    <dt>{SCORE_LABEL[r.key]}</dt>
                    <dd>
                      <span className="score-bar" aria-hidden="true">
                        <span style={{ width: `${(r.with ?? 0) * 10}%` }} />
                      </span>
                      <span className="score-value">
                        {r.with != null ? fmt(r.with) : '—'}
                        {delta != null && (
                          <span className={`score-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
                            {delta === 0 ? ' igual' : ` ${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))}`}
                          </span>
                        )}
                      </span>
                    </dd>
                  </div>
                )
              })}
            </dl>
            {stats.with < 3 && <p className="muted small">Com poucas finalizações a média é só uma pista. Fica mais confiável a cada vez que você usa.</p>}
          </>
        )}
      </section>

      <section aria-label="Finalizações com ele">
        <h2 className="insight-title">Finalizações com ele</h2>
        {list.length === 0 && <p className="muted small">Ainda não entrou em nenhuma finalização.</p>}
        <ul className="insight-list">
          {list.map(({ finalization: f }) => {
            const st = STAGE_TYPES.map((t) => f.moments[t]).find((s) => s)
            const c = st ? coverPhoto(st) : undefined
            const others = sortRoutine(routines[f.id] ?? []).filter((i) => i.experiment_id !== experiment.id)
            const air = STAGE_TYPES.map((t) => f.moments[t]).find((s) => s?.humidity != null)
            return (
              <li key={f.id}>
                <a className="insight-row" href={href(`/finalizacao/${f.id}`)}>
                  <PhotoView className="insight-thumb" url={c ? urls[c.storage_path] : undefined} crop={c?.crop} alt="" />
                  <span className="insight-text">
                    <strong>{finalizationWhen(f)}</strong>
                    <span className="muted small">{others.length ? `+ ${routineShort(others, experiments)}` : 'Só ele'}</span>
                  </span>
                  {air && <span className="muted small">{air.humidity}%</span>}
                </a>
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
