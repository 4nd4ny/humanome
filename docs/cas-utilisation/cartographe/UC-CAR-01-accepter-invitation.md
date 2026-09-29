# UC-CAR-01 — Accepter l'invitation d'un apprenant

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe (compte portant le rôle `cartographe`) |
| **Acteurs secondaires** | Apprenant (émetteur du code, UC-APP-07) |
| **Portée** | humanome.xyz — espace cartographe `#/cartographe`, API `/api/cartographe/*` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §2 (rôle cartographe), §3.3, §6 (l'apprenant reste maître de qui le lit) ; CLAUDE.md, principe RGPD 5 (journalisation minimale) ; `docs/autorisations.md` §P9 |
| **Statut** | Implémenté (P9, contrat M7) — voir « Anomalies constatées » |

## Objectif

Permettre à un cartographe de se **rattacher** à un apprenant qui l'a choisi,
en saisissant le code d'invitation que cet apprenant lui a transmis ; une fois
rattaché, le cartographe voit l'apprenant dans « Mes apprentis » et les
cartographies que celui-ci expose entrent dans sa file de relecture (UC-CAR-02).

## Déclencheur

Le cartographe a reçu un code (10 caractères, par exemple `K7TQZ2M9RC`) et le
saisit dans le formulaire « Accepter une invitation » de `#/cartographe`.

## Préconditions

- Le cartographe est connecté et son compte porte le rôle `cartographe`.
- L'apprenant a émis un code (`POST /api/cartographe/invitations`, UC-APP-07) :
  10 caractères de l'alphabet `A-Z2-9`, valable 30 jours, à usage unique. À ce
  jour aucun écran de l'espace apprenant n'appelle cette route (émission par
  l'API, cf. `web/e2e/parcours-cartographe.e2e.js`).

## Garanties en cas de succès

- Le code est **consommé** (`accepted_at`, `accepted_by`) et le lien
  apprenant → cartographe existe (`cartographe_links`).
- Le cartographe voit l'apprenant dans « Mes apprentis » (avec la date de
  rattachement) ; les cartographies de l'apprenant en visibilité
  `cartographe` ou `publique` apparaissent dans sa file.
- Côté apprenant, le code passe au statut `acceptee` avec le nom du
  cartographe (`GET /api/cartographe/invitations`).
- Un événement d'audit `invitation_accepted` est enregistré avec des
  identifiants seulement : `user_id` = cartographe, `{apprenantId}` — ni le
  code, ni un nom.

## Garanties minimales (en cas d'échec)

- Aucun lien n'est créé, aucun code n'est consommé, aucun audit n'est écrit —
  sauf si seule l'écriture de l'audit échoue : l'acceptation est alors déjà
  validée (voir AN7).
- Aucune réponse ne permet de distinguer un code inconnu d'un code expiré,
  déjà utilisé ou émis par soi-même (anti-énumération).

## Scénario nominal

1. Le cartographe ouvre `#/cartographe`. La vue vérifie la session
   (`GET /api/auth/me`) ; le rôle `cartographe` étant présent, l'accueil
   charge en parallèle `GET /api/cartographe/apprentis` et
   `GET /api/cartographe/cartographies`.
2. Il saisit le code dans « Code d'invitation » (champ limité à 10
   caractères, passé en majuscules à la frappe) et clique sur « Accepter
   l'invitation ». Le site normalise (`trim` + majuscules) et vérifie
   localement la forme `^[A-Z2-9]{10}$`.
3. Le navigateur envoie `POST /api/cartographe/invitations/{code}/accept`
   (cookie de session + en-tête `X-CSRF-Token`, jeton obtenu par
   `GET /api/auth/me` et gardé en mémoire par `apiFetch`) ; pendant l'appel,
   le bouton est désactivé et libellé « Acceptation… » (pas de double envoi).
