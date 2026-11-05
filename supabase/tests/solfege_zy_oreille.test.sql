-- Oreille+ : résultats, programmes, classement. T forme A et B ; U forme C.
\set T '00000000-0000-0000-0000-0000000000f1'
\set U '00000000-0000-0000-0000-0000000000f2'
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
update public.profiles set full_name = 'Awa Koné' where id = :'A';
update public.profiles set full_name = 'Yao Kouassi' where id = :'B';
update public.profiles set full_name = 'Fatou Bamba' where id = :'C';

select pg_temp.as_user(:'A');
insert into public.ear_results (activity, kind, correct, total, day) values
  ('defi', 'defi', 4, 5, current_date), ('defi', 'defi', 5, 5, current_date), ('defi', 'defi', 3, 5, current_date - 1);
insert into public.ear_results (activity, level, correct, total) values ('dictee-melodique', 2, 7, 10);
insert into public.ear_results (activity, kind, correct, total, passed) values ('intervalles', 'examen', 15, 20, true);
select pg_temp.fails($$insert into public.ear_results (activity, kind, correct, total, passed) values ('intervalles', 'examen', 10, 20, true)$$, 'examen « réussi » à 50 % refusé');
select pg_temp.fails($$insert into public.ear_results (user_id, activity, correct, total) values ('00000000-0000-0000-0000-00000000000b', 'cadences', 1, 1)$$, 'résultat au nom d’un autre élève refusé');
select pg_temp.fails($$insert into public.ear_results (activity, kind, correct, total, day) values ('defi', 'defi', 5, 5, current_date - 10)$$, 'défi antidaté refusé');
select pg_temp.fails($$update public.ear_results set correct = 5$$, 'résultat non modifiable');
insert into public.ear_program_progress (program, day) values ('oreille-30', 1), ('oreille-30', 2);
select pg_temp.fails($$insert into public.ear_program_progress (program, day) values ('oreille-30', 1)$$, 'jour de programme en double refusé');

select pg_temp.as_user(:'B');
insert into public.ear_results (activity, kind, correct, total, day) values ('defi', 'defi', 4, 5, current_date);
select pg_temp.ok((select count(*) = 1 from public.ear_results), 'B ne voit que ses résultats');
select pg_temp.ok((select count(*) = 2 from public.ear_leaderboard(7)), 'classement de B : lui et A (même formateur)');
select pg_temp.ok((select name = 'Awa' and points = 8 and days = 2 and not is_me and rank = 1 from public.ear_leaderboard(7) where name = 'Awa'), 'A : 8 points (meilleur score de chaque jour), prénom seulement');
select pg_temp.ok((select is_me and points = 4 and rank = 2 from public.ear_leaderboard(7) where name = 'Yao'), 'B : 4 points, 2e');

select pg_temp.as_user(:'C');
insert into public.ear_results (activity, kind, correct, total, day) values ('defi', 'defi', 5, 5, current_date);
select pg_temp.ok((select count(*) = 1 and bool_and(is_me) from public.ear_leaderboard(7)), 'C (autre formateur) ne voit pas les élèves de T');
select pg_temp.ok((select count(*) = 0 from public.ear_program_progress), 'C ne voit pas les programmes de A');

select pg_temp.as_user(:'T');
select pg_temp.ok((select count(*) = 6 from public.ear_results), 'T voit les résultats de ses élèves A et B');
select pg_temp.ok((select count(*) = 2 from public.ear_leaderboard(7)), 'T voit le classement de ses élèves');
select pg_temp.ok((select count(*) = 2 from public.ear_program_progress), 'T voit la progression de A dans les programmes');
select pg_temp.as_user(:'U');
select pg_temp.ok((select count(*) = 1 from public.ear_results), 'U ne voit que les résultats de son élève C');
select pg_temp.as_user(null);
select pg_temp.fails($$select * from public.ear_leaderboard(7)$$, 'visiteur : pas de classement');
reset role;
