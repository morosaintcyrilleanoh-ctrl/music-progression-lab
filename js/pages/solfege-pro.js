// =====================================================================
// Espace solfège (élève) : ma formation payante, agenda, devoirs, coaching
// =====================================================================
import { html, toast, setBusy, setFormMessage } from '../ui.js';
import { t } from '../i18n.js';
import {
  getSolfegeCohorts, getCohortSeats, getSolfegeEvents, getSolfegeLives, getSolfegeCourses, getSolfegeProgress,
  getSolfegeHomework, getHomeworkResources, getSubmissions, uploadSubmissionFile, saveSubmission,
  getCoachings, requestCoaching, deleteCoaching, getCoachingGoals, setCoachingGoalDone
} from '../data.js';
import {
  resourceCard, bindMedia, videoEmbed, liveState, fmtWhen, safeUrl, todayIso, addMonths, firstOfMonth,
  fmtDate, fmtShort, monthName, daysLeft, waLink, audioRecorder, MAX_AUDIO_SECONDS, parseDay
} from './solfege-media.js';
import { liveCard } from './solfege-space.js';

const SUB_MAX_MB = 10;
const isActive = (m) => m.paid_until >= todayIso();
const trainerIdOf = (x) => x?.trainer_id ?? x?.id ?? null;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// ---------------------------------------------------------------------
// Ma formation (session payante)
// ---------------------------------------------------------------------
export async function myFormationSection(zone, ctx) {
  // Sessions en cours ou à venir d'abord (par date de début), terminées ou expirées ensuite
  const today = todayIso();
  const rank = (m) => (isActive(m) && m.cohort.ends_on >= today ? 0 : 1);
  const memberships = [...ctx.memberships].filter((m) => m.cohort)
    .sort((a, b) => rank(a) - rank(b) || a.cohort.starts_on.localeCompare(b.cohort.starts_on));
  if (!memberships.length) { zone.innerHTML = String(html`<section class="card"><p class="muted" style="margin:0">${t('pro.not_member')}</p><a class="btn btn-sm" href="#/espace-solfege/agenda">${t('pro.see_agenda')}</a></section>`); return; }
  const [lives, courses, progress, homework] = await Promise.all([
    getSolfegeLives(), getSolfegeCourses(), getSolfegeProgress(ctx.user.id), getSolfegeHomework()
  ]);
  const done = new Set(progress.map((p) => p.lesson_id));
  const blocks = memberships.map((m) => {
    const c = m.cohort;
    const wa = waLink(ctx.whatsapp[c.trainer_id], t('pro.wa_renew', { title: c.title }));
    if (!isActive(m)) {
      return html`<section class="card sol-locked">
        <div class="sol-lock" aria-hidden="true">🔒</div>
        <h2 style="font-size:1.25rem;margin:6px 0">${t('pro.expired_title')}</h2>
        <p class="muted" style="margin:0 0 14px">${t('pro.expired_text', { title: c.title, d: fmtDate(m.paid_until) })}</p>
        <a class="btn sol-wa" href="${wa}" target="_blank" rel="noopener noreferrer">${t('pro.contact_wa')}</a>
        <p class="muted small" style="margin:12px 0 0">${t('pro.expired_kept')}</p>
      </section>`;
    }
    const myLives = lives.filter((l) => l.cohort_id === c.id);
    const next = myLives.filter((l) => liveState(l) !== 'past');
    const replays = myLives.filter((l) => liveState(l) === 'past' && l.replay_url).reverse();
    const myCourses = courses.filter((x) => x.cohort_id === c.id);
    const todo = homework.filter((h) => h.cohort_id === c.id);
    const soon = daysLeft(m.paid_until) <= 7;
    return html`
      <section class="sol-band">
        <p class="sol-band-eb">${t('pro.paid_formation')} · ${fmtShort(c.starts_on)} → ${fmtShort(c.ends_on)}</p>
        <h2>${c.title}</h2>
        <p>${soon ? '⚠️ ' : '✓ '}${t('pro.access_until', { d: fmtDate(m.paid_until) })}</p>
        ${c.info ? html`<p class="sol-band-info">${c.info}</p>` : ''}
        ${soon ? html`<a class="btn btn-sm sol-wa" href="${wa}" target="_blank" rel="noopener noreferrer">${t('pro.renew')}</a>` : ''}
      </section>
      ${next.map((l) => liveCard(l))}
      ${myCourses.length ? html`<h2 class="sol-h">${t('pro.lessons')}</h2>${myCourses.map((x) => {
        const d = x.lessons.filter((l) => done.has(l.id)).length;
        return html`<a class="card sol-course" href="#/espace-solfege/formation/${x.id}"><h3 style="margin:0 0 2px;font-size:1.05rem">${x.title}</h3>
          <p class="muted small" style="margin:0">${t('sol.lessons_progress', { d, n: x.lessons.length })}</p>
          <div class="bar"><span style="width:${pct(d, x.lessons.length)}%"></span></div></a>`;
      })}` : ''}
      ${todo.length ? html`<a class="card sol-course" href="#/espace-solfege/devoirs"><span class="sol-badge">${t('pro.homework')}</span>
        <h3 style="margin:8px 0 0;font-size:1.05rem">${t('pro.n_homework', { n: todo.length })}</h3></a>` : ''}
      <h2 class="sol-h">${t('pro.replays')}</h2>
      ${replays.length ? replays.map((l, i) => html`<section class="card">
        <span class="sol-badge">${fmtShort(l.starts_at.slice(0, 10))}</span>
        <h3 style="margin:8px 0;font-size:1.05rem">${l.title}</h3>
        ${i === 0 ? videoEmbed(l.replay_url, l.title) : html`<details><summary>▶ ${t('pro.watch_replay')}</summary><div style="margin-top:10px">${videoEmbed(l.replay_url, l.title)}</div></details>`}
      </section>`) : html`<section class="card"><p class="muted" style="margin:0">${t('pro.no_replays')}</p></section>`}`;
  });
  zone.innerHTML = String(html`${blocks}`);
}

