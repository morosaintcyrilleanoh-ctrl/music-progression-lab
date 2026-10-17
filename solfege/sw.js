/*
 * Service worker de Solfège Progression : garde les laboratoires utilisables
 * hors connexion. Seules les pages PUBLIQUES et les fichiers statiques sont
 * mis en cache ; les espaces connectés, cours, fichiers privés et appels
 * d'authentification ne le sont jamais.
 */
const VERSION = 'mpl-solfege-v1';
const PUBLIC_PAGES = ["/solfege/","/solfege/laboratoires/","/solfege/laboratoires/lecture-des-notes/","/solfege/laboratoires/lecture-des-notes/historique/","/solfege/laboratoires/rythme/","/solfege/laboratoires/tonalites/","/solfege/laboratoires/intervalles/","/solfege/tableau-de-bord/","/solfege/test-de-positionnement/"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled([...PUBLIC_PAGES, '/solfege/fonts/bravura.woff2'].map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Met une copie de la réponse en cache. La copie doit être faite AVANT de
 * rendre la réponse à la page (sinon son contenu est déjà lu et la copie échoue).
 */
function keep(event, key, res) {
  const copy = res.clone();
  event.waitUntil(caches.open(VERSION).then((c) => c.put(key, copy)));
}

function isPublicPage(url) {
  return PUBLIC_PAGES.includes(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Fichiers statiques versionnés : le cache d'abord.
  if (url.pathname.startsWith('/solfege/_next/static/') || url.pathname.startsWith('/solfege/fonts/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) keep(event, req, res);
            return res;
          }),
      ),
    );
    return;
  }

  // Pages publiques : le réseau d'abord, le cache si la connexion manque.
  if (req.mode === 'navigate' && isPublicPage(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) keep(event, url.pathname, res);
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match('/solfege/'))),
    );
  }
  // Tout le reste (espaces connectés, API, authentification) : jamais mis en cache.
});
