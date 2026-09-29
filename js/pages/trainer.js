// =====================================================================
// ESPACE FORMATEUR : élèves, ressources (PDF, audio, liens, textes),
// devoirs, fiche élève (statistiques, notes, messages), rôles (admin)
// =====================================================================
import { html, mount, toast, setBusy, setFormMessage } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import { renderStats } from './stats.js';
import { resourceItem, bindResourceActions } from './course.js';
import { levelLabel } from './personal.js';
import {
  getProfile, getTrainerCode, getStudentList, getMyResources, uploadResourceFile, createResource, deleteResource,
  getMyAssignments, createAssignment, deleteAssignment, getExercisesList, getTrainerNotes, addTrainerNote,
  sendRecommendation, getSentRecommendations, getLastDiagnostic, adminSetRole
} from '../data.js';

const SITE = () => window.location.origin + window.location.pathname;
const COUNT_KEY = { pitch_compare: 'questions', melody_contour: 'questions', rhythm_echo: 'patterns', pulse_tap: 'beats', sing_pair: 'pairs', melody_sing: 'count' };
const ASSIGNABLE = ['pitch_compare', 'melody_contour', 'rhythm_echo', 'pulse_tap', 'sing_note', 'sing_glide', 'sing_sequence', 'sing_pair', 'melody_sing', 'listening_quiz'];
const MAX_MB = 50;

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }
function minutes(s) { return Math.round((s ?? 0) / 60); }

async function requireStaff() {
  const me = await getProfile(getUser().id).catch(() => null);
  if (!me || !['trainer', 'admin'].includes(me.role)) {
    mount(html`<div class="container dash center" style="max-width:640px"><h1>${t('trainer.reserved_title')}</h1><p class="muted">${t('trainer.reserved_text')}</p><div><a class="btn" href="#/tableau-de-bord">${t('session.back_dashboard')}</a></div></div>`);
    return null;
  }
  return me;
}

// ---------------------------------------------------------------------
export async function trainerPage({ tab } = {}) {
  const me = await requireStaff();
  if (!me) return;
  const current = ['eleves', 'ressources', 'devoirs', 'roles'].includes(tab) ? tab : 'eleves';
  const tabs = [['eleves', t('trainer.tab_students')], ['ressources', t('trainer.tab_resources')], ['devoirs', t('trainer.tab_homework')]];
  if (me.role === 'admin') tabs.push(['roles', t('trainer.tab_roles')]);

  mount(html`
    <div class="container dash">
      <div><p class="eyebrow">${t('trainer.eyebrow')}</p><h1>${t('trainer.title')}</h1></div>
      <nav class="tabs" aria-label="${t('trainer.title')}">
        ${tabs.map(([id, label]) => html`<a class="tab" href="#/formateur/${id}" ${id === current ? html`aria-current="page"` : ''}>${label}</a>`)}
      </nav>
      <div id="tr-zone"><div class="spinner" role="status"></div></div>
    </div>`);
  const zone = document.getElementById('tr-zone');
  try {
    if (current === 'eleves') await studentsTab(zone, me);
    if (current === 'ressources') await resourcesTab(zone, me);
    if (current === 'devoirs') await homeworkTab(zone, me);
    if (current === 'roles') rolesTab(zone);
  } catch (err) {
    console.error(err);
    zone.innerHTML = String(html`<div class="alert alert-error" role="alert">${t('trainer.load_error')}</div>`);
  }
}

