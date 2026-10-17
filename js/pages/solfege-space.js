// =====================================================================
// Mon espace solfège (élève) : formations, lives, ressources du formateur
// =====================================================================
import { html, mount, toast } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import { navigate } from '../router.js';
import {
  getSolfegeCourses, getSolfegeCourse, getSolfegeLessonResources, getSolfegeProgress, setSolfegeLessonDone,
  getSolfegeLives, getSolfegeResources, getMyTrainers
} from '../data.js';
import { resourceCard, bindMedia, videoEmbed, liveState, fmtWhen, fmtDay, safeUrl } from './solfege-media.js';

const SECTIONS = ['formations', 'lives', 'ressources'];
const TILE_ICONS = { formations: '🎓', lives: '🎥', ressources: '📁' };
const isMissing = (err) => err?.code === '42P01' || err?.code === 'PGRST205';
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const byPosition = (a, b) => a.position - b.position || a.created_at?.localeCompare(b.created_at ?? '');

function errorBox(err) {
  if (!isMissing(err)) console.error(err);
  return html`<div class="alert ${isMissing(err) ? 'alert-info' : 'alert-error'}" role="alert">${isMissing(err) ? t('sol.not_ready') : t('errors.load')}</div>`;
}

// Rien à afficher : l'élève a-t-il rejoint un formateur ?
async function emptyBox(text) {
  const trainers = await getMyTrainers().catch(() => null);
  if (Array.isArray(trainers) && !trainers.length) {
    return html`<section class="card"><p class="muted" style="margin:0 0 12px">${t('sol.no_trainer')}</p><a class="btn btn-sm" href="#/cours">${t('sol.join_trainer')}</a></section>`;
  }
  return html`<section class="card"><p class="muted" style="margin:0">${text}</p></section>`;
}

export function liveCard(live, { compact = false } = {}) {
  const state = liveState(live);
  return html`
    <section class="card sol-live ${state === 'now' ? 'is-now' : ''}">
      <div class="row" style="gap:8px">
        ${state === 'now' ? html`<span class="sol-badge sol-badge-live">● ${t('sol.live_now')}</span>`
          : state === 'upcoming' ? html`<span class="sol-badge">${t('sol.live_upcoming')}</span>` : html`<span class="sol-badge sol-badge-past">${t('sol.live_past')}</span>`}
        <span class="muted small">${fmtWhen(live.starts_at)} · ${t('sol.minutes', { n: live.duration_minutes })}</span>
      </div>
      <h3 style="margin:8px 0 4px;font-size:1.05rem">${live.title}</h3>
      ${live.description && !compact ? html`<p class="muted small" style="margin:0 0 4px;white-space:pre-wrap">${live.description}</p>` : ''}
      ${state === 'past'
        ? (live.replay_url ? html`<a class="btn btn-sm btn-ghost" href="${safeUrl(live.replay_url)}" target="_blank" rel="noopener noreferrer">▶ ${t('sol.replay')} ↗</a>` : '')
        : html`<a class="btn ${state === 'now' ? '' : 'btn-ghost'}" style="margin-top:8px" href="${safeUrl(live.meeting_url)}" target="_blank" rel="noopener noreferrer">${state === 'now' ? t('sol.join_live') : t('sol.live_link')} ↗</a>`}
    </section>`;
}

// ---------------------------------------------------------------------
export async function solfegeSpacePage({ section } = {}) {
  const current = SECTIONS.includes(section) ? section : 'formations';
  mount(html`
    <div class="container dash">
      <div>
        <a href="/solfege/" class="small">← ${t('nav.solfege')}</a>
        <h1 style="margin-top:10px">${t('sol.title')}</h1>
      </div>
      <nav class="sol-tiles" aria-label="${t('sol.title')}">
        ${SECTIONS.map((s) => html`<a class="sol-tile" href="#/espace-solfege/${s}" ${s === current ? html`aria-current="page"` : ''}><span aria-hidden="true">${TILE_ICONS[s]}</span>${t('sol.' + s)}</a>`)}
      </nav>
      <div id="sol-zone" class="dash-inner"><div class="spinner" role="status"></div></div>
    </div>`);
  const zone = document.getElementById('sol-zone');
  try {
    if (current === 'formations') await coursesSection(zone);
    if (current === 'lives') await livesSection(zone);
    if (current === 'ressources') await resourcesSection(zone);
  } catch (err) {
    if (document.contains(zone)) zone.innerHTML = String(errorBox(err));
  }
}

