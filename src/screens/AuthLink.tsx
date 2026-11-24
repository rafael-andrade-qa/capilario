// Links dos e-mails (#/acesso?token_hash=…&type=…): confirmar a conta, criar senha nova ou
// confirmar a troca de e-mail. Abre com ou sem sessão; o link vale uma vez. Também entende o
// formato padrão do Supabase (#access_token=…&type=…, #error=…, #message=…), usado enquanto os
// modelos de e-mail em português não estão no ar.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LogoMark, Strands } from '../components/Brand'
import { LINK_TYPES, MIN_PASSWORD, authMessage, passwordProblem, setNewPassword, enterWithTokens, verifyLink, type LinkType } from '../lib/account'
import { navigate } from '../lib/router'

type State = { step: 'checking' } | { step: 'error'; message: string } | { step: 'new-password' } | { step: 'done'; message: string }

const DONE: Record<LinkType, string> = {
  signup: 'E-mail confirmado. A sua conta está pronta.',
  recovery: 'Senha nova salva.',
  email_change: 'Confirmação registrada. Se a troca pediu confirmação nos dois e-mails, confira também o outro endereço; depois disso, use o e-mail novo para entrar.',
}

export function AuthLink({ params }: { params: URLSearchParams }) {
  const tokenHash = params.get('token_hash') ?? ''
  const rawType = params.get('type') ?? ''
  const type = (LINK_TYPES as readonly string[]).includes(rawType) ? (rawType as LinkType) : null
  const [state, setState] = useState<State>({ step: 'checking' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const failure = params.get('error_description') ?? params.get('error')
    if (failure) {
      setState({ step: 'error', message: authMessage(failure) })
      return
    }
    if (params.get('message') && !accessToken) {
      setState({ step: 'done', message: DONE.email_change })
      return
    }
    if (!type || !(tokenHash || (accessToken && refreshToken))) {
      setState({ step: 'error', message: 'Esse link está incompleto. Abra de novo o link do e-mail.' })
      return
    }
    const confirm = accessToken && refreshToken ? enterWithTokens(accessToken, refreshToken) : verifyLink(tokenHash, type)
    confirm
      .then(() => setState(type === 'recovery' ? { step: 'new-password' } : { step: 'done', message: DONE[type] }))
      .catch((e: Error) => setState({ step: 'error', message: e.message }))
  }, [params, tokenHash, type])

  return (
    <main className="login">
      <Strands className="login-strands" scale={1.7} />
      <div className="login-brand">
        <LogoMark className="login-mark" />
        <h1 className="wordmark">capilário</h1>
      </div>
      <div className="login-form">
        {state.step === 'checking' && (
          <p className="muted" role="status" aria-busy="true">
            Conferindo o link…
          </p>
        )}
        {state.step === 'error' && (
          <>
            <p className="alert alert-error" role="alert">
              {state.message}
            </p>
            <button type="button" className="btn btn-block login-submit" onClick={() => navigate('/', { replace: true })}>
              Ir para a entrada
            </button>
          </>
        )}
        {state.step === 'new-password' && <NewPasswordForm onDone={() => setState({ step: 'done', message: DONE.recovery })} />}
        {state.step === 'done' && (
          <>
            <p className="alert alert-success" role="status">
              {state.message}
            </p>
            <p className="muted small login-hint">Se você usa o app instalado na tela de início, abra-o por lá e entre com o seu e-mail e a senha.</p>
            <button type="button" className="btn btn-primary btn-block login-submit" onClick={() => navigate('/', { replace: true })}>
              Abrir o diário
            </button>
          </>
        )}
      </div>
    </main>
  )
}

function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const problem = passwordProblem(password, repeat)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await setNewPassword(password)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="login-form">
      <h2 className="login-mode-title">Crie uma senha nova</h2>
      <label className="field">
        <span>Senha nova</span>
        <input type="password" autoComplete="new-password" required aria-describedby="senha-nova-dica" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <small id="senha-nova-dica" className="muted field-hint">
        Pelo menos {MIN_PASSWORD} caracteres.
      </small>
      <label className="field">
        <span>Repita a senha nova</span>
        <input type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </label>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary btn-block login-submit" disabled={busy}>
        {busy ? 'Salvando…' : 'Salvar senha nova'}
      </button>
    </form>
  )
}
