// Verificações do backend: finalização atômica e idempotente, ângulos únicos,
// isolamento entre contas (RLS em tabelas e Storage) e acesso sem sessão.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, ids, photoPath, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'

async function upload(user: TestUser, path: string) {
  const { error } = await user.client.storage.from(BUCKET).upload(path, tinyJpeg(), { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
}

function photo(user: TestUser, stageId: string, angle: string, id = randomUUID()) {
  return { id, angle, storage_path: photoPath(user.id, stageId, id), mime_type: 'image/jpeg', size_bytes: 160 }
}

async function finalize(user: TestUser, args: Record<string, unknown>) {
  return user.client.rpc('finalize_stage', args)
}

describe('backend', () => {
  let a: TestUser
  let b: TestUser
  const first = ids()
  let frontPhoto: ReturnType<typeof photo>
  let leftPhoto: ReturnType<typeof photo>

  beforeAll(async () => {
    a = await testUser('pessoal')
    b = await testUser('outra')
  })

  it('cria experimento, etapa e fotos em uma finalização', async () => {
    frontPhoto = photo(a, first.stageId, 'front')
    leftPhoto = photo(a, first.stageId, 'left')
    await upload(a, frontPhoto.storage_path)
    await upload(a, leftPhoto.storage_path)
    const args = {
      p_experiment_id: first.experimentId,
      p_stage_id: first.stageId,
      p_photos: [frontPhoto, leftPhoto],
      p_new_experiment: { product_mode: 'named', product_name: 'Ondulando a Gema' },
      p_new_stage: { stage_type: 'wet', captured_at: new Date().toISOString(), notes: null },
    }
    // Duas abas (ou toques repetidos) finalizando ao mesmo tempo não duplicam.
    const [r1, p2] = await Promise.all([finalize(a, args), finalize(a, args)])
    expect(r1.error).toBeNull()
    expect(p2.error).toBeNull()
    expect(r1.data.photos).toHaveLength(2)
    expect(p2.data).toEqual(r1.data)

    // Repetir a mesma finalização (resposta perdida) devolve o mesmo resultado.
    const r2 = await finalize(a, args)
    expect(r2.error).toBeNull()
    expect(r2.data).toEqual(r1.data)

    const { data: exps } = await a.client.from('experiments').select('id, stages(id, photos(id, angle))')
    expect(exps).toHaveLength(1)
    expect(exps![0].stages).toHaveLength(1)
    expect(exps![0].stages[0].photos).toHaveLength(2)
  })

  it('completa ângulos na mesma etapa e protege contra ângulo repetido', async () => {
    const back = photo(a, first.stageId, 'back')
    await upload(a, back.storage_path)
    const r = await finalize(a, { p_experiment_id: first.experimentId, p_stage_id: first.stageId, p_photos: [back] })
    expect(r.error).toBeNull()
    expect(r.data.stage_id).toBe(first.stageId)
    expect(r.data.photos.map((p: { angle: string }) => p.angle).sort()).toEqual(['back', 'front', 'left'])

    const dup = photo(a, first.stageId, 'front')
    await upload(a, dup.storage_path)
    const r2 = await finalize(a, { p_experiment_id: first.experimentId, p_stage_id: first.stageId, p_photos: [dup] })
    expect(r2.error?.message).toBe('angle_taken')

    // Mesmo um insert direto (sem a função) esbarra na restrição única.
    const direct = await a.client.from('photos').insert({ id: dup.id, stage_id: first.stageId, angle: 'front', storage_path: dup.storage_path, mime_type: 'image/jpeg' })
    expect(direct.error?.code).toBe('23505')
  })

  it('exige objeto enviado, caminho correto e pelo menos uma foto', async () => {
    const st = ids()
    const missing = photo(a, st.stageId, 'front')
    const base = {
      p_experiment_id: first.experimentId,
      p_stage_id: st.stageId,
      p_new_stage: { stage_type: 'dry', captured_at: new Date().toISOString(), notes: 'x' },
    }
    expect((await finalize(a, { ...base, p_photos: [missing] })).error?.message).toBe('object_missing')
    expect((await finalize(a, { ...base, p_photos: [] })).error?.message).toBe('photos_required')
    const wrongPath = { ...photo(a, st.stageId, 'front'), storage_path: `${a.id}/${randomUUID()}/x.jpg` }
    expect((await finalize(a, { ...base, p_photos: [wrongPath] })).error?.message).toBe('invalid_storage_path')
    // Nada disso deixou etapa vazia para trás.
    const { data } = await a.client.from('stages').select('id').eq('id', st.stageId)
    expect(data).toHaveLength(0)
  })

  it('aceita etapas do mesmo tipo e atualiza só nota e favorito', async () => {
    const st = ids()
    const p = photo(a, st.stageId, 'front')
    await upload(a, p.storage_path)
    const r = await finalize(a, {
      p_experiment_id: first.experimentId,
      p_stage_id: st.stageId,
      p_photos: [p],
      p_new_stage: { stage_type: 'wet', captured_at: new Date().toISOString(), notes: null },
    })
    expect(r.error).toBeNull()

    const upd = await a.client.from('stages').update({ notes: 'Macio e solto. Gostei do volume.', is_favorite: true }).eq('id', st.stageId).select()
    expect(upd.error).toBeNull()
    expect(upd.data![0].is_favorite).toBe(true)

    const bad = await a.client.from('stages').update({ stage_type: 'dry' }).eq('id', st.stageId)
    expect(bad.error?.code).toBe('42501')
  })

  it('valida produto e valores enumerados no banco', async () => {
    const e1 = await a.client.from('experiments').insert({ product_mode: 'named', product_name: '   ' })
    expect(e1.error?.code).toBe('23514')
    const e2 = await a.client.from('experiments').insert({ product_mode: 'creme' })
    expect(e2.error?.code).toBe('23514')
    const e3 = await a.client.from('experiments').insert({ product_mode: 'none', product_name: 'algo' })
    expect(e3.error?.code).toBe('23514')
  })

  it('isola os dados da conta pessoal de outra conta', async () => {
    // Leitura
    expect((await b.client.from('experiments').select('id')).data).toEqual([])
    expect((await b.client.from('stages').select('id')).data).toEqual([])
    expect((await b.client.from('photos').select('id')).data).toEqual([])
    // Escrita nos registros de A
    const upd = await b.client.from('stages').update({ notes: 'invasão' }).eq('id', first.stageId).select()
    expect(upd.data).toEqual([])
    const asA = await b.client.from('stages').insert({ experiment_id: first.experimentId, user_id: a.id, stage_type: 'dry', captured_at: new Date().toISOString() })
    expect(asA.error).not.toBeNull()
    const intoA = await b.client.from('stages').insert({ experiment_id: first.experimentId, stage_type: 'dry', captured_at: new Date().toISOString() })
    expect(intoA.error).not.toBeNull() // FK composta: experimento não é de B
    // Função de finalização
    const st = ids()
    const bp = photo(b, st.stageId, 'front')
    await upload(b, bp.storage_path)
    const rf = await finalize(b, {
      p_experiment_id: first.experimentId,
      p_stage_id: st.stageId,
      p_photos: [bp],
      p_new_stage: { stage_type: 'dry', captured_at: new Date().toISOString(), notes: null },
    })
    expect(rf.error?.message).toBe('experiment_not_found')
    const steal = await finalize(b, { p_experiment_id: first.experimentId, p_stage_id: first.stageId, p_photos: [frontPhoto] })
    expect(steal.error).not.toBeNull()

    // Storage
    const dl = await b.client.storage.from(BUCKET).download(frontPhoto.storage_path)
    expect(dl.error).not.toBeNull()
    const sig = await b.client.storage.from(BUCKET).createSignedUrl(frontPhoto.storage_path, 60)
    expect(sig.error).not.toBeNull()
    const up = await b.client.storage.from(BUCKET).upload(`${a.id}/${first.stageId}/${randomUUID()}.jpg`, tinyJpeg(), { contentType: 'image/jpeg' })
    expect(up.error).not.toBeNull()
    await b.client.storage.from(BUCKET).remove([frontPhoto.storage_path])
    expect((await a.client.storage.from(BUCKET).exists(frontPhoto.storage_path)).data).toBe(true)
    const list = await b.client.storage.from(BUCKET).list(a.id)
    expect(list.data ?? []).toEqual([])
  })

  it('bloqueia acesso sem sessão e cadastro público', async () => {
    const anon = anonClient()
    const r = await anon.from('experiments').select('id')
    expect(r.data ?? []).toEqual([])
    const rpc = await anon.rpc('finalize_stage', { p_experiment_id: first.experimentId, p_stage_id: first.stageId, p_photos: [frontPhoto] })
    expect(rpc.error).not.toBeNull()
    const dl = await anon.storage.from(BUCKET).download(frontPhoto.storage_path)
    expect(dl.error).not.toBeNull()
    const up = await anon.storage.from(BUCKET).upload(`${a.id}/x/${randomUUID()}.jpg`, tinyJpeg(), { contentType: 'image/jpeg' })
    expect(up.error).not.toBeNull()
    const signup = await anon.auth.signUp({ email: `novo-${randomUUID().slice(0, 6)}@teste.local`, password: 'SenhaQualquer-123' })
    expect(signup.error).not.toBeNull()
  })

  it('só apaga arquivos que não foram associados a uma foto salva', async () => {
    // Foto publicada: não pode ser apagada pelo dono via Storage.
    await a.client.storage.from(BUCKET).remove([leftPhoto.storage_path])
    expect((await a.client.storage.from(BUCKET).exists(leftPhoto.storage_path)).data).toBe(true)
    // Arquivo órfão de uma tentativa descartada: pode.
    const orphan = photoPath(a.id, randomUUID(), randomUUID())
    await upload(a, orphan)
    await a.client.storage.from(BUCKET).remove([orphan])
    expect((await a.client.storage.from(BUCKET).exists(orphan)).data).toBe(false)
  })

  it('rejeita formato e tamanho fora do limite no bucket', async () => {
    const gif = await a.client.storage.from(BUCKET).upload(photoPath(a.id, randomUUID(), randomUUID(), 'gif'), new Blob([new Uint8Array(10)], { type: 'image/gif' }), { contentType: 'image/gif' })
    expect(gif.error).not.toBeNull()
    const big = new Blob([new Uint8Array(15 * 1024 * 1024 + 1)], { type: 'image/jpeg' })
    const r = await a.client.storage.from(BUCKET).upload(photoPath(a.id, randomUUID(), randomUUID()), big, { contentType: 'image/jpeg' })
    expect(r.error).not.toBeNull()
  })
})