// ---------------------------------------------------------------------
// Agenda : 3 prochains mois
// ---------------------------------------------------------------------
export async function agendaSection(zone, ctx) {
  const [cohorts, events, lives] = await Promise.all([getSolfegeCohorts(), getSolfegeEvents(), getSolfegeLives()]);
  const today = todayIso();
  const until = addMonths(today, 3);
  const visibleCohorts = cohorts.filter((c) => c.ends_on >= today && c.starts_on <= until);
  const seats = await getCohortSeats(visibleCohorts.map((c) => c.id)).catch(() => ({}));
  const mine = new Set(ctx.memberships.map((m) => m.cohort_id));
  const items = [
    ...visibleCohorts.map((c) => ({ kind: 'cohort', day: c.starts_on < today ? today : c.starts_on, c })),
    ...events.filter((e) => e.starts_at.slice(0, 10) >= today && e.starts_at.slice(0, 10) <= until).map((e) => ({ kind: e.kind, day: e.starts_at.slice(0, 10), e })),
    ...lives.filter((l) => !l.cohort_id && !l.coaching_id && !l.student_id && liveState(l) !== 'past' && l.starts_at.slice(0, 10) <= until)
      .map((l) => ({ kind: 'live', day: l.starts_at.slice(0, 10), l })),
  ].sort((a, b) => a.day.localeCompare(b.day));
  if (!items.length) { zone.innerHTML = String(html`<section class="card"><p class="muted" style="margin:0">${t('pro.agenda_empty')}</p></section>`); return; }

  let month = '';
  const out = items.map((it) => {
    const m = firstOfMonth(it.day);
    const head = m !== month ? ((month = m), html`<h2 class="sol-month">${monthName(m)}</h2>`) : '';
    if (it.kind === 'cohort') {
      const c = it.c;
      const taken = seats[c.id] ?? 0;
      const left = Math.max(0, c.capacity - taken);
      const months = Math.max(1, Math.round((parseDay(c.ends_on) - parseDay(c.starts_on)) / (30.4 * 86400000)));
      const started = c.starts_on <= today;
      return html`${head}<section class="card sol-agenda-main">
        <span class="sol-badge">${t('pro.formation_months', { n: months })}</span>
        <h3 style="margin:8px 0 2px;font-size:1.15rem">${c.title}</h3>
        <p class="muted small" style="margin:0">${t('pro.from_to', { a: fmtDate(c.starts_on), b: fmtDate(c.ends_on) })}${c.info ? ' · ' + c.info : ''}</p>
        ${mine.has(c.id) ? html`<p style="margin:10px 0 0"><span class="sol-tag sol-tag-ok">✓ ${t('pro.registered')}</span></p>`
          : html`<p style="margin:10px 0 0">${left ? html`<span class="sol-tag sol-tag-ok">${t('pro.seats_left', { n: left, cap: c.capacity })}</span>` : html`<span class="sol-tag sol-tag-warn">${t('pro.full')}</span>`}
            ${started ? html` <span class="sol-tag">${t('pro.started')}</span>` : ''}</p>
            <a class="btn sol-wa" style="margin-top:12px" href="${waLink(ctx.whatsapp[c.trainer_id], t(left ? 'pro.wa_register' : 'pro.wa_waitlist', { title: c.title, d: fmtDate(c.starts_on) }))}" target="_blank" rel="noopener noreferrer">${left ? t('pro.want_register') : t('pro.join_waitlist')}</a>`}
      </section>`;
    }
    if (it.kind === 'live') {
      return html`${head}<section class="card row" style="flex-wrap:nowrap"><span class="sol-ico" aria-hidden="true">🎥</span>
        <div style="flex:1;min-width:0"><strong>${it.l.title}</strong><div class="muted small">${fmtWhen(it.l.starts_at)} · ${t('pro.free_live')}</div></div>
        <a class="btn btn-sm btn-ghost" href="${safeUrl(it.l.meeting_url)}" target="_blank" rel="noopener noreferrer">${t('sol.live_link')} ↗</a></section>`;
    }
    const e = it.e;
    return html`${head}<section class="card row" style="flex-wrap:nowrap"><span class="sol-ico" aria-hidden="true">${e.kind === 'coaching' ? '🤝' : '📅'}</span>
      <div style="flex:1;min-width:0"><strong>${e.title}</strong>
        <div class="muted small">${fmtWhen(e.starts_at)}${e.places ? ' · ' + t('pro.n_places', { n: e.places }) : ''}${e.info ? ' · ' + e.info : ''}</div></div>
      ${e.kind === 'coaching' ? html`<a class="btn btn-sm" href="#/espace-solfege/coaching">${t('pro.ask')}</a>` : ''}</section>`;
  });
  zone.innerHTML = String(html`${out}`);
}

