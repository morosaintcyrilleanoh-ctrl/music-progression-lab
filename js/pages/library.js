// =====================================================================
// Bibliothèque d'exercices : l'élève choisit librement un thème et un niveau.
// Les niveaux se débloquent en réussissant le précédent à 80 % ou plus.
// =====================================================================
import { html, mount, toast } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import { unlockAudio } from '../audio.js';
import { runExercises } from '../runner.js';
import { EAR_MODES, maxLevel } from '../exercises/ear-quiz.js';
import { getProfile, getExercisesList, getEarProgress, startSession, completeSession } from '../data.js';

const OTHER_TYPES = ['pitch_compare', 'melody_contour', 'rhythm_echo', 'pulse_tap', 'sing_note', 'sing_glide', 'sing_sequence', 'sing_pair', 'melody_sing', 'listening_quiz'];

export async function libraryPage() {
  const user = getUser();
  let profile, exercises, progress;
  try {
    [profile, exercises, progress] = await Promise.all([getProfile(user.id), getExercisesList(), getEarProgress(user.id).catch(() => ({}))]);
  } catch (err) {
    console.error(err);
    mount(html`<div class="container dash"><div class="alert alert-error">${t('errors.load')}</div></div>`);
    return;
  }
  const staff = profile?.role === 'trainer' || profile?.role === 'admin';
  const ear = exercises.filter((e) => e.type === 'ear_quiz');
  const byMode = Object.fromEntries(EAR_MODES.map((m) => [m, ear.filter((e) => e.params?.mode === m).sort((a, b) => a.params.level - b.params.level)]));
  const others = exercises.filter((e) => OTHER_TYPES.includes(e.type));
  const modes = t('ear.modes');
  const unlockedUpTo = (mode) => (staff ? maxLevel(mode) : Math.max(1, progress[mode] ?? 1));

  mount(html`
    <div class="container dash" style="max-width:900px">
      <div>
        <p class="eyebrow">${t('library.eyebrow')}</p>
        <h1>${t('library.title')}</h1>
        <p class="muted" style="margin:0">${t('library.lead')}</p>
        ${staff ? html`<p class="small muted" style="margin:6px 0 0">${t('library.staff_note')}</p>` : ''}
      </div>
      ${ear.length ? '' : html`<div class="alert alert-info">${t('library.not_installed')}</div>`}
      <div class="grid grid-2">
        ${EAR_MODES.filter((m) => byMode[m].length).map((m) => html`
          <section class="card lib-card" aria-labelledby="lib-${m}">
            <div class="lib-head"><span class="lib-icon" aria-hidden="true">${modes[m].icon}</span>
              <div><h2 id="lib-${m}" style="font-size:1.15rem;margin:0">${modes[m].title}</h2>
              <p class="muted small" style="margin:2px 0 0">${modes[m].lead}</p></div></div>
            <ol class="lib-levels">
              ${byMode[m].map((e) => {
                const open = e.params.level <= unlockedUpTo(m);
                return html`<li><button class="lib-level ${open ? '' : 'is-locked'}" type="button" data-ex="${e.slug}" ${open ? '' : 'disabled'}
                  title="${open ? '' : t('library.locked')}">
                  <span class="lib-n">${open ? e.params.level : '🔒'}</span>
                  <span>${e.objective}</span></button></li>`;
              })}
            </ol>
          </section>`)}
      </div>
      ${others.length ? html`
        <section class="card">
          <h2 style="font-size:1.15rem;margin:0">${t('library.others')}</h2>
          <p class="muted small" style="margin:4px 0 12px">${t('library.others_lead')}</p>
          <div class="ear-demo">${others.map((e) => html`<button class="btn btn-ghost btn-sm" type="button" data-ex="${e.slug}">${e.title}${e.requires_mic ? ' 🎤' : ''}</button>`)}</div>
        </section>` : ''}
    </div>`);

  document.querySelectorAll('[data-ex]').forEach((btn) => btn.addEventListener('click', () => {
    const ex = exercises.find((e) => e.slug === btn.dataset.ex);
    if (ex) runOne(ex);
  }));

  async function runOne(ex) {
    unlockAudio();
    let sessionId = null;
    try { sessionId = await startSession(null); } catch (err) { console.error(err); toast(t('errors.generic'), 'error'); return; }
    const out = await runExercises({ title: ex.title, exercises: [ex], sessionId, voice: profile?.voice_range ?? null });
    if (!out) return;
    try { await completeSession(sessionId, { score: out.score, validated: true }); } catch (err) { console.error(err); }

    const r = out.results[ex.slug] ?? { correct: 0, total: 0 };
    let nextEx = null, msg = '';
    if (ex.type === 'ear_quiz') {
      const mode = ex.params.mode, level = ex.params.level;
      const after = await getEarProgress(user.id).catch(() => progress);
      progress = after;
      const passed = r.total > 0 && r.correct / r.total >= 0.8;
      if (level >= maxLevel(mode)) msg = passed ? t('library.max_level') : t('library.keep_going');
      else if (passed || staff) {
        nextEx = byMode[mode].find((e) => e.params.level === level + 1) ?? null;
        msg = passed ? t('ear.unlocked', { n: level + 1 }) : '';
      } else msg = t('library.keep_going');
    }
    out.titleEl.textContent = t('library.done_title');
    out.stage.innerHTML = String(html`
      <div class="summary">
        ${out.score !== null ? html`<div class="big-score"><span>${out.score}</span>%</div>` : ''}
        ${r.total ? html`<p class="center" style="margin:0">${r.correct} / ${r.total}</p>` : ''}
        ${msg ? html`<div class="alert alert-info" style="margin-top:12px">${msg}</div>` : ''}
        <div class="row" style="margin-top:16px">
          ${nextEx ? html`<button class="btn" type="button" id="lib-next">${t('library.next_level')} →</button>` : ''}
          <button class="btn ${nextEx ? 'btn-ghost' : ''}" type="button" id="lib-again">↻ ${t('library.again')}</button>
          <a class="btn btn-ghost" href="#/bibliotheque" id="lib-back">${t('library.back')}</a>
        </div>
      </div>`);
    document.getElementById('lib-again').addEventListener('click', () => runOne(ex));
    document.getElementById('lib-next')?.addEventListener('click', () => runOne(nextEx));
    document.getElementById('lib-back').addEventListener('click', (e) => { e.preventDefault(); libraryPage(); });
  }
}
