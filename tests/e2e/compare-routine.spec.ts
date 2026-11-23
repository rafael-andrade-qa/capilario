// Comparar uma finalização com a rotina completa e outra só com o produto principal: o quadro fica curto.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { photoPath, testUser, tinyJpeg } from '../integration/helpers'
test.use({ viewport: { width: 390, height: 844 } })
test('rotina completa contra uma só com o principal: resumo curto e o que só um tem numa frase', async ({ page }) => {
  const u = await testUser('cmp-rotina')
  const ids: string[] = []
  const list = [
    ['Shampoo Ondulados Inc', 'shampoo', 'wash'],
    ['Condicionador Ondulados Inc', 'condicionador', 'condition'],
    ['Máscara Nutrição Profunda', 'mascara', 'mask'],
    ['Leave-in Hidratação Instantânea e Controle do Frizz', 'leave_in', 'prep'],
    ['Creme de Pentear Modelador de Ondas', 'creme_pentear', 'shape'],
    ['Mousse Definidor Definição Natural Super Ativação', 'mousse', 'hold'],
    ['Óleo de Argan', 'oleo', 'finish'],
    ['Gelatina Modeladora Supervolume', 'gelatina', 'hold'],
  ] as const
  for (const [n, c] of list) {
    const id = randomUUID()
    await u.client.rpc('create_product', {
      p_experiment_id: id,
      p_name: n,
      p_brand: 'Lola',
      p_category: c,
    })
    ids.push(id)
  }
  const mk = async (exp: string, d: number) => {
    const st = randomUUID(),
      fin = randomUUID(),
      pid = randomUUID(),
      path = photoPath(u.id, st, pid)
    await u.client.storage.from('capilar-photos').upload(path, tinyJpeg(), { contentType: 'image/jpeg' })
    await u.client.rpc('finalize_stage', {
      p_experiment_id: exp,
      p_stage_id: st,
      p_photos: [
        {
          id: pid,
          angle: 'front',
          storage_path: path,
          mime_type: 'image/jpeg',
          size_bytes: 160,
        },
      ],
      p_new_experiment: null,
      p_new_stage: {
        stage_type: 'dry',
        captured_at: new Date(Date.now() - d * 86400000).toISOString(),
        notes: null,
        finalization_id: fin,
      },
    })
    await u.client
      .from('stages')
      .update({
        humidity: d === 1 ? 83 : 68,
        temperature: 24,
        weather_code: 3,
        weather_at: new Date().toISOString(),
      })
      .eq('id', st)
    return { st, fin }
  }
  const b = await mk(ids[7], 2)
  const a = await mk(ids[5], 1)
  await u.client.rpc('set_routine', {
    p_finalization_id: a.fin,
    p_items: list.slice(0, 7).map(([, , step], i) => ({
      experiment_id: ids[i],
      step,
      mask_kind: step === 'mask' ? 'N' : null,
    })),
  })
  await page.goto('./')
  await page.getByLabel('E-mail').fill(u.email)
  await page.getByLabel('Senha').fill(u.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.locator('.day-chip').first()).toBeVisible()
  await page.goto(`./#/comparar?etapa=dry&a=${a.st}&b=${b.st}`)
  const ch = page.getByRole('region', { name: 'O que mudou' })
  await expect(ch.locator('summary')).toHaveText('Mudaram 7 etapas · umidade 83% × 68%')
  await ch.locator('summary').click()
  await ch.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await expect(ch).toContainText('Só em A: lavar, condicionar, máscara, preparar, definir, finalizar.')
})
