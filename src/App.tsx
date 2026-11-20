import { configError } from './lib/supabase'
import { HistoryProvider, SessionProvider, useSession } from './lib/state'
import { match, useRoute } from './lib/router'
import { Login } from './screens/Login'
import { History } from './screens/History'
import { StageDetail } from './screens/StageDetail'
import { ProductEditRoute } from './screens/ProductEdit'
import { StageFormRoute } from './screens/StageForm'
import { Compare } from './screens/Compare'
import { useNewVersion } from './lib/version'

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
      <UpdateBanner />
    </SessionProvider>
  )
}

/** Avisa quando há versão nova publicada (o app instalado não recarrega sozinho). */
function UpdateBanner() {
  const available = useNewVersion()
  if (!available) return null
  return (
    <div className="update-banner" role="status">
      <span>Nova versão do app</span>
      <button type="button" className="btn btn-primary btn-small" onClick={() => window.location.reload()}>
        Atualizar
      </button>
    </div>
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
  if ((m = match('/produto/:id/editar', path))) return <ProductEditRoute experimentId={m.id} />
  // Nova finalização com um produto que já está no histórico (o caminho antigo continua valendo).
  if ((m = match('/produto/:id/nova-finalizacao', path)) || (m = match('/experimento/:id/nova-etapa', path)))
    return <StageFormRoute kind="add" userId={userId} experimentId={m.id} />
  // Próximo momento de uma finalização: /finalizacao/<id>/seco
  if ((m = match('/finalizacao/:id/:momento', path)))
    return <StageFormRoute kind="moment" userId={userId} finalizationId={m.id} moment={m.momento} />
  if ((m = match('/etapa/:id/completar', path))) return <StageFormRoute kind="complete" userId={userId} stageId={m.id} />
  if ((m = match('/etapa/:id', path))) return <StageDetail stageId={m.id} />
  if (path === '/comparar') return <Compare params={params} />
  return (
    <History
      saved={params.get('salvo')}
      deleted={params.has('excluida')}
      productPhotoFailed={params.get('foto') === 'erro'}
      productSaved={params.get('produto') === 'salvo'}
    />
  )
}
