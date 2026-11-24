// Horário pela foto (EXIF), corrigir o horário do momento e enquadramento (automático e à mão).
// As imagens são sintéticas, sem rosto: o enquadramento automático cai no "preencher".
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { adminClient, testUser, type TestUser } from '../integration/helpers'
import { jpegWithDate } from './images'

// Estes testes usam a lista de produtos: o início abre na aba Produtos.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('capilar:inicio:aba', 'produtos'))
})

const admin = adminClient()
test.describe.configure({ mode: 'serial' })

let me: TestUser
let productId: string
let stageId: string

test.beforeAll(async () => {
  me = await testUser('enquadramento-e2e')
  productId = randomUUID()
  const r = await me.client.rpc('create_product', { p_experiment_id: productId, p_name: 'Gelatina Teste', p_brand: 'Marca Teste' })
  if (r.error) throw r.error
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha', { exact: true }).fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
}

const crops = async () => {
  const { data } = await admin.from('photos').select('angle, crop').eq('stage_id', stageId).order('angle')
  return data ?? []
}

test('horário vem da foto e o enquadramento é salvo junto', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.goto(`./#/produto/${productId}/nova-finalizacao`)
  await page.getByTestId('gallery-input').setInputFiles([await jpegWithDate('2026:11:18 07:30:00'), await jpegWithDate('2026:11:18 07:31:00', 'costas.jpg')])
  await expect(page.locator('#f-data')).toHaveAttribute('data-value', '2026-11-18T07:30')
  await expect(page.getByText('Horário tirado das fotos.')).toBeVisible()

  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page).toHaveURL(/salvo=/, { timeout: 30_000 })
  stageId = new URL(page.url().replace('#/', '')).searchParams.get('salvo')!
  const { data: stage } = await admin.from('stages').select('captured_at').eq('id', stageId).single()
  expect(new Date(stage!.captured_at).toISOString()).toBe('2026-11-18T10:30:00.000Z') // 07:30 em São Paulo

  // 300x600 sem rosto: preenche o quadro 3:4, cortando em cima e embaixo.
  const saved = await crops()
  expect(saved).toHaveLength(2)
  for (const p of saved) expect(p.crop).toEqual({ x: 0, y: 0.1667, w: 1, h: 0.6667 })
})

test('corrigir horário e ajustar o enquadramento à mão', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.goto(`./#/etapa/${stageId}`)
  await page.getByRole('button', { name: 'Editar fotos' }).click()

  // Horário
  await page.locator('#d-data').click()
  await page.locator('input[aria-label="Horário"]').fill('06:15')
  await page.getByRole('button', { name: 'Pronto' }).click()
  await expect(page.getByText('Horário atualizado.')).toBeVisible()
  const { data: stage } = await admin.from('stages').select('captured_at').eq('id', stageId).single()
  expect(new Date(stage!.captured_at).toISOString()).toBe('2026-11-18T09:15:00.000Z')

  // Ajuste à mão: aproximar duas vezes e salvar.
  await page.getByRole('button', { name: 'Ajustar enquadramento: Frente' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajustar enquadramento: Frente' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Aproximar' }).click()
  await dialog.getByRole('button', { name: 'Aproximar' }).click()
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Enquadramento de Frente salvo.')).toBeVisible()
  const front = (await crops()).find((p) => p.angle === 'front')!
  expect(front.crop.w).toBeLessThan(0.8)
  expect(front.crop.w / front.crop.h).toBeCloseTo((0.75 * 600) / 300, 2) // 3:4 em pixels
  // A miniatura mostra o recorte (imagem maior que o quadro).
  await expect(page.locator('.angle-cell[data-angle="front"] .photo-frame.cropped img')).toHaveCount(1)

  // Enquadrar todas automaticamente: sem cabeça, volta ao preencher e avisa.
  await page.getByRole('button', { name: 'Enquadrar todas automaticamente' }).click()
  await expect(page.getByText('Não achei a cabeça nas fotos', { exact: false })).toBeVisible({ timeout: 60_000 })
  for (const p of await crops()) expect(p.crop).toEqual({ x: 0, y: 0.1667, w: 1, h: 0.6667 })
})

test('o recorte é validado pelo banco', async () => {
  const { data } = await admin.from('photos').select('id').eq('stage_id', stageId).limit(1).single()
  const bad = await me.client.from('photos').update({ crop: { x: 0.5, y: 0, w: 0.8, h: 1 } }).eq('id', data!.id)
  expect(bad.error?.code).toBe('23514')
  const path = await me.client.from('photos').update({ storage_path: 'x' }).eq('id', data!.id)
  expect(path.error?.code).toBe('42501')
})
