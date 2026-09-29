# UC-CAR-07 — Mesurer la consistance multi-run

| Champ | Valeur |
|---|---|
| **Acteur principal** | Cartographe (rôle `cartographe`) |
| **Acteurs secondaires** | Apprenant (ses journées exposées peuvent servir de runs) ; promptologue (destinataire, hors application, d'un diagnostic « prompt instable » transmis manuellement — formation cartographe, chapitre 6 ; aucun écran ni aucune route ne le lui transmet) |
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
lien « Analyser la consistance multi-run → » de la file, affiché seulement
si la file compte au moins deux cartographies, tous types confondus).

## Préconditions

- Le cartographe est connecté avec le rôle `cartographe`.
- Il dispose d'au moins deux documents `cartographie-jour` : dans sa file
  (journées exposées par ses apprentis, UC-CAR-02) et/ou dans des fichiers
  JSON locaux (par exemple des runs exportés).

## Garanties en cas de succès

- Le rapport affiche : nombre de runs, « Accord global : X % (distance
  structurelle d) », compétences établies dans **tous** les runs, compétences
  établies dans **certains** runs seulement (statuts groupés, runs numérotés
  1..N — dans l'ordre de sélection pour la file, puis d'ajout des fichiers ;
  le rapport ne rappelle pas quel document porte quel numéro, voir AN19),
  tableau détaillé (une colonne par run, statut + confiance, écart-type des
  confiances).
- Le calcul est local : les fichiers locaux ne sont jamais envoyés ; seuls la
  file et les documents cochés sont lus sur l'API ; rien n'est écrit.

## Garanties minimales (en cas d'échec)

- Fichiers locaux : validés au schéma `cartographie-jour` ; un fichier fautif
  est ignoré avec un message (E1), les autres fichiers du lot sont ajoutés.
- Documents de la file : seul `kind` est contrôlé ; un document qui n'est pas
  une journée fait refuser **toute** l'analyse (E2), un document étiqueté
  journée mais hors schéma est analysé tel quel (L3).

## Scénario nominal

1. La section charge la file (`GET /api/cartographe/cartographies`) et n'en
   garde que les entrées de type `jour` (cases à cocher « titre — apprenant ·
   date de dépôt » : `createdAt`, la projection de la file ne porte pas la
   date de la journée) ; elle charge aussi le référentiel publié (noms des
   compétences).
2. Le cartographe coche au moins deux runs ; le bouton « Analyser la
   consistance (N document(s)) » s'active à partir de deux.
3. Il clique (bouton « Analyse… », désactivé, pendant le calcul) : la section
   lit chaque document coché (`GET /api/cartographe/cartographies/{id}`),
   vérifie que `document.kind` vaut `cartographie-jour` (pas de validation
   au schéma pour la file), puis appelle le moteur `compareRuns(docs)` et
   met en forme le résultat (`buildConsistencyView`).
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
  (runs de la file d'abord, dans l'ordre où ils ont été cochés, puis
  fichiers locaux dans l'ordre d'ajout).
