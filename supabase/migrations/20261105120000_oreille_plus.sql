-- =============================================================================
-- Oreille musicale : nouvelles activités, défi du jour, examens, programmes.
-- - ear_results : un résultat par activité terminée (dictées, cadences, chant…),
--   par défi du jour, par examen (réussi à 70 % ou plus) ou par jour de programme.
-- - ear_program_progress : jours terminés des programmes de 30 jours.
-- - ear_leaderboard() : classement du défi du jour entre élèves d'un même
--   formateur (prénom et points seulement).
-- Lecture : l'élève, son formateur et les administrateurs (solfege_can_view).
-- =============================================================================

create table public.ear_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity text not null check (activity ~ '^[a-z0-9-]{2,40}$'),
  kind text not null default 'activite' check (kind in ('activite', 'defi', 'examen', 'programme')),
  level integer check (level between 1 and 20),
  correct integer not null check (correct >= 0),
  total integer not null check (total between 1 and 500),
  duration_seconds integer check (duration_seconds between 0 and 7200),
  passed boolean,
  -- Jour (date locale de l'élève) : sert au défi du jour et à la série de jours
  day date not null default current_date check (day between current_date - 1 and current_date + 1),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4000),
  created_at timestamptz not null default now(),
  check (correct <= total),
  -- Examen : réussi seulement avec 70 % de bonnes réponses ou plus
  check (kind <> 'examen' or passed = (correct * 100 >= total * 70))
);
create index ear_results_user on public.ear_results (user_id, created_at desc);
create index ear_results_defi on public.ear_results (kind, day) where kind = 'defi';

create table public.ear_program_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program text not null check (program ~ '^[a-z0-9-]{2,40}$'),
  day integer not null check (day between 1 and 60),
  done_at timestamptz not null default now(),
  primary key (user_id, program, day)
);

alter table public.ear_results enable row level security;
alter table public.ear_program_progress enable row level security;

create policy ear_results_read on public.ear_results for select to authenticated
  using (public.solfege_can_view(user_id));
create policy ear_results_insert on public.ear_results for insert to authenticated
  with check (user_id = auth.uid());
create policy ear_program_read on public.ear_program_progress for select to authenticated
  using (public.solfege_can_view(user_id));
create policy ear_program_insert on public.ear_program_progress for insert to authenticated
  with check (user_id = auth.uid());

revoke all on public.ear_results, public.ear_program_progress from public, anon, authenticated;
grant select, insert on public.ear_results, public.ear_program_progress to authenticated;

-- Classement du défi du jour sur les p_days derniers jours : points = meilleur score
-- de chaque jour, additionnés. Pour un élève : les élèves de ses formateurs ;
-- pour un formateur : ses élèves. Seuls le prénom et les points sont renvoyés.
create function public.ear_leaderboard(p_days integer default 7)
returns table (rank integer, name text, points integer, days integer, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with grp as (
    select ts.student_id as uid from public.trainer_students ts where ts.trainer_id = auth.uid()
    union
    select ts2.student_id from public.trainer_students ts
      join public.trainer_students ts2 on ts2.trainer_id = ts.trainer_id
      where ts.student_id = auth.uid()
    union
    select auth.uid() where exists (select 1 from public.trainer_students ts where ts.student_id = auth.uid())
  ),
  best as (
    select r.user_id, r.day, max(r.correct) as pts
    from public.ear_results r join grp on grp.uid = r.user_id
    where r.kind = 'defi' and r.day > current_date - least(greatest(p_days, 1), 31)
    group by r.user_id, r.day
  ),
  totals as (
    select b.user_id, sum(b.pts)::int as points, count(*)::int as days from best b group by b.user_id
  )
  select (rank() over (order by t.points desc))::int, coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'Élève'),
         t.points, t.days, t.user_id = auth.uid()
  from totals t left join public.profiles p on p.id = t.user_id
  where auth.uid() is not null
  order by t.points desc
  limit 50
$$;
revoke execute on function public.ear_leaderboard(integer) from public, anon;
grant execute on function public.ear_leaderboard(integer) to authenticated;
