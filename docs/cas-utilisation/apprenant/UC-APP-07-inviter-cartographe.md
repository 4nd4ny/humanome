# UC-APP-07 — Inviter un cartographe

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (compte actif, rôle `apprenant`) |
| **Acteurs secondaires** | Cartographe choisi (reçoit le code et l'accepte, UC-CAR-01) |
| **Portée** | humanome.xyz — API `POST/GET /api/cartographe/invitations` (aucune IHM apprenant à ce jour, voir « Anomalies constatées ») |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.3 (cartographe, micro-classes RESPIRE), §6 (l'apprenant reste maître de qui le lit), §8 (garde-fou humain) |
| **Statut** | Implémenté côté API (P9 / contrat M7) ; IHM apprenant au backlog M7 |

## Objectif

Permettre à l'apprenant de **choisir** le cartographe qui relira et pourra
garantir ses cartographies : il émet un **code d'invitation** à usage unique,
le transmet à la personne de son choix (typiquement un pair de sa
micro-classe RESPIRE) et suit l'état de ses codes. L'acceptation par le
cartographe est l'objet de UC-CAR-01.

## Déclencheur

L'apprenant demande un nouveau code d'invitation (`POST
/api/cartographe/invitations`).

## Préconditions

- Compte activé, session ouverte, rôle `apprenant` (UC-CPT-01, UC-CPT-02).
- Moins de 10 codes **en attente** (ni acceptés, ni expirés) pour ce compte.

## Garanties en cas de succès

- Un code de 10 caractères de l'alphabet `A-Z` + `2-9` (sans les chiffres 0
  et 1), unique, valable **30 jours**, est rattaché à l'apprenant.
- L'apprenant peut suivre chacun de ses codes : `en_attente`, `acceptee` (avec
  le nom affiché du cartographe et la date) ou `expiree`.
- Une fois le code accepté (UC-CAR-01), le cartographe est **lié** : il lit
  les cartographies de l'apprenant en visibilité `cartographe` ou `publique`
  (UC-APP-04 A2, UC-CAR-02), et seulement celles-là.

## Garanties minimales (en cas d'échec)

- Aucun code n'est créé.
- Un apprenant ne voit jamais les codes d'un autre.

## Scénario nominal

