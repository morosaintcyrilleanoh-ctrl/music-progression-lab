-- Inscription réservée : code formateur obligatoire (sauf personne invitée).
insert into public.trainer_invites (code, trainer_id) values ('MPL-AB12C', '00000000-0000-0000-0000-0000000000f1');
select pg_temp.fails($$insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000101', 'sans@code.fr')$$, 'inscription sans code refusée');
select pg_temp.fails($$insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000102', 'faux@code.fr', '{"trainer_code":"MPL-ZZZZZ"}')$$, 'inscription avec un faux code refusée');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000103', 'bon@code.fr', '{"trainer_code":" mpl-ab12c "}');
select pg_temp.ok(exists (select 1 from auth.users where email = 'bon@code.fr'), 'inscription avec le code (minuscules, espaces) acceptée');
insert into auth.users (id, email, invited_at) values ('00000000-0000-0000-0000-000000000104', 'invite@ecole.fr', now());
select pg_temp.ok(exists (select 1 from auth.users where email = 'invite@ecole.fr'), 'personne invitée par l’administrateur acceptée');
