const CACHE_NAME = 'timetracker-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './firebase-rest-integration.js',
  './manifest.json'
];

// Install Event - cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching core assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network First with Cache Fallback strategy
self.addEventListener('fetch', event => {
  // Skip cross-origin requests, like those to Firebase
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Network First Strategy
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Cache the latest version
        return caches.open(CACHE_NAME).then(cache => {
            // Only cache successful responses for GET requests
            if (event.request.method === 'GET' && networkResponse.ok) {
                cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
        });
      })
      .catch(() => {
        console.log('[Service Worker] Network request failed, returning cached fallback for', event.request.url);
        return caches.match(event.request);
      })
  );
});
