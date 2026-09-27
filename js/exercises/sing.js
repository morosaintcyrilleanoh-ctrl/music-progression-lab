// Exercices de chant en AUTO-ÉVALUATION (sans micro)
// La détection automatique par micro arrivera à l'étape suivante ;
// ce mode restera disponible pour les personnes sans micro.
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { playNote, playSequence, sleep } from '../audio.js';
import { letterToMidi, noteName, randInt, pick } from '../music.js';
import { askChoice, feedback, next, counter, set } from './common.js';

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

export default {
  assess: true,
  async run(stage, ctx) {
    const items = buildItems(ctx.exercise.type, ctx.params, ctx.voiceBase);
    const res = { total: 0, correct: 0, scoreSum: 0, done: 0, selfCheck: true };
    set(stage, html`
      <div class="alert alert-info small">${t('ex.sing.no_mic_note')}</div>
      <div data-z="counter"></div><p class="ex-prompt" data-z="prompt"></p>
      <div data-z="stage"></div><div data-z="answer"></div><div data-z="feedback"></div>`);
    const z = (n) => stage.querySelector(`[data-z="${n}"]`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const label = item.notes.map(noteName).join(' – ');
      counter(z('counter'), i + 1, items.length);
      set(z('feedback'), '');
      set(z('answer'), '');
      set(z('prompt'), html`${item.hint} <strong>${label}</strong>`);
      const play = () => (item.notes.length === 1 ? (playNote(item.notes[0], { duration: 1.4 }), sleep(1600)) : playSequence(item.notes, { noteDuration: 0.8 }));

      set(z('stage'), html`<p class="sing-step">🎧 ${t('ex.sing.listen')}</p>`);
      await play();
      const singSeconds = Math.max(3, item.notes.length * 1.5);
      for (let s = Math.ceil(singSeconds); s >= 1; s--) {
        set(z('stage'), html`<p class="sing-step is-singing">🎤 ${t('ex.sing.now')} <span class="muted">${s}</span></p>`);
        await sleep(1000);
      }
      set(z('stage'), html`<p class="sing-step">🔁 ${t('ex.sing.compare')}</p>`);
      await play();
      set(z('stage'), '');

      const { value, ms } = await askChoice(z('answer'), [
        { value: 'pareil', label: t('ex.sing.same') },
        { value: 'different', label: t('ex.sing.different') }
      ], { onReplay: play });
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
      await next(z('feedback'), i === items.length - 1 ? t('ex.finish') : t('ex.next'));
    }
    return res;
  }
};
