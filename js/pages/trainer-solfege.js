// =====================================================================
// Espace formateur → onglet Solfège : formations (leçons), lives, ressources
// =====================================================================
import { html, mount, toast, setBusy, setFormMessage } from '../ui.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import {
  getStudentList, getSolfegeCourses, getSolfegeCourse, createSolfegeCourse, deleteSolfegeCourse,
  createSolfegeLesson, deleteSolfegeLesson, getSolfegeLessonResources, getSolfegeCourseProgress,
  getSolfegeLives, createSolfegeLive, updateSolfegeLive, deleteSolfegeLive,
  getSolfegeResources, createSolfegeResource, deleteSolfegeResource, uploadSolfegeFile, getSolfegeCohorts
} from '../data.js';
import { agendaView, coachingView, homeworkView } from './trainer-solfege-pro.js';
import { resourceCard, bindMedia, liveState, fmtWhen, fmtDay, fileKind, FILE_ACCEPT, MAX_MB, safeUrl } from './solfege-media.js';

const VIEWS = ['agenda', 'formations', 'lives', 'ressources', 'devoirs', 'coaching'];
const PRO_VIEWS = { agenda: agendaView, devoirs: homeworkView, coaching: coachingView };
// Sessions payantes du formateur (pour « Pour : … » dans les formulaires)
let COHORTS = [];
const isMissing = (err) => err?.code === '42P01' || err?.code === 'PGRST205' || /bucket not found/i.test(err?.message ?? '');
const view = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('vue');
const isHttps = (u) => /^https:\/\/\S+$/i.test(u) && u.length <= 500;

export function studentOptions(students, cohorts = COHORTS) {
  return html`<option value="">${t('trainer.all_students')}</option>
    ${cohorts.length ? html`<optgroup label="${t('pro.paid_sessions')}">${cohorts.map((c) => html`<option value="cohort:${c.id}">⭐ ${c.title}</option>`)}</optgroup>` : ''}
    <optgroup label="${t('pro.one_student')}">${students.map((s) => html`<option value="${s.id}">${s.full_name ?? s.email}</option>`)}</optgroup>`;
}
// Valeur du choix « Pour » → colonnes (élève seul, ou session payante)
export const target = (value) => (value?.startsWith('cohort:') ? { student_id: null, cohort_id: value.slice(7) } : { student_id: value || null });
export const forWho = (row, students, cohorts = COHORTS) => (row.cohort_id ? `⭐ ${cohorts.find((c) => c.id === row.cohort_id)?.title ?? t('pro.paid_formation')}`
  : row.student_id ? t('trainer.for_one', { name: students.find((s) => s.id === row.student_id)?.full_name ?? '—' }) : t('trainer.for_all'));

// Message d'erreur compréhensible (fichier refusé, trop lourd, base pas prête…)
function errorText(err) {
  const msg = err?.message ?? '';
  if (isMissing(err)) return t('sol.not_ready');
  if (/mime|type/i.test(msg)) return t('sol.bad_file');
  if (/size|large|exceed/i.test(msg)) return t('trainer.too_big', { mb: MAX_MB });
  return t('trainer.publish_error');
}

// Fichier choisi → { kind, path, size } après envoi (ou message d'erreur)
async function sendFile(me, f) {
  const kind = fileKind(f);
  if (!kind) throw Object.assign(new Error('type'), { userMessage: t('sol.bad_file') });
  if (f.size > MAX_MB * 1024 * 1024) throw Object.assign(new Error('size'), { userMessage: t('trainer.too_big', { mb: MAX_MB }) });
  return { kind, path: await uploadSolfegeFile(me.id, f), size: f.size };
}

