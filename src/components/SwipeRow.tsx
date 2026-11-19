// Linha que desliza para o lado e revela uma ação (no histórico: Excluir).
// Funciona nos dois sentidos; a rolagem vertical continua normal (touch-action: pan-y).
import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'

export type SwipeOpen = -1 | 0 | 1 // 1 = puxou para a direita (ação à esquerda); -1 = para a esquerda

const ACTION = 96 // largura do botão revelado
const SLOP = 10 // movimento mínimo antes de decidir entre deslizar e rolar

interface Props {
  open: SwipeOpen
  onOpenChange: (open: SwipeOpen) => void
  actionLabel: string
  actionText: string
  onAction: () => void
  children: ReactNode
}

interface Gesture {
  id: number
  x: number
  y: number
  base: number
  axis: 'x' | 'y' | null
}

export function SwipeRow({ open, onOpenChange, actionLabel, actionText, onAction, children }: Props) {
  const [drag, setDrag] = useState<number | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const current = useRef(0)
  const swiped = useRef(false)

  const offset = drag ?? open * ACTION
  const revealed = offset !== 0

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, base: open * ACTION, axis: null }
    swiped.current = false
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.axis) {
      if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
        g.axis = 'x'
        e.currentTarget.setPointerCapture(e.pointerId)
      } else if (Math.abs(dy) > SLOP) {
        g.axis = 'y'
      }
    }
    if (g.axis !== 'x') return
    swiped.current = true
    const next = Math.max(-ACTION * 1.4, Math.min(ACTION * 1.4, g.base + dx))
    current.current = next
    setDrag(next)
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    gesture.current = null
    if (g.axis !== 'x') return
    const v = current.current
    setDrag(null)
    onOpenChange(v > ACTION / 2 ? 1 : v < -ACTION / 2 ? -1 : 0)
  }

  // Um deslize não pode virar toque no link; com a linha aberta, tocar nela só fecha.
  function onClickCapture(e: MouseEvent<HTMLDivElement>) {
    if (swiped.current) {
      // Clique que o mouse gera ao soltar depois de arrastar: ignora (não abre nem fecha).
      e.preventDefault()
      e.stopPropagation()
      swiped.current = false
    } else if (open !== 0) {
      e.preventDefault()
      e.stopPropagation()
      onOpenChange(0)
    }
  }

  return (
    <div className="swipe">
      <button
        type="button"
        className={`swipe-action ${offset >= 0 ? 'at-left' : 'at-right'}`}
        style={{ width: Math.max(ACTION, Math.abs(offset)), visibility: revealed ? 'visible' : 'hidden' }}
        aria-label={actionLabel}
        tabIndex={open !== 0 ? 0 : -1}
        onClick={onAction}
      >
        {actionText}
      </button>
      <div
        className={`swipe-content ${drag === null ? 'settle' : ''}`}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </div>
  )
}