// ---------------- Élèves ----------------
async function studentsTab(zone, me) {
  const [code, students] = await Promise.all([getTrainerCode(), getStudentList()]);
  const link = `${SITE()}#/cours?code=${code}`;
  const share = t('trainer.share_text', { code, link });
  zone.innerHTML = String(html`
    <div class="dash-inner">
      <section class="card card-highlight">
        <h2 style="font-size:1.15rem">${t('trainer.invite_title')}</h2>
        <p style="margin:0 0 12px;color:#e0e7ff">${t('trainer.invite_lead')}</p>
        <div class="code-box"><span class="code">${code}</span>
          <button class="btn btn-sm" type="button" id="copy-code" style="background:#fff;color:#1e1b4b">${t('trainer.copy')}</button>
          <a class="btn btn-sm btn-ghost" href="https://wa.me/?text=${encodeURIComponent(share)}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>
        </div>
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('trainer.students_title')} <span class="badge-pill">${students.length}</span></h2>
        ${me.role === 'admin' ? html`<p class="muted small" style="margin:0 0 8px">${t('trainer.admin_sees_all')}</p>` : ''}
        ${students.length ? html`
          <div class="table-wrap"><table class="data-table students">
            <thead><tr><th>${t('trainer.col_name')}</th><th>${t('trainer.col_level')}</th><th>${t('trainer.col_progress')}</th><th>${t('trainer.col_last')}</th><th>${t('trainer.col_time')}</th><th>${t('trainer.col_success')}</th></tr></thead>
            <tbody>${students.map((s) => html`<tr>
              <td><a href="#/formateur/eleve/${s.id}"><strong>${s.full_name ?? '—'}</strong></a><br><span class="muted small">${s.email}</span></td>
              <td>${t('trainer.level_n', { n: s.level })}</td>
              <td>${s.program_status === 'completed' ? t('trainer.program_done') : s.current_day ? t('trainer.day_n', { n: s.current_day }) : t('trainer.not_started')}</td>
              <td>${fmtDate(s.last_practice_date)}${s.current_streak > 1 ? html` <span class="muted small">🔥${s.current_streak}</span>` : ''}</td>
              <td>${t('dashboard.minutes', { n: minutes(s.total_practice_seconds) })}</td>
              <td>${s.success_7d === null ? '—' : `${Math.round(s.success_7d)} %`} <span class="muted small">(${s.attempts_7d})</span></td>
            </tr>`)}</tbody></table></div>` : html`<p class="muted" style="margin:0">${t('trainer.no_students')}</p>`}
      </section>
    </div>`);
  document.getElementById('copy-code').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(share); toast(t('trainer.copied'), 'success'); }
    catch { toast(code); }
  });
}

// ---------------- Ressources ----------------
function studentOptions(students) {
  return html`<option value="">${t('trainer.all_students')}</option>${students.map((s) => html`<option value="${s.id}">${s.full_name ?? s.email}</option>`)}`;
}

