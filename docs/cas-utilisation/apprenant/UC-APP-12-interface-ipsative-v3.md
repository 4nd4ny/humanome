# UC-APP-12 — Explorer sa cartographie dans l'interface ipsative V3

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (avec ou sans compte : l'interface est entièrement locale) |
| **Acteurs secondaires** | Employeur (destinataire du fichier de partage, qu'il ouvre dans cette même interface) ; cartographe (utilise la vue « Cartographe » sur les fichiers que l'apprenant lui remet) |
| **Portée** | humanome.xyz — `#/cartographie` (et `#/merge` sans document chargé) : import de fichiers, vues par persona, grille de tuiles, comparaison, droit de réponse, éditeur JSON, constructeur de partage, réimport |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (visualiser sa cartographie, graphe évolutif ; partager une cartographie choisie), §4.4 (visualisation unifiée), §6.1 et §6.4 (rien ne quitte le navigateur ; partage = décision explicite) |
| **Statut** | Implémenté (interface V3, décision D14 ; vues par persona et grille de tuiles 2026-07-17) — voir anomalies A2 à A5 |

## Objectif

Permettre à l'apprenant d'ouvrir **ses propres** cartographies dans
l'interface ipsative V3, de les explorer sous l'angle qui lui convient
(apprenant, cartographe, employeur, expert), de se comparer **à ses états
antérieurs**, d'exercer son **droit de réponse** sur chaque preuve, et de
préparer une version employeur par **liste positive** — sans que son dossier
privé quitte jamais son navigateur.

Frontière avec [UC-VIS-01](../visiteur/UC-VIS-01-explorer-cartographie-demonstration.md) :
la lecture de la démonstration (mode Simplifié, soleil, heatmap, lecteur,
« Pourquoi ce rayon ? ») y est décrite ; ce cas couvre tout ce qui s'y ajoute
sur les données de l'apprenant — y compris lorsqu'il l'exerce sur le corpus de
démonstration. Le **lien** de partage protégé par mot de passe relève
d'[UC-APP-05](UC-APP-05-partager-avec-employeur.md) ; la V3 produit, elle, un
**fichier** que l'apprenant remet lui-même.

## Déclencheur

L'apprenant ouvre `#/cartographie` (menu « Découvrir » → « Cartographie
(démonstration) ») puis clique « Importer… » dans la barre de contexte.

## Préconditions

- L'apprenant dispose de fichiers de cartographie : documents
  `cartographie-jour` (export d'« Essayer », UC-VIS-03, de ses runs, UC-APP-02),
  ZIP journaliers (`carto_P1.json`…`carto_P7.json` + `kairos.json`) ou ZIP de
  corpus (`<run>/<AAAA-MM-JJ>.zip`), un master V3 (`competency-map-master`), ou
  un instantané employeur (`competency-map-share`).
- Aucune session n'est requise ; le référentiel publié (ou embarqué) est chargé.

## Garanties en cas de succès

- Le dossier importé devient le **master privé** de la session, en mémoire ;
  la source importée n'est jamais réécrite : chaque geste (revue, annotation,
  édition, arbitrage) produit une **révision** (identifiant, parent, numéro).
- Les préférences de présentation (vue, panneaux, disposition des tuiles) sont
  mémorisées **à part** des données d'évaluation (`localStorage`).
- Un partage ne contient que ce qui a été **explicitement** autorisé ;
  identifiants remappés, dates masquées selon la précision choisie.

## Garanties minimales (en cas d'échec)

- Un fichier invalide est mis en **quarantaine** avec une entrée de rapport,
  sans bloquer les autres ; si rien n'est importable, le dossier courant est
  conservé.
- Un instantané employeur dont l'empreinte ne correspond pas n'est ni affiché
  ni dupliqué.
- Un JSON expert invalide ne remplace jamais la révision courante.

## Scénario nominal

1. L'apprenant ouvre `#/cartographie` : la démonstration se charge (UC-VIS-01).
2. Il clique « Importer… » et choisit un ou plusieurs fichiers `.json`/`.zip`.
3. Chaque fichier est lu **localement** et reconnu : document-jour
   (`{date, poles[]}`), ZIP (inventaire, A1), master V3 (A2), pôle isolé (A3),
   instantané employeur (A9) ; sinon « format non reconnu ».
