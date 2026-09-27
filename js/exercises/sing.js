// Exercices de chant : avec MICRO (détection de la note chantée)
// ou en AUTO-ÉVALUATION (sans micro, ou si l'élève refuse le micro).
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { playNote, playSequence, sleep } from '../audio.js';
import { letterToMidi, noteName, randInt, pick } from '../music.js';
import { startMic, readPitch, centsFromTarget, freqToMidi, micSupported, getSingMode, setSingMode } from '../pitch.js';
import { askChoice, feedback, next, counter, set, waitAction } from './common.js';

// Construit la liste des choses à chanter selon le type d'exercice
function buildItems(type, p, base) {
  const L = (x) => letterToMidi(x, base);
  switch (type) {
    case 'sing_glide': {
      const target = L(p.target ?? 'G');
      return [
        { notes: [target], hint: t('ex.sing.glide_below') },
        { notes: [target], hint: t('ex.sing.glide_above') }
      ];
    }
    case 'sing_sequence':
      return [{ notes: (p.sequence ?? ['C', 'D', 'E', 'D', 'C']).map(L), hint: t('ex.sing.sequence_hint') }];
    case 'sing_pair': {
      const out = [];
      for (let i = 0; i < (p.pairs ?? 5); i++) {
        const a = base + pick([0, 2, 4, 5, 7]);
        const b = a + pick([-1, 1]) * randInt(1, p.max_semitones ?? 5);
        out.push({ notes: [a, b], hint: t('ex.sing.pair_hint') });
      }
      return out;
    }
    case 'melody_sing': {
      const lengths = p.lengths ?? [2, 3];
      const count = p.count ?? 3;
      const out = [];
      for (let i = 0; i < count; i++) {
        const len = lengths[Math.min(lengths.length - 1, Math.floor((i * lengths.length) / count))];
        const notes = [base + pick([0, 2, 4])];
        while (notes.length < len) notes.push(Math.max(base, Math.min(base + 9, notes[notes.length - 1] + pick([-2, -1, 1, 2, 3]))));
        out.push({ notes, hint: t('ex.sing.melody_hint') });
      }
      return out;
    }
    default: // sing_note
      return (p.notes ?? ['C', 'D', 'E', 'G', 'A']).map((n) => ({ notes: [L(n)], hint: t('ex.sing.note_hint') }));
  }
}

const playItem = (item) => (item.notes.length === 1
  ? (playNote(item.notes[0], { duration: 1.4 }), sleep(1600))
  : playSequence(item.notes, { noteDuration: 0.8 }));

// ---------------------------------------------------------------------
// Choix du mode (une fois par visite)
// ---------------------------------------------------------------------
async function chooseMode(stage) {
  if (getSingMode() === 'self') return 'self';
  if (getSingMode() === 'mic') {
    // Le micro a été coupé à la fin de la séance précédente : on le relance
    if ((await startMic()) === 'ok') return 'mic';
    setSingMode('self');
    return 'self';
  }
  if (!micSupported()) { setSingMode('self'); return 'self'; }
  set(stage, html`
    <div class="mic-choice">
      <p class="ex-prompt">🎤 ${t('ex.mic.title')}</p>
      <p>${t('ex.mic.explain')}</p>
      <p class="small muted">${t('ex.mic.disclaimer')}</p>
      <div class="row">
        <button class="btn btn-lg" type="button" data-action="mic">🎤 ${t('ex.mic.use')}</button>
        <button class="btn btn-ghost" type="button" data-action="self">${t('ex.mic.without')}</button>
      </div>
      <div data-z="mic-msg"></div>
    </div>`);
  const choice = await waitAction(stage, ['mic', 'self']);
  if (choice === 'self') { setSingMode('self'); return 'self'; }

  set(stage.querySelector('[data-z="mic-msg"]'), html`<p class="muted">${t('ex.mic.asking')}</p>`);
  const status = await startMic();
  if (status === 'ok') { setSingMode('mic'); return 'mic'; }

  // Refus ou problème : explication claire + mode sans micro
  setSingMode('self');
  set(stage, html`
    <div class="alert alert-info" role="alert">
      <strong>${t('ex.mic.problem_' + status)}</strong>
      <p style="margin:6px 0 0">${t('ex.mic.fallback')}</p>
    </div>
    <div data-z="actions"></div>`);
  await next(stage.querySelector('[data-z="actions"]'), t('ex.next'));
  return 'self';
}

