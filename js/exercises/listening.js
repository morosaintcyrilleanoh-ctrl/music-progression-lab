// Exercice : "Les 3 écoutes" — un petit extrait généré, puis des questions
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { playKick, playHat, playBass, playPad, playNote, sleep } from '../audio.js';
import { askChoice, feedback, next, set, waitAction } from './common.js';

function makeExcerpt() {
  const withMelody = Math.random() < 0.6;
  const withPad = Math.random() < 0.5;
  const bassUp = Math.random() < 0.5;
  const instruments = 2 + (withMelody ? 1 : 0) + (withPad ? 1 : 0); // batterie + basse + …
  const bassSteps = bassUp ? [36, 38, 40, 41, 43, 45, 47, 48] : [48, 47, 45, 43, 41, 40, 38, 36];
  const melody = [72, 74, 76, 74, 72, 71, 72, 76];
  const beat = 0.6; // 100 BPM
  const play = async () => {
    for (let b = 0; b < 8; b++) {
      const w = 0.2 + b * beat;
      if (b % 2 === 0) playKick(w);
      playHat(w); playHat(w + beat / 2);
      playBass(bassSteps[b], { when: w, duration: beat * 0.9 });
      if (withMelody) playNote(melody[b], { when: w, duration: beat * 0.8, volume: 0.25 });
    }
    if (withPad) { playPad([60, 64, 67], { when: 0.2, duration: beat * 4 }); playPad([57, 60, 64], { when: 0.2 + beat * 4, duration: beat * 4 }); }
    await sleep((0.2 + 8 * beat + 0.4) * 1000);
  };
  return { play, instruments, bassUp };
}

export default {
  assess: true,
  async run(stage, ctx) {
    const ex = makeExcerpt();
    const res = { total: 0, correct: 0, scoreSum: 0, done: 0 };
    set(stage, html`
      <p class="ex-prompt">${ctx.exercise.instructions}</p>
      <ol class="listen-steps">
        <li>${t('ex.listen.step1')}</li><li>${t('ex.listen.step2')}</li><li>${t('ex.listen.step3')}</li>
      </ol>
      <div data-z="answer"></div><div data-z="feedback"></div>`);
    const z = (n) => stage.querySelector(`[data-z="${n}"]`);

    // Au moins 3 écoutes guidées
    for (let i = 1; i <= 3; i++) {
      set(z('answer'), html`<div class="center"><button class="btn btn-lg" type="button" data-action="play">▶ ${t('ex.listen.play', { n: i })}</button></div>`);
      await waitAction(z('answer'), ['play'], { Enter: 'play' });
      set(z('answer'), html`<p class="muted center">${t('ex.listening')} — ${t('ex.listen.focus_' + i)}</p>`);
      await ex.play();
    }

    const questions = [
      {
        key: 'instruments', expected: String(ex.instruments), prompt: t('ex.listen.q_count'),
        choices: ['2', '3', '4'].map((v) => ({ value: v, label: v })),
        explain: t('ex.listen.a_count', { n: ex.instruments })
      },
      {
        key: 'basse', expected: ex.bassUp ? 'monte' : 'descend', prompt: t('ex.listen.q_bass'),
        choices: [{ value: 'monte', label: t('ex.listen.up') }, { value: 'descend', label: t('ex.listen.down') }],
        explain: t(ex.bassUp ? 'ex.listen.a_bass_up' : 'ex.listen.a_bass_down')
      }
    ];
    for (const q of questions) {
      set(z('feedback'), '');
      set(z('answer'), html`<p class="ex-prompt">${q.prompt}</p><div data-z="choices"></div>`);
      const { value, ms } = await askChoice(z('answer').querySelector('[data-z="choices"]'), q.choices, { onReplay: ex.play });
      const ok = value === q.expected;
      feedback(z('feedback'), { ok, title: ok ? t('ex.correct') : t('ex.listen.ko'), text: q.explain, tip: ok ? null : t('ex.listen.tip_' + q.key) });
      res.total++; res.done++; if (ok) res.correct++; res.scoreSum += ok ? 1 : 0;
      ctx.record({ is_correct: ok, score: ok ? 1 : 0, response_ms: ms, error_type: ok ? null : `ecoute_${q.key}`,
        expected: { [q.key]: q.expected }, answer: { [q.key]: value } });
      await next(z('feedback'), t('ex.next'));
    }
    return res;
  }
};

