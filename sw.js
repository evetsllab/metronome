// TOM Metronome Service Worker
// (c) 1998-2026 Ballistic Music. Steve Ball.
//
// Network first, cache as offline fallback.
//
// The previous version was cache first: once index.html landed in the cache it
// was served forever and the network was never consulted again, so a new upload
// could not reach a device that had already visited. This asks the network
// first every time and only falls back to the cache when the request fails,
// which is what offline actually means. Fresh when online, working when not.
//
// Bump CACHE on every release. The activate handler deletes every cache whose
// name does not match, so changing this string clears the old one.

const CACHE = 'tom-metronome-v2.23';
const PAGE  = '/metronome/index.html';

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(['/metronome/', PAGE]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Only GET is cacheable. cache.put throws on anything else.
  if (e.request.method !== 'GET') return;

  // Never touch the Gist sync. Let it fail on its own terms when offline.
  if (e.request.url.indexOf('api.github.com') !== -1) return;

  e.respondWith(
    fetch(e.request).then(function(response) {
      if (response && response.ok) {
        var clone = response.clone();
        caches.open(CACHE).then(function(cache) {
          cache.put(e.request, clone);
        });
      }
      return response;
    }).catch(function() {
      // Offline. Serve what we have, falling back to the page itself.
      return caches.match(e.request).then(function(cached) {
        return cached || caches.match(PAGE);
      });
    })
  );
});
