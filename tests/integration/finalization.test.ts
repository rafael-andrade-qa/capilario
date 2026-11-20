// Finalizações: um dia de lavagem com um produto, com no máximo um momento de cada tipo.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { photoPath, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'

interface Args {
  experimentId: string
  type: 'wet' | 'dry' | 'next_day'
  at: string
  finalizationId?: string
  newProduct?: boolean
}

async function finalize(user: TestUser, a: Args) {
  const stageId = randomUUID()
  const id = randomUUID()
  const storage_path = photoPath(user.id, stageId, id)
  const up = await user.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const r = await user.client.rpc('finalize_stage', {
    p_experiment_id: a.experimentId,
    p_stage_id: stageId,
    p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
    p_new_experiment: a.newProduct ? { product_mode: 'named', product_name: 'Creme', brand: 'Marca' } : null,
    p_new_stage: {
      stage_type: a.type,
      captured_at: a.at,
      notes: null,
      ...(a.finalizationId ? { finalization_id: a.finalizationId } : {}),
    },
  })
  return { stageId, error: r.error, finalizationId: (r.data as { finalization_id?: string } | null)?.finalization_id }
}

describe('finalizações', () => {
  let a: TestUser
  let b: TestUser
  beforeAll(async () => {
    a = await testUser('finalizacao-a')
    b = await testUser('finalizacao-b')
  })

  it('o app escolhe a finalização: cria na primeira, completa nas seguintes, um momento de cada', async () => {
    const experimentId = randomUUID()
    const fin = randomUUID()
    const wet = await finalize(a, { experimentId, type: 'wet', at: '2026-11-18T15:00:00-03:00', finalizationId: fin, newProduct: true })
    expect(wet.error).toBeNull()
    expect(wet.finalizationId).toBe(fin)
    const dry = await finalize(a, { experimentId, type: 'dry', at: '2026-11-18T17:00:00-03:00', finalizationId: fin })
    expect(dry.finalizationId).toBe(fin)

    // Um segundo Seco na mesma finalização é recusado.
    const again = await finalize(a, { experimentId, type: 'dry', at: '2026-11-18T18:00:00-03:00', finalizationId: fin })
    expect(again.error?.message).toBe('moment_taken')

    const { data } = await a.client.from('stages').select('stage_type').eq('finalization_id', fin).order('captured_at')
    expect(data?.map((s) => s.stage_type)).toEqual(['wet', 'dry'])
  })

  it('versão antiga do app (sem finalização): Molhado começa uma, Seco e Dia seguinte completam em até 48 h', async () => {
    const experimentId = randomUUID()
    const w1 = await finalize(a, { experimentId, type: 'wet', at: '2026-11-18T14:55:00-03:00', newProduct: true })
    const w2 = await finalize(a, { experimentId, type: 'wet', at: '2026-11-18T15:00:00-03:00' })
    const d = await finalize(a, { experimentId, type: 'dry', at: '2026-11-18T17:00:00-03:00' })
    const n = await finalize(a, { experimentId, type: 'next_day', at: '2026-11-19T07:14:00-03:00' })
    const late = await finalize(a, { experimentId, type: 'dry', at: '2026-11-25T10:00:00-03:00' })

    // Refazer a finalização (lavar de novo) = outra finalização.
    expect(w1.finalizationId).toBe(w1.stageId)
    expect(w2.finalizationId).toBe(w2.stageId)
    expect(d.finalizationId).toBe(w2.finalizationId)
    expect(n.finalizationId).toBe(w2.finalizationId)
    // Uma semana depois não completa a antiga.
    expect(late.finalizationId).toBe(late.stageId)
  })

  it('não dá para usar a finalização de outro produto nem de outra pessoa', async () => {
    const e1 = randomUUID()
    const fin = randomUUID()
    await finalize(a, { experimentId: e1, type: 'wet', at: '2026-11-18T15:00:00-03:00', finalizationId: fin, newProduct: true })

    const e2 = randomUUID()
    const other = await finalize(a, { experimentId: e2, type: 'dry', at: '2026-11-18T17:00:00-03:00', finalizationId: fin, newProduct: true })
    expect(other.error?.message).toBe('finalization_not_found')

    const eb = randomUUID()
    const stranger = await finalize(b, { experimentId: eb, type: 'dry', at: '2026-11-18T17:00:00-03:00', finalizationId: fin, newProduct: true })
    expect(stranger.error).not.toBeNull()

    const { data } = await b.client.from('finalizations').select('id').eq('id', fin)
    expect(data).toEqual([])
  })

  it('excluir o último momento de uma finalização apaga a finalização também', async () => {
    const experimentId = randomUUID()
    const f1 = randomUUID()
    const f2 = randomUUID()
    const w1 = await finalize(a, { experimentId, type: 'wet', at: '2026-11-18T14:55:00-03:00', finalizationId: f1, newProduct: true })
    const w2 = await finalize(a, { experimentId, type: 'wet', at: '2026-11-18T15:00:00-03:00', finalizationId: f2 })
    await finalize(a, { experimentId, type: 'dry', at: '2026-11-18T17:00:00-03:00', finalizationId: f2 })

    const r1 = await a.client.rpc('delete_stage', { p_stage_id: w1.stageId })
    expect(r1.data).toMatchObject({ deleted: true, finalization_deleted: true, experiment_deleted: false })
    const r2 = await a.client.rpc('delete_stage', { p_stage_id: w2.stageId })
    expect(r2.data).toMatchObject({ deleted: true, finalization_deleted: false })

    const { data } = await a.client.from('finalizations').select('id').eq('experiment_id', experimentId)
    expect(data?.map((f) => f.id)).toEqual([f2])
  })
})
