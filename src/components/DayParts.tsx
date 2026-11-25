// Peças de uma finalização (dia de lavagem), usadas no Diário e na tela do dia: os três momentos
// lado a lado, os selos da rotina e o menu ⋯ com as ações (editar rotina, analisar, PDF, excluir).
import { useEffect, useMemo, useState } from 'react'
import { DropIcon, MoreIcon } from './ActionIcons'
import { AnalyzeSheet } from './FinalizationAnalysis'
import { DeleteFinalizationSheet } from './DeleteFinalizationSheet'
import { PdfShareSheet } from './PdfShareSheet'
import { PhotoView } from './PhotoView'
import { coverPhoto } from './ProductThumb'
import { useToast } from './Toasts'
import { fetchAnalyses, type FinalizationAnalysis } from '../lib/analysis'
import { MOMENT_SLUG, STAGE_LABEL, STAGE_TYPES, canAddMoment, formatDateTime, formatTime, nextMoment, productLabel, type Experiment, type Finalization, type Stage } from '../lib/domain'
import { finalizationOption } from '../lib/finalizationShare'
import { productType } from '../lib/productGuide'
import { itemName, routineTable, sortRoutine, stepLabel, type RoutineItem, type RoutineStep } from '../lib/routine'
import { href } from '../lib/router'
import { useHistory, useThumbUrls } from '../lib/state'
import { weatherLong } from '../lib/weather'

/** Os momentos na ordem (molhado, seco, dia seguinte), só os registrados. */
export const stagesOf = (f: Finalization): Stage[] => STAGE_TYPES.flatMap((t) => (f.moments[t] ? [f.moments[t]!] : []))

/** Clima do dia: o do seco, senão do molhado, senão do dia seguinte. */
export const dayWeather = (f: Finalization) => (['dry', 'wet', 'next_day'] as const).map((t) => f.moments[t]).find((s) => s?.humidity != null)

/** Foto de capa do dia (para miniaturas): a do seco, senão a do primeiro momento. */
export function dayCover(f: Finalization) {
  const st = f.moments.dry ?? stagesOf(f)[0]
  return st ? coverPhoto(st) : undefined
}

/** "82% · 24°C" com a gota. */
export function DayWeather({ fin }: { fin: Finalization }) {
  const w = dayWeather(fin)
  if (!w) return null
  return (
    <span className="muted small day-weather" title={weatherLong(w) ?? undefined}>
      <DropIcon /> {w.humidity}% · {Math.round(w.temperature ?? 0)}°C
    </span>
  )
}

/** Selos da rotina (o tipo de cada produto); o que mudou desde a anterior vai destacado. */
export function DayChips({
  experiment,
  items,
  byId,
  changed = new Set<RoutineStep>(),
}: {
  experiment: Experiment
  items: RoutineItem[]
  byId: Map<string, Experiment>
  changed?: Set<RoutineStep>
}) {
  return (
    <ul className="day-chips" aria-label="Rotina">
      {experiment.product_mode === 'none' && <li className="day-chip day-chip-none">Sem finalizador</li>}
      {items.length === 0 && experiment.product_mode === 'named' && <li className="day-chip">{productLabel(experiment)}</li>}
      {sortRoutine(items).map((it) => {
        const e = byId.get(it.experiment_id)
        const label = e ? (productType(e.category)?.label ?? itemName(e)) : itemName(e)
        return (
          <li key={it.experiment_id} className={`day-chip ${changed.has(it.step) ? 'changed' : ''}`} title={`${stepLabel(it.step)}: ${itemName(e)}`}>
            {label}
            {it.mask_kind ? ` · ${it.mask_kind}` : ''}
          </li>
        )
      })}
    </ul>
  )
}

