# UC-ADM-02 — Gérer le Golden Prompt et ses accès

| Champ | Valeur |
|---|---|
| **Acteur principal** | Administrateur (rôle `admin`, session ouverte) |
| **Acteurs secondaires** | Promptologue autorisé (bénéficiaire de l'accès) ; établissement (acteur commercial du Golden, sans accès par ce cas) |
| **Portée** | humanome.xyz — `#/admin/golden` et API session admin `POST/GET /api/admin/golden`, `POST /api/admin/golden/{id}/grant` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §2 (administrateur), §3.4 (comparer au Golden Prompt), §3.8, §4.10 (Golden privé par défaut, publication au cas par cas), §6.3 (purge), §6.5 (journalisation minimale), §7 (modèle économique) ; `docs/autorisations.md` P12 ; formation promptologue ch. 5 |
| **Statut** | Implémenté (P12.1, migration 010) — accès accordé mais consommé par aucune route (voir « Limites ») |

## Objectif

Importer le Golden Prompt — la version « haut de gamme », privée, du prompt de
cartographie — **hors Git**, directement en base et marqué privé, le lister
sans jamais en exposer le contenu, et autoriser **au cas par cas** un
promptologue à y accéder.

## Déclencheur

L'administrateur ouvre **Administration → Golden Prompt** (`#/admin/golden`).

## Préconditions

- Session ouverte sur un compte portant le rôle `admin` (l'`admin` n'est pas
  un super-rôle : ces routes sont sa seule surface).
- Un document `prompt-package` valide au schéma, dont l'identifiant n'est pas
  celui d'un paquet public.
- Pour autoriser : le compte cible existe (non supprimé) et porte le rôle
  `promptologue` ; l'administrateur connaît son identifiant de compte (UC-ADM-01).

## Garanties en cas de succès

- Le Golden est stocké comme paquet **privé** (`is_private = 1`) avec une
  version publiée immuable ; il n'est ni listé, ni servi, ni proposé par
  défaut, ni dérivable, ni comparable, ni exécutable en masse.
- La liste d'administration montre ses versions et les promptologues
  autorisés (nom, email, date) — jamais ses gabarits.
- Chaque import et chaque autorisation nouvelle sont journalisés
  (`golden_imported`, `golden_access_granted`) avec des identifiants seulement.

## Garanties minimales (en cas d'échec)

- Rien n'est écrit (pas de paquet, pas d'autorisation, pas d'audit).
- Un contenu Golden n'est jamais renvoyé par une réponse, même d'erreur.

## Scénario nominal

1. L'administrateur ouvre `#/admin/golden` ; la vue vérifie la session
   (`GET api/auth/me`) et le rôle `admin`, puis affiche les onglets et la
   section.
2. La section charge `GET api/admin/golden` : paquets privés (`id`,
   `packageId`, `description`, `versions`, `grants`), ou « Aucun Golden Prompt
   importé pour l'instant. »
3. Il colle le document `prompt-package` (JSON) dans « Document prompt-package
   (JSON) » et clique **Importer** ; le navigateur vérifie que c'est du JSON
   puis envoie `POST api/admin/golden {document}` avec le jeton CSRF.
4. Le serveur (garde `RequireRole::any('admin')` + CSRF) valide le document au
   schéma, refuse un identifiant déjà porté par un paquet public, compare à une
   éventuelle version existante (même empreinte = inchangé), puis crée le
   paquet privé et sa version publiée, journalise `golden_imported`
   `{packageId, version}` et répond `201 {status: "imported", id, version,
   contentHash}`.
5. Le navigateur affiche « Golden « *id* » *version* importé (privé). », vide
   le formulaire et recharge la liste.
6. Dans la ligne du Golden, il saisit l'identifiant de compte d'un
   promptologue (« Autoriser un promptologue (identifiant de compte) ») et
   clique **Autoriser** : `POST api/admin/golden/{id}/grant {userId}`.
7. Le serveur vérifie `userId` (entier > 0), l'existence du Golden privé, du
   compte (non supprimé) et son rôle `promptologue`, insère l'autorisation
   (idempotente), journalise `golden_access_granted` `{packageId,
   targetUserId}` et répond `200 {status: "granted", id, userId}`.
8. Le navigateur affiche « Accès accordé au compte *N*. » et recharge la
   liste : le promptologue apparaît avec son nom, son email et la date.

## Scénarios alternatifs

- **A1 — Ré-import identique** (étape 4) : même `(id, version)`, même
  empreinte → `200 {status: "unchanged"}` ; « … déjà présent, inchangé. » ;
  pas de nouvel audit.
- **A2 — Nouvelle version du Golden** (étape 4) : même `id`, nouvelle
  `version` → `201`, la liste montre les versions dans l'ordre de publication.
- **A3 — Compte déjà autorisé** (étape 7) : `200 {status: "unchanged"}` ;
  « Le compte *N* avait déjà accès. » ; pas de nouvel audit.
- **A4 — Document « nu »** (étape 3, usage par script) : l'API accepte aussi
  le document sans enveloppe `{document}`.

## Scénarios d'erreur

- **E1 — Pas administrateur** (étape 1) : la vue affiche « Cet espace est
  réservé à l'administration de la plateforme. » (+ invitation à se connecter
  pour un visiteur) et ne charge rien ; l'API répond `401` sans session,
  `403` sans rôle `admin`.
