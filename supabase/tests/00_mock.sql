-- Simulation minimale de Supabase et des tables existantes du Lab utilisées
-- par la migration (pour tester sur un PostgreSQL ordinaire).
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
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
alter table public.profiles enable row level security;
alter table public.trainer_students enable row level security;
