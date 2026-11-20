// Campo de busca com lupa à esquerda (padrão que a pessoa reconhece) e "limpar" do próprio
// navegador à direita.

export function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5L20 20" />
      </g>
    </svg>
  )
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
  className?: string
}) {
  return (
    <div className={`search-field ${className}`}>
      <span className="search-icon">
        <SearchIcon />
      </span>
      <input
        type="search"
        className="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
      />
    </div>
  )
}