// ---------------------------------------------------------------------
// Devoirs : rendre un PDF / une photo, un audio (2 min) ou « envoyé sur WhatsApp »
// ---------------------------------------------------------------------
export async function homeworkSection(zone, ctx) {
  const [homework, subs, cohorts] = await Promise.all([getSolfegeHomework(), getSubmissions({ studentId: ctx.user.id }), getSolfegeCohorts().catch(() => [])]);
  if (!homework.length) { zone.innerHTML = String(html`<section class="card"><p class="muted" style="margin:0">${t('pro.no_homework')}</p></section>`); return; }
  const files = await getHomeworkResources(homework.map((h) => h.id)).catch(() => []);
  const subOf = (id) => subs.find((s) => s.homework_id === id);
  const scope = (h) => (h.cohort_id ? cohorts.find((c) => c.id === h.cohort_id)?.title ?? t('pro.paid_formation') : h.coaching_id ? t('pro.coaching') : t('pro.for_all'));
  zone.innerHTML = String(html`${homework.map((h) => {
    const s = subOf(h.id);
    const late = h.due_at && !s && h.due_at < new Date().toISOString();
    return html`<section class="card sol-hw" data-hw="${h.id}">
      <div class="row" style="gap:6px"><span class="sol-badge">${scope(h)}</span>
        ${h.due_at ? html`<span class="sol-tag ${late ? 'sol-tag-off' : ''}">${t('pro.due', { d: fmtWhen(h.due_at) })}</span>` : ''}</div>
      <h3 style="margin:8px 0 4px;font-size:1.1rem">${h.title}</h3>
      ${h.instructions ? html`<p class="res-text" style="margin:0 0 8px">${h.instructions}</p>` : ''}
      ${files.filter((f) => f.homework_id === h.id).length ? html`<ul class="res-list">${files.filter((f) => f.homework_id === h.id).map((f) => resourceCard(f))}</ul>` : ''}
      ${s?.corrected_at ? html`<div class="sol-correction"><span class="sol-tag sol-tag-ok">${t('pro.corrected')}${s.grade ? ' · ' + s.grade : ''}</span>
          ${s.feedback ? html`<p style="margin:8px 0 0">« ${s.feedback} »</p>` : ''}</div>`
        : html`${s ? html`<p class="sol-done">✓ ${t('pro.submitted', { d: fmtShort(s.submitted_at.slice(0, 10)), how: t('pro.kinds')[s.kind] })}</p>` : ''}
          <details ${s ? '' : html`open`}><summary>${s ? t('pro.replace') : t('pro.submit_title')}</summary>
          <form class="form sol-submit" data-submit="${h.id}" novalidate style="margin-top:10px">
            <div data-form-message></div>
            <div class="field"><label for="f-${h.id}">${t('pro.file_label')}</label>
              <input class="input" id="f-${h.id}" name="file" type="file" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp">
              <span class="hint">${t('pro.file_hint', { mb: SUB_MAX_MB })}</span></div>
            <div class="sol-or">${t('pro.or')}</div>
            <div class="row"><button class="btn btn-ghost btn-sm" type="button" data-rec>🎤 ${t('pro.record', { n: MAX_AUDIO_SECONDS / 60 })}</button>
              <span class="small muted" data-rec-status></span></div>
            <audio controls hidden data-rec-preview style="width:100%;margin-top:8px"></audio>
            <label class="sol-radio"><input type="checkbox" name="whatsapp"> ${t('pro.sent_whatsapp')}</label>
            <div class="field"><label for="n-${h.id}">${t('pro.note_label')}</label><textarea class="input" id="n-${h.id}" name="note" rows="2" maxlength="1000"></textarea></div>
            <button class="btn" type="submit">${t('pro.submit')}</button>
          </form></details>`}
    </section>`;
  })}`);
  bindMedia(zone);

  // Enregistrement audio, un par formulaire
  const recorded = new Map();
  zone.querySelectorAll('[data-submit]').forEach((form) => {
    const btn = form.querySelector('[data-rec]');
    const status = form.querySelector('[data-rec-status]');
    const preview = form.querySelector('[data-rec-preview]');
    let rec = null;
    btn.addEventListener('click', async () => {
      if (rec) { rec.stop(); return; }
      rec = audioRecorder({
        onTick: (s) => { status.textContent = `● ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} / 2:00`; },
        onStop: (file, secs) => {
          rec = null;
          recorded.set(form.dataset.submit, file);
          btn.textContent = `🎤 ${t('pro.record_again')}`;
          status.textContent = t('pro.recorded', { s: secs });
          preview.src = URL.createObjectURL(file); preview.hidden = false;
        },
      });
      try { await rec.start(); btn.textContent = `⏹ ${t('pro.stop')}`; }
      catch (err) { console.error(err); rec = null; toast(t('pro.mic_error'), 'error'); }
    });
  });

  zone.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-submit]');
    if (!form) return;
    e.preventDefault();
    const homeworkId = form.dataset.submit;
    const file = form.elements.file.files[0];
    const audio = recorded.get(homeworkId);
    const viaWa = form.elements.whatsapp.checked;
    const note = form.elements.note.value.trim();
    if (!file && !audio && !viaWa) return setFormMessage(form, t('pro.need_something'));
    if (file && file.size > SUB_MAX_MB * 1048576) return setFormMessage(form, t('trainer.too_big', { mb: SUB_MAX_MB }));
    if (file && !/^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) return setFormMessage(form, t('pro.bad_file'));
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true);
    try {
      const previous = subOf(homeworkId)?.storage_path ?? null;
      let row = { homework_id: homeworkId, student_id: ctx.user.id, kind: 'whatsapp', storage_path: null, file_size: null, note };
      const toSend = file ?? audio;
      if (toSend) {
        const path = await uploadSubmissionFile(ctx.user.id, toSend);
        row = { ...row, kind: file ? 'file' : 'audio', storage_path: path, file_size: toSend.size };
      }
      await saveSubmission(row, previous);
      toast(t('pro.submitted_ok'), 'success');
      homeworkSection(zone, ctx);
    } catch (err) {
      console.error(err);
      setBusy(btn, false);
      setFormMessage(form, /size|large|exceed/i.test(err?.message ?? '') ? t('trainer.too_big', { mb: SUB_MAX_MB }) : t('trainer.publish_error'));
    }
  });
}

