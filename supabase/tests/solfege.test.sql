-- Élève A (formateur T), élève B (sans formateur), formateur T, autre formateur U, admin X.
-- Comptes créés par l'administrateur (invités) : pas besoin de code formateur.
insert into auth.users (id, invited_at) values
  ('00000000-0000-0000-0000-00000000000a', now()), ('00000000-0000-0000-0000-00000000000b', now()),
  ('00000000-0000-0000-0000-0000000000f1', now()), ('00000000-0000-0000-0000-0000000000f2', now()),
  ('00000000-0000-0000-0000-0000000000ad', now());
insert into public.profiles (id, role) values
  ('00000000-0000-0000-0000-00000000000a', 'student'), ('00000000-0000-0000-0000-00000000000b', 'student'),
  ('00000000-0000-0000-0000-0000000000f1', 'trainer'), ('00000000-0000-0000-0000-0000000000f2', 'trainer'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin');
insert into public.trainer_students values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a');

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then set role anon; else set role authenticated; end if;
end $$;
create function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'ok : %', label;
end $$;
create function pg_temp.fails(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'ok : % (%)', label, sqlerrm; return; end;
  raise exception 'ÉCHEC (aurait dû être refusé) : %', label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Élève A enregistre puis met à jour une séance (même client_id).
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.solfege_sessions (client_id, lab, mode, correct, total, started_at)
  values ('s1', 'lecture-des-notes', 'training', 3, 5, now() - interval '10 minutes');
insert into public.solfege_sessions (client_id, lab, mode, correct, total, started_at, finished_at, skills)
  values ('s1', 'lecture-des-notes', 'training', 8, 10, now() - interval '10 minutes', now(), '{"treble:G4":[2,2]}')
  on conflict (user_id, client_id) do update set correct = excluded.correct, total = excluded.total,
    finished_at = excluded.finished_at, skills = excluded.skills;
select pg_temp.ok((select correct = 8 and total = 10 from public.solfege_sessions where client_id = 's1'), 'mise à jour par client_id');
select pg_temp.fails($$insert into public.solfege_sessions (user_id, client_id, lab, mode, correct, total, started_at)
  values ('00000000-0000-0000-0000-00000000000b', 'x', 'rythme', 'training', 1, 1, now())$$, 'écrire pour un autre élève');
select pg_temp.fails($$insert into public.solfege_sessions (client_id, lab, mode, correct, total, started_at)
  values ('y', 'rythme', 'training', 6, 5, now())$$, 'plus de bonnes réponses que de questions');
select pg_temp.fails($$insert into public.solfege_sessions (client_id, lab, mode, correct, total, started_at)
  values ('z', 'inconnu', 'training', 1, 1, now())$$, 'volet inconnu');
select pg_temp.fails($$delete from public.solfege_sessions$$, 'suppression');

-- Élève B : ne voit pas A, ne peut pas modifier A.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.solfege_sessions (client_id, lab, mode, correct, total, started_at)
  values ('b1', 'intervalles', 'evaluation', 4, 10, now());
select pg_temp.ok((select count(*) = 1 from public.solfege_sessions), 'B ne voit que sa séance');
update public.solfege_sessions set correct = 0 where client_id = 's1';
select pg_temp.ok(not public.solfege_can_view('00000000-0000-0000-0000-00000000000a'), 'B ne peut pas voir A');

-- Formateur T voit A mais pas B ; ne peut pas modifier.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.ok((select count(*) = 1 and min(correct) = 8 from public.solfege_sessions), 'T voit uniquement la séance de A, intacte');
update public.solfege_sessions set correct = 0;
-- Autre formateur U : rien.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.ok((select count(*) = 0 from public.solfege_sessions), 'U ne voit rien');
-- Admin : tout.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select pg_temp.ok((select count(*) = 2 and sum(correct) = 12 from public.solfege_sessions), 'admin voit tout, rien n''a été modifié');
-- Visiteur non connecté : refusé.
select pg_temp.as_user(null);
select pg_temp.fails($$select * from public.solfege_sessions$$, 'visiteur anonyme');
reset role;
