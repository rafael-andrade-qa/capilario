// Lixinho da barra do produto: escolhe a finalização a excluir; o produto e as outras ficam.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { adminClient, photoPath, testUser, type TestUser } from '../integration/helpers'
import { BACK, FRONT, type TestFile } from './images'

// Estes testes usam a lista de produtos: o início abre na aba Produtos.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('capilar:inicio:aba', 'produtos'))
})

const BUCKET = 'capilar-photos'
const PRODUCT = 'Creme Exclusão'
const admin = adminClient()

let me: TestUser
const exp = randomUUID()
const older = randomUUID()
const newer = randomUUID()
const paths: string[] = []

async function seedMoment(fin: string, type: 'wet' | 'dry', at: string, photos: [string, TestFile][], newProduct: boolean) {
  const stageId = randomUUID()
  const list = []
  for (const [angle, file] of photos) {
    const id = randomUUID()
    const storage_path = photoPath(me.id, stageId, id, 'png')
    const up = await me.client.storage.from(BUCKET).upload(storage_path, file.buffer, { contentType: 'image/png' })
    if (up.error) throw up.error
    if (fin === newer) paths.push(storage_path)
    list.push({ id, angle, storage_path, mime_type: 'image/png', size_bytes: file.buffer.length })
  }
  const r = await me.client.rpc('finalize_stage', {
    p_experiment_id: exp,
    p_stage_id: stageId,
    p_photos: list,
    p_new_experiment: newProduct ? { product_mode: 'named', product_name: PRODUCT, brand: 'Marca X' } : null,
    p_new_stage: { stage_type: type, captured_at: at, notes: null, finalization_id: fin },
  })
  if (r.error) throw r.error
}

test.beforeAll(async () => {
  me = await testUser('excluir-fin-e2e')
  await seedMoment(older, 'wet', '2026-11-17T09:00:00-03:00', [['front', FRONT]], true)
  await seedMoment(newer, 'wet', '2026-11-20T14:00:00-03:00', [['front', FRONT], ['back', BACK]], false)
  await seedMoment(newer, 'dry', '2026-11-20T16:00:00-03:00', [['front', FRONT]], false)
})


/** Abre o menu ⋯ do cartão do dia (Diário) e escolhe uma ação. 0 = a finalização mais recente. */
async function dayAction(page: Page, action: string, which = 0) {
  await page.goto('./#/')
  await page.getByRole('tab', { name: 'Diário' }).click()
  const day = page.getByRole('listitem', { name: /^Finalização de / }).nth(which)
  // Dias anteriores: o menu fica na tela do dia.
  if (which > 0) await day.locator('.day-row').click()
  await page.getByRole('button', { name: /^Ações da finalização de / }).first().click()
  await page.getByRole('menuitem', { name: action }).click()
}

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha', { exact: true }).fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
}

test('o menu do dia exclui aquela finalização; cancelar não apaga e excluir tira só ela', async ({ page }) => {
  await login(page)
  await page.getByRole('tab', { name: 'Diário' }).click()
  await expect(page.getByRole('listitem', { name: /^Finalização de / })).toHaveCount(2)

  // A mais antiga: o aviso diz o que sai; cancelar não apaga nada.
  await dayAction(page, 'Excluir finalização', 1)
  const sheet = page.getByRole('dialog', { name: 'Excluir finalização' })
  await expect(sheet.getByRole('radio')).toHaveCount(1)
  await expect(sheet).toContainText('Sai o molhado de 17/11, com a foto')
  await expect(sheet.getByRole('button', { name: 'Excluir o produto inteiro' })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Cancelar' }).click()
  await expect(sheet).toHaveCount(0)
  expect((await admin.from('stages').select('id').eq('experiment_id', exp)).data).toHaveLength(3)

  // Excluir a mais recente.
  await dayAction(page, 'Excluir finalização', 0)
  await expect(sheet).toContainText('Sai o molhado e o seco de 20/11, com as 3 fotos')
  await sheet.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Finalização excluída.')).toBeVisible()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('listitem', { name: /^Finalização de / })).toHaveCount(1)

  expect((await admin.from('stages').select('id').eq('finalization_id', newer)).data).toEqual([])
  expect((await admin.from('stages').select('id').eq('finalization_id', older)).data).toHaveLength(1)
  expect((await admin.from('experiments').select('id').eq('id', exp)).data).toHaveLength(1)
  // Os arquivos da finalização excluída saíram do armazenamento.
  const folder = paths[0].split('/').slice(0, -1).join('/')
  const { data: files } = await admin.storage.from(BUCKET).list(folder)
  expect(files?.filter((f) => paths.some((p) => p.endsWith(f.name))) ?? []).toEqual([])
})
