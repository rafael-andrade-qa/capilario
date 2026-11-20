// Edição: nome e marca do produto; trocar, adicionar e remover fotos de um momento.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { photoPath, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'

async function upload(user: TestUser, stageId: string) {
  const id = randomUUID()
  const storage_path = photoPath(user.id, stageId, id)
  const up = await user.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  return { id, storage_path, mime_type: 'image/jpeg', size_bytes: 160 }
}

async function seed(user: TestUser, product: Record<string, unknown>, angles = ['front', 'left']) {
  const experimentId = randomUUID()
  const stageId = randomUUID()
  const photos = []
  for (const angle of angles) photos.push({ ...(await upload(user, stageId)), angle })
  const r = await user.client.rpc('finalize_stage', {
    p_experiment_id: experimentId,
    p_stage_id: stageId,
    p_photos: photos,
    p_new_experiment: product,
    p_new_stage: { stage_type: 'dry', captured_at: new Date().toISOString(), notes: null, finalization_id: randomUUID() },
  })
  if (r.error) throw r.error
  return { experimentId, stageId, photos }
}

describe('editar produto', () => {
  let a: TestUser
  let b: TestUser
  beforeAll(async () => {
    a = await testUser('editar-produto-a')
    b = await testUser('editar-produto-b')
  })

  it('corrige nome e marca, sem espaços nas pontas', async () => {
    const { experimentId } = await seed(a, { product_mode: 'named', product_name: 'Cremeou', brand: 'Widi Car' })
    const r = await a.client.rpc('update_experiment', { p_experiment_id: experimentId, p_name: ' Creme ', p_brand: ' Widi Care ' })
    expect(r.error).toBeNull()
    const { data } = await a.client.from('experiments').select('product_name, brand').eq('id', experimentId).single()
    expect(data).toEqual({ product_name: 'Creme', brand: 'Widi Care' })
  })

  it('recusa nome repetido, nome vazio, Sem finalizador e produto de outra pessoa', async () => {
    await seed(a, { product_mode: 'named', product_name: 'Gelatina', brand: 'Marca' })
    const { experimentId } = await seed(a, { product_mode: 'named', product_name: 'Gelatin', brand: 'Marca' })
    expect((await a.client.rpc('update_experiment', { p_experiment_id: experimentId, p_name: 'gelatina', p_brand: 'MARCA' })).error?.message).toBe('product_exists')
    expect((await a.client.rpc('update_experiment', { p_experiment_id: experimentId, p_name: '  ', p_brand: 'Marca' })).error?.message).toBe('product_name_required')

    const none = await seed(a, { product_mode: 'none', product_name: null })
    expect((await a.client.rpc('update_experiment', { p_experiment_id: none.experimentId, p_name: 'X', p_brand: 'Y' })).error?.message).toBe('product_not_editable')

    expect((await b.client.rpc('update_experiment', { p_experiment_id: experimentId, p_name: 'Roubado', p_brand: 'X' })).error?.message).toBe('experiment_not_found')
  })
})

