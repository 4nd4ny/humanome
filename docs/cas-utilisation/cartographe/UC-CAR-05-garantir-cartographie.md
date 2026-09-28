# UC-CAR-05 — Garantir une cartographie ou retirer sa garantie

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe lié à l'apprenant (UC-CAR-01) |
| **Acteurs secondaires** | Apprenant propriétaire (ne peut jamais garantir sa propre cartographie) ; employeur (voit la mention « garantie par », UC-EMP-01) ; autre cartographe lié (conflit de signature) |
| **Portée** | humanome.xyz — section « Garantie » de `#/cartographe/relecture/<id>` ; API `POST/DELETE /api/cartographies/{id}/garantie` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §2 (le cartographe « garantit »), §3.3 (« valider/garantir une cartographie avant partage à un employeur »), §8 (garde-fou humain obligatoire, jamais 100 % automatisé) ; `docs/autorisations.md` §P9 ; formation cartographe, chapitre 5 §4-6 |
| **Statut** | Implémenté (P9, contrat M7) |

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
   figée — la révision affichée, sinon la plus récente de l'historique
   (« La révision N sera figée : c'est elle que verra l'employeur via le lien
   de partage. »), sinon « Le document d'origine sera présenté comme garanti
   via le lien de partage. ».
2. Il clique sur « Confirmer et garantir ».
3. Le navigateur envoie `POST /api/cartographies/{id}/garantie` avec `{}`
   (document d'origine) ou `{revisionId}` (session + `X-CSRF-Token`).
4. Le serveur vérifie le rôle `cartographe`, l'accès **au niveau
   cartographe** (`Links::access` : lié, visibilité ouverte — jamais le
   propriétaire), l'appartenance de la révision à la cartographie
   (`Revisions::belongsTo`), relit le nom affiché du signataire puis
   `Garanties::pose` : transaction avec verrou, refus si un autre
   cartographe a signé, remplacement si c'est le même.
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
  ligne, nouvel horodatage, nom affiché courant), nouvel audit.
- **A3 — Annuler** (étape 2) : « Annuler » referme l'encadré, rien n'est
  envoyé.
