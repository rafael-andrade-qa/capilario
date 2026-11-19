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
    <main className="page login">
      <div className="brand">
        <img src="icons/icon-192.png" alt="" width={72} height={72} />
        <h1>Projeto Capilar</h1>
        <p className="muted">Diário fotográfico do cabelo</p>
      </div>
      <form onSubmit={submit} className="card stack">
        <label className="field">
          <span>E-mail</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
