import { defineConfig } from 'vitest/config'

// Testes contra um Supabase real (local via `supabase start`).
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    fileParallelism: false,
  },
})
