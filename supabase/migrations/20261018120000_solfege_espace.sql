-- =============================================================================
-- Espace Solfège : formations (leçons), lives et ressources du formateur.
-- Un contenu est visible par le formateur qui l'a créé, les administrateurs et
-- les élèves de ce formateur (trainer_students) : tous, ou un seul élève choisi.
-- Seuls les formateurs et les administrateurs créent du contenu, chacun le sien.
-- =============================================================================

-- Formateur ou administrateur ?
create function public.solfege_is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('trainer', 'admin'))
$$;

-- Contenu publié par p_trainer, pour tous ses élèves (p_student null) ou pour p_student.
create function public.solfege_can_see(p_trainer uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    auth.uid() = p_trainer
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or ((p_student is null or p_student = auth.uid())
        and exists (select 1 from public.trainer_students ts where ts.trainer_id = p_trainer and ts.student_id = auth.uid()))
  )
$$;

-- -----------------------------------------------------------------------------
create table public.solfege_courses (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index solfege_courses_trainer on public.solfege_courses (trainer_id);

create table public.solfege_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.solfege_courses (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  content text not null default '' check (char_length(content) <= 20000),
  video_url text check (video_url ~ '^https://[^\s]+$' and char_length(video_url) <= 500),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index solfege_lessons_course on public.solfege_lessons (course_id, position);

create table public.solfege_lesson_progress (
  lesson_id uuid not null references public.solfege_lessons (id) on delete cascade,
  student_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (lesson_id, student_id)
);

create table public.solfege_lives (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 600),
  meeting_url text not null check (meeting_url ~ '^https://[^\s]+$' and char_length(meeting_url) <= 500),
  replay_url text check (replay_url ~ '^https://[^\s]+$' and char_length(replay_url) <= 500),
  created_at timestamptz not null default now()
);
create index solfege_lives_starts on public.solfege_lives (starts_at);

-- Ressources libres (lesson_id null) ou fichiers joints à une leçon.
create table public.solfege_resources (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete cascade,
  lesson_id uuid references public.solfege_lessons (id) on delete cascade,
  kind text not null check (kind in ('audio', 'video', 'image', 'pdf', 'text', 'link')),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 500),
  storage_path text unique check (char_length(storage_path) <= 300),
  url text check (url ~ '^https://[^\s]+$' and char_length(url) <= 500),
  body text check (char_length(body) <= 20000),
  file_size bigint check (file_size between 0 and 52428800),
  created_at timestamptz not null default now(),
  -- Un fichier, un lien ou un texte : exactement un des trois.
  check (num_nonnulls(storage_path, url, body) = 1),
  check (kind <> 'text' or body is not null),
  check (kind <> 'link' or url is not null)
);
create index solfege_resources_trainer on public.solfege_resources (trainer_id, created_at desc);
create index solfege_resources_lesson on public.solfege_resources (lesson_id);

-- Une leçon ou une ressource de leçon suit la visibilité de sa formation.
create function public.solfege_can_see_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.solfege_courses c where c.id = p_course and public.solfege_can_see(c.trainer_id, c.student_id))
$$;
create function public.solfege_owns_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.solfege_courses c where c.id = p_course and c.trainer_id = auth.uid())
$$;
create function public.solfege_owns_lesson(p_lesson uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.solfege_lessons l join public.solfege_courses c on c.id = l.course_id
                 where l.id = p_lesson and c.trainer_id = auth.uid())
$$;
create function public.solfege_can_see_lesson(p_lesson uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.solfege_lessons l where l.id = p_lesson and public.solfege_can_see_course(l.course_id))
$$;

-- -----------------------------------------------------------------------------
-- Règles d'accès
-- -----------------------------------------------------------------------------
alter table public.solfege_courses enable row level security;
alter table public.solfege_lessons enable row level security;
alter table public.solfege_lesson_progress enable row level security;
alter table public.solfege_lives enable row level security;
alter table public.solfege_resources enable row level security;

