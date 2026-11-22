// Critérios de aceite A1–A9 exercitados no navegador (viewport de celular),
// com build no subcaminho do GitHub Pages e Supabase local.
import { expect, test, type Page } from '@playwright/test'
import { adminClient, testUser, type TestUser } from '../integration/helpers'
import { BACK, FRONT, LEFT, RIGHT, noisyPng, type TestFile } from './images'
import { thumbPath } from '../../src/lib/images'

const BUCKET = 'capilar-photos'
const admin = adminClient()

let me: TestUser
let other: TestUser
const ids: Record<string, string> = {}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  me = await testUser('rafael-e2e')
  other = await testUser('outra-e2e')
})

async function login(page: Page, user: TestUser) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha').fill(user.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()
}

async function pick(page: Page, files: TestFile[]) {
  await page.getByTestId('gallery-input').setInputFiles(files)
  await expect(page.getByText('Verificando…')).toHaveCount(0)
}

const slot = (page: Page, angle: string) => page.locator(`.slot[data-angle=${angle}]`)
const stageRadio = (page: Page, label: string) => page.locator('label.seg', { hasText: label })
const saveButton = (page: Page) => page.getByRole('button', { name: 'Salvar', exact: true })
const productInput = (page: Page) => page.getByRole('textbox', { name: 'Produto' })
const brandInput = (page: Page) => page.getByRole('combobox', { name: 'Marca' })

/** Cadastra o produto (Novo produto) e segue para a primeira finalização dele. */
async function newProduct(page: Page, name: string, brand: string) {
  await page.getByRole('link', { name: '+ Novo produto' }).click()
  await page.getByRole('button', { name: 'Cadastrar à mão' }).click()
  await productInput(page).fill(name)
  await brandInput(page).fill(brand)
  await page.getByRole('button', { name: 'Cadastrar produto' }).click()
  await expect(page.getByRole('heading', { name: 'Produto cadastrado' })).toBeVisible()
  await page.getByRole('link', { name: 'Registrar finalização' }).click()
  await expect(page.locator('.moment-context')).toContainText(name)
}

/** Nova finalização no produto fixo Sem finalizador. */
async function noFinisherFinalization(page: Page) {
  await page.goto('./#/produto/sem-finalizador/nova-finalizacao')
  await expect(page.locator('.moment-context')).toContainText('Sem finalizador')
}

async function saveAndGetStage(page: Page): Promise<string> {
  await saveButton(page).click()
  await page.waitForURL(/salvo=/)
  await expect(page.getByText(/^(Molhado|Seco|Dia seguinte) salvo\.$/)).toBeVisible()
  return new URL(page.url()).hash.split('salvo=')[1]
}

async function photosOf(stageId: string) {
  const { data, error } = await admin.from('photos').select('id, angle, storage_path, mime_type').eq('stage_id', stageId)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((p) => [p.angle, p])) as Record<string, { id: string; storage_path: string; mime_type: string }>
}

const isThumb = (url: string) => new URL(url).pathname.endsWith('_t.jpg')