4. Les journées reconnues sont importées (`importJourDocuments`) dans un
   **nouveau** master : une journée par date, une variante par run, passages,
   observations et liens de preuve à identifiants stables ; le projet de
   partage en cours est abandonné ; le rapport d'import (bloquant, à arbitrer,
   avertissement, information) est produit et le panneau « Audit d'import »
   demandé.
5. Le soleil, la heatmap, le lecteur, les indicateurs et le tableau équivalent
   se recalculent sur **son** dossier ; la barre de contexte signale « N
   anomalie(s) à traiter » s'il reste des entrées bloquantes ou à arbitrer.
6. En vue « Expert » (ou « Cartographe »), le rapport d'import détaille les
   entrées par gravité.

## Scénarios alternatifs

- **A1 — Archives ZIP** (étape 3) : un ZIP de corpus (`<run>/<date>.zip`)
  donne une journée par ZIP interne, le run et la date venant des chemins ; un
  ZIP journalier seul voit sa date **proposée** depuis les feuilles des
  passages (« à confirmer »). Deux runs pour une même date rendent la journée
  **à arbitrer** : aucune ne contribue tant que l'apprenant n'a pas choisi,
  dans « Variantes à arbitrer », la variante active (ou « À examiner (ne
  contribue pas) »).
- **A2 — Master V3** (étape 3) : un `competency-map-master` est repris tel
  quel (« Master V3 chargé (révision existante) ») — voir anomalie A3.
- **A3 — Pôle isolé** (étape 3) : un fichier d'un seul pôle déclenche une
  demande de date (« jamais devinée depuis dateGeneration »).
- **A4 — Vues par persona et tuiles** : le sélecteur « Mode » propose
  Simplifié, Employeur, Apprenant, Cartographe, Expert ; chaque vue a ses
  panneaux disponibles et ses panneaux affichés par défaut. Hors Simplifié, les
  panneaux sont des **tuiles** (ordre et tailles propres à chaque persona,
  colonnes selon la largeur) : déplacer par la poignée ⠿ ou ◀ ▶, redimensionner
  par le coin ◢ ou le menu de taille ; la disposition est mémorisée **par vue**.
  Le menu « Panneaux » masque ou réaffiche chaque panneau (« Réafficher les
  panneaux ») ; aucune préférence ne peut rendre un panneau interdit par
  l'audience.
- **A5 — Comparaison avec soi-même** : « Depuis la dernière évaluation » (la
  journée active précédant la tête de lecture), « … du trimestre », « … de
  l'année » ; le récit « Ce qui a changé » n'énonce que des différences
  structurées (nouvelles journées, compétences documentées pour la première
  fois ou observées de nouveau, contextes confirmés), chaque phrase avec ses
  dates. Jamais de cohorte ni de moyenne.
