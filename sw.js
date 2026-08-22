// PSY3 PRO Service Worker v8 (session 25)
// Update strategy fix: NAVIGATIONS are network-first, so an online visit
// always shows the latest build immediately. The previous cache-first design
// served returning users a stale UI one visit behind - the reason real users
// could not see shipped changes. Assets stay stale-while-revalidate, and the
// app still boots offline from the precached shell.

var CACHE_NAME = 'psy3-pro-v28'; // session 45 // session 44 // session 43 // session 42 // session 41 // session 40 // session 39 // session 38 // session 37 // session 36 // session 35 // session 34 // session 33 // session 32 // session 31 // session 30 // session 29 // session 28 // session 27 // session 26: arrangement editor
var APP_SHELL = [
  'index.html',
  'src/core.js', 'src/pools.js', 'src/midi.js', 'src/theory.js', 'src/song.js',
  'src/groovebox.js', 'src/dsp.js', 'src/brain-runtime.js', 'src/ui.js',
  'src/editor.js', 'src/main.js',
  'manifest.json', 'favicon.svg',
  'icon-192.png', 'icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(APP_SHELL.map(function(u) {
        return cache.add(u).catch(function(e) { console.log('SW precache failed:', u, e); });
      }));
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); }));
    }).then(function() { return self.clients.claim(); })
  );
});

// Version-bump resilience: cache keys for code assets ignore ?v=N queries.
function cacheKeyFor(url) {
  var u = new URL(url);
  if (/\.(js|html|json|svg|png)$/.test(u.pathname)) { u.search = ''; }
  return u.toString();
}

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navigations: network-first, cache fallback (offline boot).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put('index.html', copy); });
        return res;
      }).catch(function() {
        return caches.match('index.html');
      })
    );
    return;
  }

  // Assets: stale-while-revalidate.
  var key = cacheKeyFor(req.url);
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(key).then(function(hit) {
        var refresh = fetch(req).then(function(res) {
          if (res && res.ok) cache.put(key, res.clone());
          return res;
        }).catch(function() { return hit; });
        return hit || refresh;
      });
    })
  );
});
