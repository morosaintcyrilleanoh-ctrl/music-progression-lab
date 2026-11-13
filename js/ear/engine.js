// =====================================================================
// Oreille+ : moteur commun des nouvelles activités
// (questions, difficulté qui s'adapte, chronomètre d'examen, clavier,
// portée et rythmes dessinés, enregistrement des résultats)
// =====================================================================
import { html, raw } from '../ui.js';
import { t } from '../i18n.js';
import { playNote, sleep } from '../audio.js';
import { NOTE_NAMES_FR } from '../music.js';
import { askChoice, feedback, next, counter, set, waitAction } from '../exercises/common.js';

export const noteFr = (midi) => NOTE_NAMES_FR[((midi % 12) + 12) % 12];

// ---------------------------------------------------------------------
// Une série de questions. Chaque question :
//   { prompt, play(), choices: [{ value, label }], answer, explain(value), tip, compare(value) }
// ou { prompt, play(), ask(zone) → { ok, given, text } } (réponse personnalisée : clavier…)
// adaptive : 3 bonnes réponses de suite → niveau +1 ; 2 erreurs de suite → niveau −1
// timeLimit (secondes) : chronomètre d'examen ; à zéro, les questions restantes comptent faux
// ---------------------------------------------------------------------
export async function runQuiz(stage, { makeQuestion, total, level = 1, maxLevel = 1, adaptive = false, timeLimit = 0, showLevel = true }) {
  const res = { correct: 0, total, level, startLevel: level, bestLevel: level, items: [], timedOut: false };
  set(stage, html`<div class="ear-head"><div data-z="counter" style="flex:1"></div><span data-z="level" class="sol-tag"></span><span data-z="timer" class="sol-tag" hidden></span></div>
    <p class="ex-prompt" data-z="prompt"></p><div data-z="answer"></div><div data-z="feedback"></div>`);
  const z = (n) => stage.querySelector(`[data-z="${n}"]`);
  const deadline = timeLimit ? Date.now() + timeLimit * 1000 : 0;
  let timer = null;
  if (deadline) {
    z('timer').hidden = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (z('timer')) z('timer').textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      if (!left || !document.contains(stage)) clearInterval(timer);
    };
    tick();
    timer = setInterval(tick, 500);
  }
  const timeUp = () => deadline && Date.now() >= deadline;
  let okRun = 0, koRun = 0;
  try {
    for (let q = 1; q <= total; q++) {
      if (!document.contains(stage)) break;
      if (timeUp()) { res.timedOut = true; break; }
      counter(z('counter'), q, total);
      z('level').textContent = showLevel ? t('earp.level_n', { n: res.level }) : '';
      z('level').hidden = !showLevel;
      set(z('feedback'), '');
      const Q = await makeQuestion(res.level, q);
      z('prompt').textContent = Q.prompt;
      set(z('answer'), html`<p class="muted center">${t('ex.listening')}</p>`);
      await Q.play();
      let ok, given, text, picked;
      if (Q.ask) {
        ({ ok, given, text } = await Q.ask(z('answer'), { replay: Q.play }));
      } else {
        const { value } = await askChoice(z('answer'), Q.choices, { onReplay: Q.play });
        picked = value;
        ok = value === String(Q.answer);
        // text : nom de la réponse en clair (label peut être un dessin)
        const label = (v) => { const c = Q.choices.find((x) => x.value === String(v)); return c?.text ?? String(c?.label ?? ''); };
        text = Q.explain ? Q.explain(Q.answer) : '';
        if (!ok) text = `${t('ear.you_said', { b: label(value) })} ${text}`;
        given = label(value);
        Q.title = ok ? `${t('ex.correct')} — ${label(Q.answer)}` : t('ear.wrong_title', { a: label(Q.answer) });
      }
      if (timeUp()) { res.timedOut = true; break; }
      feedback(z('feedback'), { ok, title: Q.title ?? (ok ? t('ex.correct') : t('earp.wrong')), text, tip: ok ? null : Q.tip });
      if (!ok && Q.compare && !Q.ask) {
        const cmp = document.createElement('div');
        cmp.className = 'ear-compare';
        cmp.innerHTML = String(html`<span class="muted small">${t('ear.compare')}</span>
          <button class="btn btn-ghost btn-sm" type="button" data-cmp="good">${t('ear.hear_good')}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-cmp="yours">${t('ear.hear_yours')}</button>`);
        let busy = false;
        cmp.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-cmp]');
          if (!b || busy) return;
          busy = true;
          try { await Q.compare(b.dataset.cmp === 'good' ? String(Q.answer) : picked); } finally { busy = false; }
        });
        z('feedback').appendChild(cmp);
      }
      if (ok) res.correct++;
      res.items.push({ q, level: res.level, ok, prompt: Q.prompt.slice(0, 80) });
      // Difficulté qui s'adapte
      if (adaptive) {
        if (ok) { okRun++; koRun = 0; } else { koRun++; okRun = 0; }
        let msg = null;
        if (okRun >= 3 && res.level < maxLevel) { res.level++; okRun = 0; msg = t('earp.level_up', { n: res.level }); }
        if (koRun >= 2 && res.level > 1) { res.level--; koRun = 0; msg = t('earp.level_down', { n: res.level }); }
        res.bestLevel = Math.max(res.bestLevel, res.level);
        if (msg) z('feedback').insertAdjacentHTML('beforeend', String(html`<p class="ear-level-msg">${msg}</p>`));
      }
      await next(z('feedback'), q === total ? t('ex.finish') : t('ex.next'), { onReplay: Q.play });
    }
  } finally {
    clearInterval(timer);
  }
  return res;
}