async function bytesOf(path: string): Promise<Buffer> {
  const { data, error } = await admin.storage.from(BUCKET).download(path)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

async function counts(userId: string) {
  const [e, s, p] = await Promise.all(
    ['experiments', 'stages', 'photos'].map((t) => admin.from(t).select('id', { count: 'exact', head: true }).eq('user_id', userId)),
  )
  return { experiments: e.count, stages: s.count, photos: p.count }
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('A1: quatro fotos em um envio, troca de posição antes de salvar', async ({ page }) => {
  await login(page, me)
  await expect(page.getByText('Comece pelo produto que você vai testar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Comparar' })).toBeDisabled()
  await noHorizontalScroll(page)

  // Cadastrar produto: só nome, marca e (opcional) a foto da embalagem; nome e marca obrigatórios.
  await page.getByRole('link', { name: '+ Novo produto' }).click()
  await page.getByRole('button', { name: 'Cadastrar à mão' }).click()
  await page.getByRole('button', { name: 'Cadastrar produto' }).click()
  await expect(page.getByText('Informe o nome do produto.')).toBeVisible()
  await productInput(page).fill('Ondulando a Gema')
  await page.getByRole('button', { name: 'Cadastrar produto' }).click()
  await expect(page.getByText('Informe a marca do produto.')).toBeVisible()
  await brandInput(page).fill('Gema Labs')
  await noHorizontalScroll(page)
  await page.getByRole('button', { name: 'Cadastrar produto' }).click()
  await expect(page.getByRole('heading', { name: 'Produto cadastrado' })).toBeVisible()
  await page.getByRole('link', { name: 'Registrar finalização' }).click()

  // Nova finalização numa tela só: produto conhecido, Molhado já marcado.
  await expect(page.getByRole('heading', { name: 'Nova finalização' })).toBeVisible()
  await expect(page.locator('.moment-context')).toContainText('Ondulando a Gema')
  await expect(stageRadio(page, 'Molhado')).toHaveClass(/on/)
  // Troca Frente <-> Esquerdo por toque.
  await pick(page, [FRONT, LEFT, RIGHT, BACK])
  await noHorizontalScroll(page)
  await slot(page, 'front').locator('.slot-target').click()
  await slot(page, 'left').locator('.slot-target').click()
  await expect(slot(page, 'front').locator('.slot-target')).toHaveAttribute('aria-label', /esquerdo\.png/)
  ids.wet = await saveAndGetStage(page)

  await expect(page.locator('.experiment:not(.fixed-product)')).toHaveCount(1)
  await expect(page.locator('.moment-tile')).toHaveCount(1)
  const photos = await photosOf(ids.wet)
  expect(Object.keys(photos).sort()).toEqual(['back', 'front', 'left', 'right'])
  expect((await bytesOf(photos.front.storage_path)).equals(LEFT.buffer)).toBe(true)
  expect((await bytesOf(photos.left.storage_path)).equals(FRONT.buffer)).toBe(true)
  expect((await bytesOf(photos.right.storage_path)).equals(RIGHT.buffer)).toBe(true)
  expect((await bytesOf(photos.back.storage_path)).equals(BACK.buffer)).toBe(true)
})

test('A2: + Seco completa a finalização direto nas fotos; observação e favorita persistem', async ({ page }) => {
  await login(page, me)
  // Ao abrir o app tudo vem recolhido: abre o produto.
  await page.locator('.experiment:not(.fixed-product) .product-toggle').first().click()
  // A finalização de hoje tem o Molhado; o próximo momento aparece como atalho.
  const fin = page.locator('.fin').first()
  await expect(fin.locator('.fin-when')).toHaveText('Hoje')
  await expect(fin.locator('.moment-add.next')).toContainText('Seco')
  await fin.getByRole('link', { name: 'Registrar Seco da finalização de Hoje' }).click()

  // Uma tela só: produto e finalização já são conhecidos.
  await expect(page.getByRole('heading', { name: 'Seco' })).toBeVisible()
  await expect(page.locator('.moment-context')).toContainText('Ondulando a Gema')
  await expect(page.getByText('Passo 1 de 2')).toHaveCount(0)
  await page.getByLabel('Observação').fill('Macio e solto.')
  await pick(page, [FRONT, LEFT, RIGHT, BACK])
  ids.dry = await saveAndGetStage(page)

  await expect(page.locator('.experiment:not(.fixed-product)')).toHaveCount(1)
  await expect(page.locator('.fin')).toHaveCount(1)
  await expect(page.locator('.fin .moment-tile')).toHaveCount(2)
  await expect(page.locator('.fin .moment-add.next')).toContainText('Dia seguinte')
  const { data: st } = await admin.from('stages').select('finalization_id').in('id', [ids.wet, ids.dry])
  expect(new Set(st!.map((r) => r.finalization_id)).size).toBe(1)

  await page.locator(`a[href="#/etapa/${ids.dry}"]`).click()
  const fav = page.getByRole('button', { name: 'Favorita' })
  await expect(fav).toHaveAttribute('aria-pressed', 'false')
  await fav.click()
  await expect(fav).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Observação').fill('Macio e solto. Gostei do volume.')
  await page.getByRole('button', { name: 'Salvar observação' }).click()
  await expect(page.getByText('Observação salva.')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Favorita' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Observação')).toHaveValue('Macio e solto. Gostei do volume.')
  await expect(page.getByText('Ondulando a Gema', { exact: false })).toBeVisible()
})

