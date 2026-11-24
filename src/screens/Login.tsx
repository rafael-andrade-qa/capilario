// Entrada: entrar, recuperar a senha e (quando o cadastro estiver aberto) criar conta.
import { useState, type FormEvent } from 'react'
import { LogoMark, Strands } from '../components/Brand'
import { PasswordField } from '../components/PasswordField'
import { MIN_PASSWORD, SIGNUP_OPEN, passwordProblem, requestPasswordReset, signIn, signUp } from '../lib/account'

type Mode = 'login' | 'signup' | 'forgot'

export function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Depois de mandar um e-mail (confirmação ou senha nova), o formulário dá lugar ao aviso. */
  const [sent, setSent] = useState<string | null>(null)

  function go(next: Mode) {
    setMode(next)
    setError(null)
    setSent(null)
    setPassword('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (mode === 'signup') {
      const problem = passwordProblem(password)
      if (problem) return setError(problem)
    }
    setBusy(true)
    try {
      if (mode === 'login') await signIn(email, password)
      else if (mode === 'forgot') {
        await requestPasswordReset(email)
        setSent(`Se houver uma conta com ${email.trim()}, enviamos um link para criar uma senha nova. Confira também o spam.`)
      } else {
        const entered = await signUp(email, password)
        if (!entered) setSent(`Enviamos um link para ${email.trim()}. Abra o e-mail e toque em Confirmar para ativar a conta.`)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'forgot' ? 'Recuperar a senha' : mode === 'signup' ? 'Criar conta' : null
  const button = mode === 'login' ? (busy ? 'Entrando…' : 'Entrar') : mode === 'forgot' ? (busy ? 'Enviando…' : 'Enviar link') : busy ? 'Criando…' : 'Criar conta'

  return (
    <main className="login">
      <Strands className="login-strands" scale={1.7} />
      <div className="login-brand">
        <LogoMark className="login-mark" />
        <h1 className="wordmark">capilário</h1>
        <p className="login-tagline">Seu diário capilar: cada finalização, lado a lado.</p>
      </div>

      {sent ? (
        <div className="login-form">
          <p className="alert alert-success" role="status">
            {sent}
          </p>
          <button type="button" className="btn btn-block login-submit" onClick={() => go('login')}>
            Voltar para entrar
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="login-form">
          {title && <h2 className="login-mode-title">{title}</h2>}
          {mode === 'forgot' && <p className="muted small login-hint">Mandamos um link para o seu e-mail. Ele abre uma tela para criar a senha nova.</p>}
          <label className="field">
            <span>E-mail</span>
            <input type="email" inputMode="email" autoComplete={mode === 'signup' ? 'email' : 'username'} autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== 'forgot' && (
            <PasswordField
              label="Senha"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              hint={mode === 'signup' ? `Pelo menos ${MIN_PASSWORD} caracteres.` : undefined}
            />
          )}
          {error && (
            <p className="alert alert-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-block login-submit" disabled={busy}>
            {button}
          </button>
          <div className="login-links">
            {mode === 'login' ? (
              <>
                <button type="button" className="link-btn" onClick={() => go('forgot')}>
                  Esqueci minha senha
                </button>
                {SIGNUP_OPEN && (
                  <button type="button" className="link-btn" onClick={() => go('signup')}>
                    Criar conta
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="link-btn" onClick={() => go('login')}>
                {mode === 'signup' ? 'Já tenho conta' : 'Voltar para entrar'}
              </button>
            )}
          </div>
        </form>
      )}
    </main>
  )
}
