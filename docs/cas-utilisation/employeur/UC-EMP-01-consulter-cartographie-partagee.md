# UC-EMP-01 — Consulter une cartographie partagée

| Champ | Valeur |
|---|---|
| **Acteur principal** | Employeur potentiel (aucun compte requis) |
| **Acteurs secondaires** | Apprenant (auteur du lien, UC-APP-05) ; cartographe (garant éventuel, UC-CAR-05) |
| **Portée** | humanome.xyz — lien public `#/partage/<jeton>` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.6, §4.8, §6.4 (partage = décision individuelle), §6.5 (journalisation minimale), §8 (garantie humaine) |
| **Statut** | Implémenté (P8, garantie P9) |

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
  seulement (`cartographieId`, `shareLinkId`) : ni jeton, ni mot de passe, ni
  IP, ni contenu.

## Garanties minimales (en cas d'échec)

- Aucune donnée de la cartographie n'est révélée.
- Aucune réponse ne permet de distinguer un lien inconnu d'un lien expiré ou
  révoqué (anti-énumération).

## Scénario nominal

1. L'employeur ouvre le lien ; le site affiche le bandeau « Cartographie
   partagée par son auteur » et un formulaire de mot de passe. Aucun appel
   réseau n'est fait à l'ouverture.
2. L'employeur saisit le mot de passe reçu et valide.
3. Le navigateur envoie `POST /api/share/{jeton}` avec `{password}`.
4. Le serveur compte la tentative pour l'IP (fenêtre d'une heure), retrouve le
   lien par l'empreinte sha256 du jeton, vérifie qu'il est consultable puis
   vérifie le mot de passe (Argon2id).
5. Le serveur journalise `share_consulted` (identifiants seulement) et renvoie
   `{titre, type, document, garantie}`.
6. Le site remplace le formulaire par le titre et la cartographie : `DayView`
   pour une journée, `MergeView` pour une fusion chronologique.

## Scénarios alternatifs

- **A1 — Cartographie garantie** (étape 5) : une garantie est posée. Le serveur
  renvoie `garantie = {par, date, revisionId}` ; si elle fige une révision,
  c'est le document de **cette révision** qui est servi, pas le document de
  base. Le site affiche la mention de garantie.
- **A2 — Garantie retirée après l'envoi du lien** (étape 5) : le cartographe a
  retiré sa garantie. Le même lien sert de nouveau le document de base, sans
  mention.
- **A3 — Navigateur déjà connecté** (étape 3) : l'employeur a par ailleurs une
  session humanome. La consultation se déroule exactement comme pour un
  anonyme (la session ne confère rien sur cette route).

## Scénarios d'erreur

- **E0 — Mot de passe trop court** (étape 2) : moins de 8 caractères ; le site
  refuse localement, sans requête.
- **E1 — Mauvais mot de passe** (étape 4) : `403` ; le site affiche « Mot de
  passe incorrect. » et laisse réessayer.
- **E2 — Mot de passe absent** (étape 3) : `422`.
- **E3 — Lien inconnu, malformé, révoqué, expiré ou cartographie supprimée**
  (étape 4) : **même** `404`, au corps identique, précédé d'une vérification
  factice du mot de passe (le temps de réponse ne trahit pas le cas) ; le site
  affiche un message neutre unique.
- **E4 — Trop de tentatives** (étape 4) : au-delà de 20 essais par heure et par
  IP (IPv6 regroupées par /64), `429` avec `Retry-After` (30 s, doublé à
  chaque essai, plafonné à une heure) — même avec le bon mot de passe.

## Règles de gestion

- **RG1** — Le jeton clair (32 caractères hexadécimaux) n'existe que dans la
  réponse de création ; la base ne stocke que `sha256(jeton)`.
- **RG2** — Le mot de passe est stocké en `password_hash` Argon2id, jamais en
  clair.
- **RG3** — Le quota de tentatives est compté **avant** toute recherche : la
  force brute sur le mot de passe et l'énumération des jetons consomment le
  même budget.
- **RG4** — Ce qui est présenté comme garanti est exactement ce qui a été
  signé (§8).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Jeton de partage | Empreinte sha256 en base uniquement |
