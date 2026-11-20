// Enviar em PDF (momento e comparativo) e "Sem finalizador" no A do comparador.
// Sem compartilhamento de arquivos (como num computador), o PDF é baixado e a mensagem copiada.
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { photoPath, testUser, type TestUser } from '../integration/helpers'
import { FRONT, LEFT } from './images'

const BUCKET = 'capilar-photos'
test.describe.configure({ mode: 'serial' })

let me: TestUser
let gelStage: string

async function seed(product: Record<string, unknown>, notes: string | null, day: number): Promise<string> {
  const experimentId = randomUUID()
  const stageId = randomUUID()
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
    p_new_experiment: product,
    p_new_stage: { stage_type: 'dry', captured_at: `2026-11-${day}T10:23:00-03:00`, notes, finalization_id: randomUUID() },
  })
  if (r.error) throw r.error
  return stageId
}

test.beforeAll(async () => {
  me = await testUser('pdf-e2e')
  await seed({ product_mode: 'none', product_name: null, brand: null }, null, 17)
  gelStage = await seed({ product_mode: 'named', product_name: 'Gelatina PDF', brand: 'Marca PDF' }, 'Definição boa, pouco frizz.', 19)
})

async function login(page: Page) {
  // Sem compartilhamento de arquivos: cai no download (dá para conferir o PDF).
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }))
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()
}

async function downloadPdf(page: Page, dialogName: string) {
  const dialog = page.getByRole('dialog', { name: dialogName })
  const send = dialog.getByRole('button', { name: 'Enviar', exact: true })
  await expect(send).toBeEnabled({ timeout: 20_000 })
  const wait = page.waitForEvent('download')
  await send.click()
  const dl = await wait
  const bytes = readFileSync((await dl.path())!)
  // PDF_OUT=pasta: guarda uma cópia para olhar o resultado.
  if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${dl.suggestedFilename()}`, bytes)
  return { name: dl.suggestedFilename(), bytes }
}

test('comparador: Sem finalizador já vem no A', async ({ page }) => {
  await login(page)
  await page.goto('./#/comparar')
  await expect(page.getByTestId('select-a')).toContainText('Sem finalizador')
  await expect(page.getByTestId('select-b')).toContainText('Gelatina PDF')
})

test('PDF do momento: mensagem pronta e arquivo com as fotos', async ({ page }) => {
  await login(page)
  await page.goto(`./#/etapa/${gelStage}`)
  await page.getByRole('button', { name: 'Enviar PDF' }).click()
  const dialog = page.getByRole('dialog', { name: 'Enviar PDF' })
  await expect(dialog.getByRole('textbox')).toHaveValue(/^Olha como ficou meu cabelo seco, com Gelatina PDF \(Marca PDF\), em 19\/11 às 10:23\./)
  await expect(dialog.getByRole('textbox')).toHaveValue(/Minha observação: Definição boa, pouco frizz\./)
  await expect(dialog).toContainText('2 fotos do Seco')

  const { name, bytes } = await downloadPdf(page, 'Enviar PDF')
  expect(name).toBe('capilar-seco-19-11-gelatina-pdf.pdf')
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(8_000) // com as fotos dentro
  await expect(page.getByText('PDF baixado. A mensagem foi copiada', { exact: false })).toBeVisible()
})

test('PDF do comparativo: A e B lado a lado', async ({ page }) => {
  await login(page)
  await page.goto('./#/comparar')
  await page.getByRole('button', { name: 'Enviar PDF do comparativo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Enviar PDF do comparativo' })
  await expect(dialog.getByRole('textbox')).toHaveValue(/à esquerda, sem finalizador, em 17\/11 às 10:23;\n• à direita, com Gelatina PDF \(Marca PDF\), em 19\/11 às 10:23\./)
  await expect(dialog).toContainText('2 ângulos lado a lado')
  const { name, bytes } = await downloadPdf(page, 'Enviar PDF do comparativo')
  expect(name).toBe('capilar-comparativo-seco-17-11-x-19-11.pdf')
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(12_000)
})
