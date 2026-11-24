// Tipo do produto: a linha "Geleia · ..." no produto aberto, a explicação, o guia e o campo Tipo.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { adminClient, testUser, type TestUser } from '../integration/helpers'

// Estes testes usam a lista de produtos: o início abre na aba Produtos.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('capilar:inicio:aba', 'produtos'))
})

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
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
}

/** Abre a tela do produto pela prateleira (aba Produtos). */
async function openProduct(page: Page, name: string) {
  await page.locator('.shelf-row', { hasText: name }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

test('a tela do produto mostra o tipo; a explicação e o guia por etapa', async ({ page }) => {
  await login(page)
  await openProduct(page, 'Geleia Seladora')
  const about = page.getByRole('button', { name: 'O que é geleia' })
  await expect(about).toHaveText('Geleia')

  await about.click()
  const sheet = page.getByRole('dialog', { name: 'Geleia' })
  await expect(sheet).toContainText('Etapa: Fixar')
  await expect(sheet).toContainText('O que é')
  await expect(sheet).toContainText('Como usar')
  await expect(sheet).toContainText('Combina com')
  await sheet.getByRole('link', { name: 'Ver todos os tipos' }).click()

  // Abre direto na etapa do produto, só com os tipos dela.
  await expect(page.getByRole('heading', { name: 'Tipos de produto' })).toBeVisible()
  const tabs = page.getByRole('tablist', { name: 'Etapas da rotina' }).getByRole('tab')
  await expect(tabs).toHaveCount(7)
  await expect(tabs.first()).toHaveText('1Lavar')
  await expect(page.getByRole('tab', { name: /Fixar/ })).toHaveAttribute('aria-selected', 'true')
  const panel = page.getByRole('tabpanel')
  await expect(panel.locator('.guide-row')).toHaveCount(4)
  await panel.getByRole('button', { name: /Mousse/ }).click()
  const mousse = page.getByRole('dialog', { name: 'Mousse' })
  await expect(mousse).toContainText('Agite, faça uma bola de espuma')
  await expect(mousse.getByRole('link', { name: 'Ver todos os tipos' })).toHaveCount(0)
  await mousse.getByRole('button', { name: 'Entendi' }).click()

  await page.getByRole('tab', { name: /Lavar/ }).click()
  await expect(panel.getByRole('button', { name: /Shampoo/ }).first()).toBeVisible()
  await page.getByRole('button', { name: /Próxima etapa: Condicionar/ }).click()
  await expect(page.getByRole('tab', { name: /Condicionar/ })).toHaveAttribute('aria-selected', 'true')
})

test('sem tipo: convida a escolher; o campo Tipo explica e grava', async ({ page }) => {
  await login(page)
  await openProduct(page, 'Creme Misterioso')
  await page.getByRole('link', { name: 'Escolher o tipo do produto' }).click()

  await expect(page.getByRole('heading', { name: 'Editar produto' })).toBeVisible()
  const type = page.getByRole('combobox', { name: 'Tipo' })
  await expect(type).toHaveValue('')
  await type.selectOption('creme_pentear')
  await expect(page.getByTestId('type-hint')).toHaveText('Hidrata, desembaraça e começa a formar o cacho.')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Produto atualizado.')).toBeVisible()
  await expect.poll(async () => (await admin.from('experiments').select('category').eq('id', ids['Creme Misterioso']).single()).data?.category).toBe('creme_pentear')

  // A tela do produto já mostra o tipo escolhido.
  await openProduct(page, 'Creme Misterioso')
  await expect(page.getByRole('button', { name: 'O que é creme de pentear' })).toBeVisible()
})
