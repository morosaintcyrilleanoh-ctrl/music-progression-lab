// =====================================================================
// Navigation entre les pages (adresses du type  #/tableau-de-bord)
// =====================================================================
const routes = [];
let notFound = null;

// Déclare une page : route('/programme/:jour', handler, { auth: true })
export function route(pattern, handler, options = {}) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ regex, keys, handler, options });
}

export function setNotFound(handler) { notFound = handler; }

export function currentPath() {
  const hash = window.location.hash || '#/';
  // Les liens de Supabase contiennent parfois "#access_token=..." : ce n'est pas une page
  if (!hash.startsWith('#/')) return '/';
  return hash.slice(1).split('?')[0] || '/';
}

export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (replace) {
    history.replaceState(null, '', target);
    resolve();
  } else if (window.location.hash === target) {
    resolve();
  } else {
    window.location.hash = target;
  }
}

let guard = () => true;
export function setGuard(fn) { guard = fn; }

export async function resolve() {
  const path = currentPath();
  for (const r of routes) {
    const match = path.match(r.regex);
    if (!match) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
    if (!guard(r.options, path)) return;
    await r.handler(params);
    afterRender(path);
    return;
  }
  if (notFound) { await notFound(); afterRender(path); }
}

function afterRender(path) {
  window.scrollTo(0, 0);
  document.querySelectorAll('#nav a').forEach((a) => {
    if (a.getAttribute('href') === '#' + path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  // Place le focus sur le titre de la page (utile au clavier et aux lecteurs d'écran)
  const heading = document.querySelector('#main h1');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  // Un clic sur un lien vers la page déjà ouverte la réaffiche (sinon rien ne se passe)
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#/"]');
    if (link && link.getAttribute('href') === window.location.hash) resolve();
  });
  return resolve();
}
