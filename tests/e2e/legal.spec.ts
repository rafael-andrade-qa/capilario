// Termos de uso e privacidade: abrem sem conta, a partir do login, e voltam para onde estava.
import { expect, test } from '@playwright/test'

test('termos e privacidade abrem pelo login, sem conta, e voltam ao login', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()

  await page.getByRole('link', { name: 'Termos de uso' }).click()
  await expect(page.getByRole('heading', { name: 'Termos de uso', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'A inteligência artificial' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'contato@capilario.com.br' })).toHaveAttribute('href', 'mailto:contato@capilario.com.br')

  await page.getByRole('link', { name: 'Política de privacidade →' }).click()
  await expect(page.getByRole('heading', { name: 'Política de privacidade', level: 1 })).toBeVisible()
  await expect(page.getByText('Supabase: guarda a conta')).toBeVisible()

  await page.getByRole('link', { name: 'Voltar' }).click()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
})

test('o endereço da privacidade abre direto, e o voltar leva ao login', async ({ page }) => {
  await page.goto('./#/privacidade')
  await expect(page.getByRole('heading', { name: 'Política de privacidade', level: 1 })).toBeVisible()
  await expect(page.getByText(/Última atualização/)).toBeVisible()
  await page.getByRole('link', { name: 'Voltar' }).click()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
})
