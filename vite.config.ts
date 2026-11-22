/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH define o subcaminho de publicação (ex.: /projeto-capilar/ no GitHub Pages).
// Sem a variável, o app roda na raiz, como no `npm run dev`.
const base = process.env.BASE_PATH ?? '/'

// Detecção de rosto (enquadramento automático): os arquivos WebAssembly do MediaPipe vêm do
// pacote instalado e são servidos pelo próprio app em /mediapipe/<versão>/ (nada de CDN de terceiros).
// A versão no caminho deixa o service worker guardar os arquivos sem risco de misturar versões.
const MEDIAPIPE_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']
const mediapipeDir = 'node_modules/@mediapipe/tasks-vision/wasm'
const MEDIAPIPE_VERSION: string = JSON.parse(readFileSync('node_modules/@mediapipe/tasks-vision/package.json', 'utf8')).version
function mediapipeAssets(): Plugin {
  return {
    name: 'mediapipe-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = MEDIAPIPE_FILES.find((f) => req.url?.split('?')[0].endsWith(`/mediapipe/${MEDIAPIPE_VERSION}/${f}`))
        if (!file) return next()
        res.setHeader('content-type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(`${mediapipeDir}/${file}`))
      })
    },
    generateBundle() {
      for (const f of MEDIAPIPE_FILES) this.emitFile({ type: 'asset', fileName: `mediapipe/${MEDIAPIPE_VERSION}/${f}`, source: readFileSync(`${mediapipeDir}/${f}`) })
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), mediapipeAssets()],
  define: { 'import.meta.env.VITE_MEDIAPIPE_VERSION': JSON.stringify(MEDIAPIPE_VERSION) },
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
})