async function coursesSection(zone) {
  const user = getUser();
  const [courses, progress, lives] = await Promise.all([getSolfegeCourses(), getSolfegeProgress(user.id), getSolfegeLives().catch(() => [])]);
  const done = new Set(progress.map((p) => p.lesson_id));
  const soon = lives.filter((l) => liveState(l) !== 'past' && Date.parse(l.starts_at) - Date.now() < 86400000);
  zone.innerHTML = String(html`
    ${soon.map((l) => liveCard(l, { compact: true }))}
    ${courses.length ? courses.map((c) => {
      const n = c.lessons.length;
      const d = c.lessons.filter((l) => done.has(l.id)).length;
      return html`<a class="card sol-course" href="#/espace-solfege/formation/${c.id}">
        <span class="sol-badge">${d === n && n ? t('sol.course_done') : d ? t('sol.course_in_progress') : t('sol.course_new')}</span>
        <h3 style="margin:8px 0 2px;font-size:1.1rem">${c.title}</h3>
        <p class="muted small" style="margin:0">${t('sol.lessons_progress', { d, n })}</p>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct(d, n)}" aria-label="${c.title}"><span style="width:${pct(d, n)}%"></span></div>
      </a>`;
    }) : await emptyBox(t('sol.no_courses'))}`);
}

async function livesSection(zone) {
  const lives = await getSolfegeLives();
  const next = lives.filter((l) => liveState(l) !== 'past');
  const past = lives.filter((l) => liveState(l) === 'past').reverse().slice(0, 12);
  zone.innerHTML = String(html`
    <h2 style="font-size:1.15rem;margin:0">${t('sol.lives_next')}</h2>
    ${next.length ? next.map((l) => liveCard(l)) : await emptyBox(t('sol.no_lives'))}
    ${past.length ? html`<h2 style="font-size:1.15rem;margin:8px 0 0">${t('sol.lives_past')}</h2>${past.map((l) => liveCard(l, { compact: true }))}` : ''}`);
}

