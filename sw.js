/* Service worker: deixa o app abrir offline (cache do "casco" do app).
   Troque a versão abaixo sempre que publicar uma atualização. */
const CACHE = 'controle-gastos-v3';
const ASSETS = [
  './', 'index.html', 'css/style.css',
  'js/config.js', 'js/util.js', 'js/db.js', 'js/sync.js', 'js/lock.js', 'js/charts.js',
  'js/views.js', 'js/painel.js', 'js/relatorios.js', 'js/app.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* cache primeiro, atualizando em segundo plano */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => cached || caches.match('index.html'));
      return cached || net;
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    const c = list[0];
    if (c) { c.focus(); c.navigate('./#/contas'); } else self.clients.openWindow('./#/contas');
  }));
});
