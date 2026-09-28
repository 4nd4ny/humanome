# UC-ADM-01 — Gérer les comptes et les rôles

| Champ | Valeur |
|---|---|
| **Acteur principal** | Administrateur (compte portant le rôle `admin`, session ouverte) |
| **Acteurs secondaires** | Compte cible (tout inscrit, dont les droits changent) ; outil de déploiement (amorçage du premier admin, UC-SYS-02) |
| **Portée** | humanome.xyz — espace `#/admin/roles`, API de session `/api/admin/users*` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §2 (glossaire des rôles), §3.8 et §4.10 (administration), §6.5 (journalisation minimale) ; `docs/administration.md` §1, `docs/autorisations.md` (règle 4) |
| **Statut** | Implémenté (P12.1, jalon M9) |

## Objectif

Permettre à l'administrateur de retrouver un compte et de lui **attribuer** ou
**retirer** l'un des sept rôles du référentiel §2 (`apprenant`, `cartographe`,
`promptologue`, `epistemiarque`, `employeur`, `etablissement`, `admin`), avec
effet immédiat, sans jamais pouvoir se retirer à lui-même l'accès à
l'administration.

## Déclencheur

L'administrateur ouvre `#/admin/roles` (menu « Administrer » → « Rôles et
comptes », ou carte « Rôles » de l'accueil `#/admin`).

## Préconditions

- Un premier compte `admin` existe : il a été amorcé hors navigateur par
  `POST /api/admin/grant-role` (jeton `X-Migrate-Token`, UC-SYS-02), car aucun
  compte n'est administrateur par défaut.
- L'administrateur est connecté (cookie de session + jeton CSRF en mémoire).
- L'API et la base sont joignables (le site n'est pas une copie statique).

## Garanties en cas de succès

- Le rôle est ajouté à (ou retiré de) `user_roles` ; les rôles sont
  **cumulables** et **relus en base à chaque requête** (`RequireRole`,
  `Users::rolesOf`) : le compte cible gagne ou perd l'accès dès sa requête
  suivante, sans reconnexion.
- Un événement d'audit `role_granted` / `role_revoked` est écrit avec
  l'**administrateur de la session comme acteur** et seulement
  `{targetUserId, role, status}` — jamais l'e-mail ni le nom.

## Garanties minimales (en cas d'échec)

- Aucun rôle n'est modifié, aucun audit n'est écrit.
- L'administrateur agissant conserve toujours son propre rôle `admin`
  (anti-verrouillage) : la plateforme garde au moins un administrateur.

## Scénario nominal

1. L'administrateur ouvre `#/admin/roles`. `AdminView` vérifie la session
   (`GET /api/auth/me`) : le rôle `admin` est présent, la section « Comptes et
   rôles » (`RolesSection`) est rendue avec les onglets d'administration.
2. `RolesSection` charge la première page : `GET /api/admin/users`. Le garde
   `RequireRole::any('admin')` relit les rôles du compte en base, puis
   `UserDirectory::list` renvoie `200 {users, total, page, pageSize: 20}` :
   comptes non supprimés, triés par identifiant, chacun avec
   `{id, email, displayName, createdAt (ISO « T »), roles (ordre alphabétique)}`.
3. L'IHM affiche le compteur (« 3 comptes. ») et un tableau : compte, puces des
   rôles, menu d'attribution (seulement les rôles manquants), date de création.
4. L'administrateur saisit un fragment dans « Rechercher un compte (e-mail ou
   nom) » et valide : `GET /api/admin/users?query=…` (recherche `LIKE` sur
   l'e-mail **ou** le nom, insensible à la casse, jokers `%` et `_` échappés ;
   retour en page 1). Le compteur devient « 1 compte pour « maya ». ».
