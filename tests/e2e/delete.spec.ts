// Excluir momento: pelo botão no detalhe; a finalização e o produto vazios saem junto.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
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
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()
}

async function stageExists(id: string) {
  const { data } = await admin.from('stages').select('id').eq('id', id)
  return (data ?? []).length > 0
}

async function objectExists(path: string) {
  return (await admin.storage.from(BUCKET).exists(path)).data
}

const tile = (page: Page, label: string) => page.locator('.moment-tile', { hasText: label })

async function deleteFromDetail(page: Page, label: string) {
  await tile(page, label).click()
  await expect(page.getByRole('heading', { name: label })).toBeVisible()
  await page.getByRole('button', { name: 'Excluir momento' }).click()
  return page.getByRole('alertdialog', { name: 'Excluir este momento?' })
}

test('excluir pelo botão no detalhe do momento, com opção de cancelar', async ({ page }) => {
  await login(page)
  await page.locator('.experiment:not(.fixed-product) .product-toggle').first().click()
  // Os três momentos estão na mesma finalização.
  await expect(page.locator('.fin')).toHaveCount(1)
  await expect(page.locator('.fin .moment-tile')).toHaveCount(3)

  const dialog = await deleteFromDetail(page, 'Seco')
  await expect(dialog).toContainText('As 3 fotos e a observação serão apagadas')
  await expect(dialog).not.toContainText('único momento')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toHaveCount(0)
  expect(await stageExists(stages[1].id)).toBe(true)

  // A lixeira continua no topo, ao lado do lápis.
  await page.getByRole('button', { name: 'Excluir momento' }).click()
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Momento excluído.')).toBeVisible()
  await expect(page.locator('.moment-tile')).toHaveCount(2)
  await expect(tile(page, 'Seco')).toHaveCount(0)

  expect(await stageExists(stages[1].id)).toBe(false)
  for (const p of stages[1].paths) expect(await objectExists(p)).toBe(false)
})

test('excluir o Dia seguinte mantém a finalização com o Molhado', async ({ page }) => {
  await login(page)
  await page.locator('.experiment:not(.fixed-product) .product-toggle').first().click()
  const dialog = await deleteFromDetail(page, 'Dia seguinte')
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Momento excluído.')).toBeVisible()
  await expect(page.locator('.fin')).toHaveCount(1)
  await expect(page.locator('.moment-tile')).toHaveCount(1)
  expect(await stageExists(stages[2].id)).toBe(false)
  for (const p of stages[2].paths) expect(await objectExists(p)).toBe(false)
})

test('último momento: a finalização sai e o produto fica, sem finalização', async ({ page }) => {
  await login(page)
  await page.locator('.experiment:not(.fixed-product) .product-toggle').first().click()
  const dialog = await deleteFromDetail(page, 'Molhado')
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Momento excluído.')).toBeVisible()
  const card = page.locator('.experiment', { hasText: 'Creme de Teste' })
  await expect(card.locator('.experiment-sub')).toContainText('Nenhuma finalização ainda')

  const { data } = await admin.from('experiments').select('id').eq('id', experimentId)
  expect(data).toEqual([{ id: experimentId }])
  const { data: fins } = await admin.from('finalizations').select('id').eq('experiment_id', experimentId)
  expect(fins).toEqual([])
  for (const p of stages[0].paths) expect(await objectExists(p)).toBe(false)
})
