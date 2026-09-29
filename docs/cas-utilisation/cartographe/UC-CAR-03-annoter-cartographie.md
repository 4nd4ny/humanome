# UC-CAR-03 — Annoter une cartographie

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe lié à l'apprenant (UC-CAR-01) |
| **Acteurs secondaires** | Apprenant propriétaire (peut aussi annoter et lire le fil) |
| **Portée** | humanome.xyz — relecture `#/cartographe/relecture/<id>` ; API `/api/cartographies/{id}/annotations`, `/api/annotations/{annotationId}` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.3 (« relire, commenter… détection d'hallucinations, d'oublis »), §8 ; `docs/autorisations.md` §P9 ; formation cartographe, chapitre 5 §1 |
| **Statut** | Implémenté (P9, contrat M7) — voir « Anomalies constatées » |

## Objectif

Permettre au cartographe d'attacher à une compétence d'une cartographie un
**commentaire**, un **signalement d'hallucination** ou un **signalement
d'oubli**, sans modifier le document ; le fil d'annotations, signé et daté,
est partagé avec l'apprenant propriétaire.

## Déclencheur

Dans la relecture d'une cartographie (UC-CAR-02), le cartographe choisit une
compétence dans la liste « Compétence ».

## Préconditions

- Le cartographe est lié à l'apprenant et la cartographie est en visibilité
  `cartographe` ou `publique` — ou l'acteur est le propriétaire.
- La relecture est ouverte (le détail a été chargé, UC-CAR-02).

## Garanties en cas de succès

- L'annotation est enregistrée `{competenceCode, type, texte}` avec son
  auteur et sa date ; elle apparaît dans le fil lu par le cartographe **et**
  par l'apprenant, et dans le compteur de la file.
- Le document de la cartographie n'est pas modifié ; aucune notification
  n'est envoyée, aucun audit n'est écrit (le texte n'entre pas dans le
  journal).

## Garanties minimales (en cas d'échec)

- Rien n'est enregistré ; la saisie reste dans le formulaire — sauf si seul
  le rechargement du fil échoue après un envoi réussi : l'annotation est
  alors enregistrée, le champ vidé et l'erreur du rechargement affichée
  (voir AN11).
- Un refus d'accès ne révèle pas si la cartographie existe.

## Scénario nominal

1. Le cartographe choisit une compétence dans « Compétence » : la liste
   propose les codes instruits dans le document affiché (triés, nommés par le
   référentiel publié, par exemple « 1.01 — Pensée Critique &
   Anti-Hallucination »).
2. Le panneau « Annotations — <code> » affiche le fil de cette compétence
   (type, texte, « — auteur, date heure »), tiré du détail chargé en UC-CAR-02
   (`GET /api/cartographe/cartographies/{id}`, clé `annotations`), et le
   formulaire : « Type »
   (Commentaire / Hallucination signalée / Oubli signalé) et « Annotation ».
3. Il rédige, choisit le type et clique sur « Annoter » ; le site vérifie que
   le texte n'est pas vide (après `trim` JavaScript, qui retire aussi les
   blancs Unicode) puis envoie `POST /api/cartographies/{id}/annotations`
   `{competenceCode, type, texte}` (texte nettoyé des blancs, session +
   `X-CSRF-Token` réémis par `apiFetch`).
4. Le middleware CSRF global vérifie le jeton (E5), puis la route vérifie le
   rôle (`RequireRole::any('apprenant', 'cartographe')`, E6), l'accès
   (`Links::access` : propriétaire, ou cartographe lié avec visibilité
   ouverte), valide les champs puis enregistre (`Annotations::create`) et
   répond `201 {id}`.
5. Le site recharge le fil (`GET /api/cartographies/{id}/annotations`, liste
   ordonnée par saisie, auteurs nommés) et vide le champ.

## Scénarios alternatifs

- **A1 — L'apprenant annote sa propre cartographie** (étape 4) : même route,
  niveau d'accès « propriétaire », y compris en visibilité `privee` ; le
  cartographe et l'apprenant lisent le même fil (par l'API — l'espace
  apprenant n'a pas encore d'écran pour ce fil).
- **A2 — Supprimer sa propre annotation** (étape 2) : un bouton « Supprimer »
  figure en face des seules annotations dont l'utilisateur est l'auteur ;
  `DELETE /api/annotations/{annotationId}` → `204`, puis le fil est rechargé.