5. Il choisit un rôle dans « Rôle à attribuer à <e-mail> » et clique
   « Attribuer » : `POST /api/admin/users/{id}/roles {role}` avec l'en-tête
   `X-CSRF-Token`. `UserDirectory::grant` vérifie le rôle, puis le compte, et
   insère (`INSERT IGNORE`) : `200 {id, role, status: "granted"}` ; audit
   `role_granted`.
6. L'IHM affiche « Rôle « cartographe » attribué. » et recharge la liste : la
   nouvelle puce apparaît.
7. Pour retirer un rôle, il clique sur la croix « Retirer le rôle <rôle> de
   <e-mail> » : `DELETE /api/admin/users/{id}/roles/{role}` (+ CSRF) →
   `200 {id, role, status: "revoked"}` ; audit `role_revoked` ; message « Rôle
   « <rôle> » retiré. » et rechargement.
8. Le compte cible voit l'effet à sa requête suivante (ex. `403` → `200` sur
   `/api/cartographe/cartographies` après l'attribution de `cartographe`).

## Scénarios alternatifs

- **A1 — Opération sans effet** (étapes 5 et 7) : ré-attribuer un rôle déjà
  porté ou retirer un rôle absent répond `200` avec `status: "unchanged"` ;
  aucun audit n'est écrit.
- **A2 — Filtre par rôle** (étape 2) : `GET /api/admin/users?role=<rôle>`
  (combinable avec `query`) ne renvoie que les comptes portant ce rôle (avec
  tous leurs rôles) ; un rôle inconnu donne une liste vide, sans erreur. Ce
  filtre est utilisé par le bloc « Comptes par rôle » du monitoring
  (UC-ADM-06) ; `RolesSection` ne l'expose pas.
- **A3 — Plus de 20 comptes** (étape 3) : pagination « Page 1 / N » avec
  « Précédent » / « Suivant » (`?page=2`…) ; une page ≤ 0 est ramenée à 1, une
  page au-delà de la dernière est vide (le `total` reste exact).
- **A4 — Retrait du rôle admin d'un autre administrateur, ou d'un rôle non-admin
  à soi-même** (étape 7) : autorisé ; l'autre administrateur perd l'espace
  d'administration dès sa requête suivante (`403`).
- **A5 — L'administrateur s'attribue un rôle métier** (étape 5) : `admin`
  n'étant pas un super-rôle, un administrateur reçoit `403` sur les espaces des
  autres rôles (ex. `/api/etablissement/cohortes`) tant qu'il ne s'est pas
  attribué le rôle correspondant ; les rôles se cumulent.

## Scénarios d'erreur

- **E1 — Visiteur sans session** (étape 1) : l'API répond `401
  « Authentification requise »` ; l'IHM remplace l'espace par « Cet espace est
  réservé à l'administration de la plateforme. » et un lien « Connectez-vous »
  (`#/compte`) ; aucune liste n'est demandée.
- **E2 — Compte sans rôle admin** (étape 1) : `403 « Rôle insuffisant »` sur
  les trois routes, quels que soient ses autres rôles ; l'IHM affiche le même
  espace réservé (avec « Connecté en tant que … »).
- **E3 — Rôle invalide** (étapes 5 et 7) : rôle inconnu, `visiteur` (absence de
  session, jamais attribuable), champ absent, vide ou non-chaîne → `422` ; en
  retrait, un segment d'URL hors motif `[a-z]+` (ex. `Admin`) donne le `404` du
  routeur.
- **E4 — Compte inconnu ou supprimé** (étapes 5 et 7) : `404 « Compte
  introuvable »` ; l'IHM affiche ce message en alerte.
- **E5 — Anti-verrouillage** (étape 7) : retirer **son propre** rôle `admin` →
  `409` « Un administrateur ne peut pas retirer son propre rôle admin
  (anti-verrouillage) » ; l'IHM ne propose d'ailleurs pas la croix : un
  cadenas 🔒 (infobulle « Anti-verrouillage : … ») la remplace.
