-- Formation payante, agenda, coaching, devoirs.
-- T forme A et B (trainer_students) ; U forme C ; X admin.
\set T '00000000-0000-0000-0000-0000000000f1'
\set U '00000000-0000-0000-0000-0000000000f2'
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'

select pg_temp.as_user(:'T');
insert into public.solfege_cohorts (id, title, starts_on, ends_on, capacity) values
  ('30000000-0000-0000-0000-000000000001', 'Lire une partition', current_date - 10, current_date + 80, 2),
  ('30000000-0000-0000-0000-000000000002', 'Session 2', current_date + 90, current_date + 180, 30);
insert into public.solfege_memberships (cohort_id, student_id, paid_until) values
  ('30000000-0000-0000-0000-000000000001', :'A', current_date + 20),
  ('30000000-0000-0000-0000-000000000001', :'B', current_date - 1);
select pg_temp.fails($$insert into public.solfege_memberships (cohort_id, student_id, paid_until) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', current_date + 30)$$, 'session complète : pas de 31e (ici 3e) élève');
insert into public.solfege_courses (id, title, cohort_id) values ('40000000-0000-0000-0000-000000000001', 'Cours de la session', '30000000-0000-0000-0000-000000000001');
insert into public.solfege_lessons (id, course_id, title) values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Leçon payante');
insert into public.solfege_lives (title, starts_at, meeting_url, cohort_id, replay_url) values ('Live session', now() - interval '2 days', 'https://meet.jit.si/s', '30000000-0000-0000-0000-000000000001', 'https://youtu.be/replay1');
insert into public.solfege_homework (id, title, cohort_id) values ('60000000-0000-0000-0000-000000000001', 'Exercice 1', '30000000-0000-0000-0000-000000000001');
insert into public.solfege_resources (kind, title, body, cohort_id) values ('text', 'Fiche session', 'Contenu payant', '30000000-0000-0000-0000-000000000001');
insert into public.solfege_events (kind, title, starts_at) values ('evenement', 'Live d’information', now() + interval '5 days');
insert into public.solfege_trainer_settings (whatsapp) values ('+225 07 00 00 00 00');
select pg_temp.fails($$insert into public.solfege_trainer_settings (trainer_id, whatsapp) values ('00000000-0000-0000-0000-0000000000f2', '+33 6')$$, 'numéro WhatsApp invalide / d’un autre formateur refusé');

-- A (payé) voit le contenu de la session ; B (expiré) non.
select pg_temp.as_user(:'A');
select pg_temp.ok((select count(*) = 1 from public.solfege_courses where cohort_id is not null), 'A (payé) voit la formation de la session');
select pg_temp.ok((select count(*) = 1 from public.solfege_lessons where id = '50000000-0000-0000-0000-000000000001'), 'A voit la leçon payante');
select pg_temp.ok((select count(*) = 1 from public.solfege_lives where cohort_id is not null and replay_url is not null), 'A voit le live et sa rediffusion');
select pg_temp.ok((select count(*) = 1 from public.solfege_homework), 'A voit le devoir de la session');
select pg_temp.ok((select taken = 2 from public.solfege_cohort_seats(array['30000000-0000-0000-0000-000000000001'::uuid])), 'places prises : 2 (sans voir qui)');
select pg_temp.ok((select count(*) = 1 from public.solfege_memberships), 'A ne voit que sa propre inscription');
update public.solfege_memberships set paid_until = current_date + 365;
select pg_temp.ok((select paid_until = current_date + 20 from public.solfege_memberships), 'accès de A inchangé');
select pg_temp.fails($$insert into public.solfege_lesson_progress (lesson_id) values ('00000000-0000-0000-0000-000000000000')$$, 'leçon inconnue refusée');
insert into public.solfege_lesson_progress (lesson_id) values ('50000000-0000-0000-0000-000000000001');
-- Rendu : WhatsApp, puis tentative de se mettre une note
insert into public.solfege_submissions (homework_id, kind, note) values ('60000000-0000-0000-0000-000000000001', 'whatsapp', 'Envoyé ce matin');
update public.solfege_submissions set grade = '20/20', feedback = 'parfait';
select pg_temp.ok((select grade is null and feedback is null from public.solfege_submissions), 'A ne peut pas se noter');
select pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('solfege-files', 'rendus/00000000-0000-0000-0000-00000000000b/x.pdf')$$, 'A ne dépose pas dans le dossier de B');
insert into storage.objects (bucket_id, name) values ('solfege-files', 'rendus/00000000-0000-0000-0000-00000000000a/ex1.pdf');

