// Analisar a finalização com IA (detalhe do momento). A função analyze-finalization é simulada
// aqui (a IA de verdade só roda na nuvem); a simulação grava a análise no banco local como a
// função faria, então usar e descartar as sugestões passam pelo banco de verdade.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page, type Route } from '@playwright/test'
import { adminClient, photoPath, testUser, type TestUser } from '../integration/helpers'
import { BACK, FRONT, LEFT, type TestFile } from './images'

const BUCKET = 'capilar-photos'
const admin = adminClient()
test.describe.configure({ mode: 'serial' })

let me: TestUser
const fin = randomUUID()
const ids = { wet: randomUUID(), dry: randomUUID() }

async function seedMoment(experimentId: string, stageId: string, type: 'wet' | 'dry', at: string, notes: string | null, photos: [string, TestFile][], newProduct: boolean) {
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
    p_new_experiment: newProduct ? { product_mode: 'named', product_name: 'Geleia Seladora', brand: 'Widi Care' } : null,
    p_new_stage: { stage_type: type, captured_at: at, notes, finalization_id: fin },
  })
  if (r.error) throw r.error
}

test.beforeAll(async () => {
  me = await testUser('analise-e2e')
  const exp = randomUUID()
  await seedMoment(exp, ids.wet, 'wet', '2026-11-20T14:53:00-03:00', null, [['front', FRONT], ['left', LEFT]], true)
  await seedMoment(exp, ids.dry, 'dry', '2026-11-20T15:38:00-03:00', 'Mechas firmes.', [['front', FRONT], ['back', BACK]], false)
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()
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
      finalization_id: fin,
      user_id: me.id,
      model: 'claude-opus-5-5',
      result: { ...RESULT, ...over },
      usage: { input_tokens: 5200, output_tokens: 2100, cost_usd: 0.0628 },
      notes_state: 'pending',
      created_at: new Date().toISOString(),
    }
    const { data, error } = await admin.from('finalization_analyses').upsert(row, { onConflict: 'finalization_id' }).select().single()
    if (error) throw error
    await json(route, 200, { analysis: data, quota_left: 9 })
  })
  return calls
}

const notesOf = async (id: string) => (await admin.from('stages').select('notes').eq('id', id).single()).data?.notes

test('analisa com confirmação, mostra a leitura fechada e usa as sugestões nos dois momentos', async ({ page }) => {
  const calls = mockAnalyze(page)
  await login(page)
  await page.goto(`./#/etapa/${ids.dry}`)
  await expect(page.getByRole('textbox', { name: 'Observação' })).toHaveValue('Mechas firmes.')
  await expect(page.getByTestId('analysis-card')).toHaveCount(0)

  // O brilho pede confirmação antes (custa centavos) e mostra quantas restam no dia.
  await page.getByRole('button', { name: 'Analisar a finalização com IA' }).click()
  const ask = page.getByRole('group', { name: 'Confirmar análise' })
  await expect(ask).toContainText('Analisar 4 fotos com IA?')
  await expect(ask).toContainText('restam 10 hoje')
  await ask.getByRole('button', { name: 'Analisar' }).click()

  await expect(page.getByText(/Análise pronta · US\$ 0,06/)).toBeVisible()
  expect(calls).toHaveLength(1)
  expect(calls[0].finalization_id).toBe(fin)
  expect(calls[0].images.map((i) => `${i.moment}:${i.angle}`)).toEqual(['wet:front', 'wet:left', 'dry:front', 'dry:back'])
  // Cada foto vai recortada e reduzida (JPEG 768×1024).
  const first = Buffer.from(calls[0].images[0].data, 'base64')
  expect(first.subarray(0, 2).toString('hex')).toBe('ffd8')

  // Leitura: fechada mostra só o tipo; aberta, notas, resumo, modelo e custo.
  const card = page.getByTestId('analysis-card')
  await expect(card.locator('summary')).toContainText('Ondulado 2B · tende a 2C/3A')
  await expect(card.getByText('Junta definição e controle do frizz.')).toBeHidden()
  await card.locator('summary').click()
  await expect(card.getByText('Junta definição e controle do frizz.')).toBeVisible()
  await expect(card.getByRole('meter', { name: 'Definição' })).toHaveAttribute('aria-valuenow', '8')
  await expect(card).toContainText('Dia seguinte —')
  await expect(card).toContainText('Opus 5.5')
  await expect(card).toContainText('US$ 0,06')

  // Sugestão do momento embaixo do campo; usar grava nos dois momentos.
  const sug = page.getByTestId('analysis-suggestion')
  await expect(sug).toContainText('Ondas 2B uniformes, frizz baixo.')
  await sug.getByRole('button', { name: 'Usar nos 2 momentos' }).click()
  await expect(page.getByText('2 observações atualizadas.')).toBeVisible()
  await expect(sug).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Observação' })).toHaveValue('Mechas firmes.\n\nAnálise: Ondas 2B uniformes, frizz baixo.')
  expect(await notesOf(ids.dry)).toBe('Mechas firmes.\n\nAnálise: Ondas 2B uniformes, frizz baixo.')
  expect(await notesOf(ids.wet)).toBe('Análise: Ondas já aparecem no molhado.')
  expect((await admin.from('finalization_analyses').select('notes_state').eq('finalization_id', fin).single()).data?.notes_state).toBe('applied')

  // Ao voltar para a tela, a leitura continua lá (vem do banco) e a sugestão não volta.
  await page.reload()
  await expect(page.getByTestId('analysis-card')).toContainText('Ondulado 2B')
  await expect(page.getByTestId('analysis-suggestion')).toHaveCount(0)
})

