// Seletor próprio (padrão "select-only combobox" do WAI-ARIA): a lista abre logo abaixo do
// campo, com a mesma largura, e mostra a foto do produto em cada opção. Se não couber
// embaixo, abre para cima. Teclado: setas, Home/End, Enter/Espaço, Esc.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface DropdownOption {
  value: string
  label: string
  sublabel?: string
  thumb?: ReactNode
  group?: string
  hint?: string
}

interface Props {
  label: string
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  testId?: string
  prefix?: ReactNode
}

export function Dropdown({ label, value, options, onChange, testId, prefix }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState<{ up: boolean; max: number }>({ up: false, max: 320 })
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const listId = useId()
  const optId = (i: number) => `${listId}-o${i}`
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const selected = options[selectedIndex]

  function openList() {
    setActive(selectedIndex)
    setOpen(true)
  }
  function choose(i: number) {
    const o = options[i]
    setOpen(false)
    trigger.current?.focus()
    if (o && o.value !== value) onChange(o.value)
  }

  // Posição: embaixo por padrão; para cima só se faltar espaço e houver mais em cima.
  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const r = trigger.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 16
    const above = r.top - 16
    const up = below < 220 && above > below
    setPlace({ up, max: Math.max(160, Math.min(360, up ? above : below)) })
  }, [open])

  // Fecha ao tocar fora.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Mantém a opção ativa visível.
  useEffect(() => {
    if (open) list.current?.querySelector(`#${CSS.escape(optId(active))}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1))
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(last)
    else if (e.key === 'Enter' || e.key === ' ') choose(active)
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false)
      return
    } else return
    e.preventDefault()
  }

  let lastGroup: string | undefined
  return (
    <div ref={wrap} className={`dd ${open ? 'open' : ''}`}>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        className="dd-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optId(active) : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        data-testid={testId}
        data-value={value}
      >
        {prefix}
        {selected?.thumb}
        <span className="dd-text">
          <span className="dd-label">{selected?.label ?? 'Escolha'}</span>
          {selected?.sublabel && <span className="dd-sub">{selected.sublabel}</span>}
        </span>
        <svg className="dd-chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          className={`dd-list ${place.up ? 'up' : ''}`}
          style={{ maxHeight: place.max }}
        >
          {options.map((o, i) => {
            const header = o.group && o.group !== lastGroup ? o.group : null
            lastGroup = o.group
            return [
              header && (
                <li key={`g-${header}`} role="presentation" className="dd-group">
                  {header}
                </li>
              ),
              <li
                key={o.value}
                id={optId(i)}
                role="option"
                aria-selected={o.value === value}
                data-value={o.value}
                className={`dd-option ${i === active ? 'active' : ''} ${o.value === value ? 'selected' : ''}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
              >
                {o.thumb}
                <span className="dd-text">
                  <span className="dd-label">{o.label}</span>
                  {(o.sublabel || o.hint) && (
                    <span className="dd-sub">
                      {o.sublabel}
                      {o.hint && <em> · {o.hint}</em>}
                    </span>
                  )}
                </span>
                {o.value === value && (
                  <svg className="dd-check" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                    <path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                )}
              </li>,
            ]
          })}
        </ul>
      )}
    </div>
  )
}
