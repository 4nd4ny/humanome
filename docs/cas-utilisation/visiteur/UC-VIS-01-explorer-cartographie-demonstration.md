# UC-VIS-01 — Explorer la cartographie de démonstration

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) |
| **Acteurs secondaires** | Aucun pour les données (fichiers statiques servis avec le site) ; l'API n'est sollicitée que par la sonde de session du shell (`GET api/auth/me`, UC-VIS-04) |
| **Portée** | humanome.xyz — routes publiques `#/cartographie`, `#/merge`, `#/jour/<AAAA-MM-JJ>[?focus=<code>]` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.1 (voir une démo sans compte), §4.3 (vision chronologique issue du merge), §4.4 (visualisation unifiée, smartphone, version imprimable), §6.1 (rien ne quitte le navigateur) |
| **Statut** | Implémenté (vues historiques P2/chantier C ; interface V3 en démonstration depuis D14) |

## Objectif

Permettre à un visiteur de découvrir, sans compte et sans qu'aucune donnée ne
soit lue ni envoyée par l'API, ce qu'est une cartographie de compétences humaines : le **soleil** des compétences
documentées, le **calendrier** des journées, la **lecture temporelle** de la
construction du profil, le détail d'une **journée** (verdicts, examen du
pédagogue, traces) — et de l'imprimer ou de le lire sur téléphone.

Frontière avec [UC-APP-12](../apprenant/UC-APP-12-interface-ipsative-v3.md) :
ce cas couvre la **lecture** de la démonstration (mode « Simplifié » par défaut)
et les vues historiques. Les imports de fichiers dans l'interface V3, les vues
par persona, la grille de tuiles, la comparaison, le droit de réponse et le
constructeur de partage relèvent d'UC-APP-12, même lorsqu'ils s'exercent sur le
corpus de démonstration.

## Déclencheur

Le visiteur choisit « Cartographie (démonstration) » dans la famille
« Découvrir » du menu (`#/cartographie`), clique « Explorer la cartographie de
démonstration » sur l'accueil (`#/merge`), ou suit un lien direct vers une
journée (`#/jour/<iso>`, éventuellement `?focus=<code>`).

## Préconditions

- Le site statique est servi en HTTP(S) : le corpus de démonstration
  (`data/demo/jours/index.json` + un document `cartographie-jour` par journée)
  est à côté de `index.html` (ADR-003). Sur une copie ouverte en `file://`,
  seule la vue journée signale explicitement l'impossibilité.
- Aucune session n'est requise ; une session éventuelle ne change rien au cas.

## Garanties en cas de succès

- Le visiteur voit la cartographie de démonstration ; toutes les données sont
  **lues** depuis des fichiers statiques relatifs (`data/…`), en `GET`, et
  **importées en mémoire** dans le navigateur (master privé V3). La vue de
  démonstration (`V3View`, `DayView`) ne fait **aucune** requête d'API ; le
  shell de l'application fait un unique `GET api/auth/me` (sans corps, aucune
  donnée de portfolio) pour adapter le menu (UC-VIS-04). Aucun envoi de données.
- Les commandes de lecture (filtre, inspection, tête de lecture, lecture
  animée, thème de surface, distinctions renforcées) ne modifient jamais les
  données ni les calculs (états séparés).

## Garanties minimales (en cas d'échec)

- Un message explique l'échec (chargement impossible, journée absente, réseau,
  `file://`, date invalide) : entièrement en français pour la vue journée ; pour
  l'interface V3 (E1), un préfixe français suivi de la cause technique brute
  (ex. « Chargement impossible : Failed to fetch »). Une journée du corpus
  servie en erreur HTTP avec un corps JSON donne en revanche une démonstration
  **partielle** (anomalie AN3).
- Aucun contenu narratif n'est injecté sans assainissement DOMPurify (ADR-007).

## Scénario nominal

