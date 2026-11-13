// =====================================================================
// Harmonie (8 leçons avec exercices) et Accords au piano (dictionnaire
// d'accords sur un clavier + 4 entraînements). Les résultats vont dans
// la même table que l'oreille musicale (ear_results).
// =====================================================================
import { html, mount } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import { navigate } from '../router.js';
import { unlockAudio, preloadPiano, playNote, sleep } from '../audio.js';
import { getProfile } from '../data.js';
import { runQuiz } from '../ear/engine.js';
import { myResults, unlockedLevel, save, savedNote } from './ear-hub.js';
import { LESSONS, lessonById, chordName, notesLine, hearChord } from '../harmony/lessons.js';
import { PRACTICE, practiceById, keyboardFor, markKeys, rootMidi } from '../harmony/practice.js';
import { chord, invert, voiced, spell, rootKey, rootFromKey, ROOTS, TYPE_IDS, CHORD_TYPES } from '../harmony/theory.js';

const H = (k, v) => t('harm.' + k, v);
const C = (k, v) => t('chords.' + k, v);
const pct = (c, n) => (n ? Math.round((c / n) * 100) : 0);

// Titre et description d'une activité d'harmonie ou d'accords
export const harmonyText = (id) => H('lesson')[id] ?? C('practice')[id] ?? null;
export const HARMONY_ACTIVITIES = [...LESSONS, ...PRACTICE];

// Tuile : niveau débloqué et meilleur score
function tile(a, rows, staff, href) {
  const mine = rows.filter((r) => r.activity === a.id);
  const best = mine.length ? Math.max(...mine.map((r) => pct(r.correct, r.total))) : null;
  const tx = harmonyText(a.id);
  return html`<a class="card ear-tile" href="${href}">
    <span class="ear-tile-ico" aria-hidden="true">${a.icon}</span>
    <span><strong>${tx.title}</strong><span class="muted small">${tx.lead}</span>
      <span class="small ear-tile-meta">${t('earp.level_n', { n: unlockedLevel(a, rows, staff) })}/${a.levels}${best !== null ? ` · ${t('earp.best', { p: best })}` : ''}</span></span></a>`;
}

async function loadContext() {
  const user = getUser();
  preloadPiano();
  const [{ rows }, profile] = await Promise.all([myResults(user.id), getProfile(user.id).catch(() => null)]);
  return { rows, profile, staff: ['trainer', 'admin'].includes(profile?.role) };
}

