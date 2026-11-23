// Visualizador em tela cheia (deslizar, setas, teclado, puxar para baixo fecha) e trocar o
// ângulo de uma foto cadastrada no lugar errado.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { photoPath, testUser, type TestUser } from '../integration/helpers'
import { FRONT, LEFT } from './images'

// Estes testes usam a lista de produtos: o início abre na aba Produtos.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('capilar:inicio:aba', 'produtos'))
})

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
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
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

test('foto no ângulo errado: move para o vazio ou troca com a outra', async ({ page }) => {
  await open(page)
  await page.keyboard.press('Escape')
  const before = (await me.client.from('photos').select('id, angle').eq('stage_id', stageId)).data!
  const id = (a: string) => before.find((p) => p.angle === a)!.id
  await page.getByRole('button', { name: 'Editar fotos' }).click()

  await page.getByRole('button', { name: 'Trocar ângulo: Esquerdo' }).click()
  const sheet = page.getByRole('dialog', { name: 'Trocar ângulo: Esquerdo' })
  await expect(sheet.getByRole('button', { name: 'Frente: troca com a foto que está lá' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Direito: ângulo vazio' }).click()
  await expect(page.getByText('Foto movida para Direito.')).toBeVisible()

  await page.getByRole('button', { name: 'Trocar ângulo: Direito' }).click()
  await page.getByRole('button', { name: 'Frente: troca com a foto que está lá' }).click()
  await expect(page.getByText('Direito e Frente trocados.')).toBeVisible()

  const after = Object.fromEntries((await me.client.from('photos').select('id, angle').eq('stage_id', stageId)).data!.map((p) => [p.angle, p.id]))
  expect(after).toEqual({ front: id('left'), right: id('front') })
})

test('zoom só para olhar: toque duplo, rodinha e volta ao trocar de foto', async ({ page }) => {
  await open(page)
  const zoom = page.getByTestId('viewer-zoom')
  const box = (await page.getByTestId('viewer-stage').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const tap = async () => {
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.up()
  }
  await expect(zoom).toHaveAttribute('data-scale', '1.00')
  await tap()
  await tap()
  await expect(zoom).toHaveAttribute('data-scale', '2.50')
  // com zoom, as setas somem e arrastar move a foto (não troca de ângulo)
  await expect(page.getByRole('button', { name: 'Próxima foto' })).toHaveCount(0)
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx - 150, cy, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByRole('dialog', { name: 'Foto: Frente' })).toBeVisible()
  // toque duplo de novo: volta ao normal
  await page.waitForTimeout(400)
  await tap()
  await tap()
  await expect(zoom).toHaveAttribute('data-scale', '1.00')
  // rodinha do mouse aproxima; trocar de foto volta ao normal
  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, -300)
  await expect(zoom).not.toHaveAttribute('data-scale', '1.00')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('dialog')).toContainText('2 de 2')
  await expect(page.getByTestId('viewer-zoom')).toHaveAttribute('data-scale', '1.00')
})