// ---------------------------------------------------------------------
// Coaching individuel
// ---------------------------------------------------------------------
const DURATIONS = [1, 2, 3, 6];
export async function coachingSection(zone, ctx) {
  const coachings = (await getCoachings()).filter((c) => c.student_id === ctx.user.id);
  const today = todayIso();
  const current = coachings.find((c) => c.status === 'pending' || (c.status === 'active' && c.paid_until >= today));
  const trainer = trainerIdOf(ctx.trainers[0]);
  const wa = (text) => waLink(ctx.whatsapp[current?.trainer_id ?? trainer], text);

  if (current?.status === 'active') {
    const [goals, lives] = await Promise.all([getCoachingGoals(current.id), getSolfegeLives()]);
    const month = firstOfMonth(today) < current.start_month ? current.start_month : firstOfMonth(today);
    const k = Math.min(current.months, Math.max(1, Math.round((parseDay(month) - parseDay(current.start_month)) / (30.4 * 86400000)) + 1));
    const started = current.start_month <= today;
    const monthGoals = goals.filter((g) => g.month === month);
    const rdv = lives.filter((l) => l.coaching_id === current.id && liveState(l) !== 'past');
    zone.innerHTML = String(html`
      <section class="card">
        <span class="sol-tag ${daysLeft(current.paid_until) <= 7 ? 'sol-tag-warn' : 'sol-tag-ok'}">${t('pro.active_until', { d: fmtDate(current.paid_until) })}</span>
        <h2 style="font-size:1.25rem;margin:10px 0 4px">${started ? t('pro.month_k', { k, n: current.months, m: monthName(month) }) : t('pro.starts_on', { d: fmtDate(current.start_month) })}</h2>
        ${current.goal ? html`<p class="muted small" style="margin:0">${t('pro.my_goal')} : ${current.goal}</p>` : ''}
        <div class="bar"><span style="width:${started ? pct(k, current.months) : 0}%"></span></div>
        ${daysLeft(current.paid_until) <= 7 ? html`<a class="btn btn-sm sol-wa" style="margin-top:12px" href="${wa(t('pro.wa_coaching_renew'))}" target="_blank" rel="noopener noreferrer">${t('pro.renew')}</a>` : ''}
      </section>
      <section class="card"><h2 style="font-size:1.1rem">${t('pro.goals_of', { m: monthName(month) })}</h2>
        ${monthGoals.length ? html`<ul class="sol-goals">${monthGoals.map((g) => html`<li><label><input type="checkbox" data-goal="${g.id}" ${g.done ? html`checked` : ''}> <span>${g.text}</span></label></li>`)}</ul>`
          : html`<p class="muted" style="margin:0">${t('pro.no_goals')}</p>`}
      </section>
      ${rdv.length ? rdv.map((l) => liveCard(l)) : html`<section class="card"><p class="muted" style="margin:0">${t('pro.no_rdv')}</p></section>`}
      <a class="card sol-course" href="#/espace-solfege/devoirs"><strong>✍️ ${t('pro.my_homework')}</strong></a>`);
    zone.querySelectorAll('[data-goal]').forEach((box) => box.addEventListener('change', async () => {
      try { await setCoachingGoalDone(box.dataset.goal, box.checked); }
      catch (err) { console.error(err); box.checked = !box.checked; toast(t('errors.generic'), 'error'); }
    }));
    return;
  }

  if (current?.status === 'pending') {
    zone.innerHTML = String(html`<section class="card">
      <span class="sol-tag sol-tag-warn">${t('pro.request_sent')}</span>
      <h2 style="font-size:1.2rem;margin:10px 0 4px">${t('pro.request_summary', { n: current.months, m: monthName(current.start_month) })}</h2>
      <p class="muted" style="margin:0 0 12px">${t('pro.request_next')}</p>
      <a class="btn sol-wa" href="${wa(t('pro.wa_coaching', { n: current.months, m: monthName(current.start_month) }))}" target="_blank" rel="noopener noreferrer">${t('pro.contact_wa')}</a>
      <button class="btn btn-ghost btn-sm" type="button" id="cancel-req" style="margin-top:10px">${t('pro.cancel_request')}</button>
    </section>`);
    document.getElementById('cancel-req').addEventListener('click', async () => {
      if (!confirm(t('pro.confirm_cancel'))) return;
      try { await deleteCoaching(current.id); coachingSection(zone, ctx); } catch (err) { console.error(err); toast(t('errors.generic'), 'error'); }
    });
    return;
  }

  // Demande de coaching
  const months = [0, 1, 2, 3].map((i) => addMonths(firstOfMonth(today), i));
  const past = coachings.filter((c) => c !== current);
  zone.innerHTML = String(html`
    <section class="sol-band"><p class="sol-band-eb">${t('pro.coaching_eb')}</p><h2>${t('pro.coaching_title')}</h2><p>${t('pro.coaching_lead')}</p></section>
    ${trainer ? html`<section class="card"><h2 style="font-size:1.15rem">${t('pro.my_request')}</h2>
      <form class="form" id="coach-form" novalidate>
        <div data-form-message></div>
        <fieldset class="field"><legend>${t('pro.duration')}</legend><div class="sol-chips">
          ${DURATIONS.map((n, i) => html`<label class="sol-chip-radio"><input type="radio" name="months" value="${n}" ${i === 0 ? html`checked` : ''}><span>${t('pro.n_months', { n })}</span></label>`)}</div></fieldset>
        <fieldset class="field"><legend>${t('pro.start_from')}</legend><div class="sol-chips">
          ${months.map((m, i) => html`<label class="sol-chip-radio"><input type="radio" name="start" value="${m}" ${i === 1 ? html`checked` : ''}><span>${monthName(m)}</span></label>`)}</div></fieldset>
        <div class="field"><label for="c-goal">${t('pro.my_goal')}</label><textarea class="input" id="c-goal" name="goal" rows="3" maxlength="500" placeholder="${t('pro.goal_ph')}"></textarea></div>
        <button class="btn" type="submit">${t('pro.send_request')}</button>
        <p class="muted small" style="margin:0">${t('pro.request_next')}</p>
      </form></section>` : html`<section class="card"><p class="muted" style="margin:0 0 12px">${t('sol.no_trainer')}</p><a class="btn btn-sm" href="#/cours">${t('sol.join_trainer')}</a></section>`}
    ${past.length ? html`<section class="card"><h2 style="font-size:1.05rem">${t('pro.history')}</h2><ul class="plain-list small">
      ${past.map((c) => html`<li>${t('pro.request_summary', { n: c.months, m: monthName(c.start_month) })} — <span class="muted">${t('pro.status')[c.status === 'active' ? 'ended' : c.status]}</span></li>`)}</ul></section>` : ''}`);
  const form = document.getElementById('coach-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true);
    try {
      await requestCoaching({ trainer_id: trainer, student_id: ctx.user.id, status: 'pending', months: Number(form.elements.months.value), start_month: form.elements.start.value, goal: form.elements.goal.value.trim() });
      toast(t('pro.request_ok'), 'success');
      coachingSection(zone, ctx);
    } catch (err) { console.error(err); setBusy(btn, false); setFormMessage(form, t('errors.generic')); }
  });
}