- **E2 — JSON illisible** (étape 3) : « Le document collé n'est pas un JSON
  valide. », aucune requête ; bouton **Importer** inactif tant que la zone est
  vide.
- **E3 — Document invalide au schéma** (étape 4) : `422` « Document
  prompt-package invalide ».
- **E4 — Version existante au contenu différent** (étape 4) : `409`
  (« … versions immuables »).
- **E5 — Identifiant d'un paquet public** (étape 4) : `409` (« … le Golden
  Prompt doit avoir un identifiant distinct »).
- **E6 — Compte non promptologue** (étape 7) : apprenant, établissement… →
  `422` « L'accès au Golden Prompt ne peut être accordé qu'à un compte
  promptologue ».
- **E7 — Cible inconnue** (étape 7) : Golden inconnu (ou paquet public) →
  `404` « Golden Prompt introuvable » ; compte inconnu ou supprimé → `404`
  « Compte introuvable ».
- **E8 — `userId` absent ou non entier** (étape 7) : `422` « Champ requis :
  userId (entier) ».
- **E9 — Jeton CSRF absent** (étapes 3, 6) : `403`.
- **E10 — Corps vide** (étape 3) : `400` « Corps JSON invalide : document
  prompt-package attendu » (une enveloppe dont `document` n'est pas un objet
  est lue comme un document nu, donc `422`).
- **E11 — Liste indisponible** (étape 2) : « Chargement impossible. »

## Règles de gestion

- **RG1** — Un Golden est une ligne `prompt_packages` **privée** : tous les
  chemins de lecture publics de `PromptPackageRepository` filtrent
  `is_private = 0` (liste, document, défaut, publication, proposition,
  diff, source de brouillon) ; la validation du paquet par défaut et le
  lancement d'un run de masse le refusent aussi.
- **RG2** — Le contenu vit **hors Git**, en base seulement ; la liste
  d'administration n'en montre que les métadonnées.
- **RG3** — Versions immuables : idempotence par empreinte de contenu,
  `409` pour un contenu différent sous la même version.
- **RG4** — Autorisation **au cas par cas**, réservée au rôle `promptologue`,
  idempotente ; audit par identifiants (`packageId`, `targetUserId`).
- **RG5** — Cohérence de purge (§6.3) : l'autorisation disparaît avec le
  compte du promptologue ou avec le paquet ; l'administrateur qui l'a
  accordée peut être purgé (`granted_by` mis à `NULL`), l'autorisation datée
  subsiste.
