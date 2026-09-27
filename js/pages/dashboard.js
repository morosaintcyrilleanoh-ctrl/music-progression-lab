// Mon tableau de bord
import { html, mount, toast } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import {
  getProfile, getStarterProgram, getUserProgram, getSkillsWithScores,
  getLevels, countUserBadges, updateVoiceRange, DASHBOARD_SKILLS
} from '../data.js';

export async function dashboardPage() {
  const user = getUser();
  let profile, program, userProgram, skills, levels, badges;
  try {
    [profile, program, skills, levels, badges] = await Promise.all([
      getProfile(user.id),
      getStarterProgram(),
      getSkillsWithScores(user.id),
      getLevels(),
      countUserBadges(user.id)
    ]);
    userProgram = program ? await getUserProgram(user.id, program.id) : null;
  } catch (err) {
    console.error(err);
    mount(html`
      <div class="container dash">
        <h1>${t('dashboard.hello_anon')}</h1>
        <div class="alert alert-error" role="alert">${t('errors.load')}</div>
        <button class="btn" type="button" onclick="location.reload()">${t('common.retry')}</button>
      </div>`);
    return;
  }

  const firstName = (profile?.full_name ?? user.user_metadata?.full_name ?? '').split(' ')[0];
  const total = program?.duration_days ?? 7;
  const finished = userProgram?.status === 'completed';
  const currentDayNumber = userProgram?.current_day ?? 1;
  const daysDone = finished ? total : Math.max(0, currentDayNumber - 1);
  const progress = Math.round((daysDone / total) * 100);
  const today = program?.days.find((d) => d.day_number === currentDayNumber) ?? program?.days[0];
  const levelName = levels.find((l) => l.id === (profile?.level ?? 1))?.name ?? '';
  const minutes = Math.round((profile?.total_practice_seconds ?? 0) / 60);
  const streak = profile?.current_streak ?? 0;
  const shownSkills = DASHBOARD_SKILLS.map((id) => skills.find((s) => s.id === id)).filter(Boolean);

  mount(html`
    <div class="container dash">
      <div>
        <h1>${firstName ? t('dashboard.hello', { name: firstName }) : t('dashboard.hello_anon')}</h1>
        ${today && !finished ? html`
          <p class="muted" style="margin:0">${t('dashboard.goal_label')} :</p>
          <p style="font-size:1.15rem;font-weight:700;margin:0">${today.objective}</p>` : ''}
      </div>

      ${!profile?.voice_range ? html`
        <section class="card" aria-labelledby="voice-title" id="voice-card">
          <h2 id="voice-title" style="font-size:1.2rem">${t('dashboard.voice_title')}</h2>
          <p class="muted">${t('dashboard.voice_lead')}</p>
          <div class="choice-row">
            <button class="btn btn-ghost" type="button" data-voice="grave">${t('dashboard.voice_grave')}</button>
            <button class="btn btn-ghost" type="button" data-voice="aigu">${t('dashboard.voice_aigu')}</button>
          </div>
        </section>` : ''}

      <section class="card card-highlight today" aria-labelledby="today-title">
        <div>
          <p class="eyebrow" style="color:#e0e7ff">${t('dashboard.today')}</p>
          ${finished ? html`<p id="today-title" style="margin:0;font-weight:700">${t('dashboard.program_done')}</p>` : html`
            <h2 id="today-title" style="margin-bottom:4px">${today?.title ?? ''}</h2>
            <p class="small" style="margin:0;color:#e0e7ff">
              ${t('dashboard.day_label', { n: currentDayNumber, total })} · ${t('dashboard.duration', { n: today?.duration_minutes ?? 15 })}
            </p>`}
        </div>
        ${finished ? '' : html`<a class="btn btn-lg" style="background:#fff;color:#1e1b4b" href="#/seance/${currentDayNumber}">${t('dashboard.start')} →</a>`}
      </section>

      <section class="grid grid-4" aria-label="Statistiques">
        <div class="card">
          <div class="stat-label">${t('dashboard.progress')}</div>
          <div class="stat-value">${progress} %</div>
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" aria-label="${t('dashboard.progress')}"><span style="width:${progress}%"></span></div>
        </div>
        <div class="card">
          <div class="stat-label">${t('dashboard.streak')}</div>
          <div class="stat-value">${t('dashboard.streak_unit', { n: streak })}</div>
        </div>
        <div class="card">
          <div class="stat-label">${t('dashboard.time')}</div>
          <div class="stat-value">${t('dashboard.minutes', { n: minutes })}</div>
        </div>
        <div class="card">
          <div class="stat-label">${t('dashboard.level')}</div>
          <div class="stat-value">${levelName}</div>
          <div class="stat-sub">${t('dashboard.xp', { n: profile?.xp ?? 0 })} · ${t('dashboard.badges')} : ${badges}</div>
        </div>
      </section>

      <section class="card" aria-labelledby="skills-title">
        <h2 id="skills-title" style="font-size:1.25rem">${t('dashboard.skills_title')}</h2>
        <ul class="skills">
          ${shownSkills.map((s) => {
            const pct = Math.round(s.score);
            return html`
              <li>
                <div class="skill-head"><span>${s.name}</span><span class="muted">${pct} %</span></div>
                <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${s.name}"><span style="width:${pct}%"></span></div>
              </li>`;
          })}
        </ul>
        <p class="muted small" style="margin:16px 0 0">${t('dashboard.skills_hint')}</p>
      </section>

      <div><a class="btn btn-ghost" href="#/programme">${t('dashboard.see_program')}</a></div>
    </div>
  `);

  document.querySelectorAll('[data-voice]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await updateVoiceRange(user.id, btn.dataset.voice);
        document.getElementById('voice-card')?.remove();
        toast(t('dashboard.voice_saved'), 'success');
      } catch (err) {
        console.error(err);
        toast(t('errors.generic'), 'error');
      }
    });
  });
}
