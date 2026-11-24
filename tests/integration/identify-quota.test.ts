// Limite de "Identificar pela foto" por plano: Grátis 3 por semana (segunda a domingo), Pro 10 por
// dia. A tabela não é acessível direto.
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, brDay, setPlan, testUser, type TestUser } from './helpers'

/** Segunda-feira desta semana e o domingo antes dela, em Brasília. */
function lastSunday(): string {
  const today = new Date(brDay() + 'T12:00:00Z')
  const back = (today.getUTCDay() + 6) % 7 // dias desde a segunda
  return brDay(-back - 1)
}

describe('limite de identificações', () => {
  let free: TestUser
  let pro: TestUser
  let other: TestUser
  const admin = adminClient()
  beforeAll(async () => {
    free = await testUser('identificar-gratis')
    pro = await testUser('identificar-pro')
    other = await testUser('identificar-outra')
    await setPlan(pro.id, 'pro')
  })

  it('Grátis: 3 por semana; a semana passada não conta', async () => {
    const last = await admin.from('identify_usage').insert({ user_id: free.id, day: lastSunday(), count: 3 })
    if (last.error) throw last.error
    for (let i = 1; i <= 3; i++) {
      const r = await free.client.rpc('consume_identify_quota')
      expect(r.error).toBeNull()
      expect(r.data).toBe(3 - i)
    }
    expect((await free.client.rpc('consume_identify_quota')).error?.message).toBe('identify_limit')
  })

  it('Pro: 10 por dia; ontem não conta', async () => {
    const y = await admin.from('identify_usage').insert({ user_id: pro.id, day: brDay(-1), count: 10 })
    if (y.error) throw y.error
    for (let i = 1; i <= 10; i++) {
      const r = await pro.client.rpc('consume_identify_quota')
      expect(r.error).toBeNull()
      expect(r.data).toBe(10 - i)
    }
    expect((await pro.client.rpc('consume_identify_quota')).error?.message).toBe('identify_limit')
  })

  it('o limite é por pessoa', async () => {
    const r = await other.client.rpc('consume_identify_quota')
    expect(r.error).toBeNull()
    expect(r.data).toBe(2)
  })

  it('ninguém lê nem zera o contador pela API', async () => {
    const read = await free.client.from('identify_usage').select('*')
    expect(read.error?.code).toBe('42501')
    const reset = await free.client.from('identify_usage').update({ count: 0 }).eq('user_id', free.id)
    expect(reset.error?.code).toBe('42501')
  })

  it('sem login não consome', async () => {
    const r = await anonClient().rpc('consume_identify_quota')
    expect(r.error).not.toBeNull()
  })
})
