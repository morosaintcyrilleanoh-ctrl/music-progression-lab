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

## Plateforme privée (élèves uniquement)

- **Inscription** : il faut le **code formateur** (Espace formateur → Élèves). La base le
  vérifie à la création du compte (`supabase/migrations/20261019120000_inscription_code_formateur.sql`)
  et l'élève est relié automatiquement à ce formateur à sa première connexion. Le lien
  partagé par le formateur (`#/inscription?code=…`) préremplit le code.
- **Contenu** : sans connexion, seuls l'accueil et les pages de compte sont visibles ;
  exercices de l'oreille et volet Solfège renvoient vers la connexion (puis reviennent
  à la page demandée).
- Créer un compte sans code (formateur, test) : Supabase → Authentication → *Invite user*,
  ou s'inscrire avec son propre code formateur puis changer le rôle.

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

### Espace solfège : formations, lives, ressources

Depuis l'accueil du solfège (cases **Formations · Lives · Ressources**), l'élève connecté
retrouve ce que son formateur publie (`#/espace-solfege/...`) : formations découpées en
leçons (texte, vidéo YouTube/Google Drive, fichiers joints) avec sa progression, lives
(bouton « Rejoindre », replays) et ressources (audio, vidéo, image, PDF, texte, lien).
Le formateur publie tout cela dans **Espace formateur → 🎼 Solfège**, pour tous ses élèves
ou pour un seul. Les ressources « oreille » existantes ne changent pas.

- Lives : lien **Jitsi** créé automatiquement (gratuit, sans compte pour les élèves ;
  le formateur peut devoir se connecter avec Google pour ouvrir la salle) ou lien
  Zoom / Google Meet du formateur.
- Fichiers : compartiment privé `solfege-files` (50 Mo par fichier, liens temporaires).
  Pour les longues vidéos, un lien YouTube « non répertorié » évite de remplir le
  stockage gratuit de Supabase (1 Go).

**Activation (une fois)** : exécuter `supabase/migrations/20261018120000_solfege_espace.sql`
dans Supabase → *SQL Editor* du projet Music Progression Lab.

Ces fichiers sont produits à partir du projet **Solfège Progression** (même code que les
laboratoires de ce projet, aux couleurs de Music Progression Lab). Pour les mettre à jour :

```bash
# dans le dossier du projet solfege-progression
npm run export:mpl -- ../music-progression-lab/solfege
npm run test:e2e:mpl -- ../music-progression-lab
npm run test:e2e:mpl-sync -- ../music-progression-lab   # envoi des résultats
```
