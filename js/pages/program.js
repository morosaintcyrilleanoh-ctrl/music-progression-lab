// Le programme de 7 jours : liste des journées + détail d'une journée
import { html, mount } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import { getStarterProgram, getProgramDay, getUserProgram } from '../data.js';

function loadError() {
  mount(html`<div class="container dash"><div class="alert alert-error" role="alert">${t('errors.load')}</div></div>`);
}

export async function programPage() {
  const user = getUser();
  let program, userProgram = null;
  try {
    program = await getStarterProgram();
    if (user && program) userProgram = await getUserProgram(user.id, program.id);
  } catch (err) { console.error(err); return loadError(); }
  if (!program) return loadError();

  const finished = userProgram?.status === 'completed';
  const current = user ? (userProgram?.current_day ?? 1) : null;

  mount(html`
    <div class="container dash" style="max-width:760px">
      <div>
        <h1>${program.title}</h1>
        <p class="muted" style="margin:0">${program.description}</p>
      </div>
      <ul class="day-list">
        ${program.days.map((d) => {
          const done = finished || (current && d.day_number < current);
          const isCurrent = !finished && current === d.day_number;
          return html`
            <li><a class="day-item ${done ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}" href="#/programme/${d.day_number}">
              <span class="day-num" aria-hidden="true">${done ? '✓' : d.day_number}</span>
              <span style="flex:1">
                <span class="day-title">${t('program.day', { n: d.day_number })} — ${d.title}</span>
                <span class="day-obj">${d.objective}</span>
              </span>
              ${done ? html`<span class="badge-pill">${t('program.done')}</span>` : ''}
              ${isCurrent ? html`<span class="badge-pill">${t('program.current')}</span>` : ''}
            </a></li>`;
        })}
      </ul>
      ${user ? '' : html`<p class="muted"><a href="#/connexion">${t('program.login_to_track')}</a></p>`}
    </div>`);
}

export async function programDayPage({ jour }) {
  const n = Number.parseInt(jour, 10);
  let result;
  try { result = Number.isInteger(n) ? await getProgramDay(n) : null; }
  catch (err) { console.error(err); return loadError(); }

  if (!result) {
    mount(html`<div class="container dash"><h1>${t('program.not_found')}</h1><a class="btn" href="#/programme">${t('program.back')}</a></div>`);
    return;
  }
  const { day, program } = result;
  const steps = Array.isArray(day.steps) ? day.steps : [];

  mount(html`
    <article class="container dash" style="max-width:760px">
      <div>
        <a href="#/programme" class="small">← ${t('program.back')}</a>
        <p class="eyebrow" style="margin-top:16px">${t('program.day', { n: day.day_number })} / ${program.duration_days} · ${t('common.minutes_short', { n: day.duration_minutes })}</p>
        <h1>${day.title}</h1>
        <p style="font-size:1.1rem;margin:0">${day.objective}</p>
      </div>

      ${day.safety_note ? html`<div class="alert alert-info" role="note"><strong>${t('program.safety')} :</strong> ${day.safety_note}</div>` : ''}

      <section class="card" aria-labelledby="steps-title">
        <h2 id="steps-title" style="font-size:1.2rem">${t('program.steps')}</h2>
        <ol class="steps">
          ${steps.map((s) => html`<li><span class="min">${t('common.minutes_short', { n: s.minutes })}</span><span>${s.text}</span></li>`)}
        </ol>
      </section>

      <div class="info-grid">
        <section class="card"><h3>${t('program.practice')}</h3><p style="margin:0">${day.practice}</p></section>
        <section class="card"><h3>${t('program.challenge')}</h3><p style="margin:0">${day.challenge}</p></section>
        <section class="card"><h3>${t('program.validation')}</h3><p style="margin:0">${day.validation}</p></section>
        ${day.materials ? html`<section class="card"><h3>${t('program.materials')}</h3><p style="margin:0">${day.materials}</p></section>` : ''}
      </div>

      <section class="card card-highlight">
        <button class="btn btn-lg btn-block" type="button" disabled aria-describedby="soon-note">${t('program.start_soon')}</button>
        <p id="soon-note" class="small" style="margin:12px 0 0;color:#e0e7ff">${t('program.soon_note')}</p>
      </section>
    </article>`);
}
