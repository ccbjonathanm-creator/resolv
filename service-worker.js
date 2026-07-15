/* Service worker — réseau d'abord AVEC revalidation forcée (MAJ fiable), cache en repli hors-ligne. */
const CACHE = 'resolv-v10';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/licence.js',
  './js/vendeur.js',
  './js/trial.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // On ne touche jamais aux appels IA (autres origines) : laissés au réseau.
  if (url.origin !== location.origin) return;

  // cache:'reload' force une vraie requête réseau (ignore le cache HTTP du navigateur),
  // sinon un app.js encore "frais" au sens HTTP pouvait être resservi malgré une MAJ.
  e.respondWith(
    fetch(new Request(req, { cache: 'reload' })).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