// ---------------------------------------------------------------------
// Chanter UNE note avec le micro : jauge en direct
// ---------------------------------------------------------------------
async function singWithMic(zone, target, { tolerance, holdMs, timeoutMs = 10000 }) {
  set(zone, html`
    <div class="tuner" role="group" aria-label="${t('ex.mic.tuner')}">
      <div class="tuner-target">${t('ex.mic.target')} : <strong>${noteName(target)}</strong></div>
      <div class="tuner-note" data-z="note" aria-hidden="true">–</div>
      <div class="tuner-track" aria-hidden="true">
        <div class="tuner-zone" style="left:${50 - tolerance / 2}%;width:${tolerance}%"></div>
        <div class="tuner-center"></div>
        <div class="tuner-needle" data-z="needle" style="left:50%"></div>
        <span class="tuner-lbl l">${t('ex.mic.lower')}</span><span class="tuner-lbl r">${t('ex.mic.higher')}</span>
      </div>
      <p class="tuner-status" data-z="status" aria-live="polite">${t('ex.mic.sing_now')}</p>
      <div class="bar tuner-hold" aria-hidden="true"><span data-z="hold" style="width:0%"></span></div>
      <div class="row" style="justify-content:center">
        <button class="btn btn-ghost btn-sm" type="button" data-action="ref">↻ ${t('ex.mic.ref')}</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="skip">${t('ex.mic.skip')}</button>
      </div>
    </div>`);
  const q = (n) => zone.querySelector(`[data-z="${n}"]`);
  const voiced = [];
  let holdStart = null, lastGood = 0, lastStatus = '', muteUntil = 0, octaveSeen = 0;
  const started = performance.now();
  let stopReason = null;

  zone.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'ref') { playNote(target, { duration: 1.2 }); muteUntil = performance.now() + 1500; holdStart = null; }
    if (a === 'skip') stopReason = 'skip';
  });

  while (!stopReason && document.contains(zone)) {
    await sleep(50);
    const tnow = performance.now();
    if (tnow - started > timeoutMs) { stopReason = 'timeout'; break; }
    if (tnow < muteUntil) continue; // on n'écoute pas pendant la note de référence
    const p = readPitch();
    if (!p || p.clarity < 0.8) {
      if (holdStart && tnow - lastGood > 250) holdStart = null;
      q('note').textContent = '–';
      continue;
    }
    const { cents, octave } = centsFromTarget(p.freq, target);
    octaveSeen = octave;
    voiced.push(cents);
    q('note').textContent = noteName(Math.round(freqToMidi(p.freq)));
    q('needle').style.left = `${50 + Math.max(-100, Math.min(100, cents)) / 2}%`;
    const inTune = Math.abs(cents) <= tolerance;
    q('needle').classList.toggle('is-ok', inTune);
    const status = inTune ? 'ok' : cents < 0 ? 'low' : 'high';
    if (status !== lastStatus) { q('status').textContent = t('ex.mic.status_' + status); lastStatus = status; }
    if (inTune) {
      lastGood = tnow;
      holdStart ??= tnow;
      const held = tnow - holdStart;
      q('hold').style.width = `${Math.min(100, (held / holdMs) * 100)}%`;
      if (held >= holdMs) { stopReason = 'success'; break; }
    } else if (holdStart && tnow - lastGood > 250) {
      holdStart = null;
      q('hold').style.width = '0%';
    }
  }
  const recent = voiced.slice(-20).sort((a, b) => a - b);
  const median = recent.length ? recent[Math.floor(recent.length / 2)] : null;
  return { ok: stopReason === 'success', cents: median, voicedFrames: voiced.length, reason: stopReason, octave: octaveSeen };
}

function micFeedbackText(r, target) {
  if (r.ok) return t('ex.mic.fb_ok', { note: noteName(target) });
  if (r.cents === null || r.voicedFrames < 5) return t('ex.mic.fb_silence');
  const c = Math.round(Math.abs(r.cents));
  const st = c >= 80 ? t('ex.mic.semitones', { n: Math.round(c / 100) }) : t('ex.mic.less_semitone');
  return t(r.cents < 0 ? 'ex.mic.fb_low' : 'ex.mic.fb_high', { n: c, st });
}