test('A3: salvar com duas fotos e completar depois na mesma etapa', async ({ page }) => {
  await login(page, me)
  await noFinisherFinalization(page)
  await stageRadio(page, 'Seco').click()
  await pick(page, [FRONT, LEFT])
  ids.dryNone = await saveAndGetStage(page)
  expect(Object.keys(await photosOf(ids.dryNone)).sort()).toEqual(['front', 'left'])

  await page.locator(`a[href="#/etapa/${ids.dryNone}"]`).click()
  await expect(page.locator('.angle-cell img')).toHaveCount(2)
  await page.getByRole('link', { name: 'Adicionar foto: Direito' }).click()
  await expect(slot(page, 'front').getByText('Publicada')).toBeVisible()
  await pick(page, [RIGHT, BACK])
  await saveButton(page).click()
  await page.waitForURL(new RegExp(`#/etapa/${ids.dryNone}$`))
  await expect(page.locator('.angle-cell img')).toHaveCount(4)

  const photos = await photosOf(ids.dryNone)
  expect(Object.keys(photos).sort()).toEqual(['back', 'front', 'left', 'right'])
  expect((await bytesOf(photos.right.storage_path)).equals(RIGHT.buffer)).toBe(true)
  const c = await counts(me.id)
  expect(c).toEqual({ experiments: 2, stages: 3, photos: 12 })
})

