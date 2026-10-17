// =====================================================================
// Volet Solfège → compte de l'élève
// Le solfège (dossier /solfege, même adresse que le Lab) garde ses séances dans
// le stockage local du navigateur. Chaque séance faite en étant connecté porte
// l'identifiant de l'élève ; ici on envoie dans la table solfege_sessions celles
// de l'élève connecté, sans jamais toucher aux séances d'un autre compte.
// =====================================================================
import { supabase, isConfigured } from './supabase.js';

const NOTE_KEY = 'solfege-progression:note-reading:history:v1';
const QUIZ_LABS = ['rythme', 'tonalites', 'intervalles'];
const quizKey = (lab) => `solfege-progression:quiz:${lab}:history:v1`;
const PLACEMENT_OUTBOX = 'mpl:solfege:placement-outbox:v1';
const syncedKey = (uid) => `mpl:solfege-synced:v1:${uid}`;
// Une séance non terminée n'est envoyée qu'une fois abandonnée (3 h sans fin).
const ABANDONED_MS = 3 * 60 * 60 * 1000;
const BATCH = 50;

function readList(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function readObject(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

const isDate = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s));
const isCount = (n) => Number.isInteger(n) && n >= 0;

// Bonnes réponses / total par compétence : { "clé": [bonnes, total] }
function tally(items, keyOf) {
  const out = {};
  for (const item of items) {
    const key = String(keyOf(item) ?? '').slice(0, 40);
    if (!key || (!out[key] && Object.keys(out).length >= 40)) continue;
    const s = (out[key] ??= [0, 0]);
    s[1] += 1;
    if (item?.c === true) s[0] += 1;
  }
  return out;
}

function sessionRow(s, lab, now) {
  if (!s || typeof s.id !== 'string' || !s.id || s.id.length > 80) return null;
  if (s.mode !== 'training' && s.mode !== 'evaluation') return null;
  if (!isCount(s.total) || !isCount(s.correct) || s.total < 1 || s.total > 500 || s.correct > s.total) return null;
  if (!isDate(s.startedAt) || (s.finishedAt != null && !isDate(s.finishedAt))) return null;
  if (!s.finishedAt && now - Date.parse(s.startedAt) < ABANDONED_MS) return null;
  const items = Array.isArray(s.items) ? s.items : [];
  const note = lab === 'lecture-des-notes';
  return {
    client_id: `${lab}:${s.id}`,
    lab,
    mode: s.mode,
    correct: s.correct,
    total: s.total,
    level: note ? String(s.level ?? '').slice(0, 40) || null : (s.difficulty != null ? `niveau ${s.difficulty}` : null),
    average_ms: Number.isFinite(s.averageMs) ? Math.min(600000, Math.max(0, Math.round(s.averageMs))) : null,
    // Lecture des notes : par clé (sol, fa) ; autres volets : par compétence.
    skills: tally(items, note ? (i) => String(i?.k ?? '').split(':')[0] : (i) => i?.s),
    started_at: s.startedAt,
    finished_at: s.finishedAt ?? null
  };
}

function placementRow(p) {
  if (!p || !isDate(p.takenAt) || typeof p.level !== 'string') return null;
  const skills = {};
  let correct = 0;
  let total = 0;
  for (const [area, v] of Object.entries(p.scores ?? {}).slice(0, 40)) {
    if (!v || !isCount(v.correct) || !isCount(v.total) || v.correct > v.total) continue;
    skills[area.slice(0, 40)] = [v.correct, v.total];
    correct += v.correct;
    total += v.total;
  }
  if (total < 1 || total > 500) return null;
  return {
    client_id: `positionnement:${p.takenAt}`.slice(0, 100),
    lab: 'positionnement',
    mode: 'placement',
    correct,
    total,
    level: p.level.slice(0, 40),
    average_ms: null,
    skills,
    started_at: p.takenAt,
    finished_at: p.takenAt
  };
}

/** Séances de cet appareil appartenant à l'élève `uid`, au format de la table. */
export function collectSolfegeRows(uid, now = Date.now()) {
  const rows = [];
  const mine = (s) => s && s.owner === uid;
  for (const s of readList(NOTE_KEY).filter(mine)) rows.push(sessionRow(s, 'lecture-des-notes', now));
  for (const lab of QUIZ_LABS) {
    for (const s of readList(quizKey(lab)).filter(mine)) rows.push(sessionRow(s, lab, now));
  }
  for (const p of readList(PLACEMENT_OUTBOX).filter(mine)) rows.push(placementRow(p));
  return rows.filter(Boolean);
}

const signature = (r) => `${r.correct}/${r.total}/${r.finished_at ?? ''}`;

let running = null;

/**
 * Envoie les séances nouvelles ou modifiées de l'élève connecté.
 * Renvoie { sent, pending } ; { missing: true } si la table n'existe pas encore.
 * Une séance n'est notée « envoyée » qu'après la réponse positive de la base.
 */
export function syncSolfege() {
  if (!running) running = run().finally(() => { running = null; });
  return running;
}

async function run() {
  if (!isConfigured) return { sent: 0, pending: 0 };
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return { sent: 0, pending: 0 };

  const rows = collectSolfegeRows(uid);
  const synced = readObject(syncedKey(uid));
  const todo = rows.filter((r) => synced[r.client_id] !== signature(r));
  const keep = new Set(rows.map((r) => r.client_id));
  let sent = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH).map((r) => ({ ...r, user_id: uid }));
    const { error } = await supabase.from('solfege_sessions').upsert(batch, { onConflict: 'user_id,client_id' });
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return { sent, pending: todo.length - sent, missing: true };
      console.warn('Solfège : envoi impossible pour le moment', error.message);
      return { sent, pending: todo.length - sent, error };
    }
    for (const r of batch) synced[r.client_id] = signature(r);
    sent += batch.length;
    // On ne garde que les séances encore présentes sur l'appareil.
    const pruned = Object.fromEntries(Object.entries(synced).filter(([k]) => keep.has(k)));
    try { localStorage.setItem(syncedKey(uid), JSON.stringify(pruned)); } catch { /* sera renvoyé, sans doublon */ }
  }
  // Tests de niveau envoyés : on vide la file d'attente de cet élève.
  if (todo.some((r) => r.lab === 'positionnement')) {
    const rest = readList(PLACEMENT_OUTBOX).filter((p) => p?.owner !== uid || !rows.some((r) => r.lab === 'positionnement' && r.started_at === p.takenAt));
    try { localStorage.setItem(PLACEMENT_OUTBOX, JSON.stringify(rest)); } catch { /* sans gravité */ }
  }
  return { sent, pending: 0 };
}
