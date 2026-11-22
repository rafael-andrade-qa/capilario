// Análise da finalização pela IA, na tela do momento: o brilho ao lado de "Observação" analisa
// (com confirmação, porque custa centavos), a leitura do cabelo fica num cartão fechado de uma
// linha, e a observação sugerida aparece embaixo do campo para usar nos momentos ou descartar.
import { useCallback, useEffect, useState } from 'react'
import { CheckIcon, CloseIcon } from './ActionIcons'
import { useToast } from './Toasts'
import {
  analysisPhotos,
  analyzeFinalization,
  analyzeQuotaLeft,
  applySuggestions,
  costLabel,
  fetchAnalysis,
  modelLabel,
  setNotesState,
  suggestedMoments,
  type FinalizationAnalysis,
} from '../lib/analysis'
import { formatShortDateTime, type Finalization, type StageType } from '../lib/domain'

/** Brilho (análise com IA). */
export function SparkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <path d="M10 3.5l1.6 4.6a3 3 0 0 0 1.8 1.8L18 11.5l-4.6 1.6a3 3 0 0 0-1.8 1.8L10 19.5l-1.6-4.6a3 3 0 0 0-1.8-1.8L2 11.5l4.6-1.6a3 3 0 0 0 1.8-1.8z" />
        <path d="M18.5 3v4M16.5 5h4" />
      </g>
    </svg>
  )
}

export interface AnalysisApi {
  analysis: FinalizationAnalysis | null
  photoCount: number
  busy: boolean
  /** Pedindo confirmação antes de analisar. */
  asking: boolean
  quotaLeft: number | null
  ask: () => void
  cancel: () => void
  run: () => Promise<void>
  apply: () => Promise<void>
  dismiss: () => Promise<void>
  applying: boolean
}