- **E6 — Jeton CSRF absent ou invalide** (étapes 5 et 7) : `403 « Jeton CSRF
  absent ou invalide »` (middleware global), aucune mutation ; l'IHM affiche le
  message.
- **E7 — API injoignable** (étape 1) : sur une copie statique, l'IHM affiche
  « Copie statique du site : l'administration a besoin de l'API … ».

## Règles de gestion

- **RG1** — Seuls les sept rôles présents dans la table `roles` (semés par la
  migration 001) sont attribuables ; le rôle est vérifié **avant** le compte
  (un rôle invalide répond `422` même pour un compte inexistant).
- **RG2** — Les rôles sont relus à chaque requête : aucune session n'a besoin
  d'être rouverte pour qu'un changement de rôle s'applique.
- **RG3** — `admin` n'est pas un super-rôle : les routes `/api/admin/*` de
  session sont sa seule surface ; ailleurs, chaque garde liste ses rôles.
- **RG4** — Anti-verrouillage : `revoke(adminId, adminId, 'admin')` est refusé
  (`409`) ; tout autre retrait est permis.
- **RG5** — Attribution et retrait sont idempotents ; seul un changement effectif
  est audité.
- **RG6** — Les comptes supprimés (`deleted_at` non nul) sont invisibles de la
  liste et se comportent comme inconnus.
- **RG7** — Mutations protégées par le CSRF global (double soumission
  `X-CSRF-Token`).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| E-mail et nom des comptes | Affichés à l'administrateur seulement (liste) ; jamais journalisés |
