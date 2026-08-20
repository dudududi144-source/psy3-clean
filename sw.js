// PSY3 PRO Service Worker v5 (Phase 5)
// Real offline support: the app shell is precached and served cache-first
// with background refresh (stale-while-revalidate) for same-origin GETs.
// Previous versions never cached anything ("skip caching entirely"), so the
// README offline claim was void until now.

var CACHE_NAME = 'psy3-pro-v5';
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
      // One missing asset must not kill the whole install.
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
