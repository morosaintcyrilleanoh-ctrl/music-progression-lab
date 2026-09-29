// =====================================================================
// "Mon cours" (élève) : formateur, messages, devoirs, ressources
// + page d'un devoir
// =====================================================================
import { html, mount, toast, setBusy } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import { unlockAudio } from '../audio.js';
import { runExercises } from '../runner.js';
import {
  joinTrainer, getMyTrainers, getMyRecommendations, markRecommendationRead, getVisibleResources,
  getVisibleAssignments, getMyAssignmentProgress, getAssignment, completeAssignment, getFileUrl, getProfile
} from '../data.js';

const ICONS = { pdf: '📄', audio: '🎧', link: '🔗', text: '📝' };

// ---------- Une ressource (utilisée aussi par l'espace formateur) ----------
export function resourceItem(r, { deletable = false } = {}) {
  return html`
    <li class="res-item" data-res="${r.id}">
      <div class="res-head">
        <span class="res-icon" aria-hidden="true">${ICONS[r.kind] ?? '📁'}</span>
        <div style="flex:1;min-width:0">
          <strong>${r.title}</strong>
          ${r.description ? html`<p class="muted small" style="margin:2px 0 0">${r.description}</p>` : ''}
        </div>
        ${deletable ? html`<button class="btn btn-ghost btn-sm" type="button" data-del-res="${r.id}" aria-label="${t('trainer.delete')} ${r.title}">🗑</button>` : ''}
      </div>
      <div class="res-actions">
        ${r.kind === 'pdf' ? html`<button class="btn btn-sm" type="button" data-open-file="${r.storage_path}">${t('course.open_pdf')}</button>` : ''}
        ${r.kind === 'audio' ? html`<button class="btn btn-sm" type="button" data-play-file="${r.storage_path}">▶ ${t('course.listen')}</button><div data-audio-slot></div>` : ''}
        ${r.kind === 'link' ? html`<a class="btn btn-sm" href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer">${t('course.open_link')} ↗</a>` : ''}
        ${r.kind === 'text' ? html`<details><summary>${t('course.read_text')}</summary><div class="res-text">${r.body}</div></details>` : ''}
      </div>
    </li>`;
}

function safeUrl(url) {
  try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) ? u.href : '#'; } catch { return '#'; }
}

// Ouvre les PDF / lit les audios (liens temporaires sécurisés)
export function bindResourceActions(root) {
  root.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open-file]');
    const play = e.target.closest('[data-play-file]');
    if (open) {
      const win = window.open('', '_blank');
      try { const url = await getFileUrl(open.dataset.openFile); if (win) win.location = url; else window.location.href = url; }
      catch (err) { console.error(err); if (win) win.close(); toast(t('course.file_error'), 'error'); }
    }
    if (play) {
      setBusy(play, true);
      try {
        const url = await getFileUrl(play.dataset.playFile);
        const slot = play.parentElement.querySelector('[data-audio-slot]');
        slot.innerHTML = '';
        const audio = document.createElement('audio');
        audio.controls = true; audio.src = url; audio.className = 'res-audio'; audio.preload = 'auto';
        slot.appendChild(audio);
        play.remove();
        audio.play().catch(() => {});
      } catch (err) { console.error(err); setBusy(play, false); toast(t('course.file_error'), 'error'); }
    }
  });
}

// ---------------------------------------------------------------------
export async function coursePage() {
  const user = getUser();
  let trainers, messages, resources, assignments, progress;
  try {
    [trainers, messages, resources, assignments, progress] = await Promise.all([
      getMyTrainers(), getMyRecommendations(), getVisibleResources(), getVisibleAssignments(), getMyAssignmentProgress(user.id)
    ]);
  } catch (err) {
    console.error(err);
    mount(html`<div class="container dash"><div class="alert alert-error" role="alert">${t('errors.load')}</div></div>`);
    return;
  }
  const doneIds = new Set(progress.map((p) => p.assignment_id));
  // On n'affiche que les ressources et devoirs des formateurs (pas les siens si on est formateur)
  const mine = (x) => x.trainer_id !== user.id;
  const res = resources.filter(mine);
  const devoirs = assignments.filter(mine);
  const todo = devoirs.filter((a) => !doneIds.has(a.id));
  const done = devoirs.filter((a) => doneIds.has(a.id));
  const codeFromLink = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('code') ?? '';

  mount(html`
    <div class="container dash" style="max-width:860px">
      <div><h1>${t('course.title')}</h1><p class="muted" style="margin:0">${t('course.lead')}</p></div>

      <section class="card" aria-labelledby="c-trainer">
        <h2 id="c-trainer" style="font-size:1.15rem">${t('course.my_trainer')}</h2>
        ${trainers.length ? html`<p style="margin:0 0 12px">${t('course.linked', { names: trainers.map((x) => x.full_name ?? '—').join(', ') })}</p>` : html`<p class="muted" style="margin:0 0 12px">${t('course.no_trainer')}</p>`}
        <form class="row" id="join-form" novalidate>
          <label class="sr-only" for="join-code">${t('course.code_label')}</label>
          <input class="input" id="join-code" name="code" placeholder="MPL-XXXXX" autocomplete="off" style="max-width:220px;text-transform:uppercase" value="${codeFromLink}">
          <button class="btn" type="submit">${t('course.join')}</button>
        </form>
      </section>

      ${messages.length ? html`
        <section class="card" aria-labelledby="c-msg">
          <h2 id="c-msg" style="font-size:1.15rem">${t('course.messages')}</h2>
          <ul class="plain-list">${messages.map((m) => html`
            <li class="msg ${m.read_at ? '' : 'is-new'}">
              ${m.read_at ? '' : html`<span class="badge-pill">${t('course.new')}</span> `}
              <span>${m.message}</span>
              <span class="muted small"> — ${m.trainer_name ?? ''}, ${new Date(m.created_at).toLocaleDateString('fr-FR')}</span>
            </li>`)}</ul>
        </section>` : ''}

      <section class="card" aria-labelledby="c-dev">
        <h2 id="c-dev" style="font-size:1.15rem">${t('course.homework')} ${todo.length ? html`<span class="badge-pill">${todo.length}</span>` : ''}</h2>
        ${devoirs.length ? html`<ul class="plain-list">
          ${[...todo, ...done].map((a) => html`<li class="dev-item">
            <a href="#/devoir/${a.id}" class="dev-link">
              <span>${doneIds.has(a.id) ? '✅' : '📌'} <strong>${a.title}</strong></span>
              <span class="muted small">${a.kind === 'app_exercise' ? t('course.kind_app') : t('course.kind_free')}${a.due_date ? ' · ' + t('course.due', { d: new Date(a.due_date).toLocaleDateString('fr-FR') }) : ''}</span>
            </a></li>`)}
        </ul>` : html`<p class="muted" style="margin:0">${t('course.no_homework')}</p>`}
      </section>

      <section class="card" aria-labelledby="c-res">
        <h2 id="c-res" style="font-size:1.15rem">${t('course.resources')}</h2>
        ${res.length ? html`<ul class="res-list" id="res-list">${res.map((r) => resourceItem(r))}</ul>` : html`<p class="muted" style="margin:0">${t('course.no_resources')}</p>`}
      </section>
    </div>`);

  const list = document.getElementById('res-list');
  if (list) bindResourceActions(list);

  // Les messages affichés sont marqués comme lus
  messages.filter((m) => !m.read_at).forEach((m) => markRecommendationRead(m.id).catch(() => {}));

  document.getElementById('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = e.currentTarget.elements.code.value.trim();
    if (!code) return;
    const btn = e.currentTarget.querySelector('button');
    setBusy(btn, true);
    try {
      const name = await joinTrainer(code);
      toast(t('course.joined', { name }), 'success');
      history.replaceState(null, '', '#/cours');
      coursePage();
    } catch (err) {
      setBusy(btn, false);
      toast(err?.message?.includes('introuvable') || err?.message?.includes('propre') ? err.message : t('errors.generic'), 'error');
    }
  });
}

// ---------------------------------------------------------------------
export async function assignmentPage({ id }) {
  const user = getUser();
  let a, progress, profile;
  try { [a, progress, profile] = await Promise.all([getAssignment(id), getMyAssignmentProgress(user.id), getProfile(user.id)]); }
  catch (err) { console.error(err); a = null; }
  if (!a) {
    mount(html`<div class="container dash"><h1>${t('course.not_found')}</h1><a class="btn" href="#/cours">${t('course.back')}</a></div>`);
    return;
  }
  const mineDone = progress.find((p) => p.assignment_id === a.id);

  mount(html`
    <div class="container dash" style="max-width:760px">
      <div>
        <a href="#/cours" class="small">← ${t('course.back')}</a>
        <p class="eyebrow" style="margin-top:16px">${a.kind === 'app_exercise' ? t('course.kind_app') : t('course.kind_free')}${a.due_date ? ' · ' + t('course.due', { d: new Date(a.due_date).toLocaleDateString('fr-FR') }) : ''}</p>
        <h1>${a.title}</h1>
      </div>
      ${mineDone ? html`<div class="alert alert-success">${t('course.already_done', { d: new Date(mineDone.done_at).toLocaleDateString('fr-FR') })}${mineDone.score !== null ? ` — ${Math.round(mineDone.score)} %` : ''}</div>` : ''}
      ${a.instructions ? html`<section class="card"><h2 style="font-size:1.1rem">${t('course.instructions')}</h2><div class="res-text">${a.instructions}</div></section>` : ''}
      ${a.resource ? html`<section class="card"><h2 style="font-size:1.1rem">${t('course.attached')}</h2><ul class="res-list" id="dev-res">${resourceItem(a.resource)}</ul></section>` : ''}
      <section class="card card-highlight" id="dev-action">
        ${a.kind === 'app_exercise' && a.exercise ? html`
          <p style="margin:0 0 12px;color:#e0e7ff">${a.exercise.title}${a.exercise.objective ? ' — ' + a.exercise.objective : ''}</p>
          <button class="btn btn-lg btn-block" style="background:#fff;color:#1e1b4b" type="button" id="dev-start">▶ ${mineDone ? t('course.redo') : t('course.start')}</button>`
        : html`
          <form class="form" id="dev-form">
            <div class="field"><label for="dev-comment" style="color:#e0e7ff">${t('course.answer')}</label>
              <textarea class="input" id="dev-comment" name="comment" rows="4" maxlength="2000">${mineDone?.comment ?? ''}</textarea></div>
            <button class="btn btn-lg btn-block" style="background:#fff;color:#1e1b4b" type="submit">✓ ${t('course.mark_done')}</button>
          </form>`}
      </section>
    </div>`);

  const resList = document.getElementById('dev-res');
  if (resList) bindResourceActions(resList);

  document.getElementById('dev-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector('button');
    setBusy(btn, true);
    try {
      await completeAssignment(a.id, null, e.currentTarget.elements.comment.value);
      toast(t('course.done_toast'), 'success');
      window.location.hash = '#/cours';
    } catch (err) { console.error(err); setBusy(btn, false); toast(t('errors.generic'), 'error'); }
  });

  document.getElementById('dev-start')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    unlockAudio();
    const exercise = { ...a.exercise, params: { ...(a.exercise.params ?? {}), ...(a.params ?? {}) } };
    const out = await runExercises({ title: a.title, exercises: [exercise], voice: profile?.voice_range ?? null });
    if (!out) return;
    try { await completeAssignment(a.id, out.score, null); } catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
    out.titleEl.textContent = t('course.done_title');
    out.stage.innerHTML = String(html`<div class="summary">
      ${out.score !== null ? html`<div class="big-score"><span>${out.score}</span>%</div>` : ''}
      <p class="center">${t('course.done_text')}</p>
      <div class="row"><a class="btn" href="#/cours">${t('course.back')}</a><a class="btn btn-ghost" href="#/devoir/${a.id}" data-restart>${t('course.redo')}</a></div></div>`);
  });
}
