# UC-CAR-02 — Consulter sa file de relecture

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe (rôle `cartographe`, rattaché à au moins un apprenant — UC-CAR-01) |
| **Acteurs secondaires** | Apprenant (choisit la visibilité de chaque cartographie, UC-APP-04) |
| **Portée** | humanome.xyz — `#/cartographe`, `#/cartographe/relecture/<id>` ; API `GET /api/cartographe/cartographies[/{id}]` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (confidentialité « partagée uniquement avec son cartographe »), §3.3, §6 ; `docs/autorisations.md` §P9 |
| **Statut** | Implémenté (P9, contrat M7) — voir « Anomalies constatées » |

## Objectif

Donner au cartographe la liste des cartographies que ses apprentis ont
choisi de lui montrer, avec leur état de relecture (annotations, révisions,
garantie), puis l'ouverture d'une cartographie en **lecture seule** — point
de départ de l'annotation (UC-CAR-03), de la correction (UC-CAR-04) et de la
garantie (UC-CAR-05).

## Déclencheur

Le cartographe ouvre `#/cartographe` (file) puis clique sur « Relire »
(`#/cartographe/relecture/<id>`).

## Préconditions

- Le cartographe est connecté avec le rôle `cartographe`.
- Il est rattaché à des apprenants (UC-CAR-01).
- Ces apprenants ont stocké des cartographies sur le serveur (opt-in,
  UC-APP-04) en visibilité `cartographe` (« partagée avec mon cartographe »)
  ou `publique`.

## Garanties en cas de succès

- La file ne contient **que** les cartographies des apprentis liés, en
  visibilité `cartographe` ou `publique`, et **jamais** un document : des
  métadonnées (titre, type, dates, apprenant, nombre d'annotations et de
  révisions, garantie `{par, date}`).
- La relecture sert le document complet, les annotations, les métadonnées
  des révisions et la garantie en place ; rien n'est écrit par la
  consultation.

## Garanties minimales (en cas d'échec)

- Aucune donnée d'une cartographie privée ou d'un apprenant non rattaché à ce
  cartographe n'est révélée (les co-cartographes d'un même apprenant, eux,
  partagent la relecture : voir RG5).
- Une cartographie inaccessible et une cartographie inexistante reçoivent la
  même réponse (pas d'oracle d'existence).

## Scénario nominal

1. Le cartographe ouvre `#/cartographe` ; la vue vérifie la session
   (`GET /api/auth/me`) et le rôle, puis charge en parallèle ses apprentis
   (`GET /api/cartographe/apprentis`, `Links::apprentisOf`) et sa file, par
   un seul `Promise.all`.
2. `GET /api/cartographe/cartographies` : le serveur (`Links::queueFor`)
   renvoie une **liste nue** d'entrées `{id, type, titre, visibility,
   createdAt, updatedAt, apprenant: {id, displayName}, annotations,
   revisions, garantie: {par, date} | null}`, triées par date de dernière
   modification de la cartographie elle-même (`updated_at` : titre ou
   visibilité — l'activité de relecture, annotations, révisions, garantie,
   ne la change pas ; une réouverture après E2 la fait donc remonter), la
   plus récente d'abord, puis par id décroissant.
3. Le site affiche le tableau « Cartographies à relire » : titre, apprenant,
   type (« Journée » / « Parcours (merge) », tout autre type tel quel), date
   de dépôt (`createdAt`, alors que le tri suit `updatedAt`), badge
   « Garantie par X » ou « À relire », bouton « Relire ». À partir de deux
   entrées, il propose aussi « Comparer deux cartographies d'un même
   apprenant » (UC-CAR-06) et « Analyser la consistance multi-run »
   (UC-CAR-07).
4. Le cartographe clique sur « Relire » : le site ouvre
   `#/cartographe/relecture/<id>` et appelle
   `GET /api/cartographe/cartographies/{id}` (la route n'admet qu'un id
   numérique, voir Limites).
5. Le serveur vérifie lien **et** visibilité (`Links::findForCartographe`),
   puis répond un objet plat `{id, type, titre, visibility, document,
   createdAt, updatedAt, apprenant, annotations, revisions, garantie}`
   (annotations dans l'ordre de saisie, révisions sans leur document, de la
   plus récente à la plus ancienne).
6. Le site affiche l'en-tête (titre ; « Apprenant : … · Type : … · Déposée le
   … »), l'état de garantie (« Cartographie non garantie : relisez, annotez,
   corrigez si nécessaire, puis validez. ») et la cartographie en lecture
   seule : `DayView` pour une journée. La visionneuse suit `document.kind`
   (et non le type annoncé) : `MergeView` pour un document
   `cartographie-merge`, `DayView` sinon.

