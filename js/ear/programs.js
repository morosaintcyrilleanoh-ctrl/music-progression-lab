// =====================================================================
// Oreille+ : programmes de 30 jours (après le programme de 7 jours)
// Chaque jour : 2 ou 3 étapes { activity, level, questions } ; le niveau
// monte chaque semaine (jours 1-8 : niveau 1, 9-16 : 2, 17-24 : 3, 25-30 : 4).
// =====================================================================
import { activityById } from './activities.js';

const weekLevel = (day, max) => Math.min(max, 1 + Math.floor((day - 1) / 8));
const step = (id, day, questions) => {
  const a = activityById(id);
  return { activity: id, level: weekLevel(day, a.levels), questions: questions ?? a.questions };
};

// Rotation des journées : chaque entrée est une liste d'activités
const ROTATIONS = {
  'oreille-30': [
    ['adaptatif-interval', 'dictee-melodique', 'adaptatif-chord'],
    ['adaptatif-scale', 'cadences', 'instruments'],
    ['adaptatif-degree', 'adaptatif-interval', 'dictee-melodique'],
    ['adaptatif-chord', 'adaptatif-progression', 'cadences'],
  ],
  'rythme-30': [
    ['dictee-rythmique', 'tempo-progressif'],
    ['dictee-rythmique', 'polyrythmie'],
    ['tempo-progressif', 'dictee-rythmique'],
  ],
  'chanteurs-30': [
    ['chant-intervalle', 'chant-gamme'],
    ['solfege-chante', 'adaptatif-interval'],
    ['chant-gamme', 'dictee-melodique'],
    ['chant-intervalle', 'solfege-chante'],
  ],
  'accompagnateurs-30': [
    ['adaptatif-chord', 'adaptatif-degree', 'cadences'],
    ['adaptatif-progression', 'instruments', 'dictee-melodique'],
    ['adaptatif-degree', 'cadences', 'adaptatif-chord'],
  ],
};
// Nombre de questions par étape (journée d'environ 10 minutes)
const QUESTIONS = { 'adaptatif-interval': 8, 'adaptatif-chord': 8, 'adaptatif-scale': 8, 'adaptatif-degree': 8, 'adaptatif-progression': 6, 'dictee-melodique': 5, 'cadences': 6, 'instruments': 6, 'dictee-rythmique': 6, 'chant-intervalle': 5, 'solfege-chante': 3, 'polyrythmie': 6 };

export const PROGRAMS = Object.entries(ROTATIONS).map(([slug, rotation]) => ({
  slug,
  icon: { 'oreille-30': '👂', 'rythme-30': '🥁', 'chanteurs-30': '🎤', 'accompagnateurs-30': '🎹' }[slug],
  days: Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    steps: rotation[i % rotation.length].map((id) => step(id, i + 1, QUESTIONS[id])),
  })),
}));
export const programBySlug = (slug) => PROGRAMS.find((p) => p.slug === slug);
