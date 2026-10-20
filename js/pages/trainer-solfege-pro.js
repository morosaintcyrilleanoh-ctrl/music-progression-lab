// =====================================================================
// Espace formateur → Solfège : agenda et sessions payantes, coaching, devoirs
// =====================================================================
import { html, mount, toast, setBusy, setFormMessage } from '../ui.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import {
  getStudentList, getSolfegeCohorts, createSolfegeCohort, deleteSolfegeCohort, getCohortSeats, getCohortMembers,
  addCohortMember, setMemberPaidUntil, removeCohortMember, getSolfegeEvents, createSolfegeEvent, deleteSolfegeEvent,
  getTrainerWhatsapp, saveTrainerWhatsapp, getCoachings, getCoaching, updateCoaching, deleteCoaching,
  getCoachingGoals, addCoachingGoal, deleteCoachingGoal, getSolfegeLives, createSolfegeLive, deleteSolfegeLive,
  getSolfegeHomework, getSolfegeHomeworkOne, createSolfegeHomework, deleteSolfegeHomework, getHomeworkResources,
  createSolfegeResource, uploadSolfegeFile, getSubmissions, gradeSubmission, getSolfegeFileUrls
} from '../data.js';
import {
  resourceCard, bindMedia, liveState, fmtWhen, fileKind, FILE_ACCEPT, MAX_MB, todayIso, addMonths, firstOfMonth,
  lastOfMonth, fmtDate, fmtShort, monthName, daysLeft
} from './solfege-media.js';
import { studentOptions, jitsiLink } from './trainer-solfege.js';

const reload = (v) => navigate(`/formateur/solfege?vue=${v}`);
const nameOf = (id, students) => students.find((s) => s.id === id)?.full_name ?? students.find((s) => s.id === id)?.email ?? '—';
const statusTag = (paidUntil) => {
  const d = daysLeft(paidUntil);
  if (d < 0) return html`<span class="sol-tag sol-tag-off">${t('pro.expired')}</span>`;
  if (d <= 7) return html`<span class="sol-tag sol-tag-warn">${t('pro.days_left', { n: d })}</span>`;
  return html`<span class="sol-tag sol-tag-ok">${t('pro.active')}</span>`;
};
// Prolonger : à partir de la date payée si elle n'est pas passée, sinon d'aujourd'hui (ou du début de session)
const extend = (paidUntil, months, startsOn = todayIso()) => {
  const today = todayIso();
  const base = paidUntil && paidUntil >= today ? paidUntil : (startsOn > today ? startsOn : today);
  return addMonths(base, months);
};

