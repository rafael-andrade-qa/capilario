// Clima automático: com a localização liberada, o app consulta o tempo da hora de cada momento,
// grava e mostra a umidade no histórico e o clima completo no momento.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
const BUCKET = 'capilar-photos'
import { adminClient, photoPath, testUser, tinyJpeg } from '../integration/helpers'

const admin = adminClient()
test.use({ permissions: ['geolocation'], geolocation: { latitude: -18.91864, longitude: -48.27722 } })

test('pega a localização, consulta o clima e mostra a umidade', async ({ page }) => {
  const me = await testUser('clima-e2e')
  const experiment = randomUUID()
  const stageId = randomUUID()
  await me.client.rpc('create_product', { p_experiment_id: experiment, p_name: 'Geleia do Tempo', p_brand: 'Marca' })
  const id = randomUUID()
  const storage_path = photoPath(me.id, stageId, id)
  await me.client.storage.from(BUCKET).upload(storage_path, tinyJpeg(), { contentType: 'image/jpeg' })
  const captured = new Date(Date.now() - 2 * 3_600_000).toISOString()
  const r = await me.client.rpc('finalize_stage', {
    p_experiment_id: experiment,
    p_stage_id: stageId,
    p_photos: [{ id, angle: 'front', storage_path, mime_type: 'image/jpeg', size_bytes: 160 }],
    p_new_experiment: null,
    p_new_stage: { stage_type: 'dry', captured_at: captured, notes: null, finalization_id: randomUUID() },
  })
  expect(r.error).toBeNull()

  // Open-Meteo de mentira: toda hora com 82% de umidade, 24,4 °C e nublado.
  const asked: URL[] = []
  await page.route('https://api.open-meteo.com/**', async (route) => {
    const u = new URL(route.request().url())
    asked.push(u)
    const time: string[] = []
    for (let t = Date.parse(u.searchParams.get('start_date')! + 'T00:00:00Z'); t <= Date.parse(u.searchParams.get('end_date')! + 'T23:00:00Z'); t += 3_600_000)
      time.push(new Date(t).toISOString().slice(0, 13) + ':00')
    await route.fulfill({
      json: { hourly: { time, temperature_2m: time.map(() => 24.4), relative_humidity_2m: time.map(() => 82), weather_code: time.map(() => 3) } },
    })
  })

  await page.goto('./')
  await page.getByLabel('E-mail').fill(me.email)
  await page.getByLabel('Senha').fill(me.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: '+ Novo produto' })).toBeVisible()

  await expect.poll(async () => (await admin.from('stages').select('humidity, temperature, weather_code').eq('id', stageId).single()).data).toEqual({
    humidity: 82,
    temperature: 24.4,
    weather_code: 3,
  })
  // Só a cidade vai para o serviço (posição arredondada).
  expect(asked[0].searchParams.get('latitude')).toBe('-18.92')
  expect(asked[0].searchParams.get('longitude')).toBe('-48.28')

  const card = page.locator('.experiment', { hasText: 'Geleia do Tempo' })
  const toggle = card.locator('.product-toggle')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await expect(card.getByLabel('umidade 82%')).toBeVisible()

  await card.locator('.moment-tile').first().click()
  await expect(page.getByTestId('stage-weather')).toHaveText('Ar úmido: 82% de umidade, 24°C, nublado.')

  // Abrir de novo não consulta outra vez: o clima já está gravado.
  const before = asked.length
  await page.reload()
  await expect(page.getByTestId('stage-weather')).toBeVisible()
  await page.waitForTimeout(1500)
  expect(asked.length).toBe(before)
})
