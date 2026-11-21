// Enviar em PDF (momento, comparativo e finalização inteira) e "Sem finalizador" no A do comparador.
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

async function seed(
  product: Record<string, unknown> | null,
  notes: string | null,
  day: number,
  o: { experimentId?: string; finalizationId?: string; stageType?: string; hour?: string } = {},
): Promise<string> {
  const experimentId = o.experimentId ?? randomUUID()
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
    p_new_stage: { stage_type: o.stageType ?? 'dry', captured_at: `2026-11-${day}T${o.hour ?? '10:23'}:00-03:00`, notes, finalization_id: o.finalizationId ?? randomUUID() },
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
  await expect(dialog.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/^Olha como ficou meu cabelo seco, com Gelatina PDF \(Marca PDF\), em 19\/11 às 10:23\./)
  await expect(dialog.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/Minha observação: Definição boa, pouco frizz\./)
  const fileName = dialog.getByRole('textbox', { name: 'Nome do arquivo' })
  await expect(fileName).toHaveValue('Seco 19-11 - Gelatina PDF')
  // O nome é editável: o arquivo sai com o nome escolhido.
  await fileName.fill('Meu seco: 19/11')

  const { name, bytes } = await downloadPdf(page, 'Enviar PDF')
  expect(name).toBe('Meu seco- 19-11.pdf')
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(8_000) // com as fotos dentro
  await expect(page.getByText('PDF baixado. A mensagem foi copiada', { exact: false })).toBeVisible()
})

test('PDF do comparativo: A e B lado a lado', async ({ page }) => {
  await login(page)
  await page.goto('./#/comparar')
  await page.getByRole('button', { name: 'Enviar PDF do comparativo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Enviar PDF do comparativo' })
  await expect(dialog.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/à esquerda, sem finalizador, em 17\/11 às 10:23;\n• à direita, com Gelatina PDF \(Marca PDF\), em 19\/11 às 10:23\./)
  await expect(dialog.getByRole('textbox', { name: 'Nome do arquivo' })).toHaveValue('Comparativo Seco 17-11 x 19-11 - Sem finalizador x Gelatina PDF')
  const { name, bytes } = await downloadPdf(page, 'Enviar PDF do comparativo')
  expect(name).toBe('Comparativo Seco 17-11 x 19-11 - Sem finalizador x Gelatina PDF.pdf')
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(12_000)
})

test('PDF da finalização inteira: pelo histórico e pelo detalhe do momento', async ({ page }) => {
  const experimentId = randomUUID()
  const finalizationId = randomUUID()
  await seed({ product_mode: 'named', product_name: 'Creme Evolução', brand: 'Marca E' }, null, 21, { experimentId, finalizationId, stageType: 'wet', hour: '09:00' })
  const dry = await seed(null, 'Secou com volume.', 21, { experimentId, finalizationId, stageType: 'dry', hour: '12:30' })

  await login(page)
  // Histórico: ícone junto das ações do produto; escolhe a finalização numa lista.
  const card = page.locator('.experiment', { hasText: 'Creme Evolução' })
  await card.locator('.product-toggle').click()
  await card.getByRole('button', { name: 'Enviar PDF de uma finalização de Creme Evolução' }).click()
  const dialog = page.getByRole('dialog', { name: 'Enviar PDF da finalização' })
  const choices = dialog.getByRole('radio')
  await expect(choices).toHaveCount(1)
  await expect(choices.first()).toHaveAttribute('aria-checked', 'true')
  await expect(choices.first()).toContainText('Molhado · Seco')
  await expect(dialog.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(
    'Olha como meu cabelo evoluiu com Creme Evolução (Marca E), na finalização de 21/11:\n• molhado às 09:00;\n• seco às 12:30.\n\nAs fotos estão lado a lado no PDF, com as minhas observações.',
  )
  const { name, bytes } = await downloadPdf(page, 'Enviar PDF da finalização')
  expect(name).toBe('Finalização 21-11 - Creme Evolução.pdf')
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(12_000)

  // Detalhe do momento: escolher entre este momento e a finalização inteira.
  await page.goto(`./#/etapa/${dry}`)
  await page.getByRole('button', { name: 'Enviar PDF' }).click()
  const sheet = page.getByRole('dialog', { name: 'Enviar PDF' })
  await expect(sheet.getByRole('button', { name: 'Este momento' })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/^Olha como ficou meu cabelo seco/)
  await sheet.getByRole('button', { name: 'Finalização inteira' }).click()
  await expect(sheet.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/^Olha como meu cabelo evoluiu/)
  const fin = await downloadPdf(page, 'Enviar PDF')
  expect(fin.name).toBe('Finalização 21-11 - Creme Evolução.pdf')
})