/** Os três momentos lado a lado; o que falta vira atalho (só na mais recente do produto, nos primeiros dias). */
export function MomentStrip({
  finalization: f,
  urls,
  saved,
  latest,
  when,
  humidity = true,
}: {
  finalization: Finalization
  urls: Record<string, string>
  saved: string | null
  latest: boolean
  when: string
  /** Mostrar a umidade em cada momento (no cartão do dia ela já está no cabeçalho). */
  humidity?: boolean
}) {
  const next = nextMoment(f)
  // Completar só a mais recente do produto, nos primeiros dias (refazer = finalização nova).
  const addable = latest && canAddMoment(f)
  const first = STAGE_TYPES.findIndex((t) => f.moments[t])
  return (
    <div className="fin-strip">
      {STAGE_TYPES.map((t, i) => {
        const st = f.moments[t]
        if (st) return <MomentTile key={t} stage={st} urls={urls} highlight={saved === st.id} humidity={humidity} />
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
  )
}

export function MomentTile({ stage, urls, highlight, humidity = true }: { stage: Stage; urls: Record<string, string>; highlight: boolean; humidity?: boolean }) {
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
      <span className="moment-time muted">
        <time dateTime={stage.captured_at}>{formatTime(stage.captured_at)}</time>
        {humidity && stage.humidity != null && (
          <span className="moment-humidity" title={weatherLong(stage) ?? undefined} aria-label={`umidade ${stage.humidity}%`}>
            <DropIcon />
            {stage.humidity}%
          </span>
        )}
      </span>
    </a>
  )
}

/** "hoje", "ontem" ou "22/11" (para "Finalização de hoje"). */
const whenWord = (when: string) => (/^(Hoje|Ontem)/.test(when) ? when[0].toLowerCase() + when.slice(1) : when)

/** Cartão de uma finalização nas folhas (análise, PDF, excluir): momentos e miniaturas. */
function singleCard(f: Finalization, when: string, urls: Record<string, string>) {
  const stages = stagesOf(f)
  return {
    fin: f,
    label: when,
    detail: stages.map((st) => STAGE_LABEL[st.stage_type]).join(' · '),
    thumbs: stages.map((st) => {
      const c = coverPhoto(st)
      return { url: c ? urls[c.storage_path] : undefined, crop: c?.crop }
    }),
  }
}

type Action = { kind: 'ai' | 'delete' } | { kind: 'pdf'; analysis: FinalizationAnalysis | null }

/**
 * Menu ⋯ de uma finalização, com as folhas de cada ação. Excluir: depois de apagar, chama
 * onDeleted (a tela do dia volta para o Diário).
 */
export function FinalizationMenu({ experiment, fin, when, onDeleted }: { experiment: Experiment; fin: Finalization; when: string; onDeleted?: () => void }) {
  const { experiments, routines, patchStage } = useHistory()
  const notify = useToast()
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const paths = useMemo(() => (action ? stagesOf(fin).flatMap((s) => (coverPhoto(s) ? [coverPhoto(s)!.storage_path] : [])) : []), [action, fin])
  const { urls } = useThumbUrls(paths)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (!(e.target as HTMLElement).closest?.('.day-menu')) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('click', close)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  function pick(kind: 'ai' | 'pdf' | 'delete') {
    setOpen(false)
    if (kind !== 'pdf') return setAction({ kind })
    void fetchAnalyses([fin.id])
      .catch(() => new Map<string, FinalizationAnalysis>())
      .then((m) => setAction({ kind: 'pdf', analysis: m.get(fin.id) ?? null }))
  }

  const card = singleCard(fin, when, urls)
  return (
    <div className="day-menu">
      <button
        type="button"
        className="icon-btn icon-btn-small"
        aria-label={`Ações da finalização de ${when}`}
        title="Ações"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon size={18} />
      </button>
      {open && (
        <div className="day-pop" role="menu" aria-label={`Finalização de ${when}`}>
          <a role="menuitem" className="day-item" href={href(`/rotina/${fin.id}`)}>
            Editar rotina
          </a>
          <button type="button" role="menuitem" className="day-item" onClick={() => pick('ai')}>
            Analisar com IA
          </button>
          <button type="button" role="menuitem" className="day-item" onClick={() => pick('pdf')}>
            Enviar PDF
          </button>
          <button type="button" role="menuitem" className="day-item danger-text" onClick={() => pick('delete')}>
            Excluir finalização
          </button>
        </div>
      )}

      {action?.kind === 'pdf' && (
        <PdfShareSheet
          heading="Enviar PDF da finalização"
          pick="list"
          options={[{ ...finalizationOption(experiment, fin, when, action.analysis, routineTable(routines[fin.id], experiments ?? [])), ...card }]}
          onClose={() => setAction(null)}
        />
      )}
      {action?.kind === 'ai' && (
        <AnalyzeSheet
          product={whenWord(when)}
          choices={[card]}
          onNotes={(changes) => changes.forEach((c) => patchStage(c.stageId, { notes: c.notes }))}
          onClose={() => setAction(null)}
        />
      )}
      {action?.kind === 'delete' && (
        <DeleteFinalizationSheet
          product={whenWord(when)}
          choices={[card]}
          onClose={() => setAction(null)}
          onDeleted={() => {
            setAction(null)
            notify('Finalização excluída.')
            onDeleted?.()
          }}
        />
      )}
    </div>
  )
}