// ---------------------------------------------------------------------
// Agenda + sessions payantes
// ---------------------------------------------------------------------
export async function agendaView(zone, me, students, cohorts) {
  const [events, whatsapp] = await Promise.all([getSolfegeEvents(), getTrainerWhatsapp().catch(() => ({}))]);
  const seats = await getCohortSeats(cohorts.map((c) => c.id)).catch(() => ({}));
  const today = todayIso();
  const mine = events.filter((e) => e.trainer_id === me.id && e.starts_at.slice(0, 10) >= today);
  const sessions = [...cohorts].sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  zone.innerHTML = String(html`
    <div class="dash-inner">
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.program_title')}</h2>
        <form class="form" id="agenda-form" novalidate>
          <div data-form-message></div>
          <fieldset class="field"><legend>${t('trainer.res_kind')}</legend><div class="sol-chips">
            ${['formation', 'coaching', 'evenement'].map((k, i) => html`<label class="sol-chip-radio"><input type="radio" name="kind" value="${k}" ${i === 0 ? html`checked` : ''}><span>${t('pro.kind_' + k)}</span></label>`)}</div></fieldset>
          <div class="field"><label for="a-title">${t('trainer.res_title')}</label><input class="input" id="a-title" name="title" maxlength="160" required placeholder="${t('pro.title_ph')}"></div>
          <div class="grid grid-2" style="gap:12px">
            <div class="field"><label for="a-date">${t('pro.start_date')}</label><input class="input" id="a-date" name="date" type="date" min="${today}" required></div>
            <div class="field" data-for="formation"><label for="a-months">${t('sol.duration')}</label><select class="input" id="a-months" name="months">
              ${[1, 2, 3, 6].map((n) => html`<option value="${n}" ${n === 3 ? html`selected` : ''}>${t('pro.n_months', { n })}</option>`)}</select></div>
            <div class="field" data-for="coaching evenement" hidden><label for="a-time">${t('sol.time')}</label><input class="input" id="a-time" name="time" type="time" value="19:00"></div>
          </div>
          <div class="field"><label for="a-places">${t('pro.places')}</label><input class="input" id="a-places" name="places" type="number" min="1" max="500" value="30"></div>
          <div class="field"><label for="a-info">${t('pro.info')}</label><input class="input" id="a-info" name="info" maxlength="1000" placeholder="${t('pro.info_ph')}"></div>
          <button class="btn" type="submit">${t('pro.add_agenda')}</button>
        </form>
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.sessions')} <span class="badge-pill">${sessions.length}</span></h2>
        ${sessions.length ? html`<ul class="res-list">${sessions.map((c) => html`<li class="res-item">
          <div class="res-head"><span class="sol-ico" aria-hidden="true">⭐</span>
            <div style="flex:1;min-width:0"><strong>${c.title}</strong>
              <div class="muted small">${fmtShort(c.starts_on)} → ${fmtShort(c.ends_on)} · ${c.ends_on < today ? t('pro.finished') : c.starts_on > today ? t('pro.upcoming') : t('pro.in_progress')}</div></div>
            <span class="sol-tag ${(seats[c.id] ?? 0) >= c.capacity ? 'sol-tag-warn' : 'sol-tag-ok'}">${seats[c.id] ?? 0}/${c.capacity}</span></div>
          <div class="res-actions"><a class="btn btn-sm" href="#/formateur/solfege/session/${c.id}">${t('pro.manage_students')}</a>
            <button class="btn btn-sm btn-ghost" type="button" data-del-cohort="${c.id}">🗑 ${t('trainer.delete')}</button></div>
        </li>`)}</ul>` : html`<p class="muted" style="margin:0">${t('pro.no_sessions')}</p>`}
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.events')}</h2>
        ${mine.length ? html`<ul class="res-list">${mine.map((e) => html`<li class="res-item"><div class="res-head">
          <span class="sol-ico" aria-hidden="true">${e.kind === 'coaching' ? '🤝' : '📅'}</span>
          <div style="flex:1;min-width:0"><strong>${e.title}</strong><div class="muted small">${fmtWhen(e.starts_at)}${e.places ? ' · ' + t('pro.n_places', { n: e.places }) : ''}</div></div>
          <button class="btn btn-ghost btn-sm" type="button" data-del-event="${e.id}" aria-label="${t('trainer.delete')} ${e.title}">🗑</button></div></li>`)}</ul>`
          : html`<p class="muted" style="margin:0">${t('pro.no_events')}</p>`}
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.wa_title')}</h2>
        <p class="muted small" style="margin:0 0 10px">${t('pro.wa_lead')}</p>
        <form class="row" id="wa-form"><label class="sr-only" for="wa">${t('pro.wa_title')}</label>
          <input class="input" style="flex:1;min-width:0" id="wa" name="wa" inputmode="tel" placeholder="+225 07 00 00 00 00" value="${whatsapp[me.id] ?? ''}">
          <button class="btn btn-sm" type="submit">${t('sol.save')}</button></form>
      </section>
    </div>`);

  const form = document.getElementById('agenda-form');
  const syncKind = () => {
    const k = form.elements.kind.value;
    form.querySelectorAll('[data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(k); });
    form.elements.places.value = k === 'formation' ? (form.elements.places.value || 30) : form.elements.places.value;
  };
  form.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', syncKind));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kind = form.elements.kind.value;
    const title = form.elements.title.value.trim();
    const date = form.elements.date.value;
    const places = Number(form.elements.places.value) || null;
    if (title.length < 2) return setFormMessage(form, t('trainer.need_title'));
    if (!date) return setFormMessage(form, t('sol.need_when'));
    if (places !== null && (places < 1 || places > 500)) return setFormMessage(form, t('pro.bad_places'));
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true);
    try {
      if (kind === 'formation') {
        const months = Number(form.elements.months.value);
        await createSolfegeCohort({ trainer_id: me.id, title, info: form.elements.info.value.trim(), starts_on: date,
          ends_on: addMonths(date, months), capacity: places ?? 30 });
      } else {
        await createSolfegeEvent({ trainer_id: me.id, kind, title, info: form.elements.info.value.trim(),
          starts_at: new Date(`${date}T${form.elements.time.value || '19:00'}`).toISOString(), places });
      }
      toast(t('pro.added'), 'success');
      reload('agenda');
    } catch (err) { console.error(err); setBusy(btn, false); setFormMessage(form, t('trainer.publish_error')); }
  });
  document.getElementById('wa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = e.currentTarget.elements.wa.value.trim();
    if (value && !/^\+?[0-9 ]{6,20}$/.test(value)) return toast(t('pro.bad_wa'), 'error');
    try { await saveTrainerWhatsapp(me.id, value); toast(t('sol.saved'), 'success'); }
    catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
  zone.addEventListener('click', async (e) => {
    const dc = e.target.closest('[data-del-cohort]');
    const de = e.target.closest('[data-del-event]');
    try {
      if (dc) {
        const c = cohorts.find((x) => x.id === dc.dataset.delCohort);
        if (!c || !confirm(t('pro.confirm_delete_session', { title: c.title }))) return;
        await deleteSolfegeCohort(c.id);
      } else if (de) {
        if (!confirm(t('trainer.confirm_delete', { title: events.find((x) => x.id === de.dataset.delEvent)?.title ?? '' }))) return;
        await deleteSolfegeEvent(de.dataset.delEvent);
      } else return;
      toast(t('trainer.deleted'));
      reload('agenda');
    } catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
}

// Une session : élèves inscrits, payé jusqu'au…, +1 mois / +3 mois
export async function trainerCohortPage({ id }, me) {
  let cohort, members, students;
  try {
    const [cohorts, list] = await Promise.all([getSolfegeCohorts(), getStudentList()]);
    cohort = cohorts.find((c) => c.id === id && c.trainer_id === me.id);
    students = list;
    members = cohort ? await getCohortMembers(id) : [];
  } catch (err) {
    console.error(err);
    mount(html`<div class="container dash"><div class="alert alert-error" role="alert">${t('trainer.load_error')}</div></div>`);
    return;
  }
  if (!cohort) {
    mount(html`<div class="container dash"><h1>${t('pro.session_not_found')}</h1><a class="btn" href="#/formateur/solfege?vue=agenda">${t('trainer.back')}</a></div>`);
    return;
  }
  const today = todayIso();
  const counts = { ok: members.filter((m) => daysLeft(m.paid_until) > 7).length, soon: members.filter((m) => daysLeft(m.paid_until) >= 0 && daysLeft(m.paid_until) <= 7).length, off: members.filter((m) => m.paid_until < today).length };
  const free = students.filter((s) => !members.some((m) => m.student_id === s.id));
  const full = members.length >= cohort.capacity;
  const sorted = [...members].sort((a, b) => a.paid_until.localeCompare(b.paid_until));

  mount(html`
    <div class="container dash">
      <div>
        <a href="#/formateur/solfege?vue=agenda" class="small">← ${t('pro.sessions')}</a>
        <h1 style="margin:10px 0 4px">${cohort.title}</h1>
        <p class="muted" style="margin:0">${t('pro.from_to', { a: fmtDate(cohort.starts_on), b: fmtDate(cohort.ends_on) })} · ${t('pro.n_registered', { n: members.length, cap: cohort.capacity })}</p>
        <div class="row" style="margin-top:10px;gap:6px"><span class="sol-tag sol-tag-ok">${t('pro.n_ok', { n: counts.ok })}</span>
          <span class="sol-tag sol-tag-warn">${t('pro.n_soon', { n: counts.soon })}</span><span class="sol-tag sol-tag-off">${t('pro.n_off', { n: counts.off })}</span></div>
      </div>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.students_of_session')}</h2>
        ${sorted.length ? html`<div class="table-wrap"><table class="data-table"><tbody>${sorted.map((m) => html`<tr>
          <td><strong>${nameOf(m.student_id, students)}</strong><br><span class="muted small">${m.paid_until < today ? t('pro.expired_on', { d: fmtShort(m.paid_until) }) : t('pro.paid_until', { d: fmtShort(m.paid_until) })}</span></td>
          <td>${statusTag(m.paid_until)}</td>
          <td style="white-space:nowrap"><button class="btn btn-sm" type="button" data-ext="${m.student_id}" data-n="1">+1 ${t('pro.month')}</button>
            <button class="btn btn-sm btn-ghost" type="button" data-ext="${m.student_id}" data-n="3">+3</button>
            <button class="btn btn-sm btn-ghost" type="button" data-remove="${m.student_id}" aria-label="${t('pro.remove')} ${nameOf(m.student_id, students)}">✕</button></td>
        </tr>`)}</tbody></table></div>` : html`<p class="muted" style="margin:0">${t('pro.no_members')}</p>`}
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.add_paid_student')}</h2>
        ${full ? html`<p class="alert alert-info" style="margin:0">${t('pro.session_full', { n: cohort.capacity })}</p>` : html`
        <form class="form" id="member-form" novalidate>
          <div data-form-message></div>
          <div class="field"><label for="m-student">${t('pro.student')}</label><select class="input" id="m-student" name="student" required>
            <option value="">—</option>${free.map((s) => html`<option value="${s.id}">${s.full_name ?? s.email}</option>`)}</select>
            <span class="hint">${t('pro.add_hint')}</span></div>
          <div class="row"><button class="btn" type="submit" data-n="1">${t('pro.paid_1')}</button><button class="btn btn-ghost" type="submit" data-n="3">${t('pro.paid_3')}</button></div>
        </form>`}
      </section>
      <section class="card"><h2 style="font-size:1.05rem">${t('pro.session_content')}</h2><p class="muted small" style="margin:0">${t('pro.session_content_hint')}</p></section>
    </div>`);

  const again = () => trainerCohortPage({ id }, me);
  const form = document.getElementById('member-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = Number(e.submitter?.dataset.n ?? 1);
    const student = form.elements.student.value;
    if (!student) return setFormMessage(form, t('pro.need_student'));
    try {
      await addCohortMember({ cohort_id: cohort.id, student_id: student, paid_until: extend(null, n, cohort.starts_on) });
      toast(t('pro.access_opened'), 'success');
      again();
    } catch (err) { console.error(err); setFormMessage(form, /complète/i.test(err?.message ?? '') ? t('pro.session_full', { n: cohort.capacity }) : t('errors.generic')); }
  });
  document.querySelector('.data-table')?.addEventListener('click', async (e) => {
    const ext = e.target.closest('[data-ext]');
    const rm = e.target.closest('[data-remove]');
    try {
      if (ext) {
        const m = members.find((x) => x.student_id === ext.dataset.ext);
        const until = extend(m.paid_until, Number(ext.dataset.n), cohort.starts_on);
        await setMemberPaidUntil(cohort.id, m.student_id, until);
        toast(t('pro.extended', { d: fmtDate(until) }), 'success');
      } else if (rm) {
        if (!confirm(t('pro.confirm_remove', { name: nameOf(rm.dataset.remove, students) }))) return;
        await removeCohortMember(cohort.id, rm.dataset.remove);
      } else return;
      again();
    } catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
}

// ---------------------------------------------------------------------
// Coaching : demandes, coachings en cours
// ---------------------------------------------------------------------
export async function coachingView(zone, me, students) {
  const all = (await getCoachings()).filter((c) => c.trainer_id === me.id);
  const today = todayIso();
  const pending = all.filter((c) => c.status === 'pending');
  const active = all.filter((c) => c.status === 'active');
  const endOf = (c) => lastOfMonth(addMonths(c.start_month, c.months - 1));
  zone.innerHTML = String(html`
    <div class="dash-inner">
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.requests')} ${pending.length ? html`<span class="sol-tag sol-tag-warn">${t('pro.n_new', { n: pending.length })}</span>` : ''}</h2>
        ${pending.length ? html`<ul class="res-list">${pending.map((c) => html`<li class="res-item">
          <div><strong>${nameOf(c.student_id, students)}</strong><div class="muted small">${t('pro.request_summary', { n: c.months, m: monthName(c.start_month) })} · ${fmtShort(c.created_at.slice(0, 10))}</div>
            ${c.goal ? html`<p class="small" style="margin:6px 0 0">« ${c.goal} »</p>` : ''}</div>
          <div class="res-actions"><button class="btn btn-sm" type="button" data-validate="${c.id}">✓ ${t('pro.validate')}</button>
            <button class="btn btn-sm btn-ghost" type="button" data-refuse="${c.id}">${t('pro.refuse')}</button></div>
          <p class="muted small" style="margin:0">${t('pro.validate_hint', { d: fmtDate(endOf(c)) })}</p>
        </li>`)}</ul>` : html`<p class="muted" style="margin:0">${t('pro.no_requests')}</p>`}
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.active_coachings')}</h2>
        ${active.length ? html`<div class="table-wrap"><table class="data-table"><tbody>${active.map((c) => html`<tr>
          <td><a href="#/formateur/solfege/coaching/${c.id}"><strong>${nameOf(c.student_id, students)}</strong></a><br>
            <span class="muted small">${monthName(c.start_month)} · ${c.paid_until < today ? t('pro.expired_on', { d: fmtShort(c.paid_until) }) : t('pro.paid_until', { d: fmtShort(c.paid_until) })}</span></td>
          <td>${statusTag(c.paid_until)}</td>
          <td style="white-space:nowrap"><button class="btn btn-sm" type="button" data-plus="${c.id}">+1 ${t('pro.month')}</button>
            <a class="btn btn-sm btn-ghost" href="#/formateur/solfege/coaching/${c.id}">${t('pro.open')}</a></td></tr>`)}</tbody></table></div>`
          : html`<p class="muted" style="margin:0">${t('pro.no_active_coaching')}</p>`}
      </section>
    </div>`);
  zone.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-validate]');
    const r = e.target.closest('[data-refuse]');
    const p = e.target.closest('[data-plus]');
    try {
      if (v) {
        const c = all.find((x) => x.id === v.dataset.validate);
        await updateCoaching(c.id, { status: 'active', paid_until: endOf(c) });
        toast(t('pro.coaching_validated'), 'success');
      } else if (r) {
        if (!confirm(t('pro.confirm_refuse'))) return;
        await updateCoaching(r.dataset.refuse, { status: 'refused' });
      } else if (p) {
        const c = all.find((x) => x.id === p.dataset.plus);
        const base = c.paid_until >= today ? c.paid_until : lastOfMonth(today);
        const until = lastOfMonth(addMonths(firstOfMonth(base), 1));
        await updateCoaching(c.id, { paid_until: until });
        toast(t('pro.extended', { d: fmtDate(until) }), 'success');
      } else return;
      reload('coaching');
    } catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
}

// Un coaching : objectifs par mois, rendez-vous, fin
export async function trainerCoachingPage({ id }, me) {
  let c, goals, lives, students;
  try {
    [c, students] = await Promise.all([getCoaching(id), getStudentList()]);
    if (c && c.trainer_id !== me.id) c = null;
    [goals, lives] = c ? await Promise.all([getCoachingGoals(id), getSolfegeLives()]) : [[], []];
  } catch (err) {
    console.error(err);
    mount(html`<div class="container dash"><div class="alert alert-error" role="alert">${t('trainer.load_error')}</div></div>`);
    return;
  }
  if (!c) {
    mount(html`<div class="container dash"><h1>${t('pro.coaching_not_found')}</h1><a class="btn" href="#/formateur/solfege?vue=coaching">${t('trainer.back')}</a></div>`);
    return;
  }
  const name = nameOf(c.student_id, students);
  // Mois du coaching : du mois de départ jusqu'au dernier mois payé (prolongations comprises)
  const last = firstOfMonth(c.paid_until ?? lastOfMonth(addMonths(c.start_month, c.months - 1)));
  const months = [];
  for (let m = c.start_month; m <= last && months.length < 24; m = addMonths(m, 1)) months.push(m);
  const rdv = lives.filter((l) => l.coaching_id === c.id && liveState(l) !== 'past');
  mount(html`
    <div class="container dash">
      <div>
        <a href="#/formateur/solfege?vue=coaching" class="small">← ${t('pro.coaching')}</a>
        <h1 style="margin:10px 0 4px">${t('pro.coaching_of', { name })}</h1>
        <p class="muted" style="margin:0">${t('pro.request_summary', { n: c.months, m: monthName(c.start_month) })}${c.paid_until ? ' · ' + t('pro.paid_until', { d: fmtDate(c.paid_until) }) : ''}</p>
        ${c.goal ? html`<p style="margin:8px 0 0">${t('pro.my_goal')} : « ${c.goal} »</p>` : ''}
      </div>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.goals')}</h2>
        ${months.map((m) => {
          const list = goals.filter((g) => g.month === m);
          return html`<h3 style="font-size:1rem;margin:14px 0 6px;text-transform:capitalize">${monthName(m)}</h3>
            ${list.length ? html`<ul class="sol-goals">${list.map((g) => html`<li><span>${g.done ? '✅' : '⬜'} ${g.text}</span>
              <button class="btn btn-ghost btn-sm" type="button" data-del-goal="${g.id}" aria-label="${t('trainer.delete')}">🗑</button></li>`)}</ul>` : html`<p class="muted small" style="margin:0">${t('pro.no_goals')}</p>`}`;
        })}
        <form class="form" id="goal-form" novalidate style="margin-top:14px">
          <div data-form-message></div>
          <div class="grid grid-2" style="gap:12px">
            <div class="field"><label for="g-month">${t('pro.month_label')}</label><select class="input" id="g-month" name="month">
              ${months.map((m) => html`<option value="${m}" ${m === firstOfMonth(todayIso()) ? html`selected` : ''}>${monthName(m)}</option>`)}</select></div>
            <div class="field"><label for="g-text">${t('pro.goal_text')}</label><input class="input" id="g-text" name="text" maxlength="300" required></div>
          </div>
          <button class="btn btn-sm" type="submit">+ ${t('pro.add_goal')}</button>
        </form>
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.rdv')}</h2>
        ${rdv.length ? html`<ul class="res-list">${rdv.map((l) => html`<li class="res-item"><div class="res-head"><span class="sol-ico" aria-hidden="true">📞</span>
          <div style="flex:1;min-width:0"><strong>${fmtWhen(l.starts_at)}</strong><div class="muted small">${t('sol.minutes', { n: l.duration_minutes })}</div></div>
          <button class="btn btn-ghost btn-sm" type="button" data-del-rdv="${l.id}" aria-label="${t('trainer.delete')}">🗑</button></div></li>`)}</ul>` : ''}
        <form class="form" id="rdv-form" novalidate style="margin-top:10px">
          <div data-form-message></div>
          <div class="grid grid-2" style="gap:12px">
            <div class="field"><label for="r-date">${t('sol.date')}</label><input class="input" id="r-date" name="date" type="date" min="${todayIso()}" required></div>
            <div class="field"><label for="r-time">${t('sol.time')}</label><input class="input" id="r-time" name="time" type="time" required></div>
          </div>
          <div class="field"><label for="r-url">${t('pro.rdv_link')}</label><input class="input" id="r-url" name="url" type="url" placeholder="${t('pro.rdv_link_ph')}"></div>
          <button class="btn btn-sm" type="submit">${t('pro.add_rdv')}</button>
        </form>
      </section>
      <section class="card"><div class="row">
        <a class="btn btn-sm btn-ghost" href="#/formateur/solfege?vue=devoirs">✍️ ${t('pro.give_homework')}</a>
        <button class="btn btn-sm btn-ghost" type="button" id="end-coaching">${t('pro.end_coaching')}</button></div></section>
    </div>`);
  const again = () => trainerCoachingPage({ id }, me);
  const goalForm = document.getElementById('goal-form');
  goalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = goalForm.elements.text.value.trim();
    if (!text) return setFormMessage(goalForm, t('errors.required'));
    try { await addCoachingGoal({ coaching_id: c.id, month: goalForm.elements.month.value, text, position: goals.length }); again(); }
    catch (err) { console.error(err); setFormMessage(goalForm, t('errors.generic')); }
  });
  const rdvForm = document.getElementById('rdv-form');
  rdvForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const start = new Date(`${rdvForm.elements.date.value}T${rdvForm.elements.time.value}`);
    const url = rdvForm.elements.url.value.trim();
    if (Number.isNaN(start.getTime())) return setFormMessage(rdvForm, t('sol.need_when'));
    if (url && !/^https:\/\/\S+$/i.test(url)) return setFormMessage(rdvForm, t('sol.bad_https'));
    try {
      await createSolfegeLive({ trainer_id: me.id, coaching_id: c.id, title: t('pro.rdv_title', { name }), starts_at: start.toISOString(),
        duration_minutes: 30, meeting_url: url || jitsiLink(`Coaching ${name}`) });
      toast(t('pro.rdv_added'), 'success');
      again();
    } catch (err) { console.error(err); setFormMessage(rdvForm, t('errors.generic')); }
  });
  document.querySelector('.container.dash').addEventListener('click', async (e) => {
    const dg = e.target.closest('[data-del-goal]');
    const dr = e.target.closest('[data-del-rdv]');
    try {
      if (dg) await deleteCoachingGoal(dg.dataset.delGoal);
      else if (dr) { if (!confirm(t('pro.confirm_delete_rdv'))) return; await deleteSolfegeLive(dr.dataset.delRdv); }
      else if (e.target.id === 'end-coaching') { if (!confirm(t('pro.confirm_end'))) return; await updateCoaching(c.id, { status: 'ended' }); return navigate('/formateur/solfege?vue=coaching'); }
      else return;
      again();
    } catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
}

// ---------------------------------------------------------------------
// Devoirs : publier, voir les rendus, corriger
// ---------------------------------------------------------------------
function homeworkTargets(students, cohorts, coachings) {
  return html`<option value="">${t('trainer.all_students')}</option>
    ${cohorts.length ? html`<optgroup label="${t('pro.paid_sessions')}">${cohorts.map((c) => html`<option value="cohort:${c.id}">⭐ ${c.title}</option>`)}</optgroup>` : ''}
    ${coachings.length ? html`<optgroup label="${t('pro.coaching')}">${coachings.map((c) => html`<option value="coaching:${c.id}">🤝 ${nameOf(c.student_id, students)}</option>`)}</optgroup>` : ''}`;
}

export async function homeworkView(zone, me, students, cohorts) {
  const [homework, coachings] = await Promise.all([getSolfegeHomework(), getCoachings().catch(() => [])]);
  const mine = homework.filter((h) => h.trainer_id === me.id);
  const activeCoachings = coachings.filter((c) => c.trainer_id === me.id && c.status === 'active');
  const subs = mine.length ? await getSubmissions().catch(() => []) : [];
  const label = (h) => (h.cohort_id ? `⭐ ${cohorts.find((c) => c.id === h.cohort_id)?.title ?? ''}` : h.coaching_id ? `🤝 ${nameOf(coachings.find((c) => c.id === h.coaching_id)?.student_id, students)}` : t('trainer.for_all'));
  zone.innerHTML = String(html`
    <div class="dash-inner">
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.new_homework')}</h2>
        <form class="form" id="hw-form" novalidate>
          <div data-form-message></div>
          <div class="field"><label for="h-title">${t('trainer.res_title')}</label><input class="input" id="h-title" name="title" maxlength="160" required placeholder="${t('pro.hw_ph')}"></div>
          <div class="field"><label for="h-text">${t('pro.instructions')}</label><textarea class="input" id="h-text" name="instructions" rows="3" maxlength="4000"></textarea></div>
          <div class="grid grid-2" style="gap:12px">
            <div class="field"><label for="h-due">${t('pro.due_label')}</label><input class="input" id="h-due" name="due" type="date" min="${todayIso()}"></div>
            <div class="field"><label for="h-to">${t('trainer.res_to')}</label><select class="input" id="h-to" name="to">${homeworkTargets(students, cohorts, activeCoachings)}</select></div>
          </div>
          <div class="field"><label for="h-file">${t('pro.hw_file')}</label><input class="input" id="h-file" name="file" type="file" accept="${FILE_ACCEPT}"><span class="hint">${t('sol.file_hint', { mb: MAX_MB })}</span></div>
          <button class="btn" type="submit">${t('trainer.publish')}</button>
        </form>
      </section>
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.my_homework_list')} <span class="badge-pill">${mine.length}</span></h2>
        ${mine.length ? html`<ul class="res-list">${mine.map((h) => {
          const s = subs.filter((x) => x.homework_id === h.id);
          const todo = s.filter((x) => !x.corrected_at).length;
          return html`<li class="res-item"><div class="res-head"><span class="sol-ico" aria-hidden="true">✍️</span>
            <div style="flex:1;min-width:0"><strong>${h.title}</strong><div class="muted small">${label(h)}${h.due_at ? ' · ' + t('pro.due', { d: fmtWhen(h.due_at) }) : ''}</div>
              <div class="small" style="margin-top:4px">${t('pro.n_submitted', { n: s.length })}${todo ? html` · <span class="sol-tag sol-tag-warn">${t('pro.n_to_correct', { n: todo })}</span>` : ''}</div></div>
            <button class="btn btn-ghost btn-sm" type="button" data-del-hw="${h.id}" aria-label="${t('trainer.delete')} ${h.title}">🗑</button></div>
            <div class="res-actions"><a class="btn btn-sm" href="#/formateur/solfege/devoir/${h.id}">${t('pro.see_submissions')}</a></div></li>`;
        })}</ul>` : html`<p class="muted" style="margin:0">${t('pro.no_homework_trainer')}</p>`}
      </section>
    </div>`);
  const form = document.getElementById('hw-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.elements.title.value.trim();
    if (title.length < 2) return setFormMessage(form, t('trainer.need_title'));
    const f = form.elements.file.files[0];
    if (f && !fileKind(f)) return setFormMessage(form, t('sol.bad_file'));
    if (f && f.size > MAX_MB * 1048576) return setFormMessage(form, t('trainer.too_big', { mb: MAX_MB }));
    const to = form.elements.to.value;
    const due = form.elements.due.value;
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true);
    try {
      const h = await createSolfegeHomework({ trainer_id: me.id, title, instructions: form.elements.instructions.value.trim(),
        due_at: due ? new Date(`${due}T23:59`).toISOString() : null,
        cohort_id: to.startsWith('cohort:') ? to.slice(7) : null, coaching_id: to.startsWith('coaching:') ? to.slice(9) : null });
      if (f) {
        const path = await uploadSolfegeFile(me.id, f);
        await createSolfegeResource({ trainer_id: me.id, homework_id: h.id, kind: fileKind(f), title: f.name.replace(/\.[^.]+$/, '').slice(0, 160) || f.name, storage_path: path, file_size: f.size });
      }
      toast(t('trainer.published'), 'success');
      reload('devoirs');
    } catch (err) { console.error(err); setBusy(btn, false); setFormMessage(form, t('trainer.publish_error')); }
  });
  zone.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-del-hw]');
    if (!d) return;
    const h = mine.find((x) => x.id === d.dataset.delHw);
    if (!h || !confirm(t('trainer.confirm_delete', { title: h.title }))) return;
    try { await deleteSolfegeHomework(h.id); toast(t('trainer.deleted')); reload('devoirs'); }
    catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
}

