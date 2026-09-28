# UC-CAR-02 — Consulter sa file de relecture

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe (rôle `cartographe`, rattaché à au moins un apprenant — UC-CAR-01) |
| **Acteurs secondaires** | Apprenant (choisit la visibilité de chaque cartographie, UC-APP-04) |
| **Portée** | humanome.xyz — `#/cartographe`, `#/cartographe/relecture/<id>` ; API `GET /api/cartographe/cartographies[/{id}]` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (confidentialité « partagée uniquement avec son cartographe »), §3.3, §6 ; `docs/autorisations.md` §P9 |
| **Statut** | Implémenté (P9, contrat M7) |

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

- Aucune donnée d'une cartographie privée, d'un apprenant non lié ou d'un
  autre cartographe n'est révélée.
- Une cartographie inaccessible et une cartographie inexistante reçoivent la
  même réponse (pas d'oracle d'existence).

## Scénario nominal

1. Le cartographe ouvre `#/cartographe` ; la vue vérifie la session
   (`GET /api/auth/me`) et le rôle, puis charge en parallèle ses apprentis et
   sa file.
2. `GET /api/cartographe/cartographies` : le serveur (`Links::queueFor`)
   renvoie une **liste nue** d'entrées `{id, type, titre, visibility,
   createdAt, updatedAt, apprenant: {id, displayName}, annotations,
   revisions, garantie: {par, date} | null}`, triées de la plus récemment
   modifiée à la plus ancienne (puis par id décroissant).
3. Le site affiche le tableau « Cartographies à relire » : titre, apprenant,
   type (« Journée » / « Parcours (merge) »), date de dépôt, badge
   « Garantie par X » ou « À relire », bouton « Relire ». À partir de deux
   entrées, il propose aussi « Comparer deux cartographies d'un même
   apprenant » (UC-CAR-06) et « Analyser la consistance multi-run »
   (UC-CAR-07).
4. Le cartographe clique sur « Relire » : le site ouvre
   `#/cartographe/relecture/<id>` et appelle
   `GET /api/cartographe/cartographies/{id}`.
5. Le serveur vérifie lien **et** visibilité (`Links::findForCartographe`),
   puis répond un objet plat `{id, type, titre, visibility, document,
   createdAt, updatedAt, apprenant, annotations, revisions, garantie}`
   (annotations dans l'ordre de saisie, révisions sans leur document, de la
   plus récente à la plus ancienne).
6. Le site affiche l'en-tête (titre ; « Apprenant : … · Type : … · Déposée le
   … »), l'état de garantie (« Cartographie non garantie : relisez, annotez,
   corrigez si nécessaire, puis validez. ») et la cartographie en lecture
   seule : `DayView` pour une journée.

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

- **E1 — Cartographie inaccessible** (étape 5) : inconnue, privée, d'un
  apprenant non lié, ou lue par un cartographe qui n'est pas celui de
  l'apprenant → **même** `404 {error: "Cartographie introuvable"}` ; le site
  affiche ce message et « ← Retour à la file ».
- **E2 — L'apprenant repasse la cartographie en « privée »** (à tout
  moment) : elle sort immédiatement de la file et le détail, les annotations
  et les révisions répondent `404` au cartographe ; rien n'est détruit — si
  l'apprenant la rouvre, la relecture et son historique réapparaissent.
- **E3 — Pas de session / pas le rôle** (étapes 2 et 5) : `401` / `403` ;
  côté site, espace réservé (cf. UC-CAR-01 E3).
- **E4 — API injoignable (copie statique du site)** (étape 1) : « Copie
  statique du site : l'espace cartographe a besoin de l'API (session, file de
  relecture). Rendez-vous sur le site en ligne. » ; aucun appel à la file.