select pg_temp.as_user(:'B');
select pg_temp.ok((select count(*) = 0 from public.solfege_courses where cohort_id is not null), 'B (expiré) ne voit plus la formation');
select pg_temp.ok((select count(*) = 0 from public.solfege_lives where cohort_id is not null), 'B ne voit plus les lives ni les rediffusions');
select pg_temp.ok((select count(*) = 0 from public.solfege_resources where cohort_id is not null), 'B ne voit plus les ressources de la session');
select pg_temp.fails($$insert into public.solfege_submissions (homework_id, kind) values ('60000000-0000-0000-0000-000000000001', 'whatsapp')$$, 'B ne rend pas un devoir de session expirée');
select pg_temp.ok((select count(*) = 2 from public.solfege_cohorts) and (select count(*) = 1 from public.solfege_events), 'B voit l’agenda (sessions, événements)');
select pg_temp.ok((select count(*) = 0 from public.solfege_submissions), 'B ne voit pas le rendu de A');
-- Coaching : B demande 2 mois à son formateur
insert into public.solfege_coachings (id, trainer_id, months, start_month, goal) values
  ('70000000-0000-0000-0000-000000000001', :'T', 2, date_trunc('month', current_date)::date, 'Lire en clé de fa');
update public.solfege_coachings set status = 'active', paid_until = current_date + 60;
select pg_temp.ok((select status = 'pending' from public.solfege_coachings), 'coaching de B toujours en attente');
select pg_temp.fails($$insert into public.solfege_coachings (trainer_id, months, start_month) values ('00000000-0000-0000-0000-0000000000f2', 1, date_trunc('month', current_date)::date)$$, 'coaching demandé à un formateur qui n’est pas le sien refusé');
select pg_temp.fails($$insert into public.solfege_coachings (trainer_id, months, start_month) values ('00000000-0000-0000-0000-0000000000f1', 5, date_trunc('month', current_date)::date)$$, 'durée de 5 mois refusée (1, 2, 3 ou 6)');

select pg_temp.as_user(:'U');
select pg_temp.fails($$insert into public.solfege_memberships (cohort_id, student_id, paid_until) values ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', current_date)$$, 'U n’inscrit personne dans la session de T (places libres)');
select pg_temp.fails($$insert into public.solfege_courses (title, cohort_id) values ('Intrus', '30000000-0000-0000-0000-000000000001')$$, 'U ne rattache rien à la session de T');
select pg_temp.ok((select count(*) = 0 from public.solfege_coachings), 'U ne voit pas les demandes de coaching de T');

-- T valide le coaching, écrit les objectifs, programme un rendez-vous, corrige A.
select pg_temp.as_user(:'T');
update public.solfege_coachings set status = 'active', paid_until = (date_trunc('month', current_date) + interval '2 months - 1 day')::date;
insert into public.solfege_coaching_goals (id, coaching_id, month, text) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', date_trunc('month', current_date)::date, 'Clé de fa 5 min par jour');
insert into public.solfege_lives (title, starts_at, meeting_url, coaching_id) values ('Rendez-vous de B', now() + interval '1 day', 'https://meet.jit.si/b', '70000000-0000-0000-0000-000000000001');
update public.solfege_submissions set grade = '16/20', feedback = 'Très bien', corrected_at = now(), kind = 'file';
select pg_temp.ok((select grade = '16/20' and kind = 'whatsapp' from public.solfege_submissions), 'T corrige sans modifier le rendu de A');

select pg_temp.as_user(:'B');
select pg_temp.ok((select count(*) = 1 from public.solfege_lives where coaching_id is not null), 'B (coaching validé) voit son rendez-vous');
update public.solfege_coaching_goals set done = true;
select pg_temp.ok((select done from public.solfege_coaching_goals), 'B coche son objectif');
select pg_temp.fails($$update public.solfege_coaching_goals set text = 'Rien à faire'$$, 'B ne modifie pas le texte de l’objectif');

select pg_temp.as_user(:'A');
select pg_temp.ok((select count(*) = 0 from public.solfege_lives where coaching_id is not null), 'A ne voit pas le rendez-vous de B');
select pg_temp.ok((select count(*) = 0 from public.solfege_coaching_goals), 'A ne voit pas les objectifs de B');
select pg_temp.ok((select grade = '16/20' from public.solfege_submissions), 'A voit sa note');
select pg_temp.fails($$update public.solfege_submissions set note = 'modifié'$$, 'devoir corrigé : plus modifiable par l’élève');

-- Fin de l'accès de A : le contenu payant se ferme, son devoir corrigé reste visible.
select pg_temp.as_user(:'T');
update public.solfege_memberships set paid_until = current_date - 1 where student_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.as_user(:'A');
select pg_temp.ok((select count(*) = 0 from public.solfege_courses where cohort_id is not null), 'accès expiré : formation fermée pour A');
select pg_temp.ok((select count(*) = 1 from public.solfege_homework) and (select count(*) = 1 from public.solfege_submissions), 'accès expiré : A garde son devoir corrigé');
select pg_temp.as_user(:'T');
update public.solfege_memberships set paid_until = current_date + 30 where student_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.as_user(:'A');
select pg_temp.ok((select count(*) = 1 from public.solfege_courses where cohort_id is not null), '+1 mois : formation rouverte pour A');
reset role;
