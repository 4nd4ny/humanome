# UC-EMP-01 — Consulter une cartographie partagée

| Champ | Valeur |
|---|---|
| **Acteur principal** | Employeur potentiel (aucun compte requis) |
| **Acteurs secondaires** | Apprenant (auteur du lien, UC-APP-05) ; cartographe (garant éventuel, UC-CAR-05) |
| **Portée** | humanome.xyz — lien public `#/partage/<jeton>` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.6, §4.8, §6.4 (partage = décision individuelle), §8 (garantie humaine) ; CLAUDE.md, principe RGPD 5 (journalisation minimale) |
| **Statut** | Implémenté (P8, garantie P9) — voir « Anomalies constatées » |

## Objectif

Permettre à un employeur qui a reçu d'un apprenant un **lien** et un **mot de
passe** de lire gratuitement, en lecture seule, la cartographie de compétences
partagée — et de savoir si elle a été **garantie** par un cartographe humain.

## Déclencheur

L'employeur ouvre le lien `https://humanome.xyz/#/partage/<jeton>` transmis par
l'apprenant.

## Préconditions

- L'apprenant a stocké la cartographie sur le serveur (opt-in, UC-APP-04) et a
  créé un lien de partage avec un mot de passe d'au moins 8 caractères
  (UC-APP-05).
- Le lien n'est ni révoqué, ni expiré (1 à 365 jours, 90 par défaut), et la
  cartographie n'a pas été supprimée.

## Garanties en cas de succès

- L'employeur voit le titre et la cartographie (vue journée ou vue
  chronologique) en **lecture seule**, sans ouvrir de session.
- Si un cartographe a garanti la cartographie, la mention « Cartographie relue
  et garantie par *X* le *AAAA-MM-JJ* » est affichée et le document servi est
  **exactement** celui qui a été signé (révision figée).
- Un événement d'audit `share_consulted` est enregistré avec des identifiants
  seulement (`cartographieId`, `shareLinkId`) et sans `user_id` : ni jeton, ni
  mot de passe, ni IP, ni contenu.

## Garanties minimales (en cas d'échec)

- Aucune donnée de la cartographie n'est révélée.
- Aucune réponse ne permet de distinguer un lien inconnu d'un lien expiré ou
  révoqué (anti-énumération).

## Scénario nominal

1. L'employeur ouvre le lien ; le site affiche le bandeau « Cartographie
   partagée par son auteur » et un formulaire de mot de passe. `ShareView`
   n'appelle pas l'API de partage à l'ouverture ; seul le shell sonde la
   session (`GET /api/auth/me`, `401` pour un navigateur sans session —
   `200 {user, csrfToken}` pour un navigateur connecté, cf. A3).
2. L'employeur saisit le mot de passe reçu et valide.
3. Le navigateur envoie `POST /api/share/{jeton}` avec `{password}` (sans
   en-tête `X-CSRF-Token` hors session).
4. Le serveur compte la tentative pour l'IP (fenêtre fixe d'une heure) avant
   toute autre vérification (RG3), valide le corps, retrouve le lien par
   l'empreinte sha256 du jeton, vérifie qu'il est consultable puis vérifie le
   mot de passe (Argon2id).
5. Le serveur journalise `share_consulted` (identifiants seulement) et renvoie
   `{titre, type, document, garantie}`, avec `type` ∈ {`jour`, `merge`,
   `twin9`}.
6. Le site remplace le formulaire par le titre et la mention de garantie
   éventuelle, puis charge le référentiel (référentiel publié
   `data/referentiel/…`, repli sur la copie embarquée — seul autre appel
   réseau) et rend la cartographie : `MergeView` si `type = merge`, `DayView`
   dans tous les autres cas. Le type `twin9` n'est pas traité (voir AN1).

## Scénarios alternatifs

