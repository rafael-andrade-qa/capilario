// Foto no ângulo errado: "Esta foto é…" mostra os outros ângulos com a foto que está em cada um.
// Escolher um ângulo com foto troca as duas de lugar; um ângulo vazio só recebe a foto.
import { useEffect, useRef } from 'react'
import { ANGLES, ANGLE_LABEL, photoByAngle, type Angle, type Stage } from '../lib/domain'
import { PhotoView } from './PhotoView'

/** Duas setas opostas (trocar de lugar). */
export function SwapIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8h14l-4-4M20 16H6l4 4" />
      </g>
    </svg>
  )
}

export function MoveAngleSheet({
  stage,
  angle,
  urls,
  onPick,
  onClose,
}: {
  stage: Stage
  angle: Angle
  urls: Record<string, string>
  onPick: (target: Angle) => void
  onClose: () => void
}) {
  const sheet = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const me = photoByAngle(stage, angle)

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

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={sheet}
        className="sheet move-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Trocar ângulo: ${ANGLE_LABEL[angle]}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="move-head">
          {me && <PhotoView className="move-me" url={urls[me.storage_path]} crop={me.crop} alt="" />}
          <div>
            <h2 className="sheet-title">Esta foto é…</h2>
            <p className="muted small">Agora ela está em {ANGLE_LABEL[angle]}. Escolha o ângulo certo.</p>
          </div>
        </div>
        <div className="move-options">
          {ANGLES.filter((a) => a !== angle).map((a) => {
            const p = photoByAngle(stage, a)
            return (
              <button key={a} type="button" className="move-option" onClick={() => onPick(a)} aria-label={p ? `${ANGLE_LABEL[a]}: troca com a foto que está lá` : `${ANGLE_LABEL[a]}: ângulo vazio`}>
                {p ? (
                  <PhotoView className="move-thumb" url={urls[p.storage_path]} crop={p.crop} alt="" />
                ) : (
                  <span className="move-thumb empty" aria-hidden="true">
                    vazio
                  </span>
                )}
                <span className="move-name">{ANGLE_LABEL[a]}</span>
                <span className="muted move-hint">{p ? 'troca as duas' : 'só move'}</span>
              </button>
            )
          })}
        </div>
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