async function resourcesSection(zone) {
  const resources = await getSolfegeResources();
  if (!resources.length) { zone.innerHTML = String(await emptyBox(t('sol.no_resources'))); return; }
  const kinds = [...new Set(resources.map((r) => r.kind))];
  zone.innerHTML = String(html`
    ${kinds.length > 1 ? html`<div class="sol-chips" role="group" aria-label="${t('sol.filter')}">
      <button type="button" class="sol-chip" aria-pressed="true" data-filter="">${t('sol.all')}</button>
      ${kinds.map((k) => html`<button type="button" class="sol-chip" aria-pressed="false" data-filter="${k}">${t('sol.kinds_plural')[k] ?? k}</button>`)}
    </div>` : ''}
    <ul class="res-list" id="sol-res">${resources.map((r) => resourceCard(r, { meta: fmtDay(r.created_at) }))}</ul>`);
  const list = document.getElementById('sol-res');
  bindMedia(list);
  zone.querySelectorAll('[data-filter]').forEach((chip) => chip.addEventListener('click', () => {
    zone.querySelectorAll('[data-filter]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    list.querySelectorAll('[data-kind]').forEach((li) => { li.hidden = !!chip.dataset.filter && li.dataset.kind !== chip.dataset.filter; });
  }));
}

// ---------------------------------------------------------------------
// Une formation : leçon choisie (ou la première non terminée) + liste des leçons
// ---------------------------------------------------------------------
export async function solfegeCoursePage({ id, lesson: lessonId }) {
  const user = getUser();
  let course, progress, attachments;
  try {
    [course, progress] = await Promise.all([getSolfegeCourse(id), getSolfegeProgress(user.id)]);
  } catch (err) {
    mount(html`<div class="container dash">${errorBox(err)}</div>`);
    return;
  }
  if (!course) {
    mount(html`<div class="container dash"><h1>${t('sol.course_not_found')}</h1><a class="btn" href="#/espace-solfege/formations">${t('sol.back_courses')}</a></div>`);
    return;
  }
  const lessons = [...course.lessons].sort(byPosition);
  const done = new Set(progress.map((p) => p.lesson_id));
  const lesson = lessons.find((l) => l.id === lessonId) ?? lessons.find((l) => !done.has(l.id)) ?? lessons[0];
  attachments = lesson ? await getSolfegeLessonResources([lesson.id]).catch(() => []) : [];
  const index = lesson ? lessons.indexOf(lesson) : -1;
  const next = lessons[index + 1];
  const d = lessons.filter((l) => done.has(l.id)).length;
  const isDone = lesson && done.has(lesson.id);

  mount(html`
    <div class="container dash">
      <div>
        <a href="#/espace-solfege/formations" class="small">← ${t('sol.formations')}</a>
        <h1 style="margin:10px 0 4px">${course.title}</h1>
        <p class="muted" style="margin:0">${t('sol.lessons_progress', { d, n: lessons.length })}</p>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct(d, lessons.length)}" aria-label="${course.title}"><span style="width:${pct(d, lessons.length)}%"></span></div>
        ${course.description ? html`<p class="muted" style="margin:12px 0 0;white-space:pre-wrap">${course.description}</p>` : ''}
      </div>
      ${lesson ? html`
      <section class="card" id="sol-lesson">
        <span class="sol-badge">${t('sol.lesson_n', { n: index + 1 })}</span>
        <h2 style="margin:8px 0 10px;font-size:1.2rem">${lesson.title}</h2>
        ${lesson.video_url ? videoEmbed(lesson.video_url, lesson.title) : ''}
        ${lesson.content ? html`<div class="res-text" style="margin:12px 0 0">${lesson.content}</div>` : ''}
        ${attachments.length ? html`<ul class="res-list" style="margin-top:14px" id="sol-att">${attachments.map((r) => resourceCard(r))}</ul>` : ''}
        <div class="row" style="margin-top:16px">
          <button class="btn ${isDone ? 'btn-ghost' : ''}" type="button" id="sol-done">${isDone ? '↺ ' + t('sol.mark_undone') : '✓ ' + t('sol.mark_done')}</button>
          ${next ? html`<a class="btn btn-ghost" href="#/espace-solfege/formation/${course.id}/${next.id}">${t('sol.next_lesson')} →</a>` : ''}
        </div>
      </section>
      <section class="card">
        <h2 style="font-size:1.1rem">${t('sol.lessons')}</h2>
        <ol class="sol-lessons">${lessons.map((l, i) => html`<li>
          <a href="#/espace-solfege/formation/${course.id}/${l.id}" ${l.id === lesson.id ? html`aria-current="page"` : ''}>
            <span class="sol-dot ${done.has(l.id) ? 'is-done' : ''}" aria-hidden="true">${done.has(l.id) ? '✓' : i + 1}</span>
            <span>${l.title}</span>${done.has(l.id) ? html`<span class="sr-only">(${t('sol.done')})</span>` : ''}
          </a></li>`)}</ol>
      </section>` : html`<section class="card"><p class="muted" style="margin:0">${t('sol.no_lessons')}</p></section>`}
    </div>`);

  bindMedia(document.getElementById('sol-att'));
  document.getElementById('sol-done')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      await setSolfegeLessonDone(lesson.id, !isDone);
      if (!isDone && next) navigate(`/espace-solfege/formation/${course.id}/${next.id}`);
      else solfegeCoursePage({ id, lesson: lesson.id });
    } catch (err) {
      console.error(err);
      e.currentTarget.disabled = false;
      toast(t('errors.generic'), 'error');
    }
  });
}
