// Análise da finalização pela IA: limite por plano (Grátis 1 por mês, Pro 1 por dia), teto de 20 por
// dia no app, e a análise só é vista e mexida pela dona.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, brDay, photoPath, setPlan, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'

async function newFinalization(user: TestUser): Promise<string> {
  const stageId = randomUUID()
  const id = randomUUID()
  const fin = randomUUID()
  const storage_path = photoPath(user.id, stageId, id)
  const up = await user.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const r = await user.client.rpc('finalize_stage', {
    p_experiment_id: randomUUID(),
    p_stage_id: stageId,
    p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
    p_new_experiment: { product_mode: 'named', product_name: 'Geleia', brand: 'Marca' },
    p_new_stage: { stage_type: 'wet', captured_at: '2026-11-20T14:53:00-03:00', notes: null, finalization_id: fin },
  })
  if (r.error) throw r.error
  return fin
}

const RESULT = {
  product: 'Geleia (Marca)',
  hair_type: 'Ondulado 2B',
  tendency: 'tende a 2C/3A',
  traits: ['pontas porosas'],
  scores: { definition: 8, frizz_control: 7, volume: 6, day2: null },
  summary: 'Bom equilíbrio.',
  notes: { wet: 'Ondas já aparecem.', dry: '', next_day: '' },
}

describe('limite de análises', () => {
  let free: TestUser
  let pro: TestUser
  let c: TestUser
  let d: TestUser
  let e: TestUser
  const admin = adminClient()
  beforeAll(async () => {
    free = await testUser('analise-gratis')
    pro = await testUser('analise-pro')
    c = await testUser('analise-limite-c')
    d = await testUser('analise-limite-d')
    e = await testUser('analise-limite-e')
    await setPlan(pro.id, 'pro')
    await setPlan(d.id, 'pro')
    await setPlan(e.id, 'pro')
    // O teto geral soma todo mundo: começa do zero para o teste não depender dos outros.
    const reset = await admin.from('analyze_usage').delete().gte('day', '2000-01-01')
    if (reset.error) throw reset.error
  })

  it('Grátis: 1 por mês; a do mês passado não conta', async () => {
    const old = await admin.from('analyze_usage').insert({ user_id: free.id, day: brDay(-40), count: 1 })
    if (old.error) throw old.error
    expect((await free.client.rpc('analyze_quota_left')).data).toBe(1)
    const r = await free.client.rpc('consume_analyze_quota')
    expect(r.error).toBeNull()
    expect(r.data).toBe(0)
    expect((await free.client.rpc('consume_analyze_quota')).error?.message).toBe('analyze_limit')
    expect((await free.client.rpc('analyze_quota_left')).data).toBe(0)
  })

  it('Pro: 1 por dia; a de ontem não conta; Pro vencido volta ao Grátis', async () => {
    const yesterday = await admin.from('analyze_usage').insert({ user_id: pro.id, day: brDay(-1), count: 1 })
    if (yesterday.error) throw yesterday.error
    expect((await pro.client.rpc('analyze_quota_left')).data).toBe(1)
    expect((await pro.client.rpc('consume_analyze_quota')).error).toBeNull()
    expect((await pro.client.rpc('consume_analyze_quota')).error?.message).toBe('analyze_limit')
    // Vencido: vale o Grátis, que conta o mês inteiro; a de hoje já gastou a do mês.
    await setPlan(pro.id, 'pro', '2020-01-01T00:00:00Z')
    expect((await pro.client.rpc('analyze_quota_left')).data).toBe(0)
    expect((await pro.client.rpc('consume_analyze_quota')).error?.message).toBe('analyze_limit')
  })

  it('teto do app: 20 por dia somando todas as contas', async () => {
    // Hoje: Grátis 1 + Pro 1; c "usou" mais 17: total 19, sobra 1 para o app inteiro.
    const seed = await admin.from('analyze_usage').insert({ user_id: c.id, day: brDay(), count: 17 })
    if (seed.error) throw seed.error
    expect((await d.client.rpc('analyze_quota_left')).data).toBe(1)
    const last = await d.client.rpc('consume_analyze_quota')
    expect(last.error).toBeNull()
    expect(last.data).toBe(0)
    expect((await e.client.rpc('analyze_quota_left')).data).toBe(0)
    expect((await e.client.rpc('consume_analyze_quota')).error?.message).toBe('analyze_app_limit')
  })

  it('ninguém lê nem zera o contador, e sem login não consome', async () => {
    expect((await free.client.from('analyze_usage').select('*')).error?.code).toBe('42501')
    expect((await anonClient().rpc('consume_analyze_quota')).error).not.toBeNull()
  })

  afterAll(async () => {
    await admin.from('analyze_usage').delete().gte('day', '2000-01-01')
  })
})

describe('análise guardada', () => {
  let a: TestUser
  let b: TestUser
  let fin: string
  beforeAll(async () => {
    a = await testUser('analise-a')
    b = await testUser('analise-b')
    fin = await newFinalization(a)
  })

  it('a dona grava, analisar de novo substitui, e marca a sugestão como usada', async () => {
    const save = (summary: string) =>
      a.client
        .from('finalization_analyses')
        .upsert({ finalization_id: fin, model: 'claude-opus-5-5', result: { ...RESULT, summary }, usage: { cost_usd: 0.1 }, notes_state: 'pending' }, { onConflict: 'finalization_id' })
    expect((await save('Primeira.')).error).toBeNull()
    expect((await save('Segunda.')).error).toBeNull()
    const { data } = await a.client.from('finalization_analyses').select('result, notes_state').eq('finalization_id', fin)
    expect(data).toHaveLength(1)
    expect(data![0].result.summary).toBe('Segunda.')

    expect((await a.client.from('finalization_analyses').update({ notes_state: 'applied' }).eq('finalization_id', fin)).error).toBeNull()
    const bad = await a.client.from('finalization_analyses').update({ notes_state: 'qualquer' }).eq('finalization_id', fin)
    expect(bad.error?.code).toBe('23514')
  })

  it('outra pessoa não vê, não muda e não grava análise na finalização alheia', async () => {
    expect((await b.client.from('finalization_analyses').select('*').eq('finalization_id', fin)).data).toEqual([])
    await b.client.from('finalization_analyses').update({ notes_state: 'dismissed' }).eq('finalization_id', fin)
    const { data } = await a.client.from('finalization_analyses').select('notes_state').eq('finalization_id', fin)
    expect(data![0].notes_state).toBe('applied')
    const forged = await b.client.from('finalization_analyses').insert({ finalization_id: fin, model: 'x', result: RESULT })
    expect(forged.error).not.toBeNull()
  })

  it('excluir o último momento (a finalização sai junto) leva a análise', async () => {
    const other = await newFinalization(a)
    expect((await a.client.from('finalization_analyses').insert({ finalization_id: other, model: 'x', result: RESULT })).error).toBeNull()
    const { data: st } = await a.client.from('stages').select('id').eq('finalization_id', other)
    expect((await a.client.rpc('delete_stage', { p_stage_id: st![0].id })).error).toBeNull()
    const { data } = await a.client.from('finalization_analyses').select('finalization_id').eq('finalization_id', other)
    expect(data).toEqual([])
  })
})
