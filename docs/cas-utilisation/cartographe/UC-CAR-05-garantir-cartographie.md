# UC-CAR-05 — Garantir une cartographie ou retirer sa garantie

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe lié à l'apprenant (UC-CAR-01) |
| **Acteurs secondaires** | Apprenant propriétaire (ne peut jamais garantir sa propre cartographie) ; employeur (voit la mention « garantie par », UC-EMP-01) ; autre cartographe lié (conflit de signature) |
| **Portée** | humanome.xyz — section « Garantie » de `#/cartographe/relecture/<id>` ; API `POST/DELETE /api/cartographies/{id}/garantie` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §2 (le cartographe « garantit »), §3.3 (« valider/garantir une cartographie avant partage à un employeur »), §8 (garde-fou humain obligatoire, jamais 100 % automatisé) ; `docs/autorisations.md` §P9 ; formation cartographe, chapitre 5 §4-6 |
| **Statut** | Implémenté (P9, contrat M7) — voir « Anomalies constatées » |

## Objectif

Permettre au cartographe d'apposer sa **signature humaine, nominative et
horodatée** sur une version précise d'une cartographie (document d'origine ou
révision), pour que le lien de partage employeur présente **exactement** cette
version avec la mention « garantie par » — et de retirer cette signature s'il
découvre une erreur.

## Déclencheur

Au terme de sa relecture, le cartographe clique sur « Valider et garantir »
(ou « Retirer ma garantie »).

## Préconditions

- Le cartographe est lié à l'apprenant (UC-CAR-01) et la cartographie est en
  visibilité `cartographe`/`publique`.
- Aucune garantie d'un **autre** cartographe n'est en place.
- Pour figer une révision, celle-ci existe dans l'historique de cette
  cartographie (UC-CAR-04).

## Garanties en cas de succès

- Une seule garantie tient par cartographie : `{par, date, revisionId}`, où
  `par` est le nom affiché du cartographe **au moment de la signature** et
  `revisionId` (ou `null` = document d'origine) désigne la version garantie.
- L'audit `garantie_posee {cartographieId, revisionId}` est écrit (ids
  seulement).
- La file (badge « Garantie par X ») et la relecture (« Cartographie garantie
  par X le JJ/MM/AAAA (révision N figée). ») affichent la garantie ; le lien
  de partage employeur sert le document figé avec la mention (UC-EMP-01 A1).
- Au retrait : garantie supprimée, audit `garantie_retiree {cartographieId,
  cause: "retrait"}`, le lien employeur sert de nouveau le document de base
  sans mention (UC-EMP-01 A2).

## Garanties minimales (en cas d'échec)

- Aucune signature n'est posée, remplacée ou retirée ; la signature d'un
  autre cartographe n'est jamais écrasée en silence.
- Un refus d'accès ne révèle pas l'existence de la cartographie.

## Scénario nominal

1. Dans la section « Garantie », le cartographe clique sur « Valider et
   garantir ». Un encadré rappelle : « Vous allez garantir cette cartographie
   en votre nom (<nom>), avec signature horodatée. » et précise la version
   figée — la révision affichée, sinon la plus récente de l'historique (date
   `createdAt` la plus récente, quel que soit l'ordre reçu)
   (« La révision N sera figée : c'est elle que verra l'employeur via le lien
   de partage. »), sinon « Le document d'origine sera présenté comme garanti
   via le lien de partage. ».
