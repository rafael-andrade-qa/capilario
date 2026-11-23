// Analisar a finalização com IA: brilho na barra do produto (Histórico), ao lado do + e do PDF.
// A função analyze-finalization é simulada aqui (a IA de verdade só roda na nuvem); a simulação
// grava a análise no banco local como a função faria, então usar e descartar as sugestões passam
// pelo banco de verdade.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page, type Route } from '@playwright/test'
import { adminClient, photoPath, testUser, type TestUser } from '../integration/helpers'
import { BACK, FRONT, LEFT, type TestFile } from './images'

const BUCKET = 'capilar-photos'
const PRODUCT = 'Geleia Seladora'
const admin = adminClient()
test.describe.configure({ mode: 'serial' })

let me: TestUser
const fin = randomUUID()
const older = randomUUID()
const ids = { wet: randomUUID(), dry: randomUUID(), olderWet: randomUUID() }

async function seedMoment(
  experimentId: string,
  finalizationId: string,
  stageId: string,
  type: 'wet' | 'dry',
  at: string,
  notes: string | null,
  photos: [string, TestFile][],
  newProduct: boolean,
) {
  const list = []
  for (const [angle, file] of photos) {
    const id = randomUUID()
    const storage_path = photoPath(me.id, stageId, id, 'png')
    const up = await me.client.storage.from(BUCKET).upload(storage_path, file.buffer, { contentType: 'image/png' })
    if (up.error) throw up.error
    list.push({ id, angle, storage_path, mime_type: 'image/png', size_bytes: file.buffer.length })
  }
  const r = await me.client.rpc('finalize_stage', {
    p_experiment_id: experimentId,
    p_stage_id: stageId,
    p_photos: list,
    p_new_experiment: newProduct ? { product_mode: 'named', product_name: PRODUCT, brand: 'Widi Care' } : null,
    p_new_stage: { stage_type: type, captured_at: at, notes, finalization_id: finalizationId },
  })
  if (r.error) throw r.error
}

test.beforeAll(async () => {
  me = await testUser('analise-e2e')
  const exp = randomUUID()
  await seedMoment(exp, older, ids.olderWet, 'wet', '2026-11-17T09:00:00-03:00', null, [['front', FRONT]], true)
  await seedMoment(exp, fin, ids.wet, 'wet', '2026-11-20T14:53:00-03:00', null, [['front', FRONT], ['left', LEFT]], false)
  await seedMoment(exp, fin, ids.dry, 'dry', '2026-11-20T15:38:00-03:00', 'Mechas firmes.', [['front', FRONT], ['back', BACK]], false)
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()
}

/** Abre o produto no Histórico e toca no brilho da barra dele. */
async function openSheet(page: Page) {
  const card = page.locator('.experiment', { hasText: PRODUCT })
  await card.locator('.product-toggle').click()
  await card.getByRole('button', { name: `Analisar com IA uma finalização de ${PRODUCT}` }).click()
  return page.getByRole('dialog', { name: 'Analisar com IA' })
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })

const RESULT = {
  product: 'Geleia Seladora (Widi Care)',
  hair_type: 'Ondulado 2B',
  tendency: 'tende a 2C/3A',
  traits: ['pontas porosas', 'fio médio'],
  scores: { definition: 8, frizz_control: 7, volume: 6, day2: null },
  summary: 'Junta definição e controle do frizz.',
  notes: { wet: 'Ondas já aparecem no molhado.', dry: 'Ondas 2B uniformes, frizz baixo.', next_day: '' },
}

