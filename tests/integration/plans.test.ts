// Planos: toda conta começa Grátis; my_plan() mostra limites, uso e quando renova; ninguém se dá Pro
// pela API; Pro vencido volta ao Grátis.
import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, brDay, setPlan, testUser, type TestUser } from './helpers'

interface Plan {
  plan: 'free' | 'pro'
  pro_until: string | null
  analyses: { limit: number; period: string; used: number; renews_on: string }
  identify: { limit: number; period: string; used: number; renews_on: string }
  photos: { limit: number; used: number }
}
const myPlan = async (u: TestUser) => {
  const { data, error } = await u.client.rpc('my_plan')
  if (error) throw error
  return data as Plan
}

describe('planos', () => {
  let free: TestUser
  let pro: TestUser
  beforeAll(async () => {
    free = await testUser('plano-gratis')
    pro = await testUser('plano-pro')
    await setPlan(pro.id, 'pro')
  })

  it('conta nova é Grátis, com os limites e as datas de renovação', async () => {
    const p = await myPlan(free)
    expect(p.plan).toBe('free')
    expect(p.analyses).toMatchObject({ limit: 1, period: 'month', used: 0 })
    expect(p.identify).toMatchObject({ limit: 3, period: 'week', used: 0 })
    expect(p.photos).toEqual({ limit: 300, used: 0 })
    const today = brDay()
    expect(p.analyses.renews_on).toBe(`${nextMonth(today)}-01`)
    expect(new Date(p.identify.renews_on + 'T12:00:00Z').getUTCDay()).toBe(1) // segunda-feira
    expect(p.identify.renews_on > today).toBe(true)
  })

  it('o uso aparece no plano', async () => {
    await free.client.rpc('consume_identify_quota')
    expect((await myPlan(free)).identify.used).toBe(1)
  })

  it('Pro: limites do Pro; vencido volta ao Grátis', async () => {
    const p = await myPlan(pro)
    expect(p.plan).toBe('pro')
    expect(p.pro_until).toBeNull()
    expect(p.analyses).toMatchObject({ limit: 1, period: 'day', renews_on: brDay(1) })
    expect(p.identify).toMatchObject({ limit: 10, period: 'day' })
    expect(p.photos.limit).toBe(1000)
    await setPlan(pro.id, 'pro', '2020-01-01T00:00:00Z')
    expect((await myPlan(pro)).plan).toBe('free')
    await setPlan(pro.id, 'pro', '2999-01-01T00:00:00Z')
    expect((await myPlan(pro)).plan).toBe('pro')
  })

  it('ninguém lê nem se dá Pro pela API', async () => {
    expect((await free.client.from('subscriptions').select('*')).error?.code).toBe('42501')
    const grant = await free.client.from('subscriptions').insert({ user_id: free.id, plan: 'pro' })
    expect(grant.error?.code).toBe('42501')
    expect((await free.client.rpc('plan_of', { p_uid: free.id })).error).not.toBeNull()
    expect((await myPlan(free)).plan).toBe('free')
  })

  it('sem login não tem plano', async () => {
    expect((await anonClient().rpc('my_plan')).error).not.toBeNull()
  })
})

function nextMonth(day: string): string {
  const [y, m] = day.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
