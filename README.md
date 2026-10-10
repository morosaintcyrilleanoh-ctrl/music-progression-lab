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

## Sécurité

- `js/config.js` contient uniquement la clé **publique** de Supabase (normalement visible).
- Ne jamais y mettre la clé `service_role` / `secret`.
- La protection des données est assurée par les règles de la base (Row Level Security).
