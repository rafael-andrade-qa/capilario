// Folha aberta: o fundo não rola (nem no iPhone) e arrastar a folha para baixo fecha.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { testUser } from '../integration/helpers'

test.use({ viewport: { width: 390, height: 700 }, hasTouch: true })

async function swipe(page: Page, selector: string, dy: number) {
  await page.evaluate(
    ({ selector, dy }) => {
      const el = document.querySelector(selector)!
      const r = el.getBoundingClientRect()
      const at = (y: number) => [new Touch({ identifier: 1, target: el, clientX: r.left + 40, clientY: y })]
      const y0 = r.top + 20
      el.dispatchEvent(new TouchEvent('touchstart', { touches: at(y0), bubbles: true }))
      for (let i = 1; i <= 5; i++) el.dispatchEvent(new TouchEvent('touchmove', { touches: at(y0 + (dy * i) / 5), bubbles: true, cancelable: true }))
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }))
    },
    { selector, dy },
  )
}

test('com a folha aberta o fundo fica parado; arrastar para baixo fecha', async ({ page }) => {
  const me = await testUser('folha-e2e')
  for (let i = 0; i < 8; i++)
    await me.client.rpc('create_product', { p_experiment_id: randomUUID(), p_name: `Produto ${i}`, p_brand: 'Marca', p_category: 'geleia' })
  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()

  // O último da lista, para a página precisar rolar até ele.
  const card = page.locator('.experiment').last()
  const toggle = card.locator('.product-toggle')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const y = await page.evaluate(() => window.scrollY)
  expect(y).toBeGreaterThan(0)

  await card.getByRole('button', { name: 'O que é geleia' }).click()
  const sheet = page.getByRole('dialog', { name: 'Geleia' })
  await expect(sheet).toBeVisible()
  // O fundo fica preso no lugar, sem pular para o topo.
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).position)).toBe('fixed')
  const top = await card.locator('.product-toggle').boundingBox()
  await page.mouse.move(195, 100)
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(200)
  expect((await card.locator('.product-toggle').boundingBox())?.y).toBeCloseTo(top!.y, 0)

  // Arrastar pouco: a folha volta. Arrastar bastante: fecha.
  await swipe(page, '.guide-sheet', 40)
  await expect(sheet).toBeVisible()
  await swipe(page, '.guide-sheet', 200)
  await expect(sheet).toHaveCount(0)

  // Ao fechar, a página volta a rolar e continua onde estava.
  expect(await page.evaluate(() => getComputedStyle(document.body).position)).not.toBe('fixed')
  expect(await page.evaluate(() => window.scrollY)).toBe(y)
})