4. Le middleware CSRF global (middleware d'application, exécuté avant le
   routage) vérifie le jeton dès qu'un cookie de session est présent (E4),
   puis la route vérifie le rôle (`RequireRole::any('cartographe')`, E3),
   contrôle la forme du code (`Invitations::isWellFormedCode`), puis
   `Invitations::accept` : dans une transaction, retrouve le code non accepté
   et non expiré (`SELECT … FOR UPDATE`), refuse l'auto-lien, marque le code
   accepté et crée le lien (`INSERT IGNORE`). La recherche en base est
   insensible à la casse (collation `utf8mb4_unicode_ci` de la colonne
   `code`) : c'est le contrôle de forme de la route qui fait répondre `404` à
   un code en minuscules.
5. Une fois la transaction validée, le serveur journalise
   `invitation_accepted` (hors transaction, voir AN7) puis répond `201
   {apprenant: {id, displayName}}`.
6. Le site affiche « Invitation acceptée : l'apprenant est maintenant rattaché
   à vous. », vide le champ et recharge les deux listes : l'apprenant apparaît
   dans « Mes apprentis » (« rattaché le JJ/MM/AAAA »), ses cartographies
   exposées dans « Cartographies à relire ».

## Scénarios alternatifs

- **A1 — Déjà rattaché à cet apprenant** (étape 4) : le cartographe accepte un
  second code du même apprenant. Le code est consommé, le lien existant est
  conservé tel quel (date d'origine), la réponse est `201` comme au nominal et
  un nouvel audit est écrit ; « Mes apprentis » ne compte toujours qu'une
  entrée.

## Scénarios d'erreur

- **E1 — Code mal formé** (étape 2) : longueur différente de 10 ou caractère
  hors alphabet (`0`, `1`…) ; le site affiche « Le code d'invitation comporte
  10 caractères (lettres A-Z, chiffres 2-9). » sans requête. Envoyé
  directement à l'API, un code mal formé (y compris en minuscules : l'API ne
  normalise pas, et sa garde de forme écarte les minuscules avant la
  recherche, elle-même insensible à la casse) reçoit le `404` de E2.
- **E2 — Code inconnu, expiré, déjà utilisé, ou émis par le cartographe
  lui-même** (étape 4) : **même** `404 {error: "Invitation introuvable ou
  expirée"}` au corps identique ; le site affiche ce message, garde la saisie
  et ne recharge rien. Un code refusé pour auto-lien n'est **pas** consommé.
- **E3 — Pas de session ou pas le rôle** (étapes 1 et 4) : l'API répond `401`
  sans session et `403 {error: "Rôle insuffisant"}` sans le rôle (requête
  portant un jeton CSRF valide ; sans jeton, E4 prime) ; le site
  remplace l'espace de travail par « Cet espace de travail est réservé aux
  cartographes. » et l'explication du rôle (lien vers la formation, ouverte à
  tous), plus « Vous n'êtes pas connecté » pour un visiteur ; aucun appel à
  `/api/cartographe/*` n'est fait.
- **E4 — Jeton CSRF absent ou invalide** (étapes 3-4) : `403 {error: "Jeton
  CSRF absent ou invalide"}` du middleware CSRF, vérifié avant la garde de
  rôle (un compte sans le rôle et sans jeton reçoit ce `403`-ci) ; le code
  reste utilisable. Côté site, l'alerte affiche ce message du serveur tel
  quel, la saisie est conservée et rien n'est rechargé.
- **E5 — Session perdue ou API injoignable pendant l'acceptation** (étape 3) :
  toute autre erreur du POST est affichée telle quelle dans l'alerte du
  formulaire — `401 « Authentification requise »` (session expirée après le
  montage), `403 « Rôle insuffisant »` (rôle retiré entre-temps), ou le
  message « espace compte indisponible » d'`ApiUnavailableError` ; la saisie
  est conservée, rien n'est rechargé.

## Règles de gestion

