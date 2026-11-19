// Exclusão de etapas: apaga etapa e fotos, libera os arquivos, remove o experimento
// vazio, é idempotente e não alcança dados de outra conta.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, ids, photoPath, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'

/** Cria uma etapa publicada com as fotos dos ângulos pedidos. */
async function createStage(user: TestUser, experimentId: string, isNewExperiment: boolean, angles = ['front', 'left']) {
  const stageId = randomUUID()
  const photos = []
  for (const angle of angles) {
    const id = randomUUID()
    const storage_path = photoPath(user.id, stageId, id)
    const up = await user.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
    if (up.error) throw up.error
    photos.push({ id, angle, storage_path, mime_type: 'image/jpeg', size_bytes: 160 })
  }
  const r = await user.client.rpc('finalize_stage', {
    p_experiment_id: experimentId,
    p_stage_id: stageId,
    p_photos: photos,
    p_new_experiment: isNewExperiment ? { product_mode: 'none', product_name: null } : null,
    p_new_stage: { stage_type: 'wet', captured_at: new Date().toISOString(), notes: 'nota' },
  })
  if (r.error) throw r.error
  return { stageId, paths: photos.map((p) => p.storage_path) }
}

async function exists(user: TestUser, path: string) {
  return (await user.client.storage.from(BUCKET).exists(path)).data
}

describe('exclusão de etapa', () => {
  let a: TestUser
  let b: TestUser

  beforeAll(async () => {
    a = await testUser('apaga')
    b = await testUser('intrusa')
  })

  it('apaga a etapa e as fotos, mantém o experimento com outras etapas e libera os arquivos', async () => {
    const { experimentId } = ids()
    const first = await createStage(a, experimentId, true)
    const second = await createStage(a, experimentId, false, ['front'])

    // Antes de excluir, a foto publicada não pode ser apagada do Storage.
    await a.client.storage.from(BUCKET).remove([first.paths[0]])
    expect(await exists(a, first.paths[0])).toBe(true)

    const r = await a.client.rpc('delete_stage', { p_stage_id: first.stageId })
    expect(r.error).toBeNull()
    expect(r.data.deleted).toBe(true)
    expect(r.data.experiment_deleted).toBe(false)
    expect([...r.data.paths].sort()).toEqual([...first.paths].sort())

    expect((await a.client.from('stages').select('id').eq('id', first.stageId)).data).toEqual([])
    expect((await a.client.from('photos').select('id').eq('stage_id', first.stageId)).data).toEqual([])
    expect((await a.client.from('stages').select('id').eq('id', second.stageId)).data).toHaveLength(1)

    // Agora os arquivos ficaram sem vínculo e o dono consegue removê-los.
    const rm = await a.client.storage.from(BUCKET).remove(first.paths)
    expect(rm.error).toBeNull()
    for (const p of first.paths) expect(await exists(a, p)).toBe(false)
    expect(await exists(a, second.paths[0])).toBe(true)

    // Repetir (resposta perdida, toque duplo) não dá erro.
    const again = await a.client.rpc('delete_stage', { p_stage_id: first.stageId })
    expect(again.error).toBeNull()
    expect(again.data.deleted).toBe(false)
  })

  it('remove o experimento quando a última etapa sai', async () => {
    const { experimentId } = ids()
    const only = await createStage(a, experimentId, true)
    const r = await a.client.rpc('delete_stage', { p_stage_id: only.stageId })
    expect(r.error).toBeNull()
    expect(r.data.experiment_deleted).toBe(true)
    expect((await a.client.from('experiments').select('id').eq('id', experimentId)).data).toEqual([])
  })

  it('duas exclusões simultâneas das últimas etapas não deixam experimento vazio', async () => {
    const { experimentId } = ids()
    const s1 = await createStage(a, experimentId, true)
    const s2 = await createStage(a, experimentId, false)
    const [r1, r2] = await Promise.all([
      a.client.rpc('delete_stage', { p_stage_id: s1.stageId }),
      a.client.rpc('delete_stage', { p_stage_id: s2.stageId }),
    ])
    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()
    expect([r1.data.experiment_deleted, r2.data.experiment_deleted].filter(Boolean)).toHaveLength(1)
    expect((await a.client.from('experiments').select('id').eq('id', experimentId)).data).toEqual([])
  })

  it('outra conta e acesso sem sessão não apagam nada', async () => {
    const { experimentId } = ids()
    const target = await createStage(a, experimentId, true)

    const rb = await b.client.rpc('delete_stage', { p_stage_id: target.stageId })
    expect(rb.error).toBeNull()
    expect(rb.data.deleted).toBe(false)
    // Exclusão direta pela API também não alcança linhas de outra conta.
    expect((await b.client.from('stages').delete().eq('id', target.stageId).select()).data).toEqual([])
    expect((await b.client.from('photos').delete().eq('stage_id', target.stageId).select()).data).toEqual([])
    expect((await b.client.from('experiments').delete().eq('id', experimentId).select()).data).toEqual([])

    const anon = await anonClient().rpc('delete_stage', { p_stage_id: target.stageId })
    expect(anon.error).not.toBeNull()

    const { data } = await a.client.from('stages').select('id, photos(id)').eq('id', target.stageId)
    expect(data).toHaveLength(1)
    expect(data![0].photos).toHaveLength(2)
    for (const p of target.paths) expect(await exists(a, p)).toBe(true)
  })
})