- **A1 — Cartographie garantie** (étape 5) : une garantie est posée. Le serveur
  renvoie `garantie = {par, date, revisionId}` ; si elle fige une révision,
  c'est le document de **cette révision** qui est servi, pas le document de
  base. Le site affiche la mention de garantie (« son cartographe » si le nom
  manque, date tronquée à `AAAA-MM-JJ`).
- **A2 — Garantie retirée après l'envoi du lien** (étape 5) : le cartographe a
  retiré sa garantie. Le même lien sert de nouveau le document de base, sans
  mention.
- **A3 — Navigateur déjà connecté** (étapes 1 et 3) : l'employeur a par
  ailleurs une session humanome, son navigateur porte donc un cookie de
  session. Le middleware CSRF global (`CsrfMiddleware`, qui n'exempte pas
  `/api/share`) exige alors l'en-tête `X-CSRF-Token` : le front le tient de
  `GET /api/auth/me` au démarrage du shell et le réémet. Sans cet en-tête :
  `403 {error: "Jeton CSRF absent ou invalide"}`, ni audit ni essai compté. La
  route elle-même n'utilise pas la session : audit sans `user_id`, même corps
  qu'un anonyme. Un cookie périmé fait échouer la consultation (voir AN2).

## Scénarios d'erreur

- **E0 — Mot de passe trop court** (étape 2) : moins de 8 caractères ; le site
  refuse localement, sans requête.
- **E1 — Mauvais mot de passe** (étape 4) : `403` ; le site affiche « Mot de
  passe incorrect. » et laisse réessayer.
- **E2 — Mot de passe absent, vide, non textuel ou de plus de 1024 octets**
  (étape 4) : `422 {error: "Mot de passe requis"}`, avant toute recherche du
  jeton (un jeton inconnu répond donc aussi `422`) ; la requête a déjà été
  comptée dans le quota (RG3). Le site affiche le message du serveur.
