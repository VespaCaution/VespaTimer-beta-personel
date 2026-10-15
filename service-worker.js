// VespaTimer v2.0 - Service Worker
// IMPORTANT: Change CACHE_NAME on every deploy to trigger updates

const CACHE_NAME = 'vespatimer-v2.0.0.0.0.0';
const MAP_TILE_CACHE = 'vespatimer-tiles-v1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  'https://unpkg.com/leaflet-image@0.4.0/leaflet-image.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// Install: cache assets + skipWaiting so new SW activates immediately
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch(function(err) {
      console.log('Cache addAll failed:', err);
    })
  );
});

// Activate: clean up old caches, take control of open clients
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME && cacheName !== MAP_TILE_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: network-first for HTML, cache-first for everything else
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  // Map tiles: separate cache with limit
  if (event.request.url.includes('tile.openstreetmap.org') || event.request.url.includes('wmts.geo.admin.ch')) {
    event.respondWith(
      caches.open(MAP_TILE_CACHE).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response.status === 200) {
              cache.put(event.request, response.clone());
              cache.keys().then(function(keys) {
                if (keys.length > 500) {
                  for (var i = 0; i < 100; i++) {
                    cache.delete(keys[i]);
                  }
                }
              });
            }
            return response;
          }).catch(function() {
            return new Response('', { status: 204 });
          });
        });
      })
    );
    return;
  }

  // HTML navigation: NETWORK FIRST, fall back to cache when offline
  var isHtmlRequest = event.request.mode === 'navigate' ||
                      event.request.url.endsWith('/') ||
                      event.request.url.indexOf('index.html') !== -1;

  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        var responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        var responseToCache = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(function() {
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Message: receive SKIP_WAITING from page (kept for compat)
self.addEventListener('message', function(event) {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
