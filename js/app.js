// =====================================================================
// MUSIC PROGRESSION LAB — point de départ de l'application
// =====================================================================
import { html, toast, showLoading, mount } from './ui.js';
import { t } from './i18n.js';
import { supabase, isConfigured } from './supabase.js';
import { initAuth, getUser, onAuthChange } from './auth.js';
import { route, setNotFound, setGuard, startRouter, navigate, currentPath } from './router.js';
import { homePage } from './pages/home.js';
import { signupPage, loginPage, forgotPage, resetPage } from './pages/auth-pages.js';
import { dashboardPage } from './pages/dashboard.js';
import { programPage, programDayPage } from './pages/program.js';
import { sessionPage } from './pages/session.js';
import { statsPage } from './pages/stats.js';
import { diagnosticPage, diagnosticResultPage, trainingPage } from './pages/personal.js';
import { coursePage, assignmentPage } from './pages/course.js';
import { trainerPage, trainerStudentPage } from './pages/trainer.js';
import { getProfile } from './data.js';

// ---------- Les pages ----------
route('/', homePage);
route('/inscription', signupPage);
route('/connexion', loginPage);
route('/mot-de-passe-oublie', forgotPage);
route('/nouveau-mot-de-passe', resetPage);
route('/tableau-de-bord', dashboardPage, { auth: true });
route('/programme', programPage);
route('/programme/:jour', programDayPage);
route('/seance/:jour', sessionPage, { auth: true });
route('/statistiques', statsPage, { auth: true });
route('/diagnostic', diagnosticPage, { auth: true });
route('/diagnostic/resultat', diagnosticResultPage, { auth: true });
route('/entrainement', trainingPage, { auth: true });
route('/cours', coursePage, { auth: true });
route('/devoir/:id', assignmentPage, { auth: true });
route('/formateur', trainerPage, { auth: true });
route('/formateur/eleve/:id', trainerStudentPage, { auth: true });
route('/formateur/:tab', trainerPage, { auth: true });
const PUBLIC_PATHS = ['/', '/inscription', '/connexion', '/mot-de-passe-oublie', '/nouveau-mot-de-passe', '/programme'];
setNotFound(() => mount(html`
  <div class="container dash center">
    <h1>${t('common.not_found_title')}</h1>
    <p class="muted">${t('common.not_found_text')}</p>
    <div><a class="btn" href="#/">${t('common.back_home')}</a></div>
  </div>`));

// Pages réservées aux personnes connectées
setGuard((options) => {
  if (options.auth && !getUser()) { navigate('/connexion', { replace: true }); return false; }
  showLoading();
  return true;
});

// ---------- Menu ----------
let role = null;
async function loadRole() {
  const user = getUser();
  role = null;
  if (!user) return;
  try { role = (await getProfile(user.id))?.role ?? null; } catch { role = null; }
}

function link(href, label) {
  return html`<a class="nav-link" href="${href}">${label}</a>`;
}

function renderNav() {
  const nav = document.getElementById('nav');
  const user = getUser();
  if (!user) {
    nav.innerHTML = String(html`
      <a class="nav-link" href="#/connexion">${t('nav.login')}</a>
      <a class="btn btn-sm" href="#/inscription">${t('nav.signup')}</a>`);
    return;
  }
  const staff = role === 'trainer' || role === 'admin';
  nav.innerHTML = String(html`
    <button class="btn btn-ghost btn-sm nav-toggle" type="button" id="nav-toggle" aria-expanded="false" aria-controls="nav-links">☰ ${t('nav.menu')}</button>
    <div class="nav-links" id="nav-links">
      ${link('#/tableau-de-bord', t('nav.dashboard'))}
      ${link('#/programme', t('nav.program'))}
      ${link('#/statistiques', t('nav.stats'))}
      ${link('#/cours', t('nav.course'))}
      ${staff ? link('#/formateur', t('nav.trainer')) : ''}
      <button class="btn btn-ghost btn-sm" type="button" id="logout-btn">${t('nav.logout')}</button>
    </div>`);

  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  const close = () => { links.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); };
  toggle.addEventListener('click', () => {
    const open = !links.classList.contains('is-open');
    links.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.getElementById('logout-btn').addEventListener('click', async () => {
    close();
    await supabase.auth.signOut();
    toast(t('auth.logged_out'));
    navigate('/');
  });
}

// ---------- Démarrage ----------
async function start() {
  // Lit un éventuel lien reçu par e-mail AVANT d'afficher la page
  const params = new URLSearchParams(window.location.search);
  await initAuth().catch((err) => console.error(err));
  await loadRole();
  renderNav();

  // Nettoie l'adresse (retire ?confirme=1, ?reinit=1 ou #access_token=...)
  const cleanHash = window.location.hash.startsWith('#/') ? window.location.hash : '#/';
  if (params.has('confirme') || params.has('reinit') || !window.location.hash.startsWith('#/')) {
    history.replaceState(null, '', window.location.pathname + cleanHash);
  }

  if (params.has('reinit') && getUser()) {
    history.replaceState(null, '', window.location.pathname + '#/nouveau-mot-de-passe');
  } else if (params.has('confirme') && getUser()) {
    toast(t('auth.confirmed'), 'success');
    history.replaceState(null, '', window.location.pathname + '#/tableau-de-bord');
  }

  onAuthChange(async (event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') await loadRole();
    renderNav();
    if (event === 'PASSWORD_RECOVERY') navigate('/nouveau-mot-de-passe');
    // Si l'utilisateur se déconnecte sur une page privée, on le renvoie à l'accueil
    if (event === 'SIGNED_OUT' && !PUBLIC_PATHS.includes(currentPath()) && !currentPath().startsWith('/programme')) navigate('/');
  });

  if (!isConfigured) {
    toast(t('errors.not_configured'), 'error', 12000);
  }

  await startRouter();
}

start();
