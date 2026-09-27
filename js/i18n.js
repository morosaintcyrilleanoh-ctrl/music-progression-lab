// =====================================================================
// Traductions : t('dashboard.hello', { name: 'Awa' })
// =====================================================================
import fr from './i18n/fr.js';
import { DEFAULT_LOCALE } from './config.js';

const dictionaries = { fr };
let current = dictionaries[DEFAULT_LOCALE] ?? fr;

export function setLocale(locale) {
  if (dictionaries[locale]) {
    current = dictionaries[locale];
    document.documentElement.lang = locale;
  }
}

function lookup(key) {
  return key.split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), current);
}

export function t(key, vars = {}) {
  let value = lookup(key);
  if (value && typeof value === 'object' && 'one' in value && 'n' in vars) {
    value = vars.n === 1 ? value.one : value.other;
  }
  if (typeof value !== 'string') return value ?? key;
  return value.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
}
