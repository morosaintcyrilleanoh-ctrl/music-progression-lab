// Espace Solfège : affichage des ressources (audio, vidéo, image, PDF, texte, lien)
// et des vidéos de leçon (YouTube, Google Drive ou fichier envoyé).
import { html, toast, setBusy } from '../ui.js';
import { t } from '../i18n.js';
import { getSolfegeFileUrls } from '../data.js';

export const KIND_ICONS = { audio: '🎧', video: '🎬', image: '🖼', pdf: '📄', text: '📝', link: '🔗' };
export const MAX_MB = 50;

export function safeUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '#'; } catch { return '#'; }
}

// Lien YouTube ou Google Drive → adresse à intégrer dans la page (sinon null)
export function embedUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null;
  }
  if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  const drive = host === 'drive.google.com' && u.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1];
  if (drive) return `https://drive.google.com/file/d/${drive}/preview`;
  return null;
}

export function videoEmbed(url, title) {
  const src = embedUrl(url);
  if (!src) return html`<a class="btn btn-sm" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">▶ ${t('sol.watch_video')} ↗</a>`;
  return html`<div class="sol-embed"><iframe src="${src}" title="${title}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}

function sizeLabel(bytes) {
  if (!bytes) return '';
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

// Une ressource. `meta` : texte affiché sous le titre (date, destinataire…)
export function resourceCard(r, { deletable = false, meta = '' } = {}) {
  const label = t('sol.kinds')[r.kind] ?? r.kind;
  const sub = [r.url && r.kind === 'video' ? t('sol.video_link') : label, sizeLabel(r.file_size), meta].filter(Boolean).join(' · ');
  return html`
    <li class="res-item sol-res" data-kind="${r.kind}" data-res="${r.id}">
      <div class="res-head">
        <span class="sol-ico" aria-hidden="true">${KIND_ICONS[r.kind] ?? '📁'}</span>
        <div style="flex:1;min-width:0">
          <strong>${r.title}</strong>
          <div class="muted small">${sub}</div>
          ${r.description ? html`<p class="muted small" style="margin:4px 0 0">${r.description}</p>` : ''}
        </div>
        ${deletable ? html`<button class="btn btn-ghost btn-sm" type="button" data-del="${r.id}" aria-label="${t('trainer.delete')} ${r.title}">🗑</button>` : ''}
      </div>
      <div class="res-actions">${resourceBody(r)}</div>
    </li>`;
}

function resourceBody(r) {
  if (r.kind === 'text') return html`<details><summary>${t('course.read_text')}</summary><div class="res-text">${r.body}</div></details>`;
  if (r.url) {
    if (r.kind === 'video') return videoEmbed(r.url, r.title);
    return html`<a class="btn btn-sm" href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer">${t('course.open_link')} ↗</a>`;
  }
  if (r.kind === 'image') return html`<img class="sol-img" data-img="${r.storage_path}" alt="${r.title}" hidden>`;
  if (r.kind === 'audio') return html`<button class="btn btn-sm" type="button" data-play="${r.storage_path}" data-tag="audio">▶ ${t('course.listen')}</button>`;
  if (r.kind === 'video') return html`<button class="btn btn-sm" type="button" data-play="${r.storage_path}" data-tag="video">▶ ${t('sol.watch_video')}</button>`;
  return html`<button class="btn btn-sm" type="button" data-open="${r.storage_path}">${t('course.open_pdf')}</button>`;
}

// Charge les images et branche lecture / ouverture des fichiers dans `root`
export function bindMedia(root) {
  if (!root) return;
  const imgs = [...root.querySelectorAll('img[data-img]')];
  if (imgs.length) {
    getSolfegeFileUrls(imgs.map((i) => i.dataset.img)).then((urls) => {
      for (const img of imgs) {
        const url = urls[img.dataset.img];
        if (!url) continue;
        img.src = url;
        img.hidden = false;
        img.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
      }
    }).catch((err) => console.error(err));
  }
  root.addEventListener('click', async (e) => {
    const play = e.target.closest('[data-play]');
    const open = e.target.closest('[data-open]');
    if (play) {
      setBusy(play, true);
      try {
        const url = (await getSolfegeFileUrls([play.dataset.play]))[play.dataset.play];
        if (!url) throw new Error('lien');
        const media = document.createElement(play.dataset.tag === 'video' ? 'video' : 'audio');
        media.controls = true; media.src = url; media.preload = 'auto';
        media.className = play.dataset.tag === 'video' ? 'sol-video' : 'res-audio';
        if (play.dataset.tag === 'video') media.setAttribute('playsinline', '');
        play.replaceWith(media);
        media.play().catch(() => {});
      } catch (err) { console.error(err); setBusy(play, false); toast(t('course.file_error'), 'error'); }
    }
    if (open) {
      const win = window.open('', '_blank');
      try {
        const url = (await getSolfegeFileUrls([open.dataset.open]))[open.dataset.open];
        if (!url) throw new Error('lien');
        if (win) win.location = url; else window.location.href = url;
      } catch (err) { console.error(err); if (win) win.close(); toast(t('course.file_error'), 'error'); }
    }
  });
}

// Type d'un fichier choisi par le formateur (null si non accepté)
export function fileKind(f) {
  const type = f.type || '';
  if (type === 'application/pdf' || /\.pdf$/i.test(f.name)) return 'pdf';
  if (type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|weba)$/i.test(f.name)) return 'audio';
  if (type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(f.name)) return 'video';
  if (/^image\/(jpeg|png|webp|gif)$/.test(type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name)) return 'image';
  return null;
}
export const FILE_ACCEPT = 'audio/*,video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm,.jpg,.jpeg,.png,.webp,.gif';

// Live : en cours (de 15 min avant le début jusqu'à la fin), à venir ou passé
export function liveState(live, now = Date.now()) {
  const start = Date.parse(live.starts_at);
  const end = start + live.duration_minutes * 60000;
  if (now >= start - 15 * 60000 && now <= end) return 'now';
  return now < start ? 'upcoming' : 'past';
}
export function fmtWhen(d) {
  return new Date(d).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
export const fmtDay = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