| Rôles | Table `user_roles` (CASCADE à la purge du compte) |
| Trace d'attribution | `audit_events` : acteur = admin, `{targetUserId, role, status}` |
| Recherche | Terme utilisé dans une requête préparée, jamais stocké |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/admin[/<section>]` |
| Front | `web/src/nav.js` — `navGroups` | Famille « Administrer » visible avec le rôle `admin` |
| Front | `web/src/views/AdminView.jsx` | Garde de session (`fetchMe`), espace réservé, onglets, dispatch |
| Front | `web/src/views/admin/RolesSection.jsx` | Recherche, tableau, attribution, retrait, cadenas, pagination, messages |
| Front | `web/src/views/admin/admin-api.js` — `listUsers`, `grantRole`, `revokeRole`, `ASSIGNABLE_ROLES`, `frDate` | Appels HTTP, rôles attribuables |
| Front | `web/src/api/client.js` — `apiFetch`, `fetchMe` | Jeton CSRF en mémoire, erreurs typées, copie statique |
| API | `api/src/routes/admin.php` — `GET /admin/users`, `POST /admin/users/{id}/roles`, `DELETE /admin/users/{id}/roles/{role}` | Orchestration, `422` champ requis, mapping `AdminException` |
| Domaine | `api/src/Admin/UserDirectory.php` — `list`, `grant`, `revoke` | Liste, recherche, filtre, pagination, anti-verrouillage, audit |
| Domaine | `api/src/Middleware/RequireRole.php`, `api/src/Auth/Users.php` — `rolesOf` | Garde `401/403`, rôles relus en base |
| Domaine | `api/src/Middleware/CsrfMiddleware.php`, `api/src/Auth/Audit.php` | CSRF, journal `role_granted`/`role_revoked` |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ADM-01-U01 | `UserDirectory::list` | Supprimés exclus, tri par id, rôles alphabétiques, forme et date ISO | `api/tests/UseCases/Unit/UcAdm01GererComptesRolesTest.php` |
| UC-ADM-01-U02 | `UserDirectory::list` | Recherche e-mail/nom insensible à la casse, `%` et `_` littéraux | idem |
| UC-ADM-01-U03 | `UserDirectory::list` | Filtre par rôle, combiné à la recherche, rôle inconnu → vide | idem |
| UC-ADM-01-U04 | `UserDirectory::list` | 20 par page, page ≤ 0 → 1, page au-delà → vide | idem |
| UC-ADM-01-U05 | `UserDirectory::grant` | `granted` puis `unchanged`, audit unique sans e-mail (RG5) | idem |
| UC-ADM-01-U06 | `UserDirectory::grant` | `422` rôle (avant le compte, RG1), `404` compte inconnu/supprimé | idem |
| UC-ADM-01-U07 | `UserDirectory::revoke` | `revoked` puis `unchanged`, audit unique | idem |
| UC-ADM-01-U08 | `UserDirectory::revoke` | Anti-verrouillage `409` ; autre admin et rôle non-admin permis (RG4) | idem |
| UC-ADM-01-U09 | `Users::rolesOf` | Changements visibles immédiatement, rôles cumulables (RG2) | idem |
| UC-ADM-01-U10 | `RequireRole::process` | `401` sans session, passe avec `userId`/`roles`, `403` dès le retrait en base | idem |
| UC-ADM-01-U11 | `RequireRole::any` | Au moins un rôle exigé | idem |
| UC-ADM-01-U12 | `UserDirectory` (AN-1) | Comportement actuel : rôle résolu sans la casse, `revoke('ADMIN')` contourne l'anti-verrouillage de la classe | idem |
| UC-ADM-01-U13 | `parseHash` | `#/admin/roles` → `{admin, roles}`, `#/admin` → section nulle | `web/test/usecases/unit/uc-adm-01-gerer-comptes-roles.test.jsx` |
| UC-ADM-01-U14 | `navGroups` | Famille « Administrer » seulement avec `admin` | idem |
| UC-ADM-01-U15 | `listUsers` | Paramètres `query`/`page`/`role`, réponse normalisée | idem |
| UC-ADM-01-U16 | `grantRole` | `POST {role}` + `X-CSRF-Token` | idem |
| UC-ADM-01-U17 | `revokeRole` | `DELETE` encodé + CSRF ; `409` → `ApiError` avec message serveur | idem |
| UC-ADM-01-U18 | `ASSIGNABLE_ROLES`, `frDate` | 7 rôles §2 sans visiteur ; dates tolérantes | idem |
| UC-ADM-01-U19 | `RolesSection` | Pagination « Page 1 / 3 », Suivant → `page=2` | idem |
| UC-ADM-01-U20 | `RolesSection` | Menu = rôles manquants, bouton inactif sans choix, « aucun » | idem |
| UC-ADM-01-U21 | `apiFetch` | Copie statique (`file:`) → `ApiUnavailableError` sans réseau | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ADM-01-F01 | Nominal (1-6, 8) | API | Liste, recherche, attribution `granted`, accès de la cible immédiat, audit | `api/tests/UseCases/Functional/UcAdm01GererComptesRolesTest.php` |
| UC-ADM-01-F02 | Nominal (7-8) | API | Retrait `revoked`, perte d'accès immédiate, autres rôles conservés, audit | idem |
| UC-ADM-01-F03 | A1 | API | `unchanged` sans audit | idem |
| UC-ADM-01-F04 | A2, A3 | API | Filtre `role=` (+ recherche, rôle inconnu), pages 1 et 2 disjointes | idem |
| UC-ADM-01-F05 | A4 | API | Retrait de l'admin d'un autre (effet immédiat) et d'un rôle non-admin à soi | idem |
| UC-ADM-01-F06 | A5 | API | `403` sur l'espace établissement, puis `200` après auto-attribution | idem |
| UC-ADM-01-F07 | E1, E2 | API | `401` visiteur, `403` compte à six rôles sans admin, aucune mutation | idem |
| UC-ADM-01-F08 | E3 | API | `422` (inconnu, visiteur, vide, non-chaîne, absent), `404` routeur | idem |
| UC-ADM-01-F09 | E4 | API | `404 « Compte introuvable »` inconnu/supprimé | idem |
| UC-ADM-01-F10 | E5 | API | `409` anti-verrouillage, rôle conservé, pas d'audit | idem |
| UC-ADM-01-F11 | E6 | API | `403` CSRF absent/faux, aucune mutation | idem |
| UC-ADM-01-F12 | AN-1 | API | Comportement actuel : `CARTOGRAPHE` accepté, écho et audit non normalisés | idem |
| UC-ADM-01-F13 | Nominal (1-6) | IHM | `<App/>` : liste, recherche, attribution avec CSRF, message, puce ajoutée | `web/test/usecases/functional/uc-adm-01-gerer-comptes-roles.test.jsx` |
| UC-ADM-01-F14 | Nominal (7) | IHM | Croix → `DELETE`, message, puce retirée | idem |
| UC-ADM-01-F15 | E5, A4 | IHM | Cadenas sur son rôle admin ; croix sur ses autres rôles et l'admin d'autrui | idem |
| UC-ADM-01-F16 | E4 | IHM | Compte purgé entre-temps → alerte « Compte introuvable » | idem |
| UC-ADM-01-F17 | A3 | IHM | 23 comptes : « Page 1 / 2 », Suivant → page 2 | idem |
| UC-ADM-01-F18 | E1 | IHM | Visiteur : espace réservé + « Connectez-vous », aucune liste | idem |
| UC-ADM-01-F19 | E2 | IHM | Compte sans admin : espace réservé, section non rendue | idem |
| UC-ADM-01-F20 | E6 | IHM | CSRF refusé → alerte, liste inchangée | idem |
| UC-ADM-01-F21 | E7 | IHM | Réseau indisponible → message « Copie statique du site » | idem |

