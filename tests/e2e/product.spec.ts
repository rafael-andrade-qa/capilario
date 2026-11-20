// Histórico recolhido por produto, busca e foto do produto.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { adminClient, photoPath, testUser, tinyJpeg, type TestUser } from '../integration/helpers'
import { BACK, FRONT, LEFT } from './images'

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
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()
}

const toggle = (page: Page, name: string) => page.locator('.experiment', { hasText: name }).locator('.product-toggle')

test('produtos recolhidos: tudo fechado ao abrir o app, busca e abrir/fechar', async ({ page }) => {
  await login(page)
  await expect(page.locator('.experiment:not(.fixed-product)')).toHaveCount(7)
  // Ao abrir o app, tudo começa recolhido.
  await expect(page.locator('.experiment.open')).toHaveCount(0)
  await expect(page.locator('.moment-tile')).toHaveCount(0)
  await toggle(page, 'Gelatina Supervolume').click()
  await expect(toggle(page, 'Gelatina Supervolume')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.moment-tile')).toHaveCount(1)

  // Abrir outro não fecha o primeiro.
  await toggle(page, 'Óleo Finalizador').click()
  await expect(page.locator('.experiment.open')).toHaveCount(2)
  await toggle(page, 'Óleo Finalizador').click()
  await expect(page.locator('.experiment.open')).toHaveCount(1)

  // Busca (aparece a partir de 6 produtos), sem diferenciar acentos.
  const search = page.getByRole('searchbox', { name: 'Buscar produto ou marca' })
  await search.fill('linhaca')
  await expect(page.locator('.experiment')).toHaveCount(1)
  await search.fill('widi')
  await expect(page.locator('.experiment')).toHaveCount(3)
  await search.fill('nada disso')
  await expect(page.getByText('Nenhum produto com “nada disso”.')).toBeVisible()
  await search.fill('')

  // Abrir, entrar numa etapa e voltar mantém o que estava aberto.
  await toggle(page, 'Creme Leave-in').click()
  await page.locator('.experiment', { hasText: 'Creme Leave-in' }).locator('.moment-tile').click()
  await expect(page.getByRole('heading', { name: 'Seco' })).toBeVisible()
  await page.getByRole('link', { name: 'Voltar ao histórico' }).click()
  await expect(toggle(page, 'Creme Leave-in')).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle(page, 'Gelatina Supervolume')).toHaveAttribute('aria-expanded', 'true')
})

test('editar produto: corrigir nome e marca e trocar a foto da embalagem', async ({ page }) => {
  await login(page)
  const product = products.find((p) => p.name === 'Gelatina Supervolume')!
  const card = page.locator('.experiment', { hasText: 'Gelatina Supervolume' })
  await card.locator('.product-toggle').click()
  // Ações do produto juntas à direita: nova finalização, editar e excluir.
  const actions = card.locator('.product-actions')
  await expect(actions.getByRole('link', { name: 'Nova finalização com Gelatina Supervolume' })).toBeVisible()
  await actions.getByRole('link', { name: 'Editar produto Gelatina Supervolume' }).click()

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
  const renamed = page.locator('.experiment', { hasText: 'Gelatina Supervolume Plus' })
  await expect(renamed.locator('.brand-name')).toHaveText('Marca Corrigida')
  await expect(renamed.locator('.product-thumb img')).toHaveAttribute('src', new RegExp(`produto-${product.id}`))
  product.name = 'Gelatina Supervolume Plus'

  // Trocar a foto apaga a anterior.
  const first = (await admin.from('experiments').select('photo_path').eq('id', product.id).single()).data!.photo_path as string
  await renamed.getByRole('link', { name: 'Editar produto Gelatina Supervolume Plus' }).click()
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
  const card = page.locator('.experiment', { hasText: 'Óleo Finalizador' })
  await card.locator('.product-toggle').click()
  await card.locator('.moment-tile').click()
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

test('excluir um produto inteiro pela lixeira', async ({ page }) => {
  await login(page)
  const product = products.find((p) => p.name === 'Óleo Finalizador')!
  await toggle(page, 'Óleo Finalizador').click()
  await page.getByRole('button', { name: 'Excluir produto Óleo Finalizador' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Excluir este produto?' })
  await expect(dialog).toContainText('A finalização e a foto serão apagadas')
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Produto excluído.')).toBeVisible()
  await expect(page.locator('.experiment', { hasText: 'Óleo Finalizador' })).toHaveCount(0)
  const { data } = await admin.from('experiments').select('id').eq('id', product.id)
  expect(data).toEqual([])
})

test('novo produto com foto da embalagem; registrar a finalização depois', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: '+ Novo produto' }).click()
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

  // Sem finalização ainda: aparece aberto, com o convite para registrar.
  await expect(page.getByText('Produto cadastrado.')).toBeVisible()
  const card = page.locator('.experiment', { hasText: 'Máscara Nova' })
  await expect(card).toHaveClass(/open/)
  await expect(card.locator('.experiment-sub')).toContainText('Nenhuma finalização ainda')
  await expect(card.locator('.product-thumb img')).toHaveAttribute('src', /produto-/)
  const { data } = await admin.from('experiments').select('id, photo_path, brand, stages(id)').eq('product_name', 'Máscara Nova').eq('user_id', me.id).single()
  expect(data!.brand).toBe('Marca Nova')
  expect(data!.photo_path).toMatch(/\/produto-/)
  expect(data!.stages).toEqual([])

  // Registrar depois, dentro do produto: uma tela só, sem perguntar o produto.
  await card.getByRole('link', { name: '+ Registrar finalização' }).click()
  await expect(page.getByRole('heading', { name: 'Nova finalização' })).toBeVisible()
  await expect(page.locator('.moment-context')).toContainText('Máscara Nova')
  await page.getByTestId('gallery-input').setInputFiles([FRONT])
  await expect(page.getByText('Verificando…')).toHaveCount(0)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('Molhado salvo.')).toBeVisible()
  await expect(card.locator('.fin')).toHaveCount(1)
  const after = await admin.from('experiments').select('id').eq('product_name', 'Máscara Nova').eq('user_id', me.id)
  expect(after.data).toEqual([{ id: data!.id }])
})

test('Sem finalizador fica sempre na lista e pode ser usado sem cadastro', async ({ page }) => {
  await login(page)
  // Sempre o primeiro da lista, antes dos produtos (mesmo dos mais recentes).
  await expect(page.locator('.product-list .experiment').first()).toContainText('Sem finalizador')
  const row = page.locator('.experiment', { hasText: 'Sem finalizador' })
  await expect(row.locator('.experiment-sub')).toContainText('Para quando você não usou produto')
  await row.locator('.product-toggle').click()
  await row.getByRole('link', { name: '+ Registrar finalização' }).click()
  await expect(page.locator('.moment-context')).toContainText('Sem finalizador')
  await page.locator('label.seg', { hasText: 'Seco' }).click()
  await page.getByTestId('gallery-input').setInputFiles([LEFT])
  await expect(page.getByText('Verificando…')).toHaveCount(0)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('Seco salvo.')).toBeVisible()
  const { data } = await admin.from('experiments').select('id').eq('user_id', me.id).eq('product_mode', 'none')
  expect(data).toHaveLength(1)
  await expect(page.locator('.experiment', { hasText: 'Sem finalizador' }).locator('.experiment-sub')).toContainText('1 finalização')
  // Depois de usado, continua fixo no topo.
  await expect(page.locator('.product-list .experiment').first()).toContainText('Sem finalizador')
})
