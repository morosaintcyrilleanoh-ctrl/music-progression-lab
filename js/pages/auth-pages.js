// Pages de compte : inscription, connexion, mot de passe oublié, nouveau mot de passe
import { html, mount, setFormMessage, setBusy, toast } from '../ui.js';
import { t } from '../i18n.js';
import { supabase, siteUrl, isConfigured } from '../supabase.js';
import { getUser, isValidEmail, translateAuthError } from '../auth.js';
import { navigate } from '../router.js';

function authLayout(title, lead, body) {
  return html`
    <section class="auth-wrap">
      <div class="container narrow">
        <div class="card">
          <h1 style="font-size:1.8rem">${title}</h1>
          <p class="muted">${lead}</p>
          ${body}
        </div>
      </div>
    </section>`;
}

function field({ id, label, type = 'text', autocomplete, hint, required = true }) {
  return html`
    <div class="field">
      <label for="${id}">${label}</label>
      <input class="input" id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}"
             ${required ? html`required` : ''} ${hint ? html`aria-describedby="${id}-hint"` : ''}>
      ${hint ? html`<span class="hint" id="${id}-hint">${hint}</span>` : ''}
    </div>`;
}

// Marque les champs en erreur et renvoie le premier message
function validate(form, rules) {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  for (const [name, test, message] of rules) {
    const input = form.elements[name];
    if (!test(input.value.trim ? input.value.trim() : input.value)) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return message;
    }
  }
  return null;
}

function notConfigured(form) {
  if (isConfigured) return false;
  setFormMessage(form, t('errors.not_configured'));
  return true;
}

// ---------- Inscription ----------
export function signupPage() {
  if (getUser()) return navigate('/tableau-de-bord', { replace: true });
  mount(authLayout(t('auth.signup_title'), t('auth.signup_lead'), html`
    <form class="form" id="signup-form" novalidate>
      <div data-form-message></div>
      ${field({ id: 'full_name', label: t('auth.full_name'), autocomplete: 'name' })}
      ${field({ id: 'email', label: t('auth.email'), type: 'email', autocomplete: 'email' })}
      ${field({ id: 'password', label: t('auth.password'), type: 'password', autocomplete: 'new-password', hint: t('auth.password_hint') })}
      ${field({ id: 'password2', label: t('auth.password_confirm'), type: 'password', autocomplete: 'new-password' })}
      <button class="btn btn-block" type="submit">${t('auth.btn_signup')}</button>
      <div class="form-links"><a href="#/connexion">${t('auth.have_account')}</a></div>
    </form>`));

  const form = document.getElementById('signup-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (n) => form.elements[n].value;
    const error = validate(form, [
      ['full_name', (x) => x.length > 0, t('errors.required')],
      ['email', isValidEmail, t('errors.email_invalid')],
      ['password', (x) => x.length >= 8, t('errors.password_short')],
      ['password2', (x) => x === v('password'), t('errors.password_mismatch')]
    ]);
    if (error) return setFormMessage(form, error);
    if (notConfigured(form)) return;

    const button = form.querySelector('button[type=submit]');
    setBusy(button, true);
    setFormMessage(form, null);
    const { data, error: apiError } = await supabase.auth.signUp({
      email: v('email').trim(),
      password: v('password'),
      options: {
        data: { full_name: v('full_name').trim(), locale: 'fr' },
        emailRedirectTo: siteUrl('?confirme=1')
      }
    });
    setBusy(button, false);
    if (apiError) return setFormMessage(form, translateAuthError(apiError));

    // Supabase peut renvoyer un utilisateur sans "identités" si l'adresse existe déjà
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return setFormMessage(form, t('errors.already_registered'));
    }
    if (data.session) {
      toast(t('auth.welcome', { name: v('full_name').trim().split(' ')[0] }), 'success');
      return navigate('/tableau-de-bord');
    }
    form.innerHTML = `<div class="alert alert-success" role="status">${t('auth.check_email')}</div>`;
  });
}

