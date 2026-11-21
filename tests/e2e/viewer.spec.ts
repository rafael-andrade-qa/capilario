// Visualizador em tela cheia: deslizar, setas, teclado, ângulos embaixo e puxar para baixo fecha.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { photoPath, testUser, type TestUser } from '../integration/helpers'
import { FRONT, LEFT } from './images'

const BUCKET = 'capilar-photos'
let me: TestUser
let stageId: string

test.beforeAll(async () => {
  me = await testUser('viewer-e2e')
  const experimentId = randomUUID()
  stageId = randomUUID()
  const photos = []
  for (const [angle, file] of [
    ['front', FRONT],
    ['left', LEFT],
  ] as const) {
    const id = randomUUID()
    const storage_path = photoPath(me.id, stageId, id).replace(/\.jpg$/, '.png')
    const up = await me.client.storage.from(BUCKET).upload(storage_path, file.buffer, { contentType: 'image/png' })
    if (up.error) throw up.error
    photos.push({ id, angle, storage_path, mime_type: 'image/png', size_bytes: file.buffer.length })
  }
  const r = await me.client.rpc('finalize_stage', {
    p_experiment_id: experimentId,
    p_stage_id: stageId,
    p_photos: photos,
    p_new_experiment: { product_mode: 'named', product_name: 'Gel Visualizador', brand: 'Marca V' },
    p_new_stage: { stage_type: 'wet', captured_at: '2026-11-20T14:53:00-03:00', notes: null, finalization_id: randomUUID() },
  })
  if (r.error) throw r.error
})

async function open(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()
  await page.goto(`./#/etapa/${stageId}`)
  await page.getByRole('button', { name: 'Ampliar Frente' }).click()
}

async function swipe(page: Page, dx: number, dy: number) {
  const box = (await page.getByTestId('viewer-stage').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}

test('passa pelas fotos do momento sem fechar', async ({ page }) => {
  await open(page)
  const viewer = page.getByRole('dialog', { name: 'Foto: Frente' })
  await expect(viewer).toContainText('Molhado · 20/11 14:53 · 1 de 2')
  await expect(page.getByRole('button', { name: 'Foto anterior' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Próxima foto' }).click()
  const left = page.getByRole('dialog', { name: 'Foto: Esquerdo' })
  await expect(left).toContainText('2 de 2')
  await expect(page.getByRole('button', { name: 'Próxima foto' })).toHaveCount(0)

  await page.keyboard.press('ArrowLeft')
  await expect(viewer).toBeVisible()

  await swipe(page, -200, 0)
  await expect(left).toBeVisible()
  await swipe(page, 200, 0)
  await expect(viewer).toBeVisible()
  await swipe(page, 200, 0) // já é a primeira: fica
  await expect(viewer).toBeVisible()

  await left.or(viewer).getByRole('button', { name: 'Esquerdo' }).click()
  await expect(left).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('puxar para baixo fecha', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('dialog', { name: 'Foto: Frente' })).toBeVisible()
  await swipe(page, 0, 220)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Ampliar Frente' }).click()
  await page.getByRole('button', { name: 'Fechar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