// ---------------------------------------------------------------------
export default {
  assess: true,
  async run(stage, ctx) {
    const items = buildItems(ctx.exercise.type, ctx.params, ctx.voiceBase);
    const tolerance = ctx.params.tolerance_cents ?? 50;
    const holdMs = (ctx.params.hold_seconds ?? 1.2) * 1000;
    const mode = await chooseMode(stage);
    const res = { total: 0, correct: 0, scoreSum: 0, done: 0, selfCheck: mode === 'self' };

    set(stage, html`
      ${mode === 'self' ? html`<div class="alert alert-info small">${t('ex.sing.no_mic_note')}</div>` : ''}
      <div data-z="counter"></div><p class="ex-prompt" data-z="prompt"></p>
      <div data-z="stage"></div><div data-z="answer"></div><div data-z="feedback"></div>`);
    const z = (n) => stage.querySelector(`[data-z="${n}"]`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      counter(z('counter'), i + 1, items.length);
      set(z('feedback'), ''); set(z('answer'), '');
      set(z('prompt'), html`${item.hint} <strong>${item.notes.map(noteName).join(' – ')}</strong>`);
      set(z('stage'), html`<p class="sing-step">🎧 ${t('ex.sing.listen')}</p>`);
      await playItem(item);

      if (mode === 'mic') {
        // Chaque note est chantée et vérifiée l'une après l'autre
        const lines = [];
        for (let k = 0; k < item.notes.length; k++) {
          const target = item.notes[k];
          if (item.notes.length > 1) set(z('prompt'), html`${item.hint} <strong>${item.notes.map((m, j) => (j === k ? `[${noteName(m)}]` : noteName(m))).join(' – ')}</strong>`);
          const r = await singWithMic(z('stage'), target, { tolerance, holdMs });
          const score = r.ok ? 1 : r.cents === null ? 0 : Math.max(0, 1 - Math.abs(r.cents) / 200) * 0.7;
          res.total++; res.done++; if (r.ok) res.correct++; res.scoreSum += score;
          ctx.record({
            is_correct: r.ok, score: Math.round(score * 100) / 100, used_mic: true,
            cents_offset: r.cents === null ? null : Math.round(r.cents),
            error_type: r.ok ? null : r.cents === null ? 'pas_de_son_detecte' : r.cents < 0 ? 'trop_grave' : 'trop_aigu',
            expected: { note: noteName(target), tolerance_cents: tolerance },
            answer: { ecart_cents: r.cents === null ? null : Math.round(r.cents), raison: r.reason }
          });
          lines.push({ ok: r.ok, text: micFeedbackText(r, target) });
        }
        set(z('stage'), '');
        const allOk = lines.every((l) => l.ok);
        feedback(z('feedback'), {
          ok: allOk,
          title: allOk ? t('ex.sing.ok') : t('ex.mic.almost'),
          text: lines.map((l) => (l.ok ? '✓ ' : '• ') + l.text).join(' '),
          tip: allOk ? null : t('ex.sing.tip')
        });
      } else {
        const singSeconds = Math.max(3, item.notes.length * 1.5);
        for (let s = Math.ceil(singSeconds); s >= 1; s--) {
          set(z('stage'), html`<p class="sing-step is-singing">🎤 ${t('ex.sing.now')} <span class="muted">${s}</span></p>`);
          await sleep(1000);
        }
        set(z('stage'), html`<p class="sing-step">🔁 ${t('ex.sing.compare')}</p>`);
        await playItem(item);
        set(z('stage'), '');
        const { value, ms } = await askChoice(z('answer'), [
          { value: 'pareil', label: t('ex.sing.same') },
          { value: 'different', label: t('ex.sing.different') }
        ], { onReplay: () => playItem(item) });
        const ok = value === 'pareil';
        feedback(z('feedback'), {
          ok, title: ok ? t('ex.sing.ok') : t('ex.sing.ko'),
          text: ok ? t('ex.sing.ok_text') : t('ex.sing.ko_text'),
          tip: ok ? null : t('ex.sing.tip')
        });
        res.total++; res.done++; if (ok) res.correct++; res.scoreSum += ok ? 0.8 : 0.2;
        ctx.record({
          is_correct: ok, score: ok ? 0.8 : 0.2, response_ms: ms, used_mic: false,
          error_type: ok ? null : 'auto_evaluation_different',
          expected: { notes: item.notes.map(noteName), mode: 'auto_evaluation' }, answer: { auto_evaluation: value }
        });
      }
      await next(z('feedback'), i === items.length - 1 ? t('ex.finish') : t('ex.next'));
    }
    return res;
  }
};
