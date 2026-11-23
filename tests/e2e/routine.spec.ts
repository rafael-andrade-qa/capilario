// Rotina: a nova finalização começa igual à última; troca só o shampoo e a máscara, tira a
// foto, e o início (Dias), o Comparar e a tela do produto mostram o que mudou.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { adminClient, photoPath, testUser, tinyJpeg, type TestUser } from '../integration/helpers'
import { FRONT } from './images'

const BUCKET = 'capilar-photos'
const admin = adminClient()
test.describe.configure({ mode: 'serial' })

let me: TestUser
const ids: Record<string, string> = {}
let firstFin = ''

test.beforeAll(async () => {
  me = await testUser('rotina-e2e')
  for (const [name, category] of [
    ['Shampoo A', 'shampoo'],
    ['Shampoo B', 'shampoo'],
    ['Máscara M', 'mascara'],
    ['Geleia G', 'geleia'],
  ] as const) {
    const id = randomUUID()
    const r = await me.client.rpc('create_product', { p_experiment_id: id, p_name: name, p_brand: 'Marca', p_category: category })
    if (r.error) throw r.error
    ids[name] = id
  }
  // Finalização de ontem com a Geleia G, depois de Shampoo A e Máscara M (hidratação).
  const stageId = randomUUID()
  firstFin = randomUUID()
  const photo = randomUUID()
  const storage_path = photoPath(me.id, stageId, photo)
  await me.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  const r = await me.client.rpc('finalize_stage', {
    p_experiment_id: ids['Geleia G'],
    p_stage_id: stageId,
    p_photos: [{ id: photo, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
    p_new_experiment: null,
    p_new_stage: { stage_type: 'wet', captured_at: new Date(Date.now() - 26 * 3_600_000).toISOString(), notes: null, finalization_id: firstFin },
  })
  if (r.error) throw r.error
  const s = await me.client.rpc('set_routine', {
    p_finalization_id: firstFin,
    p_items: [
      { experiment_id: ids['Shampoo A'], step: 'wash' },
      { experiment_id: ids['Máscara M'], step: 'mask', mask_kind: 'H' },
      { experiment_id: ids['Geleia G'], step: 'hold' },
    ],
  })
  if (s.error) throw s.error
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
}

const routineOf = async (fin: string) =>
  ((await admin.from('routine_items').select('experiment_id, step, mask_kind').eq('finalization_id', fin).order('position')).data ?? []) as {
    experiment_id: string
    step: string
    mask_kind: string | null
  }[]

test('nova finalização: igual à última, troca o shampoo e a máscara, e segue para as fotos', async ({ page }) => {
  await login(page)
  // O início abre em Dias, com a rotina da finalização e o cronograma.
  await expect(page.getByRole('tab', { name: 'Diário' })).toHaveAttribute('aria-selected', 'true')
  const day = page.getByRole('listitem', { name: /^Finalização de / }).first()
  // Selos curtos: o tipo de cada produto.
  await expect(day.getByRole('list', { name: 'Rotina' }).getByRole('listitem')).toHaveText(['Shampoo', 'Máscara · H', 'Geleia'])
  await expect(page.getByLabel('Cronograma capilar')).toContainText('H')

  await page.getByRole('link', { name: '+ Nova finalização' }).click()
  await expect(page.getByRole('heading', { name: 'O que você usou?' })).toBeVisible()
  await expect(page.locator('.routine-banner')).toContainText('Igual à de ontem')

  await page.getByRole('button', { name: 'Lavar: Shampoo A. Trocar' }).click()
  const sheet = page.getByRole('dialog', { name: 'Lavar: qual produto?' })
  await sheet.getByRole('button', { name: /Shampoo B/ }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Lavar: Shampoo B. Trocar' })).toHaveClass(/changed/)
  await expect(page.getByTestId('routine-summary')).toHaveText('Mudou: lavar.')

  // O tipo da máscara se escolhe na folha do produto; na rotina fica só a etiqueta.
  await expect(page.getByRole('button', { name: 'Máscara: Máscara M. Trocar' })).toContainText('Hidratação')
  await page.getByRole('button', { name: 'Máscara: Máscara M. Trocar' }).click()
  await page.getByRole('dialog', { name: 'Máscara: qual produto?' }).getByRole('radio', { name: 'Nutrição' }).click()
  await expect(page.getByRole('button', { name: 'Máscara: Máscara M. Trocar' })).toContainText('Nutrição')
  await expect(page.getByTestId('routine-summary')).toHaveText('Mudou: lavar e máscara.')

  await page.getByRole('button', { name: 'Continuar para as fotos' }).click()
  await expect(page.getByRole('heading', { name: 'Nova finalização' })).toBeVisible()
  await expect(page.locator('.moment-context')).toContainText('Geleia G')
  await page.getByTestId('gallery-input').setInputFiles([FRONT])
  await expect(page.getByText('Verificando…')).toHaveCount(0)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('Molhado salvo.')).toBeVisible()

  // A rotina foi gravada junto com o primeiro momento.
  const { data } = await admin.from('stages').select('finalization_id').eq('experiment_id', ids['Geleia G']).order('created_at', { ascending: false }).limit(1).single()
  expect(await routineOf(data!.finalization_id)).toEqual([
    { experiment_id: ids['Shampoo B'], step: 'wash', mask_kind: null },
    { experiment_id: ids['Máscara M'], step: 'mask', mask_kind: 'N' },
    { experiment_id: ids['Geleia G'], step: 'hold', mask_kind: null },
  ])

  // Em Dias, a mais nova destaca o que mudou; o cronograma ganha o N.
  const newest = page.getByRole('listitem', { name: /^Finalização de / }).first()
  await expect(newest.locator('.day-chip.changed')).toHaveText(['Shampoo', 'Máscara · N'])
  // Os selos ficam numa linha só, mesmo com muitas etapas.
  const chips = newest.locator('.day-chip')
  const tops = await chips.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  await expect(page.getByLabel('Cronograma capilar').locator('li')).toHaveText(['H', 'N'])
})

test('comparar com a anterior mostra o que mudou', async ({ page }) => {
  await login(page)
  await page.getByRole('listitem', { name: /^Finalização de / }).first().getByRole('button', { name: /^Ações da finalização de / }).click()
  await page.getByRole('menuitem', { name: 'Comparar com a anterior' }).click()
  const changes = page.getByRole('region', { name: 'O que mudou' })
  // Recolhido numa linha embaixo das fotos; tocar abre a tabela.
  await expect(changes.locator('summary')).toHaveText('Mudou: lavar, máscara')
  const grid = (await page.locator('.compare-grid').boundingBox())!
  expect((await changes.boundingBox())!.y).toBeGreaterThan(grid.y + grid.height)
  await changes.locator('summary').click()
  await expect(changes.getByRole('row', { name: /Lavar/ })).toContainText('Shampoo B')
  await expect(changes.getByRole('row', { name: /Lavar/ })).toContainText('Shampoo A')
  await expect(changes.getByRole('row', { name: /Máscara/ })).toContainText('Máscara M (nutrição)')
  await expect(changes).toContainText('Igual nos dois: fixar.')
  await expect(changes).toContainText('troque só ele de uma vez')
})

test('o produto mostra em quais finalizações entrou; a rotina dá para editar depois', async ({ page }) => {
  await login(page)
  await page.getByRole('tab', { name: 'Produtos' }).click()
  const card = page.locator('.experiment', { hasText: 'Shampoo A' })
  await card.locator('.product-toggle').click()
  await card.getByRole('link', { name: 'Como fica com ele' }).click()
  await expect(page.getByRole('heading', { name: 'Shampoo A' })).toBeVisible()
  await expect(page.locator('.insight-sub')).toContainText('em 1 finalização')
  await expect(page.locator('.insight-row')).toHaveCount(1)
  await expect(page.locator('.insight-row')).toContainText('+ Máscara M, Geleia G')

  // Editar a rotina da finalização de ontem: tirar a máscara. Nenhum produto fica preso.
  await page.goto(`./#/rotina/${firstFin}`)
  await expect(page.getByRole('button', { name: 'Tirar Geleia G de Fixar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Máscara: Máscara M. Trocar' })).toContainText('Hidratação')
  await page.getByRole('button', { name: 'Máscara: Máscara M. Trocar' }).click()
  await page.getByRole('dialog', { name: 'Máscara: qual produto?' }).getByRole('button', { name: 'Tirar desta etapa' }).click()
  await page.getByRole('button', { name: 'Salvar rotina' }).click()
  await expect(page.getByText('Rotina salva.')).toBeVisible()
  expect((await routineOf(firstFin)).map((i) => i.step)).toEqual(['wash', 'hold'])
})

test('produto que não está cadastrado: cadastra no meio da rotina e volta com ele na etapa', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: '+ Nova finalização' }).click()
  await page.getByRole('button', { name: 'Adicionar em Finalizar' }).click()
  await page.getByRole('dialog', { name: 'Finalizar: qual produto?' }).getByRole('button', { name: '+ Cadastrar produto' }).click()
  await page.getByRole('button', { name: 'Cadastrar à mão' }).click()
  await page.getByRole('textbox', { name: 'Produto' }).fill('Óleo Pontas')
  await page.getByRole('combobox', { name: 'Marca' }).fill('Marca O')
  await page.getByRole('button', { name: 'Cadastrar produto' }).click()

  await expect(page.getByRole('heading', { name: 'O que você usou?' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Finalizar' }).getByRole('button', { name: 'Finalizar: Óleo Pontas. Trocar' })).toBeVisible()
  // O resto da rotina continua como estava.
  await expect(page.getByRole('button', { name: 'Fixar: Geleia G. Trocar' })).toBeVisible()
  await expect(page.getByTestId('routine-summary')).toHaveText('Mudou: finalizar.')

  // O × ao lado de cada produto tira ele da rotina na hora.
  await page.getByRole('button', { name: 'Tirar Óleo Pontas de Finalizar' }).click()
  await expect(page.getByRole('group', { name: 'Finalizar' }).getByRole('button', { name: /Óleo Pontas/ })).toHaveCount(0)
  await expect(page.getByTestId('routine-summary')).toHaveCount(0)
  // Tirar o finalizador: a finalização passa para Sem finalizador (as fotos vão junto).
  await page.goto(`./#/rotina/${firstFin}`)
  await page.getByRole('button', { name: 'Tirar Geleia G de Fixar' }).click()
  await page.getByRole('button', { name: 'Salvar rotina' }).click()
  await expect(page.getByText('Rotina salva.')).toBeVisible()
  const moved = (await admin.from('finalizations').select('experiment_id').eq('id', firstFin).single()).data!.experiment_id
  expect((await admin.from('experiments').select('product_mode').eq('id', moved).single()).data!.product_mode).toBe('none')
  expect(((await admin.from('stages').select('experiment_id').eq('finalization_id', firstFin)).data ?? []).map((x) => x.experiment_id)).toEqual([moved])
})
