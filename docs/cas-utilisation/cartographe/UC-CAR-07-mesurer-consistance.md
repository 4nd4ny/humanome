# UC-CAR-07 — Mesurer la consistance multi-run

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe (rôle `cartographe`) |
| **Acteurs secondaires** | Apprenant (ses journées exposées peuvent servir de runs) ; promptologue (destinataire d'un diagnostic « prompt instable ») |
| **Portée** | humanome.xyz — `#/cartographe/consistance` (calcul 100 % navigateur, moteur `engine/`) ; lecture par `GET /api/cartographe/cartographies[/{id}]` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.3 (« outils statistiques de consistance (cohérence des JSON produits sur plusieurs runs) »), §8 (qualité / hallucinations) ; ADR-001 (moteur côté client) ; formation cartographe, chapitre 6 |
| **Statut** | Implémenté (P9.4) — voir « Anomalies constatées » |

## Objectif

Mesurer, sur N cartographies de la **même journée** produites par des runs
indépendants du même prompt, où les runs s'accordent et où ils divergent :
accord global, compétences stables, compétences divergentes, détail par
compétence et dispersion des confiances — pour distinguer une compétence
fragile (mal documentée) d'un prompt instable.

## Déclencheur

Le cartographe ouvre `#/cartographe/consistance` (menu « Consistance », ou
lien « Analyser la consistance multi-run → » de la file).

## Préconditions

- Le cartographe est connecté avec le rôle `cartographe`.
- Il dispose d'au moins deux documents `cartographie-jour` : dans sa file
  (journées exposées par ses apprentis, UC-CAR-02) et/ou dans des fichiers
  JSON locaux (par exemple des runs exportés).

## Garanties en cas de succès

- Le rapport affiche : nombre de runs, « Accord global : X % (distance
  structurelle d) », compétences établies dans **tous** les runs, compétences
  établies dans **certains** runs seulement (statuts groupés, runs numérotés
  1..N), tableau détaillé (une colonne par run, statut + confiance, écart-type
  des confiances).
- Le calcul est local : les fichiers locaux ne sont jamais envoyés ; seuls la
  file et les documents cochés sont lus sur l'API ; rien n'est écrit.

## Garanties minimales (en cas d'échec)

- Aucun rapport n'est calculé sur un document hors schéma ou qui n'est pas
  une journée ; le fichier fautif est ignoré avec un message.

## Scénario nominal

1. La section charge la file (`GET /api/cartographe/cartographies`) et n'en
   garde que les entrées de type `jour` (cases à cocher « titre — apprenant ·
   date ») ; elle charge aussi le référentiel publié (noms des compétences).
2. Le cartographe coche au moins deux runs ; le bouton « Analyser la
   consistance (N document(s)) » s'active à partir de deux.
3. Il clique : la section lit chaque document coché
   (`GET /api/cartographe/cartographies/{id}`), vérifie que c'est une
   `cartographie-jour`, puis appelle le moteur `compareRuns(docs)` et met en
   forme le résultat (`buildConsistencyView`).
4. Le rapport s'affiche :
   - « Accord global » = `(1 − distanceStructurelle) × 100`, arrondi ; la
     distance est la moyenne, sur l'union des compétences et toutes les
     paires de runs, d'une distance ordinale entre statuts (0 identiques,
     0,5 via « renvoi au cartographe », 1 entre « établie » et « non
     établie » ; compétence absente ≡ « non établie ») ;
   - « Compétences stables (établies dans tous les runs) — N » ;
   - « Compétences divergentes — N » : pour chacune, code, nom, et
     « statut (runs i, j) » par statut ;
   - « Détail par compétence » : une ligne par code (triée), une colonne par
     run (badge de statut + confiance en %), écart-type (population) des
     confiances connues.

## Scénarios alternatifs

- **A1 — Runs locaux uniquement** (étape 2) : le cartographe ajoute des
  fichiers JSON (« Ajouter des runs depuis des fichiers locaux ») ; chacun est
  validé au schéma `cartographie-jour` dans le navigateur, listé (« nom
  (journée du AAAA-MM-JJ) ») et compté ; rien n'est envoyé au serveur.
