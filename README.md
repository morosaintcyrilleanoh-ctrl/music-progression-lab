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
| `js/pages/` | Une page par fichier : accueil, comptes, tableau de bord, programme |

## Sécurité

- `js/config.js` contient uniquement la clé **publique** de Supabase (normalement visible).
- Ne jamais y mettre la clé `service_role` / `secret`.
- La protection des données est assurée par les règles de la base (Row Level Security).
