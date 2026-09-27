// Page d'accueil
import { html, mount } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import { getStarterProgram } from '../data.js';
import { isConfigured } from '../supabase.js';

export async function homePage() {
  const user = getUser();
  const loop = t('home.loop');

  mount(html`
    <section class="hero">
      <div class="container">
        <p class="eyebrow">${t('home.eyebrow')}</p>
        <h1>${t('home.title_1')} <span class="gradient-text">${t('home.title_2')}</span> ${t('home.title_3')}</h1>
        <p class="slogan">${t('home.lead')}</p>
        <div class="row">
          ${user
            ? html`<a class="btn btn-lg" href="#/tableau-de-bord">${t('home.cta_dashboard')}</a>`
            : html`<a class="btn btn-lg" href="#/inscription">${t('home.cta_start')}</a>
                   <a class="btn btn-lg btn-ghost" href="#/connexion">${t('home.cta_login')}</a>`}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h2 class="center">${t('home.loop_title')}</h2>
        <ol class="loop" style="list-style:none;padding:0;margin:24px 0 0">
          ${loop.map(([title, text], i) => html`
            <li class="card">
              <span class="step-num" aria-hidden="true">${i + 1}</span>
              <h3>${title}</h3>
              <p class="muted small" style="margin:0">${text}</p>
            </li>`)}
        </ol>
      </div>
    </section>

    <section class="section">
      <div class="container narrow" style="max-width:720px">
        <p class="eyebrow">${t('home.program_eyebrow')}</p>
        <h2>${t('home.program_title')}</h2>
        <p class="muted">${t('home.program_lead')}</p>
        <div id="home-days"><div class="spinner" role="status" aria-label="${t('common.loading')}"></div></div>
      </div>
    </section>

    <section class="section">
      <div class="container" style="max-width:720px">
        <div class="card card-highlight">
          <h2>${t('home.who_title')}</h2>
          <p style="margin:0">${t('home.who_text')}</p>
        </div>
      </div>
    </section>
  `);

  const zone = document.getElementById('home-days');
  if (!isConfigured) { zone.innerHTML = ''; return; }
  try {
    const program = await getStarterProgram();
    zone.innerHTML = program ? String(html`
      <ul class="day-list">
        ${program.days.map((d) => html`
          <li><a class="day-item" href="#/programme/${d.day_number}">
            <span class="day-num">${d.day_number}</span>
            <span><span class="day-title">${d.title}</span><span class="day-obj">${d.objective}</span></span>
          </a></li>`)}
      </ul>`) : '';
  } catch {
    zone.innerHTML = '';
  }
}
