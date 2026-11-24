// Conta no navegador: esqueci a senha (com o link real do e-mail, lido no Mailpit local), link
// inválido, Minha conta (trocar senha, sair) e excluir conta. O cadastro está fechado no build.
import { expect, test, type Page } from '@playwright/test'
import { adminClient, testUser, type TestUser } from '../integration/helpers'

const MAILPIT = 'http://127.0.0.1:54324'
const admin = adminClient()

test.describe.configure({ mode: 'serial' })

/** Token do último e-mail para o endereço (o link aponta para #/acesso). */
async function mailLink(to: string, subject: RegExp): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=10`)).json()) as { messages: { ID: string; Subject: string }[] }
    const hit = list.messages.find((m) => subject.test(m.Subject))
    if (hit) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { HTML: string }
      const href = (msg.HTML.match(/href="([^"]+)"/)?.[1] ?? '').replace(/&amp;/g, '&')
      return href.slice(href.indexOf('#'))
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`nenhum e-mail para ${to}`)
}

async function login(page: Page, email: string, password: string) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
}

test('esqueci a senha: o link do e-mail abre a tela da senha nova e depois o diário', async ({ page }) => {
  const user = await testUser('esqueci-e2e')
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Criar conta' })).toHaveCount(0) // cadastro fechado
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click()
  await expect(page.getByRole('heading', { name: 'Recuperar a senha' })).toBeVisible()
  await expect(page.getByLabel('Senha')).toHaveCount(0)
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByRole('button', { name: 'Enviar link' }).click()
  await expect(page.getByRole('status')).toContainText(`Se houver uma conta com ${user.email}`)

  const link = await mailLink(user.email, /senha nova/)
  expect(link).toMatch(/^#\/acesso\?token_hash=.+&type=recovery$/)
  await page.goto(`./${link}`)
  await expect(page.getByRole('heading', { name: 'Crie uma senha nova' })).toBeVisible()
  await page.getByLabel('Senha nova', { exact: true }).fill('curta')
  await page.getByLabel('Repita a senha nova').fill('curta')
  await page.getByRole('button', { name: 'Salvar senha nova' }).click()
  await expect(page.getByRole('alert')).toHaveText('A senha precisa ter pelo menos 8 caracteres.')
  await page.getByLabel('Senha nova', { exact: true }).fill('senha-nova-e2e')
  await page.getByLabel('Repita a senha nova').fill('senha-nova-e2e')
  await page.getByRole('button', { name: 'Salvar senha nova' }).click()
  await expect(page.getByText('Senha nova salva.')).toBeVisible()
  await page.getByRole('button', { name: 'Abrir o diário' }).click()
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()

  // O mesmo link não vale de novo.
  await page.goto(`./${link}`)
  await expect(page.getByRole('alert')).toHaveText('Esse link expirou ou já foi usado. Peça um novo.')
})

test('link no formato padrão do Supabase (#access_token=…) também cria a senha nova', async ({ page }) => {
  const user = await testUser('padrao-e2e')
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: user.email })
  if (error) throw error
  const res = await fetch(data.properties.action_link, { redirect: 'manual' })
  const location = res.headers.get('location') ?? ''
  expect(location).toContain('#access_token=')
  await page.goto(`./${location.slice(location.indexOf('#'))}`)
  await expect(page.getByRole('heading', { name: 'Crie uma senha nova' })).toBeVisible()
  await page.getByLabel('Senha nova', { exact: true }).fill('senha-padrao-123')
  await page.getByLabel('Repita a senha nova').fill('senha-padrao-123')
  await page.getByRole('button', { name: 'Salvar senha nova' }).click()
  await expect(page.getByText('Senha nova salva.')).toBeVisible()
  await page.getByRole('button', { name: 'Abrir o diário' }).click()
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
  expect(page.url()).not.toContain('access_token') // os tokens saem do endereço

  await page.goto('./#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await expect(page.getByRole('alert')).toHaveText('Esse link expirou ou já foi usado. Peça um novo.')
})

test('link incompleto avisa e volta para a entrada', async ({ page }) => {
  await page.goto('./#/acesso?type=recovery')
  await expect(page.getByRole('alert')).toHaveText('Esse link está incompleto. Abra de novo o link do e-mail.')
  await page.getByRole('button', { name: 'Ir para a entrada' }).click()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
})

test('Minha conta: troca a senha conferindo a atual e sai', async ({ page }) => {
  const user: TestUser = await testUser('conta-e2e')
  await login(page, user.email, user.password)
  await page.getByRole('link', { name: 'Minha conta' }).click()
  await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible()
  await expect(page.getByText(user.email)).toBeVisible()

  await page.getByRole('button', { name: 'Trocar' }).nth(1).click()
  await page.getByLabel('Senha atual').fill('errada-123')
  await page.getByLabel('Senha nova', { exact: true }).fill('outra-senha-1')
  await page.getByLabel('Repita a senha nova').fill('outra-senha-1')
  await page.getByRole('button', { name: 'Salvar senha' }).click()
  await expect(page.getByRole('alert')).toHaveText('A senha atual está errada.')

  await page.getByLabel('Senha atual').fill(user.password)
  await page.getByRole('button', { name: 'Salvar senha' }).click()
  await expect(page.getByText('Senha alterada.')).toBeVisible()
  await expect(page.getByLabel('Senha atual')).toHaveCount(0)

  await page.getByRole('button', { name: 'Sair da conta' }).click()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  await login(page, user.email, 'outra-senha-1')
})

test('excluir conta: pede a senha, apaga tudo e volta para a entrada', async ({ page }) => {
  const user = await testUser('exclui-e2e')
  await login(page, user.email, user.password)
  await page.goto('./#/conta')
  await page.getByRole('button', { name: 'Excluir minha conta' }).click()
  await expect(page.getByText('Não dá para desfazer.')).toBeVisible()

  await page.getByLabel('Confirme com a sua senha').fill('senha-errada')
  await page.getByRole('button', { name: 'Excluir para sempre' }).click()
  await expect(page.getByRole('alert')).toHaveText('A senha está errada.')
  expect((await admin.auth.admin.getUserById(user.id)).data.user?.id).toBe(user.id)

  await page.getByLabel('Confirme com a sua senha').fill(user.password)
  await page.getByRole('button', { name: 'Excluir para sempre' }).click()
  await expect(page.getByText('Conta excluída. Todos os seus dados foram apagados.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  expect((await admin.auth.admin.getUserById(user.id)).data.user).toBeNull()
})