async function resourcesTab(zone, me) {
  const [resources, students] = await Promise.all([getMyResources(me.id), getStudentList()]);
  zone.innerHTML = String(html`
    <div class="dash-inner">
      <section class="card">
        <h2 style="font-size:1.15rem">${t('trainer.add_resource')}</h2>
        <form class="form" id="res-form" novalidate>
          <div data-form-message></div>
          <div class="field"><label for="r-kind">${t('trainer.res_kind')}</label>
            <select class="input" id="r-kind" name="kind">
              <option value="file">${t('trainer.kind_file')}</option>
              <option value="link">${t('trainer.kind_link')}</option>
              <option value="text">${t('trainer.kind_text')}</option>
            </select></div>
          <div class="field"><label for="r-title">${t('trainer.res_title')}</label><input class="input" id="r-title" name="title" maxlength="140" required></div>
          <div class="field"><label for="r-desc">${t('trainer.res_desc')}</label><input class="input" id="r-desc" name="description" maxlength="300"></div>
          <div class="field" data-for="file"><label for="r-file">${t('trainer.res_file')}</label>
            <input class="input" id="r-file" name="file" type="file" accept="application/pdf,.pdf,audio/*,.mp3,.m4a,.wav,.ogg">
            <span class="hint">${t('trainer.res_file_hint', { mb: MAX_MB })}</span></div>
          <div class="field" data-for="link" hidden><label for="r-url">${t('trainer.res_url')}</label><input class="input" id="r-url" name="url" type="url" placeholder="https://…"></div>
          <div class="field" data-for="text" hidden><label for="r-body">${t('trainer.res_body')}</label><textarea class="input" id="r-body" name="body" rows="6" maxlength="10000"></textarea></div>
          <div class="field"><label for="r-to">${t('trainer.res_to')}</label><select class="input" id="r-to" name="to">${studentOptions(students)}</select></div>
          <div class="upload-progress" id="up-progress" hidden><div class="spinner" role="status"></div> <span>${t('trainer.uploading')}</span></div>
          <button class="btn" type="submit">${t('trainer.publish')}</button>
        </form>
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('trainer.my_resources')} <span class="badge-pill">${resources.length}</span></h2>
        ${resources.length ? html`<ul class="res-list" id="my-res">${resources.map((r) => html`${resourceItem(r, { deletable: true })}
          <li class="res-meta muted small">${r.student_id ? t('trainer.for_one', { name: students.find((s) => s.id === r.student_id)?.full_name ?? '—' }) : t('trainer.for_all')} · ${fmtDate(r.created_at)}</li>`)}</ul>`
          : html`<p class="muted" style="margin:0">${t('trainer.no_resources')}</p>`}
      </section>
    </div>`);

  const form = document.getElementById('res-form');
  const syncKind = () => form.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== form.elements.kind.value; });
  form.elements.kind.addEventListener('change', syncKind);
  form.elements.file.addEventListener('change', () => {
    const f = form.elements.file.files[0];
    if (f && !form.elements.title.value) form.elements.title.value = f.name.replace(/\.[^.]+$/, '');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kind = form.elements.kind.value;
    const title = form.elements.title.value.trim();
    if (!title) return setFormMessage(form, t('trainer.need_title'));
    const row = { trainer_id: me.id, title, description: form.elements.description.value.trim() || null, student_id: form.elements.to.value || null };
    const btn = form.querySelector('button[type=submit]');
    try {
      if (kind === 'file') {
        const f = form.elements.file.files[0];
        if (!f) return setFormMessage(form, t('trainer.need_file'));
        const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
        const isAudio = f.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac)$/i.test(f.name);
        if (!isPdf && !isAudio) return setFormMessage(form, t('trainer.bad_type'));
        if (f.size > MAX_MB * 1024 * 1024) return setFormMessage(form, t('trainer.too_big', { mb: MAX_MB }));
        setBusy(btn, true); document.getElementById('up-progress').hidden = false;
        const path = await uploadResourceFile(me.id, f);
        Object.assign(row, { kind: isPdf ? 'pdf' : 'audio', storage_path: path, file_size: f.size });
      } else if (kind === 'link') {
        const url = form.elements.url.value.trim();
        if (!/^https?:\/\//i.test(url)) return setFormMessage(form, t('trainer.bad_url'));
        setBusy(btn, true);
        Object.assign(row, { kind: 'link', url });
      } else {
        const body = form.elements.body.value.trim();
        if (!body) return setFormMessage(form, t('trainer.need_body'));
        setBusy(btn, true);
        Object.assign(row, { kind: 'text', body });
      }
      await createResource(row);
      toast(t('trainer.published'), 'success');
      trainerPage({ tab: 'ressources' });
    } catch (err) {
      console.error(err);
      setBusy(btn, false); document.getElementById('up-progress').hidden = true;
      setFormMessage(form, /mime|type/i.test(err?.message ?? '') ? t('trainer.bad_type') : /size|large/i.test(err?.message ?? '') ? t('trainer.too_big', { mb: MAX_MB }) : t('trainer.publish_error'));
    }
  });

  const list = document.getElementById('my-res');
  if (list) {
    bindResourceActions(list);
    list.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del-res]');
      if (!del) return;
      const r = resources.find((x) => x.id === del.dataset.delRes);
      if (!r || !confirm(t('trainer.confirm_delete', { title: r.title }))) return;
      try { await deleteResource(r); toast(t('trainer.deleted')); trainerPage({ tab: 'ressources' }); }
      catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
    });
  }
}

