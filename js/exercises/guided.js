// Exercices guidés : respiration, échauffement vocal, carnet, enregistrement de référence
import { html } from '../ui.js';
import { t } from '../i18n.js';
import { sleep } from '../audio.js';
import { next, set, waitAction } from './common.js';

export const breathing = {
  assess: false,
  async run(stage, ctx) {
    const inhale = ctx.params.inhale_beats ?? 4;
    const exhale = ctx.params.exhale_beats ?? 8;
    const rounds = ctx.params.rounds ?? 3;
    set(stage, html`<p class="ex-prompt">${ctx.exercise.instructions}</p>
      <div class="breath-wrap"><div class="breath-circle" data-z="circle"></div><p class="breath-label" data-z="label" aria-live="polite"></p></div>
      <div data-z="actions" class="center"><button class="btn btn-lg" type="button" data-action="go">${t('ex.breath.start')}</button></div>`);
    const z = (n) => stage.querySelector(`[data-z="${n}"]`);
    await waitAction(stage, ['go'], { Enter: 'go' });
    set(z('actions'), html`<button class="btn btn-ghost btn-sm" type="button" data-action="skip">${t('ex.skip')}</button>`);

    let skipped = false;
    waitAction(z('actions'), ['skip']).then(() => { skipped = true; });
    const circle = z('circle'), label = z('label');
    for (let r = 1; r <= rounds && !skipped; r++) {
      for (const [phase, beats] of [['in', inhale], ['out', exhale]]) {
        circle.style.transitionDuration = `${beats}s`;
        circle.classList.toggle('is-big', phase === 'in');
        for (let b = beats; b >= 1 && !skipped; b--) {
          label.textContent = `${t(phase === 'in' ? 'ex.breath.in' : 'ex.breath.out')} · ${b}  (${r}/${rounds})`;
          await sleep(1000);
        }
      }
    }
    label.textContent = t('ex.breath.done');
    set(z('actions'), '');
    await next(z('actions'), t('ex.finish'));
    return { total: 0, correct: 0, scoreSum: 0, done: 1 };
  }
};

export const warmup = {
  assess: false,
  async run(stage, ctx) {
    const steps = ['baillement', 'levres', 'sirene_ou'].filter((s) => (ctx.params.steps ?? []).includes(s));
    set(stage, html`<p class="ex-prompt">${ctx.exercise.instructions}</p>
      <ol class="warmup">${steps.map((s, i) => html`
        <li><label class="check"><input type="checkbox" data-step="${i}"> <span>${t('ex.warmup.' + s)}</span></label></li>`)}</ol>
      <p class="muted small">${ctx.exercise.explanation}</p>
      <div data-z="actions"></div>`);
    const actions = stage.querySelector('[data-z="actions"]');
    await next(actions, t('ex.warmup.done'));
    return { total: 0, correct: 0, scoreSum: 0, done: 1 };
  }
};

export const journal = {
  assess: false,
  async run(stage, ctx) {
    const fields = [...(ctx.params.fields ?? ['facile', 'difficile'])];
    if (ctx.day?.day_number === 6 && !fields.includes('details')) fields.unshift('details');
    set(stage, html`<p class="ex-prompt">${ctx.exercise.instructions}</p>
      <form class="form" data-z="form">
        ${fields.map((f) => html`
          <div class="field">
            <label for="nb-${f}">${t('ex.journal.' + f)}</label>
            <textarea class="input" id="nb-${f}" name="${f}" rows="3" maxlength="600"></textarea>
          </div>`)}
      </form>
      <p class="muted small">${ctx.exercise.explanation}</p>
      <div data-z="actions"></div>`);
    const actions = stage.querySelector('[data-z="actions"]');
    await next(actions, t('ex.journal.save'));
    const form = stage.querySelector('[data-z="form"]');
    const notebook = Object.fromEntries(fields.map((f) => [f, form.elements[f].value.trim()]));
    return { total: 0, correct: 0, scoreSum: 0, done: 1, notebook };
  }
};

export const recordReference = {
  assess: false,
  async run(stage, ctx) {
    set(stage, html`<p class="ex-prompt">${ctx.exercise.instructions}</p>
      <div class="alert alert-info">${t('ex.record.how')}</div>
      <div data-z="actions"></div>`);
    await next(stage.querySelector('[data-z="actions"]'), t('ex.record.done'));
    return { total: 0, correct: 0, scoreSum: 0, done: 1 };
  }
};
