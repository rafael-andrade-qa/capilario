// Histórico recolhido por produto, busca e foto do produto.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { adminClient, photoPath, testUser, tinyJpeg, type TestUser } from '../integration/helpers'
import { BACK, FRONT, LEFT } from './images'

/** "+ Novo produto": na aba Produtos (no início vazio, o link do cartão). */
async function newProduct(page: Page) {
  const tab = page.getByRole('tab', { name: 'Produtos' })
  await expect(tab.or(page.getByRole('link', { name: 'Novo produto' })).first()).toBeVisible()
  if (await tab.count()) await tab.click()
  await page.getByRole('link', { name: 'Novo produto' }).click()
}

// Estes testes usam a lista de produtos: o início abre na aba Produtos.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('capilar:inicio:aba', 'produtos'))
})

const BUCKET = 'capilar-photos'
const admin = adminClient()

test.describe.configure({ mode: 'serial' })

let me: TestUser
const products: { id: string; name: string; brand: string }[] = []

async function seedProduct(name: string, brand: string, day: number) {
  const experimentId = randomUUID()
  const stageId = randomUUID()
  const id = randomUUID()
  const storage_path = photoPath(me.id, stageId, id)
  const up = await me.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const r = await me.client.rpc('finalize_stage', {
    p_experiment_id: experimentId,
    p_stage_id: stageId,
    p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
    p_new_experiment: { product_mode: 'named', product_name: name, brand },
    p_new_stage: { stage_type: 'dry', captured_at: `2026-11-${String(day).padStart(2, '0')}T10:00:00-03:00`, notes: null },
  })
  if (r.error) throw r.error
  products.push({ id: experimentId, name, brand })
}

test.beforeAll(async () => {
  me = await testUser('produtos-e2e')
  const names = ['Óleo Finalizador', 'Creme Leave-in', 'Mousse Volumizadora', 'Gel de Linhaça', 'Spray Texturizador', 'Creme de Pentear', 'Gelatina Supervolume']
  for (const [i, n] of names.entries()) await seedProduct(n, i % 2 ? 'Widi Care' : 'Outra Marca', i + 1)
})

async function login(page: Page) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha', { exact: true }).fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
}

