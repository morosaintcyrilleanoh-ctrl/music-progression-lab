-- Simulation minimale de Supabase et des tables existantes du Lab utilisées
-- par la migration (pour tester sur un PostgreSQL ordinaire).
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb not null default '{}', invited_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

create table public.profiles (id uuid primary key references auth.users, full_name text, role text not null default 'student');
create table public.trainer_students (trainer_id uuid references public.profiles, student_id uuid references public.profiles, created_at timestamptz default now(), primary key (trainer_id, student_id));
create table public.trainer_invites (code text primary key, trainer_id uuid references public.profiles, created_at timestamptz default now());
alter table public.profiles enable row level security;
alter table public.trainer_students enable row level security;

-- Stockage de fichiers (Supabase Storage)
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
