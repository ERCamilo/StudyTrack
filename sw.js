const CACHE_NAME = 'studytrack-shell-v13';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './dist/tailwind.css',
  './src/storage.js',
  './src/sanitize.js',
  './src/curriculum.js',
  './src/grades.js',
  './src/academics.js',
  './src/progress.js',
  './src/prerequisites.js',
  './src/periods.js',
  './src/requirements.js',
  './src/schedule.js',
  './src/insights.js',
  './src/milestones.js',
  './src/nfc.js',
  './src/vendor/qrcode.min.js',
  './src/vendor/jsqr.min.js',
  './src/qr-share.js',
  './src/firebase-sync.js',
  './src/app.js',
  './icons/studytrack-icon.svg',
  './icons/studytrack-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'opaque') return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => undefined))
  );
});