// ---------- Connexion ----------
export function loginPage() {
  if (getUser()) return navigate('/tableau-de-bord', { replace: true });
  mount(authLayout(t('auth.login_title'), t('auth.login_lead'), html`
    <form class="form" id="login-form" novalidate>
      <div data-form-message></div>
      ${field({ id: 'email', label: t('auth.email'), type: 'email', autocomplete: 'email' })}
      ${field({ id: 'password', label: t('auth.password'), type: 'password', autocomplete: 'current-password' })}
      <button class="btn btn-block" type="submit">${t('auth.btn_login')}</button>
      <div class="form-links">
        <a href="#/mot-de-passe-oublie">${t('auth.forgot_link')}</a>
        <a href="#/inscription">${t('auth.no_account')}</a>
      </div>
    </form>`));

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = validate(form, [
      ['email', isValidEmail, t('errors.email_invalid')],
      ['password', (x) => x.length > 0, t('errors.required')]
    ]);
    if (error) return setFormMessage(form, error);
    if (notConfigured(form)) return;

    const button = form.querySelector('button[type=submit]');
    setBusy(button, true);
    setFormMessage(form, null);
    const { error: apiError } = await supabase.auth.signInWithPassword({
      email: form.elements.email.value.trim(),
      password: form.elements.password.value
    });
    setBusy(button, false);
    if (apiError) return setFormMessage(form, translateAuthError(apiError));
    navigate('/tableau-de-bord');
  });
}

// ---------- Mot de passe oublié ----------
export function forgotPage() {
  mount(authLayout(t('auth.forgot_title'), t('auth.forgot_lead'), html`
    <form class="form" id="forgot-form" novalidate>
      <div data-form-message></div>
      ${field({ id: 'email', label: t('auth.email'), type: 'email', autocomplete: 'email' })}
      <button class="btn btn-block" type="submit">${t('auth.btn_forgot')}</button>
      <div class="form-links"><a href="#/connexion">${t('auth.back_login')}</a></div>
    </form>`));

  const form = document.getElementById('forgot-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = validate(form, [['email', isValidEmail, t('errors.email_invalid')]]);
    if (error) return setFormMessage(form, error);
    if (notConfigured(form)) return;

    const button = form.querySelector('button[type=submit]');
    setBusy(button, true);
    const { error: apiError } = await supabase.auth.resetPasswordForEmail(
      form.elements.email.value.trim(),
      { redirectTo: siteUrl('?reinit=1') }
    );
    setBusy(button, false);
    // Par sécurité, on n'indique pas si l'adresse existe ou non
    if (apiError && !/user/i.test(apiError.message ?? '')) return setFormMessage(form, translateAuthError(apiError));
    setFormMessage(form, t('auth.forgot_sent'), 'success');
    form.querySelector('.field').remove();
    button.remove();
  });
}

// ---------- Nouveau mot de passe (après le lien reçu par e-mail) ----------
export function resetPage() {
  if (!getUser()) {
    mount(authLayout(t('auth.reset_title'), t('auth.reset_need_link'), html`
      <a class="btn btn-block" href="#/mot-de-passe-oublie">${t('auth.btn_forgot')}</a>`));
    return;
  }
  mount(authLayout(t('auth.reset_title'), t('auth.reset_lead'), html`
    <form class="form" id="reset-form" novalidate>
      <div data-form-message></div>
      ${field({ id: 'password', label: t('auth.new_password'), type: 'password', autocomplete: 'new-password', hint: t('auth.password_hint') })}
      ${field({ id: 'password2', label: t('auth.password_confirm'), type: 'password', autocomplete: 'new-password' })}
      <button class="btn btn-block" type="submit">${t('auth.btn_reset')}</button>
    </form>`));

  const form = document.getElementById('reset-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = validate(form, [
      ['password', (x) => x.length >= 8, t('errors.password_short')],
      ['password2', (x) => x === form.elements.password.value, t('errors.password_mismatch')]
    ]);
    if (error) return setFormMessage(form, error);

    const button = form.querySelector('button[type=submit]');
    setBusy(button, true);
    const { error: apiError } = await supabase.auth.updateUser({ password: form.elements.password.value });
    setBusy(button, false);
    if (apiError) return setFormMessage(form, translateAuthError(apiError));
    toast(t('auth.reset_done'), 'success');
    navigate('/tableau-de-bord');
  });
}
