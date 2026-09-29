# UC-CAR-04 — Corriger une cartographie (révision)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe lié à l'apprenant (UC-CAR-01) |
| **Acteurs secondaires** | Apprenant propriétaire (peut aussi réviser, par l'API) ; employeur (ne voit plus de garantie sur un document modifié, UC-EMP-01) |
| **Portée** | humanome.xyz — relecture `#/cartographe/relecture/<id>` ; API `/api/cartographies/{id}/revisions`, `/api/revisions/{revisionId}` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.3 (« relire, commenter, corriger »), §8 (garde-fou humain, jamais une cartographie modifiée présentée comme garantie) ; `docs/autorisations.md` §P9 ; formation cartographe, chapitre 5 §2-3 |
| **Statut** | Implémenté (P9, contrat M7) — voir « Anomalies constatées » |

## Objectif

Permettre au cartographe de rectifier les verdicts faux d'une cartographie
de journée par des **champs contrôlés** (statut, confiance, motif,
prescription) et d'enregistrer le résultat comme une **révision** : une
nouvelle version complète du document, validée au schéma, datée, signée et
conservée dans un historique — le document d'origine du moteur n'est jamais
écrasé.

## Déclencheur

Dans la relecture d'une cartographie de journée, le cartographe choisit une
compétence et modifie son verdict dans « Corriger le verdict ».

## Préconditions

- Le cartographe est lié à l'apprenant et la cartographie est en visibilité
  `cartographe`/`publique` (ou l'acteur est le propriétaire).
- La cartographie est de type `jour` pour la correction depuis l'IHM (A6).

## Garanties en cas de succès

- Une révision `{document, note, auteur, date}` est ajoutée à l'historique ;
  le document de base reste celui du moteur.
- Le document stocké est **conforme** au schéma `cartographie-<type>` de la
  cartographie (même type).
- Si une garantie était en place, elle est **retirée** dans la même
  transaction et l'audit `garantie_retiree {cartographieId, cause:
  "nouvelle_revision", revisionId}` est écrit.

## Garanties minimales (en cas d'échec)

- Rien n'est stocké ; les corrections en attente restent à l'écran — sauf si
  seul le rechargement de l'historique échoue après un envoi réussi : la
  révision est alors stockée (et une garantie éventuelle retirée) alors que
  l'écran affiche une erreur (voir AN12).
- Un document non conforme n'entre jamais dans l'historique (validation
  engine avant envoi, puis validation serveur).

## Scénario nominal

1. Compétence choisie sur une journée, l'éditeur « Corriger le verdict » est
   pré-rempli depuis le document affiché : statut, confiance, motif (à défaut
   la `raison` du court-circuit), prescription (à défaut la
   `prescriptionMinimale`).
2. Le cartographe ajuste « Statut » (présence établie / présence non établie
   / renvoi au cartographe), « Confiance (0 à 1) », « Motif », « Prescription »
   et clique sur « Enregistrer la correction pour <code> » : la correction
   rejoint la liste « Proposer une révision » (« <code> → statut (confiance
   N %) », bouton « Retirer »).
3. Il répète pour d'autres compétences, rédige la « Note de révision » et
   clique sur « Proposer la révision » (bouton inactif tant qu'aucune
   correction n'est en attente).
4. Le site construit le document révisé (`buildRevision` : copie profonde,
   verdicts corrigés, compteurs `auditPole` recalculés) puis le valide avec
   l'engine (`validateDocument('cartographie-jour')`).
5. Le navigateur envoie `POST /api/cartographies/{id}/revisions`
   `{document, note}` (session + `X-CSRF-Token`).
6. Le middleware CSRF global vérifie le jeton (E6), puis la route vérifie le
   rôle (`RequireRole::any('apprenant', 'cartographe')`, E7), l'accès
   (`Links::access`), la forme (document objet non vide ≤ 8 Mo ; note absente
   ou 1 à 500 caractères), puis la conformité au schéma
   `cartographie-<type de la cartographie>` (`Validation::validate`) ;
   `Revisions::create` stocke la révision et retire une garantie éventuelle ;
   réponse `201 {revisionId}`.
7. Le site recharge l'historique (`GET /api/cartographies/{id}/revisions`,
   métadonnées seulement), vide corrections et note, bascule l'affichage sur
   la nouvelle révision (« Vous consultez la révision N. ») et affiche
   « Révision enregistrée : elle apparaît dans l'historique ci-dessous. ».

## Scénarios alternatifs

- **A1 — Consulter une révision** (à tout moment) : « Voir » dans
  « Historique des révisions » → `GET /api/revisions/{revisionId}` (document
  complet ; l'accès suit la cartographie parente) ; « Revenir au document
  d'origine » rétablit la base. « Voir » vide sans avertissement les
  corrections en attente, « Revenir » les conserve (voir AN13). Si le document
  de la révision ne peut être lu (`404 « Révision introuvable »`, ou réponse
  sans document : « La révision ne contient pas de document. »), le message
  s'affiche dans la section de l'historique et l'affichage ne change pas.
- **A2 — Cartographie garantie** (étape 6) : la nouvelle révision retire la
  garantie en place (audit `garantie_retiree`, cause `nouvelle_revision`) ;
  le lien de partage employeur ne présente plus de garantie et sert de
  nouveau le document de base (même effet que le retrait manuel de
  UC-EMP-01 A2, ici par une nouvelle révision — UC-CAR-04-F02).
- **A3 — Révision par le propriétaire** (étape 6) : l'apprenant peut poster
  une révision de sa propre cartographie (par l'API) ; la note est
  facultative (absente ou `null` → `null`).
- **A4 — Retirer une correction en attente** (étape 2) : « Retirer » la
  supprime de la liste ; elle n'entre pas dans la révision.
- **A5 — Corriger une révision** (étapes 1 et 4) : quand une révision est
  affichée, l'éditeur et `buildRevision` partent de **ce** document, pas de
  la base : la nouvelle révision hérite des changements de la révision
  affichée. C'est le document affiché **au moment de l'envoi** qui compte
  (voir AN13).
- **A6 — Parcours (merge)** (étape 1) : l'IHM ne propose ni éditeur de
  verdict ni section « Proposer une révision » ; l'API accepte une révision
  merge conforme au schéma `cartographie-merge` (voir AN3).

## Scénarios d'erreur

- **E1 — Aucune correction en attente** (étape 3) : bouton désactivé (garde
  défensive, si le formulaire est soumis quand même : « Aucune correction en
  attente : corrigez au moins un verdict. », aucune requête).
- **E2 — Document révisé non conforme** (étape 4) : « Le document révisé ne
  respecte pas le schéma : révision non envoyée. » et jusqu'à 5 erreurs
  (`chemin — message`) ; aucune requête.
- **E3 — Correction invalide** (étape 4) : confiance hors `0..1` → message de
  `buildRevision` (« Confiance hors bornes (0..1) pour 1.03 »), aucune
  requête. `buildRevision` refuse aussi une confiance non numérique, un
  statut inconnu, un code absent du document ou un document qui n'est pas
  une journée, mais ces cas sont inatteignables depuis l'IHM (champ numérique,
  liste déroulante des statuts, codes du document, éditeur réservé aux
  journées) ; un champ « Confiance » vidé vaut `0` sans message (AN14).
- **E4 — Refus de validation serveur** (étape 6) : forme invalide → `422
  {error: "Validation échouée", fields: {document | note}}` ; document non
  conforme ou d'un autre type que la cartographie → `422 {error: "Document
  invalide au schéma cartographie-<type>", fields: {<pointeur JSON>: […]}}` ;
  le site affiche le message, les corrections restent en attente.
- **E5 — Accès refusé** (étapes 6 et A1) : apprenant étranger, cartographe
  non lié, cartographie repassée en `privee`, id inconnu → `404
  {error: "Cartographie introuvable"}` (POST, historique) ou `404 {error:
  "Révision introuvable"}` (document d'une révision) ; en privée, le
  propriétaire garde tout l'historique.
- **E6 — Jeton CSRF absent ou invalide** (étape 5) : `403 {error: "Jeton
  CSRF absent ou invalide"}`, rien n'est stocké.
- **E7 — Pas de session ou rôle insuffisant** (étapes 6 et A1) : sans
  session → `401 {error: "Authentification requise"}` ; session sans rôle
  `apprenant` ni `cartographe` (compte seulement promptologue, par exemple)
  → `403 {error: "Rôle insuffisant"}` ; rien n'est stocké. Un cartographe lié
  qui a perdu le rôle `cartographe` mais garde `apprenant` passe la garde de
  rôle puis reçoit le `404` de E5 (`Links::access` exige le rôle).

## Règles de gestion

- **RG1** — Rien ne s'écrase : le document de base n'est jamais modifié ;
  chaque révision est un document complet, daté, attribué, avec sa note.
- **RG2** — Double validation : engine côté navigateur avant envoi, schéma
  serveur ensuite ; le type de la révision est celui de la cartographie (le
  `kind` du schéma l'épingle).
- **RG3** — Une nouvelle révision retire la garantie en place, dans la même
  transaction (§8) : une cartographie modifiée n'est jamais présentée comme
  garantie.
- **RG4** — Seule la cartographie de journée se corrige par verdict ; les
  trois statuts admis sont ceux du schéma ; la confiance est bornée à `0..1`.
- **RG5** — `auditPole` est recalculé depuis les verdicts de chaque pôle
  (présences établies, non établies, renvois) ; un motif ou une prescription
  laissés vides ne remplacent pas la valeur existante.
- **RG6** — L'historique ne transporte que des métadonnées ; le document
  d'une révision se lit un par un, sous le même contrôle d'accès que la
  cartographie.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Révision (document corrigé) | Donnée de l'**apprenant** : supprimée avec la cartographie (CASCADE), conservée **anonymisée** à la purge de son auteur (`author_id` SET NULL) |
| Note de révision | ≤ 500 caractères, jamais journalisée |
| Retrait de garantie | Audit `garantie_retiree {cartographieId, cause, revisionId}` (ids seulement) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/cartographe/RelectureSection.jsx` | Éditeur de verdict, corrections en attente, envoi, historique, bascule sur une révision |
| Front | `web/src/views/cartographe/revision.js` — `VERDICT_STATUTS`, `verdictFields`, `buildRevision` | Construction pure du document révisé |
| Moteur | `engine/src/validation.js` — `validateDocument` | Validation avant envoi |
| Front | `web/src/views/cartographe/cartographe-api.js` — `postRevision`, `fetchRevisions`, `fetchRevisionDocument` | Appels HTTP |
| API | `api/src/Middleware/CsrfMiddleware.php` | CSRF global (E6) |
| API | `api/src/Middleware/RequireRole.php` | 401 sans session, 403 sans rôle `apprenant`/`cartographe` (E7) |
| API | `POST/GET /api/cartographies/{id}/revisions`, `GET /api/revisions/{revisionId}` — `api/src/routes/annotations.php` | Forme, schéma, audit, 404 homogène |
| Domaine | `api/src/Cartographe/Revisions.php` — `create`, `listForCartography`, `find` | Historique, retrait transactionnel de la garantie |
| Domaine | `api/src/Validation.php` — `validate` | Schéma serveur par type |
| Domaine | `api/src/Cartographe/Links.php` — `access` | Propriétaire ou cartographe lié |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CAR-04-U01 | `Revisions::create` | Document, note, auteur stockés ; base intacte (RG1) | `api/tests/UseCases/Unit/UcCar04CorrigerCartographieTest.php` |
| UC-CAR-04-U02 | `Revisions::create` | Garantie retirée dans la transaction ; `garantieRemoved` (RG3) | idem |
| UC-CAR-04-U03 | `Revisions::listForCartography` | Récentes d'abord, méta seulement ; auteur purgé → anonyme, révision conservée | idem |
| UC-CAR-04-U04 | `Revisions::find` | Document + cartographie parente ; inconnue → `null` | idem |
| UC-CAR-04-U05 | `Validation::validate` | Conforme / non conforme (pointeurs) / type épinglé : un merge réel dont seul `kind` change est refusé sur le seul pointeur `/kind` (RG2) | idem |
| UC-CAR-04-U06 | `Validation::validate` | Type `twin9` non supporté → exception (cause AN1) | idem |
| UC-CAR-04-U07 | `Validation::validate` | Merge décodé en tableaux : `{}` → `[]` refusé (cause AN3) | idem |
| UC-CAR-04-U08 | `VERDICT_STATUTS` | Figé, identique à l'énumération du schéma (RG4) | `web/test/usecases/unit/uc-car-04-corriger-cartographie.test.js` |
| UC-CAR-04-U09 | `verdictFields` | Valeurs, replis `raison`/`prescriptionMinimale`, défauts, code inconnu | idem |
| UC-CAR-04-U10 | `buildRevision` | Deux pôles, `Map`, nettoyage, champs vides sans effet, audits recalculés, entrée intacte, conforme (RG5) | idem |
| UC-CAR-04-U11 | `buildRevision` | Verdict absent → verdict minimal ; confiance non numérique, statut inconnu, code absent, document non journée refusés (messages exacts) | idem |
| UC-CAR-04-U12 | `validateDocument` | Conforme ; erreurs avec chemin ; type inconnu → exception | idem |
| UC-CAR-04-U13 | `postRevision`, `fetchRevisions`, `fetchRevisionDocument` | URLs, corps, extraction du document | idem |
| UC-CAR-04-U14 | Contraintes SQL | Révisions supprimées avec leur cartographie (CASCADE) | `api/tests/UseCases/Unit/UcCar04CorrigerCartographieTest.php` |
| UC-CAR-04-U15 | `buildRevision` | Confiance `''`, `null` ou blanche → `0` sans erreur (AN14, comportement actuel) | `web/test/usecases/unit/uc-car-04-corriger-cartographie.test.js` |

`Links::access` (propriétaire ou cartographe lié) est testé unitairement par
UC-CAR-03-U04.

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-04-F01 | Nominal | API | 201, note nettoyée, historique méta et document lus par les deux, base intacte, compteur, pas d'audit | `api/tests/UseCases/Functional/UcCar04CorrigerCartographieTest.php` |
| UC-CAR-04-F02 | A2 | API | Garantie retirée (détail, file et lien de partage employeur : `garantie` null, document de base), audit `garantie_retiree` complet | idem |
| UC-CAR-04-F03 | A3 | API | Propriétaire, note absente ou `null` → `null` | idem |
| UC-CAR-04-F04 | E4 (forme) | API | Document absent/texte/liste/vide ou de plus de 8 Mo, note de 501 ou non textuelle → 422 ; 500 admis | idem |
| UC-CAR-04-F05 | E4 (schéma), A6 | API | Non conforme (pointeurs), type différent → 422 ; merge conforme → 201 | idem |
| UC-CAR-04-F06 | E5 | API | 404 écriture/historique/document ; privée : le propriétaire lit le document et l'historique et révise encore (201) | idem |
| UC-CAR-04-F07 | AN2 | API | Note `""` ou blanche → 422 (comportement actuel) | idem |
| UC-CAR-04-F08 | AN1 | API | Révision d'une cartographie `twin9` (accès vérifié par l'historique, 200) → 500 (comportement actuel) | idem |
| UC-CAR-04-F09 | E6 | API | Sans jeton ou jeton faux → 403 « Jeton CSRF absent ou invalide », rien de stocké | idem |
| UC-CAR-04-F10 | AN3 | API | Merge réel (`reserved.piecesData: {}`) → 422 `/reserved/piecesData` (comportement actuel) | idem |
| UC-CAR-04-F11 | Nominal, A4, E1 | IHM | `<App/>` : pré-remplissage, envoi désactivé sans correction et garde défensive (message exact, aucun POST), deux corrections dont une retirée, document envoyé conforme, CSRF, historique, bascule | `web/test/usecases/functional/uc-car-04-corriger-cartographie.test.jsx` |
| UC-CAR-04-F12 | A1, A5 | IHM | « Voir » une révision, éditeur parti de la révision, retour à l'origine | idem |
| UC-CAR-04-F13 | E3 | IHM | Confiance 2 → message, aucune requête | idem |
| UC-CAR-04-F14 | E2 | IHM | Base abîmée (7 erreurs) : 5 erreurs de schéma listées, aucun envoi | idem |
| UC-CAR-04-F15 | E4, E5 | IHM | 422 puis 404 : messages, corrections conservées après chacun | idem |
| UC-CAR-04-F16 | A6 | IHM | Merge : ni éditeur ni section de révision, historique présent | idem |
| UC-CAR-04-F17 | AN2 | IHM | Note vide envoyée `""` → « Validation échouée » (comportement actuel) | idem |
| UC-CAR-04-F18 | AN4 | IHM | Mention de garantie périmée après révision ; retrait → « Garantie introuvable » (comportement actuel) | idem |
| UC-CAR-04-F19 | E7 | API | Sans session → 401, compte promptologue → 403 « Rôle insuffisant » (POST, historique, document) ; cartographe lié réduit au rôle apprenant → 404 ; rien de stocké | `api/tests/UseCases/Functional/UcCar04CorrigerCartographieTest.php` |
| UC-CAR-04-F20 | A5 | IHM | Révision proposée depuis la révision 20 affichée : le document envoyé garde 1.03 « présence établie » (hérité), porte la correction de 2.01, `auditPole` recalculé depuis la révision | `web/test/usecases/functional/uc-car-04-corriger-cartographie.test.jsx` |
| UC-CAR-04-F21 | AN12 | IHM | POST 201 puis historique en 500 : alerte, corrections gardées, pas de bascule ; un nouvel essai reposte (comportement actuel) | idem |
| UC-CAR-04-F22 | AN13 | IHM | « Voir » efface une correction en attente ; une correction saisie sur la révision puis « Revenir » s'applique à la base (comportement actuel) | idem |
| UC-CAR-04-F23 | A1, E5 | IHM | « Voir » en 404 : « Révision introuvable » dans l'historique, affichage inchangé | idem |

### Tests existants liés (non-régression)

- `api/tests/CartographeRevisionsTest.php` — révision valide, propriétaire, 422 schéma et type, matrice 404, retrait de garantie.
- `api/tests/CartographePurgeTest.php` — révision anonymisée à la purge du cartographe.
- `web/src/views/cartographe/revision.test.js` — `listCompetences`, `verdictFields`, `buildRevision`.
- `web/src/views/cartographe/RelectureSection.test.jsx` — « correction et révision » (forme enveloppée).
- `web/e2e/parcours-cartographe.e2e.js` — étape « correction du verdict → révision validée au schéma ».

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCar04 --testdox
cd web && npx vitest run test/usecases/unit/uc-car-04 test/usecases/functional/uc-car-04
```

## Anomalies constatées

- **AN1 — Révision d'une cartographie `twin9` : erreur 500.** Le type `twin9`
  est admis au stockage (`POST /api/cartographies`) et `Links::access` le
  renvoie tel quel ; la route valide alors contre `cartographie-twin9`, que
  `Validation::validate` ne connaît pas : l'`InvalidArgumentException` n'est
  pas interceptée (le `$wrap` ne capture que `PDOException`) → `500` au lieu
  d'un refus explicite (`422`). Figé par UC-CAR-04-F08 et U06.
- **AN2 — Révision sans note impossible depuis l'IHM.** `RelectureSection`
  envoie toujours `note: note.trim()`, donc `""` quand le champ est laissé
  vide ; la route refuse toute note chaîne vide (`422 {error: "Validation
  échouée", fields: {note: "Note invalide (500 caractères maximum)"}}`), et
  l'écran n'affiche que « Validation échouée ». La note est pourtant
  facultative côté API (absente ou `null`). Figé par UC-CAR-04-F07 et F17.
- **AN3 — Révision d'un parcours (merge) réel refusée.** Le corps JSON est
  décodé en tableaux associatifs : l'objet vide `reserved.piecesData: {}`
  (présent dans tout le corpus merge, fixture comprise) devient `[]` et le
  schéma exige un objet → `422` sur `/reserved/piecesData`. Seul un merge
  sans objet vide passe. L'IHM ne propose pas la correction de merge, mais
  l'API le permet en principe (A6). Figé par UC-CAR-04-F10 et U07. Le même
  mécanisme pourrait toucher d'autres appelants de `Validation::validate`
  recevant un corps décodé (non vérifié, hors périmètre).
- **AN4 — Mention de garantie périmée après une révision.** Après l'envoi
  d'une révision, `RelectureSection` recharge l'historique mais pas la
  garantie : la mention « Cartographie garantie par … » et le bouton
  « Retirer ma garantie » restent affichés alors que le serveur a retiré la
  garantie (RG3) ; cliquer répond « Garantie introuvable ». Un rechargement
  de la page rétablit l'état exact. Figé par UC-CAR-04-F18.
- **AN12 — Historique non rechargé après un envoi réussi : doublon au nouvel
  essai.** `submitRevision` enchaîne `postRevision` puis `fetchRevisions`
  dans le même `try` : si le POST réussit (`201`, révision stockée, garantie
  éventuelle déjà retirée) mais que le rechargement de l'historique échoue,
  l'écran affiche l'erreur, garde corrections et note et ne bascule pas sur
  la révision ; un nouvel envoi crée une seconde révision identique.
  Contredit la garantie minimale « rien n'est stocké ». Figé par
  UC-CAR-04-F21.
- **AN13 — « Voir » et « Revenir » traitent les corrections en attente de
  façon asymétrique.** « Voir » une révision vide sans avertissement les
  corrections en attente (`setCorrections({})`), « Revenir au document
  d'origine » les conserve. Des corrections saisies sur une révision R puis
  envoyées après « Revenir » sont appliquées par `buildRevision` au document
  de **base** : la nouvelle révision perd silencieusement les changements de
  R. Figé par UC-CAR-04-F22.
- **AN14 — Champ « Confiance » vidé enregistré à 0 %.** `buildRevision`
  convertit la confiance par `Number()` : `''`, `' '`, `null`, `[]` donnent
  `0` (et `true` donne `1`) sans erreur. Dans l'IHM, le champ numérique vidé
  produit `Number('') = 0` : la correction part avec une confiance de 0 %
  sans que le cartographe l'ait saisie. Figé par UC-CAR-04-U15.