- **RG1** — Code : 10 caractères de l'alphabet `A-Z2-9` (sans `0`/`1`
  ambigus), 30 jours, usage unique ; c'est l'**apprenant** qui invite (il
  choisit son cartographe, cahier §6).
- **RG2** — Refus homogène : inconnu = expiré = déjà utilisé = auto-lien =
  mal formé → même `404`, même corps. La forme est contrôlée par la route
  avant la recherche en base, laquelle est insensible à la casse : l'ordre
  des gardes garantit le `404` d'un code en minuscules.
- **RG3** — Pas d'auto-lien : un compte portant les deux rôles ne peut pas
  devenir son propre garde-fou (cahier §8).
- **RG4** — Idempotence du lien : un seul lien par paire, conservé à la date
  du premier rattachement.
- **RG5** — L'acceptation est transactionnelle et verrouille la ligne du
  code (`SELECT … FOR UPDATE`) : deux cartographes ne peuvent pas consommer
  le même code (une acceptation concurrente attend le verrou puis relit le
  code, déjà consommé).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Code d'invitation | Stocké en clair (secret court, 30 jours, usage unique) ; jamais journalisé par l'application (audit `invitation_accepted` sans code) ; présent dans le **chemin d'URL** de l'acceptation, donc dans les journaux d'accès du serveur web (et de tout proxy) — secret court, à usage unique, inutilisable une fois consommé |