// ---------------- Devoirs ----------------
async function homeworkTab(zone, me) {
  const [assignments, students, exercises, resources] = await Promise.all([
    getMyAssignments(me.id), getStudentList(), getExercisesList(), getMyResources(me.id)
  ]);
  const assignable = exercises.filter((e) => ASSIGNABLE.includes(e.type));
  zone.innerHTML = String(html`
    <div class="dash-inner">
      <section class="card">
        <h2 style="font-size:1.15rem">${t('trainer.add_homework')}</h2>
        <form class="form" id="hw-form" novalidate>
          <div data-form-message></div>
          <div class="field"><label for="h-kind">${t('trainer.hw_kind')}</label>
            <select class="input" id="h-kind" name="kind">
              <option value="app_exercise">${t('trainer.hw_app')}</option>
              <option value="libre">${t('trainer.hw_free')}</option>
            </select></div>
          <div class="field"><label for="h-title">${t('trainer.hw_title')}</label><input class="input" id="h-title" name="title" maxlength="140" required></div>
          <div class="field" data-for="app_exercise"><label for="h-ex">${t('trainer.hw_exercise')}</label>
            <select class="input" id="h-ex" name="exercise">${assignable.map((e) => html`<option value="${e.id}" data-type="${e.type}">${e.title}</option>`)}</select></div>
          <div class="field" data-for="app_exercise" id="h-count-field"><label for="h-count">${t('trainer.hw_count')}</label>
            <input class="input" id="h-count" name="count" type="number" min="1" max="40" value="10" style="max-width:140px"></div>
          <div class="field"><label for="h-instr">${t('trainer.hw_instructions')}</label><textarea class="input" id="h-instr" name="instructions" rows="4" maxlength="4000" placeholder="${t('trainer.hw_instr_ph')}"></textarea></div>
          <div class="field"><label for="h-res">${t('trainer.hw_resource')}</label>
            <select class="input" id="h-res" name="resource"><option value="">${t('trainer.none')}</option>${resources.map((r) => html`<option value="${r.id}">${r.title}</option>`)}</select></div>
          <div class="grid grid-2" style="gap:12px">
            <div class="field"><label for="h-to">${t('trainer.res_to')}</label><select class="input" id="h-to" name="to">${studentOptions(students)}</select></div>
            <div class="field"><label for="h-due">${t('trainer.hw_due')}</label><input class="input" id="h-due" name="due" type="date"></div>
          </div>
          <button class="btn" type="submit">${t('trainer.hw_publish')}</button>
        </form>
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('trainer.my_homework')} <span class="badge-pill">${assignments.length}</span></h2>
        ${assignments.length ? html`<ul class="plain-list hw-list">${assignments.map((a) => {
          const target = a.student_id ? students.filter((s) => s.id === a.student_id) : students;
          const doneList = (a.progress ?? []);
          return html`<li class="hw-item">
            <div class="row between" style="justify-content:space-between">
              <div><strong>${a.title}</strong><br><span class="muted small">${a.kind === 'app_exercise' ? (a.exercise?.title ?? t('trainer.hw_app')) : t('trainer.hw_free')}
                · ${a.student_id ? t('trainer.for_one', { name: target[0]?.full_name ?? '—' }) : t('trainer.for_all')}${a.due_date ? ' · ' + t('course.due', { d: fmtDate(a.due_date) }) : ''}</span></div>
              <div class="row"><span class="badge-pill">${t('trainer.done_count', { n: doneList.length, total: target.length })}</span>
                <button class="btn btn-ghost btn-sm" type="button" data-del-hw="${a.id}" aria-label="${t('trainer.delete')} ${a.title}">🗑</button></div>
            </div>
            ${doneList.length ? html`<details class="small"><summary>${t('trainer.see_answers')}</summary><ul class="plain-list">${doneList.map((p) => html`<li>✅ <strong>${students.find((s) => s.id === p.student_id)?.full_name ?? '—'}</strong> — ${fmtDate(p.done_at)}${p.score !== null ? ` · ${Math.round(p.score)} %` : ''}${p.comment ? html`<br><span class="muted">« ${p.comment} »</span>` : ''}</li>`)}</ul></details>` : ''}
          </li>`;
        })}</ul>` : html`<p class="muted" style="margin:0">${t('trainer.no_homework')}</p>`}
      </section>
    </div>`);

  const form = document.getElementById('hw-form');
  const sync = () => {
    const kind = form.elements.kind.value;
    form.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== kind; });
    const type = form.elements.exercise.selectedOptions[0]?.dataset.type;
    document.getElementById('h-count-field').hidden = kind !== 'app_exercise' || !COUNT_KEY[type];
    if (kind === 'app_exercise' && !form.elements.title.value) form.elements.title.value = form.elements.exercise.selectedOptions[0]?.textContent ?? '';
  };
  form.elements.kind.addEventListener('change', sync);
  form.elements.exercise.addEventListener('change', () => { form.elements.title.value = ''; sync(); });
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kind = form.elements.kind.value;
    const title = form.elements.title.value.trim();
    if (!title) return setFormMessage(form, t('trainer.need_title'));
    if (kind === 'libre' && !form.elements.instructions.value.trim() && !form.elements.resource.value) return setFormMessage(form, t('trainer.need_instructions'));
    const row = {
      trainer_id: me.id, kind, title,
      instructions: form.elements.instructions.value.trim() || null,
      resource_id: form.elements.resource.value || null,
      student_id: form.elements.to.value || null,
      due_date: form.elements.due.value || null,
      exercise_id: null, params: {}
    };
    if (kind === 'app_exercise') {
      row.exercise_id = form.elements.exercise.value;
      const type = form.elements.exercise.selectedOptions[0]?.dataset.type;
      const n = Math.max(1, Math.min(40, Number(form.elements.count.value) || 10));
      if (COUNT_KEY[type]) row.params = { [COUNT_KEY[type]]: n };
    }
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true);
    try { await createAssignment(row); toast(t('trainer.hw_published'), 'success'); trainerPage({ tab: 'devoirs' }); }
    catch (err) { console.error(err); setBusy(btn, false); setFormMessage(form, t('trainer.publish_error')); }
  });

  zone.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-hw]');
    if (!del) return;
    const a = assignments.find((x) => x.id === del.dataset.delHw);
    if (!a || !confirm(t('trainer.confirm_delete', { title: a.title }))) return;
    try { await deleteAssignment(a.id); toast(t('trainer.deleted')); trainerPage({ tab: 'devoirs' }); }
    catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
}