- **A2 — File et fichiers mêlés** (étape 2) : les deux sources s'additionnent
  (runs de la file d'abord, puis fichiers locaux).
- **A3 — Modifier la sélection** (après l'étape 4) : cocher/décocher ou
  « Retirer » un fichier masque le rapport, qui doit être relancé.
- **A4 — Plus de deux runs** (étape 4) : une colonne par run ; les statuts
  sont groupés (« présence établie (runs 1, 3) »).

## Scénarios d'erreur

- **E1 — Fichier local illisible ou hors schéma** (A1) : « « x » n'est pas un
  fichier JSON valide. » ou « « x » ne respecte pas le schéma
  cartographie-jour : fichier ignoré. » ; le fichier n'est pas ajouté.
- **E2 — Document de la file qui n'est pas une journée** (étape 3) : « La
  cartographie N n'est pas un document de journée : retirez-la de la
  sélection. » ; pas de rapport.
- **E3 — Document inaccessible** (étape 3) : par exemple repassé en privée →
  `404` ; « Cartographie introuvable » ; pas de rapport.
- **E4 — File indisponible** (étape 1) : message d'erreur ; la file est vide,
  mais les fichiers locaux restent utilisables.
- **E5 — Moins de deux documents** (étape 2) : bouton inactif.
- **E6 — Pas le rôle cartographe** : espace réservé (UC-CAR-01 E3).

## Règles de gestion

- **RG1** — Au moins deux documents `cartographie-jour` ; tout autre document
  est refusé (engine : `TypeError` si `poles[]` manque).
- **RG2** — « Présente » dans un run = statut « présence établie » ; stable =
  établie dans tous les runs ; divergente = établie dans certains runs
  seulement.
- **RG3** — Distance structurelle ordinale (non établie < renvoi < établie),
  moyenne sur codes × paires ; compétence absente ou statut inconnu ≡ « non
  établie ».
- **RG4** — Écart-type de population, sur les seules confiances numériques
  (une valeur manquante ou non numérique est ignorée ; moins de deux valeurs
  → 0).
- **RG5** — Confidentialité : les fichiers locaux ne quittent pas le
  navigateur (§6.1) ; l'analyse n'écrit rien et n'est pas journalisée.

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/CartographeView.jsx` | Garde de rôle, section `consistance`, menu |
| Front | `web/src/views/cartographe/ConsistanceSection.jsx` | Sélection (file filtrée, fichiers locaux validés), analyse, rendu du rapport, messages |
| Front | `web/src/lib/consistency-view.js` — `STATUT_BADGES`, `statutBadge`, `statutLabel`, `buildConsistencyView` | Modèle d'affichage du rapport |
| Moteur | `engine/src/consistency.js` — `statutDistance`, `compareRuns` (exportés par `engine/src/index.js`) | Mesures |
| Moteur | `engine/src/validation.js` — `validateDocument` | Contrôle des fichiers locaux |
| Front | `web/src/views/cartographe/cartographe-api.js` — `fetchQueue`, `fetchCartographie` | Lecture de la file et des documents (UC-CAR-02) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CAR-07-U01 | `statutDistance` | Échelle ordinale, symétrie, absente/inconnue ≡ non établie (RG3) | `engine/test/usecases/unit/uc-car-07-mesurer-consistance.test.js` |
| UC-CAR-07-U02 | `compareRuns` | Moins de 2 documents, non-liste, merge → `TypeError` explicite (RG1) | idem |
| UC-CAR-07-U03 | `engine/src/index.js` | Export public de `compareRuns`, `statutDistance` | idem |
| UC-CAR-07-U04 | `compareRuns` | Runs identiques (journée réelle) : distance 0, stables, 15 codes | idem |
| UC-CAR-07-U05 | `compareRuns` | Trois runs : divergence détaillée, distance 2/45, écart-type (RG2, RG4) | idem |
| UC-CAR-07-U06 | `compareRuns` | Confiance non numérique / compétence absente → `null`, exclue | idem |
| UC-CAR-07-U07 | `compareRuns` | Limite : non établie vs renvoi ni stable ni divergente | idem |
| UC-CAR-07-U08 | `compareRuns` | Limite : deux dates différentes comparées sans contrôle | idem |
| UC-CAR-07-U09 | `STATUT_BADGES`, `statutBadge`, `statutLabel` | Badges, « non instruite », table figée | `web/test/usecases/unit/uc-car-07-mesurer-consistance.test.js` |
| UC-CAR-07-U10 | `buildConsistencyView` | Accord arrondi, stables nommées, divergentes groupées, lignes triées | idem |
| UC-CAR-07-U11 | `buildConsistencyView` | Run sans la compétence : groupe « non instruite », confiances | idem |
| UC-CAR-07-U12 | `buildConsistencyView` | Limites figées (AN6, L2) | idem |
| UC-CAR-07-U13 | `validateDocument` | Journée acceptée ; merge ou autre refusés | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-07-F01 | Nominal, E5 | IHM | `<App/>` : file filtrée, bouton inactif puis compteur, accord 93 %, stables, divergente nommée, tableau par run, aucune écriture | `web/test/usecases/functional/uc-car-07-mesurer-consistance.test.jsx` |
| UC-CAR-07-F02 | A1 | IHM | Fichiers locaux seulement : liste, rapport, aucun document lu ni écrit sur l'API | idem |
| UC-CAR-07-F03 | A2, A3 | IHM | File + fichier ; « Retirer » masque le rapport et désactive l'analyse | idem |
| UC-CAR-07-F04 | A4 | IHM | Trois runs : cinq colonnes, runs groupés | idem |
| UC-CAR-07-F05 | E1 | IHM | JSON illisible, merge hors schéma : messages, fichiers ignorés | idem |
| UC-CAR-07-F06 | E2 | IHM | Document de la file non-journée : message, pas de rapport | idem |
| UC-CAR-07-F07 | E3 | IHM | Document 404 : message | idem |
| UC-CAR-07-F08 | E4 | IHM | File en erreur, fichiers locaux toujours analysables | idem |
| UC-CAR-07-F09 | AN6 | IHM | « Aucune divergence de statut » avec accord 97 % (comportement actuel) | idem |
| UC-CAR-07-F10 | E6 | IHM | Sans rôle : section réservée, rien n'est lu | idem |

### Tests existants liés (non-régression)

- `engine/src/consistency.test.js` — distance, divergences, écart-type, compétence absente, trois runs.
- `web/src/lib/consistency-view.test.js` — badges, modèle d'affichage branché sur l'engine.
- `web/src/views/cartographe/ConsistanceSection.test.jsx` — filtrage des journées, rapport, fichiers locaux valides/invalides.

### Exécuter

```sh
cd engine && npx vitest run test/usecases/unit/uc-car-07
cd web && npx vitest run test/usecases/unit/uc-car-07 test/usecases/functional/uc-car-07
```

## Anomalies constatées

- **AN6 — « Aucune divergence de statut » affiché à tort.** Le moteur ne
  classe « divergente » qu'une compétence **établie** dans certains runs
  seulement ; une compétence qui oscille entre « présence non établie » et
  « renvoi au cartographe » n'est ni stable ni divergente. Le rapport affiche
  alors « Compétences divergentes — 0 » et « Aucune divergence de statut
  entre les runs. », alors que l'accord global est inférieur à 100 % et que
  la ligne du tableau est marquée instable. Figé par UC-CAR-07-F09, U07, U12.

## Limites

- **L1 — Même journée non vérifiée** : ni l'IHM ni `compareRuns` ne
  contrôlent que les documents portent sur la même date ni sur le même
  portfolio ; deux journées différentes produisent un rapport (U08).
- **L2 — Absente contre « non établie »** : pour la distance, une compétence
  absente d'un run vaut « non établie » (accord 100 %), mais le tableau marque
  la ligne instable (« non instruite » ≠ « présence non établie ») (U12).