- **A3 — Parcours (merge)** (étape 2) : l'annotation fonctionne à
  l'identique ; l'éditeur de verdict n'est pas proposé et le site indique
  « La correction par verdict s'applique aux cartographies de journée ; pour
  un parcours (merge), annotez ici puis corrigez les journées sources. »

## Scénarios d'erreur

- **E1 — Texte vide** (étape 3) : « Le texte de l'annotation est vide. »,
  aucune requête (un texte fait de blancs compte comme vide).
- **E2 — Validation serveur** (étape 4) : code hors forme
  `<pôle 1-7>.<2 chiffres>`, type inconnu, texte vide ou de plus de 5 000
  caractères → `422 {error: "Validation échouée", fields: {…}}` ; le site
  affiche « Validation échouée » (le détail par champ, `fields`, n'est pas
  affiché) et conserve la saisie. Depuis l'IHM, seul un texte de plus de
  5 000 caractères y mène (liste de codes du document, types fixes, champ
  sans `maxLength`).
- **E3 — Accès refusé** (étape 4) : apprenant étranger, cartographe non lié,
  cartographie repassée en `privee`, id inconnu → **même** `404 {error:
  "Cartographie introuvable"}`, en écriture comme en lecture du fil ; le site
  affiche le message.
- **E4 — Suppression refusée** (A2) : annotation d'autrui ou inexistante →
  `404 {error: "Annotation introuvable"}` ; le site affiche le message, le fil
  est inchangé.
- **E5 — Jeton CSRF absent** (étapes 3 et A2) : `403`, rien n'est créé ni
  supprimé.
- **E6 — Non authentifié ou rôle insuffisant** (étape 4, A2) : sans session →
  `401 {error: "Authentification requise"}` (écriture, lecture du fil et
  suppression) ; session sans rôle `apprenant` ni `cartographe` → `403
  {error: "Rôle insuffisant"}`, y compris pour le propriétaire ou l'auteur
  (un cartographe à qui l'on retire le rôle ne peut plus retirer sa propre
  annotation). Un cartographe lié qui garde le rôle `apprenant` mais perd
  `cartographe` passe la garde de rôle puis reçoit le `404` de E3
  (`Links::access` exige le rôle).

## Règles de gestion

- **RG1** — Trois types seulement : `commentaire`, `hallucination`, `oubli`.
- **RG2** — Accès en écriture et en lecture du fil : le propriétaire, ou un
  cartographe **lié**, portant le rôle, sur une cartographie en visibilité
  `cartographe`/`publique`. Parmi les comptes qui portent `apprenant` ou
  `cartographe`, tout refus = 404 homogène ; sans session `401`, sans aucun
  de ces deux rôles `403` (E6).
- **RG3** — Suppression par l'**auteur seul** ; elle ne dépend pas de l'accès
  à la cartographie : un cartographe qui a perdu l'accès (visibilité
  repassée en privée) peut toujours retirer sa propre annotation — par
  l'API, ou depuis un écran de relecture resté ouvert ; une fois l'écran
  rechargé, la relecture n'est plus accessible (404, UC-CAR-02 E2) et le
  bouton « Supprimer » avec elle. La suppression exige quand même l'un des
  rôles `apprenant` ou `cartographe` (E6).
- **RG4** — Texte nettoyé (`trim`), 1 à 5 000 caractères (caractères
  multioctets comptés comme un) ; code nettoyé (`trim`). Le nettoyage
  serveur ne retire que les blancs ASCII : un texte fait d'espaces
  insécables est accepté par l'API (écart avec l'IHM, voir AN10).
- **RG5** — Le code de compétence n'est contrôlé que sur sa **forme**
  (`^[1-7]\.\d{2}$`) : un code absent du référentiel (`7.99`, `1.00`) est
  accepté par l'API ; l'IHM, elle, ne propose que les codes du document.