| Mot de passe du lien | Argon2id |
| IP de l'employeur | Jamais stockée : seau de limitation haché (`share:` + sha256 de l'identité /64) |
| Consultation | Audit `share_consulted` : `{cartographieId, shareLinkId}` |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route publique `#/partage/<jeton>` |
| Front | `web/src/views/ShareView.jsx` | Formulaire, messages d'erreur, rendu lecture seule, mention de garantie |
| Front | `web/src/api/client.js` — `apiFetch`, `ApiError` | Appel HTTP, erreurs typées |
| Front | `web/src/views/DayView.jsx`, `web/src/views/MergeView.jsx` | Rendu de la cartographie |
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
| UC-EMP-01-U01 | `ShareLinks::create`, `findByToken` | Recherche par sha256 du jeton clair ; mot de passe Argon2id | `api/tests/UseCases/Unit/UcEmp01ConsulterPartageTest.php` |
| UC-EMP-01-U02 | `ShareLinks::findByToken` | Jeton inconnu ou empreinte stockée → rien | idem |
| UC-EMP-01-U03 | `ShareLinks::isConsultable` | Vivant / révoqué / expiré (RG1, E3) | idem |
| UC-EMP-01-U04 | `Garanties::forShareLink` | Pas de garantie → `null` | idem |
| UC-EMP-01-U05 | `Garanties::forShareLink` | Garantie figée sur révision → document de la révision (RG4) | idem |
| UC-EMP-01-U06 | `Garanties::forShareLink` | Garantie sur la base → pas de document de révision | idem |
| UC-EMP-01-U07 | `RateLimiter` | 20 essais, 21ᵉ bloqué, délai 30 s → 60 s → plafond | idem |
| UC-EMP-01-U08 | `ClientIp::bucketIdentity` | IPv6 /64, IPv4 mappée | idem |
| UC-EMP-01-U09 | `Users::dummyHash` | Hash valide qui ne vérifie rien | idem |
| UC-EMP-01-U10 | `parseHash` | `#/partage/<jeton>` → route `share` | `web/test/usecases/unit/uc-emp-01-consulter-cartographie-partagee.test.js` |
| UC-EMP-01-U11 | `parseHash` | Jeton trop court / invalide → `not-found` | idem |
| UC-EMP-01-U12 | `apiFetch` | POST JSON sans jeton CSRF hors session | idem |
| UC-EMP-01-U13 | `apiFetch`, `ApiError` | 403/404/422/429 → erreur typée avec statut et message | idem |
| UC-EMP-01-U14 | `SHARE_PASSWORD_MIN_LENGTH` | Minimum 8, aligné sur l'API | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-EMP-01-F01 | Nominal | API | 200 `{titre, type, document, garantie: null}`, aucune session ouverte | `api/tests/UseCases/Functional/UcEmp01ConsulterPartageTest.php` |
| UC-EMP-01-F02 | Nominal (post-condition) | API | Audit `share_consulted` sans jeton, mot de passe ni IP | idem |
| UC-EMP-01-F03 | A1 | API | Garant nommé, document de la révision signée | idem |
| UC-EMP-01-F04 | A2 | API | Garantie retirée → base servie, `garantie` null | idem |
| UC-EMP-01-F05 | E1 | API | 403, aucune donnée, pas d'audit | idem |
| UC-EMP-01-F06 | E2 | API | 422 sans mot de passe | idem |
| UC-EMP-01-F07 | E3 | API | Inconnu, malformé, révoqué, expiré, supprimé → corps 404 identiques | idem |
| UC-EMP-01-F08 | E4 | API | 21ᵉ essai → 429 + `Retry-After` ; autre IP non pénalisée | idem |
| UC-EMP-01-F09 | A3 | API | Session d'un autre compte : consultation identique | idem |
| UC-EMP-01-F10 | Nominal | IHM | `<App/>` sur `#/partage/…` : formulaire, puis journée rendue | `web/test/usecases/functional/uc-emp-01-consulter-cartographie-partagee.test.jsx` |
| UC-EMP-01-F11 | A1 | IHM | Fusion garantie : mention « garantie par Camille » | idem |
| UC-EMP-01-F12 | E0 | IHM | Mot de passe court refusé sans requête | idem |
| UC-EMP-01-F13 | E1 | IHM | Message puis nouvel essai réussi | idem |
| UC-EMP-01-F14 | E3 | IHM | Message neutre unique | idem |
| UC-EMP-01-F15 | E4 | IHM | Invitation à patienter | idem |

### Tests existants liés (non-régression)

- `api/tests/ShareTest.php` — création, hachage, expiration, révocation, quota, audit.
- `api/tests/CartographeGarantieTest.php` — partage public d'une cartographie garantie.
- `web/src/views/ShareView.test.jsx` — composant isolé.
- `web/e2e/parcours-apprenant.e2e.js` — étapes 6, 7 et 10 (navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcEmp01
cd web && npx vitest run test/usecases --testNamePattern UC-EMP-01
```
