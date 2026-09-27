// Exercice : "Le dessin de la mélodie" — reconnaître si 3 notes montent ou descendent
import { html, raw } from '../ui.js';
import { t } from '../i18n.js';
import { playSequence } from '../audio.js';
import { randInt, noteName } from '../music.js';
import { askChoice, feedback, next, counter, set } from './common.js';

// Les 4 dessins possibles pour 3 notes : m = monte, d = descend
const SHAPES = ['mm', 'dd', 'md', 'dm'];

function shapeSvg(shape) {
  const ys = [30];
  for (const s of shape) ys.push(ys[ys.length - 1] + (s === 'm' ? -18 : 18));
  const min = Math.min(...ys), max = Math.max(...ys);
  const norm = ys.map((y) => 8 + ((y - min) / Math.max(1, max - min)) * 32);
  const pts = norm.map((y, i) => `${12 + i * 38},${y.toFixed(1)}`).join(' ');
  return raw(`<svg viewBox="0 0 100 48" width="100" height="48" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${norm.map((y, i) => `<circle cx="${12 + i * 38}" cy="${y.toFixed(1)}" r="5" fill="currentColor"/>`).join('')}
  </svg>`);
}

export default {
  assess: true,
  async run(stage, ctx) {
    const total = ctx.params.questions ?? 10;
    const res = { total: 0, correct: 0, scoreSum: 0, done: 0 };
    set(stage, html`<div data-z="counter"></div><p class="ex-prompt">${t('ex.contour.prompt')}</p>
      <div data-z="answer"></div><div data-z="feedback"></div>`);
    const z = (n) => stage.querySelector(`[data-z="${n}"]`);

    for (let q = 1; q <= total; q++) {
      counter(z('counter'), q, total);
      set(z('feedback'), '');
      const shape = SHAPES[randInt(0, 3)];
      const notes = [randInt(60, 67)];
      for (const s of shape) notes.push(notes[notes.length - 1] + (s === 'm' ? 1 : -1) * randInt(2, 4));
      const play = () => playSequence(notes, { noteDuration: 0.6 });

      set(z('answer'), html`<p class="muted center">${t('ex.listening')}</p>`);
      await play();
      const { value, ms } = await askChoice(z('answer'),
        SHAPES.map((s) => ({ value: s, label: html`${shapeSvg(s)}<span class="sr-only">${t('ex.contour.' + s)}</span>` })),
        { onReplay: play });

      const ok = value === shape;
      feedback(z('feedback'), {
        ok,
        title: ok ? t('ex.correct') : t('ex.contour.wrong'),
        text: t('ex.contour.explain', { shape: t('ex.contour.' + shape), notes: notes.map(noteName).join(' – ') }),
        tip: ok ? null : t('ex.contour.tip')
      });
      res.total++; res.done++; if (ok) res.correct++; res.scoreSum += ok ? 1 : 0;
      ctx.record({
        is_correct: ok, score: ok ? 1 : 0, response_ms: ms,
        error_type: ok ? null : `dessin_${value}_au_lieu_de_${shape}`,
        expected: { dessin: shape, notes: notes.map(noteName) }, answer: { dessin: value }
      });
      await next(z('feedback'), q === total ? t('ex.finish') : t('ex.next'));
    }
    return res;
  }
};
