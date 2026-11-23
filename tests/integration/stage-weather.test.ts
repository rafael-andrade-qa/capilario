// Clima do momento: a dona grava só os campos do clima, com valores válidos; outra pessoa não.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
const BUCKET = 'capilar-photos'
import { photoPath, testUser, tinyJpeg, type TestUser } from './helpers'

describe('clima do momento', () => {
  let a: TestUser
  let b: TestUser
  const stageId = randomUUID()
  beforeAll(async () => {
    a = await testUser('clima-a')
    b = await testUser('clima-b')
    const experiment = randomUUID()
    const p = await a.client.rpc('create_product', { p_experiment_id: experiment, p_name: 'Geleia Clima', p_brand: 'Marca' })
    if (p.error) throw p.error
    const id = randomUUID()
    const storage_path = photoPath(a.id, stageId, id)
    const up = await a.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
    if (up.error) throw up.error
    const r = await a.client.rpc('finalize_stage', {
      p_experiment_id: experiment,
      p_stage_id: stageId,
      p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
      p_new_experiment: null,
      p_new_stage: { stage_type: 'dry', captured_at: '2026-11-23T13:18:00Z', notes: null, finalization_id: randomUUID() },
    })
    if (r.error) throw r.error
  })

  const weather = { humidity: 82, temperature: 24.4, weather_code: 3, weather_at: '2026-11-23T13:00:00Z' }

  it('a dona grava e o histórico devolve', async () => {
    const r = await a.client.from('stages').update(weather).eq('id', stageId).select('id')
    expect(r.error).toBeNull()
    expect(r.data).toHaveLength(1)
    const { data } = await a.client.from('stages').select('humidity, temperature, weather_code, weather_at').eq('id', stageId).single()
    expect(data).toEqual({ ...weather, weather_at: '2026-11-23T13:00:00+00:00' })
  })

  it('recusa valores impossíveis', async () => {
    expect((await a.client.from('stages').update({ humidity: 140 }).eq('id', stageId)).error?.code).toBe('23514')
    expect((await a.client.from('stages').update({ temperature: 99 }).eq('id', stageId)).error?.code).toBe('23514')
    expect((await a.client.from('stages').update({ weather_code: 120 }).eq('id', stageId)).error?.code).toBe('23514')
  })

  it('outra pessoa não grava; colunas fora do clima continuam fechadas', async () => {
    const other = await b.client.from('stages').update({ humidity: 10 }).eq('id', stageId).select('id')
    expect(other.data ?? []).toHaveLength(0)
    const { data } = await a.client.from('stages').select('humidity').eq('id', stageId).single()
    expect(data?.humidity).toBe(82)
    const closed = await a.client.from('stages').update({ stage_type: 'wet' }).eq('id', stageId).select('id')
    expect(closed.error?.code).toBe('42501')
  })
})
