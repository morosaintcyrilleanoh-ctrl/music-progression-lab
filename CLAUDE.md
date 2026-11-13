# Notes pour Claude — Music Progression Lab

## Le projet

Plateforme d'enseignement musical en français de **Formateur Anoh Cyrille**.

- **Music Progression Lab** (dépôt `music-progression-lab`) : site en JavaScript sans framework, en ligne sur https://music-progression-lab.vercel.app (Vercel, offre gratuite pour l'instant). Base Supabase « Music progression Lab ».
- **Volet Solfège** (dépôt `solfege-progression`, Next.js) : exporté dans le dossier `/solfege` du Lab par `npm run export:mpl` (`scripts/export-mpl.mjs`). Après une modification du Solfège, régénérer l'export et le committer dans `music-progression-lab`.
- « L'école de la musique » est un projet séparé : ne pas y toucher.

Déjà en place : espaces élève, formateur et admin ; cours, ressources, devoirs, lives, annonces ; inscription privée ; formation payante (sessions de 3 mois, 30 places, aucun prix affiché, seuls la formation et le coaching sont payants) ; oreille musicale (activités, défi du jour, examens et certificat PDF, programmes de 30 jours, classement) ; piano enregistré Salamander (CC BY 3.0, `assets/piano/` du Lab) ; sortie audio forte avec compresseur et plafond doux, et Bluetooth gardé éveillé ; bouton « Réécouter l'exercice » après chaque correction.

## Règles à respecter

- Répondre au propriétaire **en français**, simplement, sans jargon.
- **Aucune clé secrète** dans le code frontend, le dépôt ou Vercel (jamais de `SUPABASE_SECRET_KEY`). Seules l'URL et la clé publique Supabase sont côté navigateur ; la sécurité repose sur les règles RLS.
- **Ne jamais simuler une sauvegarde réussie** : afficher une vraie erreur si l'écriture échoue.
- **SQL** : chaque changement est une nouvelle migration dans `supabase/migrations/` (horodatée), avec des tests dans `supabase/tests/`. Montrer le SQL au propriétaire : c'est lui qui l'exécute dans Supabase.
- **Interface** : montrer d'abord un exemple (maquette ou capture) avant de modifier l'écran.
- Travailler sur une branche et **proposer une PR** : c'est le propriétaire qui fusionne. Ordre : PR du Lab, puis PR du Solfège.
- Avant chaque PR, lancer les tests (voir ci-dessous) et dire honnêtement ce qui passe ou échoue.
- Ne pas mettre d'adresse e-mail ou de donnée personnelle du propriétaire dans le code ou les PR.

## Repères dans ce dépôt

- `index.html` + `js/` : routeur par hash, gabarits `html` / `raw()` (`js/ui.js`), textes dans `js/i18n/fr.js` via `t()`.
- `js/audio.js` : moteur audio (piano enregistré, chaîne de sortie, Bluetooth).
- `js/exercises/` : exercices (`askChoice`, `feedback`, `next` dans `common.js`) ; `js/ear/` : oreille musicale.
- `js/pages/` : pages (élève, formateur, admin, formation, oreille).
- `solfege/` : **généré** depuis `solfege-progression`, ne pas modifier à la main.
- `supabase/migrations/` et `supabase/tests/` : base de données.

## Tests

- Base de données : `bash scripts/test-db.sh` (PostgreSQL local).
- Tests navigateur : depuis `solfege-progression`, `npm run test:e2e:mpl`, `test:e2e:mpl-sync`, `test:e2e:mpl-espace`, `test:e2e:mpl-formation`, `test:e2e:mpl-oreille`.
