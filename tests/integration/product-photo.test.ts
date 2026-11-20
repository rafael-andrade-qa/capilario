// Foto do produto: só o dono define, o arquivo precisa existir no lugar certo,
// a foto em uso não pode ser apagada e sai junto quando o produto inteiro é excluído.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { photoPath, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'

async function createProduct(user: TestUser) {
  const experimentId = randomUUID()
  const stageId = randomUUID()
  const id = randomUUID()
  const storage_path = photoPath(user.id, stageId, id)
  await user.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  const r = await user.client.rpc('finalize_stage', {
    p_experiment_id: experimentId,
    p_stage_id: stageId,
    p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
    p_new_experiment: { product_mode: 'named', product_name: 'Gelatina', brand: 'Widi Care' },
    p_new_stage: { stage_type: 'wet', captured_at: new Date().toISOString(), notes: null },
  })
  if (r.error) throw r.error
  return { experimentId, stageId }
}

async function uploadProductPhoto(user: TestUser, experimentId: string) {
  const path = `${user.id}/produto-${experimentId}/${randomUUID()}.jpg`
  const up = await user.client.storage.from(BUCKET).upload(path, tinyJpeg(), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  return path
}

const exists = async (user: TestUser, path: string) => (await user.client.storage.from(BUCKET).exists(path)).data

describe('foto do produto', () => {
  let a: TestUser
  let b: TestUser
  beforeAll(async () => {
    a = await testUser('produto')
    b = await testUser('produto-outra')
  })

  it('define, troca (devolvendo a anterior) e protege a foto em uso', async () => {
    const { experimentId } = await createProduct(a)
    const first = await uploadProductPhoto(a, experimentId)
    const r1 = await a.client.rpc('set_experiment_photo', { p_experiment_id: experimentId, p_path: first })
    expect(r1.error).toBeNull()
    expect(r1.data.old_path).toBeNull()

    // Em uso: o dono não consegue apagar o arquivo.
    await a.client.storage.from(BUCKET).remove([first])
    expect(await exists(a, first)).toBe(true)

    const second = await uploadProductPhoto(a, experimentId)
    const r2 = await a.client.rpc('set_experiment_photo', { p_experiment_id: experimentId, p_path: second })
    expect(r2.data.old_path).toBe(first)
    // A anterior ficou livre e pode ser apagada.
    await a.client.storage.from(BUCKET).remove([first])
    expect(await exists(a, first)).toBe(false)

    const { data } = await a.client.from('experiments').select('photo_path').eq('id', experimentId).single()
    expect(data!.photo_path).toBe(second)
  })

  it('recusa caminho fora do padrão, arquivo inexistente e outra conta', async () => {
    const { experimentId } = await createProduct(a)
    const missing = `${a.id}/produto-${experimentId}/${randomUUID()}.jpg`
    expect((await a.client.rpc('set_experiment_photo', { p_experiment_id: experimentId, p_path: missing })).error?.message).toBe('object_missing')
    const wrong = `${a.id}/produto-${randomUUID()}/${randomUUID()}.jpg`
    expect((await a.client.rpc('set_experiment_photo', { p_experiment_id: experimentId, p_path: wrong })).error?.message).toBe('invalid_storage_path')

    const ok = await uploadProductPhoto(a, experimentId)
    const fromB = await b.client.rpc('set_experiment_photo', { p_experiment_id: experimentId, p_path: ok })
    expect(fromB.error?.message).toBe('experiment_not_found')
    // Só photo_path pode ser alterado diretamente; outros campos não.
    const rename = await a.client.from('experiments').update({ product_name: 'Outro' }).eq('id', experimentId)
    expect(rename.error?.code).toBe('42501')
  })

  it('excluir o último momento mantém o produto e a foto da embalagem', async () => {
    const { experimentId, stageId } = await createProduct(a)
    const path = await uploadProductPhoto(a, experimentId)
    await a.client.rpc('set_experiment_photo', { p_experiment_id: experimentId, p_path: path })
    const r = await a.client.rpc('delete_stage', { p_stage_id: stageId })
    expect(r.error).toBeNull()
    expect(r.data.experiment_deleted).toBe(false)
    expect(r.data.paths).not.toContain(path)
    expect(await exists(a, path)).toBe(true)
  })
})
