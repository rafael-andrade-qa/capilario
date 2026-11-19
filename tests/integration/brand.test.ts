// Marca do produto: gravada pela finalização, opcional e só com produto nomeado.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { photoPath, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'

async function finalizeNew(user: TestUser, newExperiment: Record<string, unknown>) {
  const experimentId = randomUUID()
  const stageId = randomUUID()
  const id = randomUUID()
  const storage_path = photoPath(user.id, stageId, id)
  const up = await user.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const r = await user.client.rpc('finalize_stage', {
    p_experiment_id: experimentId,
    p_stage_id: stageId,
    p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
    p_new_experiment: newExperiment,
    p_new_stage: { stage_type: 'dry', captured_at: new Date().toISOString(), notes: null },
  })
  if (r.error) throw r.error
  const { data } = await user.client.from('experiments').select('product_mode, product_name, brand').eq('id', experimentId).single()
  return data
}

describe('marca do produto', () => {
  let a: TestUser
  beforeAll(async () => {
    a = await testUser('marca')
  })

  it('grava nome e marca separados, sem espaços nas pontas', async () => {
    const e = await finalizeNew(a, { product_mode: 'named', product_name: ' Creme de Pentear Modelador de Ondas ', brand: ' Widi Care ' })
    expect(e).toEqual({ product_mode: 'named', product_name: 'Creme de Pentear Modelador de Ondas', brand: 'Widi Care' })
  })

  it('marca é opcional e ignorada sem produto nomeado', async () => {
    expect(await finalizeNew(a, { product_mode: 'named', product_name: 'Gelatina', brand: '  ' })).toEqual({
      product_mode: 'named',
      product_name: 'Gelatina',
      brand: null,
    })
    expect(await finalizeNew(a, { product_mode: 'none', product_name: null, brand: 'Widi Care' })).toEqual({
      product_mode: 'none',
      product_name: null,
      brand: null,
    })
  })

  it('o banco recusa marca sem produto nomeado ou longa demais', async () => {
    const none = await a.client.from('experiments').insert({ product_mode: 'none', brand: 'Widi Care' })
    expect(none.error?.code).toBe('23514')
    const long = await a.client.from('experiments').insert({ product_mode: 'named', product_name: 'X', brand: 'a'.repeat(101) })
    expect(long.error?.code).toBe('23514')
  })
})
