// =====================================================================
// Outils communs à tous les exercices (boutons, corrections, attente)
// =====================================================================
import { html } from '../ui.js';
import { t } from '../i18n.js';

// Affiche du HTML sûr dans une zone
export function set(el, content) { el.innerHTML = String(content); return el; }

// Attend un clic sur un bouton [data-action="..."] (ou une touche clavier)
export function waitAction(root, actions, keys = {}) {
  return new Promise((resolve) => {
    const onClick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || !root.contains(btn) || btn.disabled) return;
      if (actions && !actions.includes(btn.dataset.action)) return;
      cleanup(); resolve(btn.dataset.action);
    };
    const onKey = (e) => {
      if (!document.contains(root)) { cleanup(); return; } // la page a changé
      if (e.target.matches('input, textarea')) return;
      const action = keys[e.key];
      if (action) { e.preventDefault(); cleanup(); resolve(action); }
    };
    const cleanup = () => { root.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
  });
}

// Boutons de réponse (1, 2, 3… au clavier). Renvoie { value, ms }
export async function askChoice(zone, choices, { onReplay } = {}) {
  const started = performance.now();
  set(zone, html`
    <div class="choices" role="group" aria-label="${t('ex.choose')}">
      ${choices.map((c, i) => html`
        <button class="choice" type="button" data-action="choice:${c.value}">
          <span class="choice-key" aria-hidden="true">${i + 1}</span>${c.label}
        </button>`)}
    </div>
    ${onReplay ? html`<button class="btn btn-ghost btn-sm replay" type="button" data-action="replay">↻ ${t('ex.replay')} <span class="muted small">(R)</span></button>` : ''}`);
  const keys = Object.fromEntries(choices.map((c, i) => [String(i + 1), `choice:${c.value}`]));
  if (onReplay) { keys.r = 'replay'; keys.R = 'replay'; }
  const actions = [...choices.map((c) => `choice:${c.value}`), 'replay'];
  // La réécoute ne fait pas quitter la question
  for (;;) {
    const action = await waitAction(zone, actions, keys);
    if (action === 'replay') { await onReplay(); continue; }
    const value = action.slice('choice:'.length);
    zone.querySelectorAll('.choice').forEach((b) => {
      b.disabled = true;
      if (b.dataset.action === action) b.classList.add('is-picked');
    });
    return { value, ms: Math.round(performance.now() - started) };
  }
}

// Correction : bonne réponse / erreur expliquée
export function feedback(zone, { ok, title, text, tip }) {
  set(zone, html`
    <div class="feedback ${ok ? 'is-ok' : 'is-ko'}" role="status" aria-live="polite">
      <strong>${ok ? '✓ ' : '✗ '}${title}</strong>
      ${text ? html`<p>${text}</p>` : ''}
      ${tip ? html`<p class="tip">💡 ${tip}</p>` : ''}
    </div>`);
}

// Bouton "Suivant" (ou Entrée)
export async function next(zone, label = t('ex.next')) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-lg btn-block';
  btn.dataset.action = 'next';
  btn.textContent = label;
  zone.appendChild(btn);
  btn.focus({ preventScroll: true });
  await waitAction(zone, ['next'], { Enter: 'next' });
}

// Barre de progression interne à un exercice
export function counter(el, current, total) {
  set(el, html`<p class="ex-counter">${t('ex.question', { n: current, total })}</p>
    <div class="bar" aria-hidden="true"><span style="width:${Math.round(((current - 1) / total) * 100)}%"></span></div>`);
}
