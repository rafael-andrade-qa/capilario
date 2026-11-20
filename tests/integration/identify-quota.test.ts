// Limite diário de "Identificar pela foto": 20 por pessoa por dia; a tabela não é acessível direto.
import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, testUser, type TestUser } from './helpers'

describe('limite de identificações', () => {
  let a: TestUser
  let b: TestUser
  beforeAll(async () => {
    a = await testUser('identificar-a')
    b = await testUser('identificar-b')
  })

  it('conta para baixo e recusa a 21ª do dia', async () => {
    for (let i = 1; i <= 20; i++) {
      const r = await a.client.rpc('consume_identify_quota')
      expect(r.error).toBeNull()
      expect(r.data).toBe(20 - i)
    }
    const over = await a.client.rpc('consume_identify_quota')
    expect(over.error?.message).toBe('identify_limit')
  })

  it('o limite é por pessoa', async () => {
    const r = await b.client.rpc('consume_identify_quota')
    expect(r.error).toBeNull()
    expect(r.data).toBe(19)
  })

  it('ninguém lê nem zera o contador pela API', async () => {
    const read = await a.client.from('identify_usage').select('*')
    expect(read.error?.code).toBe('42501')
    const reset = await a.client.from('identify_usage').update({ count: 0 }).eq('user_id', a.id)
    expect(reset.error?.code).toBe('42501')
  })

  it('sem login não consome', async () => {
    const r = await anonClient().rpc('consume_identify_quota')
    expect(r.error).not.toBeNull()
  })
})