test('A4: compara só a mesma etapa; Seco × Seco entre experimentos', async ({ page }) => {
  await login(page, me)
  await page.getByRole('button', { name: 'Comparar' }).click()
  await noHorizontalScroll(page)

  // Um só Molhado e nenhum Dia seguinte: não há par, então essas etapas nem ficam clicáveis.
  await expect(page.getByRole('radio', { name: 'Molhado' })).toBeDisabled()
  await expect(page.getByRole('radio', { name: 'Dia seguinte' })).toBeDisabled()
  await expect(page.getByRole('radio', { name: 'Seco' })).toHaveAttribute('aria-checked', 'true')

  // Dois registros Seco: cada lista esconde o que está do outro lado, então sobra uma
  // opção só e o campo fica fixo, sem abrir lista.
  await page.goto(`./#/comparar?a=${ids.dry}&b=${ids.dryNone}`)
  await expect(page.getByTestId('select-a')).toHaveAttribute('data-value', ids.dry)
  await expect(page.getByTestId('select-b')).toHaveAttribute('data-value', ids.dryNone)
  await expect(page.getByTestId('select-a')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('select-b')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.locator('.dd-chev')).toHaveCount(0)
  await page.getByTestId('select-a').click({ force: true })
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Frente' })).toHaveAttribute('aria-selected', 'true')

  const dry = await photosOf(ids.dry)
  const none = await photosOf(ids.dryNone)
  for (const angle of ['front', 'left', 'right', 'back'] as const) {
    const label = { front: 'Frente', left: 'Esquerdo', right: 'Direito', back: 'Costas' }[angle]
    await page.getByRole('tab', { name: label }).click()
    await expect(page.getByTestId('side-A').locator('img')).toHaveAttribute('src', new RegExp(dry[angle].storage_path))
    await expect(page.getByTestId('side-B').locator('img')).toHaveAttribute('src', new RegExp(none[angle].storage_path))
  }
  // Legenda: o produto; embaixo data, horário e marca na mesma linha.
  await expect(page.getByTestId('side-A').locator('figcaption')).toContainText('A · Ondulando a Gema')
  await expect(page.getByTestId('side-A').locator('.compare-sub')).toContainText(/\d{2}\/\d{2} \d{2}:\d{2}/)
  await expect(page.getByTestId('side-A').locator('.compare-sub')).toContainText('· Gema Labs')
  // Observação só ao tocar no balão.
  await expect(page.getByTestId('side-A').locator('figcaption')).not.toContainText('Gostei do volume.')
  await page.getByRole('button', { name: 'Observação de A' }).click()
  await expect(page.getByTestId('side-A').locator('figcaption')).toContainText('Gostei do volume.')
  await expect(page.getByTestId('side-B').locator('figcaption')).toContainText('Sem finalizador')
  await noHorizontalScroll(page)

  // Recarregar o comparador mantém etapa, seleção e ângulo (A8).
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Costas' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('side-B').locator('img')).toHaveAttribute('src', new RegExp(none.back.storage_path))

  // Pedir Molhado × Seco pela URL não vale: sem outro Molhado, não há B.
  await page.goto(`./#/comparar?a=${ids.wet}&b=${ids.dry}`)
  await expect(page.getByRole('radio', { name: 'Molhado' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText(/Só há 1 registro Molhado/)).toBeVisible()
  await expect(page.getByTestId('side-B')).toHaveCount(0)
})

test('A5: só os ângulos que os dois registros têm ficam clicáveis', async ({ page }) => {
  await login(page, me)
  await newProduct(page, 'Gelatina A5', 'Marca Teste')
  await stageRadio(page, 'Seco').click()
  await pick(page, [BACK])
  // A foto entra em Frente; move para Costas tocando nos dois espaços.
  await slot(page, 'front').locator('.slot-target').click()
  await slot(page, 'back').locator('.slot-target').click()
  ids.backOnly = await saveAndGetStage(page)
  const card = page.locator('.experiment', { hasText: 'Gelatina A5' })
  await expect(card.locator('.product-name')).toHaveText('Gelatina A5')
  await expect(card.locator('.brand-name')).toHaveText('Marca Teste')
  // O momento com 1 de 4 fotos mostra o contador na miniatura.
  await expect(card.locator('.count-pill')).toHaveText('1/4')

  // Três registros Seco: a lista de A abre logo abaixo do campo, com a mesma largura,
  // e não oferece o registro que já está em B.
  await page.goto(`./#/comparar?a=${ids.backOnly}&b=${ids.dry}`)
  await expect(page.getByRole('radio', { name: 'Seco' })).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('select-a').click()
  const listA = page.getByRole('listbox', { name: 'Registro A' })
  await expect(listA.getByRole('option')).toHaveCount(2)
  await expect(listA.locator(`[data-value="${ids.dry}"]`)).toHaveCount(0)
  const tb = (await page.getByTestId('select-a').boundingBox())!
  const lb = (await listA.boundingBox())!
  expect(lb.y).toBeGreaterThanOrEqual(tb.y + tb.height)
  expect(Math.abs(lb.width - tb.width)).toBeLessThanOrEqual(1)
  await page.keyboard.press('Escape')
  await expect(listA).toHaveCount(0)

  // Só Costas está nos dois: os outros ângulos ficam desativados.
  await expect(page.getByRole('tab', { name: 'Costas' })).toHaveAttribute('aria-selected', 'true')
  for (const label of ['Frente', 'Esquerdo', 'Direito']) await expect(page.getByRole('tab', { name: label })).toBeDisabled()
  await expect(page.getByTestId('side-A').locator('img')).toHaveAttribute('src', new RegExp((await photosOf(ids.backOnly)).back.storage_path))
  // Um ângulo pedido pela URL que só um lado tem volta para o ângulo em comum.
  await page.goto(`./#/comparar?a=${ids.backOnly}&b=${ids.dry}&angulo=front`)
  await expect(page.getByRole('tab', { name: 'Costas' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Sem foto deste ângulo')).toHaveCount(0)
})

test('A6: falha no envio, nova tentativa e toque repetido não duplicam', async ({ page }) => {
  await login(page, me)
  const before = await counts(me.id)
  let posts = 0
  await page.route('**/storage/v1/object/capilar-photos/**', async (route) => {
    // Conta só as fotos (a miniatura sobe junto e, se falhar, não impede salvar).
    if (route.request().method() === 'POST' && !isThumb(route.request().url()) && ++posts === 2) return route.abort('failed')
    return route.continue()
  })

  await newProduct(page, 'Creme teste A6', 'Marca A6')
  await page.getByLabel('Observação').fill('nota preservada')
  await pick(page, [FRONT, LEFT, RIGHT, BACK])
  // Dois toques seguidos em Salvar.
  await saveButton(page).evaluate((b: HTMLButtonElement) => {
    b.click()
    b.click()
  })
  await expect(page.getByText('1 foto não foi enviada.')).toBeVisible()
  await expect(page.locator('.moment-context')).toContainText('Creme teste A6')
  await expect(page.locator('.slot .badge.ok')).toHaveCount(3)
  await expect(page.locator('.slot .badge.err')).toHaveCount(1)

  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await page.waitForURL(/salvo=/)
  const after = await counts(me.id)
  expect(after).toEqual({ experiments: before.experiments! + 1, stages: before.stages! + 1, photos: before.photos! + 4 })
  expect(posts).toBe(5) // 4 envios + 1 reenvio só da foto que falhou
  const savedId = new URL(page.url()).hash.split('salvo=')[1]
  const { data: savedStage } = await admin.from('stages').select('notes').eq('id', savedId).single()
  expect(savedStage!.notes).toBe('nota preservada')
  await page.unroute('**/storage/v1/object/capilar-photos/**')
})

test('A6: resposta perdida na finalização é confirmada no banco, sem duplicar', async ({ page }) => {
  await login(page, me)
  const before = await counts(me.id)
  let finalizeCalls = 0
  await page.route('**/rest/v1/rpc/finalize_stage', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    finalizeCalls++
    if (finalizeCalls === 1) {
      await route.fetch() // o servidor grava…
      return route.abort('failed') // …mas a resposta se perde
    }
    return route.continue()
  })
  await noFinisherFinalization(page)
  await stageRadio(page, 'Seco').click()
  await pick(page, [FRONT, LEFT])
  await saveAndGetStage(page)
  const after = await counts(me.id)
  // Sem finalizador já está no histórico (A3): a finalização entra nele, sem produto repetido.
  expect(after).toEqual({ experiments: before.experiments!, stages: before.stages! + 1, photos: before.photos! + 2 })
  expect(finalizeCalls).toBe(1) // confirmou pelo banco, sem reenviar
})

test('A6: salvar só as fotos concluídas quando uma continua falhando', async ({ page }) => {
  await login(page, me)
  let posts = 0
  await page.route('**/storage/v1/object/capilar-photos/**', async (route) => {
    // A partir do terceiro envio, tudo falha: a terceira foto nunca chega.
    if (route.request().method() === 'POST' && !isThumb(route.request().url()) && ++posts > 2) return route.abort('failed')
    return route.continue()
  })
  await noFinisherFinalization(page)
  await stageRadio(page, 'Seco').click()
  await pick(page, [FRONT, LEFT, RIGHT])
  await saveButton(page).click()
  await expect(page.getByText('1 foto não foi enviada.')).toBeVisible()
  await page.getByRole('button', { name: 'Salvar só as 2 fotos concluídas' }).click()
  await page.waitForURL(/salvo=/)
  const stageId = new URL(page.url()).hash.split('salvo=')[1]
  expect(Object.keys(await photosOf(stageId))).toHaveLength(2)
})

test('A9: arquivo grande, formato não aceito; foto pesada é reduzida no aparelho, com miniatura', async ({ page }) => {
  await login(page, me)
  await noFinisherFinalization(page)
  await stageRadio(page, 'Seco').click()
  const big: TestFile = { name: 'grande.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(16 * 1024 * 1024, 1) }
  const gif: TestFile = { name: 'animado.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') }
  const heic: TestFile = { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from('fake') }
  const resumable: TestFile = { name: 'grande-ok.png', mimeType: 'image/png', buffer: noisyPng(8 * 1024 * 1024) }
  await pick(page, [resumable, big, gif, heic])

  await expect(slot(page, 'left')).toContainText('grande demais')
  await expect(slot(page, 'right')).toContainText('Formato não aceito')
  await expect(slot(page, 'back')).toContainText('HEIC')
  await noHorizontalScroll(page)
  await saveButton(page).click()
  await expect(page.getByText('Troque ou remova os arquivos marcados com problema.')).toBeVisible()

  // Remove um, troca os outros dois; a foto boa continua selecionada.
  await slot(page, 'left').getByRole('button', { name: 'Remover' }).click()
  await slot(page, 'right').getByRole('button', { name: 'Trocar' }).click()
  await page.getByTestId('slot-input').setInputFiles([RIGHT])
  await slot(page, 'back').getByRole('button', { name: 'Trocar' }).click()
  await page.getByTestId('slot-input').setInputFiles([BACK])
  await expect(page.getByText('Verificando…')).toHaveCount(0)
  await expect(slot(page, 'front').locator('.slot-target')).toHaveAttribute('aria-label', /grande-ok\.png/)

  const stageId = await saveAndGetStage(page)
  const photos = await photosOf(stageId)
  expect(Object.keys(photos).sort()).toEqual(['back', 'front', 'right'])
  // A foto pesada sobe reduzida, em JPEG; a leve sobe como estava. Cada uma ganha a miniatura.
  expect(photos.front.storage_path).toMatch(/\.jpg$/)
  expect(photos.front.mime_type).toBe('image/jpeg')
  expect((await bytesOf(photos.front.storage_path)).length).toBeLessThan(resumable.buffer.length / 2)
  expect((await bytesOf(photos.right.storage_path)).equals(RIGHT.buffer)).toBe(true)
  for (const p of Object.values(photos)) expect((await bytesOf(thumbPath(p.storage_path))).subarray(0, 2).toString('hex')).toBe('ffd8')
})

test('A7: outra conta não vê os registros da conta pessoal', async ({ page }) => {
  await login(page, other)
  await expect(page.getByText('Comece pelo produto que você vai testar')).toBeVisible()
  await page.goto(`./#/etapa/${ids.wet}`)
  await expect(page.getByText('Momento não encontrado.')).toBeVisible()
  await page.goto(`./#/comparar?a=${ids.wet}&b=${ids.dry}`)
  await expect(page.getByText('Você ainda não tem fotos salvas.')).toBeVisible()
  await page.goto('./')
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  // Sessão encerrada: nada de dados na memória/armazenamento local.
  const stored = await page.evaluate(() => localStorage.getItem('capilar-auth'))
  expect(stored).toBeNull()
})

test('A8: subcaminho, manifesto, ícones e service worker', async ({ page, request }) => {
  const manifest = await request.get('manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  const json = await manifest.json()
  expect(json.start_url).toBe('./#/')
  expect(json.scope).toBe('./')
  expect(json.display).toBe('standalone')
  for (const icon of json.icons) expect((await request.get(icon.src)).ok()).toBe(true)
  expect((await request.get('icons/apple-touch-icon.png')).ok()).toBe(true)

  await login(page, me)
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(scope).toMatch(/\/projeto-capilar\/$/)
  // Supabase não passa pelo service worker (outra origem).
  await page.goto('./#/comparar')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Comparar' })).toBeVisible()
  await expect(page.getByTestId('side-A').locator('img')).toBeVisible()
  await noHorizontalScroll(page)
})