/** Simula a função: confere o pedido, grava a análise como a função faria e responde. */
function mockAnalyze(page: Page, over: { summary?: string; notes?: typeof RESULT.notes } = {}) {
  const calls: { finalization_id: string; images: { moment: string; angle: string; data: string }[] }[] = []
  void page.route('**/functions/v1/analyze-finalization', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
    const body = route.request().postDataJSON()
    calls.push(body)
    const row = {
      finalization_id: body.finalization_id,
      user_id: me.id,
      model: 'claude-opus-5-5',
      result: { ...RESULT, ...over },
      usage: { input_tokens: 5200, output_tokens: 2100, cost_usd: 0.0628 },
      notes_state: 'pending',
      created_at: new Date().toISOString(),
    }
    const { data, error } = await admin.from('finalization_analyses').upsert(row, { onConflict: 'finalization_id' }).select().single()
    if (error) throw error
    await json(route, 200, { analysis: data, quota_left: 2 })
  })
  return calls
}

const notesOf = async (id: string) => (await admin.from('stages').select('notes').eq('id', id).single()).data?.notes
const stateOf = async () => (await admin.from('finalization_analyses').select('notes_state').eq('finalization_id', fin).single()).data?.notes_state

test('na barra do produto: escolhe a finalização, analisa e usa as observações sugeridas', async ({ page }) => {
  const calls = mockAnalyze(page)
  await login(page)
  const sheet = await openSheet(page)

  // As finalizações do produto, a mais recente marcada; a linha de baixo diz fotos e o que resta.
  const choices = sheet.getByRole('radio')
  await expect(choices).toHaveCount(2)
  await expect(choices.first()).toHaveAttribute('aria-checked', 'true')
  await expect(choices.first()).toContainText('Molhado · Seco')
  await expect(sheet).toContainText('4 fotos · restam 3 análises hoje')
  await expect(sheet).toContainText('A IA olha as fotos de todos os momentos')

  await sheet.getByRole('button', { name: 'Analisar', exact: true }).click()
  await expect(page.getByText('Análise pronta.', { exact: true })).toBeVisible()
  expect(calls).toHaveLength(1)
  expect(calls[0].finalization_id).toBe(fin)
  expect(calls[0].images.map((i) => `${i.moment}:${i.angle}`)).toEqual(['wet:front', 'wet:left', 'dry:front', 'dry:back'])
  // Cada foto vai recortada e reduzida (JPEG 768×1024).
  expect(Buffer.from(calls[0].images[0].data, 'base64').subarray(0, 2).toString('hex')).toBe('ffd8')

  // Na folha a leitura já vem aberta: notas, resumo e quando foi feita (sem modelo nem custo).
  const card = sheet.getByTestId('analysis-card')
  await expect(card.locator('summary')).toContainText('Ondulado 2B · tende a 2C/3A')
  await expect(card.getByText('Junta definição e controle do frizz.')).toBeVisible()
  await expect(card.getByRole('meter', { name: 'Definição' })).toHaveAttribute('aria-valuenow', '8')
  await expect(card).toContainText('Dia seguinte —')
  await expect(card).toContainText('Feita em')
  await expect(card).not.toContainText('Opus')
  await expect(card).not.toContainText('US$')
  await expect(sheet).toContainText('restam 2 análises hoje')
  await expect(choices.first()).toContainText('já analisada')
  await expect(sheet.getByRole('button', { name: 'Analisar de novo' })).toBeVisible()

  // Observações sugeridas de todos os momentos; usar grava nas duas.
  const sug = sheet.getByTestId('analysis-suggestions')
  await expect(sug).toContainText('Molhado: Ondas já aparecem no molhado.')
  await expect(sug).toContainText('Seco: Ondas 2B uniformes, frizz baixo.')
  await sug.getByRole('button', { name: 'Usar nas 2 observações' }).click()
  await expect(page.getByText('2 observações atualizadas.')).toBeVisible()
  await expect(sug).toHaveCount(0)
  expect(await notesOf(ids.dry)).toBe('Mechas firmes.\n\nAnálise: Ondas 2B uniformes, frizz baixo.')
  expect(await notesOf(ids.wet)).toBe('Análise: Ondas já aparecem no molhado.')
  expect(await stateOf()).toBe('applied')

  // A outra finalização ainda não tem análise.
  await choices.nth(1).click()
  await expect(sheet).toContainText('A IA olha as fotos de todos os momentos')
  await expect(sheet).toContainText('1 foto · restam 2 análises hoje')
  await sheet.getByRole('button', { name: 'Fechar' }).click()
  await expect(sheet).toHaveCount(0)

  // Na tela do momento: a leitura aparece fechada, a observação já veio, e não há brilho de etapa.
  await page.goto(`./#/etapa/${ids.dry}`)
  await expect(page.getByTestId('analysis-card')).toContainText('Ondulado 2B')
  await expect(page.getByText('Junta definição e controle do frizz.')).toBeHidden()
  await expect(page.getByLabel('Observação')).toHaveValue('Mechas firmes.\n\nAnálise: Ondas 2B uniformes, frizz baixo.')
  await expect(page.getByRole('button', { name: /Analisar/ })).toHaveCount(0)
  await expect(page.getByTestId('analysis-suggestion')).toHaveCount(0)
})