export async function solfegeTab(zone, me) {
  const current = VIEWS.includes(view()) ? view() : 'agenda';
  zone.innerHTML = String(html`
    <div class="sol-chips" style="margin-bottom:14px">
      ${VIEWS.map((v) => html`<a class="sol-chip" href="#/formateur/solfege?vue=${v}" aria-pressed="${v === current}">${t('sol.' + v)}</a>`)}
    </div>
    <div id="sol-tr"><div class="spinner" role="status"></div></div>`);
  const inner = document.getElementById('sol-tr');
  try {
    const [students, cohorts] = await Promise.all([getStudentList(), getSolfegeCohorts().catch(() => [])]);
    COHORTS = cohorts.filter((c) => c.trainer_id === me.id);
    if (PRO_VIEWS[current]) await PRO_VIEWS[current](inner, me, students, COHORTS);
    if (current === 'formations') await coursesView(inner, me, students);
    if (current === 'lives') await livesView(inner, me, students);
    if (current === 'ressources') await resourcesView(inner, me, students);
  } catch (err) {
    if (!isMissing(err)) console.error(err);
    inner.innerHTML = String(html`<div class="alert ${isMissing(err) ? 'alert-info' : 'alert-error'}" role="alert">${isMissing(err) ? t('sol.not_ready') : t('trainer.load_error')}</div>`);
  }
}
const reload = (v) => navigate(`/formateur/solfege?vue=${v}`);

// ---------------- Formations ----------------
async function coursesView(zone, me, students) {
  const courses = (await getSolfegeCourses()).filter((c) => c.trainer_id === me.id);
  zone.innerHTML = String(html`
    <div class="dash-inner">
      <section class="card">
        <h2 style="font-size:1.15rem">${t('sol.new_course')}</h2>
        <form class="form" id="course-form" novalidate>
          <div data-form-message></div>
          <div class="field"><label for="c-title">${t('trainer.res_title')}</label><input class="input" id="c-title" name="title" maxlength="160" required placeholder="${t('sol.course_ph')}"></div>
          <div class="field"><label for="c-desc">${t('sol.description')}</label><textarea class="input" id="c-desc" name="description" rows="3" maxlength="4000"></textarea></div>
          <div class="field"><label for="c-to">${t('trainer.res_to')}</label><select class="input" id="c-to" name="to">${studentOptions(students)}</select></div>
          <button class="btn" type="submit">${t('sol.create_course')}</button>
        </form>
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('sol.my_courses')} <span class="badge-pill">${courses.length}</span></h2>
        ${courses.length ? html`<ul class="res-list">${courses.map((c) => html`<li class="res-item">
          <div class="res-head"><span class="sol-ico" aria-hidden="true">🎓</span>
            <div style="flex:1;min-width:0"><strong>${c.title}</strong><div class="muted small">${t('sol.n_lessons', { n: c.lessons.length })} · ${forWho(c, students)}</div></div>
            <button class="btn btn-ghost btn-sm" type="button" data-del-course="${c.id}" aria-label="${t('trainer.delete')} ${c.title}">🗑</button></div>
          <div class="res-actions"><a class="btn btn-sm" href="#/formateur/solfege/${c.id}">${t('sol.manage_lessons')}</a></div>
        </li>`)}</ul>` : html`<p class="muted" style="margin:0">${t('sol.no_courses_trainer')}</p>`}
      </section>
    </div>`);

  const form = document.getElementById('course-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.elements.title.value.trim();
    if (title.length < 2) return setFormMessage(form, t('trainer.need_title'));
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true);
    try {
      const c = await createSolfegeCourse({ trainer_id: me.id, title, description: form.elements.description.value.trim(), ...target(form.elements.to.value), position: courses.length });
      toast(t('sol.course_created'), 'success');
      navigate(`/formateur/solfege/${c.id}`);
    } catch (err) { console.error(err); setBusy(btn, false); setFormMessage(form, errorText(err)); }
  });
  zone.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-course]');
    if (!del) return;
    const c = courses.find((x) => x.id === del.dataset.delCourse);
    if (!c || !confirm(t('sol.confirm_delete_course', { title: c.title }))) return;
    try { await deleteSolfegeCourse(c); toast(t('trainer.deleted')); reload('formations'); }
    catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
}