// Un devoir : les rendus des élèves, correction (note + commentaire)
export async function trainerHomeworkPage({ id }, me) {
  let h, subs, students, files, members = [];
  try {
    [h, students] = await Promise.all([getSolfegeHomeworkOne(id), getStudentList()]);
    if (h && h.trainer_id !== me.id) h = null;
    if (h) [subs, files, members] = await Promise.all([getSubmissions({ homeworkId: id }), getHomeworkResources([id]), h.cohort_id ? getCohortMembers(h.cohort_id) : []]);
  } catch (err) {
    console.error(err);
    mount(html`<div class="container dash"><div class="alert alert-error" role="alert">${t('trainer.load_error')}</div></div>`);
    return;
  }
  if (!h) {
    mount(html`<div class="container dash"><h1>${t('pro.hw_not_found')}</h1><a class="btn" href="#/formateur/solfege?vue=devoirs">${t('trainer.back')}</a></div>`);
    return;
  }
  const missing = members.filter((m) => !subs.some((s) => s.student_id === m.student_id));
  mount(html`
    <div class="container dash">
      <div>
        <a href="#/formateur/solfege?vue=devoirs" class="small">← ${t('pro.homework')}</a>
        <h1 style="margin:10px 0 4px">${h.title}</h1>
        ${h.due_at ? html`<p class="muted" style="margin:0">${t('pro.due', { d: fmtWhen(h.due_at) })}</p>` : ''}
        ${h.instructions ? html`<p class="res-text" style="margin:8px 0 0">${h.instructions}</p>` : ''}
      </div>
      ${files.length ? html`<ul class="res-list" id="hw-files">${files.map((f) => resourceCard(f))}</ul>` : ''}
      <section class="card">
        <h2 style="font-size:1.15rem">${t('pro.submissions')} <span class="badge-pill">${subs.length}</span></h2>
        ${subs.length ? html`<ul class="res-list" id="subs">${subs.map((s) => html`<li class="res-item">
          <div><strong>${nameOf(s.student_id, students)}</strong> <span class="muted small">· ${t('pro.submitted_on', { d: fmtWhen(s.submitted_at) })} · ${t('pro.kinds')[s.kind]}</span>
            ${s.note ? html`<p class="small" style="margin:6px 0 0">« ${s.note} »</p>` : ''}</div>
          <div class="res-actions">${s.kind === 'audio' ? html`<button class="btn btn-sm" type="button" data-play-sub="${s.storage_path}">▶ ${t('course.listen')}</button>`
            : s.kind === 'file' ? html`<button class="btn btn-sm" type="button" data-open-sub="${s.storage_path}">${t('pro.open_file')}</button>` : html`<span class="sol-tag">💬 ${t('pro.on_whatsapp')}</span>`}</div>
          <form class="row" data-grade="${s.id}" style="align-items:flex-end">
            <div class="field" style="width:110px;margin:0"><label for="gr-${s.id}">${t('pro.grade')}</label><input class="input" id="gr-${s.id}" name="grade" maxlength="20" value="${s.grade ?? ''}" placeholder="16/20"></div>
            <div class="field" style="flex:1;min-width:180px;margin:0"><label for="fb-${s.id}">${t('pro.feedback')}</label><input class="input" id="fb-${s.id}" name="feedback" maxlength="2000" value="${s.feedback ?? ''}"></div>
            <button class="btn btn-sm" type="submit">${s.corrected_at ? t('sol.save') : t('pro.correct')}</button>
          </form>
          ${s.corrected_at ? html`<span class="sol-tag sol-tag-ok">✓ ${t('pro.corrected')}</span>` : ''}
        </li>`)}</ul>` : html`<p class="muted" style="margin:0">${t('pro.no_submissions')}</p>`}
      </section>
      ${missing.length ? html`<section class="card"><h2 style="font-size:1.05rem">${t('pro.not_submitted')}</h2>
        <p class="muted" style="margin:0">${missing.map((m) => nameOf(m.student_id, students)).join(', ')}</p></section>` : ''}
    </div>`);
  bindMedia(document.getElementById('hw-files'));
  const list = document.getElementById('subs');
  list?.addEventListener('click', async (e) => {
    const play = e.target.closest('[data-play-sub]');
    const open = e.target.closest('[data-open-sub]');
    if (!play && !open) return;
    const path = (play ?? open).dataset[play ? 'playSub' : 'openSub'];
    const win = open ? window.open('', '_blank') : null;
    try {
      const url = (await getSolfegeFileUrls([path]))[path];
      if (!url) throw new Error('lien');
      if (open) { if (win) win.location = url; else window.location.href = url; return; }
      const audio = document.createElement('audio');
      audio.controls = true; audio.src = url; audio.style.width = '100%';
      play.replaceWith(audio); audio.play().catch(() => {});
    } catch (err) { console.error(err); win?.close(); toast(t('course.file_error'), 'error'); }
  });
  list?.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-grade]');
    if (!f) return;
    e.preventDefault();
    try { await gradeSubmission(f.dataset.grade, f.elements.grade.value.trim(), f.elements.feedback.value.trim()); toast(t('pro.correction_saved'), 'success'); trainerHomeworkPage({ id }, me); }
    catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
  });
}
