// Conta: os e-mails em português trazem o link #/acesso com token_hash (lido aqui no Mailpit
// local) e ele funciona para confirmar o cadastro, criar senha nova e trocar o e-mail. A função
// delete-account apaga o usuário, os dados em cascata e os arquivos, sem tocar em outra conta.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, localEnv, photoPath, testUser, tinyJpeg, type TestUser } from './helpers'

const BUCKET = 'capilar-photos'
const MAILPIT = 'http://127.0.0.1:54324'
const admin = adminClient()

interface Mail {
  subject: string
  html: string
  link: string
  tokenHash: string
  type: string
}

/** Último e-mail para o endereço (espera chegar). */
async function lastMail(to: string, subject?: RegExp): Promise<Mail> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=10`)
    const list = (await res.json()) as { messages: { ID: string; Subject: string }[] }
    const hit = list.messages.find((m) => !subject || subject.test(m.Subject))
    if (hit) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Subject: string; HTML: string }
      const href = msg.HTML.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&') ?? ''
      const query = new URLSearchParams(href.split('?')[1] ?? '')
      return { subject: msg.Subject, html: msg.HTML, link: href, tokenHash: query.get('token_hash') ?? '', type: query.get('type') ?? '' }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`nenhum e-mail para ${to}`)
}

const newEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@teste.local`

describe('e-mails da conta', () => {
  it('cadastro: pede confirmação e o link do e-mail ativa a conta', async () => {
    const email = newEmail('cadastro')
    const client = anonClient()
    const { data, error } = await client.auth.signUp({ email, password: 'senha-boa-123' })
    expect(error).toBeNull()
    expect(data.session).toBeNull() // falta confirmar

    const mail = await lastMail(email)
    expect(mail.subject).toBe('Confirme o seu e-mail no Capilário')
    expect(mail.html).toContain('Confirmar e-mail')
    expect(mail.link).toMatch(/\/#\/acesso\?token_hash=[^&]+&type=signup$/)

    const before = await client.auth.signInWithPassword({ email, password: 'senha-boa-123' })
    expect(before.error?.message).toMatch(/not confirmed/i)

    const v = await client.auth.verifyOtp({ token_hash: mail.tokenHash, type: 'signup' })
    expect(v.error).toBeNull()
    expect(v.data.session?.user.email).toBe(email)
  })

  it('esqueci a senha: o link cria a senha nova uma vez só e avisa da troca', async () => {
    const user = await testUser('esqueci')
    const client = anonClient()
    expect((await client.auth.resetPasswordForEmail(user.email)).error).toBeNull()

    const mail = await lastMail(user.email, /senha nova/)
    expect(mail.subject).toBe('Crie uma senha nova no Capilário')
    expect(mail.type).toBe('recovery')

    const v = await client.auth.verifyOtp({ token_hash: mail.tokenHash, type: 'recovery' })
    expect(v.error).toBeNull()
    expect((await client.auth.updateUser({ password: 'senha-nova-456' })).error).toBeNull()

    // O link não serve de novo.
    const again = await anonClient().auth.verifyOtp({ token_hash: mail.tokenHash, type: 'recovery' })
    expect(again.error).not.toBeNull()

    expect((await anonClient().auth.signInWithPassword({ email: user.email, password: user.password })).error).not.toBeNull()
    expect((await anonClient().auth.signInWithPassword({ email: user.email, password: 'senha-nova-456' })).error).toBeNull()

    const notice = await lastMail(user.email, /foi trocada/)
    expect(notice.subject).toBe('A sua senha do Capilário foi trocada')
  })

  it('troca de e-mail: só vale depois de confirmar nos dois endereços', async () => {
    const user = await testUser('troca')
    const next = newEmail('novo')
    expect((await user.client.auth.updateUser({ email: next })).error).toBeNull()

    const toOld = await lastMail(user.email, /troca de e-mail/)
    const toNew = await lastMail(next, /troca de e-mail/)
    expect(toOld.subject).toBe('Confirme a troca de e-mail no Capilário')
    expect(toNew.html).toContain(next)

    expect((await user.client.auth.verifyOtp({ token_hash: toOld.tokenHash, type: 'email_change' })).error).toBeNull()
    let { data } = await admin.auth.admin.getUserById(user.id)
    expect(data.user?.email).toBe(user.email) // falta o outro lado

    expect((await user.client.auth.verifyOtp({ token_hash: toNew.tokenHash, type: 'email_change' })).error).toBeNull()
    ;({ data } = await admin.auth.admin.getUserById(user.id))
    expect(data.user?.email).toBe(next)
  })
})

describe('excluir conta', () => {
  let a: TestUser
  let b: TestUser

  beforeAll(async () => {
    a = await testUser('exclui')
    b = await testUser('fica')
  })

  async function withData(user: TestUser) {
    const stageId = randomUUID()
    const photoId = randomUUID()
    const storage_path = photoPath(user.id, stageId, photoId)
    const up = await user.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
    if (up.error) throw up.error
    const thumb = `${user.id}/${stageId}/${photoId}_t.jpg`
    await user.client.storage.from(BUCKET).upload(thumb, tinyJpeg(), { contentType: 'image/jpeg' })
    const r = await user.client.rpc('finalize_stage', {
      p_experiment_id: randomUUID(),
      p_stage_id: stageId,
      p_photos: [{ id: photoId, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
      p_new_experiment: { product_mode: 'none', product_name: null },
      p_new_stage: { stage_type: 'wet', captured_at: new Date().toISOString(), notes: null },
    })
    if (r.error) throw r.error
    return [storage_path, thumb]
  }

  async function call(token: string | null) {
    const env = localEnv()
    const headers: Record<string, string> = { 'content-type': 'application/json', apikey: env.publishableKey }
    if (token) headers.authorization = `Bearer ${token}`
    return fetch(`${env.url}/functions/v1/delete-account`, { method: 'POST', headers, body: '{}' })
  }

  it('sem sessão não apaga nada', async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call('nao-e-um-token')).status).toBe(401)
  })

  it('apaga usuário, dados e arquivos de quem chama, e só dele', async () => {
    const mine = await withData(a)
    const theirs = await withData(b)
    const { data: s } = await a.client.auth.getSession()

    const res = await call(s.session!.access_token)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ deleted: true, files: 2 })

    expect((await admin.auth.admin.getUserById(a.id)).data.user).toBeNull()
    expect((await admin.from('experiments').select('id').eq('user_id', a.id)).data).toEqual([])
    expect((await admin.from('stages').select('id').eq('user_id', a.id)).data).toEqual([])
    for (const p of mine) expect((await admin.storage.from(BUCKET).exists(p)).data).toBe(false)

    // A outra conta continua inteira.
    expect((await admin.auth.admin.getUserById(b.id)).data.user?.id).toBe(b.id)
    for (const p of theirs) expect((await admin.storage.from(BUCKET).exists(p)).data).toBe(true)
    expect((await admin.from('experiments').select('id').eq('user_id', b.id)).data).toHaveLength(1)

    // A sessão antiga não entra mais.
    expect((await anonClient().auth.signInWithPassword({ email: a.email, password: a.password })).error).not.toBeNull()
  })
})
