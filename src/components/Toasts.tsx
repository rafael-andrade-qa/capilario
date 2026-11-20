// Avisos rápidos (toasts) para confirmações e erros que não pedem ação imediata:
// "Seco salvo.", "Momento excluído.", "Foto trocada."…
//
// Boas práticas seguidas (Material snackbar, design systems da Sainsbury's/Polaris/Maersk,
// LogRocket, Primer):
//  * um lugar só: embaixo, centralizado, acima da área segura do iPhone;
//  * curtos e somem sozinhos (sucesso 4 s, erro 7 s); tocar fecha; o tempo pausa enquanto
//    o dedo/mouse está em cima ou o foco está no aviso;
//  * cor E ícone dizem o tipo (nunca só a cor): verde ✓ sucesso, vermelho ! erro, neutro i;
//  * leitores de tela: região "status" (educada) para sucesso/info e "alert" para erro;
//  * no máximo 3 na tela; validação de formulário e falhas que pedem ação ficam no lugar.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  text: string
}
type Notify = (text: string, kind?: ToastKind) => void

const DURATION: Record<ToastKind, number> = { success: 4000, info: 4000, error: 7000 }
const MAX = 3

const ToastContext = createContext<Notify>(() => undefined)

export function useToast(): Notify {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  const notify = useCallback<Notify>((text, kind = 'success') => {
    setToasts((list) => {
      // O mesmo aviso repetido não empilha.
      const rest = list.filter((t) => !(t.text === text && t.kind === kind))
      return [...rest, { id: next.current++, kind, text }].slice(-MAX)
    })
  }, [])

  const polite = toasts.filter((t) => t.kind !== 'error')
  const urgent = toasts.filter((t) => t.kind === 'error')
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts">
        <div role="status" aria-live="polite" className="toast-region">
          {polite.map((t) => (
            <ToastItem key={t.id} toast={t} onDone={dismiss} />
          ))}
        </div>
        <div role="alert" aria-live="assertive" className="toast-region">
          {urgent.map((t) => (
            <ToastItem key={t.id} toast={t} onDone={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const left = useRef(DURATION[toast.kind])
  const startedAt = useRef(0)

  const close = useCallback(() => {
    setLeaving(true)
    window.setTimeout(() => onDone(toast.id), 160)
  }, [onDone, toast.id])

  useEffect(() => {
    if (paused || leaving) return
    startedAt.current = Date.now()
    const timer = window.setTimeout(close, left.current)
    return () => {
      window.clearTimeout(timer)
      left.current = Math.max(800, left.current - (Date.now() - startedAt.current))
    }
  }, [paused, leaving, close])

  const icon = toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i'
  return (
    <button
      type="button"
      className={`toast toast-${toast.kind} ${leaving ? 'leaving' : ''}`}
      onClick={close}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      title="Toque para fechar"
    >
      <span className="toast-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="toast-text">{toast.text}</span>
    </button>
  )
}

/** Mostra um aviso uma vez só por chave (avisos vindos do endereço não repetem ao recarregar). */
const shown = new Set<string>()
export function useToastOnce(key: string | null, text: string, kind: ToastKind = 'success') {
  const notify = useToast()
  const memoKey = useMemo(() => (key ? `${kind}:${key}` : null), [key, kind])
  useEffect(() => {
    if (!memoKey || shown.has(memoKey)) return
    shown.add(memoKey)
    notify(text, kind)
  }, [memoKey, text, kind, notify])
}
