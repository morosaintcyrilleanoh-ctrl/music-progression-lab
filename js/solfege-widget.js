// =====================================================================
// Accueil du volet Solfège (/solfege/) : prochain live et formation en cours
// de l'élève connecté, affichés dans <div id="mpl-espace-widget">.
// Styles écrits ici : la page du solfège n'a pas la feuille de style du Lab.
// =====================================================================
import { html } from './ui.js';
import { t } from './i18n.js';
import { getSolfegeLives, getSolfegeCourses, getSolfegeProgress } from './data.js';
import { supabase } from './supabase.js';
import { liveState, fmtWhen, safeUrl } from './pages/solfege-media.js';

const CARD = 'display:block;background:#fff;border:1px solid #e2e8f2;border-radius:16px;padding:16px;margin:0 0 12px;color:#0b2545;text-decoration:none;box-shadow:0 1px 2px rgba(11,37,69,.05)';
const BADGE = 'display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:3px 9px;background:#eff5ff;color:#1d4ed8';
const BTN = 'display:flex;align-items:center;justify-content:center;min-height:44px;margin-top:10px;border-radius:12px;background:#1d4ed8;color:#fff;font-weight:700;text-decoration:none';

export async function renderEspaceWidget() {
  const el = document.getElementById('mpl-espace-widget');
  if (!el || el.dataset.state) return;
  el.dataset.state = 'loading';
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return;
    const [lives, courses, progress] = await Promise.all([getSolfegeLives(), getSolfegeCourses(), getSolfegeProgress(uid)]);
    const live = lives.find((l) => liveState(l) !== 'past' && Date.parse(l.starts_at) - Date.now() < 7 * 86400000);
    const done = new Set(progress.map((p) => p.lesson_id));
    const stats = courses.filter((c) => c.lessons.length).map((c) => ({ c, d: c.lessons.filter((l) => done.has(l.id)).length, n: c.lessons.length }));
    const course = stats.find((s) => s.d > 0 && s.d < s.n) ?? stats.find((s) => s.d < s.n);
    if (!live && !course) return;
    const now = live && liveState(live) === 'now';
    el.innerHTML = String(html`
      ${live ? html`<div style="${CARD};${now ? 'border-color:#fecaca;box-shadow:0 0 0 3px #fee2e2' : ''}">
        <span style="${BADGE};${now ? 'background:#fee2e2;color:#dc2626' : ''}">${now ? '● ' + t('sol.live_now') : t('sol.live_upcoming')}</span>
        <span style="font-size:13px;color:#5b6b85;margin-left:6px">${fmtWhen(live.starts_at)}</span>
        <strong style="display:block;margin-top:8px">${live.title}</strong>
        <a style="${BTN}${now ? '' : ';background:#fff;color:#0b2545;border:1px solid #e2e8f2'}" href="${safeUrl(live.meeting_url)}" target="_blank" rel="noopener noreferrer">${now ? t('sol.join_live') : t('sol.live_link')} ↗</a>
      </div>` : ''}
      ${course ? html`<a style="${CARD}" href="/#/espace-solfege/formation/${course.c.id}">
        <span style="${BADGE}">${course.d ? t('sol.course_in_progress') : t('sol.course_new')}</span>
        <strong style="display:block;margin-top:8px">${course.c.title}</strong>
        <span style="display:block;font-size:13px;color:#5b6b85">${t('sol.lessons_progress', { d: course.d, n: course.n })}</span>
        <span style="display:block;height:8px;border-radius:9px;background:#eff5ff;margin-top:8px;overflow:hidden"><span style="display:block;height:100%;width:${Math.round((course.d / course.n) * 100)}%;background:#1d4ed8"></span></span>
      </a>` : ''}`);
    el.dataset.state = 'done';
  } catch {
    // espace solfège pas encore activé ou hors connexion : l'accueil reste tel quel
  }
}