// ---------------- Une formation : ses leçons ----------------
export async function trainerSolfegeCoursePage({ id }, me) {
  let course, students, attachments, progress;
  try {
    [course, students] = await Promise.all([getSolfegeCourse(id), getStudentList()]);
    if (course && course.trainer_id !== me.id) course = null;
    const ids = (course?.lessons ?? []).map((l) => l.id);
    [attachments, progress] = await Promise.all([getSolfegeLessonResources(ids), getSolfegeCourseProgress(ids)]);
  } catch (err) {
    console.error(err);
    mount(html`<div class="container dash"><div class="alert alert-error" role="alert">${errorText(err)}</div></div>`);
    return;
  }
  if (!course) {
    mount(html`<div class="container dash"><h1>${t('sol.course_not_found')}</h1><a class="btn" href="#/formateur/solfege?vue=formations">${t('trainer.back')}</a></div>`);
    return;
  }
  const lessons = [...course.lessons].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  const name = (sid) => students.find((s) => s.id === sid)?.full_name ?? '—';

  mount(html`
    <div class="container dash">
      <div>
        <a href="#/formateur/solfege?vue=formations" class="small">← ${t('sol.my_courses')}</a>
        <h1 style="margin:10px 0 4px">${course.title}</h1>
        <p class="muted" style="margin:0">${forWho(course, students)} · ${t('sol.n_lessons', { n: lessons.length })}</p>
      </div>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('sol.lessons')}</h2>
        ${lessons.length ? html`<ul class="res-list" id="lessons">${lessons.map((l, i) => {
          const files = attachments.filter((a) => a.lesson_id === l.id);
          const who = progress.filter((p) => p.lesson_id === l.id).map((p) => name(p.student_id));
          return html`<li class="res-item">
            <div class="res-head"><span class="sol-dot" aria-hidden="true">${i + 1}</span>
              <div style="flex:1;min-width:0"><strong>${l.title}</strong>
                <div class="muted small">${[l.video_url ? '🎬 ' + t('sol.video') : '', files.length ? `📎 ${files.length}` : '', who.length ? '✓ ' + t('sol.done_by', { names: who.join(', ') }) : ''].filter(Boolean).join(' · ') || t('sol.lesson_text_only')}</div></div>
              <button class="btn btn-ghost btn-sm" type="button" data-del-lesson="${l.id}" aria-label="${t('trainer.delete')} ${l.title}">🗑</button></div>
            ${files.length ? html`<ul class="res-list">${files.map((r) => resourceCard(r, { deletable: true }))}</ul>` : ''}
            <form class="row" data-attach="${l.id}">
              <label class="sr-only" for="att-${l.id}">${t('sol.attach_file')}</label>
              <input class="input" style="flex:1;min-width:0" id="att-${l.id}" name="file" type="file" accept="${FILE_ACCEPT}">
              <button class="btn btn-sm btn-ghost" type="submit">📎 ${t('sol.attach')}</button>
            </form>
          </li>`;
        })}</ul>` : html`<p class="muted" style="margin:0">${t('sol.no_lessons_trainer')}</p>`}
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('sol.add_lesson')}</h2>
        <form class="form" id="lesson-form" novalidate>
          <div data-form-message></div>
          <div class="field"><label for="l-title">${t('trainer.res_title')}</label><input class="input" id="l-title" name="title" maxlength="160" required></div>
          <div class="field"><label for="l-content">${t('sol.lesson_content')}</label><textarea class="input" id="l-content" name="content" rows="6" maxlength="20000"></textarea></div>
          <div class="field"><label for="l-video">${t('sol.video_url')}</label><input class="input" id="l-video" name="video" type="url" placeholder="https://youtu.be/…"><span class="hint">${t('sol.video_hint')}</span></div>
          <div class="field"><label for="l-files">${t('sol.lesson_files')}</label><input class="input" id="l-files" name="files" type="file" multiple accept="${FILE_ACCEPT}"><span class="hint">${t('sol.file_hint', { mb: MAX_MB })}</span></div>
          <div class="upload-progress" id="up-progress" hidden><div class="spinner" role="status"></div> <span>${t('trainer.uploading')}</span></div>
          <button class="btn" type="submit">${t('sol.add_lesson')}</button>
        </form>
      </section>
    </div>`);

  const again = () => trainerSolfegeCoursePage({ id }, me);
  const form = document.getElementById('lesson-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.elements.title.value.trim();
    const video = form.elements.video.value.trim();
    if (title.length < 2) return setFormMessage(form, t('trainer.need_title'));
    if (video && !isHttps(video)) return setFormMessage(form, t('sol.bad_https'));
    const files = [...form.elements.files.files];
    const bad = files.find((f) => !fileKind(f) || f.size > MAX_MB * 1024 * 1024);
    if (bad) return setFormMessage(form, fileKind(bad) ? t('trainer.too_big', { mb: MAX_MB }) : t('sol.bad_file'));
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true);
    let lesson = null;
    try {
      lesson = await createSolfegeLesson({ course_id: course.id, title, content: form.elements.content.value.trim(), video_url: video || null, position: lessons.length });
      if (files.length) document.getElementById('up-progress').hidden = false;
      for (const f of files) {
        const up = await sendFile(me, f);
        await createSolfegeResource({ trainer_id: me.id, lesson_id: lesson.id, student_id: course.student_id, kind: up.kind, title: f.name.replace(/\.[^.]+$/, '').slice(0, 160) || f.name, storage_path: up.path, file_size: up.size });
      }
      toast(t('sol.lesson_added'), 'success');
      again();
    } catch (err) {
      console.error(err);
      setBusy(btn, false); document.getElementById('up-progress').hidden = true;
      setFormMessage(form, err.userMessage ?? errorText(err));
      if (lesson) {
        // La leçon existe déjà : on l'affiche, le formateur pourra joindre le fichier ensuite.
        toast(t('sol.lesson_saved_files_failed'), 'error', 9000);
        setTimeout(again, 1500);
      }
    }
  });

  const list = document.getElementById('lessons');
  if (!list) return;
  bindMedia(list);
  list.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-attach]');
    if (!f) return;
    e.preventDefault();
    const file = f.elements.file.files[0];
    if (!file) return toast(t('trainer.need_file'), 'error');
    const btn = f.querySelector('button');
    setBusy(btn, true);
    try {
      const up = await sendFile(me, file);
      await createSolfegeResource({ trainer_id: me.id, lesson_id: f.dataset.attach, student_id: course.student_id, kind: up.kind, title: file.name.replace(/\.[^.]+$/, '').slice(0, 160) || file.name, storage_path: up.path, file_size: up.size });
      toast(t('trainer.published'), 'success');
      again();
    } catch (err) { console.error(err); setBusy(btn, false); toast(err.userMessage ?? errorText(err), 'error'); }
  });
  list.addEventListener('click', async (e) => {
    const delLesson = e.target.closest('[data-del-lesson]');
    const delFile = e.target.closest('[data-del]');
    try {
      if (delLesson) {
        const l = lessons.find((x) => x.id === delLesson.dataset.delLesson);
        if (!l || !confirm(t('trainer.confirm_delete', { title: l.title }))) return;
        await deleteSolfegeLesson(l.id);
      } else if (delFile) {
        const r = attachments.find((x) => x.id === delFile.dataset.del);
        if (!r || !confirm(t('trainer.confirm_delete', { title: r.title }))) return;
        await deleteSolfegeResource(r);
      } else return;
      toast(t('trainer.deleted'));
      again();
    } catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
}

// ---------------- Lives ----------------
export function jitsiLink(title) {
  const slug = title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '').slice(0, 30);
  const random = crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), '');
  return `https://meet.jit.si/MusicProgressionLab-${slug}-${random}`;
}
function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function livesView(zone, me, students) {
  const lives = (await getSolfegeLives()).filter((l) => l.trainer_id === me.id && !l.coaching_id);
  const next = lives.filter((l) => liveState(l) !== 'past');
  const past = lives.filter((l) => liveState(l) === 'past').reverse();
  const item = (l) => html`<li class="res-item">
    <div class="res-head"><span class="sol-ico" aria-hidden="true">🎥</span>
      <div style="flex:1;min-width:0"><strong>${l.title}</strong>
        <div class="muted small">${fmtWhen(l.starts_at)} · ${t('sol.minutes', { n: l.duration_minutes })} · ${forWho(l, students)}</div></div>
      <button class="btn btn-ghost btn-sm" type="button" data-del-live="${l.id}" aria-label="${t('trainer.delete')} ${l.title}">🗑</button></div>
    <div class="res-actions">
      ${liveState(l) === 'past'
        ? html`<form class="row" style="width:100%" data-replay="${l.id}"><label class="sr-only" for="rp-${l.id}">${t('sol.replay_url')}</label>
            <input class="input" style="flex:1;min-width:0" id="rp-${l.id}" name="url" type="url" value="${l.replay_url ?? ''}" placeholder="${t('sol.replay_ph')}">
            <button class="btn btn-sm btn-ghost" type="submit">${t('sol.save')}</button></form>`
        : html`<a class="btn btn-sm" href="${safeUrl(l.meeting_url)}" target="_blank" rel="noopener noreferrer">${t('sol.open_live')} ↗</a>
            <button class="btn btn-sm btn-ghost" type="button" data-copy="${l.meeting_url}">${t('trainer.copy')}</button>`}
    </div></li>`;

  zone.innerHTML = String(html`
    <div class="dash-inner">
      <section class="card">
        <h2 style="font-size:1.15rem">${t('sol.new_live')}</h2>
        <form class="form" id="live-form" novalidate>
          <div data-form-message></div>
          <div class="field"><label for="v-title">${t('trainer.res_title')}</label><input class="input" id="v-title" name="title" maxlength="160" required placeholder="${t('sol.live_ph')}"></div>
          <div class="grid grid-2" style="gap:12px">
            <div class="field"><label for="v-date">${t('sol.date')}</label><input class="input" id="v-date" name="date" type="date" min="${todayInput()}" required></div>
            <div class="field"><label for="v-time">${t('sol.time')}</label><input class="input" id="v-time" name="time" type="time" required></div>
          </div>
          <div class="field"><label for="v-dur">${t('sol.duration')}</label><select class="input" id="v-dur" name="duration">
            ${[30, 45, 60, 90, 120].map((m) => html`<option value="${m}" ${m === 60 ? html`selected` : ''}>${t('sol.minutes', { n: m })}</option>`)}</select></div>
          <fieldset class="field"><legend>${t('sol.visio')}</legend>
            <label class="sol-radio"><input type="radio" name="visio" value="jitsi" checked> ${t('sol.visio_jitsi')}</label>
            <label class="sol-radio"><input type="radio" name="visio" value="own"> ${t('sol.visio_own')}</label>
            <input class="input" name="url" type="url" placeholder="https://zoom.us/j/… ou https://meet.google.com/…" aria-label="${t('sol.visio_own')}" hidden>
          </fieldset>
          <div class="field"><label for="v-desc">${t('sol.description')}</label><textarea class="input" id="v-desc" name="description" rows="2" maxlength="2000"></textarea></div>
          <div class="field"><label for="v-to">${t('trainer.res_to')}</label><select class="input" id="v-to" name="to">${studentOptions(students)}</select></div>
          <button class="btn" type="submit">${t('sol.create_live')}</button>
        </form>
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('sol.lives_next')} <span class="badge-pill">${next.length}</span></h2>
        ${next.length ? html`<ul class="res-list" id="live-list">${next.map(item)}</ul>` : html`<p class="muted" style="margin:0">${t('sol.no_lives_trainer')}</p>`}
      </section>
      ${past.length ? html`<section class="card"><h2 style="font-size:1.15rem">${t('sol.lives_past')}</h2>
        <p class="muted small" style="margin:0 0 10px">${t('sol.replay_hint')}</p><ul class="res-list" id="live-past">${past.map(item)}</ul></section>` : ''}
    </div>`);

  const form = document.getElementById('live-form');
  form.querySelectorAll('[name=visio]').forEach((r) => r.addEventListener('change', () => { form.elements.url.hidden = form.elements.visio.value !== 'own'; }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.elements.title.value.trim();
    if (title.length < 2) return setFormMessage(form, t('trainer.need_title'));
    const start = new Date(`${form.elements.date.value}T${form.elements.time.value}`);
    if (!form.elements.date.value || !form.elements.time.value || Number.isNaN(start.getTime())) return setFormMessage(form, t('sol.need_when'));
    const own = form.elements.visio.value === 'own';
    const url = form.elements.url.value.trim();
    if (own && !isHttps(url)) return setFormMessage(form, t('sol.bad_https'));
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true);
    try {
      await createSolfegeLive({
        trainer_id: me.id, title, description: form.elements.description.value.trim(), starts_at: start.toISOString(),
        duration_minutes: Number(form.elements.duration.value), meeting_url: own ? url : jitsiLink(title), ...target(form.elements.to.value)
      });
      toast(t('sol.live_created'), 'success');
      reload('lives');
    } catch (err) { console.error(err); setBusy(btn, false); setFormMessage(form, errorText(err)); }
  });

  zone.addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      try { await navigator.clipboard.writeText(copy.dataset.copy); toast(t('trainer.copied'), 'success'); } catch { toast(copy.dataset.copy); }
      return;
    }
    const del = e.target.closest('[data-del-live]');
    if (!del) return;
    const l = lives.find((x) => x.id === del.dataset.delLive);
    if (!l || !confirm(t('trainer.confirm_delete', { title: l.title }))) return;
    try { await deleteSolfegeLive(l.id); toast(t('trainer.deleted')); reload('lives'); }
    catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
  zone.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-replay]');
    if (!f) return;
    e.preventDefault();
    const url = f.elements.url.value.trim();
    if (url && !isHttps(url)) return toast(t('sol.bad_https'), 'error');
    try { await updateSolfegeLive(f.dataset.replay, { replay_url: url || null }); toast(t('sol.saved'), 'success'); }
    catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
}

