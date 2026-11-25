// Enviar em PDF (momento, comparativo e finalização inteira) e "Sem finalizador" no A do comparador.
// Sem compartilhamento de arquivos (como num computador), o PDF é baixado e a mensagem copiada.
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { adminClient, photoPath, testUser, type TestUser } from '../integration/helpers'
import { FRONT, LEFT } from './images'

// Estes testes usam a lista de produtos: o início abre na aba Produtos.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('capilar:inicio:aba', 'produtos'))
})

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
  await page.getByLabel('Senha', { exact: true }).fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
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

test('comparador abre com a última finalização (A) contra a penúltima (B)', async ({ page }) => {
  await login(page)
  await page.goto('./#/comparar')
  await expect(page.getByTestId('select-a')).toContainText('Gelatina PDF')
  await expect(page.getByTestId('select-b')).toContainText('Sem finalizador')
})

test('PDF do momento: mensagem pronta e arquivo com as fotos', async ({ page }) => {
  await login(page)
  await page.goto(`./#/etapa/${gelStage}`)
  await page.getByRole('button', { name: 'Enviar PDF' }).click()
  const dialog = page.getByRole('dialog', { name: 'Enviar PDF' })
  await expect(dialog.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/^Olha como ficou meu cabelo seco, com Gelatina PDF \(Marca PDF\), em 19\/11 às 10:23\./)
  // Curta: a observação está no PDF.
  await expect(dialog.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/\nAs fotos estão no PDF\.\n\nFeito com o Capilário, meu diário do cabelo\.$/)
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
  // Duas finalizações: o dia e o que foi usado em cada uma (aqui, a gelatina e nada).
  await expect(dialog.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/em duas finalizações:\n• à esquerda \(A\), em 19\/11 às 10:23, com Gelatina PDF;\n• à direita \(B\), em 17\/11 às 10:23, sem finalizador\.\n\nO que mudou: Só em A: fixar\./)
  await expect(dialog.getByRole('textbox', { name: 'Nome do arquivo' })).toHaveValue('Comparativo Seco 19-11 x 17-11')
  const { name, bytes } = await downloadPdf(page, 'Enviar PDF do comparativo')
  expect(name).toBe('Comparativo Seco 19-11 x 17-11.pdf')
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(12_000)
})

/** "Enviar PDF" pelo menu ⋯ do cartão do dia que tem esse texto (o selo da rotina). */
async function dayPdf(page: Page, text: string) {
  await page.goto('./#/')
  await page.getByRole('tab', { name: 'Diário' }).click()
  const day = page.getByRole('listitem', { name: /^Finalização de / }).filter({ hasText: text }).first()
  // Dia anterior (linha compacta): o menu fica na tela do dia.
  if (await day.locator('.day-row').count()) await day.locator('.day-row').click()
  await page.getByRole('button', { name: /^Ações da finalização de / }).first().click()
  await page.getByRole('menuitem', { name: 'Enviar PDF' }).click()
}

/** Texto do PDF: abre os blocos comprimidos (o jsPDF escreve o texto como "(...) Tj"). */
function pdfText(bytes: Buffer): string {
  const raw = bytes.toString('latin1')
  let out = ''
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length
    const end = raw.indexOf('endstream', start)
    try {
      out += inflateSync(bytes.subarray(start, end)).toString('latin1')
    } catch {
      /* imagem ou bloco sem compressão */
    }
  }
  return out
}

