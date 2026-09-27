// =====================================================================
// Lecture des données dans Supabase
// Les règles de sécurité de la base garantissent que chacun ne voit que
// ce qu'il a le droit de voir.
// =====================================================================
import { supabase } from './supabase.js';

export const STARTER_PROGRAM = 'demarrage-7-jours';

// Compétences affichées sur le tableau de bord (ordre d'affichage)
export const DASHBOARD_SKILLS = ['hauteur', 'justesse', 'rythme', 'melodie', 'intervalles', 'accords'];

function check({ data, error }) {
  if (error) throw error;
  return data;
}

export async function getStarterProgram() {
  const program = check(await supabase
    .from('programs')
    .select('id, slug, title, description, duration_days')
    .eq('slug', STARTER_PROGRAM)
    .maybeSingle());
  if (!program) return null;
  const days = check(await supabase
    .from('program_days')
    .select('id, day_number, title, objective, duration_minutes')
    .eq('program_id', program.id)
    .order('day_number'));
  return { ...program, days };
}

export async function getProgramDay(dayNumber) {
  const program = check(await supabase
    .from('programs').select('id, title, duration_days').eq('slug', STARTER_PROGRAM).maybeSingle());
  if (!program) return null;
  const day = check(await supabase
    .from('program_days')
    .select('*')
    .eq('program_id', program.id)
    .eq('day_number', dayNumber)
    .maybeSingle());
  return day ? { program, day } : null;
}

export async function getProfile(userId) {
  return check(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
}

export async function updateVoiceRange(userId, voiceRange) {
  return check(await supabase.from('profiles').update({ voice_range: voiceRange }).eq('id', userId).select().single());
}

export async function getUserProgram(userId, programId) {
  return check(await supabase
    .from('user_programs')
    .select('*')
    .eq('user_id', userId)
    .eq('program_id', programId)
    .maybeSingle());
}

export async function getSkillsWithScores(userId) {
  const [skills, scores] = await Promise.all([
    supabase.from('skills').select('id, name, sort_order').order('sort_order'),
    supabase.from('skill_scores').select('skill_id, score, level').eq('user_id', userId)
  ]);
  const skillRows = check(skills);
  const scoreRows = check(scores);
  const byId = Object.fromEntries(scoreRows.map((s) => [s.skill_id, s]));
  return skillRows.map((s) => ({ ...s, score: Number(byId[s.id]?.score ?? 0), level: byId[s.id]?.level ?? 1 }));
}

export async function getLevels() {
  return check(await supabase.from('levels').select('id, name').order('id'));
}

export async function countUserBadges(userId) {
  const { count, error } = await supabase
    .from('user_achievements')
    .select('achievement_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

// ---------------------------------------------------------------------
// Séances d'entraînement
// ---------------------------------------------------------------------
export async function getDayExercises(programDayId) {
  const rows = check(await supabase
    .from('program_day_exercises')
    .select('sort_order, params_override, exercise:exercises(id, slug, skill_id, type, title, objective, instructions, explanation, params, requires_mic)')
    .eq('program_day_id', programDayId)
    .order('sort_order'));
  return rows
    .filter((r) => r.exercise)
    .map((r) => ({ ...r.exercise, params: { ...(r.exercise.params ?? {}), ...(r.params_override ?? {}) } }));
}

export async function getExerciseBySlug(slug) {
  return check(await supabase
    .from('exercises')
    .select('id, slug, skill_id, type, title, objective, instructions, explanation, params, requires_mic')
    .eq('slug', slug)
    .maybeSingle());
}

export async function startSession(programDayId) {
  return check(await supabase.rpc('start_session', { p_program_day_id: programDayId }));
}

export async function recordAttempt(sessionId, exerciseId, item) {
  return check(await supabase.rpc('record_attempt', {
    p_exercise_id: exerciseId,
    p_session_id: sessionId,
    p_is_correct: !!item.is_correct,
    p_score: Math.max(0, Math.min(1, Number(item.score) || 0)),
    p_expected: item.expected ?? null,
    p_answer: item.answer ?? null,
    p_error_type: item.error_type ?? null,
    p_cents_offset: item.cents_offset ?? null,
    p_response_ms: item.response_ms ?? null,
    p_used_mic: !!item.used_mic
  }));
}

export async function completeSession(sessionId, { score = null, notebook = null, validated = true } = {}) {
  return check(await supabase.rpc('complete_session', {
    p_session_id: sessionId,
    p_score: score,
    p_notebook: notebook,
    p_validated: validated
  }));
}

export async function getBadgesSince(userId, sinceIso) {
  return check(await supabase
    .from('user_achievements')
    .select('earned_at, achievement:achievements(title, description)')
    .eq('user_id', userId)
    .gte('earned_at', sinceIso));
}

// Meilleur score d'une séance validée pour un jour donné (pour comparer jour 1 / jour 7)
export async function getBestDayScore(userId, programDayId) {
  const rows = check(await supabase
    .from('practice_sessions')
    .select('score')
    .eq('user_id', userId)
    .eq('program_day_id', programDayId)
    .eq('completed', true)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(1));
  return rows[0]?.score ?? null;
}
