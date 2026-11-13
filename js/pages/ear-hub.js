// =====================================================================
// Oreille musicale : activités, défi du jour, examens et certificats,
// programmes de 30 jours, accordeur et diapason
// =====================================================================
import { html, mount, toast } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import { navigate } from '../router.js';
import { unlockAudio, preloadPiano, playNote, sleep } from '../audio.js';
import { midiToFreq } from '../music.js';
import { startMic, readPitch, freqToMidi, stopMic, micSupported } from '../pitch.js';
import {
  getProfile, getMyTrainers, saveEarResult, getEarResults, getProgramProgress, markProgramDay, getEarLeaderboard
} from '../data.js';
import { ACTIVITIES, activityById, runActivityQuiz } from '../ear/activities.js';
import { runQuiz, noteFr } from '../ear/engine.js';
import { PROGRAMS, programBySlug } from '../ear/programs.js';
import { playInstrument } from '../ear/sounds.js';
import { downloadCertificate } from '../ear/certificate.js';

const T = (k, v) => t('earp.' + k, v);
const isMissing = (err) => err?.code === '42P01' || err?.code === 'PGRST205';
const pad2 = (n) => String(n).padStart(2, '0');
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const pct = (c, n) => (n ? Math.round((c / n) * 100) : 0);
const titleOf = (a) => T('act')[a.id]?.title ?? t('ear.modes')[a.earMode]?.title ?? a.id;
const leadOf = (a) => T('act')[a.id]?.lead ?? t('ear.modes')[a.earMode]?.lead ?? '';

// Résultats de l'élève (vide si la base n'est pas encore prête)
export async function myResults(userId) {
  try { return { rows: await getEarResults(userId), ready: true }; }
  catch (err) { if (!isMissing(err)) console.error(err); return { rows: [], ready: !isMissing(err) }; }
}
// Niveau débloqué : le niveau suivant s'ouvre à 80 % de réussite
export function unlockedLevel(a, rows, staff) {
  if (staff) return a.levels;
  let best = 0;
  for (const r of rows) if (r.activity === a.id && r.level && r.correct / r.total >= 0.8) best = Math.max(best, r.level);
  return Math.min(a.levels, best + 1);
}

// Joue une activité (série de questions ou exercice avec micro / frappe)
async function runActivity(stage, a, opts) {
  unlockAudio();
  if (a.run) return a.run(stage, opts);
  return runActivityQuiz(stage, a, opts);
}

// Enregistre un résultat ; ne prétend jamais avoir réussi si la base refuse
export async function save(row) {
  const r = { ...row, day: localDay(), total: Math.max(1, row.total), correct: Math.min(row.correct, Math.max(1, row.total)) };
  try { return { saved: await saveEarResult(r) }; }
  catch (err) { if (!isMissing(err)) console.error(err); return { error: isMissing(err) ? T('not_ready') : t('errors.generic') }; }
}
export const savedNote = (s) => (s.saved ? html`<p class="small" style="color:var(--success);margin:8px 0 0">✓ ${T('saved')}</p>` : html`<p class="alert alert-info small" style="margin:8px 0 0">${T('not_saved')} ${s.error}</p>`);