- **A3 — Modifier la sélection** (après l'étape 4) : cocher/décocher, ajouter
  ou « Retirer » un fichier masque le rapport, qui doit être relancé (sauf
  pendant une analyse en cours, voir AN20).
- **A4 — Plus de deux runs** (étape 4) : une colonne par run ; les statuts
  sont groupés (« présence établie (runs 1, 3) »).

## Scénarios d'erreur

- **E1 — Fichier local illisible ou hors schéma** (A1) : « « x » n’est pas un
  fichier JSON valide. » ou « « x » ne respecte pas le schéma
  cartographie-jour : fichier ignoré. » ; le fichier n'est pas ajouté. Dans
  un lot de plusieurs fichiers, les fichiers valides sont ajoutés et seul le
  message du **dernier** fichier fautif reste affiché.
- **E2 — Document de la file qui n'est pas une journée** (étape 3) : « La
  cartographie N n’est pas un document de journée : retirez-la de la
  sélection. » ; toute l'analyse est refusée, pas de rapport.
- **E3 — Document inaccessible** (étape 3) : par exemple repassé en privée →
  `404` ; « Cartographie introuvable » ; pas de rapport.
- **E4 — File indisponible** (étape 1) : message d'erreur ; la file est vide,
  mais les fichiers locaux restent utilisables.
- **E5 — Moins de deux documents** (étape 2) : bouton inactif.
- **E6 — Pas le rôle cartographe** : espace réservé (UC-CAR-01 E3).
- **E7 — Document de la file étiqueté journée mais sans pôles** (étape 3) :
  le contrôle de `kind` passe, le moteur lève une `TypeError` dont le
  message technique est affiché tel quel (« compareRuns : docs[0] n'est pas
  un document cartographie-jour (poles[] manquant) ») ; il désigne le
  document par son index (à partir de 0) dans la liste fusionnée, pas par
  son id ; pas de rapport.

## Règles de gestion

- **RG1** — Au moins deux documents `cartographie-jour`. Le refus se fait
  dans l'IHM : au schéma pour les fichiers locaux, sur le seul `kind` pour
  la file ; le moteur ne refuse qu'un document sans `poles[]` (`TypeError`).
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

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Fichiers locaux (runs exportés) | Lus dans le navigateur, jamais envoyés au serveur ; gardés en mémoire de la section seulement |
| Documents de la file | Lus par `GET` (contrôle d'accès de UC-CAR-02), gardés en mémoire le temps de l'analyse |
| Rapport | Calculé dans le navigateur ; rien n'est écrit, aucun événement d'audit, rien n'est transmis à un tiers |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/CartographeView.jsx`, `web/src/nav.js` | Garde de rôle, section `consistance`, menus |
| Front | `web/src/views/cartographe/AccueilSection.jsx` | Lien « Analyser la consistance multi-run → » (file ≥ 2 entrées) |
| Front | `web/src/views/cartographe/ConsistanceSection.jsx` | Sélection (file filtrée, fichiers locaux validés), analyse, rendu du rapport, messages |
| Front | `web/src/data/referentiel.js` — `loadPublishedReferentiel` | Noms des compétences (étape 1) |
| Front | `web/src/api/client.js` — `apiFetch` | Messages d'erreur du serveur (E3, E4) |
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
| UC-CAR-07-U10 | `buildConsistencyView` | Accord arrondi, stables nommées, divergentes groupées, lignes triées (y compris un résultat aux clés dans le désordre) | idem |
| UC-CAR-07-U11 | `buildConsistencyView` | Run sans la compétence : groupe « non instruite », confiances | idem |
| UC-CAR-07-U12 | `buildConsistencyView` | Limites figées (AN6, L2) | idem |
| UC-CAR-07-U13 | `validateDocument` | Journée acceptée ; merge ou autre refusés | idem |

`fetchQueue` et `fetchCartographie` sont testés unitairement par UC-CAR-02
(U07 à U09) ; le `404` d'une cartographie repassée en privée (E3) est
démontré côté API par UC-CAR-02 (E2, F06). `ConsistanceSection` et
`CartographeView` n'ont pas de test unitaire UC propre : leur logique est
couverte par F01 à F15 et par `web/src/views/cartographe/ConsistanceSection.test.jsx`.

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CAR-07-F01 | Nominal, E5 | IHM | `<App/>` : file filtrée, bouton inactif puis compteur, accord 93 %, stables, divergente nommée, tableau par run, uniquement des `GET` | `web/test/usecases/functional/uc-car-07-mesurer-consistance.test.jsx` |
| UC-CAR-07-F02 | A1 | IHM | Fichiers locaux seulement : liste, rapport, aucun document lu sur l'API, uniquement des `GET` | idem |
| UC-CAR-07-F03 | A2, A3 | IHM | File + fichier : run 1 = file, run 2 = fichier ; décocher, ajouter un fichier, « Retirer » masquent le rapport | idem |
| UC-CAR-07-F04 | A4 | IHM | Trois runs : cinq colonnes, runs groupés | idem |
| UC-CAR-07-F05 | E1 | IHM | JSON illisible, merge hors schéma : messages, fichiers ignorés ; lot mixte : fichier valide ajouté, seul le dernier message affiché | idem |
| UC-CAR-07-F06 | E2 | IHM | Document de la file non-journée : message, pas de rapport | idem |
| UC-CAR-07-F07 | E3 | IHM | Document 404 : message | idem |
| UC-CAR-07-F08 | E4 | IHM | File en erreur (file vide affichée), fichiers locaux toujours analysables | idem |
| UC-CAR-07-F09 | AN6 | IHM | « Aucune divergence de statut » avec accord 97 % (comportement actuel) | idem |
| UC-CAR-07-F10 | E6 | IHM | Sans rôle : section réservée, rien n'est lu | idem |
| UC-CAR-07-F11 | L3 | IHM | Documents de la file hors schéma (`poles: []`, statut inventé) : rapport à 100 %, aucune alerte (comportement actuel) | idem |
| UC-CAR-07-F12 | AN19 | IHM | Second document coché en premier : il devient le « run 1 » ; le rapport ne nomme aucun document (comportement actuel) | idem |
| UC-CAR-07-F13 | AN20 | IHM | Bouton « Analyse… » désactivé ; deux runs décochés pendant l'analyse : rapport à 3 runs affiché, compteur à 1 (comportement actuel) | idem |
| UC-CAR-07-F14 | E7 | IHM | Document de la file sans pôles : message technique du moteur (`docs[0]`), pas de rapport | idem |
| UC-CAR-07-F15 | Limite | IHM | Même fichier ajouté deux fois : deux runs, accord 100 % (aucun dédoublonnage) | idem |

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
- **AN19 — Runs numérotés dans l'ordre des clics, sans identification.** Pour
  la file, les runs sont numérotés dans l'ordre d'insertion de l'ensemble
  des cases cochées (ordre des clics), pas dans l'ordre d'affichage ; les
  fichiers locaux suivent, dans l'ordre d'ajout. Le rapport (« Run 1 »,
  « présence établie (run 1) ») ne rappelle jamais quel document porte quel
  numéro, et décocher puis recocher une case change la numérotation : les
  divergences ne peuvent pas être rattachées aux documents. Figé par
  UC-CAR-07-F12.
- **AN20 — Rapport périmé si la sélection change pendant l'analyse.**
  `analyse()` capture la sélection puis appelle `setView` après ses `await` ;
  pendant ce temps, les cases, le champ fichier et « Retirer » restent
  actifs et le masquage du rapport (A3) est écrasé : le rapport de
  l'ancienne sélection s'affiche sous un compteur qui ne lui correspond
  plus. Figé par UC-CAR-07-F13.

## Limites

- **L1 — Même journée non vérifiée** : ni l'IHM ni `compareRuns` ne
  contrôlent que les documents portent sur la même date, le même portfolio,
  le même prompt ni la même version de prompt ; deux journées différentes
  produisent un rapport (U08). Pour les documents de la file, la date de la
  journée n'est même pas visible avant l'analyse (seule la date de dépôt est
  affichée).
- **L2 — Absente contre « non établie »** : pour la distance, une compétence
  absente d'un run vaut « non établie » (accord 100 %), mais le tableau marque
  la ligne instable (« non instruite » ≠ « présence non établie ») (U12).
- **L3 — Document de la file hors schéma analysé tel quel** : seul `kind` est
  contrôlé pour la file ; un document étiqueté `cartographie-jour` mais non
  conforme (pôles vides, statut inventé) produit un rapport (accord 100 %
  dans l'exemple de UC-CAR-07-F11). Le stockage (`POST /api/cartographies`)
  ne valide pas le schéma : de tels documents peuvent être dans la file.
- **Doublons non détectés** : le même fichier peut être ajouté deux fois (le
  champ est réinitialisé exprès), ou un document de la file coché en même
  temps que son export local : le run est comparé à lui-même et l'accord est
  gonflé (UC-CAR-07-F15).
