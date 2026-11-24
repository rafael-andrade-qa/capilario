// Campo de senha do app: olho para mostrar/esconder e, com o Caps Lock ligado, um ícone discreto
// ao lado do olho (os indicadores nativos do navegador ficam escondidos no CSS). Use em todo campo
// de senha.
import { useId, useState, type KeyboardEvent, type MouseEvent } from 'react'

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {!open && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  )
}

function CapsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M12 4 4.5 12H9v4h6v-4h4.5L12 4Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 19.5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  /** Dica embaixo do campo (fica fora do rótulo, ligada por aria-describedby). */
  hint?: string
}

export function PasswordField({ label, value, onChange, autoComplete, hint }: Props) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const [caps, setCaps] = useState(false)
  const hintId = hint ? `${id}-dica` : undefined
  const capsId = `${id}-caps`
  const readCaps = (e: KeyboardEvent | MouseEvent) => setCaps(e.getModifierState?.('CapsLock') ?? false)

  return (
    <div className="field password-field">
      <label htmlFor={id}>{label}</label>
      <div className={`password-wrap ${caps ? 'has-caps' : ''}`}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={readCaps}
          onKeyUp={readCaps}
          onMouseDown={readCaps}
          onBlur={() => setCaps(false)}
          aria-describedby={[caps ? capsId : null, hintId].filter(Boolean).join(' ') || undefined}
        />
        {caps && (
          <span id={capsId} className="caps-icon" role="status" title="Caps Lock ligado">
            <CapsIcon />
            <span className="visually-hidden">Caps Lock ligado</span>
          </span>
        )}
        <button
          type="button"
          className="password-eye"
          aria-label={visible ? 'Esconder senha' : 'Mostrar senha'}
          aria-pressed={visible}
          aria-controls={id}
          title={visible ? 'Esconder senha' : 'Mostrar senha'}
          // Não tira o foco do campo (o teclado do celular não fecha).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setVisible((v) => !v)}
        >
          <EyeIcon open={!visible} />
        </button>
      </div>
      {hint && (
        <small id={hintId} className="muted field-hint">
          {hint}
        </small>
      )}
    </div>
  )
}
