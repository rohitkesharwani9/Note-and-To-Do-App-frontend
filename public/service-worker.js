const SW_VERSION = 'v1'
const APP_SHELL_CACHE = `todo-app-shell-${SW_VERSION}`
const RUNTIME_CACHE = `todo-app-runtime-${SW_VERSION}`

const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/app-logo-192.png',
  '/app-logo-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const reqUrl = new URL(event.request.url)
  if (reqUrl.origin !== self.location.origin) return

  // Navigation: network first, fallback to cached index.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy))
          return res
        })
        .catch(async () => {
          const cached = await caches.match(event.request)
          if (cached) return cached
          return caches.match('/index.html')
        }),
    )
    return
  }

  // Static/assets: stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (!res || res.status !== 200) return res
          const copy = res.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy))
          return res
        })
        .catch(() => cached)

      return cached || network
    }),
  )
})
