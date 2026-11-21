// Visualizador de fotos: um cartão flutuante sobre o fundo desfocado, com a foto no enquadramento
// do app. Deslizar para o lado (ou as setas, fora do cartão, ou o teclado) passa pelos ângulos
// do momento; puxar para baixo, tocar fora ou o ✕ fecha. Os ângulos ficam embaixo para pular direto.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { cropStyle, type Crop } from '../lib/framing'
import { edgeResist, lockAxis, swipeOutcome, type Axis } from '../lib/swipe'

export interface ViewerPhoto {
  key: string
  label: string
  url?: string
  crop?: Crop | null
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        d={dir === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'}
        stroke="currentColor"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export function PhotoViewer({
  photos,
  index,
  context,
  onIndex,
  onClose,
}: {
  photos: ViewerPhoto[]
  index: number
  context?: string
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const gesture = useRef<{ x: number; y: number; t: number; axis: Axis | null; id: number } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const current = photos[index]
  const canPrev = index > 0
  const canNext = index < photos.length - 1

  // Teclado: setas trocam, Esc fecha.
  const keys = useRef({ index, canPrev, canNext, onIndex, onClose })
  keys.current = { index, canPrev, canNext, onIndex, onClose }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current
      if (e.key === 'Escape') k.onClose()
      else if (e.key === 'ArrowRight' && k.canNext) k.onIndex(k.index + 1)
      else if (e.key === 'ArrowLeft' && k.canPrev) k.onIndex(k.index - 1)
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [])

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gesture.current = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null, id: e.pointerId }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.axis) g.axis = lockAxis(dx, dy)
    if (g.axis === 'x') setDrag({ dx: edgeResist(dx, canPrev, canNext), dy: 0 })
    else if (g.axis === 'y') setDrag({ dx: 0, dy: Math.max(0, dy) })
  }

  function up(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    gesture.current = null
    setDrag(null)
    if (!g || g.id !== e.pointerId) return
    const box = stageRef.current?.getBoundingClientRect()
    const result = swipeOutcome(
      { dx: e.clientX - g.x, dy: e.clientY - g.y, ms: performance.now() - g.t, width: box?.width ?? 1, height: box?.height ?? 1, axis: g.axis },
      canPrev,
      canNext,
    )
    if (result === 'next') onIndex(index + 1)
    else if (result === 'prev') onIndex(index - 1)
    else if (result === 'close') onClose()
  }

  function cancel() {
    gesture.current = null
    setDrag(null)
  }

  const height = stageRef.current?.clientHeight || 500
  const pull = drag ? Math.min(drag.dy / height, 1) : 0
  const easing = drag ? 'none' : 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)'
  const trackStyle = { transform: `translate3d(calc(${-index * 100}% + ${drag?.dx ?? 0}px), 0, 0)`, transition: easing }
  const wrapStyle = { transform: `translate3d(0, ${drag?.dy ?? 0}px, 0) scale(${1 - pull * 0.2})`, transition: easing }

  return (
    <div
      className="pv"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto: ${current?.label ?? ''}`}
      style={{ opacity: 1 - pull * 0.6 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="pv-wrap" style={wrapStyle}>
        <div className="pv-card">
          <header className="pv-top">
            <div className="pv-title">
              <strong>{current?.label}</strong>
              <span>
                {context ? `${context} · ` : ''}
                {index + 1} de {photos.length}
              </span>
            </div>
            <button ref={closeRef} type="button" className="pv-close" onClick={onClose} aria-label="Fechar">
              <CloseIcon />
            </button>
          </header>

          <div
            ref={stageRef}
            className="pv-stage"
            data-testid="viewer-stage"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancel}
          >
            <div className="pv-track" style={trackStyle}>
              {photos.map((p, i) => (
                <div key={p.key} className="pv-slide" aria-hidden={i !== index}>
                  {p.url ? (
                    <img src={p.url} alt={p.label} draggable={false} className={p.crop ? 'cropped' : 'cover'} style={p.crop ? cropStyle(p.crop) : undefined} />
                  ) : (
                    <span className="pv-loading">Carregando…</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {canPrev && !drag && (
          <button type="button" className="pv-arrow prev" onClick={() => onIndex(index - 1)} aria-label="Foto anterior">
            <Chevron dir="left" />
          </button>
        )}
        {canNext && !drag && (
          <button type="button" className="pv-arrow next" onClick={() => onIndex(index + 1)} aria-label="Próxima foto">
            <Chevron dir="right" />
          </button>
        )}

        {photos.length > 1 && (
          <nav className="pv-tabs" aria-label="Ângulos">
            {photos.map((p, i) => (
              <button key={p.key} type="button" className="pv-tab" aria-current={i === index ? 'true' : undefined} onClick={() => onIndex(i)}>
                {p.label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}
