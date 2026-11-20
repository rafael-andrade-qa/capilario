// Enviar em PDF: a folha abre já preparando o PDF; a mensagem vem pronta e dá para editar.
// "Enviar" abre o compartilhamento do aparelho (WhatsApp, e-mail…) na hora do toque; por isso o
// PDF é gerado antes (o iPhone só deixa compartilhar dentro do toque).
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

export function PdfShareSheet({
  heading,
  summary,
  message: initialMessage,
  build,
  onClose,
}: {
  heading: string
  /** O que vai no PDF (ex.: "4 fotos do Seco de 19/11"). */
  summary: string
  message: string
  build: () => Promise<{ blob: Blob; fileName: string }>
  onClose: () => void
}) {
  const notify = useToast()
  const [message, setMessage] = useState(initialMessage)
  const [file, setFile] = useState<File | null>(null)
  const [failed, setFailed] = useState(false)
  const [sending, setSending] = useState(false)
  const sheet = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (started.current) return
    started.current = true
    build()
      .then(({ blob, fileName }) => setFile(new File([blob], fileName, { type: 'application/pdf' })))
      .catch(() => setFailed(true))
  }, [build])

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
    if (!file || sending) return
    setSending(true)
    const result = await shareFile(file, message, heading)
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
        <p className="muted small pdf-summary">
          <PdfIcon size={16} /> {failed ? 'Não foi possível montar o PDF agora.' : file ? `${summary} · ${file.name}` : `Preparando o PDF (${summary})…`}
        </p>
        <label className="field pdf-message">
          <span className="field-label">Mensagem</span>
          <textarea rows={5} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <div className="pdf-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={!file || sending}>
            {file ? 'Enviar' : failed ? 'Indisponível' : 'Preparando…'}
          </button>
        </div>
      </div>
    </div>
  )
}
