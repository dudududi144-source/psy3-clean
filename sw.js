// PSY3 PRO Service Worker v4
// Network-first for everything (no stale cache)

var CACHE_NAME = 'psy3-pro-v4';

// Install: skip caching entirely for now
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

// Activate: clean all caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: always go to network
self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  
  // Skip non-http(s) requests
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }
  
  // Skip cross-origin requests
  try {
    var requestUrl = new URL(url);
    if (requestUrl.origin !== location.origin) {
      return;
    }
  } catch (e) {
    return;
  }
  
  // Network-first: always fetch from network
  event.respondWith(
    fetch(event.request).catch(function() {
      // If network fails, try cache
      return caches.match(event.request);
    })
  );
});