### Tests existants liés (non-régression)

- `api/tests/AdminUsersTest.php` — garde, recherche, attribution/retrait, anti-verrouillage, audit.
- `api/tests/AdminMonitoringTest.php` — `testUsersListCanBeFilteredByRole` (filtre `role=`).
- `api/tests/AuthRequireRoleTest.php` — garde `RequireRole` (session purgée, attributs).
- `api/tests/AdminRolesTest.php` — amorçage par jeton `POST /api/admin/grant-role` (voir UC-SYS-02).
- `web/src/views/admin/RolesSection.test.jsx`, `web/src/views/AdminView.test.jsx`, `web/src/nav.test.js`.
- `web/e2e/parcours-cartographe.e2e.js`, `web/e2e/parcours-promptologue.e2e.js` — attribution de rôle par l'outillage à jeton.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcAdm01 --testdox
cd web && npx vitest run test/usecases/unit/uc-adm-01 test/usecases/functional/uc-adm-01
```

## Anomalies constatées

- **AN-1 — Nom de rôle comparé sans la casse, anti-verrouillage comparé à la
  lettre.** `UserDirectory::roleId` cherche `roles.name = ?` sous la collation
  `utf8mb4_unicode_ci` : `ADMIN`, `Cartographe`… sont acceptés et résolus vers
  le bon rôle, mais la réponse et l'audit gardent la graphie reçue (non
  normalisée). Surtout, la règle d'anti-verrouillage de `revoke` teste
  `$role === 'admin'` : appelée directement, la classe laisse un administrateur
  retirer son propre rôle avec `ADMIN`. **Par HTTP, la faille est fermée** par
  le motif de route `{role:[a-z]+}` du `DELETE` (`404`). Correctif suggéré :
  normaliser le rôle (`strtolower(trim())`) dans `grant`/`revoke`, ou comparer
  l'identifiant de rôle. Figé par UC-ADM-01-U12 et UC-ADM-01-F12.

## Limites

- Le garde `RequireRole` s'exécute avant l'enveloppe de la route : sans base
  configurée, ces routes répondent `401` (et non le `503 « Service
  indisponible »` prévu par l'enveloppe, inatteignable ici).
- L'IHM ne propose ni le filtre par rôle (disponible au monitoring) ni la
  création/suppression de comptes (l'inscription et la suppression relèvent de
  UC-CPT-01 et UC-CPT-06).