2. Il clique sur « Confirmer et garantir ».
3. Le navigateur envoie `POST /api/cartographies/{id}/garantie` avec `{}`
   (document d'origine) ou `{revisionId}` (session + `X-CSRF-Token`).
4. Le middleware CSRF global vérifie le jeton (E6), puis la route vérifie le
   rôle `cartographe` (`RequireRole`), l'accès **au niveau
   cartographe** (`Links::access` : lié, visibilité ouverte — jamais le
   propriétaire), l'appartenance de la révision à la cartographie
   (`Revisions::belongsTo`), relit le nom affiché du signataire puis
   `Garanties::pose` : transaction avec verrou sur la garantie existante
   (`SELECT … FOR UPDATE`), refus si un autre cartographe a signé,
   remplacement si c'est le même ; entre deux **premières** signatures
   simultanées, c'est la contrainte `UNIQUE` qui tranche (voir AN16).
5. Le serveur journalise `garantie_posee` et répond `201 {par, date,
   revisionId}`.
6. Le site referme l'encadré et affiche la mention figée ; le bouton devient
   « Retirer ma garantie ».

## Scénarios alternatifs

- **A1 — Figer une révision** (étapes 1 et 3) : avec un historique, la
  révision affichée (« Voir ») ou, à défaut, la plus récente est figée
  (`{revisionId}`) ; la mention précise « (révision N figée) ».
- **A2 — Re-garantir** (étape 4) : le même cartographe re-signe, par exemple
  sur une révision plus récente : sa garantie est **remplacée** (une seule
  ligne, nouvel horodatage, nom affiché courant), nouvel audit. Hors IHM : le
  site n'offre que « Retirer ma garantie » quand une garantie tient ;
  re-signer y passe par un retrait puis une nouvelle signature, soit deux
  audits (`garantie_retiree` puis `garantie_posee`).
- **A3 — Annuler** (étape 2) : « Annuler » referme l'encadré, rien n'est
  envoyé.
- **A4 — Retirer sa garantie** : « Retirer ma garantie » →
  `DELETE /api/cartographies/{id}/garantie` → `Garanties::withdraw` (le
  signataire seul) → `204`, audit `garantie_retiree` (cause `retrait`) ; le
  site revient à « Cartographie non garantie ». Le retrait reste possible
  **par l'API** même si l'apprenant a entre-temps repassé la cartographie en
  privée ; le site, lui, n'y donne plus accès (la relecture répond `404` et
  la section « Garantie » n'est pas rendue), alors que le lien employeur
  continue de présenter la garantie (voir AN15).
- **A5 — Nouvelle révision** : poster une révision retire automatiquement la
  garantie en place (UC-CAR-04 A2, cause `nouvelle_revision`).

## Scénarios d'erreur

- **E1 — Le propriétaire tente de garantir** (étape 4) : sans le rôle
  cartographe → `403 {error: "Rôle insuffisant"}` ; avec le rôle → `404`
  (niveau d'accès « propriétaire ») : on ne garantit jamais sa propre
  cartographie.
- **E2 — Cartographie inaccessible** (étape 4) : cartographe non lié,
  visibilité `privee`, id inconnu → même `404 {error: "Cartographie
  introuvable"}` ; le site affiche le message.
- **E3 — Déjà garantie par un autre cartographe** (étape 4) : `409 {error:
  "Cartographie déjà garantie par un autre cartographe"}` ; la signature en
  place est intacte ; le site affiche le message, l'encadré reste ouvert.
- **E4 — Révision invalide** (étape 4) : `revisionId` d'une autre
  cartographie, inexistant ou non entier (chaîne, décimal) → `422 {fields:
  {revisionId: "Révision inconnue pour cette cartographie"}}` (hors IHM, qui
  n'envoie que des ids de l'historique).
- **E5 — Retrait refusé** (A4) : garantie d'un autre cartographe, ou aucune
  garantie → `404 {error: "Garantie introuvable"}` ; le site affiche le
  message (voir AN5). Sans le rôle `cartographe` → `403 {error: "Rôle
  insuffisant"}` (propriétaire), y compris pour un signataire dont le rôle a
  été retiré : sa garantie reste servie à son nom sans qu'il puisse la
  retirer.
- **E6 — Jeton CSRF absent** (étapes 3 et A4) : `403`, rien ne change.

## Règles de gestion

- **RG1** — Garde-fou humain (§8) : la garantie n'est jamais automatique ;
  seul un cartographe **lié** la pose, jamais le propriétaire.
- **RG2** — Une garantie par cartographie ; la signature d'un autre ne
  s'écrase pas (409) ; le même signataire remplace la sienne.
- **RG3** — État figé : `par` est le nom au moment de la signature (renommer
  son compte ne réécrit pas les garanties passées) ; `revisionId` fixe la
  version présentée à l'employeur.
- **RG4** — Le retrait appartient au signataire et ne dépend pas de l'accès
  courant à la cartographie (c'est son nom) — par l'API seulement une fois
  la cartographie privée (AN15) ; il exige en revanche le rôle `cartographe`
  (E5).
- **RG5** — Une cartographie modifiée n'est jamais présentée comme
  garantie : toute nouvelle révision retire la garantie (UC-CAR-04).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Garantie `{par, revisionId, date}` | Signature personnelle : supprimée avec le compte du signataire, avec la cartographie ou avec la révision figée (CASCADE) |
| Pose / retrait | Audits `garantie_posee {cartographieId, revisionId}` et `garantie_retiree {cartographieId, cause: "retrait"}` ou `{cartographieId, cause: "nouvelle_revision", revisionId}` (ids seulement) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/cartographe/RelectureSection.jsx` | Encadré de confirmation, choix de la version figée, mention, retrait, messages |
| Front | `web/src/views/cartographe/cartographe-api.js` — `postGarantie`, `deleteGarantie`, `fetchCartographie` | Appels HTTP ; garantie en place lue dans le détail |
| API | `api/src/Middleware/CsrfMiddleware.php` | CSRF global (E6) |
| API | `api/src/Middleware/RequireRole.php` | 403 « Rôle insuffisant » (E1, E5) |
| API | `POST/DELETE /api/cartographies/{id}/garantie` — `api/src/routes/annotations.php` | Niveau d'accès, révision, conflit, audit |
| API | `GET /api/cartographe/cartographies[/{id}]` — `api/src/routes/cartographe.php`, `Links::queueFor`, `Links::findForCartographe` | Badge de la file, mention de la relecture |
| Domaine | `api/src/Cartographe/Garanties.php` — `pose`, `withdraw`, `findForCartography` | Signature transactionnelle |
| Domaine | `api/src/Cartographe/Revisions.php` — `belongsTo` | Révision de cette cartographie |
| Domaine | `api/src/Cartographe/Links.php` — `access` | Cartographe lié, jamais le propriétaire |
| Domaine | `api/src/Auth/Users.php` — `findById` | Nom affiché relu au moment de la signature (RG3) |
| Domaine | `api/src/Auth/Audit.php` — `record` | `garantie_posee`, `garantie_retiree` |
| Données | `scripts/migrations/008_cartographe_garanties_settings.sql` | Une garantie par cartographie (`UNIQUE`), CASCADE |
| Domaine | `api/src/Cartographe/Garanties.php` — `forShareLink` | Mention côté employeur (tests : UC-EMP-01-U04 à U06) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CAR-05-U01 | `Garanties::pose` | État figé `{par, date, revisionId}`, base puis révision | `api/tests/UseCases/Unit/UcCar05GarantirCartographieTest.php` |
| UC-CAR-05-U02 | `Garanties::pose` | Autre signataire → `null`, signature intacte (RG2) | idem |
| UC-CAR-05-U03 | `Garanties::pose` | Même signataire → remplacement, une ligne, nouvel horodatage | idem |
| UC-CAR-05-U04 | `Garanties::withdraw` | Signataire seul ; sinon `false` (RG4) | idem |
| UC-CAR-05-U05 | `Revisions::belongsTo` | Révision de cette cartographie seulement | idem |
| UC-CAR-05-U06 | `Links::access` | Propriétaire (même cartographe, même lié à lui-même en SQL) = « owner » : la propriété prime sur le lien (RG1) | idem |
| UC-CAR-05-U07 | Contraintes SQL | Garantie supprimée avec la révision figée, le signataire, la cartographie | idem |
| UC-CAR-05-U08 | `postGarantie` | Corps `{}` ou `{revisionId}` | `web/test/usecases/unit/uc-car-05-garantir-cartographie.test.js` |
| UC-CAR-05-U09 | `postGarantie` | Réponse plate renvoyée telle quelle, forme enveloppée tolérée | idem |
| UC-CAR-05-U10 | `postGarantie` | 409 → `ApiError` au message serveur | idem |
| UC-CAR-05-U11 | `deleteGarantie` | DELETE sans corps, 204 → `null`, 404 typé | idem |
| UC-CAR-05-U12 | `Garanties::pose` | Deux premières signatures simultanées (second processus) : une seule passe, l'autre lève une `PDOException` d'interblocage 1213 — jamais le `null` du conflit (AN16, comportement actuel) | `api/tests/UseCases/Unit/UcCar05GarantirCartographieTest.php` |
| UC-CAR-05-U13 | `RelectureSection` (rendu seul) | Version figée par défaut : la révision au `createdAt` le plus récent, en ordre réel de l'API `[7, 6]` comme en ordre non monotone `[6, 8, 7]` ; sans révision, le document d'origine | `web/test/usecases/unit/uc-car-05-garantir-cartographie.test.js` |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-05-F01 | Nominal | API | 201 état figé, audit, relecture et file | `api/tests/UseCases/Functional/UcCar05GarantirCartographieTest.php` |
| UC-CAR-05-F02 | A1 | API | Révision figée, audit avec `revisionId` | idem |
| UC-CAR-05-F03 | A2 | API | Re-signature → remplacement, une ligne, nouvel horodatage, deux audits | idem |
| UC-CAR-05-F04 | A4, RG4, AN15 | API | 204 + audit `retrait` ; après passage en privée : pose refusée, relecture 404, lien employeur toujours garanti, retrait possible par l'API, puis lien sans garantie | idem |
| UC-CAR-05-F05 | RG3 | API | Renommage du compte : `par` inchangé ; nouvelle signature au nom courant | idem |
| UC-CAR-05-F06 | E1 | API | Propriétaire : 403 sans rôle, 404 avec | idem |
| UC-CAR-05-F07 | E2 | API | Non lié, privée, inconnue → corps 404 identiques | idem |
| UC-CAR-05-F08 | E3 | API | 409, signature en place intacte | idem |
| UC-CAR-05-F09 | E4 | API | Révision étrangère, inconnue, chaîne, décimal → 422 ; `null` admis | idem |
| UC-CAR-05-F10 | E5 | API | Retrait sans garantie / par un autre → 404 ; propriétaire → 403 « Rôle insuffisant » ; signataire déchu du rôle cartographe → 403, garantie maintenue | idem |
| UC-CAR-05-F11 | E6 | API | Sans CSRF → 403 (pose et retrait) | idem |
| UC-CAR-05-F12 | Nominal | IHM | `<App/>` : encadré à son nom, POST `{}` + CSRF, mention exacte | `web/test/usecases/functional/uc-car-05-garantir-cartographie.test.jsx` |
| UC-CAR-05-F13 | A1 | IHM | Plus récente figée par défaut (historique dans l'ordre réel de l'API) ; révision affichée figée sinon | idem |
| UC-CAR-05-F14 | A3 | IHM | Annuler : rien d'envoyé | idem |
| UC-CAR-05-F15 | A4 | IHM | Retrait : DELETE + CSRF, retour à « non garantie » | idem |
| UC-CAR-05-F16 | E3 | IHM | 409 : message, encadré ouvert, pas de mention | idem |
| UC-CAR-05-F17 | E2 | IHM | 404 : message | idem |
| UC-CAR-05-F18 | E5, AN5 | IHM | Garantie d'un autre : « Retirer ma garantie » proposé, « Valider et garantir » absent, retrait refusé (comportement actuel) | idem |
| UC-CAR-05-F19 | A4, AN15 | IHM | Cartographie repassée en privée : relecture en 404, ni section « Garantie » ni bouton de retrait (comportement actuel) | idem |

La mention côté employeur (document figé servi, retour à la base après
retrait) est couverte par **UC-EMP-01** : F03, F04 (API), F11 (IHM), U04 à
U06.
Le retrait automatique par une nouvelle révision (A5) est couvert par
**UC-CAR-04** : U02, F02, F18.

### Tests existants liés (non-régression)

- `api/tests/CartographeGarantieTest.php` — pose, révision figée, propriétaire et non lié, conflit, retrait, partage public.
- `api/tests/CartographePurgeTest.php` — garantie purgée avec le compte du cartographe.
- `web/src/views/cartographe/RelectureSection.test.jsx` — « valider et garantir », révision figée.
- `web/e2e/parcours-cartographe.e2e.js` — « valider et garantir » puis constat employeur (navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCar05 --testdox
cd web && npx vitest run test/usecases/unit/uc-car-05 test/usecases/functional/uc-car-05
```

## Anomalies constatées

- **AN5 — « Retirer ma garantie » proposé pour la garantie d'un autre.** La
  vue de relecture reçoit `{par, date, revisionId}` sans l'identité du
  signataire : dès qu'une garantie existe, elle propose « Retirer ma
  garantie », y compris à un cartographe qui n'en est pas l'auteur ; l'API
  refuse (`404 « Garantie introuvable »`), et ce second cartographe n'a pas
  non plus « Valider et garantir » (qui aurait répondu 409). Figé par
  UC-CAR-05-F18.
- **AN15 — Garantie impossible à retirer depuis le site après passage en
  privée, mais toujours servie à l'employeur.** Le seul appel de retrait est
  le bouton de la section « Garantie » de la relecture. Pour une cartographie
  repassée en `privee`, `GET /api/cartographe/cartographies/{id}` répond
  `404` (`Links::findForCartographe` filtre la visibilité) : la relecture
  n'affiche que l'erreur, sans section « Garantie », et la file exclut la
  cartographie. Le lien de partage, lui, ne dépend pas de la visibilité :
  `POST /api/share/{token}` continue de présenter « garantie par <nom> ». Le
  signataire ne peut retirer son nom que par l'API. Figé par UC-CAR-05-F04
  (API) et F19 (IHM).
- **AN16 — Deux premières signatures simultanées : 500 au lieu de 409.** Sur
  une cartographie sans garantie, `SELECT … FOR UPDATE` ne pose qu'un verrou
  d'intervalle, compatible entre transactions : les deux signataires passent
  le contrôle puis leurs `INSERT` s'interbloquent (erreur MySQL 1213) ou
  heurtent la contrainte `UNIQUE`. Le perdant reçoit `500 « Erreur interne »`
  (le `$wrap` convertit la `PDOException`) au lieu du `409` documenté ; la
  signature gagnante reste intacte et rien n'est écrasé (garantie minimale
  respectée). Figé par UC-CAR-05-U12.
- **Écart avec la formation** (chapitre 5 §6) : le texte promet que « la
  chaîne des garanties reste relisable ». Seule la garantie en cours est
  conservée : re-signer ou retirer supprime la ligne (A2 : une seule ligne) ;
  il ne reste que des événements d'audit (identifiants seulement), qu'aucun
  écran ni aucune route ne relit. L'historique des **révisions**, lui, est
  bien conservé. Correction du texte de formation hors périmètre de cette
  fiche.
- Voir aussi **UC-CAR-04 AN4** : après une nouvelle révision, la mention de
  garantie reste affichée jusqu'au rechargement.
