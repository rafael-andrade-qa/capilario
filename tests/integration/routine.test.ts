// Rotina da finalização: o principal entra sozinho, set_routine troca a rotina inteira, o
// principal não sai, só produtos da própria pessoa e o tipo da máscara só na máscara.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { photoPath, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'

async function product(u: TestUser, name: string, category: string | null) {
  const id = randomUUID()
  const r = await u.client.rpc('create_product', { p_experiment_id: id, p_name: name, p_brand: 'Marca', p_category: category })
  if (r.error) throw r.error
  return id
}

async function finalization(u: TestUser, experiment: string) {
  const stageId = randomUUID()
  const fin = randomUUID()
  const id = randomUUID()
  const storage_path = photoPath(u.id, stageId, id)
  const up = await u.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const r = await u.client.rpc('finalize_stage', {
    p_experiment_id: experiment,
    p_stage_id: stageId,
    p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
    p_new_experiment: null,
    p_new_stage: { stage_type: 'wet', captured_at: new Date().toISOString(), notes: null, finalization_id: fin },
  })
  if (r.error) throw r.error
  return fin
}

const routineOf = async (u: TestUser, fin: string) =>
  ((await u.client.from('routine_items').select('experiment_id, step, position, mask_kind').eq('finalization_id', fin).order('position')).data ?? []) as {
    experiment_id: string
    step: string
    position: number
    mask_kind: string | null
  }[]

describe('rotina da finalização', () => {
  let a: TestUser
  let b: TestUser
  let geleia: string
  let shampoo: string
  let mascara: string
  let fin: string
  beforeAll(async () => {
    a = await testUser('rotina-a')
    b = await testUser('rotina-b')
    geleia = await product(a, 'Geleia Rotina', 'geleia')
    shampoo = await product(a, 'Shampoo Rotina', 'shampoo')
    mascara = await product(a, 'Máscara Rotina', 'mascara')
    fin = await finalization(a, geleia)
  })

  it('finalização nova já começa com o produto principal, na etapa dele', async () => {
    expect(await routineOf(a, fin)).toEqual([{ experiment_id: geleia, step: 'hold', position: 0, mask_kind: null }])
  })

  it('set_routine troca a rotina inteira, na ordem enviada, com o tipo da máscara', async () => {
    const r = await a.client.rpc('set_routine', {
      p_finalization_id: fin,
      p_items: [
        { experiment_id: shampoo, step: 'wash', mask_kind: 'H' },
        { experiment_id: mascara, step: 'mask', mask_kind: 'N' },
        { experiment_id: geleia, step: 'hold' },
      ],
    })
    expect(r.error).toBeNull()
    expect(await routineOf(a, fin)).toEqual([
      { experiment_id: shampoo, step: 'wash', position: 0, mask_kind: null },
      { experiment_id: mascara, step: 'mask', position: 1, mask_kind: 'N' },
      { experiment_id: geleia, step: 'hold', position: 2, mask_kind: null },
    ])
  })

  it('a rotina decide onde a finalização fica: sem finalizador vai para Sem finalizador e volta', async () => {
    const where = async () => {
      const f = (await a.client.from('finalizations').select('experiment_id').eq('id', fin).single()).data!.experiment_id as string
      const st = ((await a.client.from('stages').select('experiment_id').eq('finalization_id', fin)).data ?? []).map((x) => x.experiment_id)
      const e = (await a.client.from('experiments').select('product_mode').eq('id', f).single()).data!.product_mode as string
      return { f, st, e }
    }
    // Tirou a geleia: sem fixar/definir/finalizar, a finalização (e os momentos) vão para Sem finalizador.
    const r = await a.client.rpc('set_routine', { p_finalization_id: fin, p_items: [{ experiment_id: shampoo, step: 'wash' }] })
    expect(r.error).toBeNull()
    expect(r.data.moved).toBe(true)
    expect((await routineOf(a, fin)).map((i) => [i.experiment_id, i.step])).toEqual([[shampoo, 'wash']])
    const none = await where()
    expect(none.e).toBe('none')
    expect(none.st).toEqual([none.f])
    // Pôs a geleia de volta: volta para ela.
    expect((await a.client.rpc('set_routine', { p_finalization_id: fin, p_items: [{ experiment_id: shampoo, step: 'wash' }, { experiment_id: geleia, step: 'hold' }] })).error).toBeNull()
    const back = await where()
    expect(back.f).toBe(geleia)
    expect(back.st).toEqual([geleia])
    // Fixar vale mais que definir, mesmo vindo depois na lista.
    const creme = await product(a, 'Creme Rotina', 'creme_pentear')
    await a.client.rpc('set_routine', { p_finalization_id: fin, p_items: [{ experiment_id: creme, step: 'shape' }, { experiment_id: geleia, step: 'hold' }, { experiment_id: shampoo, step: 'wash' }] })
    expect((await where()).f).toBe(geleia)
  })

  it('recusa produto de outra pessoa, etapa inventada e finalização alheia', async () => {
    const alheio = await product(b, 'Shampoo da B', 'shampoo')
    expect((await a.client.rpc('set_routine', { p_finalization_id: fin, p_items: [{ experiment_id: alheio, step: 'wash' }] })).error?.message).toBe('product_not_found')
    expect((await a.client.rpc('set_routine', { p_finalization_id: fin, p_items: [{ experiment_id: shampoo, step: 'perfumar' }] })).error?.message).toBe('routine_invalid')
    expect((await b.client.rpc('set_routine', { p_finalization_id: fin, p_items: [] })).error?.message).toBe('finalization_not_found')
    // A rotina da A continua a mesma.
    expect((await routineOf(a, fin)).length).toBe(3)
  })

  it('cada um só vê a própria rotina e ninguém grava direto na tabela', async () => {
    expect(await routineOf(b, fin)).toEqual([])
    const direct = await a.client.from('routine_items').insert({ finalization_id: fin, experiment_id: mascara, step: 'mask' })
    expect(direct.error?.code).toBe('42501')
  })

  it('apagar um produto tira ele das rotinas', async () => {
    const del = await a.client.from('experiments').delete().eq('id', shampoo)
    if (del.error) {
      // Sem permissão de apagar direto: usa a função do app.
      const r = await a.client.rpc('delete_experiment', { p_experiment_id: shampoo })
      expect(r.error).toBeNull()
    }
    expect((await routineOf(a, fin)).map((i) => i.experiment_id)).not.toContain(shampoo)
  })
})
