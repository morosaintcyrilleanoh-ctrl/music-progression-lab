-- =============================================================================
-- Volet Solfège : résultats des séances enregistrés dans le compte de l'élève.
-- L'élève n'écrit que ses propres séances ; son formateur (lien trainer_students)
-- et les administrateurs peuvent les lire. Aucune suppression par l'API.
-- =============================================================================

create table public.solfege_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Identifiant de la séance côté navigateur : un nouvel envoi met la séance à jour.
  client_id text not null check (char_length(client_id) between 1 and 100),
  lab text not null check (lab in ('lecture-des-notes', 'rythme', 'tonalites', 'intervalles', 'positionnement')),
  mode text not null check (mode in ('training', 'evaluation', 'placement')),
  correct integer not null check (correct >= 0),
  total integer not null check (total between 1 and 500),
  level text check (char_length(level) <= 40),
  average_ms integer check (average_ms between 0 and 600000),
  -- Détail par compétence : { "clé": [bonnes, total] }
  skills jsonb not null default '{}' check (jsonb_typeof(skills) = 'object' and octet_length(skills::text) <= 4000),
  started_at timestamptz not null check (started_at > '2024-01-01' and started_at < now() + interval '1 day'),
  finished_at timestamptz check (finished_at is null or finished_at >= started_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (correct <= total),
  unique (user_id, client_id)
);

create index solfege_sessions_user_started on public.solfege_sessions (user_id, started_at desc);

-- Qui peut voir les séances d'un élève : lui-même, son formateur, un administrateur.
create function public.solfege_can_view(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    p_student = auth.uid()
    or exists (select 1 from public.trainer_students ts
               where ts.trainer_id = auth.uid() and ts.student_id = p_student)
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role = 'admin')
  )
$$;

create function public.solfege_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger solfege_sessions_touch before update on public.solfege_sessions
  for each row execute function public.solfege_touch();

alter table public.solfege_sessions enable row level security;

create policy solfege_sessions_select on public.solfege_sessions
  for select to authenticated using (public.solfege_can_view(user_id));
create policy solfege_sessions_insert on public.solfege_sessions
  for insert to authenticated with check (user_id = auth.uid());
create policy solfege_sessions_update on public.solfege_sessions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.solfege_sessions from public, anon, authenticated;
grant select, insert, update on public.solfege_sessions to authenticated;

revoke execute on function public.solfege_can_view(uuid) from public, anon;
grant execute on function public.solfege_can_view(uuid) to authenticated;
revoke execute on function public.solfege_touch() from public, anon, authenticated;
