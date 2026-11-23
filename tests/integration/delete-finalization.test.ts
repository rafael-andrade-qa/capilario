// Excluir uma finalização inteira: saem os momentos, as fotos e a análise só dela; o produto e as
// outras finalizações ficam; ninguém exclui a finalização de outra pessoa.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, photoPath, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'

async function addMoment(user: TestUser, experimentId: string, fin: string, type: 'wet' | 'dry', newProduct: boolean): Promise<string> {
  const stageId = randomUUID()
  const id = randomUUID()
  const storage_path = photoPath(user.id, stageId, id)
  const up = await user.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const r = await user.client.rpc('finalize_stage', {
    p_experiment_id: experimentId,
    p_stage_id: stageId,
    p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
    p_new_experiment: newProduct ? { product_mode: 'named', product_name: 'Geleia', brand: 'Marca' } : null,
    p_new_stage: { stage_type: type, captured_at: type === 'wet' ? '2026-11-20T14:00:00-03:00' : '2026-11-20T15:00:00-03:00', notes: null, finalization_id: fin },
  })
  if (r.error) throw r.error
  return storage_path
}

describe('excluir finalização', () => {
  let a: TestUser
  let b: TestUser
  const exp = randomUUID()
  const keep = randomUUID()
  const gone = randomUUID()
  let gonePaths: string[]

  beforeAll(async () => {
    a = await testUser('excluir-fin-a')
    b = await testUser('excluir-fin-b')
    await addMoment(a, exp, keep, 'wet', true)
    gonePaths = [await addMoment(a, exp, gone, 'wet', false), await addMoment(a, exp, gone, 'dry', false)]
    const r = await a.client
      .from('finalization_analyses')
      .insert({ finalization_id: gone, model: 'x', result: { hair_type: 'Ondulado 2B' } })
    if (r.error) throw r.error
  })

  it('outra pessoa e quem não entrou não excluem nada', async () => {
    expect((await b.client.rpc('delete_finalization', { p_finalization_id: gone })).data).toMatchObject({ deleted: false })
    expect((await anonClient().rpc('delete_finalization', { p_finalization_id: gone })).error).not.toBeNull()
    expect((await a.client.from('stages').select('id').eq('finalization_id', gone)).data).toHaveLength(2)
  })

  it('a dona exclui: saem os momentos, as fotos e a análise; produto e outra finalização ficam', async () => {
    const r = await a.client.rpc('delete_finalization', { p_finalization_id: gone })
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ deleted: true, experiment_id: exp, stages: 2 })
    expect([...(r.data as { paths: string[] }).paths].sort()).toEqual([...gonePaths].sort())

    expect((await a.client.from('stages').select('id').eq('finalization_id', gone)).data).toEqual([])
    expect((await a.client.from('finalizations').select('id').eq('id', gone)).data).toEqual([])
    expect((await a.client.from('finalization_analyses').select('finalization_id').eq('finalization_id', gone)).data).toEqual([])
    expect((await a.client.from('stages').select('id').eq('finalization_id', keep)).data).toHaveLength(1)
    expect((await a.client.from('experiments').select('id').eq('id', exp)).data).toHaveLength(1)

    // Os arquivos ficam livres para o app apagar.
    expect((await a.client.storage.from(BUCKET).remove(gonePaths)).error).toBeNull()
  })

  it('excluir de novo não quebra', async () => {
    const r = await a.client.rpc('delete_finalization', { p_finalization_id: gone })
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ deleted: false })
  })
})
