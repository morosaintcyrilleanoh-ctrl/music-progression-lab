// =====================================================================
// Statistiques d'un élève (utilisées par l'élève ET par le formateur)
// =====================================================================
import { html, mount, raw } from '../ui.js';
import { t } from '../i18n.js';
import { getUser } from '../auth.js';
import { getRecentAttempts, getRecentSessions, getSkillScores, getProfile } from '../data.js';
import { supabase } from '../supabase.js';


// Traduit un code d'erreur en phrase lisible
export function errorLabel(code) {
  const L = t('stats.errors');
  if (!code) return '';
  if (L[code]) return L[code];
  const m = /^(plus_aigu|plus_grave|identique)_au_lieu_de_(plus_aigu|plus_grave|identique)$/.exec(code);
  if (m) return t('stats.err_pitch', { a: L['_' + m[1]], b: L['_' + m[2]] });
  if (code.startsWith('dessin_')) return L.dessin;
  return code.replaceAll('_', ' ');
}

function weekStart(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // lundi
  return x;
}

// Histogramme simple (une seule série) en SVG, avec valeurs et infobulles
function barChart(items, { unit = '', max = null, label }) {
  const W = 640, H = 200, padB = 28, padT = 20;
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  const bw = W / items.length;
  const bars = items.map((it, i) => {
    const h = Math.round(((H - padB - padT) * it.value) / top);
    const x = i * bw + bw * 0.18, w = bw * 0.64, y = H - padB - h;
    return `<g><title>${it.label} : ${it.value} ${unit}</title>
      <rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${Math.max(h, it.value ? 3 : 0)}" rx="4" class="chart-bar"/>
      ${it.value ? `<text x="${(x + w / 2).toFixed(1)}" y="${y - 6}" text-anchor="middle" class="chart-val">${it.value}</text>` : ''}
      <text x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="chart-lbl">${it.short}</text></g>`;
  }).join('');
  return raw(`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${label}">
    <line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" class="chart-axis"/>${bars}</svg>`);
}