1. Le visiteur ouvre `#/cartographie` (menu « Découvrir » → « Cartographie
   (démonstration) »). Le routeur par hash (ADR-009) sélectionne l'interface V3
   (`V3View`) ; la zone principale passe en pleine largeur (`app-main--full`).
2. La vue affiche « Chargement du référentiel… » et charge le référentiel
   publié (`data/referentiel/index.json` puis le fichier indiqué) ; en cas
   d'échec, elle se replie **silencieusement** sur le référentiel RESPIRE v7
   embarqué dans le bundle. Le référentiel est normalisé (7 familles avec
   symbole et motif stables, 61 compétences).
3. La vue affiche « Chargement du corpus de démonstration… », lit
   `data/demo/jours/index.json` puis chaque `data/demo/jours/<date>.json`
   (provenance `démonstration`).
4. Le corpus est importé **en mémoire** (`importJourDocuments`) : une journée
   par date, une observation par compétence et par pôle, des liens de preuve
   vers les passages. Les événements sont calculés : seule une **présence
   établie**, non court-circuitée, soutenue par au moins un lien **résolu** et
   non contesté, d'une variante active, compte (RG2).
5. L'interface s'affiche en mode **Simplifié** : barre de contexte
   (« Cartographie ipsative », « Toutes les compétences · audience apprenant
   (privé) · état complet »), soleil, heatmap « Journées », lecteur temporel,
   légende, indicateurs (compétences et journées documentées, observations
   admissibles, en attente de révision), un tableau textuel équivalent au
   soleil (accessibilité et impression) et un bloc replié « Préparer un
   partage » (constructeur de partage, UC-APP-12 — absent des panneaux
   disponibles du mode Simplifié, mais rendu replié par `V3View`).
6. Le soleil ne montre que les compétences **documentées** à la tête de
   lecture ; le rayon d'un secteur compte les journées documentées selon la
   métrique `documented-days-v1` (RG3).
7. Le visiteur clique un secteur : il devient la **portée active** (barre de
   contexte : « Filtre : comp-<code> ») ; le soleil **atténue** les autres
   secteurs sans les retirer ; la heatmap, les indicateurs, le portfolio et le
   tableau équivalent restent inchangés (le filtre ne les concerne pas). La
   touche `w` sur un secteur ouvre « Pourquoi ce rayon ? » (métrique, compte
   exact, journées contributrices).
8. Le visiteur clique une case de la heatmap (une case sans observation n'est
   pas inspectable) : la journée est **inspectée** **sans déplacer** la tête de
   lecture (RG4) ; en mode Simplifié, le panneau portfolio n'est pas affiché :
   la barre de contexte propose « Réouvrir le portfolio (<date>) », qui affiche
   le portfolio de la journée (observations, provenance, passages). « Voir
   l'état à cette date » déplace la tête de lecture : le soleil ne montre plus
   que les compétences documentées jusqu'à cette date (celles documentées
   après **disparaissent**) ; un contour pointillé « fantôme » prolonge les
   secteurs visibles qui gagneront encore des journées après la tête de
   lecture.
9. Le visiteur retire le filtre (« Toutes les compétences » dans la barre, le
   centre du soleil ou la puce du filtre).

## Scénarios alternatifs

- **A1 — Entrée par l'accueil** (étape 1) : le bouton « Explorer la
  cartographie de démonstration » mène à `#/merge` ; sans document chargé par
  l'utilisateur, `#/merge` affiche **la même** interface V3 (l'ancienne vue
  merge n'est plus la démonstration).
- **A2 — Lecture temporelle** (étape 8) : le lecteur « Lecteur temporel »
  permet d'aller au début ou à la fin, d'avancer ou reculer d'une journée, de
  lancer la lecture (avant ou arrière) à ×0,5, ×1 ou ×2 ; la tête de lecture
  avance d'une journée **documentée** à chaque pas et la lecture s'arrête
  d'elle-même à la dernière (ou à la première en lecture arrière). Depuis
  l'état complet (vue par défaut), la tête est déjà sur la dernière journée :
  la lecture avant s'arrête aussitôt — aller au début d'abord. Inspecter une
  journée met la lecture en pause ; relancer ferme une inspection non
  épinglée.