1. L'apprenant connecté demande un code : `POST
   /api/cartographe/invitations` (sans corps, avec `X-CSRF-Token`).
2. Le serveur vérifie la session et le rôle `apprenant`, le jeton CSRF, puis
   compte les codes en attente de l'apprenant (moins de 10 requis).
3. Il tire un code aléatoire (10 caractères `A-Z2-9`, nouvel essai en cas de
   collision sur la clé unique), l'enregistre avec `expires_at = NOW() + 30
   jours` et répond `201 {code, expiresAt}`.
4. L'apprenant transmet le code, hors plateforme, au cartographe de son choix.
5. Il suit ses codes : `GET /api/cartographe/invitations` →
   `[{code, statut, createdAt, expiresAt, acceptedAt, acceptedBy}]`, du plus
   récent au plus ancien ; le nouveau code est `en_attente`.
6. Le cartographe accepte le code (UC-CAR-01) : le lien apprenant ↔
   cartographe est créé et le code est consommé.
7. Le suivi de l'apprenant montre le code `acceptee`, `acceptedBy` = nom
   affiché du cartographe, `acceptedAt` daté ; le cartographe voit désormais
   les cartographies partagées avec lui.

## Scénarios alternatifs

- **A1 — Plusieurs codes** (étape 1) : un code par cartographe pressenti ;
  chacun est distinct, la liste les présente du plus récent au plus ancien.
- **A2 — Code expiré** (étape 5) : au bout de 30 jours sans acceptation, le
  code passe `expiree`, n'est plus acceptable (`404` homogène pour le
  cartographe, UC-CAR-01) et **ne compte plus** dans le plafond.
- **A3 — Code accepté** (étape 7) : il ne compte plus dans le plafond ; un
  nouveau code peut être émis.
- **A4 — Le cartographe supprime son compte** (après l'étape 7) : le code
  reste `acceptee` (date conservée) mais `acceptedBy` devient `null`
  (anonymisation, `accepted_by` SET NULL) et le lien est rompu.

## Scénarios d'erreur

- **E1 — Plafond atteint** (étape 2) : 10 codes en attente → `429 {"error":
  "Trop d'invitations en attente (10 maximum) — attendez une acceptation ou
  une expiration"}` ; aucun code créé, le suivi reste disponible.
- **E2 — Session, CSRF, rôle** (étape 2) : sans session `401` (émission et
  suivi) ; sans jeton CSRF `403` ; compte sans rôle `apprenant` (ex.
  cartographe seul) `403` sur l'émission **et** le suivi.
- **E3 — Autre apprenant** (étape 5) : sa liste ne contient que ses propres
  codes (vide s'il n'en a pas) ; le plafond est compté par apprenant.

## Règles de gestion

- **RG1** — Seul l'apprenant **invite** : le cartographe ne peut pas se
  rattacher de lui-même (§6 : l'apprenant contrôle qui le lit).
- **RG2** — Code : 10 caractères de `ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789`
  (les chiffres 0 et 1 sont exclus ; les lettres O et I font partie de
  l'alphabet), unique en base.
- **RG3** — Validité : 30 jours à partir de l'émission, posée par le serveur ;
  usage unique.
- **RG4** — Plafond anti-inondation : `Invitations::MAX_PENDING = 10` codes
  non acceptés et non expirés par apprenant.
- **RG5** — Statut calculé à la lecture : `acceptee` si `accepted_at` est
  posé (même après la date d'expiration), sinon `expiree` si `expires_at` est
  passé, sinon `en_attente`.
- **RG6** — Purge : suppression du compte apprenant → ses codes sont purgés
  (CASCADE) ; suppression du compte cartographe → `accepted_by` anonymisé.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Code d'invitation | En clair pour son émetteur (liste) ; aucune donnée personnelle |
| Nom du cartographe | `acceptedBy` = nom affiché, visible de l'apprenant seul ; effacé si le cartographe supprime son compte |
| Journal | Aucun événement à l'émission ; l'acceptation journalise `invitation_accepted` (UC-CAR-01) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| API | `api/src/routes/cartographe.php` — `POST /api/cartographe/invitations`, `GET /api/cartographe/invitations` | Plafond, émission, suivi |
| API | `api/src/Middleware/RequireRole.php`, `api/src/Middleware/CsrfMiddleware.php` | 401/403 |
| Domaine | `api/src/Cartographe/Invitations.php` — `isWellFormedCode`, `create`, `countPending`, `listForApprenant`, `MAX_PENDING` | Format, validité, plafond, statuts |
| Données | `scripts/migrations/008_cartographe_garanties_settings.sql` — `cartographe_invitations`, `cartographe_links` | Unicité du code, CASCADE / SET NULL |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-07-U01 | `Invitations::isWellFormedCode` | 10 caractères `A-Z2-9`, ni 0/1 ni minuscule ; O et I admis (RG2) | `api/tests/UseCases/Unit/UcApp07InviterCartographeTest.php` |
| UC-APP-07-U02 | `Invitations::create` | Codes bien formés et distincts, 30 jours, non acceptés (RG2, RG3) | idem |
| UC-APP-07-U03 | `Invitations::countPending`, `MAX_PENDING` | Ni acceptés, ni expirés, ni ceux d'autrui ; plafond 10 (RG4) | idem |
| UC-APP-07-U04 | `Invitations::listForApprenant` | Trois statuts, ordre, clés, nom du cartographe (RG5) | idem |
| UC-APP-07-U05 | `Invitations::listForApprenant` | Accepté puis expiré reste `acceptee` ; nom anonymisé à la purge (RG5, RG6) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-07-F01 | Nominal | API | `201 {code, expiresAt}`, 30 jours, pas d'audit à l'émission, `en_attente` puis `acceptee` par Camille, file ouverte | `api/tests/UseCases/Functional/UcApp07InviterCartographeTest.php` |
| UC-APP-07-F02 | A1 | API | Trois codes distincts, plus récent d'abord | idem |
| UC-APP-07-F03 | A2 | API | `expiree`, inacceptable, place libérée dans le plafond | idem |
| UC-APP-07-F04 | A3 | API | Code accepté hors plafond | idem |
| UC-APP-07-F05 | E1 | API | 11ᵉ code en attente → `429` + message, 10 codes en base | idem |
| UC-APP-07-F06 | E2 | API | `401` sans session, `403` sans CSRF, `403` sans rôle | idem |
| UC-APP-07-F07 | E3 | API | Listes et plafonds cloisonnés par apprenant | idem |
| UC-APP-07-F08 | Anomalie 1 | IHM | `<App/>` sur `#/espace` et `#/compte` (apprenant connecté) : aucune commande d'invitation — comportement actuel figé | `web/test/usecases/functional/uc-app-07-inviter-cartographe.test.jsx` |
| UC-APP-07-F09 | A4 | API | Compte du cartographe supprimé : `acceptee`, `acceptedBy` nul, lien rompu | `api/tests/UseCases/Functional/UcApp07InviterCartographeTest.php` |

### Tests existants liés (non-régression)

- `api/tests/CartographeInvitationsTest.php` — émission, rôles, CSRF, plafond, acceptation, 404 homogène, auto-lien, idempotence.
- `api/tests/CartographePurgeTest.php` — purge des invitations et liens avec les comptes.
- `web/e2e/parcours-cartographe.e2e.js` — étape 1 : code émis par `fetch` depuis la page (faute d'IHM apprenant).
- Acceptation par le cartographe : voir [UC-CAR-01](../cartographe/UC-CAR-01-accepter-invitation.md).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcApp07 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-APP-07
```

## Anomalies constatées

1. **Aucune IHM apprenant pour inviter un cartographe.** La formation
   cartographe (chapitre 1 : « Depuis son espace, il génère un code
   d'invitation ») et l'accueil de l'espace cartographe (« Un apprenant génère
   un code d'invitation depuis son espace ») annoncent un geste que l'IHM
   n'offre pas : ni le tableau de bord `#/espace` ni l'espace compte `#/compte`
   ne permettent d'émettre ou de suivre un code (`docs/tests-e2e.md` : « l'UI
   apprenant dédiée reste au backlog M7 » ; le parcours e2e appelle l'API par
   `fetch`). Conséquence : sans outil de développement, un apprenant ne peut
   pas se rattacher un cartographe, donc ni relecture, ni correction, ni
   garantie (UC-CAR-02 à UC-CAR-05). Figé par UC-APP-07-F08.

## Limites

- Un code en attente ne peut pas être annulé par l'apprenant (aucune route) :
  il reste acceptable jusqu'à son expiration.
- L'apprenant ne peut pas se délier d'un cartographe (aucune route) ; son
  levier est la visibilité : repasser ses cartographies en `privee` coupe
  l'accès (UC-APP-04 A2).
- La formation cartographe écrit « sans les ambigus 0/O ni 1/I » : seuls les
  **chiffres** 0 et 1 sont exclus, les lettres O et I restent possibles.
- L'émission d'un code n'est pas journalisée.
