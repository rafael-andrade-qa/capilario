// Identificar pela foto (Novo produto). A função identify-product é simulada aqui: a IA de
// verdade só roda na nuvem, com a chave guardada no Supabase.
import { expect, test, type Page, type Route } from '@playwright/test'
import { adminClient, testUser, type TestUser } from '../integration/helpers'
import { FRONT, packshotPng } from './images'

// Estes testes usam a lista de produtos: o início abre na aba Produtos.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('capilar:inicio:aba', 'produtos'))
})

const BUCKET = 'capilar-photos'
const admin = adminClient()

test.describe.configure({ mode: 'serial' })

let me: TestUser
test.beforeAll(async () => {
  me = await testUser('identificar-e2e')
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
}

function mockIdentify(page: Page, reply: (route: Route) => Promise<void>) {
  const bodies: { auth: string | null; body: { image?: string; mime?: string } }[] = []
  void page.route('**/functions/v1/identify-product', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
    bodies.push({ auth: route.request().headers()['authorization'] ?? null, body: route.request().postDataJSON() })
    await reply(route)
  })
  return bodies
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })

/** Largura e altura de um JPEG (marcador SOF). */
function jpegSize(b: Buffer): { w: number; h: number } | null {
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    const len = b.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null
}

test('identifica pela foto: preenche nome e marca e usa a foto oficial padronizada', async ({ page }) => {
  const calls = mockIdentify(page, (route) =>
    json(route, 200, {
      found: true,
      brand: 'Salon Line',
      name: 'Todecacho Gelatina Super Definição',
      confidence: 'high',
      candidates: [
        { image: packshotPng(200, 40, 40).toString('base64'), mime: 'image/png', source: 'salonline.com.br' },
        { image: packshotPng(40, 80, 200).toString('base64'), mime: 'image/png', source: 'loja.com.br' },
      ],
    }),
  )
  await login(page)
  await page.getByRole('link', { name: '+ Novo produto' }).click()
  await page.getByRole('button', { name: 'Cadastrar à mão' }).click()
  await page.getByTestId('identify-input').setInputFiles(FRONT)

  await expect(page.getByRole('textbox', { name: 'Produto' })).toHaveValue('Todecacho Gelatina Super Definição')
  await expect(page.getByRole('combobox', { name: 'Marca' })).toHaveValue('Salon Line')
  await expect(page.getByText('Produto identificado. Confira e cadastre.')).toBeVisible()
  expect(calls).toHaveLength(1)
  expect(calls[0].auth).toMatch(/^Bearer /)
  expect(calls[0].body.mime).toBe('image/jpeg')
  expect(calls[0].body.image?.startsWith('/9j/')).toBe(true) // JPEG reduzido no celular

  const first = page.getByRole('button', { name: 'Usar a foto 1, de salonline.com.br' })
  const second = page.getByRole('button', { name: 'Usar a foto 2, de loja.com.br' })
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await second.click()
  await expect(second).toHaveAttribute('aria-pressed', 'true')
  await expect(first).toHaveAttribute('aria-pressed', 'false')

  await page.getByRole('button', { name: 'Cadastrar produto' }).click()
  await expect(page.getByRole('heading', { name: 'Produto cadastrado' })).toBeVisible()

  const { data } = await admin.from('experiments').select('product_name, brand, photo_path').eq('user_id', me.id).single()
  expect(data?.product_name).toBe('Todecacho Gelatina Super Definição')
  expect(data?.brand).toBe('Salon Line')
  expect(data?.photo_path).toBeTruthy()
  const file = await admin.storage.from(BUCKET).download(data!.photo_path!)
  const bytes = Buffer.from(await file.data!.arrayBuffer())
  expect(jpegSize(bytes)).toEqual({ w: 900, h: 1200 }) // retrato 3:4, fundo branco
})

test('limite do dia: avisa e deixa preencher à mão', async ({ page }) => {
  mockIdentify(page, (route) => json(route, 429, { error: 'identify_limit' }))
  await login(page)
  await page.getByRole('link', { name: '+ Novo produto' }).click()
  await page.getByRole('button', { name: 'Cadastrar à mão' }).click()
  await page.getByTestId('identify-input').setInputFiles(FRONT)
  await expect(page.getByText('Você já usou as 20 identificações de hoje.', { exact: false })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Produto' })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Produto' })).toBeEnabled()
})

test('não reconheceu: avisa; achou sem foto: preenche e mantém o quadrado da foto', async ({ page }) => {
  let n = 0
  mockIdentify(page, (route) =>
    n++ === 0
      ? json(route, 200, { found: false })
      : json(route, 200, { found: true, brand: 'Widi Care', name: 'Juba Encaracolando', confidence: 'medium', candidates: [] }),
  )
  await login(page)
  await page.getByRole('link', { name: '+ Novo produto' }).click()
  await page.getByRole('button', { name: 'Cadastrar à mão' }).click()
  await page.getByTestId('identify-input').setInputFiles(FRONT)
  await expect(page.getByText('Não reconheci um produto de cabelo nessa foto.', { exact: false })).toBeVisible()

  await page.getByTestId('identify-input').setInputFiles(FRONT)
  await expect(page.getByRole('textbox', { name: 'Produto' })).toHaveValue('Juba Encaracolando')
  await expect(page.getByText('Confira o nome e a marca', { exact: false })).toBeVisible()
  await expect(page.getByText('Achei o produto, mas não a foto oficial.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Adicionar foto do produto' })).toBeVisible()
})
