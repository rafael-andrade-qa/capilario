// Fotos leves na lista: o histórico usa a miniatura (<foto>_t.jpg) e, se ela não existir, a foto.
// Os endereços das fotos ficam guardados no aparelho: ao reabrir, são os mesmos (o navegador
// reaproveita o que já baixou). Sair da conta apaga tudo.
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { expect, test, type Page } from '@playwright/test'
import { photoPath, testUser, type TestUser } from '../integration/helpers'
import { FRONT, LEFT } from './images'
import { thumbPath } from '../../src/lib/images'

const BUCKET = 'capilar-photos'
let me: TestUser

async function seed(name: string, file: Buffer, withThumb: boolean) {
  const experimentId = randomUUID()
  const stageId = randomUUID()
  const id = randomUUID()
  const storage_path = photoPath(me.id, stageId, id, 'png')
  const up = await me.client.storage.from(BUCKET).upload(storage_path, file, { contentType: 'image/png' })
  if (up.error) throw up.error
  if (withThumb) {
    const thumb = await sharp(file).jpeg({ quality: 78 }).toBuffer()
    const t = await me.client.storage.from(BUCKET).upload(thumbPath(storage_path), thumb, { contentType: 'image/jpeg' })
    if (t.error) throw t.error
  }
  const r = await me.client.rpc('finalize_stage', {
    p_experiment_id: experimentId,
    p_stage_id: stageId,
    p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/png', size_bytes: file.length }],
    p_new_experiment: { product_mode: 'named', product_name: name, brand: 'Marca M' },
    p_new_stage: { stage_type: 'dry', captured_at: '2026-11-20T10:00:00-03:00', notes: null, finalization_id: randomUUID() },
  })
  if (r.error) throw r.error
}

test.beforeAll(async () => {
  me = await testUser('miniaturas-e2e')
  await seed('Com Miniatura', FRONT.buffer, true)
  await seed('Sem Miniatura', LEFT.buffer, false)
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()
}

const thumbSrc = (page: Page, product: string) =>
  page.getByRole('region', { name: `Produto ${product}` }).locator('.product-thumb img')

test('lista usa a miniatura (ou a foto, se faltar) e reaproveita os endereços ao reabrir', async ({ page }) => {
  await login(page)
  await expect(thumbSrc(page, 'Com Miniatura (Marca M)')).toHaveAttribute('src', /_t\.jpg\?/)
  await expect(thumbSrc(page, 'Sem Miniatura (Marca M)')).toHaveAttribute('src', /\.png\?/)
  const before = await thumbSrc(page, 'Com Miniatura (Marca M)').getAttribute('src')

  const saved = () => page.evaluate(() => localStorage.getItem('capilar:fotos:v1'))
  await expect.poll(saved).not.toBeNull()

  await page.reload()
  await expect(thumbSrc(page, 'Com Miniatura (Marca M)')).toHaveAttribute('src', before!)

  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page.getByLabel('E-mail')).toBeVisible()
  expect(await saved()).toBeNull()
})
