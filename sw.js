// PSY3 PRO Service Worker (Phase 4.7)
// Offline support for PWA

var CACHE_NAME = 'psy3-pro-v3';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg'
];

// Install: cache assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: filter out unsupported schemes, network-first for app.js
self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  
  // Skip non-http(s) requests (chrome-extension, data, etc.)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }
  
  // Skip cross-origin requests
  var requestUrl = new URL(url);
  if (requestUrl.origin !== location.origin) {
    return;
  }
  
  // Always fetch app.js from network (cache-busting)
  if (url.indexOf('app.js') !== -1) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        return response;
      }).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }
  
  // Cache-first for other assets
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) {
        return response;
      }
      return fetch(event.request).then(function(response) {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        var responseToCache = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
});