- **A3 — Vue journée** (déclencheur) : `#/jour/<iso>` affiche la journée
  (`DayView`) : badge « Journée du JJ/MM/AAAA », liens vers les journées
  précédente et suivante du corpus, « ← Retour à la cartographie » (`#/merge`),
  soleil du jour, liste des compétences « Hors diagramme ce jour » (non
  établies, court-circuits). Toucher une compétence affiche son verdict, l'examen
  adversarial du pédagogue et les traces retenues.
- **A4 — Lien ciblé** (A3) : `?focus=<code>` présélectionne la compétence dès
  que le diagramme est prêt.
- **A5 — Accessibilité et confort** (étape 5) : « Renforcer les distinctions
  (daltonisme) » ajoute un motif par famille aux secteurs ; « Surface »
  (Système / Clair / Sombre) change le thème de l'interface V3. Ni l'un ni
  l'autre ne change les calculs.
- **A6 — Impression et smartphone** (étapes 5 et A3) : « Aperçu avant
  impression » (V3) ou « Imprimer » (vues historiques) ouvre l'impression ; le
  temps d'imprimer, tous les `<details>` fermés sont ouverts puis refermés
  (`beforeprint`/`afterprint`). Sous 768 px, les vues historiques basculent
  entre les onglets « Diagramme » et « Détails » (toucher un secteur ouvre
  « Détails »).