const row = (page: Page, name: string) => page.locator('.shelf-row', { hasText: name })
/** Abre a tela do produto pela prateleira. */
async function openProduct(page: Page, name: string) {
  await row(page, name).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

test('prateleira: uma linha por produto, por etapa; busca; produto, dia e momento', async ({ page }) => {
  await login(page)
  await expect(page.locator('.shelf-row')).toHaveCount(7)
  await expect(page.locator('.moment-tile')).toHaveCount(0)

  // Busca (ao lado do "+", a partir de 2 produtos), sem diferenciar acentos.
  const search = page.getByRole('searchbox', { name: 'Buscar produto ou marca' })
  await search.fill('linhaca')
  await expect(page.locator('.shelf-row')).toHaveCount(1)
  await search.fill('widi')
  await expect(page.locator('.shelf-row')).toHaveCount(3)
  await search.fill('nada disso')
  await expect(page.getByText('Nenhum produto com “nada disso”.')).toBeVisible()
  await search.fill('')

  // Produto → o dia em que entrou → o momento.
  await openProduct(page, 'Creme Leave-in')
  await page.locator('.insight-row').first().click()
  await expect(page.locator('.moment-tile')).toHaveCount(1)
  await page.locator('.moment-tile').click()
  await expect(page.getByRole('heading', { name: 'Seco' })).toBeVisible()
})

test('editar produto: corrigir nome e marca e trocar a foto da embalagem', async ({ page }) => {
  await login(page)
  const product = products.find((p) => p.name === 'Gelatina Supervolume')!
  await openProduct(page, 'Gelatina Supervolume')
  // Ações do produto na tela dele: nova finalização, editar e excluir.
  await expect(page.getByRole('link', { name: 'Nova finalização com Gelatina Supervolume' })).toBeVisible()
  await page.getByRole('link', { name: 'Editar produto Gelatina Supervolume' }).click()

  await expect(page.getByRole('heading', { name: 'Editar produto' })).toBeVisible()
  await expect(page.getByText('Vale para a finalização deste produto.')).toBeVisible()
  // Nome igual a outro produto do histórico é recusado.
  await page.getByRole('textbox', { name: 'Produto' }).fill('creme de pentear')
  await page.getByRole('combobox', { name: 'Marca' }).fill('widi care')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Já existe um produto com esse nome e essa marca no seu histórico.')).toBeVisible()

  await page.getByRole('textbox', { name: 'Produto' }).fill('Gelatina Supervolume Plus')
  await page.getByRole('combobox', { name: 'Marca' }).fill('Marca Corrigida')
  await page.getByTestId('edit-product-photo').setInputFiles([FRONT])
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Produto atualizado.')).toBeVisible()
  const renamed = row(page, 'Gelatina Supervolume Plus')
  await expect(renamed.locator('.shelf-meta')).toContainText('Marca Corrigida')
  await expect(renamed.locator('img')).toHaveAttribute('src', new RegExp(`produto-${product.id}`))
  product.name = 'Gelatina Supervolume Plus'

  // Trocar a foto apaga a anterior.
  const first = (await admin.from('experiments').select('photo_path').eq('id', product.id).single()).data!.photo_path as string
  await openProduct(page, 'Gelatina Supervolume Plus')
  await page.getByRole('link', { name: 'Editar produto Gelatina Supervolume Plus' }).click()
  await page.getByTestId('edit-product-photo').setInputFiles([LEFT])
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Produto atualizado.')).toBeVisible()
  // O aviso anterior pode ainda estar na tela: confere no banco.
  await expect
    .poll(async () => (await admin.from('experiments').select('photo_path').eq('id', product.id).single()).data!.photo_path)
    .not.toBe(first)
  const { data } = await admin.from('experiments').select('product_name').eq('id', product.id).single()
  expect(data!.product_name).toBe('Gelatina Supervolume Plus')
  await expect.poll(async () => (await admin.storage.from(BUCKET).exists(first)).data).toBe(false)
})

test('editar fotos do momento: trocar, adicionar no ângulo vazio e remover', async ({ page }) => {
  await login(page)
  await openProduct(page, 'Óleo Finalizador')
  await page.locator('.insight-row').first().click()
  await page.locator('.moment-tile').first().click()
  await expect(page.getByRole('heading', { name: 'Seco' })).toBeVisible()
  const stageId = page.url().split('/etapa/')[1]
  const before = (await admin.from('photos').select('id, angle, storage_path').eq('stage_id', stageId)).data!
  expect(before.map((p) => p.angle)).toEqual(['front'])

  await page.getByRole('button', { name: 'Editar fotos' }).click()
  // Única foto: não dá para remover (para apagar tudo, exclui o momento).
  await expect(page.getByRole('button', { name: 'Remover foto: Frente' })).toHaveCount(0)

  // Trocar a Frente.
  await page.getByRole('button', { name: 'Trocar foto: Frente' }).click()
  await page.getByTestId('detail-photo-input').setInputFiles([LEFT])
  await expect(page.getByText('Foto de Frente trocada.')).toBeVisible()
  await expect.poll(async () => (await admin.storage.from(BUCKET).exists(before[0].storage_path)).data).toBe(false)

  // Pôr foto nas Costas, que estavam vazias.
  await page.getByRole('button', { name: 'Adicionar foto: Costas' }).click()
  await page.getByTestId('detail-photo-input').setInputFiles([BACK])
  await expect(page.getByText('Foto de Costas adicionada.')).toBeVisible()

  // Remover pede um segundo toque.
  await page.getByRole('button', { name: 'Remover foto: Costas' }).click()
  await page.getByRole('button', { name: 'Confirmar remoção: Costas' }).click()
  await expect(page.getByText('Foto de Costas removida.')).toBeVisible()

  await page.getByRole('button', { name: 'Concluir edição das fotos' }).click()
  await expect(page.locator('.angle-cell img')).toHaveCount(1)
  const after = (await admin.from('photos').select('id, angle').eq('stage_id', stageId)).data!
  expect(after.map((p) => p.angle)).toEqual(['front'])
  expect(after[0].id).not.toBe(before[0].id)
})

test('excluir um produto: ele sai das rotinas e as finalizações e fotos continuam', async ({ page }) => {
  await login(page)
  const product = products.find((p) => p.name === 'Óleo Finalizador')!
  const before = (await admin.from('stages').select('id, finalization_id').eq('experiment_id', product.id)).data ?? []
  expect(before.length).toBeGreaterThan(0)
  await openProduct(page, 'Óleo Finalizador')
  await page.getByRole('button', { name: 'Excluir produto Óleo Finalizador' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Excluir este produto?' })
  await expect(dialog).toContainText('as finalizações e as fotos continuam')
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Produto excluído.')).toBeVisible()
  await expect(row(page, 'Óleo Finalizador')).toHaveCount(0)
  expect((await admin.from('experiments').select('id').eq('id', product.id)).data).toEqual([])
  // Os momentos continuam, agora em Sem finalizador.
  const after = (await admin.from('stages').select('id, experiment_id').in('id', before.map((x) => x.id))).data ?? []
  expect(after).toHaveLength(before.length)
  const owner = (await admin.from('experiments').select('product_mode').eq('id', after[0].experiment_id).single()).data!
  expect(owner.product_mode).toBe('none')
})

test('novo produto com foto da embalagem; registrar a finalização depois', async ({ page }) => {
  await login(page)
  await newProduct(page)
  await page.getByRole('button', { name: 'Cadastrar à mão' }).click()
  await expect(page.getByRole('heading', { name: 'Novo produto' })).toBeVisible()
  // Produto repetido (mesmo nome e marca, sem diferenciar maiúsculas e acentos) é recusado.
  await page.getByRole('textbox', { name: 'Produto' }).fill('creme de pentear')
  await page.getByRole('combobox', { name: 'Marca' }).fill('WIDI CARE')
  await page.getByRole('button', { name: 'Cadastrar produto' }).click()
  await expect(page.getByText('Já existe um produto com esse nome e essa marca no seu histórico.')).toBeVisible()

  await page.getByRole('textbox', { name: 'Produto' }).fill('Máscara Nova')
  await page.getByRole('combobox', { name: 'Marca' }).fill('Marca Nova')
  await page.getByTestId('edit-product-photo').setInputFiles([BACK])
  await page.getByRole('button', { name: 'Cadastrar produto' }).click()
  await expect(page.getByRole('heading', { name: 'Produto cadastrado' })).toBeVisible()
  await expect(page.getByText('Quer registrar a primeira finalização com ele agora?')).toBeVisible()
  await page.getByRole('link', { name: 'Depois' }).click()

  // Sem finalização ainda: a linha diz isso e já tem a foto da embalagem.
  await expect(page.getByText('Produto cadastrado.')).toBeVisible()
  const card = row(page, 'Máscara Nova')
  await expect(card.locator('.shelf-meta')).toContainText('nenhuma finalização ainda')
  await expect(card.locator('img')).toHaveAttribute('src', /produto-/)
  const { data } = await admin.from('experiments').select('id, photo_path, brand, stages(id)').eq('product_name', 'Máscara Nova').eq('user_id', me.id).single()
  expect(data!.brand).toBe('Marca Nova')
  expect(data!.photo_path).toMatch(/\/produto-/)
  expect(data!.stages).toEqual([])

  // Registrar depois, pela tela do produto: a rotina já vem com ele.
  await openProduct(page, 'Máscara Nova')
  await page.getByRole('link', { name: 'Nova finalização com Máscara Nova' }).click()
  // Primeiro a rotina (já com o produto, fixo); depois as fotos.
  await expect(page.getByRole('heading', { name: 'O que você usou?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fixar: Máscara Nova. Trocar' })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar para as fotos' }).click()
  await expect(page.getByRole('heading', { name: 'Nova finalização' })).toBeVisible()
  await expect(page.locator('.moment-context')).toContainText('Máscara Nova')
  await page.getByTestId('gallery-input').setInputFiles([FRONT])
  await expect(page.getByText('Verificando…')).toHaveCount(0)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('Molhado salvo.')).toBeVisible()
  await page.getByRole('tab', { name: 'Produtos' }).click()
  await expect(card.locator('.shelf-meta')).toContainText('1 finalização')
  const after = await admin.from('experiments').select('id').eq('product_name', 'Máscara Nova').eq('user_id', me.id)
  expect(after.data).toEqual([{ id: data!.id }])
})

test('dia sem finalizador: vem da rotina sem finalizador, ganha o selo e não vira produto', async ({ page }) => {
  await login(page)
  // A prateleira só tem produtos de verdade.
  await expect(row(page, 'Sem finalizador')).toHaveCount(0)

  await page.getByRole('link', { name: '+ Nova finalização' }).click()
  await page.getByRole('button', { name: 'Começar do zero' }).click()
  await page.getByRole('button', { name: 'Continuar para as fotos' }).click()
  await expect(page.locator('.moment-context')).toContainText('Sem finalizador')
  await page.locator('label.seg', { hasText: 'Seco' }).click()
  await page.getByTestId('gallery-input').setInputFiles([LEFT])
  await expect(page.getByText('Verificando…')).toHaveCount(0)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('Seco salvo.')).toBeVisible()
  const { data } = await admin.from('experiments').select('id').eq('user_id', me.id).eq('product_mode', 'none')
  expect(data).toHaveLength(1)

  // No Diário, o dia mostra o selo; na aba Produtos, continua sem "Sem finalizador".
  await page.getByRole('tab', { name: 'Diário' }).click()
  await expect(page.locator('.day-chip-none', { hasText: 'Sem finalizador' }).first()).toBeVisible()
  await page.getByRole('tab', { name: 'Produtos' }).click()
  await expect(row(page, 'Sem finalizador')).toHaveCount(0)
})
