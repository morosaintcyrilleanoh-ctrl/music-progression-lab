-- =============================================================================
-- Plateforme privée : pour créer un compte, il faut le code d'un formateur
-- (celui affiché dans Espace formateur → Élèves). La vérification est faite par
-- la base au moment de la création du compte : elle ne peut pas être contournée
-- en appelant Supabase directement. Le site relie ensuite l'élève à ce formateur.
-- =============================================================================

create function public.mpl_check_signup_code() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'trainer_code', ''), '\s+', '', 'g'));
begin
  -- Personne invitée par un administrateur (Supabase → « Invite user ») : pas de code.
  if new.invited_at is not null then
    return new;
  end if;
  if v_code = '' or not exists (
    select 1 from public.trainer_invites ti where upper(regexp_replace(ti.code, '\s+', '', 'g')) = v_code
  ) then
    raise exception 'Code formateur incorrect.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger mpl_check_signup_code before insert on auth.users
  for each row execute function public.mpl_check_signup_code();

revoke execute on function public.mpl_check_signup_code() from public, anon, authenticated;