// ---------------------------------------------------------------------
// Page « Harmonie »
// ---------------------------------------------------------------------
export async function harmonyHubPage() {
  const { rows, staff } = await loadContext();
  mount(html`
    <div class="container dash">
      <div><p class="eyebrow">${H('eyebrow')}</p><h1>🎼 ${H('title')}</h1><p class="muted" style="margin:0">${H('lead')}</p></div>
      <h2 class="sol-h">${H('lessons')}</h2>
      <div class="grid grid-2 ear-tiles">${LESSONS.map((a) => tile(a, rows, staff, `#/harmonie/lecon/${a.id}`))}</div>
      <a class="card ear-tile" href="#/accords"><span class="ear-tile-ico" aria-hidden="true">🎹</span>
        <span><strong>${C('title')}</strong><span class="muted small">${C('lead')}</span></span></a>
    </div>`);
}

// ---------------------------------------------------------------------
// Choix du niveau, exercice et résultat (leçons et entraînements)
// ---------------------------------------------------------------------
function exerciseCard(stage, a, { rows, staff, profile, back, backLabel, onAgain }) {
  const open = unlockedLevel(a, rows, staff);
  const names = harmonyText(a.id).levels ?? [];
  stage.innerHTML = String(html`
    <h2 style="font-size:1.1rem">${t('earp.choose_level')}</h2>
    <div class="ear-levels">${Array.from({ length: a.levels }, (_, i) => i + 1).map((l) => html`
      <button type="button" class="ear-level ${l === open ? 'is-picked' : ''}" data-level="${l}" ${l > open ? html`disabled` : ''}>
        <span class="lib-n">${l > open ? '🔒' : l}</span><span>${names[l - 1] ?? t('earp.level_n', { n: l })}</span></button>`)}</div>
    ${a.ordered ? '' : html`<label class="sol-radio"><input type="checkbox" id="adaptive" checked> ${t('earp.adaptive_label')}</label>`}
    <p class="muted small" style="margin:6px 0 12px">${t('earp.unlock_hint')}</p>
    <button class="btn btn-lg btn-block" type="button" id="ear-start">▶ ${t('earp.start')}</button>`);
  let level = open;
  stage.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => {
    level = Number(b.dataset.level);
    stage.querySelectorAll('[data-level]').forEach((x) => x.classList.toggle('is-picked', x === b));
  }));
  stage.querySelector('#ear-start').addEventListener('click', async () => {
    unlockAudio();
    const adaptive = !a.ordered && stage.querySelector('#adaptive').checked;
    const started = Date.now();
    const r = await runQuiz(stage, { makeQuestion: (l, q) => a.quiz(l, q), total: a.questions, level, maxLevel: a.levels, adaptive });
    if (!document.contains(stage)) return;
    const s = await save({ activity: a.id, kind: 'activite', level, correct: r.correct, total: r.total, duration_seconds: Math.round((Date.now() - started) / 1000), details: { fin: r.level ?? level, items: (r.items ?? []).slice(0, 20) } });
    const p = pct(r.correct, r.total);
    stage.innerHTML = String(html`
      <h2 style="font-size:1.3rem;margin:0">${p >= 80 ? '🎉 ' : ''}${t('earp.result', { c: r.correct, n: r.total, p })}</h2>
      ${adaptive && r.bestLevel > level ? html`<p style="margin:6px 0 0">${t('earp.reached', { n: r.bestLevel })}</p>` : ''}
      ${p >= 80 && level < a.levels ? html`<p style="margin:6px 0 0">🔓 ${t('earp.next_unlocked', { n: level + 1 })}</p>` : ''}
      ${savedNote(s)}
      <div class="row" style="margin-top:14px"><button class="btn" type="button" id="again">↻ ${t('earp.again')}</button><a class="btn btn-ghost" href="${back}">${backLabel}</a></div>`);
    stage.querySelector('#again').addEventListener('click', onAgain);
  });
}

// Joue un exemple sans en lancer deux en même temps
function exampleButtons(zone, examples) {
  let busy = false;
  zone.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-example]');
    if (!b || busy) return;
    busy = true;
    unlockAudio();
    b.classList.add('is-picked');
    try { await examples[Number(b.dataset.example)].play(); } finally { busy = false; b.classList.remove('is-picked'); }
  });
}

// ---------------------------------------------------------------------
// Une leçon d'harmonie : explication + exemples à écouter + exercices
// ---------------------------------------------------------------------
export async function harmonyLessonPage({ id }) {
  const a = lessonById(id);
  if (!a) return navigate('/harmonie', { replace: true });
  const ctx = await loadContext();
  const tx = harmonyText(id);
  const examples = a.examples();
  mount(html`
    <div class="container dash" style="max-width:760px">
      <div><a href="#/harmonie" class="small">← ${H('title')}</a>
        <h1 style="margin:10px 0 4px">${a.icon} ${tx.title}</h1><p class="muted" style="margin:0">${tx.lead}</p></div>
      <section class="card harm-lesson">
        <p class="eyebrow" style="margin:0 0 6px">📖 ${H('lesson_label')}</p>
        ${tx.body.map((p) => html`<p>${p}</p>`)}
        <p class="small muted" style="margin:12px 0 6px">${H('listen')}</p>
        <div class="row" id="harm-examples" style="gap:8px">${examples.map((e, i) => html`<button class="btn btn-ghost btn-sm" type="button" data-example="${i}">▶ ${e.label}</button>`)}</div>
      </section>
      <h2 class="sol-h">✍️ ${H('practice')}</h2>
      <section class="card" id="ear-stage"></section>
    </div>`);
  exampleButtons(document.getElementById('harm-examples'), examples);
  exerciseCard(document.getElementById('ear-stage'), a, { ...ctx, back: '#/harmonie', backLabel: H('back'), onAgain: () => harmonyLessonPage({ id }) });
}

// ---------------------------------------------------------------------
// Page « Accords au piano »
// ---------------------------------------------------------------------
const pick = { root: '00', type: 'maj', inv: 0 };
export async function chordsPage() {
  const { rows, staff } = await loadContext();
  mount(html`
    <div class="container dash" style="max-width:860px">
      <div><p class="eyebrow">${H('eyebrow')}</p><h1>🎹 ${C('title')}</h1><p class="muted" style="margin:0">${C('lead')}</p></div>
      <section class="card" id="chord-box">
        <p class="small muted" style="margin:0 0 6px">${C('root')}</p>
        <div class="sol-chips" role="group" aria-label="${C('root')}">${ROOTS.map((r) => html`<button type="button" class="sol-chip" data-root="${rootKey(r)}">${spell(r)}</button>`)}</div>
        <p class="small muted" style="margin:14px 0 6px">${C('type')}</p>
        <div class="sol-chips" role="group" aria-label="${C('type')}">${TYPE_IDS.map((ty) => html`<button type="button" class="sol-chip" data-type="${ty}">${C('type_chip')[ty]}</button>`)}</div>
        <div id="chord-view" aria-live="polite"></div>
        <div class="row" style="margin-top:12px;gap:8px">
          <button class="btn btn-sm" type="button" data-play="block">▶ ${C('listen')}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-play="arp">${C('arpeggio')}</button>
          <button class="btn btn-ghost btn-sm" type="button" id="chord-inv">↻ ${C('next_inv')}</button>
        </div>
      </section>
      <h2 class="sol-h">${C('train')}</h2>
      <div class="grid grid-2 ear-tiles">${PRACTICE.map((a) => tile(a, rows, staff, `#/accords/entrainement/${a.id}`))}</div>
      <a class="btn btn-ghost btn-sm" href="#/harmonie" style="justify-self:start">🎼 ${H('title')} →</a>
    </div>`);
  const box = document.getElementById('chord-box');
  const view = document.getElementById('chord-view');
  const current = () => {
    const r = rootFromKey(pick.root) ?? ROOTS[0];
    const c = chord(r, pick.type, rootMidi(r));
    const n = pick.inv % c.midis.length;
    const midis = invert(c.midis, n);
    const names = midis.map((m) => c.names[c.midis.findIndex((x) => x % 12 === m % 12)]);
    return { c, n, midis, names };
  };
  const render = () => {
    const { c, n, midis, names } = current();
    box.querySelectorAll('[data-root]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.root === pick.root)));
    box.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === pick.type)));
    view.innerHTML = String(html`
      <h2 style="margin:16px 0 0">${chordName(c)} <span class="muted">(${c.symbol})</span></h2>
      <p class="muted small" style="margin:2px 0 4px">${notesLine(c.names)} · ${C('formula')} ${CHORD_TYPES[c.type].formula}</p>
      <p class="small" style="margin:0 0 8px"><span class="sol-tag">${C('inv')[n]}</span> ${n ? C('bass_note', { note: names[0] }) : ''}</p>
      ${keyboardFor(midis).view}`);
    markKeys(view, midis, names);
  };
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-root], [data-type], [data-play], #chord-inv, [data-key]');
    if (!b) return;
    unlockAudio();
    if (b.dataset.root) { pick.root = b.dataset.root; pick.inv = 0; render(); }
    else if (b.dataset.type) { pick.type = b.dataset.type; pick.inv = 0; render(); }
    else if (b.id === 'chord-inv') { pick.inv++; render(); const { midis } = current(); await hearChord(midis, { arp: false }); return; }
    else if (b.dataset.key) { playNote(Number(b.dataset.key), { duration: 0.8 }); return; }
    else if (b.dataset.play) {
      const { midis } = current();
      if (b.dataset.play === 'arp') { midis.forEach((m, i) => playNote(m, { when: i * 0.35, duration: 0.8 })); await sleep(midis.length * 350 + 400); }
      else await hearChord(pick.inv % midis.length ? midis : voiced(current().c), { arp: false });
      return;
    }
    hearChord(current().midis, { arp: false });
  });
  render();
}

export async function chordsPracticePage({ id }) {
  const a = practiceById(id);
  if (!a) return navigate('/accords', { replace: true });
  const ctx = await loadContext();
  const tx = harmonyText(id);
  mount(html`
    <div class="container dash" style="max-width:760px">
      <div><a href="#/accords" class="small">← ${C('title')}</a>
        <h1 style="margin:10px 0 4px">${a.icon} ${tx.title}</h1><p class="muted" style="margin:0">${tx.lead}</p></div>
      <section class="card" id="ear-stage"></section>
    </div>`);
  exerciseCard(document.getElementById('ear-stage'), a, { ...ctx, back: '#/accords', backLabel: C('back'), onAgain: () => chordsPracticePage({ id }) });
}