## Scénarios alternatifs

- **A1 — File vide** (étape 3) : « Aucune cartographie dans votre file : vos
  apprentis n'ont encore rien partagé avec vous… » ; pas de raccourcis vers
  les outils.
- **A2 — Parcours (merge)** (étape 6) : le document est une
  `cartographie-merge`, rendue par `MergeView` (vue chronologique).
- **A3 — Cartographie déjà garantie** (étapes 3 et 6) : badge « Garantie par
  X » dans la file ; en relecture, « Cartographie garantie par X le
  JJ/MM/AAAA (révision N figée). » (sans la parenthèse si la garantie porte
  sur le document d'origine).

## Scénarios d'erreur

- **E1 — Cartographie inaccessible** (étape 5) : id numérique inconnu (un id non
  numérique reçoit un autre `404`, voir AN9), privée, d'un
  apprenant non lié, ou lue par un cartographe qui n'est pas celui de
  l'apprenant → **même** `404 {error: "Cartographie introuvable"}` ; le site
  affiche ce message et « ← Retour à la file ».
- **E2 — L'apprenant repasse la cartographie en « privée »** (à tout
  moment) : elle sort immédiatement de la file et le détail, les annotations
  et les révisions répondent `404` au cartographe ; rien n'est détruit — si
  l'apprenant la rouvre, la relecture et son historique réapparaissent.
- **E3 — Pas de session / pas le rôle** (étapes 2 et 5) : `401` / `403`
  (`RequireRole::any('cartographe')`) ; côté site, espace réservé (cf.
  UC-CAR-01 E3). Une erreur autre que `401` sur `GET /api/auth/me` (un `500`
  JSON par exemple) est traitée comme une absence de session : espace
  réservé et « Vous n'êtes pas connecté » (voir Limites).
- **E4 — API injoignable (copie statique du site)** (étape 1) : « Copie
  statique du site : l'espace cartographe a besoin de l'API (session, file de
  relecture). Rendez-vous sur le site en ligne. » ; aucun appel à la file.
- **E5 — Échec du chargement de la file ou des apprentis** (étapes 1-2) : le
  message d'erreur du serveur est affiché dans la section « Cartographies à
  relire » ; les deux listes retombent à vide, quelle que soit la requête qui
  a échoué (voir AN8).
- **E6 — Section inconnue** (`#/cartographe/<autre>`) : « Section inconnue de
  l'espace cartographe : « … ». » et lien de retour.

## Règles de gestion

- **RG1** — Invariant d'accès : un cartographe n'atteint que les
  cartographies de **ses** apprentis, et seulement en visibilité
  `cartographe` ou `publique` ; l'apprenant reste maître (un retour à
  `privee` coupe l'accès sur-le-champ, sans rien supprimer).
- **RG2** — La file est une projection de métadonnées : aucun document n'y
  figure, jamais.
- **RG3** — Refus homogène : inconnu = privé = non lié → même `404`.
- **RG4** — La consultation est en lecture seule : aucune écriture, aucun
  audit.
- **RG5** — Co-cartographes : un apprenant peut être rattaché à plusieurs
  cartographes (une paire par lien) ; chacun voit, dans le détail, les
  annotations des autres (auteur et texte) et la garantie posée par un autre
  (`par`, aussi visible dans la file).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Document de cartographie | Servi uniquement au cartographe lié, en visibilité `cartographe`/`publique`, via le détail |
