# UC-CAR-06 — Comparer des versions de cartographie

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe (rôle `cartographe`) |
| **Acteurs secondaires** | Apprenant (ses cartographies exposées alimentent la comparaison) ; promptologue (destinataire du diagnostic « prompt instable ») |
| **Portée** | humanome.xyz — `#/cartographe/comparer` (calcul 100 % navigateur) ; lecture par `GET /api/cartographe/cartographies[/{id}]` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.3 (« comparer les résultats entre différentes versions de prompts de cartographie ») ; formation cartographe, chapitre 6 |
| **Statut** | Implémenté (P9.4) |

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
- Rien n'est écrit : la comparaison est calculée dans le navigateur (aucun
  appel autre que la lecture de la file et des deux documents).

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
   par id, à défaut par nom affiché).
3. Il choisit la cartographie 2 ; la section charge à la demande les deux
   documents (`GET /api/cartographe/cartographies/{id}`) — « Chargement des
   documents… » — et les garde en cache.
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
  journée) apparaissent divergents (voir Limites).
- **A3 — Versions identiques** (étape 4) : « 0 compétence(s) divergente(s) ».
- **A4 — Compétence instruite d'un seul côté** (étape 4) : ligne divergente,
  « — » en face.
- **A5 — Changer la cartographie 1** (étape 2) : la sélection 2 est remise à
  zéro et le tableau disparaît ; un document déjà chargé n'est pas redemandé.

## Scénarios d'erreur

- **E1 — Échec de chargement de la file** (étape 1) : message du serveur,
  listes vides.
- **E2 — Document inaccessible** (étape 3) : par exemple repassé en privée
  entre-temps → `404` ; « Cartographie introuvable » est affiché, la section
  reste sur « Chargement des documents… », sans tableau.
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
  absente.
- **RG3** — Un champ absent des **deux** côtés n'est jamais une divergence ;
  présent d'un seul côté, il l'est.
- **RG4** — Calcul local, lecture seule : aucune écriture, aucun audit.

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/CartographeView.jsx` | Garde de rôle, section `comparer`, menu « Comparer » |
| Front | `web/src/views/cartographe/CompareSection.jsx` | Sélecteurs contraints, chargement à la demande (cache), sunbursts, tableau surligné, messages |
| Front | `web/src/views/cartographe/compare-model.js` — `COMPARE_FIELDS`, `extractComparable`, `compareCartographies` | Modèle pur du tableau des divergences |
| Front | `web/src/views/cartographe/cartographe-api.js` — `fetchQueue`, `fetchCartographie`, `typeLabel`, `frDate` | Lecture de la file et des documents (UC-CAR-02) |
| Front | `web/src/components/Sunburst.jsx`, module sunburst (`buildDayTree`, `buildMergeTree`, `layoutSunburst`) | Diagrammes |
| API | `GET /api/cartographe/cartographies[/{id}]` | Lecture (contrôle d'accès de UC-CAR-02) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CAR-06-U01 | `COMPARE_FIELDS` | Ordre des colonnes, figé | `web/test/usecases/unit/uc-car-06-comparer-versions.test.js` |
| UC-CAR-06-U02 | `extractComparable` (jour) | Statut + confiance ; niveau/points `null` ; verdict absent ou confiance non numérique (RG2) | idem |
| UC-CAR-06-U03 | `extractComparable` (merge) | Statut, niveau, points, `confiance_moyenne` ; type inconnu → vide | idem |
| UC-CAR-06-U04 | `compareCartographies` | Union triée, champs divergents nommés, champs absents des deux ignorés (RG3) | idem |
| UC-CAR-06-U05 | `compareCartographies` | Compétence d'un seul côté : divergente, côté manquant vide | idem |
| UC-CAR-06-U06 | `compareCartographies` | Journée contre parcours : niveau/points divergents (limite) | idem |

La lecture de la file et du détail (`fetchQueue`, `fetchCartographie`) est
testée unitairement par UC-CAR-02 (U07 à U09).

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-06-F01 | Nominal | IHM | `<App/>` : liste 2 inactive puis limitée au même apprenant, deux sunbursts légendés, résumé, cellules surlignées et formatées | `web/test/usecases/functional/uc-car-06-comparer-versions.test.jsx` |
| UC-CAR-06-F02 | A1 | IHM | Deux merges : niveau et points comparés | idem |
| UC-CAR-06-F03 | A3 | IHM | Identiques : 0 divergence | idem |
| UC-CAR-06-F04 | A4 | IHM | Compétence d'un seul côté : « — », ligne divergente | idem |
| UC-CAR-06-F05 | A2 | IHM | Journée contre parcours : niveau signalé divergent | idem |
| UC-CAR-06-F06 | A5 | IHM | Réinitialisation de la sélection 2, cache des documents | idem |
| UC-CAR-06-F07 | E1 | IHM | File en erreur : message, listes vides | idem |
| UC-CAR-06-F08 | E2 | IHM | Document 404 : message, pas de tableau | idem |
| UC-CAR-06-F09 | E3 | IHM | Apprenant avec une seule cartographie : aucune option | idem |
| UC-CAR-06-F10 | E4 | IHM | Sans rôle : section réservée, file non lue | idem |

### Tests existants liés (non-régression)

- `web/src/views/cartographe/compare-model.test.js` — extraction et divergences (jour, merge, absence).
- `web/src/views/cartographe/CompareSection.test.jsx` — contrainte « même apprenant », deux sunbursts, surlignage (forme enveloppée).

### Exécuter

```sh
cd web && npx vitest run test/usecases/unit/uc-car-06 test/usecases/functional/uc-car-06
```

## Limites

- **Journée contre parcours** : la seconde liste ne filtre que par
  apprenant ; comparer une journée à un parcours signale systématiquement
  niveau et points comme divergents (A2, U06, F05).
- **Pas de vérification du portfolio** : rien ne garantit que les deux
  cartographies portent sur le même portfolio ou la même journée ; c'est au
  cartographe de choisir des versions comparables.
- Une sélection faite avant la fin d'un chargement relance ce chargement (le
  résultat précédent est ignoré) : un document peut alors être demandé deux
  fois.
