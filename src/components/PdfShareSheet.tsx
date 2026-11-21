// Enviar em PDF: a folha abre já preparando o PDF; a mensagem vem pronta e dá para editar.
// "Enviar" abre o compartilhamento do aparelho (WhatsApp, e-mail…) na hora do toque; por isso o
// PDF é gerado antes (o iPhone só deixa compartilhar dentro do toque).
// Com mais de uma opção (ex.: "Este momento" / "Finalização inteira"), um seletor troca o PDF e
// a mensagem; cada PDF é montado uma vez só.
import { useEffect, useRef, useState } from 'react'
import { shareFile } from '../lib/share'
import { useToast } from './Toasts'

/** Ícone do envio em PDF: folha com a seta de compartilhar. */
export function PdfIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z" />
        <path d="M14 3v5h5" />
        <path d="M12 17.5v-6M9.5 14l2.5-2.5 2.5 2.5" />
      </g>
    </svg>
  )
}

export interface PdfOption {
  /** Nome no seletor (só aparece com mais de uma opção). */
  label: string
  /** O que vai no PDF (ex.: "4 fotos do Seco"). */
  summary: string
  message: string
  build: () => Promise<{ blob: Blob; fileName: string }>
}

type Built = { file: File | null; failed: boolean }

export function PdfShareSheet({
  heading,
  options,
  onClose,
}: {
  heading: string
  options: PdfOption[]
  onClose: () => void
}) {
  const notify = useToast()
  const [index, setIndex] = useState(0)
  const [messages, setMessages] = useState(() => options.map((o) => o.message))
  const [built, setBuilt] = useState<Record<number, Built>>({})
  const [sending, setSending] = useState(false)
  const sheet = useRef<HTMLDivElement>(null)
  const started = useRef(new Set<number>())
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const option = options[index]
  const state = built[index] ?? { file: null, failed: false }

  useEffect(() => {
    if (started.current.has(index)) return
    started.current.add(index)
    const i = index
    options[i]
      .build()
      .then(({ blob, fileName }) => setBuilt((b) => ({ ...b, [i]: { file: new File([blob], fileName, { type: 'application/pdf' }), failed: false } })))
      .catch(() => setBuilt((b) => ({ ...b, [i]: { file: null, failed: true } })))
  }, [index, options])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheet.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  async function send() {
    if (!state.file || sending) return
    setSending(true)
    const result = await shareFile(state.file, messages[index], heading)
    setSending(false)
    if (result === 'cancelled') return
    notify(result === 'shared' ? 'PDF enviado.' : 'PDF baixado. A mensagem foi copiada: é só colar.', 'success')
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={sheet} className="sheet pdf-sheet" role="dialog" aria-modal="true" aria-label={heading} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <h2 className="sheet-title">{heading}</h2>
        {options.length > 1 && (
          <div className="segmented pdf-choice" role="group" aria-label="O que enviar">
            {options.map((o, i) => (
              <button key={o.label} type="button" className={`seg ${i === index ? 'on' : ''}`} aria-pressed={i === index} onClick={() => setIndex(i)}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        <p className="muted small pdf-summary">
          <PdfIcon size={16} />{' '}
          {state.failed ? 'Não foi possível montar o PDF agora.' : state.file ? `${option.summary} · ${state.file.name}` : `Preparando o PDF (${option.summary})…`}
        </p>
        <label className="field pdf-message">
          <span className="field-label">Mensagem</span>
          <textarea
            rows={5}
            value={messages[index]}
            maxLength={1000}
            onChange={(e) => {
              const v = e.target.value
              setMessages((m) => m.map((x, i) => (i === index ? v : x)))
            }}
          />
        </label>
        <div className="pdf-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={!state.file || sending}>
            {state.file ? 'Enviar' : state.failed ? 'Indisponível' : 'Preparando…'}
          </button>
        </div>
      </div>
    </div>
  )
}
