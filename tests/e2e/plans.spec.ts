// Planos no navegador: "Seu plano" em Minha conta (Grátis e Pro), o "Conheça o Pro" e o aviso de
// fotos perto do limite no diário.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { adminClient, photoPath, setPlan, testUser, type TestUser } from '../integration/helpers'

const admin = adminClient()
test.describe.configure({ mode: 'serial' })

async function login(page: Page, user: TestUser) {
  await page.goto('./')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha').fill(user.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Nova finalização' })).toBeVisible()
}

/** `total` fotos direto no banco (sem arquivos), num produto só. */
async function seedPhotos(user: TestUser, total: number) {
  const experiment = randomUUID()
  await admin.from('experiments').insert({ id: experiment, user_id: user.id, product_mode: 'named', product_name: 'Muitas fotos' })
  const fins = Array.from({ length: Math.ceil(total / 12) }, () => ({ id: randomUUID(), experiment_id: experiment, user_id: user.id }))
  await admin.from('finalizations').insert(fins)
  const stages = fins.flatMap((fin) =>
    (['wet', 'dry', 'next_day'] as const).map((t) => ({ id: randomUUID(), experiment_id: experiment, finalization_id: fin.id, user_id: user.id, stage_type: t, captured_at: '2026-11-20T10:00:00Z' })),
  )
  await admin.from('stages').insert(stages)
  const photos = stages
    .flatMap((st) => (['front', 'left', 'back', 'right'] as const).map((angle) => ({ stage: st.id, angle })))
    .slice(0, total)
    .map(({ stage, angle }) => {
      const id = randomUUID()
      return { id, stage_id: stage, user_id: user.id, angle, storage_path: photoPath(user.id, stage, id), mime_type: 'image/jpeg', size_bytes: 160 }
    })
  for (let i = 0; i < photos.length; i += 250) {
    const r = await admin.from('photos').insert(photos.slice(i, i + 250))
    if (r.error) throw r.error
  }
}

test('Grátis: Seu plano mostra o uso e o Conheça o Pro compara os planos', async ({ page }) => {
  const user = await testUser('plano-gratis-e2e')
  await login(page, user)
  await expect(page.locator('.plan-nudge')).toHaveCount(0) // longe do limite: sem aviso
  await page.getByRole('link', { name: 'Minha conta' }).click()
  const card = page.locator('.plan-card')
  await expect(card.getByRole('heading', { name: 'Plano Grátis' })).toBeVisible()
  await expect(card.getByRole('meter', { name: 'Análise com IA' })).toHaveAttribute('aria-valuemax', '1')
  await expect(card).toContainText('Resta 1 neste mês.')
  await expect(card.getByRole('meter', { name: 'Identificar pela foto' })).toHaveAttribute('aria-valuemax', '3')
  await expect(card).toContainText('Restam 3 nesta semana.')
  await expect(card.getByRole('meter', { name: 'Fotos guardadas' })).toHaveAttribute('aria-valuemax', '300')

  await card.getByRole('button', { name: 'Conheça o Pro' }).click()
  const pro = page.getByRole('dialog', { name: 'Conheça o Pro' })
  await expect(pro.getByRole('row', { name: /Identificar pela foto/ })).toContainText('3 por semana')
  await expect(pro.getByRole('row', { name: /Identificar pela foto/ })).toContainText('10 por dia')
  await expect(pro.getByRole('row', { name: /Fotos guardadas/ })).toContainText('até 1.000')
  await pro.getByRole('button', { name: 'Quero o Pro' }).click()
  await expect(pro.getByRole('status')).toHaveText('A assinatura do Pro abre em breve. Por enquanto, o seu plano continua o Grátis.')
  await pro.getByRole('button', { name: 'Entendi' }).click()
  await expect(pro).toHaveCount(0)
})

test('Pro: Seu plano sem o botão do Pro', async ({ page }) => {
  const user = await testUser('plano-pro-e2e')
  await setPlan(user.id, 'pro')
  await login(page, user)
  await page.getByRole('link', { name: 'Minha conta' }).click()
  const card = page.locator('.plan-card')
  await expect(card.getByRole('heading', { name: 'Plano Pro' })).toBeVisible()
  await expect(card).toContainText('Resta 1 hoje.')
  await expect(card).toContainText('Restam 10 hoje.')
  await expect(card.getByRole('meter', { name: 'Fotos guardadas' })).toHaveAttribute('aria-valuemax', '1000')
  await expect(card.getByRole('button', { name: 'Conheça o Pro' })).toHaveCount(0)
})

test('Grátis perto do limite de fotos: o diário avisa e abre o Conheça o Pro', async ({ page }) => {
  const user = await testUser('plano-fotos-e2e')
  await seedPhotos(user, 250)
  await login(page, user)
  const nudge = page.locator('.plan-nudge')
  await expect(nudge).toContainText('Você tem 250 de 300 fotos do plano Grátis.')
  await nudge.getByRole('button', { name: 'Conheça o Pro' }).click()
  await expect(page.getByRole('dialog', { name: 'Conheça o Pro' })).toBeVisible()
  await page.getByRole('button', { name: 'Agora não' }).click()

  await seedPhotos(user, 50)
  await page.reload()
  await expect(page.locator('.plan-nudge')).toContainText('Você chegou a 300 fotos, o limite do Grátis.')
})
