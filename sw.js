// PSY3 PRO Service Worker (Phase 4.7)
// Offline support for PWA

var CACHE_NAME = 'psy3-pro-v2';
var ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// Install: cache assets (but NOT app.js - always fetch fresh)
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

// Fetch: network-first for app.js, cache-first for others
self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  
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
