const CACHE_NAME = "gap-analysis-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/login.html",
  "/admin.html",
  "/static/styles.css",  // si tienes un CSS aquí
  "/static/script.js",    // tu JS principal
  "/static/icon-192.png",
  "/static/icon-512.png"
];

// Instalar y cachear recursos
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Activar y limpiar cachés viejas
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Interceptar peticiones
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
