// Enviar em PDF: a folha abre já preparando o PDF; a mensagem vem pronta e dá para editar.
// "Enviar" abre o compartilhamento do aparelho (WhatsApp, e-mail…) na hora do toque; por isso o
// PDF é gerado antes (o iPhone só deixa compartilhar dentro do toque).
// Com mais de uma opção (ex.: "Este momento" / "Finalização inteira"), um seletor troca o PDF e
// a mensagem; cada PDF é montado uma vez só. Em pick="list" (ex.: escolher a finalização), as
// opções viram uma faixa horizontal de cartões (miniaturas, data e momentos): altura fixa, desliza
// para o lado, então serve igual para 2 ou 20 opções.
import { useEffect, useRef, useState } from 'react'
import { cleanFileName, shareFile } from '../lib/share'
import type { Crop } from '../lib/framing'
import { PhotoView } from './PhotoView'
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
  /** O que vai no PDF (ex.: "4 fotos do Seco"), mostrado enquanto ele é montado. */
  summary: string
  message: string
  /** Nome sugerido do arquivo, sem o .pdf (a pessoa pode editar). */
  fileName: string
  build: () => Promise<Blob>
  /** Só na lista: linha de baixo e miniaturas. */
  detail?: string
  thumbs?: { url?: string; crop?: Crop | null }[]
}

type Built = { blob: Blob | null; failed: boolean }

/** Arquivo PDF (folha com a faixa "PDF"), ao lado do nome do arquivo. */
export function PdfFileIcon() {
  return (
    <svg viewBox="0 0 32 40" width="30" height="38" aria-hidden="true" focusable="false" className="pdf-file-icon">
      <path d="M5 1.5h15.5L29 10v26a2.5 2.5 0 0 1-2.5 2.5h-21A2.5 2.5 0 0 1 3 36V4a2.5 2.5 0 0 1 2-2.5z" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
      <path d="M20.5 1.5V8a2 2 0 0 0 2 2H29" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="0.8" y="19" width="22" height="11" rx="2.5" fill="var(--brand)" />
      <text x="11.8" y="27.4" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--brand-ink)" fontFamily="system-ui, sans-serif">
        PDF
      </text>
    </svg>
  )
}

export function PdfShareSheet({
  heading,
  intro,
  pick = 'segmented',
  options,
  onClose,
}: {
  heading: string
  intro?: string
  pick?: 'segmented' | 'list'
  options: PdfOption[]
  onClose: () => void
}) {
  const notify = useToast()
  const [index, setIndex] = useState(0)
  const [messages, setMessages] = useState(() => options.map((o) => o.message))
  const [names, setNames] = useState(() => options.map((o) => o.fileName))
  const [built, setBuilt] = useState<Record<number, Built>>({})
  const [sending, setSending] = useState(false)
  const sheet = useRef<HTMLDivElement>(null)
  const started = useRef(new Set<number>())
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const option = options[index]
  const state = built[index] ?? { blob: null, failed: false }

  useEffect(() => {
    if (started.current.has(index)) return
    started.current.add(index)
    const i = index
    options[i]
      .build()
      .then((blob) => setBuilt((b) => ({ ...b, [i]: { blob, failed: false } })))
      .catch(() => setBuilt((b) => ({ ...b, [i]: { blob: null, failed: true } })))
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
    if (!state.blob || sending) return
    setSending(true)
    const file = new File([state.blob], `${cleanFileName(names[index])}.pdf`, { type: 'application/pdf' })
    const result = await shareFile(file, messages[index], heading)
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
        {intro && <p className="muted small pdf-intro">{intro}</p>}
        {pick === 'list' && (
          <div className="pdf-strip" role="radiogroup" aria-label="Finalização">
            {options.map((o, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={i === index}
                className="pdf-card"
                onClick={(e) => {
                  setIndex(i)
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
                }}
              >
                {o.thumbs && (
                  <span className="pdf-card-thumbs" aria-hidden="true">
                    {o.thumbs.map((t, j) => (
                      <PhotoView key={j} url={t.url} crop={t.crop} alt="" />
                    ))}
                  </span>
                )}
                <strong className="pdf-card-label">{o.label}</strong>
                {o.detail && <span className="muted pdf-card-detail">{o.detail}</span>}
                {i === index && (
                  <span className="pdf-card-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {pick === 'segmented' && options.length > 1 && (
          <div className="segmented pdf-choice" role="group" aria-label="O que enviar">
            {options.map((o, i) => (
              <button key={o.label} type="button" className={`seg ${i === index ? 'on' : ''}`} aria-pressed={i === index} onClick={() => setIndex(i)}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        <div className={`pdf-file ${state.blob ? 'ready' : ''}`}>
          <PdfFileIcon />
          <label className="pdf-file-name">
            <span className="field-label">Nome do arquivo</span>
            <span className="pdf-file-input">
              <input
                type="text"
                value={names[index]}
                maxLength={120}
                enterKeyHint="done"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  const v = e.target.value
                  setNames((n) => n.map((x, i) => (i === index ? v : x)))
                }}
                onBlur={() => setNames((n) => n.map((x, i) => (i === index ? cleanFileName(x) : x)))}
              />
              <span className="pdf-ext" aria-hidden="true">
                .pdf
              </span>
            </span>
          </label>
        </div>
        {!state.blob && (
          <p className="muted small pdf-status" role="status">
            {state.failed ? 'Não foi possível montar o PDF agora.' : `Preparando o PDF (${option.summary})…`}
          </p>
        )}
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
          <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={!state.blob || sending}>
            {state.blob ? 'Enviar' : state.failed ? 'Indisponível' : 'Preparando…'}
          </button>
        </div>
      </div>
    </div>
  )
}
