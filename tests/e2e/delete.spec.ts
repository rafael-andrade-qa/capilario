// Excluir etapa: pelo botão no detalhe e deslizando a linha no histórico (toque e mouse).
import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { adminClient, photoPath, testUser, tinyJpeg, type TestUser } from '../integration/helpers'

const BUCKET = 'capilar-photos'
const admin = adminClient()

test.describe.configure({ mode: 'serial' })

let me: TestUser
const experimentId = randomUUID()
const stages: { id: string; paths: string[] }[] = []

async function seedStage(type: 'wet' | 'dry' | 'next_day', at: string, notes: string | null) {
  const stageId = randomUUID()
  const photos = []
  for (const angle of ['front', 'left', 'right']) {
    const id = randomUUID()
    const storage_path = photoPath(me.id, stageId, id)
    const up = await me.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
    if (up.error) throw up.error
    photos.push({ id, angle, storage_path, mime_type: 'image/jpeg', size_bytes: 160 })
  }
  const r = await me.client.rpc('finalize_stage', {
    p_experiment_id: experimentId,
    p_stage_id: stageId,
    p_photos: photos,
    p_new_experiment: stages.length ? null : { product_mode: 'named', product_name: 'Creme de Teste' },
    p_new_stage: { stage_type: type, captured_at: at, notes },
  })
  if (r.error) throw r.error
  stages.push({ id: stageId, paths: photos.map((p) => p.storage_path) })
}

test.beforeAll(async () => {
  me = await testUser('apaga-e2e')
  await seedStage('wet', '2026-11-18T14:55:00-03:00', 'Frente solta')
  await seedStage('dry', '2026-11-18T17:00:00-03:00', 'Macio e solto')
  await seedStage('next_day', '2026-11-19T07:14:00-03:00', null)
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo registro' })).toBeVisible()
}

async function stageExists(id: string) {
  const { data } = await admin.from('stages').select('id').eq('id', id)
  return (data ?? []).length > 0
}

async function objectExists(path: string) {
  return (await admin.storage.from(BUCKET).exists(path)).data
}

/** Desliza com o dedo (eventos de toque reais do Chrome). */
async function touchSwipe(page: Page, row: Locator, dx: number) {
  const box = (await row.boundingBox())!
  const y = box.y + box.height / 2
  const x0 = dx > 0 ? box.x + 30 : box.x + box.width - 30
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 8, y: y + i }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/** Arrasta com o mouse (desktop). */
async function mouseSwipe(page: Page, row: Locator, dx: number) {
  const box = (await row.boundingBox())!
  const y = box.y + box.height / 2
  const x0 = dx > 0 ? box.x + 30 : box.x + box.width - 30
  await page.mouse.move(x0, y)
  await page.mouse.down()
  await page.mouse.move(x0 + dx, y + 2, { steps: 8 })
  await page.mouse.up()
}

const row = (page: Page, label: string) => page.locator('.stage-row', { hasText: label })

test('excluir pelo botão no detalhe da etapa, com opção de cancelar', async ({ page }) => {
  await login(page)
  await row(page, 'Seco').click()
  await expect(page.getByRole('heading', { name: 'Seco' })).toBeVisible()

  await page.getByRole('button', { name: 'Excluir etapa' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Excluir esta etapa?' })
  await expect(dialog).toContainText('As 3 fotos e a observação serão apagadas')
  await expect(dialog).not.toContainText('única etapa')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toHaveCount(0)
  expect(await stageExists(stages[1].id)).toBe(true)

  await page.getByRole('button', { name: 'Excluir etapa' }).click()
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Etapa excluída.')).toBeVisible()
  await expect(page.locator('.stage-row')).toHaveCount(2)
  await expect(row(page, 'Seco')).toHaveCount(0)

  expect(await stageExists(stages[1].id)).toBe(false)
  for (const p of stages[1].paths) expect(await objectExists(p)).toBe(false)
})

test('deslizar com o dedo revela Excluir; tocar na linha aberta só fecha', async ({ page }) => {
  await login(page)
  const target = row(page, 'Dia seguinte')
  await touchSwipe(page, target, 140) // da esquerda para a direita
  const action = page.getByRole('button', { name: /^Excluir Dia seguinte de / })
  await expect(action).toBeVisible()

  // Tocar na linha aberta fecha sem abrir a etapa.
  await target.click()
  await expect(action).toBeHidden()
  expect(page.url()).not.toContain('/etapa/')

  // Puxar de leve volta ao lugar.
  await touchSwipe(page, target, 30)
  await expect(action).toBeHidden()

  await touchSwipe(page, target, 140)
  await action.click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Dia seguinte')
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Etapa excluída.')).toBeVisible()
  await expect(page.locator('.stage-row')).toHaveCount(1)
  expect(await stageExists(stages[2].id)).toBe(false)
  for (const p of stages[2].paths) expect(await objectExists(p)).toBe(false)
})

test('última etapa: deslizar para a esquerda com o mouse e o produto sai do histórico', async ({ page }) => {
  await login(page)
  const target = row(page, 'Molhado')
  await mouseSwipe(page, target, -140) // da direita para a esquerda
  await page.getByRole('button', { name: /^Excluir Molhado de / }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('única etapa deste produto')
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Nenhum registro ainda')).toBeVisible()

  const { data } = await admin.from('experiments').select('id').eq('id', experimentId)
  expect(data).toEqual([])
  for (const p of stages[0].paths) expect(await objectExists(p)).toBe(false)
})
