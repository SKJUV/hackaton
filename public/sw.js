// Co-founder Service Worker
const CACHE_NAME = "droit-cm-v2";
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/workspace/memoire/bas-debit",
];
// Pages disponibles hors ligne (mode bas débit) : mises à jour à chaque visite en ligne.
const OFFLINE_PAGES = ["/workspace/memoire/bas-debit"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Service Worker asset caching warning:", err);
      });
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ALWAYS bypass cache for API calls (dynamic LLM responses and document downloads)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Network-first strategy for pages, cache fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200 && OFFLINE_PAGES.includes(url.pathname)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(url.pathname, clone));
          }
          return response;
        })
        .catch(() => caches.match(url.pathname).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  // Scripts et styles Next.js versionnés (immuables) : cache-first, pour que les pages hors ligne s'hydratent.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Cache-first for static icons and assets
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".css")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return (
          cached ||
          fetch(event.request).then((response) => {
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
        );
      }),
    );
    return;
  }

  // Default fetch
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  );
});