- **A4 — Retirer sa garantie** : « Retirer ma garantie » →
  `DELETE /api/cartographies/{id}/garantie` → `Garanties::withdraw` (le
  signataire seul) → `204`, audit `garantie_retiree` (cause `retrait`) ; le
  site revient à « Cartographie non garantie ». Le retrait reste possible même
  si l'apprenant a entre-temps repassé la cartographie en privée.
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
  message (voir AN5).
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
  courant à la cartographie (c'est son nom).
- **RG5** — Une cartographie modifiée n'est jamais présentée comme
  garantie : toute nouvelle révision retire la garantie (UC-CAR-04).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Garantie `{par, revisionId, date}` | Signature personnelle : supprimée avec le compte du signataire, avec la cartographie ou avec la révision figée (CASCADE) |
| Pose / retrait | Audits `garantie_posee {cartographieId, revisionId}` et `garantie_retiree {cartographieId, cause}` (ids seulement) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/cartographe/RelectureSection.jsx` | Encadré de confirmation, choix de la version figée, mention, retrait, messages |
| Front | `web/src/views/cartographe/cartographe-api.js` — `postGarantie`, `deleteGarantie` | Appels HTTP |
| API | `POST/DELETE /api/cartographies/{id}/garantie` — `api/src/routes/annotations.php` | Niveau d'accès, révision, conflit, audit |
| Domaine | `api/src/Cartographe/Garanties.php` — `pose`, `withdraw`, `findForCartography` | Signature transactionnelle |
| Domaine | `api/src/Cartographe/Revisions.php` — `belongsTo` | Révision de cette cartographie |
| Domaine | `api/src/Cartographe/Links.php` — `access` | Cartographe lié, jamais le propriétaire |
| Domaine | `api/src/Cartographe/Garanties.php` — `forShareLink` | Mention côté employeur (tests : UC-EMP-01-U04 à U06) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CAR-05-U01 | `Garanties::pose` | État figé `{par, date, revisionId}`, base puis révision | `api/tests/UseCases/Unit/UcCar05GarantirCartographieTest.php` |
| UC-CAR-05-U02 | `Garanties::pose` | Autre signataire → `null`, signature intacte (RG2) | idem |
| UC-CAR-05-U03 | `Garanties::pose` | Même signataire → remplacement, une ligne | idem |
| UC-CAR-05-U04 | `Garanties::withdraw` | Signataire seul ; sinon `false` (RG4) | idem |
| UC-CAR-05-U05 | `Revisions::belongsTo` | Révision de cette cartographie seulement | idem |
| UC-CAR-05-U06 | `Links::access` | Propriétaire (même cartographe) = « owner » (RG1) | idem |
| UC-CAR-05-U07 | Contraintes SQL | Garantie supprimée avec la révision figée, le signataire, la cartographie | idem |
| UC-CAR-05-U08 | `postGarantie` | Corps `{}` ou `{revisionId}` | `web/test/usecases/unit/uc-car-05-garantir-cartographie.test.js` |
| UC-CAR-05-U09 | `postGarantie` | Réponse plate renvoyée telle quelle, forme enveloppée tolérée | idem |
| UC-CAR-05-U10 | `postGarantie` | 409 → `ApiError` au message serveur | idem |
| UC-CAR-05-U11 | `deleteGarantie` | DELETE sans corps, 204 → `null`, 404 typé | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-05-F01 | Nominal | API | 201 état figé, audit, relecture et file | `api/tests/UseCases/Functional/UcCar05GarantirCartographieTest.php` |
| UC-CAR-05-F02 | A1 | API | Révision figée, audit avec `revisionId` | idem |
| UC-CAR-05-F03 | A2 | API | Re-signature → remplacement, une ligne, deux audits | idem |
| UC-CAR-05-F04 | A4, RG4 | API | 204 + audit `retrait` ; retrait possible après passage en privée (pose refusée) | idem |
| UC-CAR-05-F05 | RG3 | API | Renommage du compte : `par` inchangé ; nouvelle signature au nom courant | idem |
| UC-CAR-05-F06 | E1 | API | Propriétaire : 403 sans rôle, 404 avec | idem |
| UC-CAR-05-F07 | E2 | API | Non lié, privée, inconnue → corps 404 identiques | idem |
| UC-CAR-05-F08 | E3 | API | 409, signature en place intacte | idem |
| UC-CAR-05-F09 | E4 | API | Révision étrangère, inconnue, chaîne, décimal → 422 ; `null` admis | idem |
| UC-CAR-05-F10 | E5 | API | Retrait sans garantie / par un autre → 404 ; propriétaire → 403 | idem |
| UC-CAR-05-F11 | E6 | API | Sans CSRF → 403 (pose et retrait) | idem |
| UC-CAR-05-F12 | Nominal | IHM | `<App/>` : encadré à son nom, POST `{}` + CSRF, mention exacte | `web/test/usecases/functional/uc-car-05-garantir-cartographie.test.jsx` |
| UC-CAR-05-F13 | A1 | IHM | Plus récente figée par défaut ; révision affichée figée sinon | idem |
| UC-CAR-05-F14 | A3 | IHM | Annuler : rien d'envoyé | idem |
| UC-CAR-05-F15 | A4 | IHM | Retrait : DELETE + CSRF, retour à « non garantie » | idem |
| UC-CAR-05-F16 | E3 | IHM | 409 : message, encadré ouvert, pas de mention | idem |
| UC-CAR-05-F17 | E2 | IHM | 404 : message | idem |
| UC-CAR-05-F18 | E5, AN5 | IHM | Garantie d'un autre : bouton proposé, retrait refusé (comportement actuel) | idem |

La mention côté employeur (document figé servi, retour à la base après
retrait) est couverte par **UC-EMP-01** : F03, F04 (API), F11 (IHM), U05, U06.
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
- Voir aussi **UC-CAR-04 AN4** : après une nouvelle révision, la mention de
  garantie reste affichée jusqu'au rechargement.
