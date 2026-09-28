# UC-CPT-05 — Suivre sa progression de formation

| Champ | Valeur |
|---|---|
| **Acteur principal** | Tout utilisateur inscrit (apprenant, cartographe, promptologue…) ; un visiteur peut suivre la formation sans compte (progression locale) |
| **Acteurs secondaires** | — |
| **Portée** | humanome.xyz — `#/espace/formation[/<chapitre>]`, `#/cartographe/formation`, `#/promptologue/formation`, hub public `#/guides/<parcours>[/<chapitre>]` ; `GET`/`PUT /api/training/progress` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (« suivre son propre parcours de formation, mode expert »), §4.6 (contenu public, progression rattachée au compte), §4.5 (le profil stocke la progression) ; registre RGPD §4 |
| **Statut** | Implémenté (P8.2 ; multi-parcours M7 ; hub des guides) |

## Objectif

Lire les chapitres d'un parcours de formation et marquer ceux qui sont
terminés, pour voir son avancement — rattaché au compte quand on est connecté,
conservé dans le navigateur sinon, sans rien perdre au moment de se connecter.

## Déclencheur

L'utilisateur ouvre la formation de son espace de rôle ou un guide du hub
public, puis coche (ou décoche) « Chapitre terminé ».

## Préconditions

- Le contenu des parcours est embarqué au build (`content/formation/<parcours>/*.md`,
  lisible sans API, même en copie statique).
- Progression serveur : session ouverte (UC-CPT-02).

## Garanties en cas de succès

- Connecté : une ligne `training_progress (compte, parcours, chapitre,
  completed_at)` par chapitre terminé ; la liste affiche « Progression : n / N
  chapitres terminés (p %) — synchronisée avec votre compte ».
- Anonyme : `localStorage['humanome-training'] = {<parcours>:
  {chapitresTermines: [...]}}` (même forme que la réponse serveur).
- À la connexion, la progression locale est versée sur le compte puis retirée
  du navigateur.

## Garanties minimales (en cas d'échec)

- Une écriture refusée est annulée à l'écran (case rétablie) et signalée.
- La progression locale n'est effacée que si **toute** la migration a réussi.
- Seuls des identifiants de parcours et de chapitre transitent, jamais de
  contenu.

## Scénario nominal (connecté, espace apprenant)

1. L'utilisateur ouvre `#/espace/formation` ; l'espace vérifie la session
   (`GET /api/auth/me`) et affiche « Connecté en tant que … ».
2. La section Formation charge la progression : elle migre d'abord la
   progression locale éventuelle (A2), puis lit `GET /api/training/progress`
   → `{apprenant: {chapitresTermines: [...]}}` (objet vide `{}` au départ).
3. Le site liste les chapitres du parcours (7 pour l'apprenant : fichiers
   `NN-slug.md` hors `index.md`, triés par numéro, titres du front-matter),
   chacun avec une case « Chapitre terminé : <titre> », et le compteur
   « … — synchronisée avec votre compte ».
4. L'utilisateur coche un chapitre ; l'écran est mis à jour immédiatement
   (optimiste).
5. Le site envoie `PUT /api/training/progress {parcours, chapitre, completed:
   true}` avec `X-CSRF-Token`.
6. Le serveur vérifie la session, valide les identifiants (motif
   `^[a-z0-9][a-z0-9._-]{0,63}$`) et le booléen, insère la ligne (sans effet si
   elle existe : la date de première complétion est conservée) et renvoie la
   progression complète, groupée par parcours et triée.
7. Le compteur affiche le nouvel avancement (ex. « 1 / 7 chapitres terminés
   (14 %) »).

## Scénarios alternatifs

- **A1 — Sans compte** (étape 2) : la progression est lue et écrite dans
  `localStorage['humanome-training']` ; aucune requête ; une note indique
  « Sans compte, la progression reste dans ce navigateur (localStorage). À la
  connexion, elle est migrée automatiquement vers votre compte. »
- **A2 — Connexion après une progression anonyme** (étape 2) : pour chaque
  chapitre local, le site envoie `PUT … completed: true` (un par chapitre),
  vide le `localStorage` puis relit le serveur : l'union des deux
  progressions s'affiche.