// ---------------- Rôles (admin) ----------------
function rolesTab(zone) {
  zone.innerHTML = String(html`
    <section class="card" style="max-width:640px">
      <h2 style="font-size:1.15rem">${t('trainer.roles_title')}</h2>
      <p class="muted">${t('trainer.roles_lead')}</p>
      <form class="form" id="role-form" novalidate>
        <div data-form-message></div>
        <div class="field"><label for="ro-email">${t('auth.email')}</label><input class="input" id="ro-email" name="email" type="email" required></div>
        <div class="field"><label for="ro-role">${t('trainer.role')}</label>
          <select class="input" id="ro-role" name="role">
            <option value="trainer">${t('trainer.role_trainer')}</option>
            <option value="student">${t('trainer.role_student')}</option>
            <option value="admin">${t('trainer.role_admin')}</option>
          </select></div>
        <button class="btn" type="submit">${t('trainer.role_save')}</button>
      </form>
    </section>`);
  const form = document.getElementById('role-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    setBusy(btn, true);
    try {
      await adminSetRole(form.elements.email.value, form.elements.role.value);
      setFormMessage(form, t('trainer.role_done'), 'success');
      form.elements.email.value = '';
    } catch (err) {
      setFormMessage(form, err?.message?.includes('Aucun compte') ? t('trainer.role_no_account') : t('errors.generic'));
    }
    setBusy(btn, false);
  });
}

