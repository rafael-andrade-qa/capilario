import { defineConfig, devices } from '@playwright/test'

// E2E contra o build de produção servido no MESMO subcaminho do GitHub Pages
// e contra o Supabase local (`npx supabase start`). Usa o Chrome instalado
// (PW_CHANNEL=msedge para Edge, ou PW_CHANNEL= vazio para o Chromium do Playwright).
const BASE_PATH = '/projeto-capilar/'
const PORT = 4173
const channel = process.env.PW_CHANNEL ?? 'chrome'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}${BASE_PATH}`,
    ...devices['Pixel 7'],
    channel: channel || undefined,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite build --base ${BASE_PATH} && npx vite preview --base ${BASE_PATH} --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}${BASE_PATH}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
