const CACHE = 'wajiha-admin-shell-v10';
const SHELL = ['./admin.html', './admin.css?v=20261127-notifications2', './styles.css?v=20261124-referralwallet2', './admin.js?v=20261127-notifications2', './supplier.js?v=20261125-costfields1', './faq-admin.js?v=20261127-notifications2', './faq-admin.css?v=20261126-chat1', './config.js', './admin-manifest.webmanifest', './icons/admin-192.png', './icons/admin-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response && response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('./admin.html') : undefined))));
});
