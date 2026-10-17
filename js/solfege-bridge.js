// =====================================================================
// Chargé par les pages du volet Solfège quand un élève est connecté au Lab :
// envoie ses séances au chargement, puis toutes les 30 secondes et quand
// l'élève revient sur l'onglet.
// =====================================================================
import { syncSolfege } from './solfege-sync.js';

const sync = () => syncSolfege().catch((err) => console.warn('Solfège : envoi reporté', err?.message ?? err));
sync();
setInterval(sync, 30000);
document.addEventListener('visibilitychange', sync);
