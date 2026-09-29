# UC-CAR-06 — Comparer des versions de cartographie

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe (rôle `cartographe`) |
| **Acteurs secondaires** | Apprenant (ses cartographies exposées alimentent la comparaison) ; promptologue (destinataire du diagnostic « prompt instable ») |
| **Portée** | humanome.xyz — `#/cartographe/comparer` (calcul 100 % navigateur) ; lecture par `GET /api/cartographe/cartographies[/{id}]` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.3 (« comparer les résultats entre différentes versions de prompts de cartographie ») ; formation cartographe, chapitre 6 |
| **Statut** | Implémenté (P9.4) — voir « Anomalies constatées » |

## Objectif

Mettre côte à côte deux cartographies d'un **même apprenant** — typiquement
le même portfolio cartographié par deux versions de prompts — et faire
apparaître, compétence par compétence, ce qui diverge (statut, niveau,
points, confiance), pour distinguer ce qui tient aux traces de l'apprenant de
ce qui tient au prompt.

## Déclencheur

Le cartographe ouvre `#/cartographe/comparer` (menu « Comparer », ou lien
« Comparer deux cartographies d'un même apprenant → » de la file).

## Préconditions

- Le cartographe est connecté avec le rôle `cartographe`.
- Sa file (UC-CAR-02) contient au moins deux cartographies d'un même
  apprenant.

## Garanties en cas de succès

- Les deux documents sont affichés en sunburst, côte à côte, avec leur
  légende (titre — type du JJ/MM/AAAA).
- Le tableau liste l'union des compétences des deux documents, triée par
  code ; les lignes et les cellules divergentes sont surlignées ; un résumé
  compte les divergences.
- Rien n'est écrit : la comparaison est calculée dans le navigateur ; seules
  des lectures `GET` sont émises (session `api/auth/me`, référentiel publié
  statique `data/referentiel/…`, file et deux documents).

## Garanties minimales (en cas d'échec)

- Aucun tableau n'est affiché sur des documents incomplets ; le message
  d'erreur du serveur est affiché.

## Scénario nominal

1. La section charge la file (`GET /api/cartographe/cartographies`) et le
   référentiel publié ; « Cartographie 1 » liste toute la file
   (« apprenant · titre — type du date ») ; « Cartographie 2 (même
   apprenant) » est inactive.
2. Le cartographe choisit la cartographie 1 ; la seconde liste s'active et ne
   propose que les **autres** cartographies du **même apprenant** (comparé
   par id, à défaut par nom affiché). Le document 1 est demandé dès ce choix
   (`GET /api/cartographe/cartographies/{id}`).
3. Il choisit la cartographie 2 ; la section charge le document 2 (et le 1
   s'il n'est pas encore arrivé) — « Chargement des documents… » — et garde
   les documents reçus en cache.
4. Elle affiche deux sunbursts (lecture seule, sans panneau) et
   « Divergences par compétence » : résumé « N compétence(s) divergente(s)
   sur M comparée(s). », puis une ligne par compétence avec, pour chaque
   champ, « valeur 1 / valeur 2 » (confiance en %, « — » si absente) ; ligne
   `compare-divergent` et cellules `compare-champ-divergent` surlignées
   (`compareCartographies`).

## Scénarios alternatifs

- **A1 — Deux parcours (merge)** (étape 4) : statut, niveau, points et
  confiance moyenne sont comparés.
- **A2 — Une journée et un parcours** (étape 2) : la seconde liste ne filtre
  pas par type ; la comparaison a lieu, mais niveau et points (absents d'une
  journée) apparaissent divergents pour toute compétence présente dans le
  parcours (voir Limites).
- **A3 — Versions identiques** (étape 4) : « 0 compétence(s) divergente(s) ».
- **A4 — Compétence instruite d'un seul côté** (étape 4) : ligne divergente,
  « — » en face, que la compétence manque à la cartographie 1 ou à la 2
  (le tableau porte sur l'union des codes).
- **A5 — Changer la cartographie 1** (étape 2) : la sélection 2 est remise à
  zéro et le tableau disparaît ; un document déjà chargé n'est pas redemandé.

## Scénarios d'erreur

- **E1 — Échec de chargement de la file** (étape 1) : message du serveur,
  listes vides, seconde liste inactive.
- **E2 — Document inaccessible** (étape 3) : par exemple repassé en privée
  entre-temps → `404` ; « Cartographie introuvable » est affiché, la section
  reste sur « Chargement des documents… », sans tableau. Le message reste
  affiché même après une comparaison réussie sur une autre paire (AN18).
- **E3 — Aucune autre cartographie du même apprenant** (étape 2) : la seconde
  liste ne propose rien.
- **E4 — Pas le rôle cartographe** : espace réservé (UC-CAR-01 E3), la file
  n'est pas lue.

## Règles de gestion

- **RG1** — Deux cartographies d'un **même apprenant** seulement, distinctes.
- **RG2** — Champs comparés, dans l'ordre : statut, niveau, points,
  confiance ; pour une journée, statut et confiance viennent du verdict
  (niveau et points n'existent pas) ; pour un parcours, `statut`, `niveau`,
  `points`, `confiance_moyenne` ; une valeur non numérique compte comme
  absente. La comparaison est une égalité stricte, sans tolérance.
- **RG3** — Un champ absent des **deux** côtés n'est jamais une divergence ;
  présent d'un seul côté, il l'est.
- **RG4** — Calcul local, lecture seule : aucune écriture, aucun audit.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Documents comparés | Lus seulement si la visibilité est `cartographe`/`publique` et le lien actif (contrôle d'accès de UC-CAR-02) ; gardés en mémoire de la section uniquement (ni `localStorage` ni IndexedDB), perdus en quittant la section |
| Comparaison | Calculée dans le navigateur ; aucune écriture, aucun événement d'audit, aucune donnée transmise à un tiers |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/CartographeView.jsx` | Garde de rôle, section `comparer`, menu « Comparer » |
| Front | `web/src/views/cartographe/CompareSection.jsx` | Sélecteurs contraints (filtre RG1), chargement à la demande (cache), sunbursts, tableau surligné (`cell` : arrondi en %, « — »), messages |
| Front | `web/src/views/cartographe/compare-model.js` — `COMPARE_FIELDS`, `extractComparable`, `compareCartographies` | Modèle pur du tableau des divergences |
| Front | `web/src/views/cartographe/cartographe-api.js` — `fetchQueue`, `fetchCartographie`, `typeLabel`, `frDate` | Lecture de la file et des documents (UC-CAR-02) |
| Front | `web/src/data/referentiel.js` — `loadPublishedReferentiel` | Référentiel publié (repli sur la copie embarquée) |
| Front | `web/src/components/Sunburst.jsx`, module `web/src/lib/sunburst/` (`buildDayTree`, `buildMergeTree`, `layoutSunburst`) | Diagrammes |
| API | `GET /api/cartographe/cartographies[/{id}]` | Lecture (contrôle d'accès de UC-CAR-02) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CAR-06-U01 | `COMPARE_FIELDS` | Ordre des colonnes, figé | `web/test/usecases/unit/uc-car-06-comparer-versions.test.js` |
| UC-CAR-06-U02 | `extractComparable` (jour) | Statut + confiance ; niveau/points `null` ; verdict absent ou confiance non numérique (RG2) | idem |
| UC-CAR-06-U03 | `extractComparable` (merge) | Statut, niveau, points, `confiance_moyenne` ; niveau, points ou confiance non numériques → `null` ; type inconnu → vide | idem |
| UC-CAR-06-U04 | `compareCartographies` | Champs divergents nommés, champs absents des deux ignorés (RG3) | idem |
| UC-CAR-06-U05 | `compareCartographies` | Compétence d'un seul côté : divergente, côté manquant vide | idem |
| UC-CAR-06-U06 | `compareCartographies` | Journée contre parcours : niveau/points divergents dès que le parcours les porte ; compétence absente du parcours → statut et confiance seulement (limite) | idem |
| UC-CAR-06-U07 | `compareCartographies` | Union dans les deux sens (document 1 plus petit : 15 codes) et tri réel (pôles et compétences en ordre inverse) contre une liste explicite | idem |
| UC-CAR-06-U08 | `CompareSection` (rendu seul) | Liste 2 inactive avant choix ; filtre RG1 par nom affiché à défaut d'id d'apprenant | idem |
| UC-CAR-06-U09 | `compareCartographies` | Égalité stricte : 0.7433 contre 0.74 diverge, alors que l'affichage arrondit les deux à 74 % (limite) | idem |
| UC-CAR-06-U10 | `CompareSection` (rendu seul, vrai module sunburst) | Documents arrivés avant le référentiel : `TypeError` au rendu, section démontée (AN17, comportement actuel) | idem |

La lecture de la file et du détail (`fetchQueue`, `fetchCartographie`) et
`typeLabel` sont testés unitairement par UC-CAR-02 (U07 à U10) ; `frDate` par
UC-CAR-01-U12. Le module sunburst est couvert par ses propres tests (voir
« Tests existants liés ») ; les tests fonctionnels le remplacent par un faux
module (`web/src/test/fake-sunburst-lib.js`), sauf UC-CAR-06-U10.

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-06-F01 | Nominal, RG4 | IHM | `<App/>` : liste 2 inactive puis limitée au même apprenant, deux sunbursts légendés (faux module), résumé, cellules surlignées et formatées ; uniquement des `GET` (session, référentiel, file, deux documents) | `web/test/usecases/functional/uc-car-06-comparer-versions.test.jsx` |
| UC-CAR-06-F02 | A1 | IHM | Deux merges : niveau, points et confiance moyenne comparés, cellules surlignées ; 0.7433 contre 0.74 surligné sous « 74 % / 74 % » | idem |
| UC-CAR-06-F03 | A3 | IHM | Identiques : 0 divergence | idem |
| UC-CAR-06-F04 | A4 | IHM | Compétence d'un seul côté : « — », ligne divergente | idem |
| UC-CAR-06-F05 | A2 | IHM | Journée contre parcours : niveau et points signalés divergents | idem |
| UC-CAR-06-F06 | A5 | IHM | Réinitialisation de la sélection 2, cache des documents | idem |
| UC-CAR-06-F07 | E1 | IHM | File en erreur : message, listes vides, liste 2 inactive | idem |
| UC-CAR-06-F08 | E2 | IHM | Document 404 : message, pas de tableau | idem |
| UC-CAR-06-F09 | E3 | IHM | Apprenant avec une seule cartographie : aucune option | idem |
| UC-CAR-06-F10 | E4 | IHM | Sans rôle : section réservée, file non lue | idem |
| UC-CAR-06-F11 | A4 | IHM | Compétence absente de la cartographie 1 : « — / présence non établie », « — / 100 % », ligne divergente | idem |
| UC-CAR-06-F12 | E2 (AN18) | IHM | Après un 404, une comparaison réussie s'affiche sous l'alerte « Cartographie introuvable » restée affichée (comportement actuel) | idem |

### Tests existants liés (non-régression)

- `web/src/views/cartographe/compare-model.test.js` — extraction et divergences (jour, merge, absence).
- `web/src/views/cartographe/CompareSection.test.jsx` — contrainte « même apprenant », deux sunbursts, surlignage (forme enveloppée).
- `web/src/lib/sunburst/build-tree.test.js`, `web/src/lib/sunburst/parity.test.js` — construction des arbres jour et merge, parité avec le prototype.

### Exécuter

```sh
cd web && npx vitest run test/usecases/unit/uc-car-06 test/usecases/functional/uc-car-06
```

## Limites

- **Journée contre parcours** : la seconde liste ne filtre que par
  apprenant ; comparer une journée à un parcours signale niveau et points
  comme divergents pour toute compétence présente dans le parcours (A2, U06,
  F05).
- **Égalité stricte, affichage arrondi** : la confiance est comparée sans
  tolérance mais affichée arrondie au pour cent ; une cellule surlignée peut
  donc montrer deux valeurs identiques (« 74 % / 74 % » pour 0.7433 contre
  0.74 — U09, F02).
- **Pas de vérification du portfolio** : rien ne garantit que les deux
  cartographies portent sur le même portfolio ou la même journée ; c'est au
  cartographe de choisir des versions comparables.
- Une sélection faite avant la fin d'un chargement relance ce chargement (le
  résultat précédent est ignoré) : un document peut alors être demandé deux
  fois. C'est le cas du parcours nominal dès que la seconde sélection suit
  vite la première (le document 1 est demandé dès l'étape 2).

## Anomalies constatées

- **AN17 — Documents arrivés avant le référentiel : plantage du rendu.**
  `MiniSunburst` appelle `lib.buildDayTree(doc, referentiel)` même quand le
  référentiel publié n'est pas encore chargé (`null`) ; rien n'attend ce
  chargement (contrairement à la relecture, qui affiche « Chargement du
  référentiel… »). Le vrai module déréférence `referentiel.poles` et lève une
  `TypeError` pendant le rendu ; l'application n'a pas d'`ErrorBoundary` :
  si les deux documents « jour » arrivent avant le référentiel (fichier
  statique lent), toute la page se démonte. Les tests fonctionnels ne le
  voient pas (le faux module tolère un référentiel `null`). Figé par
  UC-CAR-06-U10.
- **AN18 — Message d'erreur périmé.** `loadError` n'est jamais remis à zéro :
  après E1 ou E2, une comparaison réussie sur une autre paire s'affiche sous
  l'alerte précédente (« Cartographie introuvable »). Figé par
  UC-CAR-06-F12.
