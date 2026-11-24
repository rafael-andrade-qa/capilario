import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(
        /invalid login credentials/i.test(error.message)
          ? 'E-mail ou senha incorretos.'
          : /fetch|network/i.test(error.message)
            ? 'Sem conexão com o servidor. Verifique a internet.'
            : error.message,
      )
    }
  }

  return (
    <main className="login">
      <Strands />
      <div className="login-brand">
        <svg className="login-mark" viewBox="0 0 120 120" width="84" height="84" aria-hidden="true">
          <rect width="120" height="120" rx="30" fill="#7a4b2a" />
          <path
            d="M60 36 C48 28 32 28 22 32 L22 88 C32 84 48 84 60 92 C72 84 88 84 98 88 L98 32 C88 28 72 28 60 36 Z M60 36 L60 92"
            fill="none"
            stroke="#fbf7f3"
            strokeWidth="6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path d="M29 62 q7 -8 14 0 t12 0 M66 62 q7 -8 14 0 t12 0" fill="none" stroke="#d49a6a" strokeWidth="5" strokeLinecap="round" />
        </svg>
        <h1 className="wordmark">capilário</h1>
        <p className="login-tagline">Seu diário capilar: cada finalização, lado a lado.</p>
      </div>
      <form onSubmit={submit} className="login-form">
        <label className="field">
          <span>E-mail</span>
          <input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block login-submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

/** Fios ondulados no fundo, saindo da onda do logo. Só enfeite. */
function Strands() {
  const rows = [0, 1, 2, 3, 4, 5, 6]
  return (
    <svg className="login-strands" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {rows.map((i) => (
        <path
          key={i}
          d={`M${-20 - (i % 2) * 25} ${40 + i * 34} q25 -${14 + i * 2} 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0`}
          fill="none"
          strokeWidth={i % 3 === 1 ? 3 : 2}
        />
      ))}
    </svg>
  )
}
