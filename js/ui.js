// =====================================================================
// Petits outils d'affichage
// =====================================================================

// Protège contre l'injection de code : tout texte venant de la base ou de
// l'utilisateur est "échappé" avant d'être affiché.
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Marque un morceau de HTML comme "sûr" (écrit par nous, pas par l'utilisateur)
class Safe { constructor(value) { this.value = value; } toString() { return this.value; } }
export const raw = (value) => new Safe(value);

// Modèle HTML : html`<p>${texte}</p>` échappe automatiquement ${texte}
export function html(strings, ...values) {
  let out = '';
  strings.forEach((str, i) => {
    out += str;
    if (i < values.length) out += render(values[i]);
  });
  return new Safe(out);
}

function render(value) {
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === false || value == null) return '';
  return escapeHtml(value);
}

// Affiche une page dans la zone principale
export function mount(content) {
  const main = document.getElementById('main');
  main.innerHTML = render(content);
  main.removeAttribute('aria-busy');
  return main;
}

export function showLoading() {
  mount(html`<div class="container page-loading" aria-busy="true"><div class="spinner" role="status" aria-label="Chargement"></div></div>`);
}

// Message temporaire en bas de l'écran
export function toast(message, tone = 'info', duration = 5000) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.tone = tone;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// Affiche une erreur dans un formulaire (zone role="alert")
export function setFormMessage(form, message, tone = 'error') {
  const zone = form.querySelector('[data-form-message]');
  if (!zone) return;
  if (!message) { zone.innerHTML = ''; return; }
  zone.innerHTML = `<div class="alert alert-${tone}" role="${tone === 'error' ? 'alert' : 'status'}">${escapeHtml(message)}</div>`;
}

export function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
}
