// "O que você usou hoje?": a rotina da finalização, por etapa. Nova finalização: começa igual à
// última, e a pessoa toca só no que mudou; depois segue para as fotos, no produto principal (o
// finalizador; sem ele, Sem finalizador). Finalização que já existe: edita a rotina dela.
import { useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { PageSkeleton } from '../components/Skeleton'
import { ProductThumb, productThumbPath } from '../components/ProductThumb'
import { useSheet } from '../components/FinalizationStrip'
import { useToast } from '../components/Toasts'
import { saveRoutine } from '../lib/api'
import { NO_FINISHER_ID, brandLabel, findFinalization, finalizationWhen, productLabel, type Experiment } from '../lib/domain'
import {
  MASK_KINDS,
  ROUTINE_STEPS,
  changeSummary,
  diffRoutine,
  draftOf,
  itemName,
  lastRoutine,
  principalOf,
  stepOfCategory,
  type DraftItem,
  type MaskKind,
  type RoutineStep,
} from '../lib/routine'
import { href, navigate } from '../lib/router'
import { useHistory, useThumbUrls } from '../lib/state'
import { uuid } from '../lib/uuid'

// Rascunho guardado na sessão: sobrevive a sair para cadastrar um produto e voltar.
const DRAFT_KEY = 'capilar:rotina:rascunho'
/** Rotina de uma finalização nova, gravada depois que o primeiro momento é salvo. */
export const PENDING_KEY = 'capilar:rotina:pendente'

interface Draft {
  /** '/rotina/nova' ou '/rotina/<finalização>'. */
  back: string
  items: DraftItem[]
  /** Etapa que esperava um produto novo. */
  step?: RoutineStep
  /** Produto que o novo substitui (trocar), se for o caso. */
  replace?: string
}

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}
function writeJson(key: string, v: unknown) {
  try {
    if (v === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(v))
  } catch {
    // sem armazenamento: o rascunho se perde, a rotina continua funcionando
  }
}

/** Rotina pendente de uma finalização nova (lida pelo formulário de fotos). */
export function takePendingRoutine(finalizationId: string): DraftItem[] | null {
  const p = readJson<{ finalizationId: string; items: DraftItem[] }>(PENDING_KEY)
  if (!p || p.finalizationId !== finalizationId) return null
  writeJson(PENDING_KEY, null)
  return p.items
}

/** Ao cadastrar um produto a partir da rotina: volta para ela com o produto na etapa. */
export function routineReturn(newExperimentId: string): string | null {
  const d = readJson<Draft>(DRAFT_KEY)
  if (!d) return null
  return `${d.back}${d.back.includes('?') ? '&' : '?'}novo=${newExperimentId}`
}

export function RoutineEditRoute({ finalizationId, params }: { finalizationId: string | null; params: URLSearchParams }) {
  const { experiments, routines } = useHistory()
  if (experiments === null) return <PageSkeleton />
  if (finalizationId) {
    const hit = findFinalization(experiments, finalizationId)
    if (!hit) {
      return (
        <main className="page">
          <PageHeader title="Rotina" back={{ label: 'Voltar ao histórico', href: href('/') }} />
          <p className="muted">Finalização não encontrada.</p>
        </main>
      )
    }
    return (
      <RoutineEdit
        key={finalizationId}
        experiments={experiments}
        base={draftOf(routines[finalizationId], experiments)}
        baseLabel={null}
        edit={{ finalizationId, principal: hit.experiment, when: finalizationWhen(hit.finalization) }}
        added={params.get('novo')}
      />
    )
  }
  const last = lastRoutine(experiments, routines)
  // "+" de um produto: a finalização fica nele (ele entra na etapa dele, no lugar do que estava lá).
  const fixed = experiments.find((e) => e.id === params.get('com') && e.product_mode === 'named') ?? null
  return (
    <RoutineEdit
      key={`nova-${fixed?.id ?? ''}`}
      experiments={experiments}
      base={last.items}
      baseLabel={last.from ? finalizationWhen(last.from) : null}
      edit={null}
      fixed={fixed}
      added={params.get('novo')}
    />
  )
}

