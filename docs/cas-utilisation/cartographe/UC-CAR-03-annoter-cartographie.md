# UC-CAR-03 — Annoter une cartographie

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe lié à l'apprenant (UC-CAR-01) |
| **Acteurs secondaires** | Apprenant propriétaire (peut aussi annoter et lire le fil) |
| **Portée** | humanome.xyz — relecture `#/cartographe/relecture/<id>` ; API `/api/cartographies/{id}/annotations`, `/api/annotations/{annotationId}` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.3 (« relire, commenter… détection d'hallucinations, d'oublis »), §8 ; `docs/autorisations.md` §P9 ; formation cartographe, chapitre 5 §1 |
| **Statut** | Implémenté (P9, contrat M7) |

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

- Rien n'est enregistré ; la saisie reste dans le formulaire.
- Un refus d'accès ne révèle pas si la cartographie existe.

## Scénario nominal

1. Le cartographe choisit une compétence dans « Compétence » : la liste
   propose les codes instruits dans le document affiché (triés, nommés par le
   référentiel publié, par exemple « 1.01 — Pensée Critique &
   Anti-Hallucination »).
2. Le panneau « Annotations — <code> » affiche le fil de cette compétence
   (type, texte, « — auteur, date heure ») et le formulaire : « Type »
   (Commentaire / Hallucination signalée / Oubli signalé) et « Annotation ».
3. Il rédige, choisit le type et clique sur « Annoter » ; le site vérifie que
   le texte n'est pas vide puis envoie `POST /api/cartographies/{id}/annotations`
   `{competenceCode, type, texte}` (texte nettoyé des blancs, session +
   `X-CSRF-Token`).
4. Le serveur vérifie le rôle (`apprenant` ou `cartographe`), l'accès
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
  affiche le message et conserve la saisie.
- **E3 — Accès refusé** (étape 4) : apprenant étranger, cartographe non lié,
  cartographie repassée en `privee`, id inconnu → **même** `404 {error:
  "Cartographie introuvable"}`, en écriture comme en lecture du fil ; le site
  affiche le message.
- **E4 — Suppression refusée** (A2) : annotation d'autrui ou inexistante →
  `404 {error: "Annotation introuvable"}` ; le site affiche le message, le fil
  est inchangé.
- **E5 — Jeton CSRF absent** (étapes 3 et A2) : `403`, rien n'est créé ni
  supprimé.

## Règles de gestion

- **RG1** — Trois types seulement : `commentaire`, `hallucination`, `oubli`.
- **RG2** — Accès en écriture et en lecture du fil : le propriétaire, ou un
  cartographe **lié**, portant le rôle, sur une cartographie en visibilité
  `cartographe`/`publique` ; tout autre cas = 404 homogène.
- **RG3** — Suppression par l'**auteur seul** ; elle ne dépend pas de l'accès
  à la cartographie : un cartographe qui a perdu l'accès (visibilité
  repassée en privée) peut toujours retirer sa propre annotation.
- **RG4** — Texte nettoyé (`trim`), 1 à 5 000 caractères (caractères
  multioctets comptés comme un) ; code nettoyé (`trim`).
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
| Front | `web/src/views/cartographe/cartographe-api.js` — `postAnnotation`, `fetchAnnotations`, `deleteAnnotation` | Appels HTTP |
| API | `POST/GET /api/cartographies/{id}/annotations`, `DELETE /api/annotations/{annotationId}` — `api/src/routes/annotations.php` | Validation, 404 homogène |
| Domaine | `api/src/Cartographe/Annotations.php` — `TYPES`, `create`, `listForCartography`, `deleteForAuthor` | Fil d'annotations |
| Domaine | `api/src/Cartographe/Links.php` — `access` | Propriétaire ou cartographe lié |

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
| UC-CAR-03-U07 | `fetchAnnotations`, `ApiError` | Liste nue ou enveloppée ; 422 → erreur avec `fields` | idem |
| UC-CAR-03-U08 | `deleteAnnotation` | DELETE, 204 → `null` | idem |
| UC-CAR-03-U09 | `listCompetences` (jour) | Codes triés avec verdict | idem |
| UC-CAR-03-U10 | `listCompetences` (merge) | Codes des domaines sans verdict ; document inconnu → `[]` | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-03-F01 | Nominal | API | Trois types, texte nettoyé, fil identique pour les deux lecteurs, compteur de file, aucun audit | `api/tests/UseCases/Functional/UcCar03AnnoterCartographieTest.php` |
| UC-CAR-03-F02 | A1 | API | Le propriétaire annote (y compris en privée), fil commun | idem |
| UC-CAR-03-F03 | A2 | API | Suppression par l'auteur → 204, fil à jour | idem |
| UC-CAR-03-F04 | E2 | API | 422 avec les trois champs ; bornes (5 000 / 5 001, code entouré d'espaces) | idem |
| UC-CAR-03-F05 | RG5 | API | Code hors référentiel accepté (forme seulement) — comportement actuel | idem |
| UC-CAR-03-F06 | E3 | API | Étranger, non lié, privée, inconnue → corps 404 identiques (POST et GET) | idem |
| UC-CAR-03-F07 | E4, RG3 | API | 404 sur autrui/inexistante ; retrait possible après perte d'accès | idem |
| UC-CAR-03-F08 | E5 | API | Sans CSRF → 403 (création et suppression) | idem |
| UC-CAR-03-F09 | Nominal | IHM | `<App/>` : options nommées, fil, POST exact + CSRF, fil rechargé, champ vidé | `web/test/usecases/functional/uc-car-03-annoter-cartographie.test.jsx` |
| UC-CAR-03-F10 | A2 | IHM | « Supprimer » sur mes seules annotations ; DELETE + rechargement | idem |
| UC-CAR-03-F11 | A3 | IHM | Merge : annotation oui, éditeur de verdict non | idem |
| UC-CAR-03-F12 | E1 | IHM | Texte blanc refusé sans requête | idem |
| UC-CAR-03-F13 | E2, E3 | IHM | 422 puis 404 : messages, saisie conservée | idem |
| UC-CAR-03-F14 | E4 | IHM | DELETE refusé : « Annotation introuvable » | idem |

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
