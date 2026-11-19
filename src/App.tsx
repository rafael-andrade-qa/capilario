import { configError } from './lib/supabase'
import { HistoryProvider, SessionProvider, useSession } from './lib/state'
import { match, useRoute } from './lib/router'
import { Login } from './screens/Login'
import { History } from './screens/History'
import { StageDetail } from './screens/StageDetail'
import { StageFormRoute } from './screens/StageForm'
import { Compare } from './screens/Compare'

export function App() {
  if (configError) {
    return (
      <main className="page">
        <h1>Projeto Capilar</h1>
        <p className="alert alert-error">{configError}</p>
      </main>
    )
  }
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  )
}

function Gate() {
  const { session, ready } = useSession()
  if (!ready) return <main className="page center muted">Carregando…</main>
  if (!session) return <Login />
  // A chave pelo usuário garante que nada do estado anterior sobreviva a uma troca de conta.
  return (
    <HistoryProvider key={session.user.id}>
      <Screens userId={session.user.id} />
    </HistoryProvider>
  )
}

function Screens({ userId }: { userId: string }) {
  const { path, params } = useRoute()
  let m: Record<string, string> | null
  if (path === '/novo') return <StageFormRoute kind="new" userId={userId} />
  if ((m = match('/experimento/:id/nova-etapa', path))) return <StageFormRoute kind="add" userId={userId} experimentId={m.id} />
  if ((m = match('/etapa/:id/completar', path))) return <StageFormRoute kind="complete" userId={userId} stageId={m.id} />
  if ((m = match('/etapa/:id', path))) return <StageDetail stageId={m.id} />
  if (path === '/comparar') return <Compare params={params} />
  return <History saved={params.get('salvo')} />
}