describe('editar fotos do momento', () => {
  let a: TestUser
  let b: TestUser
  beforeAll(async () => {
    a = await testUser('editar-fotos-a')
    b = await testUser('editar-fotos-b')
  })

  it('troca a foto de um ângulo, devolve a antiga e o arquivo antigo pode ser apagado', async () => {
    const { stageId, photos } = await seed(a, { product_mode: 'named', product_name: 'Creme', brand: 'M' })
    const next = await upload(a, stageId)
    const r = await a.client.rpc('replace_photo', { p_stage_id: stageId, p_angle: 'front', p_photo: next })
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ photo_id: next.id, old_path: photos[0].storage_path })

    const { data } = await a.client.from('photos').select('id, angle').eq('stage_id', stageId).order('angle')
    expect(data).toEqual([
      { id: next.id, angle: 'front' },
      { id: photos[1].id, angle: 'left' },
    ])
    // Sem ligação no banco, a política do Storage libera o arquivo antigo para o dono.
    const rm = await a.client.storage.from(BUCKET).remove([photos[0].storage_path])
    expect(rm.data?.length).toBe(1)

    // Repetir a mesma troca não muda nada.
    const again = await a.client.rpc('replace_photo', { p_stage_id: stageId, p_angle: 'front', p_photo: next })
    expect(again.data).toMatchObject({ photo_id: next.id, old_path: null })
  })

  it('põe foto num ângulo vazio e recusa caminho errado ou momento de outra pessoa', async () => {
    const { stageId } = await seed(a, { product_mode: 'named', product_name: 'Mousse', brand: 'M' })
    const back = await upload(a, stageId)
    const r = await a.client.rpc('replace_photo', { p_stage_id: stageId, p_angle: 'back', p_photo: back })
    expect(r.data).toMatchObject({ old_path: null })

    const other = await seed(a, { product_mode: 'named', product_name: 'Outro', brand: 'M' })
    const wrong = await upload(a, other.stageId)
    expect((await a.client.rpc('replace_photo', { p_stage_id: stageId, p_angle: 'right', p_photo: wrong })).error?.message).toBe('invalid_storage_path')

    const theirs = await upload(b, randomUUID())
    expect((await b.client.rpc('replace_photo', { p_stage_id: stageId, p_angle: 'right', p_photo: theirs })).error?.message).toBe('stage_not_found')
  })

  it('remove uma foto, mas não a última', async () => {
    const { stageId, photos } = await seed(a, { product_mode: 'named', product_name: 'Óleo', brand: 'M' })
    const r = await a.client.rpc('delete_photo', { p_photo_id: photos[1].id })
    expect(r.data).toMatchObject({ deleted: true, path: photos[1].storage_path })
    const last = await a.client.rpc('delete_photo', { p_photo_id: photos[0].id })
    expect(last.error?.message).toBe('last_photo')
    const { data } = await a.client.from('photos').select('id').eq('stage_id', stageId)
    expect(data).toEqual([{ id: photos[0].id }])
  })
})

describe('cadastrar produto', () => {
  let a: TestUser
  let b: TestUser
  beforeAll(async () => {
    a = await testUser('cadastrar-produto-a')
    b = await testUser('cadastrar-produto-b')
  })

  it('cadastra só com nome e marca, sem fotos; repetir a chamada não duplica', async () => {
    const id = randomUUID()
    const r = await a.client.rpc('create_product', { p_experiment_id: id, p_name: ' Leave-in ', p_brand: ' Marca ' })
    expect(r.data).toEqual({ experiment_id: id, created: true })
    const again = await a.client.rpc('create_product', { p_experiment_id: id, p_name: 'Leave-in', p_brand: 'Marca' })
    expect(again.data).toEqual({ experiment_id: id, created: false })
    const { data } = await a.client.from('experiments').select('product_mode, product_name, brand, stages(id)').eq('id', id).single()
    expect(data).toEqual({ product_mode: 'named', product_name: 'Leave-in', brand: 'Marca', stages: [] })
  })

  it('recusa produto repetido, nome vazio e id de outra pessoa', async () => {
    await a.client.rpc('create_product', { p_experiment_id: randomUUID(), p_name: 'Mousse', p_brand: 'X' })
    expect((await a.client.rpc('create_product', { p_experiment_id: randomUUID(), p_name: 'mousse', p_brand: 'x' })).error?.message).toBe('product_exists')
    expect((await a.client.rpc('create_product', { p_experiment_id: randomUUID(), p_name: ' ', p_brand: 'x' })).error?.message).toBe('product_name_required')
    const id = randomUUID()
    await a.client.rpc('create_product', { p_experiment_id: id, p_name: 'Gel', p_brand: 'Y' })
    expect((await b.client.rpc('create_product', { p_experiment_id: id, p_name: 'Gel', p_brand: 'Y' })).error?.message).toBe('experiment_not_found')
  })
})
