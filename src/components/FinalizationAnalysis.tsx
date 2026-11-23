// Análise da finalização inteira pela IA. Começa no brilho da barra do produto (AnalyzeSheet:
// escolhe a finalização e analisa). A leitura também aparece na tela de cada momento, num cartão
// fechado de uma linha, com a observação sugerida embaixo do campo para usar ou descartar.
import { useEffect, useState } from 'react'
import { CheckIcon, CloseIcon } from './ActionIcons'
import { FinalizationStrip, stripIntro, useSheet, type FinalizationChoice } from './FinalizationStrip'
import { useToast } from './Toasts'
import {
  analysisPhotos,
  analyzeFinalization,
  analyzeQuotaLeft,
  analyzedIds,
  applySuggestions,
  costLabel,
  fetchAnalysis,
  modelLabel,
  setNotesState,
  suggestedMoments,
  type FinalizationAnalysis,
} from '../lib/analysis'
import { STAGE_LABEL, formatShortDateTime, type Finalization, type StageType } from '../lib/domain'

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

type NotesChange = { stageId: string; notes: string | null }

export interface AnalysisApi {
  analysis: FinalizationAnalysis | null
  photoCount: number
  busy: boolean
  quotaLeft: number | null
  run: () => Promise<void>
  apply: () => Promise<void>
  dismiss: () => Promise<void>
  applying: boolean
}

export function useFinalizationAnalysis(
  fin: Finalization | undefined,
  onNotes: (changes: NotesChange[]) => void,
  { quota = false }: { quota?: boolean } = {},
): AnalysisApi {
  const notify = useToast()
  const [analysis, setAnalysis] = useState<FinalizationAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [quotaLeft, setQuotaLeft] = useState<number | null>(null)
  const finId = fin?.id

  useEffect(() => {
    setAnalysis(null)
    if (!finId) return
    let alive = true
    fetchAnalysis(finId)
      .then((a) => alive && setAnalysis(a))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [finId])

  useEffect(() => {
    if (quota) void analyzeQuotaLeft().then(setQuotaLeft)
  }, [quota])

  async function run() {
    if (!fin || busy) return
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
    quotaLeft,
    run,
    apply,
    dismiss,
    applying,
  }
}


/**
 * "Analisar com IA" (barra do produto, ao lado do + e do PDF): escolhe a finalização, mostra a
 * leitura que ela já tem e analisa (ou analisa de novo) a finalização inteira. Tocar em Analisar
 * aqui já é a confirmação; a linha de baixo diz quantas fotos vão e quantas análises restam.
 */
export function AnalyzeSheet({
  product,
  choices,
  onNotes,
  onClose,
}: {
  product: string
  choices: FinalizationChoice[]
  onNotes: (changes: NotesChange[]) => void
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const [analyzed, setAnalyzed] = useState<Set<string>>(() => new Set())
  const sheet = useSheet(onClose)
  const fin = choices[index]?.fin
  const ai = useFinalizationAnalysis(fin, onNotes, { quota: true })
  const ids = choices.map((c) => c.fin.id).join(',')

  useEffect(() => {
    let alive = true
    analyzedIds(ids ? ids.split(',') : [])
      .then((s) => alive && setAnalyzed(s))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [ids])

  const current = ai.analysis?.finalization_id
  useEffect(() => {
    if (current) setAnalyzed((s) => (s.has(current) ? s : new Set(s).add(current)))
  }, [current])

  const heading = 'Analisar com IA'
  const shown = ai.analysis && ai.analysis.finalization_id === fin?.id ? ai.analysis : null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={sheet} className="sheet ai-sheet" role="dialog" aria-modal="true" aria-label={heading} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <h2 className="sheet-title">{heading}</h2>
        <p className="muted small pdf-intro">{stripIntro(choices.length, product)}</p>
        <FinalizationStrip
          choices={choices}
          index={index}
          onSelect={setIndex}
          locked={ai.busy}
          mark={(f) =>
            analyzed.has(f.id) && (
              <span className="ai-card-mark" title="Já analisada">
                <SparkIcon size={13} />
                <span className="visually-hidden"> · já analisada</span>
              </span>
            )
          }
        />

        {ai.busy ? (
          <p className="analysis-line muted small" role="status">
            <span className="mini-spinner" aria-hidden="true" /> Analisando {ai.photoCount} fotos… pode levar até 1 minuto.
          </p>
        ) : shown ? (
          <>
            <AnalysisCard key={shown.finalization_id + shown.created_at} analysis={shown} defaultOpen />
            {fin && <AnalysisSuggestions api={ai} fin={fin} />}
          </>
        ) : (
          <p className="muted small ai-empty">A IA olha as fotos de todos os momentos desta finalização, lê o tipo do cabelo, dá notas e sugere as observações.</p>
        )}

        <p className="muted small ai-foot">
          {ai.photoCount} {ai.photoCount === 1 ? 'foto' : 'fotos'}
          {ai.quotaLeft != null && ` · restam ${ai.quotaLeft} ${ai.quotaLeft === 1 ? 'análise' : 'análises'} hoje`}
        </p>
        <div className="pdf-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className={`btn btn-primary ${ai.busy ? 'is-busy' : ''}`}
            onClick={() => void ai.run()}
            disabled={ai.busy || ai.photoCount === 0 || ai.quotaLeft === 0}
          >
            {ai.busy ? 'Analisando…' : shown ? 'Analisar de novo' : 'Analisar'}
          </button>
        </div>
      </div>
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
export function AnalysisCard({ analysis, defaultOpen = false }: { analysis: FinalizationAnalysis; defaultOpen?: boolean }) {
  const r = analysis.result
  const cost = costLabel(analysis.usage?.cost_usd)
  return (
    <details className="analysis-card" data-testid="analysis-card" open={defaultOpen}>
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

/** Na folha: as observações sugeridas de todos os momentos, para usar de uma vez ou descartar. */
function AnalysisSuggestions({ api, fin }: { api: AnalysisApi; fin: Finalization }) {
  const a = api.analysis
  if (!a || a.notes_state !== 'pending') return null
  const moments = suggestedMoments(fin, a)
  if (!moments.length) return null
  const n = moments.length
  return (
    <div className="analysis-suggestion" data-testid="analysis-suggestions">
      <p className="analysis-suggestion-head small">
        <SparkIcon size={14} /> Observações sugeridas
      </p>
      <ul className="analysis-suggestion-list">
        {moments.map((t) => (
          <li key={t}>
            <strong>{STAGE_LABEL[t]}:</strong> {a.result.notes[t].trim()}
          </li>
        ))}
      </ul>
      <SuggestionActions api={api} label={n > 1 ? `Usar nas ${n} observações` : 'Usar na observação'} />
    </div>
  )
}

/** Na tela do momento: a observação sugerida para ele, embaixo do campo. */
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
      <SuggestionActions api={api} label={n > 1 ? `Usar nos ${n} momentos` : 'Usar na observação'} />
    </div>
  )
}

function SuggestionActions({ api, label }: { api: AnalysisApi; label: string }) {
  return (
    <div className="analysis-suggestion-actions">
      <button type="button" className={`btn btn-small ${api.applying ? 'is-busy' : ''}`} onClick={() => void api.apply()} disabled={api.applying}>
        {!api.applying && <CheckIcon size={16} />}
        {label}
      </button>
      <button type="button" className="icon-btn icon-btn-sm" onClick={() => void api.dismiss()} disabled={api.applying} aria-label="Descartar sugestão" title="Descartar">
        <CloseIcon size={14} />
      </button>
    </div>
  )
}
