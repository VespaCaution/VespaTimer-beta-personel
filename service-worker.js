// VespaTimer v2.0 - Service Worker
// Change CACHE_NAME on every deploy

const CACHE_NAME = 'vespatimer-v2.0.0';
const MAP_TILE_CACHE = 'vespatimer-tiles-v1';
const SHARE_CACHE = 'vespatimer-shared';

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
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch(function(err) { console.log('Cache addAll failed:', err); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME && cacheName !== MAP_TILE_CACHE && cacheName !== SHARE_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  var url = new URL(event.request.url);

  // === Handle Web Share Target POST ===
  if (event.request.method === 'POST' && url.searchParams.has('share-target')) {
    event.respondWith((async function() {
      try {
        var formData = await event.request.formData();
        var file = formData.get('sharedFile');
        var title = formData.get('title');
        var text = formData.get('text');
        var sharedUrl = formData.get('url');
        
        var cache = await caches.open(SHARE_CACHE);
        
        if (file && file.size > 0) {
          await cache.put('shared-file.json', new Response(file, {
            headers: { 'Content-Type': file.type || 'application/json', 'X-Filename': file.name || 'shared.json' }
          }));
        }
        
        if (text) {
          await cache.put('shared-text', new Response(text, {
            headers: { 'Content-Type': 'text/plain' }
          }));
        }
        
        return Response.redirect('./index.html?share-received=1', 303);
      } catch (err) {
        console.error('[SW] Share target error:', err);
        return Response.redirect('./index.html?share-error=1', 303);
      }
    })());
    return;
  }

  // Map tiles
  if (event.request.url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(MAP_TILE_CACHE).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response.status === 200) {
              cache.put(event.request, response.clone());
              cache.keys().then(function(keys) {
                if (keys.length > 500) {
                  for (var i = 0; i < 100; i++) cache.delete(keys[i]);
                }
              });
            }
            return response;
          }).catch(function() { return new Response('', { status: 204 }); });
        });
      })
    );
    return;
  }

  // All other GET requests
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        var responseToCache = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, responseToCache); });
        return response;
      }).catch(function() {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
