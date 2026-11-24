// Novo produto pelo catálogo: buscar, filtrar (marca, Masculino), escolher e cadastrar com a
// foto pronta; e a IA casando com um item do catálogo.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { adminClient, testUser, type TestUser } from '../integration/helpers'
import { FRONT, packshotPng } from './images'

/** "+ Novo produto": na aba Produtos (no início vazio, o link do cartão). */
async function newProduct(page: Page) {
  const tab = page.getByRole('tab', { name: 'Produtos' })
  await expect(tab.or(page.getByRole('link', { name: 'Novo produto' })).first()).toBeVisible()
  if (await tab.count()) await tab.click()
  await page.getByRole('link', { name: 'Novo produto' }).click()
}

// Estes testes usam a lista de produtos: o início abre na aba Produtos.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('capilar:inicio:aba', 'produtos'))
})

const admin = adminClient()
const tag = randomUUID().slice(0, 6).replace(/[0-9]/g, 'q')
const brandA = `e2e-crespa-${tag}`
const brandM = `e2e-barbearia-${tag}`
const brandP = `e2e-paginas-${tag}`

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
    { id: brandP, name: `Paginas ${tag}`, audience: 'geral', product_count: 25 },
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
  // 25 produtos de uma marca, sem foto, para testar as páginas (nomes longos: 2 linhas).
  const many = Array.from({ length: 25 }, (_, i) => ({
    ...row(`p${i}`, brandP, `Paginas ${tag}`, `Shampoo Numero ${String(i + 1).padStart(2, '0')} Hidratação Profunda com Óleo de Argan e Queratina`, 'shampoo', 'unissex', 100 - i),
    image_path: null,
  }))
  const m = await admin.from('catalog_products').insert(many)
  if (m.error) throw m.error
})

test.afterAll(async () => {
  await admin.from('catalog_brands').delete().in('id', [brandA, brandM, brandP])
  await admin.storage.from('catalog').remove(['gelatina', 'creme', 'pomada'].map((x) => `p/${x}-${tag}.webp`))
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
}

const results = (page: Page) => page.getByRole('list', { name: 'Produtos do catálogo' }).getByRole('button')

test('busca no catálogo, escolhe e cadastra com a foto pronta', async ({ page }) => {
  await login(page)
  await newProduct(page)
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
  // O tipo vem do catálogo, com a linha do que ele faz.
  await expect(page.getByRole('combobox', { name: 'Tipo' })).toHaveValue('creme_pentear')
  await expect(page.getByTestId('type-hint')).toHaveText('Hidrata, desembaraça e começa a formar o cacho.')

  await page.getByRole('button', { name: 'Cadastrar produto' }).click()
  await expect(page.getByRole('heading', { name: 'Produto cadastrado' })).toBeVisible()
  const { data } = await admin.from('experiments').select('product_name, brand, photo_path, catalog_product_id, category').eq('user_id', me.id).single()
  expect(data).toMatchObject({ product_name: 'Creme de Pentear Cachos Leves', brand: `Crespa ${tag}`, catalog_product_id: `creme-${tag}`, category: 'creme_pentear' })
  expect(data?.photo_path).toMatch(/\.webp$/)
})

async function chooseBrand(page: Page, name: string) {
  await page.getByRole('button', { name: /Filtrar por marca|Trocar marca/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Escolher marca' })
  await sheet.getByRole('searchbox', { name: 'Buscar marca' }).fill(name)
  await sheet.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await expect(sheet).toHaveCount(0)
}

test('filtro de marca (lista com busca); o que já está no histórico aparece marcado', async ({ page }) => {
  await login(page)
  await newProduct(page)
  // Só marca: nada de "Masculino" misturado. "Todos" começa marcado.
  await expect(page.getByText('Masculino', { exact: true })).toHaveCount(0)
  const todos = page.getByRole('button', { name: 'Todos', exact: true })
  await expect(todos).toHaveAttribute('aria-pressed', 'true')
  await chooseBrand(page, `Barbearia ${tag}`)
  await expect(page.getByRole('button', { name: `Marca: Barbearia ${tag}. Trocar marca` })).toBeVisible()
  await expect(todos).toHaveAttribute('aria-pressed', 'false')
  await expect(results(page)).toHaveCount(1)
  await expect(results(page).first()).toContainText('Pomada Efeito Matte')

  await page.getByRole('button', { name: 'Limpar marca' }).click()
  await expect(todos).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Filtrar por marca' })).toContainText('Marca')
  await chooseBrand(page, `Crespa ${tag}`)
  await expect(results(page)).toHaveCount(2)
  const owned = results(page).filter({ hasText: 'Creme de Pentear Cachos Leves' })
  await expect(owned).toContainText('Já está no seu histórico')
  await expect(owned).toBeDisabled()
})

for (const size of [
  { width: 390, height: 664 }, // iPhone com a barra do Safari
  { width: 412, height: 839 }, // Android maior / app instalado
]) {
  test(`página cabe na tela sem rolar (${size.width}x${size.height}), com Anterior e Próxima`, async ({ page }) => {
    await page.setViewportSize(size)
    await login(page)
    await newProduct(page)
    await chooseBrand(page, `Paginas ${tag}`)
    await expect(page.getByRole('button', { name: 'Próxima ›' })).toBeEnabled()
    const n = await results(page).count()
    expect(n).toBeGreaterThanOrEqual(3)
    // Nada para rolar: a lista, a paginação e o rodapé cabem na altura da tela.
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    // E não sobra espaço para mais uma linha (77 px).
    const gap = await page.evaluate(() => {
      const pager = document.querySelector('.pager')!.getBoundingClientRect()
      const bar = document.querySelector('.save-bar')!.getBoundingClientRect()
      return bar.top - pager.bottom - parseFloat(getComputedStyle(document.querySelector('.pager')!).marginBottom)
    })
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThan(77)

    await expect(results(page).first()).toContainText('Shampoo Numero 01')
    await page.getByRole('button', { name: 'Próxima ›' }).click()
    await expect(page.getByText('Página 2', { exact: true })).toBeVisible()
    await expect(results(page).first()).toContainText(`Shampoo Numero ${String(n + 1).padStart(2, '0')}`)
    await page.getByRole('button', { name: '‹ Anterior' }).click()
    await expect(results(page)).toHaveCount(n)
  })
}

test('pela foto: a função acha no catálogo e a foto pronta vem primeiro', async ({ page }) => {
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
            // A função achou no catálogo (a foto pronta vem dele) e ainda trouxe uma de loja.
            catalog: { id: `gelatina-${tag}`, name: 'Gelatina Super Definição', brand: `Crespa ${tag}`, image_path: `p/gelatina-${tag}.webp` },
            candidates: [{ image: packshotPng(10, 10, 10).toString('base64'), mime: 'image/png', source: 'loja.com.br' }],
          }),
        }),
  )
  await login(page)
  await newProduct(page)
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