- **E5 — Échec du chargement de la file** (étape 2) : le message d'erreur du
  serveur est affiché dans la section de la file ; les deux listes
  retombent à vide (voir Limites).
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
| Front | `web/src/views/CartographeView.jsx` | Session, garde de rôle, copie statique, dispatch, section inconnue |
| Front | `web/src/views/cartographe/AccueilSection.jsx` | Tableau de la file, badges, raccourcis outils, erreur de chargement |
| Front | `web/src/views/cartographe/RelectureSection.jsx` | En-tête, état de garantie, visionneuse `DayView` / `MergeView` |
| Front | `web/src/views/cartographe/cartographe-api.js` — `fetchQueue`, `fetchCartographie`, `typeLabel`, `frDate` | Appels et normalisation (forme plate de l'API) |
| API | `GET /api/cartographe/cartographies`, `GET /api/cartographe/cartographies/{id}` — `api/src/routes/cartographe.php` | Orchestration, 404 homogène |
| Domaine | `api/src/Cartographe/Links.php` — `queueFor`, `findForCartographe`, `isLinked` | Périmètre d'accès, projections |
| Domaine | `Annotations::listForCartography`, `Revisions::listForCartography`, `Garanties::findForCartography` | Listes de la vue de relecture |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CAR-02-U01 | `Links::queueFor` | Apprentis liés, visibilités admises, tri `updated_at` puis id (RG1) | `api/tests/UseCases/Unit/UcCar02ConsulterFileRelectureTest.php` |
| UC-CAR-02-U02 | `Links::queueFor` | Projection exacte, compteurs, garantie `{par, date}`, jamais de document (RG2) | idem |
| UC-CAR-02-U03 | `Links::findForCartographe` | Document décodé si lien + visibilité ; `null` sinon (RG3) | idem |
| UC-CAR-02-U04 | `Links::isLinked` | Lien orienté apprenant → cartographe | idem |
| UC-CAR-02-U05 | Listes de la relecture | Annotations par ordre de saisie, révisions récentes d'abord sans document, forme de la garantie | idem |
| UC-CAR-02-U06 | `parseHash` | `#/cartographe/relecture/<id>` → section décodée | `web/test/usecases/unit/uc-car-02-consulter-file-relecture.test.js` |
| UC-CAR-02-U07 | `fetchQueue` | GET, liste nue ou enveloppée | idem |
| UC-CAR-02-U08 | `fetchCartographie` | Forme plate réelle → cartographie, listes, garantie | idem |
| UC-CAR-02-U09 | `fetchCartographie` | Forme enveloppée, garantie absente, id encodé, 404 typé | idem |
| UC-CAR-02-U10 | `typeLabel` | Libellés des types | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-02-F01 | Nominal (file) | API | Deux apprentis liés, privée et non liée exclues, ordre, clés exactes, aucun document | `api/tests/UseCases/Functional/UcCar02ConsulterFileRelectureTest.php` |
| UC-CAR-02-F02 | Nominal (relecture) | API | Objet plat complet, document identique, listes vides, garantie `null` | idem |
| UC-CAR-02-F03 | A3 | API | Compteurs et garantie dans la file ; annotations, révisions (sans document), garantie dans le détail | idem |
| UC-CAR-02-F04 | A2 | API | Détail d'un parcours merge | idem |
| UC-CAR-02-F05 | E1 | API | Inconnue, privée, non liée, autre cartographe → même 404 | idem |
| UC-CAR-02-F06 | E2 | API | Privée → file vide, détail/annotations/révisions 404, propriétaire intact ; réouverture → historique retrouvé | idem |
| UC-CAR-02-F07 | E3 | API | 401 / 403 sur la file et le détail | idem |
| UC-CAR-02-F08 | Nominal (file) | IHM | `<App/>` : lignes, types, dates, badges, liens Relire, raccourcis outils | `web/test/usecases/functional/uc-car-02-consulter-file-relecture.test.jsx` |
| UC-CAR-02-F09 | A1 | IHM | File vide : message, pas de raccourcis | idem |
| UC-CAR-02-F10 | Nominal (relecture) | IHM | En-tête, « non garantie », `DayView`, aucune écriture | idem |
| UC-CAR-02-F11 | A2, A3 | IHM | Merge garanti sur révision : mention figée, `MergeView` | idem |
| UC-CAR-02-F12 | E1, E2 | IHM | 404 → message + retour à la file | idem |
| UC-CAR-02-F13 | E4 | IHM | Copie statique : explication, aucun appel de file | idem |
| UC-CAR-02-F14 | E5 | IHM | Erreur serveur affichée ; listes vides (comportement actuel figé) | idem |
| UC-CAR-02-F15 | E6 | IHM | Section inconnue : alerte + retour | idem |

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

- **Échec partiel de chargement (E5)** : l'accueil charge apprentis et file
  par un seul `Promise.all` ; si la file échoue, « Mes apprentis » affiche
  « Aucun apprenant rattaché pour l'instant » alors que la liste des
  apprentis a bien été reçue (comportement figé par UC-CAR-02-F14).
- **Cartographies `twin9`** : le type `twin9` (analyse approfondie, D12) est
  admis au stockage et entre dans la file comme les autres ; l'espace
  cartographe n'a pas de rendu dédié (libellé brut « twin9 » dans la file,
  relecture limitée aux visionneuses jour/merge).
