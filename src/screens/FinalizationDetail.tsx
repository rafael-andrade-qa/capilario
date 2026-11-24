// Tela do dia (uma finalização): os três momentos, a rotina completa com o nome de cada produto,
// as observações e o menu ⋯ (editar rotina, analisar, PDF, excluir).
import { useMemo } from 'react'
import { PageHeader } from '../components/PageHeader'
import { PageSkeleton } from '../components/Skeleton'
import { DayWeather, FinalizationMenu, MomentStrip, stagesOf } from '../components/DayParts'
import { coverPhoto } from '../components/ProductThumb'
import { splitNote } from '../lib/analysis'
import { STAGE_LABEL, findFinalization, finalizationWhen, finalizationsOf, formatShortDate, productLabel } from '../lib/domain'
import { ROUTINE_STEPS, itemName, sortRoutine } from '../lib/routine'
import { href, navigate } from '../lib/router'
import { useHistory, useThumbUrls } from '../lib/state'

export function FinalizationDetail({ finalizationId }: { finalizationId: string }) {
  const { experiments, routines } = useHistory()
  const hit = experiments ? findFinalization(experiments, finalizationId) : null
  const paths = useMemo(() => (hit ? stagesOf(hit.finalization).flatMap((s) => (coverPhoto(s) ? [coverPhoto(s)!.storage_path] : [])) : []), [hit])
  const { urls } = useThumbUrls(paths)

  if (experiments === null) return <PageSkeleton />
  if (!hit) {
    return (
      <main className="page">
        <PageHeader title="Finalização" back={{ label: 'Voltar ao Diário', href: href('/') }} />
        <p className="muted">Finalização não encontrada.</p>
      </main>
    )
  }
  const { experiment, finalization: f } = hit
  const when = finalizationWhen(f)
  const byId = new Map(experiments.map((e) => [e.id, e]))
  const items = sortRoutine(routines[f.id] ?? [])
  const latest = finalizationsOf(experiment)[0]?.id === f.id
  const notes = stagesOf(f).flatMap((s) => {
    const own = splitNote(s.notes).own
    return own ? [{ type: s.stage_type, text: own }] : []
  })

  return (
    <main className="page day-page">
      <PageHeader
        title={when}
        back={{ label: 'Voltar ao Diário', href: href('/') }}
        right={<FinalizationMenu experiment={experiment} fin={f} when={when} onDeleted={() => navigate('/', { replace: true })} />}
      />
      <p className="muted small day-sub">
        {formatShortDate(f.start)} <DayWeather fin={f} />
      </p>

      <MomentStrip finalization={f} urls={urls} saved={null} latest={latest} when={when} />

      <section className="card day-routine" aria-label="Rotina do dia">
        <div className="day-routine-head">
          <h2>Rotina do dia</h2>
          <a className="link small" href={href(`/rotina/${f.id}`)}>
            Editar
          </a>
        </div>
        {items.length === 0 && <p className="muted small">{experiment.product_mode === 'named' ? productLabel(experiment) : 'Sem finalizador: rotina não registrada.'}</p>}
        <dl className="day-steps">
          {ROUTINE_STEPS.flatMap(({ id, label }) => {
            const list = items.filter((i) => i.step === id)
            if (!list.length) return []
            return [
              <div key={id} className="day-step">
                <dt>{label}</dt>
                <dd>{list.map((i) => itemName(byId.get(i.experiment_id), i.mask_kind)).join(', ')}</dd>
              </div>,
            ]
          })}
        </dl>
        {experiment.product_mode === 'none' && items.length > 0 && <p className="muted small day-none">Sem finalizador.</p>}
      </section>

      {notes.length > 0 && (
        <section className="card day-notes" aria-label="Observações">
          <h2>Observações</h2>
          {notes.map((n) => (
            <p key={n.type}>
              <strong>{STAGE_LABEL[n.type]}:</strong> {n.text}
            </p>
          ))}
        </section>
      )}
    </main>
  )
}