export async function renderStats(container, userId, { trainerView = false } = {}) {
  let attempts, sessions, scores, profile, skills;
  try {
    [attempts, sessions, scores, profile, skills] = await Promise.all([
      getRecentAttempts(userId, 60), getRecentSessions(userId, 60), getSkillScores(userId), getProfile(userId),
      supabase.from('skills').select('id, name, sort_order').order('sort_order').then((r) => r.data ?? [])
    ]);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="alert alert-error" role="alert">${t('errors.load')}</div>`;
    return;
  }
  const now = Date.now();
  const last30 = attempts.filter((a) => now - new Date(a.created_at) < 30 * 86400000);
  const success = last30.length ? Math.round((last30.reduce((s, a) => s + Number(a.score), 0) / last30.length) * 100) : null;
  const done = sessions.filter((s) => s.completed);
  const minutes = Math.round((profile?.total_practice_seconds ?? 0) / 60);

  // Temps d'entraînement par semaine (8 dernières semaines)
  const weeks = [];
  const w0 = weekStart(new Date());
  for (let i = 7; i >= 0; i--) {
    const start = new Date(w0); start.setDate(start.getDate() - i * 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const secs = done.filter((s) => new Date(s.started_at) >= start && new Date(s.started_at) < end).reduce((a, s) => a + (s.duration_seconds ?? 0), 0);
    weeks.push({ value: Math.round(secs / 60), short: `${start.getDate()}/${start.getMonth() + 1}`, label: t('stats.week_of', { d: start.toLocaleDateString('fr-FR') }) });
  }

  // Réussite par compétence (30 j) + tendance (7 derniers jours vs 7 précédents)
  const names = Object.fromEntries(skills.map((s) => [s.id, s.name]));
  const bySkill = {};
  for (const a of last30) {
    if (!a.skill_id) continue;
    const b = (bySkill[a.skill_id] ??= { n: 0, sum: 0, recent: [], older: [] });
    b.n++; b.sum += Number(a.score);
    const age = now - new Date(a.created_at);
    if (age < 7 * 86400000) b.recent.push(Number(a.score)); else if (age < 14 * 86400000) b.older.push(Number(a.score));
  }
  const avg = (l) => (l.length ? l.reduce((x, y) => x + y, 0) / l.length : null);
  const skillRows = skills.filter((s) => bySkill[s.id] || scores.some((x) => x.skill_id === s.id)).map((s) => {
    const b = bySkill[s.id];
    const sc = scores.find((x) => x.skill_id === s.id);
    const r = b ? avg(b.recent) : null, o = b ? avg(b.older) : null;
    const trend = r !== null && o !== null ? (r - o > 0.05 ? 'up' : o - r > 0.05 ? 'down' : 'flat') : null;
    return { id: s.id, name: s.name, rate: b ? Math.round((b.sum / b.n) * 100) : null, n: b?.n ?? 0, level: Math.round(Number(sc?.score ?? 0)), trend, due: sc && new Date(sc.next_review_at) <= new Date(), weak: sc && Number(sc.score) < 50 };
  });

  // Erreurs fréquentes
  const errCount = {};
  for (const a of last30) if (a.error_type) errCount[a.error_type] = (errCount[a.error_type] ?? 0) + 1;
  const topErrors = Object.entries(errCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Justesse vocale (micro)
  const mic = last30.filter((a) => a.used_mic && a.cents_offset !== null);
  const micAvg = mic.length ? Math.round(mic.reduce((s, a) => s + Math.abs(Number(a.cents_offset)), 0) / mic.length) : null;
  const micBias = mic.length ? mic.reduce((s, a) => s + Number(a.cents_offset), 0) / mic.length : 0;

  const best = done.filter((s) => s.score !== null).sort((a, b) => b.score - a.score).slice(0, 3);
  const toWork = skillRows.filter((s) => s.due || s.weak).sort((a, b) => a.level - b.level);

  if (!attempts.length && !sessions.length) {
    container.innerHTML = String(html`<div class="card center"><p style="margin:0">${trainerView ? t('stats.empty_trainer') : t('stats.empty')}</p>
      ${trainerView ? '' : html`<p style="margin:12px 0 0"><a class="btn" href="#/tableau-de-bord">${t('stats.go_train')}</a></p>`}</div>`);
    return;
  }

  container.innerHTML = String(html`
    <section class="grid grid-4" aria-label="${t('stats.kpis')}">
      <div class="card"><div class="stat-label">${t('stats.success')}</div><div class="stat-value">${success === null ? '–' : success + ' %'}</div><div class="stat-sub">${t('stats.last_30')}</div></div>
      <div class="card"><div class="stat-label">${t('stats.answers')}</div><div class="stat-value">${attempts.length}</div><div class="stat-sub">${t('stats.last_60')}</div></div>
      <div class="card"><div class="stat-label">${t('dashboard.time')}</div><div class="stat-value">${t('dashboard.minutes', { n: minutes })}</div><div class="stat-sub">${t('stats.total')}</div></div>
      <div class="card"><div class="stat-label">${t('stats.sessions')}</div><div class="stat-value">${done.length}</div><div class="stat-sub">${t('stats.last_60')}</div></div>
    </section>

    <section class="card" aria-labelledby="st-week">
      <h2 id="st-week" style="font-size:1.15rem">${t('stats.per_week')}</h2>
      ${barChart(weeks, { unit: 'min', label: t('stats.per_week') })}
      <details class="small"><summary>${t('stats.table')}</summary>
        <table class="data-table"><thead><tr><th>${t('stats.week')}</th><th>${t('stats.minutes')}</th></tr></thead>
        <tbody>${weeks.map((w) => html`<tr><td>${w.label}</td><td>${w.value}</td></tr>`)}</tbody></table></details>
    </section>

    <section class="card" aria-labelledby="st-skill">
      <h2 id="st-skill" style="font-size:1.15rem">${t('stats.per_skill')}</h2>
      <ul class="skills">
        ${skillRows.map((s) => html`<li>
          <div class="skill-head"><span>${s.name} ${s.trend ? html`<span class="trend trend-${s.trend}" title="${t('stats.trend_' + s.trend)}">${t('stats.arrow_' + s.trend)} <span class="sr-only">${t('stats.trend_' + s.trend)}</span></span>` : ''}</span>
            <span class="muted small">${s.rate === null ? t('stats.no_recent') : t('stats.rate', { r: s.rate, n: s.n })} · ${t('stats.level_score', { n: s.level })}</span></div>
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.level}" aria-label="${s.name}"><span style="width:${s.level}%"></span></div>
        </li>`)}
      </ul>
    </section>

    <div class="grid grid-2">
      <section class="card" aria-labelledby="st-todo">
        <h2 id="st-todo" style="font-size:1.15rem">${t('stats.to_work')}</h2>
        ${toWork.length ? html`<ul class="plain-list">${toWork.map((s) => html`<li><strong>${s.name}</strong> <span class="muted small">— ${s.weak ? t('stats.weak') : t('stats.due')}</span></li>`)}</ul>
          ${trainerView ? '' : html`<a class="btn btn-sm" href="#/entrainement">${t('stats.train_now')}</a>`}`
          : html`<p class="muted" style="margin:0">${t('stats.nothing_due')}</p>`}
      </section>
      <section class="card" aria-labelledby="st-err">
        <h2 id="st-err" style="font-size:1.15rem">${t('stats.frequent_errors')}</h2>
        ${topErrors.length ? html`<ol class="plain-list">${topErrors.map(([code, n]) => html`<li>${errorLabel(code)} <span class="muted small">(${n}×)</span></li>`)}</ol>`
          : html`<p class="muted" style="margin:0">${t('stats.no_errors')}</p>`}
      </section>
      <section class="card" aria-labelledby="st-mic">
        <h2 id="st-mic" style="font-size:1.15rem">${t('stats.pitch_title')}</h2>
        ${micAvg === null ? html`<p class="muted" style="margin:0">${t('stats.pitch_none')}</p>` : html`
          <p style="margin:0">${t('stats.pitch_avg', { n: micAvg, count: mic.length })}</p>
          <p class="muted small" style="margin:6px 0 0">${Math.abs(micBias) < 10 ? t('stats.pitch_centered') : micBias < 0 ? t('stats.pitch_low') : t('stats.pitch_high')}</p>`}
      </section>
      <section class="card" aria-labelledby="st-best">
        <h2 id="st-best" style="font-size:1.15rem">${t('stats.best')}</h2>
        ${best.length ? html`<ul class="plain-list">${best.map((s) => html`<li><strong>${Math.round(s.score)} %</strong> <span class="muted small">— ${new Date(s.started_at).toLocaleDateString('fr-FR')}</span></li>`)}</ul>`
          : html`<p class="muted" style="margin:0">–</p>`}
      </section>
    </div>`);
}

export async function statsPage() {
  mount(html`<div class="container dash"><div><h1>${t('stats.title')}</h1><p class="muted" style="margin:0">${t('stats.lead')}</p></div><div id="stats-zone" class="dash-inner"><div class="spinner" role="status"></div></div></div>`);
  await renderStats(document.getElementById('stats-zone'), getUser().id);
}