create policy solfege_courses_read on public.solfege_courses for select to authenticated
  using (public.solfege_can_see(trainer_id, student_id));
create policy solfege_courses_write on public.solfege_courses for all to authenticated
  using (trainer_id = auth.uid() and public.solfege_is_staff())
  with check (trainer_id = auth.uid() and public.solfege_is_staff());

create policy solfege_lessons_read on public.solfege_lessons for select to authenticated
  using (public.solfege_can_see_course(course_id));
create policy solfege_lessons_write on public.solfege_lessons for all to authenticated
  using (public.solfege_owns_course(course_id) and public.solfege_is_staff())
  with check (public.solfege_owns_course(course_id) and public.solfege_is_staff());

-- L'élève coche ses leçons ; le formateur de la formation voit qui a terminé.
create policy solfege_progress_read on public.solfege_lesson_progress for select to authenticated
  using (student_id = auth.uid() or public.solfege_owns_lesson(lesson_id)
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy solfege_progress_insert on public.solfege_lesson_progress for insert to authenticated
  with check (student_id = auth.uid() and public.solfege_can_see_lesson(lesson_id));
create policy solfege_progress_delete on public.solfege_lesson_progress for delete to authenticated
  using (student_id = auth.uid());

create policy solfege_lives_read on public.solfege_lives for select to authenticated
  using (public.solfege_can_see(trainer_id, student_id));
create policy solfege_lives_write on public.solfege_lives for all to authenticated
  using (trainer_id = auth.uid() and public.solfege_is_staff())
  with check (trainer_id = auth.uid() and public.solfege_is_staff());

create policy solfege_resources_read on public.solfege_resources for select to authenticated
  using (public.solfege_can_see(trainer_id, student_id)
         and (lesson_id is null or public.solfege_can_see_lesson(lesson_id)));
create policy solfege_resources_write on public.solfege_resources for all to authenticated
  using (trainer_id = auth.uid() and public.solfege_is_staff())
  with check (trainer_id = auth.uid() and public.solfege_is_staff()
              and (lesson_id is null or public.solfege_owns_lesson(lesson_id))
              and (storage_path is null or storage_path like auth.uid()::text || '/%'));

revoke all on public.solfege_courses, public.solfege_lessons, public.solfege_lesson_progress,
  public.solfege_lives, public.solfege_resources from public, anon, authenticated;
grant select, insert, update, delete on public.solfege_courses, public.solfege_lessons,
  public.solfege_lives, public.solfege_resources to authenticated;
grant select, insert, delete on public.solfege_lesson_progress to authenticated;

revoke execute on function public.solfege_is_staff(), public.solfege_can_see(uuid, uuid),
  public.solfege_can_see_course(uuid), public.solfege_owns_course(uuid),
  public.solfege_owns_lesson(uuid), public.solfege_can_see_lesson(uuid) from public, anon;
grant execute on function public.solfege_is_staff(), public.solfege_can_see(uuid, uuid),
  public.solfege_can_see_course(uuid), public.solfege_owns_course(uuid),
  public.solfege_owns_lesson(uuid), public.solfege_can_see_lesson(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Fichiers (privés) : solfege-files/{formateur}/{fichier}, 50 Mo au plus.
-- Lecture par liens temporaires, seulement si la ressource est visible.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('solfege-files', 'solfege-files', false, 52428800, array[
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm',
    'video/mp4', 'video/webm', 'video/quicktime',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy solfege_files_read on storage.objects for select to authenticated using (
  bucket_id = 'solfege-files' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.solfege_resources r where r.storage_path = name)
  )
);
create policy solfege_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'solfege-files' and (storage.foldername(name))[1] = auth.uid()::text and public.solfege_is_staff()
);
create policy solfege_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'solfege-files' and (storage.foldername(name))[1] = auth.uid()::text
);
