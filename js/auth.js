// =====================================================================
// Comptes utilisateurs : état de connexion + traduction des erreurs
// =====================================================================
import { supabase, isConfigured } from './supabase.js';
import { t } from './i18n.js';

let currentSession = null;
const listeners = new Set();

export async function initAuth() {
  if (!isConfigured) return null;
  const { data } = await supabase.auth.getSession();
  currentSession = data.session;
  supabase.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    listeners.forEach((fn) => fn(event, session));
  });
  return currentSession;
}

export const getSession = () => currentSession;
export const getUser = () => currentSession?.user ?? null;
export const onAuthChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Transforme les messages techniques de Supabase en phrases compréhensibles
export function translateAuthError(error) {
  if (!isConfigured) return t('errors.not_configured');
  if (!error) return t('errors.generic');
  const msg = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) return t('errors.invalid_credentials');
  if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) return t('errors.email_not_confirmed');
  if (msg.includes('already registered') || msg.includes('user_already_exists') || msg.includes('already been registered')) return t('errors.already_registered');
  if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit') || msg.includes('too many')) return t('errors.rate_limit');
  if (msg.includes('same_password') || msg.includes('different from the old')) return t('errors.same_password');
  if (msg.includes('weak') || msg.includes('password should')) return t('errors.weak_password');
  if (msg.includes('fetch') || msg.includes('network')) return t('errors.network');
  return t('errors.generic');
}
