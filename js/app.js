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

// ---------- Les pages ----------
route('/', homePage);
route('/inscription', signupPage);
route('/connexion', loginPage);
route('/mot-de-passe-oublie', forgotPage);
route('/nouveau-mot-de-passe', resetPage);
route('/tableau-de-bord', dashboardPage, { auth: true });
route('/programme', programPage);
route('/programme/:jour', programDayPage);
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
function renderNav() {
  const nav = document.getElementById('nav');
  const user = getUser();
  nav.innerHTML = String(user
    ? html`
      <a class="nav-link" href="#/tableau-de-bord"><span class="label-long">${t('nav.dashboard')}</span><span class="label-short">${t('nav.dashboard_short')}</span></a>
      <a class="nav-link" href="#/programme"><span class="label-long">${t('nav.program')}</span><span class="label-short">${t('nav.program_short')}</span></a>
      <button class="btn btn-ghost btn-sm" type="button" id="logout-btn" aria-label="${t('nav.logout')}"><span class="label-long">${t('nav.logout')}</span><span class="label-short">${t('nav.logout_short')}</span></button>`
    : html`
      <a class="nav-link" href="#/connexion">${t('nav.login')}</a>
      <a class="btn btn-sm" href="#/inscription">${t('nav.signup')}</a>`);

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
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

  onAuthChange((event) => {
    renderNav();
    if (event === 'PASSWORD_RECOVERY') navigate('/nouveau-mot-de-passe');
    // Si l'utilisateur se déconnecte sur une page privée, on le renvoie à l'accueil
    if (event === 'SIGNED_OUT' && currentPath() === '/tableau-de-bord') navigate('/');
  });

  if (!isConfigured) {
    toast(t('errors.not_configured'), 'error', 12000);
  }

  await startRouter();
}

start();
