// Exercices de rythme : rythme miroir, pulsation au métronome, calibrage
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { playClick, unlockAudio, now, sleep } from '../audio.js';
import { pick } from '../music.js';
import { feedback, next, counter, set, waitAction } from './common.js';

const LATENCY_KEY = 'mpl.latency_ms';
export function getLatency() {
  try { return Number(localStorage.getItem(LATENCY_KEY)) || 0; } catch { return 0; }
}
function saveLatency(ms) { try { localStorage.setItem(LATENCY_KEY, String(Math.round(ms))); } catch { /* navigation privée */ } }

// Motifs de 4 temps (position des coups, en temps)
const PATTERNS = [
  [0, 1, 2, 3], [0, 1, 3], [0, 2, 3], [0, 0.5, 1, 2, 3], [0, 1, 1.5, 2],
  [0, 1, 2, 2.5, 3], [0, 0.5, 1, 1.5, 2], [0, 2], [0, 1, 2], [0, 0.5, 1, 3]
];
const REST_FREE = PATTERNS.filter((p) => p.length >= 4 && p.every((x) => Number.isInteger(x)));

// Transforme un motif en syllabes : ta = 1 temps, ti-ti = 2 demi-temps, … = silence
export function syllables(pattern) {
  const out = [];
  for (let beat = 0; beat < 4; beat++) {
    const on = pattern.includes(beat), half = pattern.includes(beat + 0.5);
    out.push(on && half ? 'ti-ti' : on ? 'ta' : half ? '…-ti' : '…');
  }
  return out.join('  ');
}

// Zone de frappe : gros bouton + barre d'espace. Renvoie une fonction pour arrêter l'écoute.
function tapPad(zone, onTap, label = t('ex.rhythm.tap')) {
  set(zone, html`<button class="tap-pad" type="button" data-tap>${label}<span class="small muted">${t('ex.rhythm.tap_hint')}</span></button>`);
  const pad = zone.querySelector('[data-tap]');
  const hit = (e) => {
    e.preventDefault();
    pad.classList.remove('is-hit'); void pad.offsetWidth; pad.classList.add('is-hit');
    onTap(performance.now());
  };
  const onKey = (e) => {
    if (!document.contains(pad)) { document.removeEventListener('keydown', onKey); return; }
    if (e.code === 'Space' && !e.repeat) hit(e);
  };
  pad.addEventListener('pointerdown', hit);
  document.addEventListener('keydown', onKey);
  pad.focus({ preventScroll: true });
  return () => { pad.removeEventListener('pointerdown', hit); document.removeEventListener('keydown', onKey); pad.disabled = true; };
}