- **A3 — Décocher** (étape 4) : `PUT … completed: false` supprime la ligne
  (sans effet si elle n'existe pas).
- **A4 — Lire un chapitre** (étape 3) : `#/espace/formation/<chapitre>` rend
  le Markdown (md.js puis DOMPurify), réécrit les liens internes `NN-….md` vers
  la route du parcours, propose « ← Tous les chapitres », les chapitres
  précédent / suivant et la case « Chapitre terminé ».
- **A5 — API de progression indisponible alors que connecté** (étape 2) : si la
  migration ou la lecture échoue, la progression **locale** s'affiche (sans la
  mention « synchronisée ») et reste dans le navigateur.
- **A6 — Autre parcours ou hub public** : `#/cartographe/formation`,
  `#/promptologue/formation` ou `#/guides/<parcours>` (lisible par tous)
  utilisent le même composant avec `parcours` = `cartographe`,
  `promptologue`, `visiteur`, `employeur`, `etablissement`, `epistemiarque`,
  `admin` ou `noesiologie` ; la progression est enregistrée sous ce parcours.

## Scénarios d'erreur

- **E1 — Écriture refusée** (étape 5) : réseau, `5xx`, `403` CSRF… → la case
  revient à son état précédent et le message d'erreur s'affiche
  (`role="alert"`).
- **E2 — Chapitre inconnu** (A4) : « Chapitre introuvable : « <slug> ». » et
  lien « Retour à la liste des chapitres ».
- **E3 — Refus de l'API** : sans session `401` ; identifiant hors motif ou
  `completed` non booléen `422 {error: "Validation échouée", fields}` ; sans
  jeton CSRF `403`.

## Règles de gestion

- **RG1** — Le contenu de formation est public ; seule la progression est une
  donnée de compte (§4.6).
- **RG2** — Minimisation : parcours + chapitre + date de complétion, aucun
  contenu (registre RGPD §4).
- **RG3** — Idempotence dans les deux sens (clé primaire compte, parcours,
  chapitre).
- **RG4** — Chacun ne lit et n'écrit que sa propre progression.
- **RG5** — Migration « tout ou rien » : le local n'est vidé que si tous les
  PUT ont réussi.
- **RG6** — Le serveur ne vérifie pas que le chapitre existe dans le contenu :
  tout identifiant conforme au motif est accepté (le front n'envoie que des
  slugs de fichiers réels, tous conformes).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Progression connectée | `training_progress` ; CASCADE à la suppression du compte |