test('analisar de novo troca a análise na observação, e descartar não mexe em nada', async ({ page }) => {
  mockAnalyze(page, { summary: 'Segunda leitura.', notes: { wet: 'Ondas novas no molhado.', dry: 'Seco novo.', next_day: '' } })
  await login(page)
  await page.goto(`./#/etapa/${ids.wet}`)
  await page.getByRole('button', { name: 'Analisar a finalização de novo com IA' }).click()
  await page.getByRole('group', { name: 'Confirmar análise' }).getByRole('button', { name: 'Analisar' }).click()
  await expect(page.getByTestId('analysis-suggestion')).toContainText('Ondas novas no molhado.')

  // Descartar: some a sugestão, observações intactas.
  await page.getByRole('button', { name: 'Descartar sugestão' }).click()
  await expect(page.getByTestId('analysis-suggestion')).toHaveCount(0)
  await expect.poll(async () => (await admin.from('finalization_analyses').select('notes_state').eq('finalization_id', fin).single()).data?.notes_state).toBe('dismissed')
  expect(await notesOf(ids.dry)).toBe('Mechas firmes.\n\nAnálise: Ondas 2B uniformes, frizz baixo.')

  // De novo e usar: a análise anterior é trocada, não duplicada.
  await page.getByRole('button', { name: 'Analisar a finalização de novo com IA' }).click()
  await page.getByRole('group', { name: 'Confirmar análise' }).getByRole('button', { name: 'Analisar' }).click()
  await page.getByTestId('analysis-suggestion').getByRole('button', { name: 'Usar nos 2 momentos' }).click()
  await expect(page.getByText('2 observações atualizadas.')).toBeVisible()
  expect(await notesOf(ids.dry)).toBe('Mechas firmes.\n\nAnálise: Seco novo.')
  expect(await notesOf(ids.wet)).toBe('Análise: Ondas novas no molhado.')
  await expect(page.getByRole('textbox', { name: 'Observação' })).toHaveValue('Análise: Ondas novas no molhado.')
})

test('limite do dia: avisa e não analisa', async ({ page }) => {
  void page.route('**/functions/v1/analyze-finalization', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
      : json(route, 429, { error: 'analyze_limit' }),
  )
  await login(page)
  await page.goto(`./#/etapa/${ids.wet}`)
  await page.getByRole('button', { name: 'Analisar a finalização de novo com IA' }).click()
  await page.getByRole('group', { name: 'Confirmar análise' }).getByRole('button', { name: 'Analisar' }).click()
  await expect(page.getByText('Você já usou as 10 análises de hoje. Amanhã libera de novo.')).toBeVisible()
})
