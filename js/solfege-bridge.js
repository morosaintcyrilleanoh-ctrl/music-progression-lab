// =====================================================================
// Chargé par les pages du volet Solfège quand un élève est connecté au Lab :
// envoie ses séances au chargement, puis toutes les 30 secondes et quand
// l'élève revient sur l'onglet ; affiche son prochain live et sa formation
// en cours sur l'accueil du solfège.
// =====================================================================
import { syncSolfege } from './solfege-sync.js';
import { renderEspaceWidget } from './solfege-widget.js';

const sync = () => syncSolfege().catch((err) => console.warn('Solfège : envoi reporté', err?.message ?? err));
sync();
setInterval(sync, 30000);
document.addEventListener('visibilitychange', sync);

// L'accueil peut être affiché plus tard (navigation dans le solfège) : on surveille la page.
renderEspaceWidget();
new MutationObserver(() => renderEspaceWidget()).observe(document.body, { childList: true, subtree: true });
