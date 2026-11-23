// Tipo do produto: a linha "Geleia · ..." no produto aberto, a explicação, o guia e o campo Tipo.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { adminClient, testUser, type TestUser } from '../integration/helpers'

const admin = adminClient()
test.describe.configure({ mode: 'serial' })

let me: TestUser
const ids: Record<string, string> = {}

test.beforeAll(async () => {
  me = await testUser('guia-e2e')
  for (const [name, category] of [
    ['Geleia Seladora', 'geleia'],
    ['Creme Misterioso', null],
  ] as const) {
    const id = randomUUID()
    const r = await me.client.rpc('create_product', { p_experiment_id: id, p_name: name, p_brand: 'Widi Care', p_category: category })
    if (r.error) throw r.error
    ids[name] = id
  }
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()
}

const card = (page: Page, name: string) => page.locator('.experiment', { hasText: name })

test('produto aberto diz o que ele é; a explicação e o guia completo', async ({ page }) => {
  await login(page)
  await card(page, 'Geleia Seladora').locator('.product-toggle').click()
  const about = card(page, 'Geleia Seladora').getByRole('button', { name: 'O que é geleia' })
  await expect(about).toContainText('Geleia')
  await expect(about).toContainText('Define e controla o frizz, com fixação média.')

  await about.click()
  const sheet = page.getByRole('dialog', { name: 'Geleia' })
  await expect(sheet).toContainText('O que é')
  await expect(sheet).toContainText('Como usar')
  await expect(sheet).toContainText('Combina com')
  await expect(sheet).toContainText('Etapa: Fixar.')
  await sheet.getByRole('link', { name: 'Ver todos os tipos' }).click()

  await expect(page.getByRole('heading', { name: 'Tipos de produto' })).toBeVisible()
  const route = page.getByRole('list', { name: 'Ordem da rotina' }).getByRole('listitem')
  await expect(route.first()).toHaveText('Lavar')
  await expect(route).toHaveCount(9)
  const hold = page.getByRole('region', { name: 'Fixar' })
  await expect(hold.locator('summary')).toHaveCount(4)
  await hold.locator('summary', { hasText: 'Mousse' }).click()
  await expect(hold).toContainText('Agite, faça uma bola de espuma')
  await expect(page.getByText('O cabelo só lavado, para comparar.')).toBeVisible()
})

test('sem tipo: convida a escolher; o campo Tipo explica e grava', async ({ page }) => {
  await login(page)
  await card(page, 'Creme Misterioso').locator('.product-toggle').click()
  await card(page, 'Creme Misterioso').getByRole('link', { name: /Que tipo de produto é este\?/ }).click()

  await expect(page.getByRole('heading', { name: 'Editar produto' })).toBeVisible()
  const type = page.getByRole('combobox', { name: 'Tipo' })
  await expect(type).toHaveValue('')
  await type.selectOption('creme_pentear')
  await expect(page.getByTestId('type-hint')).toHaveText('Hidrata, desembaraça e começa a formar o cacho.')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Produto atualizado.')).toBeVisible()
  await expect.poll(async () => (await admin.from('experiments').select('category').eq('id', ids['Creme Misterioso']).single()).data?.category).toBe('creme_pentear')

  // Depois de salvar, o produto editado já volta aberto.
  const toggle = card(page, 'Creme Misterioso').locator('.product-toggle')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await expect(card(page, 'Creme Misterioso').getByRole('button', { name: 'O que é creme de pentear' })).toBeVisible()
})

test('Sem finalizador explica que é a referência', async ({ page }) => {
  await login(page)
  await page.locator('.experiment.fixed-product .product-toggle').click()
  await page.getByRole('button', { name: 'O que é Sem finalizador' }).click()
  const sheet = page.getByRole('dialog', { name: 'Sem finalizador' })
  await expect(sheet).toContainText('É a referência')
  await sheet.getByRole('button', { name: 'Entendi' }).click()
  await expect(sheet).toHaveCount(0)
})
