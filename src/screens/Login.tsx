import { useState, type FormEvent } from 'react'
import { LogoMark, Strands } from '../components/Brand'
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
      <Strands className="login-strands" scale={1.7} />
      <div className="login-brand">
        <LogoMark className="login-mark" />
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