- **A6 — Droit de réponse** : dans le portfolio d'une journée inspectée, chaque
  association passage–compétence peut être **confirmée**, **nuancée** ou
  **contestée** ; contester la dernière preuve d'une observation la retire du
  soleil (réversible) ; une note privée (et la date d'effet) s'enregistre en
  annotation. Les narratifs dépendants deviennent « à revoir ».
- **A7 — Éditeur JSON expert** (vue Expert) : la copie de travail du master est
  validée à chaque frappe ; « Valider (nouvelle révision) » applique un
  document conforme, « Abandonner le brouillon » le jette.
- **A8 — Préparer un partage** (vues Employeur, Apprenant, Expert ; encart
  replié en Simplifié) : rien n'est autorisé au départ ; l'apprenant inclut des
  familles (récapitulatif « Cette action ajoutera N associations… » à
  confirmer) ou des preuves une à une depuis le portfolio (« Inclure au
  partage »), choisit la précision temporelle (jour, mois, masquée) et les
  champs partagés, ajoute des synthèses sans source, puis **prévisualise** la
  vue employeur exacte (même moteur de rendu) ; « Publier et exporter le JSON
  employeur » exige la confirmation « Un fichier transmis ne peut pas être
  révoqué… » — voir anomalie A4.
- **A9 — Ouvrir un fichier employeur** (étape 3) : un `competency-map-share`
  dont l'empreinte est vérifiée s'ouvre en **lecture seule** (« Cartographie
  partagée (lecture seule) », « Forces documentées partagées », preuves,
  synthèses déclarées), sans aucune commande privée ; « Fermer » revient à
  l'espace privé.

## Scénarios d'erreur

- **E1 — Fichier illisible ou inconnu** (étape 3) : `fichier-invalide` ou
  `schema-inconnu` (bloquants) ; si aucune journée n'est importable, le master
  courant est conservé.
- **E2 — Date absente** (A1, A3) : ZIP journalier sans feuilles datées, ou
  demande de date annulée → journée en quarantaine (`date-absente`).
- **E3 — JSON expert invalide** (A7) : « JSON invalide : … » ou liste
  d'erreurs de forme ; « Valider » reste inactif.
- **E4 — Publication non confirmée** (A8) : « publication — Confirmation
  requise : un fichier transmis ne peut pas être révoqué (AC-SHARE-13). » ;
  rien n'est exporté. Prévisualisation absente ou périmée → refus.
- **E5 — Fichier employeur altéré** (A9) : « Erreur d'intégrité : l'empreinte
  recalculée ne correspond pas… » (bloquant) ; ni affichage ni duplication.

## Règles de gestion

- **RG1** — Client-first : master, projets et révisions restent en mémoire
  dans le navigateur ; seules les préférences de présentation sont persistées.
- **RG2** — Identifiants stables dérivés des octets et positions d'origine
  (UUIDv5) ; deux runs d'une même date ne sont jamais additionnés.
- **RG3** — États séparés : vue, panneaux, thème, filtre, inspection, tête de
  lecture et projet de partage sont indépendants ;
  `panneaux rendus = affichés ∩ (capacités du format ∩ audience ∩ vue)`.
- **RG4** — Liste positive : un projet neuf n'exporte aucune preuve ; retirer
  = « Retirer de cette version partagée », jamais supprimer du dossier.
- **RG5** — L'instantané employeur est reconstruit depuis la liste blanche,
  identifiants remappés, compteurs recalculés ; publication bloquée sur
  relation orpheline ou fuite d'un verbatim exclu ; empreinte SHA-256 de la
  forme canonique (`integrity.contentDigest`).
- **RG6** — La comparaison est ipsative : états de la même personne seulement.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Fichiers importés, master, révisions | En mémoire du navigateur ; jamais envoyés ; perdus au rechargement |
| Préférences (vue, panneaux, tuiles) | `localStorage` : `humanome-v3-presentation`, `humanome-v3-tiles-<vue>` |
| Instantané employeur | Fichier téléchargé localement, remis par l'apprenant ; irrévocable une fois transmis |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/v3/ui/V3View.jsx` — `handleImportFiles`, `V3Panels`, dispositions par persona | Import, aiguillage des formats, vues, tuiles |
| Front | `web/src/v3/core/zip.js` — `listZipEntries`, `readZipEntry`, `isSafeZipPath`, `inventoryZip` | Archives ZIP (A1) |
| Front | `web/src/v3/core/import.js` — `importJourDocuments`, `chooseVariant`, `correctEffectiveDate`, `summarizeReport` ; `adapters.js` ; `ids.js` | Import, arbitrage (RG2) |
| Front | `web/src/v3/core/master.js` — `reviewEvidenceLink`, `reviewObservation`, `annotate`, `applyExpertJson`, `validateMasterShape`, `masterDigest` | Révisions, droit de réponse, éditeur |
| Front | `web/src/v3/core/compare.js` — `resolveBaselinePreset`, `compareStates`, `whatChanged` | Comparaison ipsative (RG6) |
| Front | `web/src/v3/core/state.js` — `availablePanels`, `defaultVisiblePanels`, `switchMode`, `INTERFACE_MODES` | Vues par persona (RG3) |
| Front | `web/src/v3/ui/tile-grid.jsx` — `TileGrid`, `orderedTiles`, `moveTile`, `columnsForWidth`, `TILE_SIZES` | Grille de tuiles |
| Front | `web/src/v3/ui/panels.jsx` (`PortfolioPanel`), `tools.jsx` (`ComparePanel`, `ImportReportPanel`, `ArbitragePanel`, `JsonEditorPanel`) | Panneaux interactifs |
| Front | `web/src/v3/core/share.js` — `newShareProject`, `planScopeInclusion`, `applyScopeInclusion`, `scopeTriState`, `setLinkShared`, `configureProject`, `addLearnerSummary`, `buildShareSnapshot`, `lockPreview`, `publishSnapshot`, `shareFilename` ; `web/src/v3/ui/share-ui.jsx` (`ShareBuilder`, `EmployerView`) | Partage par liste positive (RG4, RG5) |
| Front | `web/src/v3/core/reimport.js` — `openShareSnapshot`, `duplicateAsProject`, `snapshotToViewModel` ; `canonical-json.js` | Réimport vérifié |
| Front | `web/src/v3/core/metrics.js` — `countLabel` | Libellés des comptes (vue employeur) |
| Front | `web/src/v3/core/store.js` — `createV3Store`, `createMemoryAdapter` | Persistance locale (non branchée, voir Limites) |
| Front | `web/src/lib/download-json.js` — `downloadJson` | Export local du fichier employeur |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-12-U01 | `listZipEntries`, `readZipEntry`, `isSafeZipPath` | Entrées lues, traversée refusée, archive tronquée | `web/test/usecases/unit/uc-app-12-interface-ipsative-v3.test.js` |
| UC-APP-12-U02 | `inventoryZip` (corpus) | Run et date des chemins, kairos relu, JSON invalide en quarantaine, journée incomplète | idem |
| UC-APP-12-U03 | `inventoryZip` (journalier) | Date proposée depuis les feuilles, « à confirmer » | idem |
| UC-APP-12-U04 | `inventoryZip` | **Comportement actuel figé** — anomalie A2 | idem |
| UC-APP-12-U05 | `importJourDocuments`, `chooseVariant`, `correctEffectiveDate` | Journée à arbitrer, choix, retour, variante étrangère, date corrigée (RG2) | idem |
| UC-APP-12-U06 | `reviewEvidenceLink`, `reviewObservation`, `masterDigest` | Contester retire, révision chaînée, source intacte, narratifs « à revoir », revue groupée | idem |
| UC-APP-12-U07 | `annotate`, `resolveBaselinePreset`, `compareStates`, `whatChanged` | Préréglages, états comparés, tags de la période, récit sans cohorte (RG6) | idem |
| UC-APP-12-U08 | `validateMasterShape`, `applyExpertJson` | Invalide refusé, valide = révision | idem |
| UC-APP-12-U09 | `availablePanels`, `defaultVisiblePanels`, `switchMode` | Panneaux par persona, audience bornante, mémoire par vue (RG3) | idem |
| UC-APP-12-U10 | `orderedTiles`, `moveTile`, `columnsForWidth`, `TILE_SIZES` | Ordre mémorisé, déplacement, colonnes, tailles | idem |
| UC-APP-12-U11 | `newShareProject`, `planScopeInclusion`, `applyScopeInclusion`, `scopeTriState`, `setLinkShared`, `configureProject`, `addLearnerSummary`, `buildShareSnapshot`, `shareFilename` | Liste positive, précision mensuelle, remappage, synthèse, empreinte (RG4, RG5) | idem |
| UC-APP-12-U12 | `lockPreview`, `publishSnapshot` | Prévisualisation à jour et confirmation exigées | idem |
| UC-APP-12-U13 | `openShareSnapshot`, `duplicateAsProject`, `snapshotToViewModel` | Intégrité, quarantaine, duplication monotone | idem |
| UC-APP-12-U14 | `createV3Store`, `createMemoryAdapter` | Révisions, dernière par jeu de données, projets, préférences | idem |
| UC-APP-12-U15 | `validateMasterShape`, `computeEvents` | **Comportement actuel figé** — anomalie A3 | idem |
| UC-APP-12-U16 | `buildShareSnapshot`, `publishSnapshot` | **Comportement actuel figé** — anomalie A4 | idem |
| UC-APP-12-U17 | `countLabel` | **Comportement actuel figé** — anomalie A5 | idem |
| UC-APP-12-U18 | `downloadJson` | Export local : Blob JSON, nom de fichier neutre, lien retiré | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-12-F01 | Nominal | IHM | Deux journées JSON → dossier remplacé ; rapport en vue Expert (absent en Simplifié) | `web/test/usecases/functional/uc-app-12-interface-ipsative-v3.test.jsx` |
| UC-APP-12-F02 | A1 | IHM | ZIP corpus, journée à arbitrer sans contribution, choix de variante | idem |
| UC-APP-12-F03 | A2 | IHM | Master V3 chargé tel quel | idem |
| UC-APP-12-F04 | E1 | IHM | Illisible / inconnu → anomalies, dossier conservé | idem |
| UC-APP-12-F05 | A3, E2 | IHM | Pôle isolé : date demandée ; annulée → quarantaine | idem |
| UC-APP-12-F06 | Anomalie A2 | IHM | **Comportement actuel figé** — ZIP daté par son nom refusé | idem |
| UC-APP-12-F07 | Anomalie A3 | IHM | **Comportement actuel figé** — master incomplet : l'interface plante | idem |
| UC-APP-12-F08 | A4 | IHM | Vue Apprenant en tuiles, réordonner, mémoire par vue, masquer/réafficher | idem |
| UC-APP-12-F09 | A5 | IHM | Préréglage indisponible puis récit référencé, retrait | idem |
| UC-APP-12-F10 | A6 | IHM | Contester retire du soleil ; confirmer ; note privée en révision | idem |
| UC-APP-12-F11 | A7, E3 | IHM | JSON invalide refusé, abandon, JSON valide = révision | idem |
| UC-APP-12-F12 | A8, anomalie A4 | IHM | Famille, mois, synthèse, prévisualisation exacte ; **comportement actuel figé** : publication refusée | idem |
| UC-APP-12-F13 | E4 | IHM | Publication non confirmée → refus, rien exporté | idem |
| UC-APP-12-F14 | A9, E5 | IHM | Fichier employeur en lecture seule ; altéré → quarantaine | idem |

### Tests existants liés (non-régression)

- `web/src/v3/core/import.test.js` — identifiants, empreintes, adaptateurs, arbitrage, admissibilité, métriques.
- `web/src/v3/core/share.test.js` — révisions, comparaison, panneaux, partage (AC-SHARE-01 à 20), réimport.
- `web/src/v3/ui/V3View.test.jsx`, `web/src/v3/ui/tile-grid.test.jsx`.
- Guides : `content/formation/apprenant/07-interface-cartographie-ipsative.md`, `content/formation/cartographe/07-…`, `content/formation/employeur/06-…`.

### Exécuter

```sh
cd web && npx vitest run test/usecases/unit/uc-app-12 test/usecases/functional/uc-app-12
```

## Anomalies constatées

- **A2 — Date du nom d'un ZIP journalier ignorée.** `V3View.handleImportFiles`
  extrait `AAAA-MM-JJ` du nom `…/AAAA-MM-JJ.zip` mais ne l'applique qu'aux
  entrées **déjà** datées (`m && !e.sourceDate`), alors que `inventoryZip`
  (appelé sans date) ne renvoie une entrée que s'il a pu dater la journée par
  les feuilles. Un ZIP journalier nommé par sa date mais sans champ `feuille`
  est donc mis en quarantaine (`date-absente`) ; avec des feuilles, la date est
  marquée « à arbitrer » alors que le nom la donnait. Figé par U04 et F06.
- **A3 — Master importé sans validation.** Un fichier
  `kind: "competency-map-master"` est chargé par `setMaster(parsed)` sans
  `validateMasterShape` ; un master incomplet fait échouer `computeEvents`
  pendant le rendu et, faute de frontière d'erreur, **toute l'application**
  disparaît. Figé par U15 et F07.
- **A4 — Publication du partage employeur impossible depuis l'IHM.**
  `ShareBuilder.exportSnapshot` reconstruit l'instantané au moment de
  publier ; chaque construction tire de nouveaux identifiants publics et une
  nouvelle date de génération, donc une empreinte différente de celle
  verrouillée à la prévisualisation. `publishSnapshot` répond toujours
  « La prévisualisation est obsolète… » : le fichier employeur n'est **jamais**
  téléchargé (le moteur publie correctement l'instantané prévisualisé, U16).
  Figé par U16 et F12.
- **A5 — Libellé mal accordé** (précision « mois ») : `countLabel` affiche
  « 1 mois documentée », « 2 mois documentée » dans la vue employeur. Figé par
  U17.

## Limites

- **L1** — Aucune persistance du dossier : `web/src/v3/core/store.js`
  (IndexedDB, révisions, projets) existe et fonctionne (U14) mais n'est branché
  nulle part ; un rechargement de la page perd l'import, les revues et le
  projet de partage.
- **L2** — En vue « Simplifié » (vue par défaut), l'audit d'import n'est pas un
  panneau disponible : après un import, seul le badge « N anomalie(s) à
  traiter » apparaît (et seulement pour les entrées bloquantes ou à arbitrer).
- **L3** — La date proposée d'un ZIP journalier (« à confirmer ») n'a pas de
  commande de confirmation dans l'interface.
- **L4** — Le menu n'a pas d'entrée « ma cartographie V3 » dans la famille de
  l'apprenant : on y accède par « Cartographie (démonstration) », puis
  « Importer… ».