- **E3 — Lien inconnu, malformé, révoqué, expiré ou cartographie supprimée**
  (étape 4) : **même** `404`, au corps identique, précédé d'une vérification
  factice du mot de passe (`Users::dummyHash`, Argon2id aux mêmes paramètres
  qu'un lien : le temps de réponse ne trahit pas le cas) ; le site affiche un
  message neutre unique.
- **E4 — Trop de tentatives** (étape 4) : au-delà de 20 essais par heure et par
  IP (IPv6 regroupées par /64), `429` avec `Retry-After` (30 s, doublé à
  chaque essai, plafonné à une heure) — même avec le bon mot de passe.
- **E5 — Erreur technique** (étapes 4-5) : base non configurée →
  `503 {error: "Service indisponible"}` ; exception PDO →
  `500 {error: "Erreur interne"}` (message technique journalisé côté serveur
  uniquement). Le site affiche le message du serveur. Seul le `503` est
  rejoué par les tests (le `500` exigerait de provoquer une panne de base).

## Règles de gestion

- **RG1** — Le jeton clair (32 caractères hexadécimaux) n'existe que dans la
  réponse de création ; la base ne stocke que `sha256(jeton)`.
- **RG2** — Le mot de passe est stocké en `password_hash` Argon2id, jamais en
  clair.
- **RG3** — Le quota de tentatives est compté **avant** toute recherche et
  toute validation du corps : la force brute sur le mot de passe,
  l'énumération des jetons et les requêtes invalides consomment le même
  budget.
- **RG4** — Ce qui est présenté comme garanti est exactement ce qui a été
  signé (§8).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Jeton de partage | Empreinte sha256 en base uniquement |
| Mot de passe du lien | Argon2id |
| IP de l'employeur | Pseudonymisée, pas stockée en clair : seau `share:` + sha256 **non salé** de l'IPv4 complète ou du préfixe IPv6 /64 (table `rate_limits`, avec l'heure de la fenêtre), conservé jusqu'au prochain essai du même seau — pas de purge planifiée (voir AN3) |
| Consultation | Audit `share_consulted` : `{cartographieId, shareLinkId}`, `user_id` NULL |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route publique `#/partage/<jeton>` |
| Front | `web/src/App.jsx` — shell | Sonde de session `fetchMe` au montage (`GET api/auth/me`, jeton CSRF), route `share` → `ShareView` |
| Front | `web/src/views/ShareView.jsx` | Formulaire, contrôle local de longueur, messages d'erreur (`shareErrorMessage`), rendu lecture seule, mention de garantie (`GarantieNotice`) |
| Front | `web/src/api/client.js` — `apiFetch`, `ApiError`, `fetchMe` | Appel HTTP, erreurs typées, jeton CSRF gardé en mémoire et réémis |
| Front | `web/src/data/referentiel.js` — `loadPublishedReferentiel` | Référentiel publié, repli sur la copie embarquée |
| Front | `web/src/views/DayView.jsx`, `web/src/views/MergeView.jsx` | Rendu de la cartographie |
| API | `api/src/Middleware/CsrfMiddleware.php` | CSRF global : `X-CSRF-Token` exigé dès qu'un cookie de session est présent (A3, AN2) |
| API | `POST /api/share/{token}` — `api/src/routes/share.php` | Orchestration du cas |
| Domaine | `api/src/Share/ShareLinks.php` — `findByToken`, `isConsultable` | Lien, état consultable |
| Domaine | `api/src/Cartographe/Garanties.php` — `forShareLink` | Garantie et révision signée |
| Domaine | `api/src/Auth/RateLimiter.php`, `api/src/ClientIp.php` | Quota par IP |
| Domaine | `api/src/Auth/Users.php` — `dummyHash` | Vérification factice anti-chronométrage |
| Domaine | `api/src/Auth/Audit.php` | Journal `share_consulted` |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-EMP-01-U01 | `ShareLinks::create`, `findByToken` | Recherche par sha256 du jeton clair ; mot de passe vérifié et algorithme Argon2id (RG1, RG2) | `api/tests/UseCases/Unit/UcEmp01ConsulterPartageTest.php` |
| UC-EMP-01-U02 | `ShareLinks::findByToken` | Jeton inconnu ou empreinte stockée → rien | idem |
| UC-EMP-01-U03 | `ShareLinks::isConsultable` | Vivant / révoqué / expiré (E3 : révoqué, expiré) | idem |
| UC-EMP-01-U04 | `Garanties::forShareLink` | Pas de garantie → `null` | idem |
| UC-EMP-01-U05 | `Garanties::forShareLink` | Garantie figée sur révision → document de la révision (RG4) | idem |
| UC-EMP-01-U06 | `Garanties::forShareLink` | Garantie sur la base → pas de document de révision | idem |
| UC-EMP-01-U07 | `RateLimiter` | 20 essais, 21ᵉ bloqué, délai 30 s → 60 s → plafond | idem |
| UC-EMP-01-U08 | `ClientIp::bucketIdentity` | IPv6 /64, IPv4 mappée | idem |
| UC-EMP-01-U09 | `Users::dummyHash` | Argon2id aux mêmes paramètres qu'un hash de lien ; ne vérifie rien | idem |
| UC-EMP-01-U10 | `parseHash` | `#/partage/<jeton>` → route `share` | `web/test/usecases/unit/uc-emp-01-consulter-cartographie-partagee.test.js` |
| UC-EMP-01-U11 | `parseHash` | Jeton trop court / invalide → `not-found` | idem |
| UC-EMP-01-U12 | `apiFetch` | POST JSON sans jeton CSRF hors session | idem |
| UC-EMP-01-U13 | `apiFetch`, `ApiError` | 403/404/422/429 → erreur typée avec statut et message | idem |
| UC-EMP-01-U14 | `ShareView`, `SHARE_PASSWORD_MIN_LENGTH` | Minimum 8, aligné sur l'API : 7 caractères refusés sans requête, 8 envoyés | idem |
| UC-EMP-01-U15 | `Audit::record` | `share_consulted` sans compte : `user_id` NULL, identifiants seulement | `api/tests/UseCases/Unit/UcEmp01ConsulterPartageTest.php` |
| UC-EMP-01-U16 | `ShareView` — `GarantieNotice` | Garant sans nom → « son cartographe », date tronquée à `AAAA-MM-JJ`, sans date ni garantie | `web/test/usecases/unit/uc-emp-01-consulter-cartographie-partagee.test.js` |
| UC-EMP-01-U17 | `ShareView` — `shareErrorMessage` | 403/404/429 → messages fixes, 422 → message serveur, 403 CSRF → « Mot de passe incorrect. » (AN2) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-EMP-01-F01 | Nominal | API | 200 `{titre, type, document, garantie: null}`, aucune session ouverte | `api/tests/UseCases/Functional/UcEmp01ConsulterPartageTest.php` |
| UC-EMP-01-F02 | Nominal (post-condition) | API | Audit `share_consulted` sans compte, sans jeton, mot de passe ni IP | idem |
| UC-EMP-01-F03 | A1 | API | Garant nommé, document de la révision signée | idem |
| UC-EMP-01-F04 | A2 | API | Garantie figée sur une révision : révision servie, puis base servie et `garantie` null après le retrait | idem |
| UC-EMP-01-F05 | E1 | API | 403, aucune donnée, pas d'audit | idem |
| UC-EMP-01-F06 | E2 | API | 422 : mot de passe absent, vide, non textuel, > 1024 octets ; même sur un jeton inconnu | idem |
| UC-EMP-01-F07 | E3 | API | Inconnu, malformé, révoqué, expiré, supprimé → corps 404 identiques | idem |
| UC-EMP-01-F08 | E4 | API | 21ᵉ essai → 429, `Retry-After` 30 puis 60 ; autre IP non pénalisée | idem |
| UC-EMP-01-F09 | A3 | API | Session d'un autre compte + `X-CSRF-Token` : même corps qu'un anonyme, audit sans `user_id` | idem |
| UC-EMP-01-F10 | Nominal | IHM | `<App/>` sur `#/partage/…` : seul `GET api/auth/me` à l'ouverture, formulaire, puis journée rendue (`DayView`) | `web/test/usecases/functional/uc-emp-01-consulter-cartographie-partagee.test.jsx` |
| UC-EMP-01-F11 | A1 | IHM | Fusion garantie : mention « garantie par Camille » + `MergeView` rendue | idem |
| UC-EMP-01-F12 | E0 | IHM | Mot de passe court refusé sans requête | idem |
| UC-EMP-01-F13 | E1 | IHM | Message puis nouvel essai réussi | idem |
| UC-EMP-01-F14 | E3 | IHM | Message neutre unique | idem |
| UC-EMP-01-F15 | E4 | IHM | Invitation à patienter | idem |
| UC-EMP-01-F16 | Étape 6 (AN1) | IHM | Twin9 partagé : `TypeError` au rendu, non interceptée par l'application (comportement actuel) | idem |
| UC-EMP-01-F17 | RG3 | API | 20 jetons inconnus (404) ou 20 requêtes 422 → le bon lien répond 429 | `api/tests/UseCases/Functional/UcEmp01ConsulterPartageTest.php` |
| UC-EMP-01-F18 | E3 | API | 404 précédé de la vérification factice (`Users::dummyHash` calculé) ; 403 et 200 ne la font pas | idem |
| UC-EMP-01-F19 | E4 | API | IPv6 : même /64 = même quota, autre /64 libre ; seau `share:` + sha256 sans IP en clair ; IPv4 non salée (AN3) | idem |
| UC-EMP-01-F20 | Étape 5 (AN1) | API | Twin9 servi tel quel : `type = twin9`, document sans `poles` | idem |
| UC-EMP-01-F21 | A3 | API | Cookie de session sans `X-CSRF-Token` → 403 CSRF, ni audit ni essai compté | idem |
| UC-EMP-01-F22 | A3 (AN2) | API | Cookie périmé : `auth/me` 401 sans jeton, puis 403 CSRF malgré le bon mot de passe | idem |
| UC-EMP-01-F23 | A3 | IHM | Jeton CSRF obtenu par `GET api/auth/me` au montage et renvoyé dans le POST | `web/test/usecases/functional/uc-emp-01-consulter-cartographie-partagee.test.jsx` |
| UC-EMP-01-F24 | A3 (AN2) | IHM | 403 CSRF affiché « Mot de passe incorrect. » (comportement actuel) | idem |
| UC-EMP-01-F25 | E5 | API | Base non configurée → 503 « Service indisponible », pas d'audit ; lien de nouveau consultable ensuite | `api/tests/UseCases/Functional/UcEmp01ConsulterPartageTest.php` |

### Tests existants liés (non-régression)

- `api/tests/ShareTest.php` — création, hachage, expiration, révocation, quota, audit.
- `api/tests/CartographeGarantieTest.php` — partage public d'une cartographie garantie.
- `web/src/views/ShareView.test.jsx` — composant isolé.
- `web/e2e/parcours-apprenant.e2e.js` — étapes 8, 9 et 12 du parcours (« Partage : lien + mot de passe, expiration par défaut (90 jours) », « Lien ouvert dans un contexte neuf : mauvais mot de passe refusé, bon mot de passe -> document », « Après la purge, le lien de partage répond 404 ») — navigateur réel.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcEmp01
cd web && npx vitest run test/usecases --testNamePattern UC-EMP-01
```

## Anomalies constatées

- **AN1 — Une analyse Twin9 partagée fait planter la page de l'employeur.**
  Le type `twin9` est admis au stockage (`POST /api/cartographies`, migration
  021) et le bouton « Partager » est proposé pour toute copie serveur ; la
  route publique renvoie le type tel quel (UC-EMP-01-F20). `ShareView` ne
  distingue que `merge` et passe tout autre type à `DayView` : le
  `carto_evolutive` natif (pas de tableau `poles`) fait lever une `TypeError`
  à `buildDayTree` pendant le rendu. Aucun composant de l'application
  n'intercepte l'erreur (pas d'`ErrorBoundary` dans `web/src`) : React démonte
  tout l'arbre, l'employeur voit une page blanche. `CartographyViewer` traite
  pourtant déjà ce type (`twin9ToMergeDocument` → `MergeView`). Figé par
  UC-EMP-01-F16 (IHM) et F20 (API).
- **AN2 — Cookie de session périmé : « Mot de passe incorrect. » avec le bon
  mot de passe.** Un navigateur qui garde un cookie `humanome_sid` que le
  serveur ne connaît plus (session supprimée par le GC, cookie de session sans
  expiration) reçoit `401` sans `csrfToken` de `GET /api/auth/me` ; le POST de
  partage part avec le cookie mais sans `X-CSRF-Token` et le middleware CSRF
  répond `403 « Jeton CSRF absent ou invalide »`. `ShareView` traduit tout
  `403` en « Mot de passe incorrect. » : l'employeur est induit en erreur et
  bloqué tant qu'il n'a pas effacé ses cookies. Figé par UC-EMP-01-F22 (API),
  F24 (IHM) et U17.
- **AN3 — Seau de limitation pseudonyme conservé sans purge planifiée.** Le
  seau `share:` + sha256 de l'identité IP n'est pas salé : pour une IPv4
  (adresse complète), il se renverse en énumérant 2³² valeurs. Les lignes
  `rate_limits` ne sont purgées que lors d'un nouvel essai du même seau (aucune
  purge globale dans `api/src` ni `scripts/maintenance.php`) : l'IP
  pseudonymisée et l'heure de la fenêtre restent conservées indéfiniment et
  peuvent être rapprochées du `created_at` de `share_consulted`. Formule du
  seau figée par UC-EMP-01-F19.