// Série de jours consécutifs avec un défi
function streakOf(rows) {
  const days = new Set(rows.filter((r) => r.kind === 'defi').map((r) => r.day));
  const d = new Date();
  if (!days.has(localDay(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(localDay(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------------------------------------------------------------------
// Page « Oreille » : tout au même endroit
// ---------------------------------------------------------------------
export async function earHubPage() {
  const user = getUser();
  preloadPiano();
  const [{ rows }, profile, progress] = await Promise.all([myResults(user.id), getProfile(user.id).catch(() => null), getProgramProgress(user.id).catch(() => [])]);
  const staff = ['trainer', 'admin'].includes(profile?.role);
  const today = localDay();
  const doneToday = rows.find((r) => r.kind === 'defi' && r.day === today);
  const streak = streakOf(rows);
  const tile = (a) => {
    const mine = rows.filter((r) => r.activity === a.id);
    const best = mine.length ? Math.max(...mine.map((r) => pct(r.correct, r.total))) : null;
    return html`<a class="card ear-tile" href="#/oreille/activite/${a.id}">
      <span class="ear-tile-ico" aria-hidden="true">${a.icon}</span>
      <span><strong>${titleOf(a)}</strong><span class="muted small">${leadOf(a)}</span>
        <span class="small ear-tile-meta">${T('level_n', { n: unlockedLevel(a, rows, staff) })}/${a.levels}${best !== null ? ` · ${T('best', { p: best })}` : ''}</span></span></a>`;
  };
  const group = (cat) => ACTIVITIES.filter((a) => a.cat === cat);
  const doneDays = (slug) => progress.filter((p) => p.program === slug).length;
  mount(html`
    <div class="container dash">
      <div><p class="eyebrow">${T('eyebrow')}</p><h1>${T('title')}</h1><p class="muted" style="margin:0">${T('lead')}</p></div>
      <section class="sol-band ear-defi">
        <p class="sol-band-eb">${T('defi')} · ${streak ? T('streak', { n: streak }) : T('streak_none')}</p>
        <h2>${doneToday ? T('defi_done', { c: doneToday.correct, n: doneToday.total }) : T('defi_cta')}</h2>
        <p>${T('defi_lead')}</p>
        <a class="btn btn-sm" style="background:#fff;color:var(--blue-strong)" href="#/oreille/defi">${doneToday ? T('see_ranking') : T('defi_go')} →</a>
      </section>
      <h2 class="sol-h">${T('cat_ecoute')}</h2><div class="grid grid-2 ear-tiles">${group('ecoute').map(tile)}</div>
      <h2 class="sol-h">${T('cat_voix')}</h2><div class="grid grid-2 ear-tiles">${group('voix').map(tile)}</div>
      <h2 class="sol-h">${T('cat_rythme')}</h2><div class="grid grid-2 ear-tiles">${group('rythme').map(tile)}</div>
      <h2 class="sol-h">${T('cat_adaptatif')}</h2><p class="muted small" style="margin:-6px 0 0">${T('adaptatif_lead')}</p>
      <div class="grid grid-2 ear-tiles">${group('adaptatif').map(tile)}</div>
      <div class="grid grid-2">
        <a class="card ear-tile" href="#/oreille/examens"><span class="ear-tile-ico" aria-hidden="true">🎓</span>
          <span><strong>${T('exams')}</strong><span class="muted small">${T('exams_lead')}</span></span></a>
        <a class="card ear-tile" href="#/oreille/accordeur"><span class="ear-tile-ico" aria-hidden="true">🎚️</span>
          <span><strong>${T('tuner')}</strong><span class="muted small">${T('tuner_lead')}</span></span></a>
      </div>
      <h2 class="sol-h">${T('programs')}</h2>
      <div class="grid grid-2 ear-tiles">${PROGRAMS.map((p) => html`<a class="card ear-tile" href="#/oreille/programme/${p.slug}">
        <span class="ear-tile-ico" aria-hidden="true">${p.icon}</span>
        <span><strong>${T('program')[p.slug].title}</strong><span class="muted small">${T('program')[p.slug].lead}</span>
          <span class="bar" style="margin-top:6px"><span style="width:${pct(doneDays(p.slug), 30)}%"></span></span>
          <span class="small ear-tile-meta">${T('days_done', { n: doneDays(p.slug) })}</span></span></a>`)}</div>
      <div class="row"><a class="btn btn-ghost btn-sm" href="#/bibliotheque">📚 ${T('library')}</a><a class="btn btn-ghost btn-sm" href="#/programme">🗓 ${T('program7')}</a></div>
    </div>`);
}

// ---------------------------------------------------------------------
// Une activité : choix du niveau, puis exercice et résultat
// ---------------------------------------------------------------------
export async function earActivityPage({ id }) {
  const a = activityById(id);
  if (!a) return navigate('/oreille', { replace: true });
  const user = getUser();
  preloadPiano();
  const [{ rows }, profile] = await Promise.all([myResults(user.id), getProfile(user.id).catch(() => null)]);
  const staff = ['trainer', 'admin'].includes(profile?.role);
  const open = unlockedLevel(a, rows, staff);
  mount(html`
    <div class="container dash" style="max-width:760px">
      <div><a href="#/oreille" class="small">← ${T('title')}</a>
        <h1 style="margin:10px 0 4px">${a.icon} ${titleOf(a)}</h1><p class="muted" style="margin:0">${leadOf(a)}</p></div>
      <section class="card" id="ear-stage">
        <h2 style="font-size:1.1rem">${T('choose_level')}</h2>
        <div class="ear-levels">${Array.from({ length: a.levels }, (_, i) => i + 1).map((l) => html`
          <button type="button" class="ear-level ${l === open ? 'is-picked' : ''}" data-level="${l}" ${l > open ? html`disabled` : ''}>
            <span class="lib-n">${l > open ? '🔒' : l}</span><span>${T('lv')[a.id]?.[l - 1] ?? T('level_n', { n: l })}</span></button>`)}</div>
        ${a.run ? '' : html`<label class="sol-radio"><input type="checkbox" id="adaptive" ${a.adaptiveOnly ? html`checked disabled` : html`checked`}> ${T('adaptive_label')}</label>`}
        <p class="muted small" style="margin:6px 0 12px">${T('unlock_hint')}</p>
        <button class="btn btn-lg btn-block" type="button" id="ear-start">▶ ${T('start')}</button>
      </section>
    </div>`);
  let level = open;
  const stage = document.getElementById('ear-stage');
  stage.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => {
    level = Number(b.dataset.level);
    stage.querySelectorAll('[data-level]').forEach((x) => x.classList.toggle('is-picked', x === b));
  }));
  document.getElementById('ear-start').addEventListener('click', async () => {
    const adaptive = a.run ? false : document.getElementById('adaptive').checked;
    const started = Date.now();
    const r = await runActivity(stage, a, { level, adaptive, voice: profile?.voice_range ?? null });
    if (!document.contains(stage)) return;
    const s = await save({ activity: a.id, kind: 'activite', level, correct: r.correct, total: r.total, duration_seconds: Math.round((Date.now() - started) / 1000), details: { fin: r.level ?? level, items: (r.items ?? []).slice(0, 20) } });
    const p = pct(r.correct, r.total);
    stage.innerHTML = String(html`
      <h2 style="font-size:1.3rem;margin:0">${p >= 80 ? '🎉 ' : ''}${T('result', { c: r.correct, n: r.total, p })}</h2>
      ${adaptive && r.bestLevel > level ? html`<p style="margin:6px 0 0">${T('reached', { n: r.bestLevel })}</p>` : ''}
      ${p >= 80 && level < a.levels ? html`<p style="margin:6px 0 0">🔓 ${T('next_unlocked', { n: level + 1 })}</p>` : ''}
      ${savedNote(s)}
      <div class="row" style="margin-top:14px"><button class="btn" type="button" id="again">↻ ${T('again')}</button><a class="btn btn-ghost" href="#/oreille">${T('back_hub')}</a></div>`);
    document.getElementById('again').addEventListener('click', () => earActivityPage({ id }));
  });
}

// ---------------------------------------------------------------------
// Défi du jour : 5 questions variées, les mêmes thèmes pour tous ce jour-là
// ---------------------------------------------------------------------
const DEFI_POOL = [['adaptatif-interval', 1], ['adaptatif-interval', 2], ['adaptatif-chord', 1], ['adaptatif-chord', 2], ['adaptatif-scale', 1],
  ['adaptatif-degree', 1], ['cadences', 1], ['cadences', 2], ['dictee-rythmique', 1], ['dictee-rythmique', 2], ['instruments', 1], ['instruments', 2], ['dictee-melodique', 1]];
function defiOfDay(day) {
  let seed = [...day].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pool = [...DEFI_POOL];
  const out = [];
  while (out.length < 5) {
    const [id, level] = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    if (!out.some((x) => x.id === id)) out.push({ id, level });
  }
  return out;
}

export async function earChallengePage() {
  const user = getUser();
  preloadPiano();
  const { rows, ready } = await myResults(user.id);
  const today = localDay();
  const done = rows.filter((r) => r.kind === 'defi' && r.day === today).sort((a, b) => b.correct - a.correct)[0];
  const board = ready ? await getEarLeaderboard(7).catch(() => []) : [];
  const plan = defiOfDay(today);
  mount(html`
    <div class="container dash" style="max-width:760px">
      <div><a href="#/oreille" class="small">← ${T('title')}</a><h1 style="margin:10px 0 4px">⚡ ${T('defi')}</h1>
        <p class="muted" style="margin:0">${T('defi_rules')}</p></div>
      <div class="row" style="gap:8px"><span class="sol-tag sol-tag-ok">🔥 ${T('streak', { n: streakOf(rows) })}</span>
        ${done ? html`<span class="sol-tag">${T('defi_done', { c: done.correct, n: done.total })}</span>` : ''}</div>
      <section class="card" id="ear-stage">
        <p style="margin:0 0 6px"><strong>${T('defi_today')}</strong></p>
        <ul class="plain-list small">${plan.map((p) => html`<li>${activityById(p.id).icon} ${titleOf(activityById(p.id))}</li>`)}</ul>
        ${done ? html`<p class="muted small">${T('defi_replay_note')}</p>` : ''}
        <button class="btn btn-lg btn-block" type="button" id="ear-start">▶ ${done ? T('defi_replay') : T('defi_go')}</button>
      </section>
      <section class="card"><h2 style="font-size:1.1rem">🏆 ${T('ranking')}</h2>
        ${board.length ? html`<ol class="ear-board">${board.slice(0, 10).map((b) => html`<li class="${b.is_me ? 'is-me' : ''}"><span class="ear-rank">${b.rank}</span>
          <span style="flex:1">${b.name}${b.is_me ? ` (${T('you')})` : ''}</span><span class="muted small">${T('n_days', { n: b.days })}</span><strong>${b.points} pts</strong></li>`)}</ol>`
          : html`<p class="muted" style="margin:0">${ready ? T('ranking_empty') : T('not_ready')}</p>`}
      </section>
    </div>`);
  const stage = document.getElementById('ear-stage');
  document.getElementById('ear-start').addEventListener('click', async () => {
    unlockAudio();
    const started = Date.now();
    const r = await runQuiz(stage, { total: plan.length, showLevel: false, makeQuestion: (_, q) => activityById(plan[q - 1].id).quiz(plan[q - 1].level) });
    if (!document.contains(stage)) return;
    // Seul le premier défi du jour compte pour le classement
    const s = await save({ activity: 'defi', kind: done ? 'activite' : 'defi', correct: r.correct, total: r.total, duration_seconds: Math.round((Date.now() - started) / 1000), details: { items: r.items } });
    stage.innerHTML = String(html`<h2 style="font-size:1.3rem;margin:0">${T('defi_done', { c: r.correct, n: r.total })}</h2>
      <p style="margin:6px 0 0">${done ? T('defi_replay_note') : T('defi_points', { n: r.correct })}</p>${savedNote(s)}
      <div class="row" style="margin-top:14px"><a class="btn" href="#/oreille/defi">${T('see_ranking')}</a><a class="btn btn-ghost" href="#/oreille">${T('back_hub')}</a></div>`);
  });
}

// ---------------------------------------------------------------------
// Examens chronométrés et certificats
// ---------------------------------------------------------------------
const EXAMS = [
  { id: 'intervalles', acts: ['adaptatif-interval'], total: 20, minutes: 12 },
  { id: 'accords', acts: ['adaptatif-chord'], total: 20, minutes: 12 },
  { id: 'gammes', acts: ['adaptatif-scale'], total: 20, minutes: 12 },
  { id: 'degres', acts: ['adaptatif-degree'], total: 20, minutes: 12 },
  { id: 'suites', acts: ['adaptatif-progression', 'cadences'], total: 16, minutes: 14 },
  { id: 'dictee', acts: ['dictee-melodique'], total: 8, minutes: 12 },
  { id: 'rythme', acts: ['dictee-rythmique'], total: 12, minutes: 10 },
];
const examById = (id) => EXAMS.find((e) => e.id === id);

async function certificateData(result, user) {
  const [profile, trainers] = await Promise.all([getProfile(user.id).catch(() => null), getMyTrainers().catch(() => [])]);
  return {
    name: profile?.full_name ?? user.user_metadata?.full_name ?? user.email,
    module: T('exam')[result.activity.replace('examen-', '')] ?? result.activity,
    correct: result.correct, total: result.total,
    date: new Date(result.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    trainer: trainers?.[0]?.full_name ?? '',
    code: result.id.replace(/-/g, '').slice(0, 10).toUpperCase().replace(/(.{5})/, '$1-'),
  };
}
async function getCertificate(result, user, btn) {
  btn.disabled = true;
  try { await downloadCertificate(await certificateData(result, user)); toast(T('cert_ok'), 'success'); }
  catch (err) { console.error(err); toast(T('cert_error'), 'error'); }
  finally { btn.disabled = false; }
}

export async function earExamsPage() {
  const user = getUser();
  const { rows, ready } = await myResults(user.id);
  const passed = rows.filter((r) => r.kind === 'examen' && r.passed);
  mount(html`
    <div class="container dash" style="max-width:760px">
      <div><a href="#/oreille" class="small">← ${T('title')}</a><h1 style="margin:10px 0 4px">🎓 ${T('exams')}</h1>
        <p class="muted" style="margin:0">${T('exams_rules')}</p></div>
      ${ready ? '' : html`<div class="alert alert-info">${T('not_ready')}</div>`}
      <div class="grid grid-2">${EXAMS.map((e) => {
        const ok = passed.find((r) => r.activity === `examen-${e.id}`);
        return html`<a class="card ear-tile" href="#/oreille/examen/${e.id}"><span class="ear-tile-ico" aria-hidden="true">${ok ? '🏅' : '📝'}</span>
          <span><strong>${T('exam')[e.id]}</strong><span class="muted small">${T('exam_meta', { n: e.total, m: e.minutes })}</span>
          ${ok ? html`<span class="small" style="color:var(--success)">✓ ${T('passed_on', { d: new Date(ok.created_at).toLocaleDateString('fr-FR') })}</span>` : ''}</span></a>`;
      })}</div>
      <section class="card"><h2 style="font-size:1.1rem">${T('my_certs')}</h2>
        ${passed.length ? html`<ul class="res-list" id="certs">${passed.map((r) => html`<li class="res-item"><div class="res-head"><span class="sol-ico" aria-hidden="true">🏅</span>
          <div style="flex:1"><strong>${T('exam')[r.activity.replace('examen-', '')] ?? r.activity}</strong><div class="muted small">${r.correct}/${r.total} · ${new Date(r.created_at).toLocaleDateString('fr-FR')}</div></div>
          <button class="btn btn-sm" type="button" data-cert="${r.id}">⬇ ${T('cert_pdf')}</button></div></li>`)}</ul>`
          : html`<p class="muted" style="margin:0">${T('no_certs')}</p>`}
      </section>
    </div>`);
  document.getElementById('certs')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cert]');
    if (b) getCertificate(passed.find((r) => r.id === b.dataset.cert), user, b);
  });
}

export async function earExamPage({ id }) {
  const exam = examById(id);
  if (!exam) return navigate('/oreille/examens', { replace: true });
  const user = getUser();
  preloadPiano();
  mount(html`
    <div class="container dash" style="max-width:760px">
      <div><a href="#/oreille/examens" class="small">← ${T('exams')}</a><h1 style="margin:10px 0 4px">📝 ${T('exam_title', { m: T('exam')[id] })}</h1></div>
      <section class="card" id="ear-stage">
        <ul class="plain-list"><li>❓ ${T('exam_r1', { n: exam.total })}</li><li>⏱ ${T('exam_r2', { m: exam.minutes })}</li><li>🎯 ${T('exam_r3')}</li><li>🏅 ${T('exam_r4')}</li></ul>
        <button class="btn btn-lg btn-block" type="button" id="ear-start">▶ ${T('exam_start')}</button>
      </section>
    </div>`);
  const stage = document.getElementById('ear-stage');
  document.getElementById('ear-start').addEventListener('click', async () => {
    unlockAudio();
    const started = Date.now();
    // Les questions deviennent plus difficiles (niveaux 1, 2 puis 3)
    const r = await runQuiz(stage, {
      total: exam.total, timeLimit: exam.minutes * 60, showLevel: false,
      makeQuestion: (_, q) => {
        const a = activityById(exam.acts[(q - 1) % exam.acts.length]);
        return a.quiz(Math.min(a.levels, 1 + Math.floor(((q - 1) * 3) / exam.total)));
      },
    });
    if (!document.contains(stage)) return;
    const passedExam = r.correct * 100 >= exam.total * 70;
    const s = await save({ activity: `examen-${id}`, kind: 'examen', correct: r.correct, total: exam.total, passed: passedExam, duration_seconds: Math.round((Date.now() - started) / 1000), details: { temps_ecoule: r.timedOut } });
    stage.innerHTML = String(html`
      <h2 style="font-size:1.4rem;margin:0">${passedExam ? '🏅 ' + T('exam_pass') : T('exam_fail')}</h2>
      <p style="margin:6px 0 0">${T('result', { c: r.correct, n: exam.total, p: pct(r.correct, exam.total) })}${r.timedOut ? ' · ' + T('time_up') : ''}</p>
      ${savedNote(s)}
      <div class="row" style="margin-top:14px">
        ${passedExam && s.saved ? html`<button class="btn" type="button" id="cert">⬇ ${T('cert_pdf')}</button>` : html`<a class="btn" href="#/oreille/examen/${id}">↻ ${T('exam_retry')}</a>`}
        <a class="btn btn-ghost" href="#/oreille/examens">${T('exams')}</a></div>`);
    document.getElementById('cert')?.addEventListener('click', (e) => getCertificate(s.saved, user, e.currentTarget));
  });
}

// ---------------------------------------------------------------------
// Programmes de 30 jours
// ---------------------------------------------------------------------
export async function earProgramPage({ slug }) {
  const p = programBySlug(slug);
  if (!p) return navigate('/oreille', { replace: true });
  const user = getUser();
  const progress = await getProgramProgress(user.id).catch((err) => { if (!isMissing(err)) console.error(err); return null; });
  const done = new Set((progress ?? []).filter((x) => x.program === slug).map((x) => x.day));
  const nextDay = p.days.find((d) => !done.has(d.day))?.day ?? null;
  mount(html`
    <div class="container dash" style="max-width:760px">
      <div><a href="#/oreille" class="small">← ${T('title')}</a><h1 style="margin:10px 0 4px">${p.icon} ${T('program')[slug].title}</h1>
        <p class="muted" style="margin:0">${T('program')[slug].lead}</p>
        <div class="bar" style="margin-top:10px"><span style="width:${pct(done.size, 30)}%"></span></div>
        <p class="small muted" style="margin:6px 0 0">${T('days_done', { n: done.size })}</p></div>
      ${progress === null ? html`<div class="alert alert-info">${T('not_ready')}</div>` : ''}
      ${nextDay ? html`<a class="btn btn-lg" href="#/oreille/programme/${slug}/${nextDay}">▶ ${T('day_n', { n: nextDay })}</a>` : html`<div class="alert alert-success">🎉 ${T('program_done')}</div>`}
      <section class="card"><ol class="ear-days">${p.days.map((d) => {
        const ok = done.has(d.day);
        const open = ok || d.day === nextDay;
        return html`<li class="${ok ? 'is-done' : ''}">${open ? html`<a href="#/oreille/programme/${slug}/${d.day}">` : ''}
          <span class="sol-dot ${ok ? 'is-done' : ''}">${ok ? '✓' : open ? d.day : '🔒'}</span>
          <span><strong>${T('day_n', { n: d.day })}</strong><span class="muted small"> · ${d.steps.map((s) => titleOf(activityById(s.activity))).join(', ')}</span></span>
          ${open ? html`</a>` : ''}</li>`;
      })}</ol></section>
    </div>`);
}

export async function earProgramDayPage({ slug, day }) {
  const p = programBySlug(slug);
  const d = p?.days.find((x) => x.day === Number(day));
  if (!d) return navigate('/oreille', { replace: true });
  const user = getUser();
  preloadPiano();
  const profile = await getProfile(user.id).catch(() => null);
  mount(html`
    <div class="container dash" style="max-width:760px">
      <div><a href="#/oreille/programme/${slug}" class="small">← ${T('program')[slug].title}</a><h1 style="margin:10px 0 4px">${T('day_n', { n: d.day })}</h1>
        <p class="muted" style="margin:0">${T('day_steps', { n: d.steps.length })}</p></div>
      <section class="card" id="ear-stage">
        <ol class="plain-list">${d.steps.map((s) => html`<li>${activityById(s.activity).icon} ${titleOf(activityById(s.activity))} · ${T('level_n', { n: s.level })}</li>`)}</ol>
        <button class="btn btn-lg btn-block" type="button" id="ear-start">▶ ${T('start')}</button>
      </section>
    </div>`);
  const stage = document.getElementById('ear-stage');
  document.getElementById('ear-start').addEventListener('click', async () => {
    const results = [];
    for (let i = 0; i < d.steps.length; i++) {
      const s = d.steps[i];
      const a = activityById(s.activity);
      stage.innerHTML = String(html`<p class="eyebrow">${T('step_n', { n: i + 1, total: d.steps.length })} · ${titleOf(a)}</p><div id="ear-step"></div>`);
      const zone = document.getElementById('ear-step');
      const started = Date.now();
      const r = await runActivity(zone, a, { level: s.level, adaptive: false, total: s.questions, voice: profile?.voice_range ?? null });
      if (!document.contains(stage)) return;
      results.push(await save({ activity: a.id, kind: 'programme', level: s.level, correct: r.correct, total: r.total, duration_seconds: Math.round((Date.now() - started) / 1000), details: { programme: slug, jour: d.day } }));
      results[i].score = r;
    }
    let marked = true;
    try { await markProgramDay(slug, d.day); } catch (err) { marked = false; if (!isMissing(err)) console.error(err); }
    const c = results.reduce((x, r) => x + r.score.correct, 0);
    const n = results.reduce((x, r) => x + r.score.total, 0);
    stage.innerHTML = String(html`<h2 style="font-size:1.3rem;margin:0">🎉 ${T('day_done', { n: d.day })}</h2>
      <p style="margin:6px 0 0">${T('result', { c, n, p: pct(c, n) })}</p>
      ${marked ? html`<p class="small" style="color:var(--success);margin:8px 0 0">✓ ${T('saved')}</p>` : html`<p class="alert alert-info small">${T('not_saved')} ${T('not_ready')}</p>`}
      <div class="row" style="margin-top:14px"><a class="btn" href="#/oreille/programme/${slug}">${T('program')[slug].title}</a></div>`);
  });
}

// ---------------------------------------------------------------------
// Accordeur (micro) et diapason
// ---------------------------------------------------------------------
const GUITAR = [40, 45, 50, 55, 59, 64];
export function earTunerPage() {
  preloadPiano();
  mount(html`
    <div class="container dash" style="max-width:760px">
      <div><a href="#/oreille" class="small">← ${T('title')}</a><h1 style="margin:10px 0 4px">🎚️ ${T('tuner')}</h1><p class="muted" style="margin:0">${T('tuner_lead')}</p></div>
      <section class="card">
        <h2 style="font-size:1.1rem">${T('fork')}</h2>
        <div class="row"><button class="btn" type="button" data-fork="440">🔔 ${T('la440')}</button></div>
        <p class="small muted" style="margin:12px 0 6px">${T('ref_notes')}</p>
        <div class="row">${[60, 62, 64, 65, 67, 69, 71, 72].map((m) => html`<button class="btn btn-ghost btn-sm" type="button" data-ref="${m}">${noteFr(m)}</button>`)}</div>
        <p class="small muted" style="margin:12px 0 6px">${T('guitar_strings')}</p>
        <div class="row">${GUITAR.map((m, i) => html`<button class="btn btn-ghost btn-sm" type="button" data-string="${m}">${6 - i} · ${noteFr(m)}</button>`)}</div>
      </section>
      <section class="card">
        <h2 style="font-size:1.1rem">${T('tuner_mic')}</h2>
        <div class="tuner">
          <div class="tuner-note" id="tn-note" aria-live="polite">–</div>
          <div class="muted small center" id="tn-freq">&nbsp;</div>
          <div class="tuner-track" aria-hidden="true"><div class="tuner-zone" style="left:45%;width:10%"></div><div class="tuner-center"></div>
            <div class="tuner-needle" id="tn-needle" style="left:50%"></div><span class="tuner-lbl l">${t('ex.mic.lower')}</span><span class="tuner-lbl r">${t('ex.mic.higher')}</span></div>
          <p class="tuner-status" id="tn-status">${micSupported() ? T('tuner_start_hint') : t('ex.mic.problem_unsupported')}</p>
        </div>
        <button class="btn btn-block" type="button" id="tn-toggle" ${micSupported() ? '' : html`disabled`}>🎤 ${T('tuner_start')}</button>
      </section>
    </div>`);
  const root = document.querySelector('.container.dash');
  root.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-fork]'), r = e.target.closest('[data-ref]'), s = e.target.closest('[data-string]');
    if (f) {
      const o = unlockAudio(); if (!o) return;
      const osc = o.createOscillator(); const g = o.createGain();
      osc.frequency.value = 440; g.gain.setValueAtTime(0.0001, o.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, o.currentTime + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, o.currentTime + 3);
      osc.connect(g).connect(o.destination); osc.start(); osc.stop(o.currentTime + 3.1);
    }
    if (r) playNote(Number(r.dataset.ref), { duration: 2 });
    if (s) playInstrument('guitare', Number(s.dataset.string) + 12, 0, 2.5);
  });
  let running = false;
  const btn = document.getElementById('tn-toggle');
  btn.addEventListener('click', async () => {
    if (running) { running = false; return; }
    const status = await startMic();
    if (status !== 'ok') { document.getElementById('tn-status').textContent = t('ex.mic.problem_' + status); return; }
    running = true;
    btn.textContent = `⏹ ${T('tuner_stop')}`;
    while (running && document.contains(btn)) {
      await sleep(60);
      const p = readPitch();
      if (!p || p.clarity < 0.85) continue;
      const midiF = freqToMidi(p.freq);
      const midi = Math.round(midiF);
      const cents = Math.round((midiF - midi) * 100);
      document.getElementById('tn-note').textContent = `${noteFr(midi)}${Math.floor(midi / 12) - 1}`;
      document.getElementById('tn-freq').textContent = `${p.freq.toFixed(1)} Hz (${T('target_hz', { f: midiToFreq(midi).toFixed(1) })})`;
      const needle = document.getElementById('tn-needle');
      needle.style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
      needle.classList.toggle('is-ok', Math.abs(cents) <= 5);
      document.getElementById('tn-status').textContent = Math.abs(cents) <= 5 ? T('in_tune') : cents < 0 ? T('too_low', { c: -cents }) : T('too_high', { c: cents });
    }
    stopMic();
    if (document.contains(btn)) btn.textContent = `🎤 ${T('tuner_start')}`;
  });
}