test('analisar de novo troca a análise na observação, e descartar não mexe em nada', async ({ page }) => {
  mockAnalyze(page, { summary: 'Segunda leitura.', notes: { wet: 'Ondas novas no molhado.', dry: 'Seco novo.', next_day: '' } })
  await login(page)
  const sheet = await openSheet(page)
  await expect(sheet.getByTestId('analysis-card')).toContainText('Ondulado 2B')

  await sheet.getByRole('button', { name: 'Analisar de novo' }).click()
  await expect(sheet.getByTestId('analysis-suggestions')).toContainText('Ondas novas no molhado.')
  await expect(sheet.getByText('Segunda leitura.')).toBeVisible()

  // Descartar: some a sugestão, observações intactas.
  await sheet.getByRole('button', { name: 'Descartar sugestão' }).click()
  await expect(sheet.getByTestId('analysis-suggestions')).toHaveCount(0)
  await expect.poll(stateOf).toBe('dismissed')
  expect(await notesOf(ids.dry)).toBe('Mechas firmes.\n\nAnálise: Ondas 2B uniformes, frizz baixo.')

  // De novo e usar: a análise anterior é trocada, não duplicada.
  await sheet.getByRole('button', { name: 'Analisar de novo' }).click()
  await sheet.getByTestId('analysis-suggestions').getByRole('button', { name: 'Usar nas 2 observações' }).click()
  await expect(page.getByText('2 observações atualizadas.')).toBeVisible()
  expect(await notesOf(ids.dry)).toBe('Mechas firmes.\n\nAnálise: Seco novo.')
  expect(await notesOf(ids.wet)).toBe('Análise: Ondas novas no molhado.')
})

test('sugestão pendente também aparece na tela do momento', async ({ page }) => {
  mockAnalyze(page, { notes: { wet: 'Molhado terceira.', dry: 'Seco terceira.', next_day: '' } })
  await login(page)
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: 'Analisar de novo' }).click()
  await expect(sheet.getByTestId('analysis-suggestions')).toContainText('Seco terceira.')
  await sheet.getByRole('button', { name: 'Fechar' }).click()

  await page.goto(`./#/etapa/${ids.wet}`)
  const sug = page.getByTestId('analysis-suggestion')
  await expect(sug).toContainText('Molhado terceira.')
  await sug.getByRole('button', { name: 'Usar nos 2 momentos' }).click()
  await expect(page.getByText('2 observações atualizadas.')).toBeVisible()
  await expect(page.getByLabel('Observação')).toHaveValue('Análise: Molhado terceira.')
  expect(await notesOf(ids.dry)).toBe('Mechas firmes.\n\nAnálise: Seco terceira.')
})

test('limite do dia: avisa e não analisa', async ({ page }) => {
  void page.route('**/functions/v1/analyze-finalization', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
      : json(route, 429, { error: 'analyze_limit' }),
  )
  await login(page)
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: 'Analisar de novo' }).click()
  await expect(page.getByText('Você já usou as 3 análises de hoje. Amanhã libera de novo.')).toBeVisible()
})
