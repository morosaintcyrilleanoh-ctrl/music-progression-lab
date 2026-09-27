// Exercice : "Plus aigu, plus grave ou identique ?"
// Difficulté adaptative : l'écart diminue quand tu réussis, augmente quand tu te trompes.
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { playNote, sleep } from '../audio.js';
import { randInt, noteName } from '../music.js';
import { askChoice, feedback, next, counter, set } from './common.js';

export default {
  assess: true,
  async run(stage, ctx) {
    const total = ctx.params.questions ?? 20;
    let gap = ctx.params.start_semitones ?? 7;
    const minGap = ctx.params.min_semitones ?? 1;
    let streak = 0;
    const res = { total: 0, correct: 0, scoreSum: 0, done: 0 };

    set(stage, html`<div data-z="counter"></div><p class="ex-prompt">${t('ex.pitch.prompt')}</p>
      <div data-z="answer"></div><div data-z="feedback"></div>`);
    const z = (n) => stage.querySelector(`[data-z="${n}"]`);

    for (let q = 1; q <= total; q++) {
      counter(z('counter'), q, total);
      set(z('feedback'), '');
      const usedGap = gap;
      const first = randInt(57, 69);
      const kind = Math.random() < 0.2 ? 'identique' : (Math.random() < 0.5 ? 'plus_aigu' : 'plus_grave');
      const second = kind === 'identique' ? first : first + (kind === 'plus_aigu' ? gap : -gap);
      const play = async () => { playNote(first, { duration: 0.8 }); await sleep(1000); playNote(second, { duration: 0.8 }); await sleep(900); };

      set(z('answer'), html`<p class="muted center">${t('ex.listening')}</p>`);
      await play();
      const { value, ms } = await askChoice(z('answer'), [
        { value: 'plus_aigu', label: t('ex.pitch.higher') },
        { value: 'plus_grave', label: t('ex.pitch.lower') },
        { value: 'identique', label: t('ex.pitch.same') }
      ], { onReplay: play });

      const ok = value === kind;
      let errorType = null;
      if (ok) {
        streak++;
        feedback(z('feedback'), { ok, title: t('ex.correct'), text: explain(kind, usedGap) });
        if (streak >= 2 && gap > minGap) { gap--; streak = 0; }
      } else {
        streak = 0;
        errorType = `${value}_au_lieu_de_${kind}`;
        feedback(z('feedback'), {
          ok, title: t('ex.pitch.wrong_' + kind),
          text: explain(kind, usedGap),
          tip: kind === 'identique' ? t('ex.pitch.tip_same') : t('ex.pitch.tip_direction')
        });
        gap = Math.min(12, gap + 1);
      }
      res.total++; res.done++; if (ok) res.correct++; res.scoreSum += ok ? 1 : 0;
      ctx.record({
        is_correct: ok, score: ok ? 1 : 0, error_type: errorType, response_ms: ms,
        expected: { reponse: kind, note1: noteName(first), note2: noteName(second), ecart_demi_tons: kind === 'identique' ? 0 : usedGap },
        answer: { reponse: value }
      });
      await next(z('feedback'), q === total ? t('ex.finish') : t('ex.next'));
    }
    return res;
  }
};

function explain(kind, gap) {
  if (kind === 'identique') return t('ex.pitch.explain_same');
  return t(kind === 'plus_aigu' ? 'ex.pitch.explain_up' : 'ex.pitch.explain_down', { n: gap });
}
