// "Seu plano" (em Minha conta) e o aviso de fotos perto do limite (no diário).
import { PLAN_LABEL, left, openPro, periodLabel, photosNearLimit, renewsText, usePlan, type Plan } from '../lib/plan'

function UsageRow({ label, used, limit, note }: { label: string; used: number; limit: number; note: string }) {
  const full = used >= limit
  return (
    <div className="plan-row">
      <div className="plan-row-head">
        <span>{label}</span>
        <span className={`plan-count ${full ? 'is-full' : ''}`}>
          {Math.min(used, limit).toLocaleString('pt-BR')} de {limit.toLocaleString('pt-BR')}
        </span>
      </div>
      <span className={`plan-meter ${full ? 'is-full' : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
        <span style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
      </span>
      {note && <span className="muted small">{note}</span>}
    </div>
  )
}

function quotaNote(q: Plan['analyses']): string {
  return left(q) === 0 ? `Já usou ${periodLabel(q.period)}; ${renewsText(q)}.` : `${left(q) === 1 ? 'Resta 1' : `Restam ${left(q)}`} ${periodLabel(q.period)}.`
}

export function PlanCard() {
  const plan = usePlan()
  if (!plan)
    return (
      <section className="card plan-card" aria-busy="true">
        <span className="muted small">Carregando o plano…</span>
      </section>
    )
  const pro = plan.plan === 'pro'
  return (
    <section className="card plan-card" aria-labelledby="plano-titulo">
      <div className="plan-head">
        <h2 id="plano-titulo" className="plan-name">
          Plano {PLAN_LABEL[plan.plan]}
        </h2>
        {pro && <span className="pro-badge">Pro</span>}
      </div>
      <UsageRow label="Análise com IA" used={plan.analyses.used} limit={plan.analyses.limit} note={quotaNote(plan.analyses)} />
      <UsageRow label="Identificar pela foto" used={plan.identify.used} limit={plan.identify.limit} note={quotaNote(plan.identify)} />
      <UsageRow label="Fotos guardadas" used={plan.photos.used} limit={plan.photos.limit} note="" />
      {pro && plan.pro_until && <p className="muted small plan-until">Pro até {new Date(plan.pro_until).toLocaleDateString('pt-BR')}.</p>}
      {!pro && (
        <button type="button" className="btn btn-primary btn-block" onClick={openPro}>
          Conheça o Pro
        </button>
      )}
    </section>
  )
}

/** No diário: no Grátis, a partir de 80% das fotos, avisa antes de travar. */
export function PhotosNudge() {
  const plan = usePlan()
  if (!plan || plan.plan === 'pro' || !photosNearLimit(plan)) return null
  const full = plan.photos.used >= plan.photos.limit
  return (
    <div className={`plan-nudge ${full ? 'is-full' : ''}`} role="status">
      <span>
        {full ? (
          <>Você chegou a {plan.photos.limit} fotos, o limite do Grátis. Para guardar novas, exclua fotos antigas.</>
        ) : (
          <>
            Você tem {plan.photos.used} de {plan.photos.limit} fotos do plano Grátis.
          </>
        )}
      </span>
      <button type="button" className="link-btn" onClick={openPro}>
        Conheça o Pro
      </button>
    </div>
  )
}
