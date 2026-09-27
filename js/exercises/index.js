// =====================================================================
// Registre des exercices : à chaque "type" d'exercice (colonne exercises.type
// dans la base) correspond un module. Pour ajouter un nouveau type
// d'exercice plus tard, il suffit de créer un fichier et de l'ajouter ici.
// =====================================================================
import { html } from '../ui.js';
import { t } from '../i18n.js';
import pitchCompare from './pitch-compare.js';
import melodyContour from './melody-contour.js';
import { rhythmEcho, pulseTap, latencyCalibration } from './rhythm.js';
import { breathing, warmup, journal, recordReference } from './guided.js';
import sing from './sing.js';
import listening from './listening.js';
import { set } from './common.js';

const assessment = {
  assess: false, // chaque partie enregistre ses propres réponses
  async run(stage, ctx) {
    const total = { total: 0, correct: 0, scoreSum: 0, done: 0 };
    const parts = ctx.params.parts ?? [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const exercise = await ctx.loadExercise(part.exercise);
      const module = exercise && registry[exercise.type];
      if (!module) continue;
      const params = { ...exercise.params, ...countParams(exercise.type, part.count, exercise.params) };
      const zone = document.createElement('div');
      set(stage, html`<p class="eyebrow">${t('ex.assessment.part', { n: i + 1, total: parts.length })} · ${exercise.title}</p>`);
      stage.appendChild(zone);
      const r = await module.run(zone, { ...ctx, exercise, params, record: (item) => ctx.recordFor(exercise, item) });
      total.total += r.total; total.correct += r.correct; total.scoreSum += r.scoreSum; total.done += r.done;
    }
    total.done = total.total > 0 ? 1 : 0; // le mini-test compte comme "fait" une fois
    return total;
  }
};

// Adapte le nombre de questions d'un exercice pour le mini-test
function countParams(type, count, p) {
  switch (type) {
    case 'pitch_compare': return { questions: count };
    case 'melody_contour': return { questions: count };
    case 'rhythm_echo': return { patterns: count };
    case 'sing_note': return { notes: (p.notes ?? ['C', 'D', 'E', 'G', 'A']).slice(0, count) };
    case 'melody_sing': return { count, lengths: [2, 3] };
    default: return {};
  }
}

export const registry = {
  pitch_compare: pitchCompare,
  melody_contour: melodyContour,
  rhythm_echo: rhythmEcho,
  pulse_tap: pulseTap,
  latency_calibration: latencyCalibration,
  guided_breathing: breathing,
  guided_warmup: warmup,
  journal,
  record_reference: recordReference,
  sing_note: sing,
  sing_glide: sing,
  sing_sequence: sing,
  sing_pair: sing,
  melody_sing: sing,
  listening_quiz: listening,
  assessment
};
