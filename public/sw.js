// Service worker mínimo: só guarda os arquivos estáticos do próprio app.
// Requisições ao Supabase (outra origem), imagens privadas, URLs assinadas e
// blobs NÃO passam por aqui: o handler ignora tudo que não for da mesma origem.
const CACHE = 'capilar-static-v3'
const scopeUrl = new URL(self.registration.scope)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([scopeUrl.href, new URL('manifest.webmanifest', scopeUrl).href]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return

  // Navegação: rede primeiro (sempre a versão nova), cache como reserva.
  // cache: 'no-cache' revalida com o servidor em vez de usar a cópia de 10 min do navegador.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(scopeUrl.href, copy))
          return res
        })
        .catch(() => caches.match(scopeUrl.href)),
    )
    return
  }

  // Motor do enquadramento automático (~15 MB, numa pasta com a versão): cache primeiro.
  // Modelos (.tflite): o guardado na hora e uma cópia nova por trás, para a próxima vez.
  const models = url.pathname.startsWith(scopeUrl.pathname + 'models/')
  if (url.pathname.startsWith(scopeUrl.pathname + 'mediapipe/') || models) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit && !models) return hit
        const update = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        if (hit) {
          update.catch(() => undefined)
          return hit
        }
        return update
      }),
    )
    return
  }

  // Arquivos com hash em /assets/ e ícones: cache primeiro.
  if (url.pathname.startsWith(scopeUrl.pathname + 'assets/') || url.pathname.startsWith(scopeUrl.pathname + 'icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