| Lien apprenant ↔ cartographe | `cartographe_links`, supprimé avec l'un ou l'autre compte (CASCADE) |
| Accepteur | `accepted_by`, anonymisé (SET NULL) à la purge du cartographe |
| Acceptation | Audit `invitation_accepted` : `{apprenantId}` (+ `user_id` du cartographe) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/cartographe` |
| Front | `web/src/views/CartographeView.jsx` | Garde de rôle (session via `fetchMe`), espace réservé, dispatch des sections |
| Front | `web/src/views/cartographe/AccueilSection.jsx` | Formulaire de code (normalisation, contrôle local, bouton désactivé pendant l'appel), messages, rechargement des listes |
| Front | `web/src/views/cartographe/cartographe-api.js` — `acceptInvitation`, `fetchApprentis`, `fetchQueue`, `frDate` | Appels HTTP, normalisation, date de rattachement |
| Front | `web/src/api/client.js` — `apiFetch`, `fetchMe`, `ApiError`, `ApiUnavailableError` | Jeton CSRF en mémoire et réémis (étape 3), message serveur des erreurs (E2, E4, E5) |
| API | `api/src/Middleware/CsrfMiddleware.php` | CSRF global, exécuté avant la garde de rôle (E4) |
| API | `POST /api/cartographe/invitations/{code}/accept`, `GET /api/cartographe/apprentis`, `GET /api/cartographe/cartographies` — `api/src/routes/cartographe.php` | Orchestration, 404 homogène, audit ; listes rechargées (étapes 1 et 6) |
| API | `GET /api/cartographe/invitations` — `api/src/routes/cartographe.php` | Suivi côté apprenant (garantie de succès) |
| Domaine | `api/src/Cartographe/Invitations.php` — `isWellFormedCode`, `accept`, `listForApprenant` | Forme du code, acceptation transactionnelle, suivi côté apprenant |
| Domaine | `api/src/Cartographe/Links.php` — `apprentisOf`, `queueFor` | Apprentis rattachés, file rechargée (l'idempotence du lien vient de la clé primaire et de `INSERT IGNORE`, pas de `isLinked`, sans appelant en production) |
| Domaine | `api/src/Middleware/RequireRole.php`, `api/src/Auth/Audit.php` | Garde de rôle, journal — testés unitairement par UC-ADM-01-U10 (`RequireRole`) et UC-APP-05-U06 (`Audit::record`) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CAR-01-U01 | `Invitations::isWellFormedCode` | Alphabet `A-Z2-9`, longueur 10, minuscules refusées (RG1) | `api/tests/UseCases/Unit/UcCar01AccepterInvitationTest.php` |
| UC-CAR-01-U02 | `Invitations::accept` | Apprenant renvoyé, code consommé, lien orienté créé | idem |
| UC-CAR-01-U03 | `Invitations::accept` | Inconnu / expiré / déjà utilisé → `null` sans effet de bord (RG2) | idem |
| UC-CAR-01-U04 | `Invitations::accept` | Auto-lien refusé, code non consommé (RG3) | idem |
| UC-CAR-01-U05 | `Invitations::accept` | Second code : un seul lien, date d'origine conservée (RG4) | idem |
| UC-CAR-01-U06 | `Links::apprentisOf` | Mes seuls apprentis, triés par nom, `linkedAt` ISO | idem |
| UC-CAR-01-U07 | `Invitations::listForApprenant` | Statut `acceptee` + nom du cartographe côté apprenant | idem |
| UC-CAR-01-U08 | `parseHash` | `#/cartographe` → section `null` | `web/test/usecases/unit/uc-car-01-accepter-invitation.test.js` |
| UC-CAR-01-U09 | `acceptInvitation` | POST sur la bonne URL avec le jeton CSRF de la session | idem |
| UC-CAR-01-U10 | `acceptInvitation` | Code encodé dans l'URL ; 404 → promesse rejetée par une `ApiError` au message serveur | idem |
| UC-CAR-01-U11 | `fetchApprentis` | Liste nue (forme API) ou enveloppée, sinon `[]` | idem |
| UC-CAR-01-U12 | `frDate` | ISO → JJ/MM/AAAA ; vide → « — » ; illisible → tel quel | idem |
| UC-CAR-01-U13 | `Invitations::accept` | Verrou `FOR UPDATE` : une transaction concurrente (second processus) tient le code ; l'acceptation attend, puis renvoie `null` ; l'accepteur reste le premier, aucun lien pour le second (RG5) | `api/tests/UseCases/Unit/UcCar01AccepterInvitationTest.php` |
| UC-CAR-01-U14 | `Invitations::accept`, `isWellFormedCode` | Recherche insensible à la casse (collation) : `accept` en minuscules rattache ; `isWellFormedCode` refuse les minuscules (RG2, comportement actuel) | idem |
| UC-CAR-01-U15 | `AccueilSection` (rendu seul) | Normalisation `trim` + majuscules avant l'envoi (`' k7tqz2m9rc '` → `…/K7TQZ2M9RC/accept`) | `web/test/usecases/unit/uc-car-01-accepter-invitation.test.js` |
| UC-CAR-01-U16 | `AccueilSection` (rendu seul) | Contrôle local : message d'erreur, aucun appel hors des deux GET du montage, saisie conservée | idem |
| UC-CAR-01-U17 | `CartographeView` (rendu seul) | Garde de rôle : sans le rôle, espace réservé et aucun appel ; avec le rôle, formulaire de code | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-01-F01 | Nominal | API | 201 `{apprenant}`, audit ids seulement, apprentis, statut côté apprenant, file limitée aux cartos exposées | `api/tests/UseCases/Functional/UcCar01AccepterInvitationTest.php` |
| UC-CAR-01-F02 | A1 | API | Second code → 201, un seul apprenti à la date d'origine (`linkedAt` inchangé), deux codes consommés, deux audits | idem |
| UC-CAR-01-F03 | E1, E2 | API | Inconnu, malformé, minuscules, expiré, déjà utilisé, auto-lien → corps 404 identiques ; code d'auto-lien non consommé | idem |
| UC-CAR-01-F04 | E3 | API | 401 visiteur, 403 « Rôle insuffisant » ; code intact | idem |
| UC-CAR-01-F05 | E4 | API | Sans CSRF → 403, code toujours acceptable ; compte sans rôle et sans jeton → 403 CSRF (le CSRF passe avant la garde de rôle) | idem |
| UC-CAR-01-F06 | Nominal | IHM | `<App/>` sur `#/cartographe` : code en minuscules accepté, CSRF envoyé, message, listes rechargées | `web/test/usecases/functional/uc-car-01-accepter-invitation.test.jsx` |
| UC-CAR-01-F07 | E1 | IHM | Codes mal formés refusés sans requête | idem |
| UC-CAR-01-F08 | E2 | IHM | Message neutre du serveur, saisie conservée, pas de rechargement | idem |
| UC-CAR-01-F09 | E3 | IHM | Connecté sans le rôle : espace réservé, lien formation, aucun appel `/api/cartographe/*` | idem |
| UC-CAR-01-F10 | E3 | IHM | Visiteur : espace réservé + « Vous n'êtes pas connecté » | idem |
| UC-CAR-01-F11 | Étape 5 (AN7) | API | Audit en panne (table renommée le temps d'une requête) → 500 « Erreur interne », alors que le lien existe, que le code est `acceptee` côté apprenant et qu'un nouvel essai répond 404 (comportement actuel) | `api/tests/UseCases/Functional/UcCar01AccepterInvitationTest.php` |
| UC-CAR-01-F12 | E4 | IHM | 403 CSRF : message serveur dans l'alerte, saisie conservée, bouton réactivé, pas de rechargement | `web/test/usecases/functional/uc-car-01-accepter-invitation.test.jsx` |
| UC-CAR-01-F13 | E5 | IHM | Session perdue (401) pendant l'acceptation : message « Authentification requise », saisie conservée, pas de rechargement | idem |
| UC-CAR-01-F14 | Étape 6 (limite) | IHM | Acceptation réussie mais rechargement en échec : message de succès ET alerte de chargement affichés ensemble | idem |

### Tests existants liés (non-régression)

- `api/tests/CartographeInvitationsTest.php` — émission, garde de rôle, CSRF, plafond, acceptation, 404 homogène, auto-lien, idempotence.
- `api/tests/CartographePurgeTest.php` — anonymisation de l'accepteur à la purge.
- `web/src/views/CartographeView.test.jsx` — garde de rôle, acceptation, refus local.
- `web/e2e/parcours-cartographe.e2e.js` — étape « accepte l'invitation, l'apprenant apparaît, la file se remplit » (navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCar01 --testdox
cd web && npx vitest run test/usecases/unit/uc-car-01 test/usecases/functional/uc-car-01
```

## Limites

- Aucun moyen de **défaire** un lien (ni côté apprenant, ni côté cartographe)
  hors suppression de compte : l'apprenant garde la main par la visibilité de
  chaque cartographie (UC-APP-04, UC-CAR-02 E2).
- Le champ de saisie est limité à 10 caractères (`maxLength`) : un code
  collé précédé d'espaces est tronqué par le navigateur avant la
  normalisation, si bien que le `trim` n'a pas d'effet utile en pratique
  (jsdom n'applique pas `maxLength` : UC-CAR-01-U15 exerce donc la logique
  de normalisation elle-même).
- Si l'acceptation réussit mais que le rechargement des listes échoue
  (étape 6), le message de succès et l'alerte de chargement de la file
  s'affichent ensemble (même comportement que UC-CAR-02 E5).

## Anomalies constatées

- **AN7 — Audit écrit hors de la transaction d'acceptation.**
  `Invitations::accept` valide sa transaction (code consommé, lien créé)
  avant que la route n'écrive l'événement `invitation_accepted`. Si cette
  écriture échoue, le `$wrap` de la route transforme la `PDOException` en
  `500 {error: "Erreur interne"}` sans rien annuler : le cartographe voit
  une erreur alors que l'apprenant lui est rattaché et que le code est
  consommé ; un nouvel essai répond `404` ; l'acceptation n'est pas
  journalisée. Cela contredit la garantie minimale (« aucun code n'est
  consommé ») et l'invariant « chaque acceptation est journalisée ». Figé
  par UC-CAR-01-F11.