// Mélange (Fisher-Yates)
export function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------------------------------------------------------------
// Clavier de piano à l'écran (Do à Do, avec les touches noires)
// ---------------------------------------------------------------------
const BLACK = new Set([1, 3, 6, 8, 10]);
export function keyboardHtml(low = 60, high = 72, { names = true } = {}) {
  const whites = [];
  for (let m = low; m <= high; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const w = 100 / whites.length;
  const blacks = [];
  for (let m = low; m <= high; m++) {
    if (!BLACK.has(m % 12)) continue;
    const idx = whites.findIndex((x) => x > m);
    blacks.push({ m, left: idx * w - w * 0.32 });
  }
  return html`<div class="ear-keys" role="group" aria-label="${t('earp.keyboard')}">
    ${whites.map((m) => html`<button type="button" class="ear-key white" data-key="${m}" aria-label="${noteFr(m)}"><span>${names ? noteFr(m) : ''}</span></button>`)}
    ${blacks.map((b) => html`<button type="button" class="ear-key black" data-key="${b.m}" aria-label="${noteFr(b.m)}" style="left:${b.left}%;width:${w * 0.64}%"></button>`)}
  </div>`;
}

// Dictée : l'élève retrouve `notes` au clavier (la première est donnée)
export function keyboardDictation(notes, { low = 60, high = 72 } = {}) {
  return async (zone, { replay }) => {
    const answer = [notes[0]];
    const render = () => {
      zone.querySelector('[data-slots]').innerHTML = String(html`${notes.map((n, i) => html`<span class="ear-slot ${i < answer.length ? 'is-filled' : ''} ${i === 0 ? 'is-given' : ''}">${i < answer.length ? noteFr(answer[i]) : '?'}</span>`)}`);
      zone.querySelector('[data-action="check"]').disabled = answer.length < notes.length;
      zone.querySelector('[data-action="undo"]').disabled = answer.length <= 1;
    };
    set(zone, html`<p class="small muted center" style="margin:0 0 8px">${t('earp.dictation_hint')}</p>
      <div class="ear-slots" data-slots></div>
      ${keyboardHtml(low, high)}
      <div class="row" style="justify-content:center;margin-top:12px">
        <button class="btn btn-ghost btn-sm" type="button" data-action="replay">↻ ${t('ex.replay')}</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="undo">⌫ ${t('earp.undo')}</button>
        <button class="btn" type="button" data-action="check">${t('earp.check')}</button>
      </div>`);
    render();
    const onKey = (e) => {
      const k = e.target.closest('[data-key]');
      if (!k) return;
      const m = Number(k.dataset.key);
      playNote(m, { duration: 0.6 });
      if (answer.length < notes.length) { answer.push(m); render(); }
    };
    zone.addEventListener('click', onKey);
    for (;;) {
      const a = await waitAction(zone, ['replay', 'undo', 'check'], { Enter: 'check' });
      if (a === 'replay') { await replay(); continue; }
      if (a === 'undo') { if (answer.length > 1) answer.pop(); render(); continue; }
      if (answer.length < notes.length) continue;
      break;
    }
    zone.removeEventListener('click', onKey);
    zone.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const okEach = notes.map((n, i) => answer[i] === n);
    zone.querySelector('[data-slots]').innerHTML = String(html`${notes.map((n, i) => html`<span class="ear-slot ${okEach[i] ? 'is-ok' : 'is-ko'}">${noteFr(answer[i])}${okEach[i] ? '' : html`<small>→ ${noteFr(n)}</small>`}</span>`)}`);
    const ok = okEach.every(Boolean);
    return { ok, given: answer.map(noteFr).join(' '), text: t('earp.melody_was', { notes: notes.map(noteFr).join(' – ') }) };
  };
}

// ---------------------------------------------------------------------
// Portée en clé de sol (police Bravura du volet Solfège)
// ---------------------------------------------------------------------
const LETTER_STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // demi-ton → degré (Do = 0)
const diatonic = (midi) => Math.floor(midi / 12) * 7 + LETTER_STEP[((midi % 12) + 12) % 12];
export function staffSvg(notes, { current = -1, done = [] } = {}) {
  const sp = 10, top = 30, left = 50, gap = 46;
  const width = left + notes.length * gap + 20;
  const yOf = (m) => top + 4 * sp - (diatonic(m) - diatonic(64)) * (sp / 2); // Mi4 = 1re ligne
  const lines = [0, 1, 2, 3, 4].map((i) => `<line x1="4" x2="${width - 4}" y1="${top + i * sp}" y2="${top + i * sp}" stroke="#0b2545" stroke-width="1.2"/>`).join('');
  const heads = notes.map((m, i) => {
    const x = left + i * gap, y = yOf(m);
    const color = done[i] === true ? '#15803d' : done[i] === false ? '#dc2626' : i === current ? '#1d4ed8' : '#0b2545';
    let ledger = '';
    for (let ly = top + 5 * sp; ly <= y + 0.1; ly += sp) ledger += `<line x1="${x - 7}" x2="${x + 19}" y1="${ly}" y2="${ly}" stroke="#0b2545" stroke-width="1.2"/>`;
    for (let ly = top - sp; ly >= y - 0.1; ly -= sp) ledger += `<line x1="${x - 7}" x2="${x + 19}" y1="${ly}" y2="${ly}" stroke="#0b2545" stroke-width="1.2"/>`;
    const sharp = BLACK.has(((m % 12) + 12) % 12) ? `<text x="${x - 13}" y="${y}" font-family="Bravura" font-size="40" fill="${color}"></text>` : '';
    return `${ledger}${sharp}<text x="${x}" y="${y}" font-family="Bravura" font-size="40" fill="${color}"></text>${i === current ? `<rect x="${x - 6}" y="${top + 6 * sp}" width="24" height="3" rx="1.5" fill="#1d4ed8"/>` : ''}`;
  }).join('');
  return raw(`<svg class="ear-staff" viewBox="0 0 ${width} ${top + 8 * sp}" role="img" aria-label="${t('earp.staff')}">${lines}<text x="8" y="${top + 3 * sp}" font-family="Bravura" font-size="40" fill="#0b2545"></text>${heads}</svg>`);
}

// ---------------------------------------------------------------------
// Rythmes dessinés (une mesure à 4 temps)
// Cellules : q noire, h blanche, r soupir, e2 deux croches, s4 quatre doubles,
//            dq noire pointée + croche, syn croche-noire-croche
// ---------------------------------------------------------------------
export const CELLS = {
  q: { beats: 1, hits: [[0, true]] }, h: { beats: 2, hits: [[0, true]] }, r: { beats: 1, hits: [] },
  e2: { beats: 1, hits: [[0, true], [0.5, true]] }, s4: { beats: 1, hits: [[0, true], [0.25, true], [0.5, true], [0.75, true]] },
  dq: { beats: 2, hits: [[0, true], [1.5, true]] }, syn: { beats: 2, hits: [[0, true], [0.5, true], [1.5, true]] },
};
export function rhythmSvg(cells) {
  const sp = 10, base = 46, w = { q: 34, h: 56, r: 34, e2: 44, s4: 70, dq: 64, syn: 80 };
  let x = 10, out = '';
  const head = (x0, open = false) => `<text x="${x0}" y="${base}" font-family="Bravura" font-size="40" fill="#0b2545">${open ? '' : ''}</text>`;
  const stem = (x0) => `<line x1="${x0 + 11.2}" x2="${x0 + 11.2}" y1="${base - 2}" y2="${base - 34}" stroke="#0b2545" stroke-width="1.4"/>`;
  const beam = (x1, x2, y) => `<rect x="${x1 + 10.5}" y="${y}" width="${x2 - x1 + 1.4}" height="4.5" fill="#0b2545"/>`;
  const flag = (x0) => `<text x="${x0 + 10.6}" y="${base - 34}" font-family="Bravura" font-size="40" fill="#0b2545"></text>`;
  const dot = (x0) => `<circle cx="${x0 + 17}" cy="${base - 4}" r="2" fill="#0b2545"/>`;
  for (const c of cells) {
    if (c === 'q') out += head(x) + stem(x);
    if (c === 'h') out += head(x, true) + stem(x);
    if (c === 'r') out += `<text x="${x + 2}" y="${base - sp}" font-family="Bravura" font-size="40" fill="#0b2545"></text>`;
    if (c === 'e2') out += head(x) + stem(x) + head(x + 22) + stem(x + 22) + beam(x, x + 22, base - 36);
    if (c === 's4') { [0, 16, 32, 48].forEach((d) => { out += head(x + d) + stem(x + d); }); out += beam(x, x + 48, base - 36) + beam(x, x + 48, base - 29); }
    if (c === 'dq') out += head(x) + stem(x) + dot(x) + head(x + 32) + stem(x + 32) + flag(x + 32);
    if (c === 'syn') out += head(x) + stem(x) + flag(x) + head(x + 24) + stem(x + 24) + head(x + 52) + stem(x + 52) + flag(x + 52);
    x += w[c];
  }
  return raw(`<svg class="ear-rhythm" viewBox="0 0 ${x + 6} 60" role="img" aria-label="${cells.map((c) => t('earp.cells')[c]).join(', ')}"><line x1="2" x2="${x + 4}" y1="${base - 0.5}" y2="${base - 0.5}" stroke="#c7d4ea" stroke-width="1"/>${out}</svg>`);
}

// Pause utile entre deux sons
export const wait = sleep;
