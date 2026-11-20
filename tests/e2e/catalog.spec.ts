// Novo produto pelo catálogo: buscar, filtrar (marca, Masculino), escolher e cadastrar com a
// foto pronta; e a IA casando com um item do catálogo.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { adminClient, testUser, type TestUser } from '../integration/helpers'
import { FRONT, packshotPng } from './images'

const admin = adminClient()
const tag = randomUUID().slice(0, 6).replace(/[0-9]/g, 'q')
const brandA = `e2e-crespa-${tag}`
const brandM = `e2e-barbearia-${tag}`

test.describe.configure({ mode: 'serial' })

let me: TestUser
const row = (id: string, brand_id: string, brandName: string, name: string, category: string, audience = 'unissex', popularity = 0) => ({
  id: `${id}-${tag}`,
  brand_id,
  name,
  retail_name: `${name} ${brandName}`,
  line: null,
  category,
  audience,
  hair_types: [],
  eans: [],
  sizes: [],
  image_path: `p/${id}-${tag}.webp`,
  source: 'teste',
  source_url: null,
  search_text: `${brandName} ${name} ${tag}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase(),
  popularity,
})

test.beforeAll(async () => {
  me = await testUser('catalogo-e2e')
  const b = await admin.from('catalog_brands').insert([
    { id: brandA, name: `Crespa ${tag}`, audience: 'geral', product_count: 900000 },
    { id: brandM, name: `Barbearia ${tag}`, audience: 'masculino', product_count: 800000 },
  ])
  if (b.error) throw b.error
  const items = [
    row('gelatina', brandA, `Crespa ${tag}`, 'Gelatina Super Definição', 'gelatina', 'unissex', 50),
    row('creme', brandA, `Crespa ${tag}`, 'Creme de Pentear Cachos Leves', 'creme_pentear', 'unissex', 40),
    row('pomada', brandM, `Barbearia ${tag}`, 'Pomada Efeito Matte', 'pomada', 'masculino', 30),
  ]
  for (const [i, it] of items.entries()) {
    const webp = await sharp(packshotPng(i === 2 ? 30 : 200, 40, i === 1 ? 200 : 40)).webp().toBuffer()
    const up = await admin.storage.from('catalog').upload(it.image_path, webp, { contentType: 'image/webp', upsert: true })
    if (up.error) throw up.error
  }
  const p = await admin.from('catalog_products').insert(items)
  if (p.error) throw p.error
})

test.afterAll(async () => {
  await admin.from('catalog_brands').delete().in('id', [brandA, brandM])
  await admin.storage.from('catalog').remove(['gelatina', 'creme', 'pomada'].map((x) => `p/${x}-${tag}.webp`))
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()
}

const results = (page: Page) => page.getByRole('list', { name: 'Produtos do catálogo' }).getByRole('button')

test('busca no catálogo, escolhe e cadastra com a foto pronta', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: '+ Novo produto' }).click()
  const search = page.getByRole('searchbox', { name: 'Buscar no catálogo' })
  await search.fill(`gelatna ${tag}`) // erro de digitação de propósito
  await expect(results(page)).toHaveCount(1)
  await expect(results(page).first()).toContainText('Gelatina Super Definição')
  await expect(results(page).first()).toContainText(`Crespa ${tag} · Gelatina`)

  await search.fill(`crespa ${tag}`)
  await expect(results(page)).toHaveCount(2)
  await results(page).filter({ hasText: 'Creme de Pentear Cachos Leves' }).click()

  await expect(page.getByRole('textbox', { name: 'Produto' })).toHaveValue('Creme de Pentear Cachos Leves')
  await expect(page.getByRole('combobox', { name: 'Marca' })).toHaveValue(`Crespa ${tag}`)
  await expect(page.getByRole('button', { name: 'Trocar foto do produto' }).locator('img')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Identificar pela foto' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Cadastrar produto' }).click()
  await expect(page.getByRole('heading', { name: 'Produto cadastrado' })).toBeVisible()
  const { data } = await admin.from('experiments').select('product_name, brand, photo_path, catalog_product_id').eq('user_id', me.id).single()
  expect(data).toMatchObject({ product_name: 'Creme de Pentear Cachos Leves', brand: `Crespa ${tag}`, catalog_product_id: `creme-${tag}` })
  expect(data?.photo_path).toMatch(/\.webp$/)
})

test('atalhos: Masculino e marca; o que já está no histórico aparece marcado', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: '+ Novo produto' }).click()
  await page.getByRole('button', { name: 'Masculino', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Masculino', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: `Barbearia ${tag}`, exact: true }).click()
  await expect(results(page)).toHaveCount(1)
  await expect(results(page).first()).toContainText('Pomada Efeito Matte')
  await expect(results(page).first()).toContainText('Pomada')

  await page.getByRole('button', { name: 'Masculino', exact: true }).click()
  await page.getByRole('button', { name: `Crespa ${tag}`, exact: true }).click()
  await expect(results(page)).toHaveCount(2)
  const owned = results(page).filter({ hasText: 'Creme de Pentear Cachos Leves' })
  await expect(owned).toContainText('Já está no seu histórico')
  await expect(owned).toBeDisabled()
})

test('pela foto: a IA casa com o catálogo e a foto pronta vem primeiro', async ({ page }) => {
  await page.route('**/functions/v1/identify-product', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            found: true,
            brand: `Crespa ${tag}`,
            name: 'Gelatina Super Definição',
            confidence: 'high',
            candidates: [{ image: packshotPng(10, 10, 10).toString('base64'), mime: 'image/png', source: 'loja.com.br' }],
          }),
        }),
  )
  await login(page)
  await page.getByRole('link', { name: '+ Novo produto' }).click()
  await page.getByTestId('catalog-identify-input').setInputFiles(FRONT)
  await expect(page.getByRole('textbox', { name: 'Produto' })).toHaveValue('Gelatina Super Definição')
  const first = page.getByRole('button', { name: 'Usar a foto 1, de catálogo do app' })
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Usar a foto 2, de loja.com.br' })).toBeVisible()
  await page.getByRole('button', { name: 'Cadastrar produto' }).click()
  await expect(page.getByRole('heading', { name: 'Produto cadastrado' })).toBeVisible()
  const { data } = await admin.from('experiments').select('catalog_product_id').eq('user_id', me.id).eq('product_name', 'Gelatina Super Definição').single()
  expect(data?.catalog_product_id).toBe(`gelatina-${tag}`)
})
