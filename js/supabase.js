// =====================================================================
// Connexion à Supabase (comptes + base de données)
// La bibliothèque officielle est chargée depuis un CDN : aucune installation.
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const isConfigured =
  SUPABASE_URL.startsWith('https://') && !SUPABASE_PUBLISHABLE_KEY.startsWith('COLLE_ICI');

export const supabase = createClient(
  SUPABASE_URL,
  isConfigured ? SUPABASE_PUBLISHABLE_KEY : 'missing-key',
  {
    auth: {
      persistSession: true,        // reste connecté après fermeture du navigateur
      autoRefreshToken: true,
      detectSessionInUrl: true,    // lit les liens reçus par e-mail (confirmation, mot de passe)
      flowType: 'implicit'         // fonctionne même si l'e-mail est ouvert sur un autre appareil
    }
  }
);

// Adresse de base du site (pour les liens envoyés par e-mail)
export function siteUrl(query = '') {
  const base = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
  return base + query;
}