- **RG6** — Une annotation ne modifie aucun verdict et ne notifie personne.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Annotation (texte libre) | `cartography_annotations` ; supprimée avec son auteur **et** avec la cartographie (CASCADE) |
| Auteur | Nom affiché lu à la volée (jointure `users`) |
| Journal | Aucun événement d'audit, aucun contenu journalisé |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/cartographe/RelectureSection.jsx` | Choix de la compétence, fil filtré par code, formulaire, suppression, messages |
| Front | `web/src/views/cartographe/revision.js` — `listCompetences` | Codes proposés (jour et merge) |
| Front | `web/src/views/cartographe/cartographe-api.js` — `postAnnotation`, `fetchAnnotations`, `deleteAnnotation`, `fetchCartographie` | Appels HTTP ; fil initial tiré du détail (étape 2) |
| Front | `web/src/api/client.js` — `apiFetch`, `ApiError` | Jeton CSRF réémis, erreurs typées (message serveur, `fields`) |
| API | `api/src/Middleware/CsrfMiddleware.php` | CSRF global (E5) |
| API | `api/src/Middleware/RequireRole.php` | 401 sans session, 403 sans rôle `apprenant`/`cartographe` (E6) |
| API | `POST/GET /api/cartographies/{id}/annotations`, `DELETE /api/annotations/{annotationId}` — `api/src/routes/annotations.php` | Validation, 404 homogène |
| API | `GET /api/cartographe/cartographies/{id}` — `api/src/routes/cartographe.php` | Détail : fil initial (étape 2) |
| Domaine | `api/src/Cartographe/Annotations.php` — `TYPES`, `create`, `listForCartography`, `deleteForAuthor` | Fil d'annotations |
| Domaine | `api/src/Cartographe/Links.php` — `access`, `queueFor` | Propriétaire ou cartographe lié ; compteur d'annotations de la file |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CAR-03-U01 | `Annotations::TYPES` | Trois types (RG1) | `api/tests/UseCases/Unit/UcCar03AnnoterCartographieTest.php` |
| UC-CAR-03-U02 | `create`, `listForCartography` | Ordre de saisie, forme, auteur nommé, date ISO, isolement par cartographie | idem |
| UC-CAR-03-U03 | `deleteForAuthor` | Auteur seul ; autrui / inexistante / déjà supprimée → `false` (RG3) | idem |
| UC-CAR-03-U04 | `Links::access` | Propriétaire (même en privée), cartographe lié + rôle + visibilité ; sinon `null` (RG2) | idem |
| UC-CAR-03-U05 | Contraintes SQL | Annotations supprimées avec la cartographie et avec leur auteur | idem |
| UC-CAR-03-U06 | `postAnnotation` | POST JSON `{competenceCode, type, texte}` | `web/test/usecases/unit/uc-car-03-annoter-cartographie.test.js` |
| UC-CAR-03-U07 | `fetchAnnotations`, `postAnnotation` (422), `ApiError` | Liste nue ou enveloppée ; 404 au rechargement → `ApiError` ; 422 → `ApiError` avec `fields` | idem |
| UC-CAR-03-U08 | `deleteAnnotation` | DELETE, 204 → `null` | idem |
| UC-CAR-03-U09 | `listCompetences` (jour) | Codes triés avec verdict, à partir d'un document aux pôles et compétences en ordre inverse | idem |
| UC-CAR-03-U10 | `listCompetences` (merge) | Codes des domaines triés (document mélangé), sans verdict ; document inconnu → `[]` | idem |
| UC-CAR-03-U11 | `RelectureSection` (rendu seul) | Fil filtré par code ; « Supprimer » sur les seules annotations de l'utilisateur ; texte de blancs Unicode refusé sans appel | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-03-F01 | Nominal, RG6 | API | Trois types, texte nettoyé, fil identique pour les deux lecteurs, compteur de file, aucun audit ; document, révisions, `updatedAt` et garantie inchangés, aucun mail (RG6) | `api/tests/UseCases/Functional/UcCar03AnnoterCartographieTest.php` |
| UC-CAR-03-F02 | A1 | API | Le propriétaire annote (y compris en privée), fil commun | idem |
| UC-CAR-03-F03 | A2 | API | Suppression par l'auteur → 204, fil à jour | idem |
| UC-CAR-03-F04 | E2 (AN10) | API | 422 avec les trois champs ; bornes (5 000 / 5 001, code entouré d'espaces) ; texte d'espaces insécables ou idéographiques accepté (201, comportement actuel) | idem |
| UC-CAR-03-F05 | RG5 | API | Code hors référentiel accepté (forme seulement) — comportement actuel | idem |
| UC-CAR-03-F06 | E3 | API | Étranger, non lié, privée, inconnue → corps 404 identiques (POST et GET) | idem |
| UC-CAR-03-F07 | E4, RG3 | API | 404 sur autrui/inexistante ; retrait possible après perte d'accès | idem |
| UC-CAR-03-F08 | E5 | API | Sans CSRF → 403 (création et suppression) | idem |
| UC-CAR-03-F09 | Nominal | IHM | `<App/>` : options nommées, fil, POST exact + CSRF, fil rechargé, champ vidé | `web/test/usecases/functional/uc-car-03-annoter-cartographie.test.jsx` |
| UC-CAR-03-F10 | A2 | IHM | « Supprimer » sur mes seules annotations ; DELETE + rechargement | idem |
| UC-CAR-03-F11 | A3 | IHM | Merge : annotation postée (corps exact) et fil rechargé ; éditeur de verdict absent | idem |
| UC-CAR-03-F12 | E1 | IHM | Texte blanc refusé sans requête | idem |
| UC-CAR-03-F13 | E2, E3 | IHM | 422 puis 404 : messages, saisie conservée | idem |
| UC-CAR-03-F14 | E4 | IHM | DELETE refusé : « Annotation introuvable » | idem |
| UC-CAR-03-F15 | E6 | API | Sans session → 401 (GET, POST, DELETE) ; sans rôle apprenant/cartographe → 403, même pour l'auteur ou la propriétaire ; lié mais sans le rôle cartographe → 404 ; fil inchangé | `api/tests/UseCases/Functional/UcCar03AnnoterCartographieTest.php` |
| UC-CAR-03-F16 | Étape 5 (AN11) | IHM | POST 201 puis rechargement du fil en 404 : alerte « Cartographie introuvable », champ vidé, un seul POST (comportement actuel) | `web/test/usecases/functional/uc-car-03-annoter-cartographie.test.jsx` |

### Tests existants liés (non-régression)

- `api/tests/AnnotationsTest.php` — écriture/lecture par les deux parties, validation, matrice 404, suppression par l'auteur, CSRF.
- `api/tests/CartographePurgeTest.php` — annotations du cartographe purgées avec son compte.
- `web/src/views/cartographe/RelectureSection.test.jsx` — « annotations par compétence » (forme enveloppée).
- `web/e2e/parcours-cartographe.e2e.js` — étape « annotation hallucination ».

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCar03 --testdox
cd web && npx vitest run test/usecases/unit/uc-car-03 test/usecases/functional/uc-car-03
```

## Limites

- L'espace apprenant n'affiche pas encore le fil d'annotations : l'apprenant
  ne le lit que par l'API (A1).
- Le message « Choisissez d'abord une compétence. » est une garde défensive :
  le formulaire n'apparaît qu'une fois une compétence choisie.
- Un refus de validation (E2) n'affiche que « Validation échouée » : le
  détail par champ n'est pas montré, et le champ « Annotation » n'a pas de
  `maxLength` — l'utilisateur ne sait pas que son texte dépasse 5 000
  caractères.
- Après un retour de la cartographie en privée, l'écran de relecture
  (rechargé) n'affiche que l'erreur de chargement : le retrait de ses
  propres annotations (RG3) ne passe plus que par l'API.

## Anomalies constatées

- **AN10 — Texte fait de blancs Unicode accepté par l'API.** `trim()` de PHP
  ne retire que les blancs ASCII (`" \t\n\r\0\x0B"`) : un texte composé
  d'espaces insécables (U+00A0) ou idéographiques (U+3000) passe la
  validation (`201`) et crée une annotation visuellement vide. L'IHM n'y est
  pas exposée (le `trim` JavaScript retire ces caractères, UC-CAR-03-U11) ;
  un appel direct à l'API l'est. Figé par UC-CAR-03-F04.
- **AN11 — Rechargement du fil en échec après un envoi réussi.**
  `submitAnnotation` enchaîne le POST, le vidage du champ et le rechargement
  du fil dans le même `try` : si le rechargement échoue (cartographie
  repassée en privée entre-temps, session expirée, réseau), l'alerte affiche
  l'erreur du rechargement alors que l'annotation est enregistrée, absente
  du fil affiché, et que la saisie est perdue ; l'utilisateur risque de la
  ressaisir et de créer un doublon. Contredit la garantie minimale « la
  saisie reste dans le formulaire ». Figé par UC-CAR-03-F16.
