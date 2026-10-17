// =====================================================================
// Illustrations vectorielles (légères, animées en CSS, sans fichier image)
// Les animations s'arrêtent si l'utilisateur a demandé moins de mouvement.
// =====================================================================

/** Accueil : lecteur audio stylisé avec égaliseur animé, portée et notes flottantes. */
export function heroArt() {
  const bars = [38, 62, 84, 54, 92, 70, 46, 80, 58, 34, 66, 50];
  return `
  <svg class="hero-art" viewBox="0 0 440 340" role="img" aria-label="Illustration : écoute et lecture musicale">
    <defs>
      <linearGradient id="art-card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f3f7ff"/></linearGradient>
      <filter id="art-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0b2545" flood-opacity="0.28"/></filter>
    </defs>
    <circle cx="370" cy="64" r="54" fill="#ffffff" opacity="0.08"/>
    <circle cx="80" cy="276" r="56" fill="#ffffff" opacity="0.06"/>
    <g filter="url(#art-shadow)">
      <rect x="40" y="46" width="300" height="236" rx="22" fill="url(#art-card)"/>
    </g>
    <!-- en-tête du lecteur -->
    <rect x="62" y="68" width="40" height="40" rx="12" fill="#1d4ed8"/>
    <path d="M76 80v16l12-8z" fill="#fff"/>
    <rect x="114" y="74" width="120" height="10" rx="5" fill="#0b2545" opacity="0.85"/>
    <rect x="114" y="92" width="78" height="8" rx="4" fill="#94a3b8" opacity="0.7"/>
    <!-- égaliseur -->
    <g transform="translate(64 214)">
      ${bars.map((h, i) => `<rect class="art-eq" style="animation-delay:${(i % 6) * -0.17}s" x="${i * 21}" y="${-h}" width="12" height="${h}" rx="6" fill="${i % 3 === 1 ? '#60a5fa' : '#1d4ed8'}"/>`).join('')}
    </g>
    <!-- progression -->
    <rect x="64" y="238" width="252" height="6" rx="3" fill="#dbe7ff"/>
    <rect class="art-progress" x="64" y="238" width="120" height="6" rx="3" fill="#1d4ed8"/>
    <rect x="64" y="254" width="34" height="6" rx="3" fill="#cbd5e1"/>
    <rect x="282" y="254" width="34" height="6" rx="3" fill="#cbd5e1"/>
    <!-- carte portée -->
    <g class="art-float-slow">
      <g filter="url(#art-shadow)"><rect x="262" y="150" width="152" height="104" rx="18" fill="#ffffff"/></g>
      <g stroke="#0b2545" stroke-width="1.6" opacity="0.8">
        ${[0, 1, 2, 3, 4].map((k) => `<line x1="276" x2="400" y1="${178 + k * 11}" y2="${178 + k * 11}"/>`).join('')}
      </g>
      <g fill="#1d4ed8">
        <ellipse class="art-pop" style="animation-delay:0s" cx="306" cy="216" rx="7" ry="5.4" transform="rotate(-20 306 216)"/>
        <ellipse class="art-pop" style="animation-delay:.4s" cx="338" cy="205" rx="7" ry="5.4" transform="rotate(-20 338 205)"/>
        <ellipse class="art-pop" style="animation-delay:.8s" cx="370" cy="194" rx="7" ry="5.4" transform="rotate(-20 370 194)"/>
      </g>
      <g stroke="#1d4ed8" stroke-width="2"><line x1="312.5" x2="312.5" y1="214" y2="182"/><line x1="344.5" x2="344.5" y1="203" y2="171"/><line x1="376.5" x2="376.5" y1="192" y2="160"/></g>
    </g>
    <!-- notes flottantes -->
    <g fill="#ffffff">
      <g class="art-float" style="animation-delay:-1s"><ellipse cx="392" cy="122" rx="9" ry="7" transform="rotate(-20 392 122)"/><rect x="398" y="86" width="3" height="36"/><path d="M401 86c8 4 12 8 10 16-3-6-6-8-10-9z"/></g>
      <g class="art-float" style="animation-delay:-2.4s" opacity="0.85"><ellipse cx="24" cy="120" rx="8" ry="6" transform="rotate(-20 24 120)"/><rect x="29" y="90" width="3" height="30"/></g>
    </g>
  </svg>`;
}

/** Petites icônes des cartes (trait bleu). */
export const icons = {
  ear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h3l2-6 4 12 3-9 2 3h4"/></svg>',
  staff: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 10h18M3 14h18M3 18h18"/><circle cx="15" cy="12" r="2.6" fill="currentColor"/></svg>',
  chart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 19V11M12 19V5M19 19v-6"/></svg>',
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.2-6 8-6s6.8 2 8 6"/></svg>'
};