| Progression anonyme | `localStorage['humanome-training']` du navigateur ; vidée après migration |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/espace/FormationSection.jsx` | Liste, compteur, page de chapitre, bascule optimiste + annulation |
| Front | `web/src/lib/training-store.js` — `createTrainingStore` (`setLocal`, `listLocal`, `clearLocal`, `fetchServer`, `setServer`, `migrateLocalToServer`, `load`, `setChapter`) | Local / serveur / migration |
| Front | `web/src/views/espace/formation-content.js` — `listChapters`, `getChapter`, `rewriteChapterLink`, `FORMATION_BASE_HASH`, `guidesBaseHash`, `FORMATION_PARCOURS` | Contenu embarqué des parcours |
| Front | `web/src/views/EspaceView.jsx`, `web/src/views/GuidesView.jsx` (et vues cartographe / promptologue) | Vérification de session, `connected` |
| API | `GET`/`PUT /api/training/progress` — `api/src/routes/training.php` | Validation, upsert / suppression, réponse groupée (logique dans la route, sans classe de domaine) |
| Données | `training_progress` (migration 005) | Clé primaire (compte, parcours, chapitre), CASCADE |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CPT-05-U01 | Table `training_progress` | Clé primaire (pas de doublon, RG3), longueurs 64 alignées sur le motif, CASCADE | `api/tests/UseCases/Unit/UcCpt05SuivreProgressionFormationTest.php` |
| UC-CPT-05-U02 | `setLocal`, `listLocal`, `clearLocal` | Forme `{parcours: {chapitresTermines}}`, sans doublon (A1) | `web/test/usecases/unit/uc-cpt-05-suivre-progression-formation.test.jsx` |
| UC-CPT-05-U03 | `createTrainingStore` | Repli mémoire sans `localStorage` | idem |
| UC-CPT-05-U04 | `load`, `migrateLocalToServer` | Un PUT par chapitre, local vidé, lecture serveur (A2) | idem |
| UC-CPT-05-U05 | `load` | Migration interrompue ou GET en panne → local conservé (RG5, A5) | idem |
| UC-CPT-05-U06 | `setChapter`, `fetchServer` | Routage serveur/local, booléen, filtrage du parcours | idem |
| UC-CPT-05-U07 | `setLocal` (deux parcours) | **Anomalie figée** : écrasement de la progression locale d'un autre parcours | idem |
| UC-CPT-05-U08 | `listChapters` | 7 chapitres triés, index exclu, titres, parcours inconnu refusé | idem |
| UC-CPT-05-U09 | `getChapter`, `rewriteChapterLink`, `FORMATION_BASE_HASH` | Liens internes vers l'espace ou les guides | idem |
| UC-CPT-05-U10 | `FORMATION_PARCOURS`, `listChapters` | Tout identifiant embarqué respecte le motif de l'API (RG6) | idem |
| UC-CPT-05-U11 | `FormationSection` (seul, store injecté) | Compteur arrondi, mention « synchronisée » selon la source, bascule optimiste puis annulation (E1) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-05-F01 | Nominal | API | `{}` → PUT → progression triée et groupée par parcours | `api/tests/UseCases/Functional/UcCpt05SuivreProgressionFormationTest.php` |
| UC-CPT-05-F02 | A3 | API | Décocher supprime ; idempotence ; date conservée | idem |
| UC-CPT-05-F03 | A2 | API | PUT successifs = union sans doublon | idem |
| UC-CPT-05-F04 | E3 | API | 401, 422 par champ, borne 64, 403 CSRF | idem |
| UC-CPT-05-F05 | RG4 | API | Progressions indépendantes entre comptes | idem |
| UC-CPT-05-F06 | Nominal | IHM | `<App/>` connecté : compteur « synchronisée », PUT + CSRF, 1/7 (14 %) | `web/test/usecases/functional/uc-cpt-05-suivre-progression-formation.test.jsx` |
| UC-CPT-05-F07 | A1 | IHM | Anonyme : `localStorage`, aucune requête | idem |
| UC-CPT-05-F08 | A2 | IHM | Migration de 2 chapitres locaux + 1 serveur → 3/7, local vidé | idem |
| UC-CPT-05-F09 | A3 | IHM | Décocher → `completed: false` | idem |
| UC-CPT-05-F10 | A4 | IHM | Page de chapitre : titre, lien interne réécrit, suivant, case | idem |
| UC-CPT-05-F11 | A5 | IHM | Migration en échec → progression locale conservée et affichée | idem |
| UC-CPT-05-F12 | A6 | IHM | `#/guides/cartographe` connecté : PUT sous `parcours: cartographe` | idem |
| UC-CPT-05-F13 | E1 | IHM | Écriture refusée → case rétablie + message | idem |
| UC-CPT-05-F14 | E2 | IHM | Chapitre inconnu | idem |

### Tests existants liés (non-régression)

- `api/tests/TrainingTest.php` — authentification, objet vide, groupement, décocher, validation, isolation, CSRF.
- `web/src/lib/training-store.test.js` — store isolé (local, migration, échec).
- `web/src/views/espace/formation-content.test.js` — parcours, métadonnées, liens.
- `web/src/views/EspaceView.test.jsx`, `web/src/views/GuidesView.test.jsx` — vues avec un store factice.
- `web/e2e/guides-public.e2e.js` — hub public (navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCpt05
cd web && npx vitest run test/usecases --testNamePattern UC-CPT-05
```

## Anomalies constatées

- **Progression anonyme multi-parcours écrasée** (`web/src/lib/training-store.js`,
  `writeLocal`) : la clé `humanome-training` est réécrite avec le **seul**
  parcours courant (`{[parcours]: …}`). Un visiteur qui coche des chapitres
  du guide apprenant puis d'un autre guide (`#/guides/cartographe`…) perd la
  progression locale du premier ; elle n'est donc pas non plus migrée à la
  connexion. Comportement actuel figé par UC-CPT-05-U07 (correctif attendu :
  fusionner avec l'objet existant au lieu de le remplacer).

## Limites

- La réponse du `PUT` (progression complète) n'est pas relue par le front,
  qui garde son état optimiste ; l'écran n'est resynchronisé qu'au prochain
  chargement de la section.