// ---------------- Ressources ----------------
async function resourcesView(zone, me, students) {
  const resources = (await getSolfegeResources()).filter((r) => r.trainer_id === me.id);
  zone.innerHTML = String(html`
    <div class="dash-inner">
      <section class="card">
        <h2 style="font-size:1.15rem">${t('trainer.add_resource')}</h2>
        <form class="form" id="res-form" novalidate>
          <div data-form-message></div>
          <div class="field"><label for="s-kind">${t('trainer.res_kind')}</label>
            <select class="input" id="s-kind" name="kind">
              <option value="file">${t('sol.kind_file')}</option>
              <option value="video">${t('sol.kind_video_link')}</option>
              <option value="link">${t('trainer.kind_link')}</option>
              <option value="text">${t('trainer.kind_text')}</option>
            </select></div>
          <div class="field"><label for="s-title">${t('trainer.res_title')}</label><input class="input" id="s-title" name="title" maxlength="160" required></div>
          <div class="field"><label for="s-desc">${t('trainer.res_desc')}</label><input class="input" id="s-desc" name="description" maxlength="500"></div>
          <div class="field" data-for="file"><label for="s-file">${t('trainer.res_file')}</label>
            <input class="input" id="s-file" name="file" type="file" accept="${FILE_ACCEPT}">
            <span class="hint">${t('sol.file_hint', { mb: MAX_MB })}</span></div>
          <div class="field" data-for="video" hidden><label for="s-video">${t('sol.video_url')}</label><input class="input" id="s-video" name="video" type="url" placeholder="https://youtu.be/…"><span class="hint">${t('sol.video_hint')}</span></div>
          <div class="field" data-for="link" hidden><label for="s-url">${t('trainer.res_url')}</label><input class="input" id="s-url" name="url" type="url" placeholder="https://…"></div>
          <div class="field" data-for="text" hidden><label for="s-body">${t('trainer.res_body')}</label><textarea class="input" id="s-body" name="body" rows="6" maxlength="20000"></textarea></div>
          <div class="field"><label for="s-to">${t('trainer.res_to')}</label><select class="input" id="s-to" name="to">${studentOptions(students)}</select></div>
          <div class="upload-progress" id="up-progress" hidden><div class="spinner" role="status"></div> <span>${t('trainer.uploading')}</span></div>
          <button class="btn" type="submit">${t('trainer.publish')}</button>
        </form>
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('trainer.my_resources')} <span class="badge-pill">${resources.length}</span></h2>
        ${resources.length ? html`<ul class="res-list" id="sol-my-res">${resources.map((r) => resourceCard(r, { deletable: true, meta: `${forWho(r, students)} · ${fmtDay(r.created_at)}` }))}</ul>`
          : html`<p class="muted" style="margin:0">${t('trainer.no_resources')}</p>`}
      </section>
    </div>`);

  const form = document.getElementById('res-form');
  const syncKind = () => form.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== form.elements.kind.value; });
  form.elements.kind.addEventListener('change', syncKind);
  // Titre proposé d'après le nom du fichier (remplacé si l'on change de fichier, jamais s'il a été écrit à la main)
  form.elements.file.addEventListener('change', () => {
    const f = form.elements.file.files[0];
    const title = form.elements.title;
    if (f && (!title.value || title.value === title.dataset.auto)) title.value = title.dataset.auto = f.name.replace(/\.[^.]+$/, '').slice(0, 160);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kind = form.elements.kind.value;
    const title = form.elements.title.value.trim();
    if (!title) return setFormMessage(form, t('trainer.need_title'));
    const row = { trainer_id: me.id, title, description: form.elements.description.value.trim(), ...target(form.elements.to.value) };
    const btn = form.querySelector('button[type=submit]');
    try {
      if (kind === 'file') {
        const f = form.elements.file.files[0];
        if (!f) return setFormMessage(form, t('trainer.need_file'));
        if (!fileKind(f)) return setFormMessage(form, t('sol.bad_file'));
        if (f.size > MAX_MB * 1024 * 1024) return setFormMessage(form, t('trainer.too_big', { mb: MAX_MB }));
        setBusy(btn, true); document.getElementById('up-progress').hidden = false;
        const up = await sendFile(me, f);
        Object.assign(row, { kind: up.kind, storage_path: up.path, file_size: up.size });
      } else if (kind === 'video' || kind === 'link') {
        const url = (kind === 'video' ? form.elements.video : form.elements.url).value.trim();
        if (!isHttps(url)) return setFormMessage(form, t('sol.bad_https'));
        setBusy(btn, true);
        Object.assign(row, { kind, url });
      } else {
        const body = form.elements.body.value.trim();
        if (!body) return setFormMessage(form, t('trainer.need_body'));
        setBusy(btn, true);
        Object.assign(row, { kind: 'text', body });
      }
      await createSolfegeResource(row);
      toast(t('trainer.published'), 'success');
      reload('ressources');
    } catch (err) {
      console.error(err);
      setBusy(btn, false); document.getElementById('up-progress').hidden = true;
      setFormMessage(form, err.userMessage ?? errorText(err));
    }
  });

  const list = document.getElementById('sol-my-res');
  if (!list) return;
  bindMedia(list);
  list.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const r = resources.find((x) => x.id === del.dataset.del);
    if (!r || !confirm(t('trainer.confirm_delete', { title: r.title }))) return;
    try { await deleteSolfegeResource(r); toast(t('trainer.deleted')); reload('ressources'); }
    catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
}
