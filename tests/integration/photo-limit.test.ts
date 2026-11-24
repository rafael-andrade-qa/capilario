// Limite de fotos por plano: Pro 1.000 (a 1.001ª não entra), Grátis 300. Trocar uma foto continua
// funcionando no limite, e quem vira Pro volta a guardar.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, photoPath, setPlan, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'
const ANGLES = ['front', 'left', 'back', 'right'] as const
const TYPES = ['wet', 'dry', 'next_day'] as const

/** `total` fotos direto no banco (sem arquivos), em finalizações de 3 momentos com 4 ângulos. */
async function fillPhotos(user: TestUser, total: number): Promise<{ experiment: string; firstStage: string }> {
  const admin = adminClient()
  const experiment = randomUUID()
  const exp = await admin.from('experiments').insert({ id: experiment, user_id: user.id, product_mode: 'named', product_name: 'Muitas fotos' })
  if (exp.error) throw exp.error
  const fins = Array.from({ length: Math.ceil(total / 12) }, () => ({ id: randomUUID(), experiment_id: experiment, user_id: user.id }))
  const f = await admin.from('finalizations').insert(fins)
  if (f.error) throw f.error
  const stages = fins.flatMap((fin) =>
    TYPES.map((t) => ({ id: randomUUID(), experiment_id: experiment, finalization_id: fin.id, user_id: user.id, stage_type: t, captured_at: '2026-11-20T10:00:00Z' })),
  )
  const s = await admin.from('stages').insert(stages)
  if (s.error) throw s.error
  const photos = stages
    .flatMap((st) => ANGLES.map((angle) => ({ stage: st.id, angle })))
    .slice(0, total)
    .map(({ stage, angle }) => {
      const id = randomUUID()
      return { id, stage_id: stage, user_id: user.id, angle, storage_path: photoPath(user.id, stage, id), mime_type: 'image/jpeg', size_bytes: 160 }
    })
  for (let i = 0; i < photos.length; i += 250) {
    const r = await admin.from('photos').insert(photos.slice(i, i + 250))
    if (r.error) throw r.error
  }
  return { experiment, firstStage: stages[0].id }
}

/** Tenta guardar mais uma foto numa finalização nova. */
async function oneMore(user: TestUser, experiment: string) {
  const stageId = randomUUID()
  const id = randomUUID()
  const storage_path = photoPath(user.id, stageId, id)
  const up = await user.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  expect(up.error).toBeNull()
  return user.client.rpc('finalize_stage', {
    p_experiment_id: experiment,
    p_stage_id: stageId,
    p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
    p_new_experiment: null,
    p_new_stage: { stage_type: 'wet', captured_at: '2026-11-21T10:00:00Z', notes: null, finalization_id: randomUUID() },
  })
}

const countOf = async (user: TestUser) => (await user.client.from('photos').select('id', { count: 'exact', head: true })).count

describe('limite de fotos do Pro', () => {
  let a: TestUser
  let experiment: string
  let fullStage: string
  beforeAll(async () => {
    a = await testUser('limite-fotos')
    await setPlan(a.id, 'pro')
    ;({ experiment, firstStage: fullStage } = await fillPhotos(a, 1000))
  }, 60_000)

  it('a 1.001ª foto não entra', async () => {
    expect((await oneMore(a, experiment)).error?.message).toBe('photo_limit')
    expect(await countOf(a)).toBe(1000)
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

describe('limite de fotos do Grátis', () => {
  let b: TestUser
  let experiment: string
  beforeAll(async () => {
    b = await testUser('limite-fotos-gratis')
    ;({ experiment } = await fillPhotos(b, 300))
  }, 60_000)

  it('a 301ª não entra no Grátis; virando Pro, entra', async () => {
    expect((await oneMore(b, experiment)).error?.message).toBe('photo_limit')
    expect(await countOf(b)).toBe(300)
    await setPlan(b.id, 'pro')
    expect((await oneMore(b, experiment)).error).toBeNull()
    expect(await countOf(b)).toBe(301)
  })

  it('perdendo o Pro, nada é apagado: só não guarda mais acima do limite', async () => {
    await setPlan(b.id, 'free')
    expect(await countOf(b)).toBe(301)
    expect((await oneMore(b, experiment)).error?.message).toBe('photo_limit')
  })
})
