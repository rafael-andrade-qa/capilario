/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH define o subcaminho de publicação (ex.: /projeto-capilar/ no GitHub Pages).
// Sem a variável, o app roda na raiz, como no `npm run dev`.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