- **A7 — Cartographie chargée localement** (déclencheur, depuis l'accueil) :
  « Charger ma cartographie (JSON) » ou un glisser-déposer lit un document
  `cartographie-merge` ou `cartographie-jour` **dans le navigateur** et le
  valide contre son schéma. Un merge ouvre la vue chronologique historique
  (`MergeView`, `#/merge`) : badges (feuilles, période, compétences établies),
  lecteur de construction feuille par feuille, calendrier synchronisé (les
  feuilles « à venir » sont inertes, un clic ouvre la journée), panneau de
  détails avec le narratif assaini. Une journée ouvre directement
  `#/jour/<date>`, servie depuis la mémoire.

## Scénarios d'erreur

- **E1 — Corpus ou référentiel injoignable** (étapes 2-3) : si l'index ou une
  journée du corpus ne peut être lu **au niveau réseau** (panne) ou n'est pas
  du JSON, la vue affiche « Chargement impossible : <cause technique brute> »
  et rien d'autre (le référentiel, lui, a toujours son repli). Le statut HTTP
  n'est pas contrôlé : une journée en erreur HTTP à corps JSON est mise en
  quarantaine et la démonstration s'affiche partielle (anomalie AN3) ; un
  index en erreur HTTP à corps JSON donne « Chargement impossible :
  index.map is not a function ».
- **E2 — Date impossible** (A3) : `#/jour/2026-02-30` (ou toute date non
  calendaire) n'est pas une route : page « Page introuvable » avec « Retour à
  l'accueil ».
- **E3 — Journée indisponible** (A3) : 404 → « Aucune cartographie de journée
  pour le JJ/MM/AAAA. » ; autre statut → « Erreur de chargement … (HTTP n) » ;
  réseau → « … (réseau indisponible ?) » ; `file://` → message invitant à
  utiliser le site en ligne ou un serveur local.
- **E4 — Fichier local invalide** (A7) : JSON illisible (« Ce fichier n'est pas
  un JSON valide. »), ancien `carto-data.js` (message de conversion), `kind`
  inconnu, ou document non conforme au schéma (liste des 8 premières erreurs) ;
  le visiteur reste sur l'accueil.

## Règles de gestion

- **RG1** — Client-first (ADR-001, cahier §6.1) : la démonstration ne fait
  que des `GET` de fichiers statiques relatifs (seule la sonde de session du
  shell, `GET api/auth/me`, touche l'API) ; le master V3 et les documents
  chargés localement vivent en mémoire et disparaissent au rechargement.
- **RG2** — Admissibilité d'un événement : statut normalisé `established`, pas
  de court-circuit, variante active, ≥ 1 lien résolu non contesté. `verdict.confiance`
  n'entre ni dans l'admissibilité ni dans le rayon.
- **RG3** — Rayon : `min(1, log2(1+n)/log2(65))` où n = journées distinctes
  documentées ≤ tête de lecture (référence graphique 64, « 64+ … » au-delà) ;
  la heatmap utilise des seuils fixes (0 · 1 · 2–3 · 4–7 · ≥ 8).
- **RG4** — Inspecter une journée n'est pas déplacer la tête de lecture ; seule
  « Voir l'état à cette date » (ou le lecteur) la déplace.
- **RG5** — Le soleil n'affiche que les compétences documentées (écart assumé
  à la spec V3, décision 2026-07-17) ; l'arbre (UC-APP-12) montre les 61.
- **RG6** — Tout HTML narratif passe par DOMPurify (balises média, formulaires,
  styles et attributs réseau interdits), **puis** les liens hérités
  `feuilles/<date>/carto-day.html[?focus=]` sont réécrits en `#/jour/…` (ADR-007).
- **RG7** — Une route de journée exige une date calendaire valide ; les
  journées voisines viennent des feuilles du merge (merge de démonstration
  **embarqué** au build — `web/public/data/demo/merge.json`, données générées —
  ou document chargé) complétées des journées chargées localement.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Corpus de démonstration | Fichiers statiques publics, lus en `GET`, importés en mémoire |
| Document chargé par le visiteur | Lu et validé localement (`File.text()` + ajv), jamais transmis |
| Préférences de présentation V3 | `localStorage` (`humanome-v3-presentation`), sans donnée d'évaluation |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash`, `isValidIsoDate`, `dayHash` | Routes `#/cartographie`, `#/merge`, `#/jour/<iso>?focus=` |
| Front | `web/src/App.jsx` | Aiguillage V3 / vues historiques, documents locaux, `beforeprint`/`afterprint`, sonde de session (`fetchMe`) |
| Front | `web/src/nav.js` — `FAMILIES` | Entrée « Cartographie (démonstration) » de la famille « Découvrir » |
| Front | `web/src/views/HomeView.jsx` | Accueil : « Charger ma cartographie (JSON) », zone de glisser-déposer, `File.text()`, affichage des 8 premières erreurs (A7, E4) |
| Front | `web/src/v3/ui/V3View.jsx` — `loadDemoCorpus` | Lecture de l'index et des journées du corpus (étape 3, E1, anomalie AN3) |
| Front | `web/src/v3/ui/V3View.jsx`, `panels.jsx` (`SunPanel`, `HeatmapPanel`, `TimelineBar`, `PortfolioPanel`, `StatsPanel`, `LegendPanel`), `tools.jsx` (`WhyRadiusDialog`) | Interface V3 de démonstration |
| Front | `web/src/v3/core/referentiel.js` — `normalizeReferential` | Familles, symboles, motifs |
| Front | `web/src/v3/core/import.js` — `importJourDocuments`, `summarizeReport` | Master privé en mémoire |
| Front | `web/src/v3/core/events.js` — `computeEvents` | Règle d'admissibilité (RG2) |
| Front | `web/src/v3/core/metrics.js` — `sunValues`, `radialProportion`, `countLabel`, `heatmapLevel`, `whyRadius` | Métrique du rayon (RG3) |
| Front | `web/src/v3/core/state.js` — `initialState`, `availablePanels`, `renderedPanels`, `inspectDay`, `setPlayhead`, `play`, `pause`, `selectScope`, `clearScope` | États séparés (RG4) |
| Front | `web/src/data/load.js` — `loadDay`, `frenchDate`, `parseUserDocument` | Journées de démo, documents locaux |
| Front | `web/src/data/referentiel.js` — `loadPublishedReferentiel` | Référentiel publié, repli embarqué |
| Front | `web/src/views/DayView.jsx` — `findDayNode` ; `web/src/views/MergeView.jsx` — `findMergeNode` | Vues historiques, résolution d'un secteur |
| Front | `web/src/lib/sunburst/as-of.js` — `finalThresholds`, `mergeDocAsOf` | Trames de la vue chronologique |
| Front | `web/src/lib/sunburst/build-tree.js`, `layout.js` | Vraie bibliothèque sunburst des vues historiques (A3, anomalie AN1 : méta d'un pôle `{kind: 'pole', id, domainId}`) |
| Front | `web/src/components/{Sunburst,TimelinePlayer,HeatmapCalendar,StatBadges,DetailsPanel,ViewToolbar}.jsx` — `buildCalendarGrid`, `scoreLevel` | Rendu, calendrier, onglets mobiles, impression |
| Front | `web/src/lib/narrative.js` — `renderNarrativeHtml`, `dayHrefToRoute` | DOMPurify + réécriture des liens (RG6) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-VIS-01-U01 | `parseHash`, `dayHash` | Routes `#/cartographie`, `#/merge`, `#/jour/<iso>?focus=` | `web/test/usecases/unit/uc-vis-01-explorer-cartographie-demonstration.test.js` |
| UC-VIS-01-U02 | `isValidIsoDate`, `parseHash` | Date impossible → pas une route (RG7, E2) | idem |
| UC-VIS-01-U03 | `loadDay`, `frenchDate` | URL relative, cache, messages 404 / réseau / HTTP / `file://` / date invalide (E3) | idem |
| UC-VIS-01-U04 | `loadPublishedReferentiel` | Chemin publié (index → fichier indiqué) ; nom de fichier dangereux, hors ligne ou `file://` → repli embarqué (étape 2) | idem |
| UC-VIS-01-U05 | `normalizeReferential` | 7 familles ordonnées, symboles/motifs, 61 compétences, forme invalide refusée | idem |
| UC-VIS-01-U06 | `importJourDocuments`, `summarizeReport` | Master privé, une journée par date, provenance, aucune anomalie bloquante | idem |
| UC-VIS-01-U07 | `computeEvents` | Admissibilité (RG2) : statut, court-circuit, lien résolu, lien contesté, variante concurrente, confiance ignorée ; renvois en attente de révision | idem |
| UC-VIS-01-U08 | `sunValues`, `radialProportion`, `countLabel` | Rayon borné par la tête de lecture, formule log2 figée, `futureCount`, plafond 64 (RG3) | idem |
| UC-VIS-01-U09 | `whyRadius`, `heatmapLevel` | « Pourquoi ce rayon ? », seuils de heatmap 0 · 1 · 2–3 · 4–7 · ≥ 8 | idem |
| UC-VIS-01-U10 | `initialState`, `availablePanels`, `renderedPanels` | Mode simplifié du visiteur, panneaux interdits jamais rendus | idem |
| UC-VIS-01-U11 | `inspectDay`, `setPlayhead`, `play`, `pause`, `selectScope`, `clearScope` | Inspection ≠ tête de lecture (RG4), lecture, filtre idempotent | idem |
| UC-VIS-01-U12 | `renderNarrativeHtml`, `dayHrefToRoute` | DOMPurify puis réécriture des liens hérités (RG6) | idem |
| UC-VIS-01-U13 | `finalThresholds`, `mergeDocAsOf` | Trames cumulées ; dernière trame = document publié (codes, niveaux, points) | idem |
| UC-VIS-01-U14 | `buildCalendarGrid`, `scoreLevel` | Semaines du lundi, 5 niveaux d'intensité | idem |
| UC-VIS-01-U15 | `findDayNode`, `findMergeNode` | Résolution des secteurs compétence/pôle | idem |
| UC-VIS-01-U16 | `parseUserDocument` | Lecture et validation locales, messages d'erreur (E4) | idem |
| UC-VIS-01-U17 | `findDayNode` | **Comportement actuel figé** — anomalie AN1 (pôle à `poleNum` chaîne non résolu) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-01-F01 | Nominal (1-6) | IHM | Menu → `#/cartographie` (shell réel, sans session injectée), chargement, barre de contexte, 10 secteurs, indicateurs, tableau équivalent, bloc « Préparer un partage » replié ; seuls des `GET` sur `data/` plus la sonde `GET api/auth/me` sans corps | `web/test/usecases/functional/uc-vis-01-explorer-cartographie-demonstration.test.jsx` |
| UC-VIS-01-F02 | Nominal (7, 9) | IHM | Filtre par secteur : autres secteurs atténués, indicateurs inchangés (comportement actuel) ; « Pourquoi ce rayon ? » (touche `w`) ; retrait du filtre par la barre, la puce et le centre du soleil | idem |
| UC-VIS-01-F03 | Nominal (8) | IHM | Inspection → « Réouvrir le portfolio » → portfolio sans déplacer la lecture ; « Voir l'état à cette date » → 7 secteurs (3.07, 4.05, 6.07 absents), dont 3 prolongés d'un fantôme (2.01, 5.03, 7.01) | idem |
| UC-VIS-01-F04 | A2 | IHM | Lecture avant depuis l'état complet arrêtée aussitôt ; début, pas à pas, lecture ×2 jusqu'à la dernière journée puis arrêt ; lecture arrière depuis la fin ; inspection pendant la lecture = pause | idem |
| UC-VIS-01-F05 | A1 | IHM | Accueil → `#/merge` sans document → même interface V3 | idem |
| UC-VIS-01-F06 | A5 | IHM | Distinctions renforcées (motifs) et surface sombre, données inchangées | idem |
| UC-VIS-01-F07 | A6 | IHM | « Aperçu avant impression » ; `<details>` ouverts pendant l'impression puis restaurés | idem |
| UC-VIS-01-F08 | E1 | IHM | Corpus injoignable → « Chargement impossible » | idem |
| UC-VIS-01-F09 | A3, A6 | IHM | Vue journée : badge, voisines (calculées depuis le merge de démo embarqué), retour, exclus, verdict, examen du pédagogue, traces retenues, onglets mobiles | idem |
| UC-VIS-01-F10 | A4 | IHM | `?focus=` présélectionne la compétence | idem |
| UC-VIS-01-F11 | A6 | IHM | « Imprimer » depuis la vue journée | idem |
| UC-VIS-01-F12 | E2 | IHM | Date impossible → page introuvable | idem |
| UC-VIS-01-F13 | E3 | IHM | Journée absente → message explicite | idem |
| UC-VIS-01-F14 | A7 | IHM | Merge local → badges, narratif assaini, timeline, calendrier synchronisé, ouverture d'une journée, rien d'envoyé | idem |
| UC-VIS-01-F15 | A7 | IHM | Journée locale → vue journée servie depuis la mémoire | idem |
| UC-VIS-01-F16 | E4 | IHM | JSON illisible, non conforme, `carto-data.js` hérité, `kind` inconnu, plus de 8 erreurs (8 premières + « … et N autres erreurs. ») → erreur locale | idem |
| UC-VIS-01-F17 | Anomalie AN1 | IHM | **Comportement actuel figé** — clic sur un pôle (vraie lib sunburst) sans rapport | idem |
| UC-VIS-01-F18 | Nominal (2) | IHM | Référentiel publié (index → `respire-v7.1.json`) lu et utilisé : libellé publié sur le secteur 2.01 | idem |
| UC-VIS-01-F19 | Anomalie AN3 | IHM | **Comportement actuel figé** — journée du corpus en HTTP 500 (corps JSON) → démonstration partielle (7 secteurs, 2 journées), « 1 anomalie(s) à traiter » | idem |
| UC-VIS-01-F20 | A7 | IHM | Glisser-déposer d'un document-jour sur la zone de dépôt → vue journée servie depuis la mémoire | idem |

Les tests fonctionnels servent un corpus réduit et stable : les trois journées
de `schemas/fixtures/cartographie-jour-2026-01-0{5,6,7}.json` (10 compétences
documentées, 14 observations admissibles, 3 renvois) — outillage partagé
`web/test/usecases/support/vis.js`. La navigation entre journées de la vue
journée s'appuie, elle, sur le merge de démonstration **embarqué** au build
(`getDemoMerge()`, données générées) : F09 et F15 calculent les voisines
attendues depuis ce document plutôt que de les coder en dur.

### Tests existants liés (non-régression)

- `web/src/v3/ui/V3View.test.jsx` — chargement, inspection vs tête de lecture, bascule de mode, « Pourquoi ce rayon ? ».
- `web/src/v3/core/import.test.js`, `web/src/v3/core/share.test.js` (bloc « state ») — import, admissibilité, métriques, panneaux.
- `web/src/views/DayView.test.jsx`, `web/src/views/MergeView.test.jsx`, `web/src/views/MergeView.integration.test.jsx`, `web/src/integration.test.jsx` — vues historiques (lib factice et réelle, corpus réel).
- `web/src/components/{TimelinePlayer,HeatmapCalendar,Sunburst,DetailsPanel,StatBadges}.test.jsx`, `web/src/lib/narrative.test.js`, `web/src/lib/sunburst/*.test.js`, `web/src/data/load.test.js`, `web/src/router.test.js`, `web/src/App.test.jsx`.
- `web/e2e/timeline-demo.e2e.js` — voir anomalie AN2.

### Exécuter

```sh
cd web && npx vitest run test/usecases/unit/uc-vis-01 test/usecases/functional/uc-vis-01
```

## Anomalies constatées

- **AN1 — Vue journée : la sélection d'un pôle n'affiche pas son rapport.**
  Le schéma `cartographie-jour` impose `poleNum` en chaîne (« 1 » à « 7 ») et
  tout le corpus réel s'y conforme, mais `findDayNode`
  (`web/src/views/DayView.jsx`) cherche le pôle par `dp.poleNum === refPole.num`
  (nombre). Toucher un pôle laisse le panneau sur « Touchez un secteur… » : le
  rapport du pôle, l'audit et les passages saillants ne sont jamais montrés.
  Le test existant `DayView.test.jsx` ne le voit pas (document synthétique à
  `poleNum` numérique). Comportement actuel figé par UC-VIS-01-U17 et F17.
- **AN2 — Test e2e obsolète.** `web/e2e/timeline-demo.e2e.js` joue la timeline
  « de la démo » sur `#/merge` (59 feuilles, `svg.sunburst`) ; depuis D14,
  `#/merge` sans document chargé affiche l'interface V3 (`App.jsx`), qui n'a
  ni ce curseur ni ce SVG. Ce test e2e (local uniquement) ne peut plus passer
  en l'état.
- **AN3 — Statut HTTP du corpus de démonstration ignoré.** `loadDemoCorpus`
  (`web/src/v3/ui/V3View.jsx`) enchaîne `(await fetchFn(url)).json()` sans
  contrôler `response.ok`. Une journée servie en erreur HTTP avec un corps JSON
  (ex. `500 {error}`) n'entraîne pas « Chargement impossible » (E1) : le
  document est importé, mis en quarantaine (`schema-inconnu`), et la
  démonstration s'affiche **partielle** avec le badge « 1 anomalie(s) à
  traiter » ; un index en erreur HTTP à corps JSON donne « Chargement
  impossible : index.map is not a function ». Comportement actuel figé par
  UC-VIS-01-F19.

## Limites

- Sur `file://`, l'interface V3 ne peut pas charger le corpus (E1) ; seul le
  référentiel a un repli embarqué.
- Les annotations et revues faites sur la démonstration (UC-APP-12) restent en
  mémoire et sont perdues au rechargement.
