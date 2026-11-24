// "Conheça o Pro": abre por cima de tudo quando um limite do Grátis é atingido (ou pelo botão na
// conta). Diz o que travou, quando renova e o que o Pro libera. A assinatura entra na próxima fase.
import { useEffect, useState } from 'react'
import { LIMIT_EVENT, PLAN_FEATURES, renewsText, usePlan, type LimitKind, type Plan } from '../lib/plan'
import { useSheet } from './FinalizationStrip'

type Reason = LimitKind | 'pro'

function headline(reason: Reason, plan: Plan | null): { title: string; text: string } {
  const pro = plan?.plan === 'pro'
  if (reason === 'analyses') {
    return pro
      ? { title: 'Você já fez a análise de hoje', text: 'No Pro é 1 análise por dia. Amanhã libera de novo.' }
      : { title: 'Você já usou a análise do mês', text: `No Grátis é 1 análise com IA por mês${plan ? ` (${renewsText(plan.analyses)})` : ''}. No Pro, você analisa toda finalização: 1 por dia.` }
  }
  if (reason === 'identify') {
    return pro
      ? { title: 'Você já usou as identificações de hoje', text: 'No Pro são 10 por dia. Amanhã libera de novo; até lá, cadastre à mão.' }
      : { title: 'Você já usou as identificações da semana', text: `No Grátis são 3 por semana${plan ? ` (${renewsText(plan.identify)})` : ''}. Até lá, cadastre à mão, ou passe para o Pro: 10 por dia.` }
  }
  if (reason === 'photos') {
    return pro
      ? { title: 'Você chegou a 1.000 fotos', text: 'Exclua fotos antigas para guardar novas.' }
      : { title: `Você chegou a ${plan?.photos.limit ?? 300} fotos`, text: 'É o limite do Grátis. Para guardar novas, exclua fotos antigas ou passe para o Pro: até 1.000 fotos.' }
  }
  return { title: 'Conheça o Pro', text: 'Para quem quer acompanhar cada finalização de perto.' }
}

export function ProSheet({ reason, onClose }: { reason: Reason; onClose: () => void }) {
  const plan = usePlan()
  const sheet = useSheet(onClose)
  const [asked, setAsked] = useState(false)
  const { title, text } = headline(reason, plan)
  const isPro = plan?.plan === 'pro'
  return (
    <div className="sheet-backdrop pro-backdrop" onClick={onClose}>
      <div ref={sheet} className="sheet pro-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <span className="pro-badge">Pro</span>
        <h2 className="sheet-title pro-title">{title}</h2>
        <p className="pro-text">{text}</p>

        {!isPro && (
          <table className="pro-compare">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Recurso</span>
                </th>
                <th scope="col">Grátis</th>
                <th scope="col" className="pro-col">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map((f) => (
                <tr key={f.label}>
                  <th scope="row">{f.label}</th>
                  <td>{f.free}</td>
                  <td className="pro-col">{f.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {asked && (
          <p className="alert alert-info pro-soon" role="status">
            A assinatura do Pro abre em breve. Por enquanto, o seu plano continua o Grátis.
          </p>
        )}
        <div className="pro-actions">
          {!isPro && !asked && (
            <button type="button" className="btn btn-primary btn-block" onClick={() => setAsked(true)}>
              Quero o Pro
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
            {isPro || asked ? 'Entendi' : 'Agora não'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Fica montado nas telas do app e abre o "Conheça o Pro" quando alguém avisa (limitReached/openPro). */
export function ProSheetHost() {
  const [reason, setReason] = useState<Reason | null>(null)
  useEffect(() => {
    const on = (e: Event) => setReason((e as CustomEvent<Reason>).detail)
    window.addEventListener(LIMIT_EVENT, on)
    return () => window.removeEventListener(LIMIT_EVENT, on)
  }, [])
  return reason ? <ProSheet key={reason} reason={reason} onClose={() => setReason(null)} /> : null
}
