import { configError } from './lib/supabase'
import { HistoryProvider, SessionProvider, useSession } from './lib/state'
import { match, useRoute } from './lib/router'
import { Suspense, lazy, useEffect } from 'react'
import { Login } from './screens/Login'
import { AuthLink } from './screens/AuthLink'
import { History } from './screens/History'
import { PageSkeleton } from './components/Skeleton'
import { LogoMark, Strands } from './components/Brand'
import { ProSheetHost } from './components/ProSheet'

// Cada tela além do histórico é baixada à parte: o app abre mais rápido e, logo depois, as outras
// telas são buscadas em segundo plano (e ficam guardadas), para a navegação não esperar.
const loadStageDetail = () => import('./screens/StageDetail')
const loadProductEdit = () => import('./screens/ProductEdit')
const loadStageForm = () => import('./screens/StageForm')
const loadCompare = () => import('./screens/Compare')
const loadGuide = () => import('./screens/Guide')
const loadRoutine = () => import('./screens/RoutineEdit')
const loadInsight = () => import('./screens/ProductInsight')
const loadDay = () => import('./screens/FinalizationDetail')
const loadAccount = () => import('./screens/Account')
const Legal = lazy(() => import('./screens/Legal').then((m) => ({ default: m.Legal })))
const StageDetail = lazy(() => loadStageDetail().then((m) => ({ default: m.StageDetail })))
const ProductEditRoute = lazy(() => loadProductEdit().then((m) => ({ default: m.ProductEditRoute })))
const ProductNewRoute = lazy(() => loadProductEdit().then((m) => ({ default: m.ProductNewRoute })))
const StageFormRoute = lazy(() => loadStageForm().then((m) => ({ default: m.StageFormRoute })))
const Compare = lazy(() => loadCompare().then((m) => ({ default: m.Compare })))
const Guide = lazy(() => loadGuide().then((m) => ({ default: m.Guide })))
const RoutineEditRoute = lazy(() => loadRoutine().then((m) => ({ default: m.RoutineEditRoute })))
const ProductInsight = lazy(() => loadInsight().then((m) => ({ default: m.ProductInsight })))
const FinalizationDetail = lazy(() => loadDay().then((m) => ({ default: m.FinalizationDetail })))
const Account = lazy(() => loadAccount().then((m) => ({ default: m.Account })))

function usePrefetchScreens() {
  useEffect(() => {
    const run = () => {
      for (const load of [loadStageDetail, loadStageForm, loadProductEdit, loadCompare, loadGuide, loadRoutine, loadInsight, loadDay, loadAccount]) void load().catch(() => undefined)
    }
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    const id = idle ? idle(run) : window.setTimeout(run, 1500)
    return () => {
      if (!idle) window.clearTimeout(id)
    }
  }, [])
}
import { useNewVersion } from './lib/version'
import { ToastProvider } from './components/Toasts'

export function App() {
  if (configError) {
    return (
      <main className="page">
        <h1 className="wordmark">capilário</h1>
        <p className="alert alert-error">{configError}</p>
      </main>
    )
  }
  return (
    <SessionProvider>
      <ToastProvider>
        <Gate />
        <UpdateBanner />
      </ToastProvider>
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
  const { path, params } = useRoute()
  // Links dos e-mails (confirmar conta, senha nova, troca de e-mail): com ou sem sessão.
  // Cada link abre do zero; ao sair dele (Abrir o diário), o endereço é trocado e os tokens saem do histórico.
  if (path === '/acesso') return <AuthLink key={params.toString()} params={params} />
  // Formato padrão do Supabase (#access_token=…, #error=…): o hash inteiro são os parâmetros.
  if (/^(access_token|error|message)=/.test(path)) return <AuthLink key={path} params={new URLSearchParams(path)} />
  // Termos e privacidade: com ou sem conta (o login e o cadastro levam para cá).
  if (path === '/termos' || path === '/privacidade')
    return (
      <Suspense fallback={<PageSkeleton />}>
        <Legal doc={path === '/termos' ? 'termos' : 'privacidade'} params={params} />
      </Suspense>
    )
  if (!ready)
    return (
      <main className="splash" role="status" aria-busy="true" aria-label="Carregando o Capilário">
        <Strands className="login-strands" scale={1.7} />
        <LogoMark className="splash-mark" size={72} />
      </main>
    )
  if (!session) return <Login />
  // A chave pelo usuário garante que nada do estado anterior sobreviva a uma troca de conta.
  return (
    <HistoryProvider key={session.user.id} userId={session.user.id}>
      <Screens userId={session.user.id} />
    </HistoryProvider>
  )
}

function Screens({ userId }: { userId: string }) {
  usePrefetchScreens()
  return (
    <>
      <Strands className="page-strands" rows={3} top={22} />
      <Suspense fallback={<PageSkeleton />}>
        <Route userId={userId} />
      </Suspense>
      <ProSheetHost />
    </>
  )
}

function Route({ userId }: { userId: string }) {
  const { path, params } = useRoute()
  let m: Record<string, string> | null
  // Cadastrar produto (o caminho antigo /novo leva para cá).
  if (path === '/produto/novo' || path === '/novo') return <ProductNewRoute />
  if ((m = match('/produto/:id/editar', path))) return <ProductEditRoute experimentId={m.id} />
  // Nova finalização com um produto que já está no histórico (o caminho antigo continua valendo).
  if ((m = match('/produto/:id/nova-finalizacao', path)) || (m = match('/experimento/:id/nova-etapa', path)))
    return <StageFormRoute kind="add" userId={userId} experimentId={m.id} finalizationId={params.get('finalizacao')} />
  // Próximo momento de uma finalização: /finalizacao/<id>/seco
  if ((m = match('/finalizacao/:id/:momento', path)))
    return <StageFormRoute kind="moment" userId={userId} finalizationId={m.id} moment={m.momento} />
  if ((m = match('/etapa/:id/completar', path))) return <StageFormRoute kind="complete" userId={userId} stageId={m.id} />
  if ((m = match('/etapa/:id', path))) return <StageDetail stageId={m.id} />
  if (path === '/comparar') return <Compare params={params} />
  if (path === '/conta') return <Account />
  if (path === '/guia') return <Guide params={params} />
  if (path === '/rotina/nova') return <RoutineEditRoute finalizationId={null} params={params} />
  if ((m = match('/rotina/:id', path))) return <RoutineEditRoute finalizationId={m.id} params={params} />
  if ((m = match('/produto/:id', path))) return <ProductInsight experimentId={m.id} />
  if ((m = match('/finalizacao/:id', path))) return <FinalizationDetail finalizationId={m.id} />
  return (
    <History
      saved={params.get('salvo')}
      deleted={params.get('excluida')}
      productPhotoFailed={params.get('foto') === 'erro'}
      productSaved={params.get('produto')}
      created={params.get('novo')}
    />
  )
}