function RoutineEdit({
  experiments,
  base,
  baseLabel,
  edit,
  fixed = null,
  added,
}: {
  experiments: Experiment[]
  /** Rotina de partida (a última, ou a desta finalização). */
  base: DraftItem[]
  /** "20/11": de quando é a rotina de partida (nova finalização). */
  baseLabel: string | null
  edit: { finalizationId: string; principal: Experiment; when: string } | null
  /** Nova finalização já com o produto principal escolhido (o "+" do produto). */
  fixed?: Experiment | null
  /** Produto que acabou de ser cadastrado a partir da rotina. */
  added: string | null
}) {
  const { setRoutine, routines } = useHistory()
  const notify = useToast()
  const back = edit ? `/rotina/${edit.finalizationId}` : fixed ? `/rotina/nova?com=${fixed.id}` : '/rotina/nova'
  const products = useMemo(() => experiments.filter((e) => e.product_mode === 'named'), [experiments])
  const byId = useMemo(() => new Map(experiments.map((e) => [e.id, e])), [experiments])

  const [items, setItems] = useState<DraftItem[]>(() => {
    const saved = readJson<Draft>(DRAFT_KEY)
    let start = saved && saved.back === back ? saved.items.filter((i) => byId.has(i.experimentId)) : base
    if (fixed && !start.some((i) => i.experimentId === fixed.id)) {
      const step = stepOfCategory(fixed.category)
      start = [...start.filter((i) => i.step !== step), { experimentId: fixed.id, step, maskKind: null }]
    }
    const fresh = added ? byId.get(added) : undefined
    if (fresh && !start.some((i) => i.experimentId === fresh.id)) {
      const step = saved?.step ?? stepOfCategory(fresh.category)
      start = [...start.filter((i) => i.experimentId !== saved?.replace), { experimentId: fresh.id, step, maskKind: null }]
    }
    writeJson(DRAFT_KEY, null)
    return start
  })
  const [picking, setPicking] = useState<{ step: RoutineStep; current: DraftItem | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const principalId = edit ? (edit.principal.product_mode === 'named' ? edit.principal.id : null) : (fixed?.id ?? principalOf(items))
  const diff = useMemo(() => diffRoutine(base, items, experiments), [base, items, experiments])
  const changedSteps = new Set(diff.changed.map((c) => c.step))
  const baseIds = new Set(base.map((i) => `${i.step}|${i.experimentId}|${i.maskKind ?? ''}`))

  const thumbPaths = useMemo(() => products.map((p) => productThumbPath(p)).filter((p): p is string => !!p), [products])
  const { urls } = useThumbUrls(thumbPaths)

  function choose(step: RoutineStep, current: DraftItem | null, experimentId: string | null) {
    setItems((prev) => {
      let next = prev.filter((i) => i !== current)
      if (experimentId) {
        next = next.filter((i) => i.experimentId !== experimentId)
        const keepKind = current?.step === 'mask' ? current.maskKind : lastKind(experimentId)
        const item: DraftItem = { experimentId, step, maskKind: step === 'mask' ? keepKind : null }
        const at = current ? prev.indexOf(current) : -1
        if (at >= 0) next.splice(Math.min(at, next.length), 0, item)
        else next.push(item)
      }
      return next
    })
    setPicking(null)
  }

  /** Tipo da máscara usado da última vez com este produto. */
  function lastKind(experimentId: string): MaskKind | null {
    for (const list of Object.values(routines)) {
      const hit = list.find((i) => i.experiment_id === experimentId && i.mask_kind)
      if (hit) return hit.mask_kind
    }
    return null
  }

  function setKind(item: DraftItem, kind: MaskKind) {
    setItems((prev) => prev.map((i) => (i === item ? { ...i, maskKind: i.maskKind === kind ? null : kind } : i)))
  }

  function newProduct(step: RoutineStep, current: DraftItem | null) {
    writeJson(DRAFT_KEY, { back, items, step, replace: current?.experimentId } satisfies Draft)
    navigate('/produto/novo?rotina=1')
  }

  async function submit() {
    setError(null)
    if (edit) {
      setBusy(true)
      try {
        await saveRoutine(edit.finalizationId, items)
        setRoutine(
          edit.finalizationId,
          items.map((i, position) => ({ finalization_id: edit.finalizationId, experiment_id: i.experimentId, step: i.step, position, mask_kind: i.maskKind })),
        )
        notify('Rotina salva.')
        navigate('/')
      } catch (e) {
        setError((e as Error).message)
        setBusy(false)
      }
      return
    }
    // Nova: a rotina é gravada junto com o primeiro momento (fica pendente até lá).
    const finalizationId = uuid()
    writeJson(PENDING_KEY, { finalizationId, items })
    navigate(`/produto/${principalId ?? NO_FINISHER_ID}/nova-finalizacao?finalizacao=${finalizationId}`)
  }

  const principal = principalId ? byId.get(principalId) : undefined
  return (
    <main className="page routine-page">
      <PageHeader title={edit ? `Rotina de ${edit.when.toLowerCase() === 'hoje' ? 'hoje' : edit.when}` : 'O que você usou hoje?'} back={{ label: 'Voltar ao histórico', href: href('/') }} />

      {!edit && baseLabel && items.length > 0 && (
        <p className="routine-banner">
          Igual à de <strong>{baseLabel === 'Hoje' || baseLabel === 'Ontem' ? baseLabel.toLowerCase() : baseLabel}</strong>. Toque só no que mudou.
        </p>
      )}
      {!edit && !baseLabel && <p className="muted small routine-intro">Toque em cada etapa que você fez hoje. Pode deixar etapas vazias.</p>}

      <section className="card routine-steps" aria-label="Rotina">
        {ROUTINE_STEPS.map((s, n) => {
          const list = items.filter((i) => i.step === s.id)
          return (
            <div key={s.id} className="routine-step" role="group" aria-label={s.label}>
              <span className="routine-n" aria-hidden="true">
                {n + 1}
              </span>
              <span className="routine-label">{s.short}</span>
              <div className="routine-items">
                {list.map((item) => {
                  const e = byId.get(item.experimentId)
                  const locked = (!!edit || !!fixed) && item.experimentId === principalId
                  const isNew = !!baseLabel && !baseIds.has(`${item.step}|${item.experimentId}|${item.maskKind ?? ''}`)
                  return (
                    <div key={item.experimentId} className="routine-item-wrap">
                      <button
                        type="button"
                        className={`routine-item ${isNew ? 'changed' : ''}`}
                        onClick={() => !locked && setPicking({ step: s.id, current: item })}
                        aria-label={locked ? `${s.label}: ${itemName(e)} (produto desta finalização)` : `${s.label}: ${itemName(e)}. Trocar`}
                        aria-disabled={locked || undefined}
                      >
                        <span className="routine-item-name">{e ? productLabel(e) : 'Produto'}</span>
                        {e && brandLabel(e) && <span className="routine-item-brand">{brandLabel(e)}</span>}
                        {isNew && <span className="routine-tag">trocado</span>}
                        {locked && <span className="routine-tag">principal</span>}
                      </button>
                      {item.step === 'mask' && (
                        <div className="routine-kinds" role="radiogroup" aria-label="Tipo da máscara">
                          {MASK_KINDS.map((k) => (
                            <button key={k.id} type="button" role="radio" aria-checked={item.maskKind === k.id} className={`chip-btn ${item.maskKind === k.id ? 'on' : ''}`} onClick={() => setKind(item, k.id)}>
                              {k.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                <button type="button" className={`routine-add ${list.length ? 'more' : ''}`} onClick={() => setPicking({ step: s.id, current: null })} aria-label={`Adicionar em ${s.label}`}>
                  {list.length ? '+ outro' : `+ ${s.add}`}
                </button>
              </div>
            </div>
          )
        })}
      </section>

      {!edit && baseLabel && changedSteps.size > 0 && (
        <p className="muted small routine-summary" data-testid="routine-summary">
          {changeSummary(diff.changed)}
        </p>
      )}
      {!edit && (
        <p className="muted small routine-principal" data-testid="routine-principal">
          {principal ? (
            <>
              Esta finalização fica em <strong>{productLabel(principal)}</strong>.
            </>
          ) : (
            <>
              Sem fixar, pentear ou finalizar: fica em <strong>Sem finalizador</strong>.
            </>
          )}
        </p>
      )}

      {error && <p className="alert alert-error">{error}</p>}
      <button type="button" className={`btn btn-primary btn-block routine-go ${busy ? 'is-busy' : ''}`} onClick={() => void submit()} disabled={busy}>
        {edit ? (busy ? 'Salvando…' : 'Salvar rotina') : 'Continuar para as fotos'}
      </button>
      {!edit && items.length > 0 && (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setItems([])}>
          Começar do zero
        </button>
      )}

      {picking && (
        <PickSheet
          step={picking.step}
          current={picking.current}
          products={products}
          urls={urls}
          taken={new Set(items.filter((i) => i !== picking.current).map((i) => i.experimentId))}
          lastUsed={lastUsedMap(experiments, routines)}
          onPick={(id) => choose(picking.step, picking.current, id)}
          onNew={() => newProduct(picking.step, picking.current)}
          onClose={() => setPicking(null)}
        />
      )}
    </main>
  )
}

/** Quando cada produto foi usado pela última vez (em qualquer finalização). */
function lastUsedMap(experiments: Experiment[], routines: Record<string, { experiment_id: string }[]>): Map<string, string> {
  const out = new Map<string, string>()
  const starts = new Map<string, string>()
  for (const e of experiments)
    for (const s of e.stages) {
      const prev = starts.get(s.finalization_id)
      if (!prev || s.captured_at < prev) starts.set(s.finalization_id, s.captured_at)
    }
  for (const [fin, list] of Object.entries(routines)) {
    const at = starts.get(fin)
    if (!at) continue
    for (const i of list) if (!out.has(i.experiment_id) || out.get(i.experiment_id)! < at) out.set(i.experiment_id, at)
  }
  return out
}

function PickSheet({
  step,
  current,
  products,
  urls,
  taken,
  lastUsed,
  onPick,
  onNew,
  onClose,
}: {
  step: RoutineStep
  current: DraftItem | null
  products: Experiment[]
  urls: Record<string, string>
  taken: Set<string>
  lastUsed: Map<string, string>
  onPick: (experimentId: string | null) => void
  onNew: () => void
  onClose: () => void
}) {
  const sheet = useSheet(onClose)
  const info = ROUTINE_STEPS.find((s) => s.id === step)!
  const free = products.filter((p) => !taken.has(p.id))
  // Os usados primeiro (o mais recente no topo); depois os que nunca entraram numa rotina.
  const recentFirst = (a: Experiment, b: Experiment) => (lastUsed.get(b.id) ?? '').localeCompare(lastUsed.get(a.id) ?? '') || productLabel(a).localeCompare(productLabel(b))
  const mine = free.filter((p) => stepOfCategory(p.category) === step).sort(recentFirst)
  const others = free.filter((p) => stepOfCategory(p.category) !== step).sort(recentFirst)
  const [showOthers, setShowOthers] = useState(mine.length === 0)
  const row = (p: Experiment) => {
    const used = lastUsed.get(p.id)
    const on = current?.experimentId === p.id
    return (
      <li key={p.id}>
        <button type="button" className={`pick-row ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onPick(p.id)}>
          <ProductThumb experiment={p} urls={urls} />
          <span className="pick-text">
            <strong>{productLabel(p)}</strong>
            <span className="muted small">
              {[brandLabel(p), used ? `última vez ${new Date(used).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : null].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>
      </li>
    )
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={sheet} className="sheet pick-sheet" role="dialog" aria-modal="true" aria-label={`${info.label}: qual produto?`} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <h2 className="sheet-title">{info.label}: qual produto?</h2>
        {mine.length > 0 && <ul className="pick-list">{mine.map(row)}</ul>}
        {mine.length === 0 && !others.length && <p className="muted small">Você ainda não tem produtos cadastrados para esta etapa.</p>}
        {others.length > 0 &&
          (showOthers ? (
            <>
              {mine.length > 0 && <p className="muted small pick-others-title">Outros produtos seus</p>}
              <ul className="pick-list">{others.map(row)}</ul>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setShowOthers(true)}>
              Ver outros produtos seus
            </button>
          ))}
        <button type="button" className="btn btn-outline-brand btn-block pick-new" onClick={onNew}>
          + Cadastrar outro produto
        </button>
        {current && (
          <button type="button" className="btn btn-ghost btn-block danger-text" onClick={() => onPick(null)}>
            Tirar desta etapa
          </button>
        )}
      </div>
    </div>
  )
}