test('análise da IA no PDF: vai por padrão, com rótulo, e dá para tirar', async ({ page }) => {
  const experimentId = randomUUID()
  const finalizationId = randomUUID()
  await seed({ product_mode: 'named', product_name: 'Geleia IA', brand: 'Marca G' }, 'Análise: Ondas no molhado.', 22, {
    experimentId,
    finalizationId,
    stageType: 'wet',
    hour: '09:00',
  })
  const dry = await seed(null, 'Macio e solto.\n\nAnálise: Ondas 2B uniformes.', 22, { experimentId, finalizationId, stageType: 'dry', hour: '12:30' })
  const { error } = await adminClient()
    .from('finalization_analyses')
    .insert({
      finalization_id: finalizationId,
      user_id: me.id,
      model: 'claude-opus-5-5',
      notes_state: 'applied',
      result: {
        product: 'Geleia IA (Marca G)',
        hair_type: 'Ondulado 2B',
        tendency: 'tende a 2C/3A',
        traits: ['fio medio'],
        scores: { definition: 8, frizz_control: 7, volume: 6, day2: null },
        summary: 'Bom equilibrio.',
        notes: { wet: 'Ondas no molhado.', dry: 'Ondas 2B uniformes.', next_day: '' },
      },
    })
  if (error) throw error
  await adminClient().from('experiments').update({ category: 'geleia' }).eq('id', experimentId)

  await login(page)
  await dayPdf(page, 'Geleia')
  const dialog = page.getByRole('dialog', { name: 'Enviar PDF da finalização' })
  const toggle = dialog.getByRole('checkbox', { name: 'Incluir a análise da IA' })
  await expect(toggle).toBeChecked()
  const message = dialog.getByRole('textbox', { name: 'Mensagem' })
  await expect(message).toHaveValue(/com as minhas observações e a análise da IA\.\n/)
  await expect(message).not.toHaveValue(/Geleia: define/) // o que é o produto está no PDF
  const withAi = (await downloadPdf(page, 'Enviar PDF da finalização')).bytes
  let text = pdfText(withAi)
  expect(text).toContain('(Leitura da IA)')
  expect(text).toContain('Ondulado 2B')
  expect(text).toContain('8/10')
  expect(text).toMatch(/\(Seco\)[\s\S]*\(Macio e solto\.\)/)
  expect(text).toMatch(/\(Seco · an.lise da IA\)[\s\S]*\(Ondas 2B uniformes\.\)/)
  // Quem recebe entende o produto: o tipo na capa e o que ele é.
  expect(text).toContain('Geleia · Marca G')
  expect(text).toMatch(/\(O que . geleia\)[\s\S]*\(Gel leve/)
  // Propaganda: o endereço fixo do app (nunca o de teste) e sem nome do modelo.
  expect(text).toContain('Feito com o Capilário · capilario.com.br')
  expect(withAi.toString('latin1')).toContain('/URI (https://capilario.com.br)') // clicável
  expect(text).not.toMatch(/localhost|github|127\.0\.0\.1/i)
  expect(text).not.toMatch(/Opus|Haiku|Sonnet/)

  // Sem a análise: some a leitura e a observação da IA; o texto da pessoa fica.
  await dayPdf(page, 'Geleia')
  await toggle.uncheck()
  await expect(message).toHaveValue(/com as minhas observações\.\n/)
  text = pdfText((await downloadPdf(page, 'Enviar PDF da finalização')).bytes)
  expect(text).not.toContain('Leitura da IA')
  expect(text).not.toContain('Ondas 2B uniformes')
  expect(text).toMatch(/\(Seco\)[\s\S]*\(Macio e solto\.\)/)

  // Momento: "Minha observação" é só o texto da pessoa; a análise vai no PDF com rótulo.
  await page.goto(`./#/etapa/${dry}`)
  await page.getByRole('button', { name: 'Enviar PDF' }).click()
  const sheet = page.getByRole('dialog', { name: 'Enviar PDF' })
  await expect(sheet.getByRole('checkbox', { name: 'Incluir a análise da IA' })).toBeChecked()
  await expect(sheet.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/\nAs fotos estão no PDF, com a análise da IA\.\n/)
  text = pdfText((await downloadPdf(page, 'Enviar PDF')).bytes)
  expect(text).toMatch(/\(Minha observa..o\)[\s\S]*\(Macio e solto\.\)/)
  expect(text).toMatch(/\(An.lise da IA\)[\s\S]*\(Ondas 2B uniformes\.\)/)
  expect(text).not.toContain('Leitura da IA')
})

test('PDF da finalização inteira: pelo histórico e pelo detalhe do momento', async ({ page }) => {
  const experimentId = randomUUID()
  const finalizationId = randomUUID()
  await seed({ product_mode: 'named', product_name: 'Creme Evolução', brand: 'Marca E' }, null, 21, { experimentId, finalizationId, stageType: 'wet', hour: '09:00' })
  const dry = await seed(null, 'Secou com volume.', 21, { experimentId, finalizationId, stageType: 'dry', hour: '12:30' })
  // Umidade e rotina do dia (o produto principal já está nela; com o shampoo, ela entra no PDF).
  const shampooId = randomUUID()
  await seed({ product_mode: 'named', product_name: 'Shampoo E', brand: null }, null, 20, { experimentId: shampooId })
  const admin = adminClient()
  await admin.from('stages').update({ humidity: 78 }).eq('finalization_id', finalizationId)
  const items = await admin.from('routine_items').insert({ finalization_id: finalizationId, user_id: me.id, step: 'wash', position: 0, experiment_id: shampooId })
  if (items.error) throw items.error

  await login(page)
  // Diário: menu ⋯ do cartão da finalização.
  await dayPdf(page, 'Creme Evolução')
  const dialog = page.getByRole('dialog', { name: 'Enviar PDF da finalização' })
  const choices = dialog.getByRole('radio')
  await expect(choices).toHaveCount(1)
  await expect(choices.first()).toHaveAttribute('aria-checked', 'true')
  await expect(choices.first()).toContainText('Molhado · Seco')
  await expect(dialog.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(
    'Olha a evolução do meu cabelo com Creme Evolução (Marca E), na finalização de 21/11.\nMolhado e seco lado a lado no PDF, com as minhas observações.\n\nFeito com o Capilário, meu diário do cabelo.',
  )
  const { name, bytes } = await downloadPdf(page, 'Enviar PDF da finalização')
  expect(name).toBe('Finalização 21-11 - Creme Evolução.pdf')
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(12_000)
  const text = pdfText(bytes)
  // Horário e umidade em linhas separadas (numa linha só, invadiam a coluna do lado).
  expect(text).toContain('(21/11 às 09:00)')
  expect(text).toContain('(umidade 78%)')
  // Rotina em tabela: etapa, produto e marca.
  expect(text).toMatch(/\(Rotina do dia\)[\s\S]*\(ETAPA\)[\s\S]*\(PRODUTO\)[\s\S]*\(MARCA\)[\s\S]*\(Lavar\)[\s\S]*\(Shampoo E\)[\s\S]*\(Creme Evolu..o\)[\s\S]*\(Marca E\)/)

  // Detalhe do momento: escolher entre este momento e a finalização inteira.
  await page.goto(`./#/etapa/${dry}`)
  await page.getByRole('button', { name: 'Enviar PDF' }).click()
  const sheet = page.getByRole('dialog', { name: 'Enviar PDF' })
  await expect(sheet.getByRole('button', { name: 'Este momento' })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/^Olha como ficou meu cabelo seco/)
  await sheet.getByRole('button', { name: 'Finalização inteira' }).click()
  await expect(sheet.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/^Olha a evolução do meu cabelo/)
  const fin = await downloadPdf(page, 'Enviar PDF')
  expect(fin.name).toBe('Finalização 21-11 - Creme Evolução.pdf')
})
