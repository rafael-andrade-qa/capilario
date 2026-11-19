// Data e horário: o campo mostra "Hoje, 18:01"; tocar abre um painel inferior com fundo
// escurecido, atalhos (Agora, Ontem), calendário compacto e horário. Tocar fora cancela.
import { useEffect, useId, useRef, useState } from 'react'
import { formatLocal, friendlyLocal, isFutureDay, monthGrid, monthTitle, parseLocal, partsOf, sameDay, type LocalParts } from '../lib/dates'

interface Props {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  labelledBy?: string
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const pad = (n: number) => String(n).padStart(2, '0')

export function DateTimeField({ id, value, onChange, disabled, labelledBy }: Props) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  function close(next?: string) {
    setOpen(false)
    if (next) onChange(next)
    trigger.current?.focus()
  }

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        className="field-button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined}
        data-value={value}
      >
        <span>{friendlyLocal(value)}</span>
        <CalendarIcon />
      </button>
      {open && <DateTimeSheet value={value} onCancel={() => close()} onDone={(v) => close(v)} />}
    </>
  )
}

function DateTimeSheet({ value, onCancel, onDone }: { value: string; onCancel: () => void; onDone: (v: string) => void }) {
  const now = new Date()
  const today = partsOf(now)
  const [draft, setDraft] = useState<LocalParts>(() => parseLocal(value) ?? today)
  const [view, setView] = useState({ year: draft.year, month: draft.month })
  const titleId = useId()
  const sheet = useRef<HTMLDivElement>(null)

  // Trava a rolagem do fundo, foca o painel e fecha com Esc.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheet.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onCancel])

  const yesterday = partsOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const atNow = sameDay(draft, today) && draft.hour === today.hour && draft.minute === today.minute
  const isYesterday = sameDay(draft, yesterday)
  const canGoNext = view.year < today.year || (view.year === today.year && view.month < today.month)

  function pickDay(day: number) {
    setDraft((d) => ({ ...d, year: view.year, month: view.month, day }))
  }
  function moveMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }
  function quick(target: LocalParts, keepTime: boolean) {
    const next = keepTime ? { ...target, hour: draft.hour, minute: draft.minute } : target
    setDraft(next)
    setView({ year: next.year, month: next.month })
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div
        ref={sheet}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <h2 id={titleId} className="sheet-title">
          Data e horário
        </h2>

        <div className="chip-row">
          <button type="button" className={`chip-btn ${atNow ? 'on' : ''}`} onClick={() => quick(today, false)}>
            Agora
          </button>
          <button type="button" className={`chip-btn ${isYesterday ? 'on' : ''}`} onClick={() => quick(yesterday, true)}>
            Ontem
          </button>
        </div>

        <div className="cal">
          <div className="cal-head">
            <button type="button" className="cal-nav" onClick={() => moveMonth(-1)} aria-label="Mês anterior">
              ‹
            </button>
            <span className="cal-title" aria-live="polite">
              {monthTitle(view.year, view.month)}
            </span>
            <button type="button" className="cal-nav" onClick={() => moveMonth(1)} disabled={!canGoNext} aria-label="Próximo mês">
              ›
            </button>
          </div>
          <div className="cal-grid" role="group" aria-label={monthTitle(view.year, view.month)}>
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="cal-wd" aria-hidden="true">
                {w}
              </span>
            ))}
            {monthGrid(view.year, view.month)
              .flat()
              .map((day, i) => {
                if (day === null) return <span key={i} />
                const selected = sameDay(draft, { year: view.year, month: view.month, day })
                const isToday = sameDay(today, { year: view.year, month: view.month, day })
                const future = isFutureDay(view.year, view.month, day, now)
                const wd = WEEKDAY_NAMES[new Date(view.year, view.month, day).getDay()]
                return (
                  <button
                    key={i}
                    type="button"
                    className={`cal-day ${selected ? 'on' : ''} ${isToday ? 'today' : ''}`}
                    onClick={() => pickDay(day)}
                    disabled={future}
                    aria-pressed={selected}
                    aria-label={`${wd}, ${day} de ${monthTitle(view.year, view.month)}${isToday ? ' (hoje)' : ''}`}
                  >
                    {day}
                  </button>
                )
              })}
          </div>
        </div>

        <label className="time-row">
          <span>Horário</span>
          <input
            type="time"
            value={`${pad(draft.hour)}:${pad(draft.minute)}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number)
              if (Number.isFinite(h) && Number.isFinite(m)) setDraft((d) => ({ ...d, hour: h, minute: m }))
            }}
            aria-label="Horário"
          />
        </label>

        <button type="button" className="btn btn-primary btn-block btn-large" onClick={() => onDone(formatLocal(draft))}>
          Pronto
        </button>
      </div>
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" className="field-button-icon">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5" width="17" height="15" rx="3" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </g>
    </svg>
  )
}
