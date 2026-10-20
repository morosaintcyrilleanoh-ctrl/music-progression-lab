-- =============================================================================
-- Formation payante, agenda, coaching et devoirs (volet Solfège).
-- - Session de formation (3 mois, 30 places) : le contenu rattaché à une session
--   n'est visible que par les élèves inscrits dont l'accès est payé (payé jusqu'au…).
--   Le formateur valide les paiements lui-même (+1 mois, +3 mois).
-- - Agenda : sessions, ouvertures de coaching et événements des 3 prochains mois.
-- - Coaching individuel : demande de l'élève (1, 2, 3 ou 6 mois), validée par le
--   formateur ; objectifs du mois et rendez-vous réservés à l'élève coaché.
-- - Devoirs : rendu PDF/photo, audio court ou « envoyé sur WhatsApp », corrigés
--   par le formateur (note + commentaire).
-- Le contenu existant (sans session) reste gratuit, comme avant.
-- =============================================================================

-- ---------------------------------------------------------------- Sessions
create table public.solfege_cohorts (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  info text not null default '' check (char_length(info) <= 1000),
  starts_on date not null,
  ends_on date not null,
  capacity integer not null default 30 check (capacity between 1 and 500),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index solfege_cohorts_trainer on public.solfege_cohorts (trainer_id, starts_on);

create table public.solfege_memberships (
  cohort_id uuid not null references public.solfege_cohorts (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  paid_until date not null,
  created_at timestamptz not null default now(),
  primary key (cohort_id, student_id)
);
create index solfege_memberships_student on public.solfege_memberships (student_id);

-- 30 places au plus (selon la session)
create function public.solfege_check_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.solfege_memberships m where m.cohort_id = new.cohort_id)
     >= (select c.capacity from public.solfege_cohorts c where c.id = new.cohort_id) then
    raise exception 'Session complète.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger solfege_memberships_capacity before insert on public.solfege_memberships
  for each row execute function public.solfege_check_capacity();

-- Accès payé à une session (le formateur et l'admin ont toujours accès)
create function public.solfege_has_access(p_cohort uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.solfege_cohorts c where c.id = p_cohort and c.trainer_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or exists (select 1 from public.solfege_memberships m
               where m.cohort_id = p_cohort and m.student_id = auth.uid() and m.paid_until >= current_date)
  )
$$;
create function public.solfege_owns_cohort(p_cohort uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.solfege_cohorts c where c.id = p_cohort and c.trainer_id = auth.uid())
$$;

-- Places prises (sans révéler qui est inscrit)
create function public.solfege_cohort_seats(p_ids uuid[]) returns table (cohort_id uuid, taken integer)
language sql stable security definer set search_path = '' as $$
  select c.id, (select count(*)::int from public.solfege_memberships m where m.cohort_id = c.id)
  from public.solfege_cohorts c
  where c.id = any (p_ids) and public.solfege_can_see(c.trainer_id, null)
$$;

-- ---------------------------------------------------------------- Agenda
create table public.solfege_events (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('coaching', 'evenement')),
  title text not null check (char_length(title) between 2 and 160),
  info text not null default '' check (char_length(info) <= 1000),
  starts_at timestamptz not null,
  places integer check (places between 1 and 500),
  created_at timestamptz not null default now()
);
create index solfege_events_starts on public.solfege_events (starts_at);

-- Numéro WhatsApp du formateur (bouton « Je veux m'inscrire »)
create table public.solfege_trainer_settings (
  trainer_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  whatsapp text check (whatsapp ~ '^\+?[0-9 ]{6,20}$'),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Coaching
create table public.solfege_coachings (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  months integer not null check (months in (1, 2, 3, 6)),
  start_month date not null check (extract(day from start_month) = 1),
  goal text not null default '' check (char_length(goal) <= 500),
  status text not null default 'pending' check (status in ('pending', 'active', 'refused', 'ended')),
  paid_until date,
  created_at timestamptz not null default now(),
  check (status <> 'active' or paid_until is not null)
);
create index solfege_coachings_trainer on public.solfege_coachings (trainer_id, status);
create index solfege_coachings_student on public.solfege_coachings (student_id);

-- L'élève connecté fait-il partie des élèves de ce formateur ?
create function public.solfege_is_my_trainer(p_trainer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trainer_students ts where ts.trainer_id = p_trainer and ts.student_id = auth.uid())
$$;

create function public.solfege_owns_coaching(p_coaching uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.solfege_coachings c where c.id = p_coaching and c.trainer_id = auth.uid())
$$;
-- Coaching en cours : le formateur, l'admin, ou l'élève tant que c'est payé
create function public.solfege_coaching_open(p_coaching uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.solfege_coachings c where c.id = p_coaching and (
      c.trainer_id = auth.uid()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      or (c.student_id = auth.uid() and c.status = 'active' and c.paid_until >= current_date)))
$$;
create function public.solfege_in_coaching(p_coaching uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.solfege_coachings c where c.id = p_coaching
                 and (c.student_id = auth.uid() or c.trainer_id = auth.uid()))
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

create table public.solfege_coaching_goals (
  id uuid primary key default gen_random_uuid(),
  coaching_id uuid not null references public.solfege_coachings (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  text text not null check (char_length(text) between 1 and 300),
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index solfege_goals_coaching on public.solfege_coaching_goals (coaching_id, month, position);

-- ---------------------------------------------------------------- Devoirs
create table public.solfege_homework (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete cascade,
  cohort_id uuid references public.solfege_cohorts (id) on delete cascade,
  coaching_id uuid references public.solfege_coachings (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(cohort_id, coaching_id) <= 1)
);
create index solfege_homework_trainer on public.solfege_homework (trainer_id, created_at desc);

create table public.solfege_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.solfege_homework (id) on delete cascade,
  student_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('file', 'audio', 'whatsapp')),
  storage_path text unique check (char_length(storage_path) <= 300),
  file_size bigint check (file_size between 0 and 10485760),
  note text not null default '' check (char_length(note) <= 1000),
  submitted_at timestamptz not null default now(),
  grade text check (char_length(grade) <= 20),
  feedback text check (char_length(feedback) <= 2000),
  corrected_at timestamptz,
  unique (homework_id, student_id),
  check ((kind = 'whatsapp') = (storage_path is null))
);

create function public.solfege_owns_homework(p_homework uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.solfege_homework h where h.id = p_homework and h.trainer_id = auth.uid())
$$;
create function public.solfege_can_see_homework(p_homework uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.solfege_homework h where h.id = p_homework and (
      h.trainer_id = auth.uid()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      or exists (select 1 from public.solfege_submissions s where s.homework_id = h.id and s.student_id = auth.uid())
      or (public.solfege_can_see(h.trainer_id, h.student_id)
          and (h.cohort_id is null or public.solfege_has_access(h.cohort_id))
          and (h.coaching_id is null or public.solfege_coaching_open(h.coaching_id)))))
$$;

-- Chacun ne modifie que sa part : l'élève son rendu, le formateur la correction.
create function public.solfege_submission_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.solfege_owns_homework(old.homework_id) and old.student_id <> auth.uid() then
    new.kind := old.kind; new.storage_path := old.storage_path; new.file_size := old.file_size;
    new.note := old.note; new.submitted_at := old.submitted_at; new.student_id := old.student_id;
    new.homework_id := old.homework_id;
  else
    if old.corrected_at is not null then
      raise exception 'Devoir déjà corrigé.' using errcode = '42501';
    end if;
    new.grade := old.grade; new.feedback := old.feedback; new.corrected_at := old.corrected_at;
    new.student_id := old.student_id; new.homework_id := old.homework_id;
  end if;
  return new;
end;
$$;
create trigger solfege_submissions_guard before update on public.solfege_submissions
  for each row execute function public.solfege_submission_guard();

-- ---------------------------------------------------------------- Contenu rattaché
alter table public.solfege_courses add column cohort_id uuid references public.solfege_cohorts (id) on delete cascade;
alter table public.solfege_lives add column cohort_id uuid references public.solfege_cohorts (id) on delete cascade;
alter table public.solfege_lives add column coaching_id uuid references public.solfege_coachings (id) on delete cascade;
alter table public.solfege_lives add constraint solfege_lives_one_target check (num_nonnulls(cohort_id, coaching_id) <= 1);
alter table public.solfege_resources add column cohort_id uuid references public.solfege_cohorts (id) on delete cascade;
alter table public.solfege_resources add column homework_id uuid references public.solfege_homework (id) on delete cascade;

-- Une formation de session suit l'accès payé de la session
create or replace function public.solfege_can_see_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.solfege_courses c where c.id = p_course
                 and public.solfege_can_see(c.trainer_id, c.student_id)
                 and (c.cohort_id is null or public.solfege_has_access(c.cohort_id)))
$$;

drop policy solfege_courses_read on public.solfege_courses;
drop policy solfege_courses_write on public.solfege_courses;
create policy solfege_courses_read on public.solfege_courses for select to authenticated
  using (public.solfege_can_see(trainer_id, student_id) and (cohort_id is null or public.solfege_has_access(cohort_id)));
create policy solfege_courses_write on public.solfege_courses for all to authenticated
  using (trainer_id = auth.uid() and public.solfege_is_staff())
  with check (trainer_id = auth.uid() and public.solfege_is_staff() and (cohort_id is null or public.solfege_owns_cohort(cohort_id)));

drop policy solfege_lives_read on public.solfege_lives;
drop policy solfege_lives_write on public.solfege_lives;
create policy solfege_lives_read on public.solfege_lives for select to authenticated using (
  case when coaching_id is not null then public.solfege_coaching_open(coaching_id)
       else public.solfege_can_see(trainer_id, student_id) and (cohort_id is null or public.solfege_has_access(cohort_id)) end);
create policy solfege_lives_write on public.solfege_lives for all to authenticated
  using (trainer_id = auth.uid() and public.solfege_is_staff())
  with check (trainer_id = auth.uid() and public.solfege_is_staff()
              and (cohort_id is null or public.solfege_owns_cohort(cohort_id))
              and (coaching_id is null or public.solfege_owns_coaching(coaching_id)));

drop policy solfege_resources_read on public.solfege_resources;
drop policy solfege_resources_write on public.solfege_resources;
create policy solfege_resources_read on public.solfege_resources for select to authenticated using (
  public.solfege_can_see(trainer_id, student_id)
  and (lesson_id is null or public.solfege_can_see_lesson(lesson_id))
  and (cohort_id is null or public.solfege_has_access(cohort_id))
  and (homework_id is null or public.solfege_can_see_homework(homework_id)));
create policy solfege_resources_write on public.solfege_resources for all to authenticated
  using (trainer_id = auth.uid() and public.solfege_is_staff())
  with check (trainer_id = auth.uid() and public.solfege_is_staff()
              and (lesson_id is null or public.solfege_owns_lesson(lesson_id))
              and (cohort_id is null or public.solfege_owns_cohort(cohort_id))
              and (homework_id is null or public.solfege_owns_homework(homework_id))
              and (storage_path is null or storage_path like auth.uid()::text || '/%'));

-- ---------------------------------------------------------------- Règles d'accès
alter table public.solfege_cohorts enable row level security;
alter table public.solfege_memberships enable row level security;
alter table public.solfege_events enable row level security;
alter table public.solfege_trainer_settings enable row level security;
alter table public.solfege_coachings enable row level security;
alter table public.solfege_coaching_goals enable row level security;
alter table public.solfege_homework enable row level security;
alter table public.solfege_submissions enable row level security;

-- Sessions et agenda : visibles par les élèves du formateur (pour s'inscrire)
create policy solfege_cohorts_read on public.solfege_cohorts for select to authenticated
  using (public.solfege_can_see(trainer_id, null));
create policy solfege_cohorts_write on public.solfege_cohorts for all to authenticated
  using (trainer_id = auth.uid() and public.solfege_is_staff())
  with check (trainer_id = auth.uid() and public.solfege_is_staff());

-- Inscriptions : l'élève voit les siennes ; le formateur gère celles de ses sessions
create policy solfege_memberships_read on public.solfege_memberships for select to authenticated
  using (student_id = auth.uid() or public.solfege_owns_cohort(cohort_id)
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy solfege_memberships_write on public.solfege_memberships for all to authenticated
  using (public.solfege_owns_cohort(cohort_id) and public.solfege_is_staff())
  with check (public.solfege_owns_cohort(cohort_id) and public.solfege_is_staff());

create policy solfege_events_read on public.solfege_events for select to authenticated
  using (public.solfege_can_see(trainer_id, null));
create policy solfege_events_write on public.solfege_events for all to authenticated
  using (trainer_id = auth.uid() and public.solfege_is_staff())
  with check (trainer_id = auth.uid() and public.solfege_is_staff());

create policy solfege_settings_read on public.solfege_trainer_settings for select to authenticated
  using (public.solfege_can_see(trainer_id, null));
create policy solfege_settings_write on public.solfege_trainer_settings for all to authenticated
  using (trainer_id = auth.uid() and public.solfege_is_staff())
  with check (trainer_id = auth.uid() and public.solfege_is_staff());

-- Coaching : l'élève demande à SON formateur ; le formateur valide
create policy solfege_coachings_read on public.solfege_coachings for select to authenticated
  using (student_id = auth.uid() or trainer_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy solfege_coachings_request on public.solfege_coachings for insert to authenticated
  with check (student_id = auth.uid() and status = 'pending' and paid_until is null
              and public.solfege_is_my_trainer(trainer_id));
create policy solfege_coachings_cancel on public.solfege_coachings for delete to authenticated
  using ((student_id = auth.uid() and status = 'pending') or (trainer_id = auth.uid() and public.solfege_is_staff()));
create policy solfege_coachings_manage on public.solfege_coachings for update to authenticated
  using (trainer_id = auth.uid() and public.solfege_is_staff())
  with check (trainer_id = auth.uid() and public.solfege_is_staff());

create policy solfege_goals_read on public.solfege_coaching_goals for select to authenticated
  using (public.solfege_in_coaching(coaching_id));
create policy solfege_goals_insert on public.solfege_coaching_goals for insert to authenticated
  with check (public.solfege_owns_coaching(coaching_id) and public.solfege_is_staff());
create policy solfege_goals_delete on public.solfege_coaching_goals for delete to authenticated
  using (public.solfege_owns_coaching(coaching_id));
-- Seule la case « fait » peut être modifiée (droit limité à la colonne done)
create policy solfege_goals_check on public.solfege_coaching_goals for update to authenticated
  using (public.solfege_in_coaching(coaching_id)) with check (public.solfege_in_coaching(coaching_id));

create policy solfege_homework_read on public.solfege_homework for select to authenticated
  using (public.solfege_can_see_homework(id));
create policy solfege_homework_write on public.solfege_homework for all to authenticated
  using (trainer_id = auth.uid() and public.solfege_is_staff())
  with check (trainer_id = auth.uid() and public.solfege_is_staff()
              and (cohort_id is null or public.solfege_owns_cohort(cohort_id))
              and (coaching_id is null or public.solfege_owns_coaching(coaching_id)));

create policy solfege_submissions_read on public.solfege_submissions for select to authenticated
  using (student_id = auth.uid() or public.solfege_owns_homework(homework_id)
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy solfege_submissions_insert on public.solfege_submissions for insert to authenticated
  with check (student_id = auth.uid() and grade is null and feedback is null and corrected_at is null
              and public.solfege_can_see_homework(homework_id)
              and (storage_path is null or storage_path like 'rendus/' || auth.uid()::text || '/%'));
create policy solfege_submissions_update on public.solfege_submissions for update to authenticated
  using (student_id = auth.uid() or public.solfege_owns_homework(homework_id))
  with check ((student_id = auth.uid() and (storage_path is null or storage_path like 'rendus/' || auth.uid()::text || '/%'))
              or public.solfege_owns_homework(homework_id));

revoke all on public.solfege_cohorts, public.solfege_memberships, public.solfege_events, public.solfege_trainer_settings,
  public.solfege_coachings, public.solfege_coaching_goals, public.solfege_homework, public.solfege_submissions
  from public, anon, authenticated;
grant select, insert, update, delete on public.solfege_cohorts, public.solfege_memberships, public.solfege_events,
  public.solfege_trainer_settings, public.solfege_homework to authenticated;
grant select, insert, update, delete on public.solfege_coachings to authenticated;
grant select, insert, delete on public.solfege_coaching_goals to authenticated;
grant update (done) on public.solfege_coaching_goals to authenticated;
grant select, insert, update on public.solfege_submissions to authenticated;

revoke execute on function public.solfege_is_my_trainer(uuid), public.solfege_has_access(uuid), public.solfege_owns_cohort(uuid), public.solfege_cohort_seats(uuid[]),
  public.solfege_owns_coaching(uuid), public.solfege_coaching_open(uuid), public.solfege_in_coaching(uuid),
  public.solfege_owns_homework(uuid), public.solfege_can_see_homework(uuid) from public, anon;
grant execute on function public.solfege_is_my_trainer(uuid), public.solfege_has_access(uuid), public.solfege_owns_cohort(uuid), public.solfege_cohort_seats(uuid[]),
  public.solfege_owns_coaching(uuid), public.solfege_coaching_open(uuid), public.solfege_in_coaching(uuid),
  public.solfege_owns_homework(uuid), public.solfege_can_see_homework(uuid) to authenticated;
revoke execute on function public.solfege_check_capacity(), public.solfege_submission_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------- Fichiers des rendus
-- solfege-files/rendus/{élève}/{fichier} : l'élève dépose ; lui et le formateur du devoir lisent.
create policy solfege_files_submit on storage.objects for insert to authenticated with check (
  bucket_id = 'solfege-files' and (storage.foldername(name))[1] = 'rendus' and (storage.foldername(name))[2] = auth.uid()::text
);
create policy solfege_files_read_submissions on storage.objects for select to authenticated using (
  bucket_id = 'solfege-files' and (storage.foldername(name))[1] = 'rendus'
  and exists (select 1 from public.solfege_submissions s where s.storage_path = name)
);
create policy solfege_files_delete_own_submission on storage.objects for delete to authenticated using (
  bucket_id = 'solfege-files' and (storage.foldername(name))[1] = 'rendus' and (storage.foldername(name))[2] = auth.uid()::text
);