| File | Métadonnées seulement (titre, type, dates, compteurs, nom affiché de l'apprenant) |
| Consultation | Non journalisée |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Routes `#/cartographe[/<section>]` |
| Front | `web/src/App.jsx` — route `cartographe` | Dispatch vers `CartographeView` |
| Front | `web/src/views/CartographeView.jsx` | Session, garde de rôle, copie statique, dispatch, section inconnue |
| Front | `web/src/views/cartographe/AccueilSection.jsx` | Tableau de la file, badges, raccourcis outils (≥ 2 entrées), erreur de chargement |
| Front | `web/src/views/cartographe/RelectureSection.jsx` | En-tête, état de garantie, visionneuse `DayView` / `MergeView` (selon `document.kind`) |
| Front | `web/src/views/cartographe/cartographe-api.js` — `fetchQueue`, `fetchApprentis`, `fetchCartographie`, `typeLabel`, `frDate` | Appels et normalisation (forme plate de l'API) |
| Front | `web/src/api/client.js` — `fetchMe`, `apiFetch`, `ApiError`, `ApiUnavailableError` | Session, messages d'erreur (E1, E5), copie statique (E4) |
| API | `GET /api/cartographe/cartographies`, `GET /api/cartographe/cartographies/{id}`, `GET /api/cartographe/apprentis` — `api/src/routes/cartographe.php` | Orchestration, 404 homogène |
| API | `api/src/Middleware/RequireRole.php` | 401 sans session, 403 « Rôle insuffisant » (E3) |
| Domaine | `api/src/Cartographe/Links.php` — `queueFor`, `findForCartographe`, `apprentisOf`, `access` | Périmètre d'accès et projections ; `access` garde les routes d'annotations et de révisions (404 de E2) |
| Domaine | `Annotations::listForCartography`, `Revisions::listForCartography`, `Garanties::findForCartography` | Listes de la vue de relecture |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CAR-02-U01 | `Links::queueFor` | Apprentis liés, visibilités admises, tri `updated_at` puis id (RG1) | `api/tests/UseCases/Unit/UcCar02ConsulterFileRelectureTest.php` |
| UC-CAR-02-U02 | `Links::queueFor` | Projection exacte, compteurs, garantie `{par, date}`, jamais de document (RG2) | idem |
| UC-CAR-02-U03 | `Links::findForCartographe` | Document décodé si lien + visibilité ; `null` sinon (RG3) | idem |
| UC-CAR-02-U04 | `Links::access` | Suit la visibilité à chaque appel : ouverte → `cartographe`, privée → `null` (propriétaire `owner`), rouverte → de nouveau `cartographe` ; lié sans le rôle, non lié, inconnue → `null` (E2) | idem |
| UC-CAR-02-U05 | Listes de la relecture | Annotations par ordre de saisie, révisions récentes d'abord sans document, forme de la garantie | idem |
| UC-CAR-02-U06 | `parseHash` | `#/cartographe/relecture/<id>` → section décodée | `web/test/usecases/unit/uc-car-02-consulter-file-relecture.test.js` |
| UC-CAR-02-U07 | `fetchQueue` | GET, liste nue ou enveloppée | idem |
| UC-CAR-02-U08 | `fetchCartographie` | Forme plate réelle → cartographie, listes, garantie | idem |
| UC-CAR-02-U09 | `fetchCartographie` | Forme enveloppée, garantie absente, id encodé, 404 typé | idem |
| UC-CAR-02-U10 | `typeLabel` | Libellés des types | idem |
| UC-CAR-02-U11 | `Garanties::findForCartography` | Garantie posée sur le document d'origine → `revisionId` null (A3) | `api/tests/UseCases/Unit/UcCar02ConsulterFileRelectureTest.php` |
| UC-CAR-02-U12 | `AccueilSection` (rendu seul) | Raccourcis outils absents avec une entrée, présents à partir de deux | `web/test/usecases/unit/uc-car-02-consulter-file-relecture.test.js` |
| UC-CAR-02-U13 | `RelectureSection` (rendu seul) | Garantie sur le document d'origine → « Cartographie garantie par Camille le 10/07/2026. » sans parenthèse (A3) | idem |
| UC-CAR-02-U14 | `RelectureSection` (rendu seul) | La visionneuse suit `document.kind` : document merge sous type `jour` → `MergeView` | idem |

`frDate` est testé par UC-CAR-01-U12.

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-02-F01 | Nominal (file) | API | Deux apprentis liés, privée et non liée exclues, ordre, clés exactes, aucun document ; une analyse `twin9` entre dans la file avec son type brut | `api/tests/UseCases/Functional/UcCar02ConsulterFileRelectureTest.php` |
| UC-CAR-02-F02 | Nominal (relecture), RG4 | API | Objet plat complet, document identique, listes vides, garantie `null` ; aucune écriture : nombre d'audits, `updated_at` et tables de relecture inchangés | idem |
| UC-CAR-02-F03 | A3 | API | Compteurs et garantie dans la file ; annotations, révisions (sans document), garantie dans le détail | idem |
| UC-CAR-02-F04 | A2 | API | Détail d'un parcours merge : document servi égal au document stocké | idem |
| UC-CAR-02-F05 | E1 | API | Inconnue, privée, non liée, autre cartographe → même 404 | idem |
| UC-CAR-02-F06 | E2 | API | Privée → file vide, détail/annotations/révisions 404, propriétaire intact ; réouverture → annotation et révision (note) retrouvées | idem |
| UC-CAR-02-F07 | E3 | API | 401 / 403 sur la file et le détail | idem |
| UC-CAR-02-F08 | Nominal (file) | IHM | `<App/>` : lignes, cellule Type exacte (dont `twin9` brut), dates, badges, liens Relire, raccourcis outils | `web/test/usecases/functional/uc-car-02-consulter-file-relecture.test.jsx` |
| UC-CAR-02-F09 | A1 | IHM | File vide : message, aucun des deux raccourcis | idem |
| UC-CAR-02-F10 | Nominal (relecture) | IHM | En-tête, « non garantie », `DayView`, aucune écriture | idem |
| UC-CAR-02-F11 | A2, A3 | IHM | Merge garanti sur révision : mention figée, `MergeView` | idem |
| UC-CAR-02-F12 | E1, E2 | IHM | 404 → message + retour à la file | idem |
| UC-CAR-02-F13 | E4 | IHM | Copie statique : explication, aucun appel de file | idem |
| UC-CAR-02-F14 | E5 (AN8) | IHM | Erreur serveur affichée dans la section de la file ; listes vides (comportement actuel figé) | idem |
| UC-CAR-02-F15 | E6 | IHM | Section inconnue : alerte + retour | idem |
| UC-CAR-02-F16 | RG5 | API | Co-cartographes : Carl voit l'annotation et la garantie de Rita (détail et file) | `api/tests/UseCases/Functional/UcCar02ConsulterFileRelectureTest.php` |
| UC-CAR-02-F17 | E1 (AN9) | API | Id non numérique → 404 générique de Slim `{message: "404 Not Found"}` (comportement actuel) | idem |
| UC-CAR-02-F18 | E5 (AN8) | IHM | Échec des apprentis, file reçue : alerte, file affichée vide avec « Aucune cartographie dans votre file » (comportement actuel) | `web/test/usecases/functional/uc-car-02-consulter-file-relecture.test.jsx` |
| UC-CAR-02-F19 | E3 (limite) | IHM | `api/auth/me` en 500 → espace réservé et « Vous n'êtes pas connecté », aucun appel à la file | idem |
| UC-CAR-02-F20 | E1 (AN9) | IHM | Id non numérique : « 404 Not Found » affiché tel quel (comportement actuel) | idem |

### Tests existants liés (non-régression)

- `api/tests/CartographeQueueTest.php` — périmètre de la file, garde de rôle, détail, matrice IDOR, bascule en privée.
- `web/src/views/CartographeView.test.jsx` — garde de rôle, accueil, section inconnue.
- `web/src/views/cartographe/RelectureSection.test.jsx` — en-tête et visionneuse (forme enveloppée).
- `web/e2e/parcours-cartographe.e2e.js` — « la file se remplit », « ouverture de la relecture ».

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCar02 --testdox
cd web && npx vitest run test/usecases/unit/uc-car-02 test/usecases/functional/uc-car-02
```

## Limites

- **Erreur de session** : une erreur autre que `401` sur `GET /api/auth/me`
  (par exemple un `500` JSON) met la vue en état « visiteur » : espace
  réservé et « Vous n'êtes pas connecté » (UC-CAR-02-F19).
- **Tri de la file** : il suit `updated_at` de la ligne `cartographies`, que
  seules les modifications de titre ou de visibilité font bouger ; la
  colonne affichée est pourtant la date de dépôt (`createdAt`).
- **Cartographies `twin9`** : le type `twin9` (analyse approfondie, D12) est
  admis au stockage et entre dans la file comme les autres ; l'espace
  cartographe n'a pas de rendu dédié (libellé brut « twin9 » dans la file,
  relecture limitée aux visionneuses jour/merge) — UC-CAR-02-F01, F08.

## Anomalies constatées

- **AN8 — Échec partiel de chargement : la liste reçue est perdue, avec un
  message faux.** L'accueil charge apprentis et file par un seul
  `Promise.all` ; si la file échoue, « Mes apprentis » affiche « Aucun
  apprenant rattaché pour l'instant » alors que la liste des apprentis a
  bien été reçue (UC-CAR-02-F14). Dans l'autre sens, si seule la liste des
  apprentis échoue, la file reçue est perdue et le site affirme « Aucune
  cartographie dans votre file : vos apprentis n'ont encore rien partagé… »
  (UC-CAR-02-F18). Dans les deux cas, l'erreur s'affiche dans la section de
  la file.
- **AN9 — Id non numérique : message d'erreur anglais.**
  `#/cartographe/relecture/abc` appelle `GET /api/cartographe/cartographies/abc` ;
  la route `{id:[0-9]+}` ne correspond pas et Slim répond son propre `404`
  JSON `{message: "404 Not Found"}` (pas de clé `error`) ; `apiFetch` retombe
  sur `message` et le site affiche « 404 Not Found », en anglais, au lieu de
  « Cartographie introuvable ». Figé par UC-CAR-02-F17 (API) et F20 (IHM).