export function useFinalizationAnalysis(
  fin: Finalization | undefined,
  onNotes: (changes: { stageId: string; notes: string | null }[]) => void,
): AnalysisApi {
  const notify = useToast()
  const [analysis, setAnalysis] = useState<FinalizationAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [quotaLeft, setQuotaLeft] = useState<number | null>(null)
  const finId = fin?.id

  useEffect(() => {
    setAnalysis(null)
    setAsking(false)
    if (!finId) return
    let alive = true
    fetchAnalysis(finId)
      .then((a) => alive && setAnalysis(a))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [finId])

  const ask = useCallback(() => {
    setAsking(true)
    void analyzeQuotaLeft().then(setQuotaLeft)
  }, [])

  async function run() {
    if (!fin || busy) return
    setAsking(false)
    setBusy(true)
    try {
      const r = await analyzeFinalization(fin)
      setAnalysis(r.analysis)
      setQuotaLeft(r.quotaLeft)
      const cost = costLabel(r.analysis.usage?.cost_usd)
      notify(`Análise pronta${cost ? ` · ${cost}` : ''}.`)
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!fin || !analysis || applying) return
    setApplying(true)
    try {
      const changed = await applySuggestions(fin, analysis)
      onNotes(changed)
      setAnalysis({ ...analysis, notes_state: 'applied' })
      notify(
        changed.length === 0 ? 'As observações já estavam com essa análise.' : changed.length === 1 ? 'Observação atualizada.' : `${changed.length} observações atualizadas.`,
      )
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setApplying(false)
    }
  }

  async function dismiss() {
    if (!fin || !analysis) return
    const prev = analysis
    setAnalysis({ ...analysis, notes_state: 'dismissed' })
    try {
      await setNotesState(fin.id, 'dismissed')
    } catch (e) {
      setAnalysis(prev)
      notify((e as Error).message, 'error')
    }
  }

  return {
    analysis,
    photoCount: fin ? analysisPhotos(fin).length : 0,
    busy,
    asking,
    quotaLeft,
    ask,
    cancel: () => setAsking(false),
    run,
    apply,
    dismiss,
    applying,
  }
}

/** O brilho ao lado de "Observação". */
export function AnalyzeButton({ api }: { api: AnalysisApi }) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn-sm ${api.asking ? 'on-edit' : ''}`}
      onClick={() => (api.asking ? api.cancel() : api.ask())}
      disabled={api.busy || api.photoCount === 0}
      aria-expanded={api.asking}
      aria-label={api.analysis ? 'Analisar a finalização de novo com IA' : 'Analisar a finalização com IA'}
      title={api.analysis ? 'Analisar de novo com IA' : 'Analisar com IA'}
    >
      <SparkIcon size={17} />
    </button>
  )
}

/** Confirmação (custa centavos) e o aviso enquanto a IA trabalha: uma linha só. */
export function AnalyzeStatus({ api }: { api: AnalysisApi }) {
  if (api.busy) {
    return (
      <p className="analysis-line muted small" role="status">
        <span className="mini-spinner" aria-hidden="true" /> Analisando {api.photoCount} fotos… pode levar até 1 minuto.
      </p>
    )
  }
  if (!api.asking) return null
  return (
    <div className="analysis-line analysis-ask" role="group" aria-label="Confirmar análise">
      <span className="small">
        Analisar {api.photoCount} fotos com IA?
        {api.quotaLeft != null && <span className="muted"> · restam {api.quotaLeft} hoje</span>}
      </span>
      <button type="button" className="btn btn-primary btn-small" onClick={() => void api.run()} disabled={api.quotaLeft === 0}>
        Analisar
      </button>
      <button type="button" className="icon-btn icon-btn-sm" onClick={api.cancel} aria-label="Cancelar análise" title="Cancelar">
        <CloseIcon size={14} />
      </button>
    </div>
  )
}

const SCORE_LABEL: [keyof FinalizationAnalysis['result']['scores'], string][] = [
  ['definition', 'Definição'],
  ['frizz_control', 'Controle do frizz'],
  ['volume', 'Volume'],
  ['day2', 'Dia seguinte'],
]

/** Leitura do cabelo: fechada mostra só o tipo; aberta, notas, características e resumo. */
export function AnalysisCard({ analysis }: { analysis: FinalizationAnalysis }) {
  const r = analysis.result
  const cost = costLabel(analysis.usage?.cost_usd)
  return (
    <details className="analysis-card" data-testid="analysis-card">
      <summary>
        <SparkIcon size={16} />
        <span className="analysis-type one-line">
          <strong>{r.hair_type}</strong>
          {r.tendency && <span className="muted"> · {r.tendency}</span>}
        </span>
        <span className="analysis-chevron" aria-hidden="true" />
      </summary>
      <div className="analysis-body">
        {r.traits.length > 0 && (
          <div className="analysis-traits">
            {r.traits.map((t) => (
              <span key={t} className="analysis-trait">
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="analysis-scores">
          {SCORE_LABEL.map(([k, label]) => {
            const v = r.scores[k]
            return (
              <div key={k} className="analysis-score">
                <span className="muted small">
                  {label} <span className="analysis-score-n">{v == null ? '—' : v}</span>
                </span>
                <span className="analysis-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={10} aria-valuenow={v ?? 0}>
                  <i style={{ width: `${(v ?? 0) * 10}%` }} />
                </span>
              </div>
            )
          })}
        </div>
        {r.summary && <p className="analysis-summary">{r.summary}</p>}
        <p className="muted small analysis-meta">
          {modelLabel(analysis.model)} · {formatShortDateTime(analysis.created_at)}
          {cost && ` · ${cost}`}
        </p>
      </div>
    </details>
  )
}

/** Observação sugerida para este momento, embaixo do campo. */
export function AnalysisSuggestion({ api, fin, moment }: { api: AnalysisApi; fin: Finalization; moment: StageType }) {
  const a = api.analysis
  if (!a || a.notes_state !== 'pending') return null
  const text = a.result.notes?.[moment]?.trim()
  if (!text) return null
  const n = suggestedMoments(fin, a).length
  return (
    <div className="analysis-suggestion" data-testid="analysis-suggestion">
      <p className="analysis-suggestion-text">
        <SparkIcon size={14} /> {text}
      </p>
      <div className="analysis-suggestion-actions">
        <button type="button" className={`btn btn-small ${api.applying ? 'is-busy' : ''}`} onClick={() => void api.apply()} disabled={api.applying}>
          {!api.applying && <CheckIcon size={16} />}
          {n > 1 ? `Usar nos ${n} momentos` : 'Usar na observação'}
        </button>
        <button type="button" className="icon-btn icon-btn-sm" onClick={() => void api.dismiss()} disabled={api.applying} aria-label="Descartar sugestão" title="Descartar">
          <CloseIcon size={14} />
        </button>
      </div>
    </div>
  )
}
