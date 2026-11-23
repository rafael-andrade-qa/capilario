// Carregamento: o histórico guardado no aparelho aparece na hora ao reabrir; sem nada guardado,
// esqueleto no formato da lista; sair da conta apaga o que estava guardado.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { testUser, type TestUser } from '../integration/helpers'

// Estes testes usam a lista de produtos: o início abre na aba Produtos.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('capilar:inicio:aba', 'produtos'))
})

let me: TestUser

test.beforeAll(async () => {
  me = await testUser('carregamento-e2e')
  const r = await me.client.rpc('create_product', { p_experiment_id: randomUUID(), p_name: 'Creme Guardado', p_brand: 'Marca G' })
  if (r.error) throw r.error
})

/** Atrasa a busca do histórico (simula internet lenta). */
async function slowHistory(page: Page, ms: number) {
  await page.route('**/rest/v1/experiments**', async (route) => {
    await new Promise((r) => setTimeout(r, ms))
    await route.continue()
  })
}

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test('sem nada guardado: esqueleto da lista; ao reabrir: o histórico aparece na hora', async ({ page }) => {
  await slowHistory(page, 2500)
  await login(page)
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Carregando histórico…' })).toBeVisible()
  await expect(page.locator('.sk-history .sk-row')).toHaveCount(4)
  await expect(page.getByText('Creme Guardado')).toBeVisible({ timeout: 10_000 })

  // Reabrir com a internet ainda lenta: o produto aparece antes da resposta chegar.
  await page.reload()
  await expect(page.getByText('Creme Guardado')).toBeVisible({ timeout: 1500 })
  await expect(page.locator('.sk-history')).toHaveCount(0)
})

test('sair da conta apaga o histórico guardado no aparelho', async ({ page }) => {
  await login(page)
  await expect(page.getByText('Creme Guardado')).toBeVisible()
  const keys = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('capilar:historico:')))
  await expect.poll(keys).toHaveLength(1)
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('menuitem', { name: 'Sair' }).click()
  await expect(page.getByLabel('E-mail')).toBeVisible()
  expect(await keys()).toHaveLength(0)
})