// ---------------------------------------------------------------------
// Fiche d'un élève
// ---------------------------------------------------------------------
export async function trainerStudentPage({ id }) {
  const me = await requireStaff();
  if (!me) return;
  let student, list, notes, sent, diag, assignments;
  try {
    [student, list, notes, sent, diag, assignments] = await Promise.all([
      getProfile(id), getStudentList(), getTrainerNotes(id), getSentRecommendations(id), getLastDiagnostic(id), getMyAssignments(me.id)
    ]);
  } catch (err) { console.error(err); student = null; }
  const info = list?.find((s) => s.id === id);
  if (!student || !info) {
    mount(html`<div class="container dash"><h1>${t('trainer.student_not_found')}</h1><a class="btn" href="#/formateur">${t('trainer.back')}</a></div>`);
    return;
  }
  const hw = assignments.filter((a) => !a.student_id || a.student_id === id);
  const doneOf = (a) => (a.progress ?? []).find((p) => p.student_id === id);

  mount(html`
    <div class="container dash">
      <div>
        <a href="#/formateur" class="small">← ${t('trainer.back')}</a>
        <h1 style="margin-top:12px">${student.full_name ?? '—'}</h1>
        <p class="muted" style="margin:0">${info.email} · ${t('trainer.level_n', { n: student.level })} · ${student.xp} XP · ${t('trainer.since', { d: fmtDate(info.joined_at) })}</p>
      </div>
      ${diag ? html`<section class="card"><h2 style="font-size:1.15rem">${t('trainer.diag_title', { d: fmtDate(diag.taken_at) })}</h2>
        <ul class="result-list">${Object.entries(diag.results ?? {}).filter(([k]) => !k.endsWith('_auto')).map(([k, v]) => html`<li><span>${t('stats.skill_names')[k] ?? k}</span><strong>${levelLabel(v)} <span class="muted small">(${v} %${diag.results[k + '_auto'] ? ' · ' + t('diag.auto') : ''})</span></strong></li>`)}</ul></section>` : ''}
      <div id="st-zone" class="dash-inner"><div class="spinner" role="status"></div></div>
      <div class="grid grid-2">
        <section class="card">
          <h2 style="font-size:1.15rem">${t('trainer.send_msg')}</h2>
          <form class="form" id="msg-form"><label class="sr-only" for="msg-text">${t('trainer.send_msg')}</label>
            <textarea class="input" id="msg-text" name="msg" rows="3" maxlength="2000" placeholder="${t('trainer.msg_ph')}"></textarea>
            <button class="btn btn-sm" type="submit">${t('trainer.send')}</button></form>
          ${sent.length ? html`<ul class="plain-list small" style="margin-top:12px">${sent.map((m) => html`<li>${m.read_at ? '👁' : '✉️'} ${m.message} <span class="muted">— ${fmtDate(m.created_at)}</span></li>`)}</ul>` : ''}
        </section>
        <section class="card">
          <h2 style="font-size:1.15rem">${t('trainer.notes')}</h2>
          <p class="muted small" style="margin:0 0 8px">${t('trainer.notes_private')}</p>
          <form class="form" id="note-form"><label class="sr-only" for="note-text">${t('trainer.notes')}</label>
            <textarea class="input" id="note-text" name="note" rows="3" maxlength="4000" placeholder="${t('trainer.note_ph')}"></textarea>
            <button class="btn btn-sm" type="submit">${t('trainer.add_note')}</button></form>
          ${notes.length ? html`<ul class="plain-list small" style="margin-top:12px">${notes.map((n) => html`<li>📝 ${n.content} <span class="muted">— ${fmtDate(n.created_at)}</span></li>`)}</ul>` : ''}
        </section>
      </div>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('trainer.student_homework')}</h2>
        ${hw.length ? html`<ul class="plain-list">${hw.map((a) => { const p = doneOf(a); return html`<li>${p ? '✅' : '⏳'} <strong>${a.title}</strong> <span class="muted small">${p ? `— ${fmtDate(p.done_at)}${p.score !== null ? ` · ${Math.round(p.score)} %` : ''}` : `— ${t('trainer.todo')}`}</span>${p?.comment ? html`<br><span class="muted small">« ${p.comment} »</span>` : ''}</li>`; })}</ul>`
          : html`<p class="muted" style="margin:0">${t('trainer.no_homework')}</p>`}
        <a class="btn btn-sm btn-ghost" href="#/formateur/devoirs">${t('trainer.add_homework')}</a>
      </section>
    </div>`);

  renderStats(document.getElementById('st-zone'), id, { trainerView: true });

  document.getElementById('msg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = e.currentTarget.elements.msg.value.trim();
    if (!text) return;
    try { await sendRecommendation(me.id, id, text); toast(t('trainer.msg_sent'), 'success'); trainerStudentPage({ id }); }
    catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
  document.getElementById('note-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = e.currentTarget.elements.note.value.trim();
    if (!text) return;
    try { await addTrainerNote(me.id, id, text); toast(t('trainer.note_saved'), 'success'); trainerStudentPage({ id }); }
    catch (err) { console.error(err); toast(t('trainer.note_error'), 'error'); }
  });
}