// Planifie des clics et renvoie leurs instants en millisecondes (horloge de la page)
function scheduleClicks(count, beatSec, { startIn = 0.4, accentEvery = 0, countIn = 0 } = {}) {
  const ac = unlockAudio();
  const perfNow = performance.now();
  const acNow = now();
  const outLatency = ((ac && (ac.outputLatency || ac.baseLatency)) || 0) * 1000;
  const times = [];
  for (let i = 0; i < countIn + count; i++) {
    const when = startIn + i * beatSec;
    playClick({ when, accent: i < countIn || (accentEvery && (i - countIn) % accentEvery === 0), volume: i < countIn ? 0.4 : 0.6 });
    if (i >= countIn) times.push(perfNow + (when + (now() - acNow)) * 1000 + outLatency);
  }
  return times;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

// ---------------------------------------------------------------------
export const rhythmEcho = {
  assess: true,
  async run(stage, ctx) {
    const total = ctx.params.patterns ?? 6;
    const bpm = ctx.params.bpm ?? 70;
    const beatMs = 60000 / bpm;
    const pool = ctx.params.allow_rests === false ? REST_FREE : PATTERNS;
    const res = { total: 0, correct: 0, scoreSum: 0, done: 0 };
    set(stage, html`<div data-z="counter"></div><p class="ex-prompt">${t('ex.rhythm.echo_prompt')}</p>
      <div data-z="answer"></div><div data-z="feedback"></div>`);
    const z = (n) => stage.querySelector(`[data-z="${n}"]`);

    let previous = null;
    for (let q = 1; q <= total; q++) {
      counter(z('counter'), q, total);
      set(z('feedback'), '');
      let pattern = pick(pool);
      if (pattern === previous) pattern = pick(pool);
      previous = pattern;
      const play = async () => {
        pattern.forEach((b) => playClick({ when: 0.2 + (b * beatMs) / 1000, accent: b === 0 }));
        await sleep(0.2 * 1000 + 4 * beatMs);
      };

      // Écoute (réécoute possible avant de taper)
      for (;;) {
        set(z('answer'), html`<p class="muted center">${t('ex.listening')}</p>`);
        await play();
        set(z('answer'), html`<div class="row" style="justify-content:center">
          <button class="btn btn-lg" type="button" data-action="go">${t('ex.rhythm.ready')}</button>
          <button class="btn btn-ghost" type="button" data-action="replay">↻ ${t('ex.replay')}</button></div>`);
        const a = await waitAction(z('answer'), ['go', 'replay'], { Enter: 'go', r: 'replay', R: 'replay' });
        if (a === 'go') break;
      }

      // Frappe
      const taps = [];
      const doneTapping = new Promise((resolve) => {
        let timer = null;
        const stop = tapPad(z('answer'), (tms) => {
          taps.push(tms);
          if (taps.length === 1) timer = setTimeout(() => { stop(); resolve(); }, 4 * beatMs + beatMs * 0.75);
          if (taps.length >= pattern.length + 3) { clearTimeout(timer); stop(); resolve(); }
        });
      });
      await doneTapping;

      const user = taps.map((x) => (x - taps[0]) / beatMs);
      const tol = 0.3;
      let ok = false, score = 0, errorType = null, text;
      if (user.length !== pattern.length) {
        errorType = user.length < pattern.length ? 'coups_manquants' : 'coups_en_trop';
        text = t('ex.rhythm.count_mismatch', { you: user.length, expected: pattern.length });
      } else {
        const devs = pattern.map((b, i) => user[i] - b);
        const good = devs.filter((d) => Math.abs(d) <= tol).length;
        score = good / pattern.length;
        ok = good === pattern.length;
        if (ok) text = t('ex.rhythm.echo_ok');
        else {
          const worst = devs.reduce((w, d, i) => (Math.abs(d) > Math.abs(devs[w]) ? i : w), 0);
          errorType = devs[worst] < 0 ? 'coup_trop_tot' : 'coup_trop_tard';
          text = t(devs[worst] < 0 ? 'ex.rhythm.too_early' : 'ex.rhythm.too_late', { n: worst + 1 });
        }
      }
      feedback(z('feedback'), {
        ok, title: ok ? t('ex.correct') : t('ex.rhythm.echo_wrong'),
        text: `${text} ${t('ex.rhythm.pattern_was', { syl: syllables(pattern) })}`,
        tip: ok ? null : t('ex.rhythm.echo_tip')
      });
      set(z('answer'), '');
      res.total++; res.done++; if (ok) res.correct++; res.scoreSum += score;
      ctx.record({
        is_correct: ok, score, error_type: errorType,
        expected: { motif: syllables(pattern), coups: pattern.length },
        answer: { coups: user.length, positions: user.map((x) => Math.round(x * 100) / 100) }
      });
      await next(z('feedback'), q === total ? t('ex.finish') : t('ex.next'));
    }
    return res;
  }
};

// ---------------------------------------------------------------------
export const pulseTap = {
  assess: true,
  async run(stage, ctx) {
    const bpm = ctx.params.bpm ?? 70;
    const beats = ctx.params.beats ?? 16;
    const tol = Math.max(ctx.params.tolerance_ms ?? 60, 60);
    const beatSec = 60 / bpm;
    set(stage, html`<p class="ex-prompt">${t('ex.pulse.prompt', { bpm, beats })}</p>
      <div data-z="answer"></div><div data-z="feedback"></div>`);
    const z = (n) => stage.querySelector(`[data-z="${n}"]`);

    set(z('answer'), html`<div class="center"><button class="btn btn-lg" type="button" data-action="go">${t('ex.pulse.start')}</button></div>`);
    await waitAction(z('answer'), ['go'], { Enter: 'go' });

    const taps = [];
    const stop = tapPad(z('answer'), (tms) => taps.push(tms), t('ex.pulse.tap'));
    const clicks = scheduleClicks(beats, beatSec, { countIn: 4, accentEvery: 4 });
    await sleep((0.4 + (beats + 4) * beatSec + 0.6) * 1000);
    stop();

    const latency = getLatency();
    const devs = clicks.map((c) => {
      const near = taps.map((x) => x - latency - c).filter((d) => Math.abs(d) < (beatSec * 1000) / 2);
      return near.length ? near.reduce((a, b) => (Math.abs(a) < Math.abs(b) ? a : b)) : null;
    });
    const hits = devs.filter((d) => d !== null);
    const score = devs.reduce((s, d) => s + (d === null ? 0 : Math.abs(d) <= tol ? 1 : Math.abs(d) <= 2 * tol ? 0.5 : 0), 0) / beats;
    const mean = hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : 0;
    const ok = score >= 0.6;
    let tip = null, errorType = null;
    if (hits.length < beats * 0.7) { tip = t('ex.pulse.tip_missing'); errorType = 'frappes_manquantes'; }
    else if (mean < -tol / 2) { tip = t('ex.pulse.tip_early'); errorType = 'en_avance'; }
    else if (mean > tol / 2) { tip = t('ex.pulse.tip_late'); errorType = 'en_retard'; }
    feedback(z('feedback'), {
      ok, title: ok ? t('ex.pulse.ok') : t('ex.pulse.ko'),
      text: t('ex.pulse.result', { pct: Math.round(score * 100), hits: hits.length, beats, ms: Math.round(Math.abs(mean)), dir: mean < 0 ? t('ex.pulse.early') : t('ex.pulse.late') }),
      tip
    });
    set(z('answer'), '');
    ctx.record({ is_correct: ok, score: Math.round(score * 100) / 100, error_type: errorType,
      expected: { bpm, temps: beats }, answer: { frappes: hits.length, ecart_moyen_ms: Math.round(mean) } });
    await next(z('feedback'), t('ex.finish'));
    return { total: 1, correct: ok ? 1 : 0, scoreSum: score, done: 1 };
  }
};

// ---------------------------------------------------------------------
export const latencyCalibration = {
  assess: false,
  async run(stage, ctx) {
    const clicksCount = ctx.params.clicks ?? 8;
    const beatSec = 60 / (ctx.params.bpm ?? 80);
    set(stage, html`<p class="ex-prompt">${t('ex.calib.prompt', { n: clicksCount })}</p>
      <div data-z="answer"></div><div data-z="feedback"></div>`);
    const z = (n) => stage.querySelector(`[data-z="${n}"]`);

    for (;;) {
      set(z('feedback'), '');
      set(z('answer'), html`<div class="center"><button class="btn btn-lg" type="button" data-action="go">${t('ex.pulse.start')}</button></div>`);
      await waitAction(z('answer'), ['go'], { Enter: 'go' });
      const taps = [];
      const stop = tapPad(z('answer'), (tms) => taps.push(tms), t('ex.pulse.tap'));
      const clicks = scheduleClicks(clicksCount, beatSec, { countIn: 2 });
      await sleep((0.4 + (clicksCount + 2) * beatSec + 0.5) * 1000);
      stop();
      const devs = clicks.map((c) => {
        const near = taps.map((x) => x - c).filter((d) => Math.abs(d) < (beatSec * 1000) / 2);
        return near.length ? near.reduce((a, b) => (Math.abs(a) < Math.abs(b) ? a : b)) : null;
      }).filter((d) => d !== null);
      set(z('answer'), '');
      if (devs.length < clicksCount / 2) {
        feedback(z('feedback'), { ok: false, title: t('ex.calib.retry_title'), text: t('ex.calib.retry') });
        await next(z('feedback'), t('ex.retry'));
        continue;
      }
      const offset = Math.max(-50, Math.min(400, median(devs)));
      saveLatency(offset);
      feedback(z('feedback'), { ok: true, title: t('ex.calib.done'), text: t('ex.calib.result', { ms: Math.round(offset) }) });
      await next(z('feedback'), t('ex.finish'));
      return { total: 0, correct: 0, scoreSum: 0, done: 1 };
    }
  }
};
