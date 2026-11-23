// Limite de 1.000 fotos por pessoa: a 1.001ª não entra; trocar uma foto continua funcionando.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, photoPath, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'
const ANGLES = ['front', 'left', 'back', 'right'] as const
const TYPES = ['wet', 'dry', 'next_day'] as const

describe('limite de fotos', () => {
  let a: TestUser
  let experiment: string
  let fullStage: string
  beforeAll(async () => {
    a = await testUser('limite-fotos')
    const admin = adminClient()
    // 1.000 fotos direto no banco (sem arquivos): 84 finalizações de 3 momentos com 4 ângulos.
    experiment = randomUUID()
    const exp = await admin.from('experiments').insert({ id: experiment, user_id: a.id, product_mode: 'named', product_name: 'Muitas fotos' })
    if (exp.error) throw exp.error
    const fins = Array.from({ length: 84 }, () => ({ id: randomUUID(), experiment_id: experiment, user_id: a.id }))
    const f = await admin.from('finalizations').insert(fins)
    if (f.error) throw f.error
    const stages = fins.flatMap((fin) =>
      TYPES.map((t) => ({ id: randomUUID(), experiment_id: experiment, finalization_id: fin.id, user_id: a.id, stage_type: t, captured_at: '2026-11-20T10:00:00Z' })),
    )
    const s = await admin.from('stages').insert(stages)
    if (s.error) throw s.error
    const photos = stages
      .flatMap((st) => ANGLES.map((angle) => ({ stage: st.id, angle })))
      .slice(0, 1000)
      .map(({ stage, angle }) => {
        const id = randomUUID()
        return { id, stage_id: stage, user_id: a.id, angle, storage_path: photoPath(a.id, stage, id), mime_type: 'image/jpeg', size_bytes: 160 }
      })
    for (let i = 0; i < photos.length; i += 250) {
      const r = await admin.from('photos').insert(photos.slice(i, i + 250))
      if (r.error) throw r.error
    }
    fullStage = stages[0].id
  }, 60_000)

  it('a 1.001ª foto não entra', async () => {
    const stageId = randomUUID()
    const id = randomUUID()
    const storage_path = photoPath(a.id, stageId, id)
    const up = await a.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
    expect(up.error).toBeNull()
    const r = await a.client.rpc('finalize_stage', {
      p_experiment_id: experiment,
      p_stage_id: stageId,
      p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
      p_new_experiment: null,
      p_new_stage: { stage_type: 'wet', captured_at: '2026-11-21T10:00:00Z', notes: null, finalization_id: randomUUID() },
    })
    expect(r.error?.message).toBe('photo_limit')
    const { count } = await a.client.from('photos').select('id', { count: 'exact', head: true })
    expect(count).toBe(1000)
  })

  it('trocar uma foto no limite continua funcionando', async () => {
    const id = randomUUID()
    const storage_path = photoPath(a.id, fullStage, id)
    const up = await a.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
    expect(up.error).toBeNull()
    const r = await a.client.rpc('replace_photo', {
      p_stage_id: fullStage,
      p_angle: 'front',
      p_photo: { id, storage_path, mime_type: 'image/jpeg', size_bytes: 160 },
    })
    expect(r.error).toBeNull()
  })
})