- **RG6** — Routes de session admin (`RequireRole::any('admin')` + CSRF),
  distinctes de l'outillage de déploiement à jeton (`X-Migrate-Token`).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Contenu du Golden | Base de données uniquement (jamais dans le dépôt, jamais renvoyé) |
| Autorisation | `golden_grants (package_id, user_id, granted_by, created_at)` — cascades de purge (RG5) |
| Nom et email du promptologue autorisé | Affichés à l'administrateur dans la liste |
| Journal | `golden_imported {packageId, version}`, `golden_access_granted {packageId, targetUserId}` |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/AdminView.jsx` | Garde de rôle admin, onglets, section `golden` |
| Front | `web/src/views/admin/GoldenSection.jsx` | Formulaire d'import, liste, autorisation, messages |
| Front | `web/src/views/admin/admin-api.js` — `fetchGolden`, `importGolden`, `grantGolden`, `frDate` | Appels API, dates |
| Front | `web/src/api/client.js` — `apiFetch`, `ApiError` | Jeton CSRF, erreurs typées |
| API | `api/src/routes/admin.php` — `POST/GET /admin/golden`, `POST /admin/golden/{id}/grant` | Orchestration, codes HTTP |
| Domaine | `api/src/Admin/GoldenRepository.php` — `import`, `list`, `grant`, `hasAccess` | Import privé, liste, autorisation |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `listPublished`, `findPublished`, `latestPublishedAnyPackage`, `isPublished`, `createDraft` | Invisibilité publique (RG1) |
| Domaine | `api/src/Middleware/RequireRole.php`, `api/src/Auth/Audit.php` | Garde, journal |
| Données | `scripts/migrations/010_admin_golden.sql` | `is_private`, `golden_grants` et cascades |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ADM-02-U01 | `GoldenRepository::import` | Privé + publié, idempotent, audit par identifiants | `api/tests/UseCases/Unit/UcAdm02GererGoldenPromptTest.php` |
| UC-ADM-02-U02 | `GoldenRepository::import` | 422 schéma, 409 immuable, 409 slug public (E3-E5) | idem |
| UC-ADM-02-U03 | `GoldenRepository::list` | Métadonnées seulement, versions ordonnées, autorisations nommées (RG2) | idem |
| UC-ADM-02-U04 | `GoldenRepository::grant`, `hasAccess` | Accordé / inchangé (un audit), 422 non promptologue, 404 Golden/compte inconnu ou supprimé (RG4) | idem |
| UC-ADM-02-U05 | `PromptPackageRepository` (5 lectures publiques) | Golden invisible même pour un promptologue autorisé (RG1) | idem |
| UC-ADM-02-U06 | Cascades `golden_grants` | Purge promptologue / paquet / admin (RG5) | idem |
| UC-ADM-02-U07 | `fetchGolden` | GET, tableau garanti | `web/test/usecases/unit/uc-adm-02-gerer-golden-prompt.test.js` |
| UC-ADM-02-U08 | `importGolden` | POST `{document}` + jeton CSRF | idem |
| UC-ADM-02-U09 | `grantGolden` | URL encodée, `{userId}`, refus → `ApiError` | idem |
| UC-ADM-02-U10 | `frDate` | Format français, replis | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ADM-02-F01 | Nominal | API | Liste vide, 201, liste sans contenu, autorisation, audits | `api/tests/UseCases/Functional/UcAdm02GererGoldenPromptTest.php` |
| UC-ADM-02-F02 | A1 + A2 | API | 200 inchangé ; nouvelle version 201, deux versions | idem |
| UC-ADM-02-F03 | A3 | API | `unchanged`, un seul audit | idem |
| UC-ADM-02-F04 | A4 | API | Document nu accepté (201) | idem |
| UC-ADM-02-F05 | E1 + E9 | API | 401 anonyme, 403 promptologue (3 routes), 403 sans CSRF | idem |
| UC-ADM-02-F06 | E3 + E10 | API | 422 schéma ; 400 corps vide ; enveloppe non objet → 422 | idem |
| UC-ADM-02-F07 | E4 + E5 | API | 409 immuable, 409 slug public | idem |
| UC-ADM-02-F08 | E6 | API | Apprenant et établissement : 422 | idem |
| UC-ADM-02-F09 | E7 + E8 | API | 404 Golden/compte inconnu ; 422 `userId` absent, chaîne, 0 | idem |
| UC-ADM-02-F10 | RG1 (limite) | API | Promptologue AUTORISÉ : liste, document, **diff**, défaut, fork → rien | idem |
| UC-ADM-02-F11 | RG5 | API | Suppression de compte du promptologue → autorisation retirée | idem |
| UC-ADM-02-F12 | Nominal | IHM | `<App/>` : import, message, CSRF, liste, autorisation, date | `web/test/usecases/functional/uc-adm-02-gerer-golden-prompt.test.jsx` |
| UC-ADM-02-F13 | A1 + A2 | IHM | « déjà présent, inchangé » ; versions 1.0.0, 1.1.0 | idem |
| UC-ADM-02-F14 | A3 | IHM | « avait déjà accès » | idem |
| UC-ADM-02-F15 | E1 | IHM | Promptologue / visiteur : espace réservé, aucune lecture | idem |
| UC-ADM-02-F16 | E2 | IHM | JSON illisible : refus local, aucune requête | idem |
| UC-ADM-02-F17 | E3 + E4 | IHM | Messages 422 puis 409 de l'API | idem |
| UC-ADM-02-F18 | E6 + E7 | IHM | Établissement 422, compte inconnu 404 | idem |
| UC-ADM-02-F19 | E11 | IHM | « Chargement impossible. » | idem |

Les tests IHM simulent l'API par un serveur factice à état qui reprend les
statuts et messages de `routes/admin.php` / `GoldenRepository` (dont la logique
est testée par les tests API ci-dessus).

### Tests existants liés (non-régression)

- `api/tests/AdminGoldenTest.php` — garde de rôle, import privé idempotent, invisibilité sur les chemins publics, refus du run de masse par un établissement, slug public, liste et autorisation, audits.
- `api/tests/RgpdAuditTest.php` — `golden_grants` couverte par l'audit RGPD.
- `web/src/views/AdminView.test.jsx` — garde de rôle et navigation de l'administration.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcAdm02 --testdox
cd web && npx vitest run test/usecases/unit/uc-adm-02 test/usecases/functional/uc-adm-02
```

## Limites

- **L'autorisation n'ouvre encore rien.** `GoldenRepository::hasAccess` n'est
  appelé par aucune route : un promptologue autorisé ne peut ni lire, ni
  comparer, ni exécuter le Golden (F10). La « Comparaison au Golden Prompt »
  de `docs/autorisations.md` (P10) et le §3.4 du cahier ne sont pas outillés ;
  la formation promptologue (ch. 5) le dit explicitement.
- **Pas de retrait d'autorisation** : aucune route `DELETE` ; une autorisation
  ne disparaît qu'avec le compte du promptologue ou le paquet (RG5).
- **Pas de mise à disposition publique** : aucune route ne rend un Golden
  public (« publication décidée au cas par cas », §4.10).
- **Établissements** : l'autorisation est réservée aux promptologues (E6) ; un
  établissement ne peut pas lancer de run de masse sur un Golden
  (`AdminGoldenTest`). L'offre payante « haut de gamme » aux utilisateurs passe
  par Twin9 (UC-APP-10, UC-ADM-05, gabarits UC-PRO-08).
- L'autorisation se fait par **identifiant de compte** saisi à la main (pas de
  recherche par nom dans cette section).
