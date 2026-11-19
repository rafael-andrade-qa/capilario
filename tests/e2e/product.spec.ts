// Histórico recolhido por produto, busca e foto do produto.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { adminClient, photoPath, testUser, tinyJpeg, type TestUser } from '../integration/helpers'
import { BACK, FRONT, LEFT } from './images'

const BUCKET = 'capilar-photos'
const admin = adminClient()

test.describe.configure({ mode: 'serial' })

let me: TestUser
const products: { id: string; name: string; brand: string }[] = []

async function seedProduct(name: string, brand: string, day: number) {
  const experimentId = randomUUID()
  const stageId = randomUUID()
  const id = randomUUID()
  const storage_path = photoPath(me.id, stageId, id)
  const up = await me.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const r = await me.client.rpc('finalize_stage', {
    p_experiment_id: experimentId,
    p_stage_id: stageId,
    p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
    p_new_experiment: { product_mode: 'named', product_name: name, brand },
    p_new_stage: { stage_type: 'dry', captured_at: `2026-11-${String(day).padStart(2, '0')}T10:00:00-03:00`, notes: null },
  })
  if (r.error) throw r.error
  products.push({ id: experimentId, name, brand })
}

test.beforeAll(async () => {
  me = await testUser('produtos-e2e')
  const names = ['Óleo Finalizador', 'Creme Leave-in', 'Mousse Volumizadora', 'Gel de Linhaça', 'Spray Texturizador', 'Creme de Pentear', 'Gelatina Supervolume']
  for (const [i, n] of names.entries()) await seedProduct(n, i % 2 ? 'Widi Care' : 'Outra Marca', i + 1)
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo registro' })).toBeVisible()
}

const toggle = (page: Page, name: string) => page.locator('.experiment', { hasText: name }).locator('.product-toggle')

test('produtos recolhidos: só o mais recente aberto, busca e abrir/fechar', async ({ page }) => {
  await login(page)
  await expect(page.locator('.experiment')).toHaveCount(7)
  await expect(page.locator('.experiment.open')).toHaveCount(1)
  await expect(toggle(page, 'Gelatina Supervolume')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.stage-row')).toHaveCount(1)

  // Abrir outro não fecha o primeiro.
  await toggle(page, 'Óleo Finalizador').click()
  await expect(page.locator('.experiment.open')).toHaveCount(2)
  await toggle(page, 'Óleo Finalizador').click()
  await expect(page.locator('.experiment.open')).toHaveCount(1)

  // Busca (aparece a partir de 6 produtos), sem diferenciar acentos.
  const search = page.getByRole('searchbox', { name: 'Buscar produto ou marca' })
  await search.fill('linhaca')
  await expect(page.locator('.experiment')).toHaveCount(1)
  await search.fill('widi')
  await expect(page.locator('.experiment')).toHaveCount(3)
  await search.fill('nada disso')
  await expect(page.getByText('Nenhum produto com “nada disso”.')).toBeVisible()
  await search.fill('')

  // Abrir, entrar numa etapa e voltar mantém o que estava aberto.
  await toggle(page, 'Creme Leave-in').click()
  await page.locator('.experiment', { hasText: 'Creme Leave-in' }).locator('.stage-row').click()
  await expect(page.getByRole('heading', { name: 'Seco' })).toBeVisible()
  await page.getByRole('link', { name: '← Histórico' }).click()
  await expect(toggle(page, 'Creme Leave-in')).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle(page, 'Gelatina Supervolume')).toHaveAttribute('aria-expanded', 'true')
})

test('foto do produto: enviar e trocar pelo produto aberto', async ({ page }) => {
  await login(page)
  const card = page.locator('.experiment', { hasText: 'Gelatina Supervolume' })
  const product = products.find((p) => p.name === 'Gelatina Supervolume')!
  await card.getByRole('button', { name: '+ Foto do produto' }).click()
  await page.getByTestId(`product-photo-${product.id}`).setInputFiles([FRONT])
  await expect(card.getByRole('button', { name: 'Trocar foto do produto' })).toBeVisible()
  await expect(card.locator('.product-thumb img')).toHaveAttribute('src', new RegExp(`produto-${product.id}`))

  const first = (await admin.from('experiments').select('photo_path').eq('id', product.id).single()).data!.photo_path as string
  await page.getByTestId(`product-photo-${product.id}`).setInputFiles([LEFT])
  await expect
    .poll(async () => (await admin.from('experiments').select('photo_path').eq('id', product.id).single()).data!.photo_path)
    .not.toBe(first)
  // A foto anterior foi apagada.
  await expect.poll(async () => (await admin.storage.from(BUCKET).exists(first)).data).toBe(false)
})

test('novo registro com foto do produto, em dois passos', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: '+ Novo registro' }).click()
  await page.locator('label.seg', { hasText: 'Molhado' }).click()
  await page.getByRole('combobox', { name: 'Produto', exact: true }).fill('Máscara Nova')
  await page.getByRole('combobox', { name: 'Marca', exact: true }).fill('Marca Nova')
  await page.getByTestId('product-photo-input').setInputFiles([BACK])
  await expect(page.locator('.product-photo-pick img')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByTestId('gallery-input').setInputFiles([FRONT])
  await expect(page.getByText('Verificando…')).toHaveCount(0)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.waitForURL(/salvo=/)

  const card = page.locator('.experiment', { hasText: 'Máscara Nova' })
  await expect(card).toHaveClass(/open/)
  await expect(card.locator('.product-thumb img')).toHaveAttribute('src', /produto-/)
  const { data } = await admin.from('experiments').select('photo_path, brand').eq('product_name', 'Máscara Nova').eq('user_id', me.id).single()
  expect(data!.brand).toBe('Marca Nova')
  expect(data!.photo_path).toMatch(/\/produto-/)
})
