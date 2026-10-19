-- Formateur T (élèves A et B), autre formateur U, élève C (de U), admin X.
-- Les tests précédents ont déjà créé A, B, T, U, X ; on ajoute C et les liens.
insert into auth.users (id, invited_at) values ('00000000-0000-0000-0000-00000000000c', now());
insert into public.profiles (id, role) values ('00000000-0000-0000-0000-00000000000c', 'student');
insert into public.trainer_students values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000c');

-- Le formateur T publie : une formation pour tous, une pour B seulement, un live, des ressources.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into public.solfege_courses (id, title) values ('10000000-0000-0000-0000-000000000001', 'Solfège débutant');
insert into public.solfege_courses (id, title, student_id) values ('10000000-0000-0000-0000-000000000002', 'Cours particulier B', '00000000-0000-0000-0000-00000000000b');
insert into public.solfege_lessons (id, course_id, title, video_url) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Les clés', 'https://youtu.be/abc'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Leçon privée', null);
insert into public.solfege_lives (title, starts_at, meeting_url) values ('Live clé de fa', now() + interval '1 day', 'https://meet.jit.si/MPL-test');
insert into storage.objects (bucket_id, name) values
  ('solfege-files', '00000000-0000-0000-0000-0000000000f1/a.mp3'),
  ('solfege-files', '00000000-0000-0000-0000-0000000000f1/prive.png');
insert into public.solfege_resources (kind, title, storage_path) values ('audio', 'Dictée', '00000000-0000-0000-0000-0000000000f1/a.mp3');
insert into public.solfege_resources (kind, title, storage_path, lesson_id) values ('image', 'Fiche B', '00000000-0000-0000-0000-0000000000f1/prive.png', '20000000-0000-0000-0000-000000000002');
insert into public.solfege_resources (kind, title, body) values ('text', 'Conseils', 'Lire lentement.');
select pg_temp.fails($$insert into public.solfege_resources (kind, title, url, body) values ('link', 'x', 'https://a.fr', 'b')$$, 'ressource : lien ET texte refusé');
select pg_temp.fails($$insert into public.solfege_lives (title, starts_at, meeting_url) values ('x', now(), 'javascript:alert(1)')$$, 'lien de live non https refusé');
select pg_temp.fails($$insert into public.solfege_resources (kind, title, storage_path) values ('audio', 'x', '00000000-0000-0000-0000-0000000000f2/vol.mp3')$$, 'fichier rangé chez un autre formateur refusé');

-- Élève A : voit le contenu « tous », pas le cours privé de B.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) = 1 from public.solfege_courses), 'A voit 1 formation');
select pg_temp.ok((select count(*) = 1 from public.solfege_lessons), 'A voit 1 leçon');
select pg_temp.ok((select count(*) = 1 from public.solfege_lives), 'A voit le live');
select pg_temp.ok((select count(*) = 2 from public.solfege_resources), 'A voit 2 ressources (pas la fiche de B)');
select pg_temp.ok((select count(*) = 1 from storage.objects), 'A ne peut lire que le fichier audio');
insert into public.solfege_lesson_progress (lesson_id) values ('20000000-0000-0000-0000-000000000001');
select pg_temp.fails($$insert into public.solfege_lesson_progress (lesson_id) values ('20000000-0000-0000-0000-000000000002')$$, 'A ne coche pas une leçon invisible');
select pg_temp.fails($$insert into public.solfege_courses (title) values ('Pirate')$$, 'un élève ne crée pas de formation');
select pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('solfege-files', '00000000-0000-0000-0000-00000000000a/x.mp3')$$, 'un élève n’envoie pas de fichier');
delete from public.solfege_lives;
update public.solfege_courses set title = 'Modifié';

-- Élève B : voit tout, y compris son cours particulier et sa fiche.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) = 2 from public.solfege_courses), 'B voit ses 2 formations');
select pg_temp.ok((select count(*) = 3 from public.solfege_resources), 'B voit 3 ressources');
select pg_temp.ok((select count(*) = 2 from storage.objects), 'B peut lire les 2 fichiers');
select pg_temp.ok((select count(*) = 0 from public.solfege_lesson_progress), 'B ne voit pas la progression de A');

-- Élève C (autre formateur) : rien.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) = 0 from public.solfege_courses) and (select count(*) = 0 from public.solfege_lives)
  and (select count(*) = 0 from public.solfege_resources) and (select count(*) = 0 from storage.objects), 'C ne voit rien de T');

-- Autre formateur U : ne voit ni ne modifie le contenu de T.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.ok((select count(*) = 0 from public.solfege_courses), 'U ne voit pas les formations de T');
update public.solfege_lives set meeting_url = 'https://piege.example';
delete from storage.objects;
select pg_temp.fails($$insert into public.solfege_lessons (course_id, title) values ('10000000-0000-0000-0000-000000000001', 'Intrus')$$, 'U n’ajoute pas de leçon chez T');

-- T : tout est intact, voit la progression de A, peut supprimer.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.ok((select title from public.solfege_courses where id = '10000000-0000-0000-0000-000000000001') = 'Solfège débutant', 'formation non modifiée par l’élève');
select pg_temp.ok((select meeting_url from public.solfege_lives) = 'https://meet.jit.si/MPL-test', 'live non modifié par U');
select pg_temp.ok((select count(*) = 2 from storage.objects), 'fichiers non supprimés par U');
select pg_temp.ok((select count(*) = 1 from public.solfege_lesson_progress), 'T voit la leçon terminée par A');
delete from public.solfege_courses where id = '10000000-0000-0000-0000-000000000002';
select pg_temp.ok((select count(*) = 2 from public.solfege_resources), 'supprimer la formation supprime ses fichiers joints');
-- Admin : voit tout.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select pg_temp.ok((select count(*) = 1 from public.solfege_courses) and (select count(*) = 1 from public.solfege_lives), 'admin voit tout');
reset role;
