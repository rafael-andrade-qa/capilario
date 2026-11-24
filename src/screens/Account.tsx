// Minha conta: e-mail, senha, sair e excluir a conta.
import { useState, type FormEvent, type ReactNode } from 'react'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/Toasts'
import { MIN_PASSWORD, changeEmail, changePassword, deleteAccount, passwordProblem } from '../lib/account'
import { href } from '../lib/router'
import { signOut, useSession } from '../lib/state'

type Open = 'email' | 'password' | 'delete' | null

export function Account() {
  const { session } = useSession()
  const email = session?.user.email ?? ''
  const pending = session?.user.new_email ?? null
  const [open, setOpen] = useState<Open>(null)
  const toggle = (k: Exclude<Open, null>) => setOpen((o) => (o === k ? null : k))

  return (
    <main className="page account-page">
      <PageHeader title="Minha conta" back={{ label: 'Voltar ao histórico', href: href('/') }} />

      <section className="card account-card">
        <div className="account-row">
          <div className="account-row-text">
            <span className="muted small">E-mail</span>
            <strong className="account-email">{email}</strong>
            {pending && <span className="muted small">Troca para {pending} esperando a confirmação pelo e-mail.</span>}
          </div>
          <button type="button" className="btn btn-small" aria-expanded={open === 'email'} onClick={() => toggle('email')}>
            Trocar
          </button>
        </div>
        {open === 'email' && <EmailForm onDone={() => setOpen(null)} />}

        <div className="account-row">
          <div className="account-row-text">
            <span className="muted small">Senha</span>
            <strong aria-hidden="true">••••••••</strong>
          </div>
          <button type="button" className="btn btn-small" aria-expanded={open === 'password'} onClick={() => toggle('password')}>
            Trocar
          </button>
        </div>
        {open === 'password' && <PasswordForm email={email} onDone={() => setOpen(null)} />}
      </section>

      <button type="button" className="btn btn-block account-signout" onClick={() => void signOut()}>
        Sair da conta
      </button>

      <section className="account-danger">
        {open === 'delete' ? (
          <DeleteForm email={email} onCancel={() => setOpen(null)} />
        ) : (
          <button type="button" className="link-btn danger-link" onClick={() => toggle('delete')}>
            Excluir minha conta
          </button>
        )}
      </section>
    </main>
  )
}

function useSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent, check?: () => string | null) {
    e.preventDefault()
    if (busy) return
    const problem = check?.() ?? null
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

function Fields({ children, error, busy, label, busyLabel, danger, onCancel }: { children?: ReactNode; error: string | null; busy: boolean; label: string; busyLabel: string; danger?: boolean; onCancel?: () => void }) {
  return (
    <>
      {children}
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="account-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        )}
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
          {busy ? busyLabel : label}
        </button>
      </div>
    </>
  )
}

function EmailForm({ onDone }: { onDone: () => void }) {
  const notify = useToast()
  const [next, setNext] = useState('')
  const { busy, error, submit } = useSubmit(async () => {
    await changeEmail(next)
    notify(`Enviamos um link de confirmação. A troca vale depois que você confirmar pelo e-mail.`, 'info')
    onDone()
  })
  return (
    <form className="account-form" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>E-mail novo</span>
        <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <Fields error={error} busy={busy} label="Trocar e-mail" busyLabel="Enviando…" />
    </form>
  )
}

function PasswordForm({ email, onDone }: { email: string; onDone: () => void }) {
  const notify = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const { busy, error, submit } = useSubmit(async () => {
    await changePassword(email, current, next)
    notify('Senha alterada.')
    onDone()
  })
  return (
    <form className="account-form" onSubmit={(e) => void submit(e, () => passwordProblem(next, repeat))}>
      <label className="field">
        <span>Senha atual</span>
        <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="field">
        <span>Senha nova</span>
        <input type="password" autoComplete="new-password" required aria-describedby="senha-nova-dica" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <small id="senha-nova-dica" className="muted field-hint">
        Pelo menos {MIN_PASSWORD} caracteres.
      </small>
      <label className="field">
        <span>Repita a senha nova</span>
        <input type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </label>
      <Fields error={error} busy={busy} label="Salvar senha" busyLabel="Salvando…" />
    </form>
  )
}

function DeleteForm({ email, onCancel }: { email: string; onCancel: () => void }) {
  const notify = useToast()
  const [password, setPassword] = useState('')
  const { busy, error, submit } = useSubmit(async () => {
    await deleteAccount(email, password)
    notify('Conta excluída. Todos os seus dados foram apagados.')
  })
  return (
    <form className="card account-form account-delete" onSubmit={(e) => void submit(e)}>
      <h2 className="account-delete-title">Excluir a conta</h2>
      <p className="small">
        Apaga para sempre as suas fotos, finalizações, produtos, rotinas e análises. <strong>Não dá para desfazer.</strong>
      </p>
      <label className="field">
        <span>Confirme com a sua senha</span>
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <Fields error={error} busy={busy} label="Excluir para sempre" busyLabel="Excluindo…" danger onCancel={onCancel} />
    </form>
  )
}
