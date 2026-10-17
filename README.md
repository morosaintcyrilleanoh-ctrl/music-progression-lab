# Music Progression Lab

> Développe ton oreille. Comprends ta musique. Progresse chaque jour.

Application web d'entraînement de l'oreille musicale : HTML, CSS et JavaScript, sans installation ni compilation.
Base de données et comptes : **Supabase**. Hébergement : **Vercel**.

## Organisation des fichiers

| Fichier / dossier | Rôle |
|---|---|
| `index.html` | La page unique qui accueille toute l'application |
| `assets/styles.css` | Le design (thème sombre violet / bleu) |
| `js/config.js` | Adresse Supabase et clé **publique** |
| `js/app.js` | Point de départ : liste des pages et menu |
| `js/router.js` | Navigation entre les pages |
| `js/auth.js` | Connexion et messages d'erreur en français |
| `js/data.js` | Lecture des données dans Supabase |
| `js/i18n/fr.js` | Tous les textes en français (ajouter `en.js` pour l'anglais) |
| `js/pages/` | Une page par fichier : accueil, comptes, tableau de bord, programme, séance, statistiques, diagnostic et entraînement (`personal.js`), mon cours (`course.js`), espace formateur (`trainer.js`) |
| `js/exercises/` | Les exercices interactifs (un fichier par famille) et leur registre `index.js` |
| `js/audio.js` / `js/pitch.js` | Production des sons / détection de la voix au micro (algorithme YIN) |
| `js/runner.js` | Lanceur d'exercices (diagnostic, entraînement, devoirs) |
| `js/exercises/ear-quiz.js` | Exercices d'oreille : intervalles, accords, gammes, degrés, suites d'accords |
| `js/pages/library.js` | Bibliothèque d'exercices (niveaux à débloquer) |
| `solfege/` | Volet **Solfège** (lecture des notes, rythme, tonalités, intervalles, test de niveau) — fichiers **générés**, ne pas modifier à la main |

## Sécurité

- `js/config.js` contient uniquement la clé **publique** de Supabase (normalement visible).
- Ne jamais y mettre la clé `service_role` / `secret`.
- La protection des données est assurée par les règles de la base (Row Level Security).

## Volet Solfège

Le dossier `solfege/` contient le volet solfège, accessible depuis le menu (**Solfège**)
et la page d'accueil, à l'adresse `/solfege/`. Il fonctionne sans compte : les résultats
restent sur l'appareil de l'élève, et il reste utilisable hors connexion après une
première visite.

### Résultats de solfège dans le compte de l'élève

Quand l'élève est **connecté au Lab**, chaque séance de solfège porte son identifiant ;
le Lab (`js/solfege-sync.js`, chargé aussi par les pages du solfège via
`js/solfege-bridge.js`) l'enregistre dans la table `solfege_sessions`. Les séances
faites sans être connecté, ou par un autre élève sur le même appareil, ne sont jamais
envoyées. Les résultats apparaissent :

- sur le **tableau de bord** de l'élève (bloc « Solfège ») ;
- sur la **fiche élève** de l'espace formateur.

Règles d'accès (RLS) : l'élève n'écrit que ses propres séances ; seuls l'élève, son
formateur (table `trainer_students`) et les administrateurs peuvent les lire ; aucune
suppression par l'API.

**Activation (une fois)** : exécuter `supabase/migrations/20261017120000_solfege_sessions.sql`
dans Supabase → *SQL Editor* du projet Music Progression Lab. Sans cette table, le site
fonctionne normalement et le bloc « Solfège » indique que le suivi n'est pas activé.
Tests de la migration sur un PostgreSQL local : `bash scripts/test-db.sh`.

Ces fichiers sont produits à partir du projet **Solfège Progression** (même code que les
laboratoires de ce projet, aux couleurs de Music Progression Lab). Pour les mettre à jour :

```bash
# dans le dossier du projet solfege-progression
npm run export:mpl -- ../music-progression-lab/solfege
npm run test:e2e:mpl -- ../music-progression-lab
npm run test:e2e:mpl-sync -- ../music-progression-lab   # envoi des résultats
```
