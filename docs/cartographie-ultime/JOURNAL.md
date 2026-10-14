# Journal d'avancement — interface ultime de cartographie

Source des exigences : `INDEX/04_specifications.md` du dossier de travail
« Cartographie » de Christian (version 0.1 du 2026-10-13), complété par les
fiches de lecture `01_synthese_phase3.md`, `02_modele_de_donnees_commun.md`,
`03_aurora_chaine_donnees_et_extraits.md`, `03b_lecture_proto.md`,
`03c_lecture_site_humanome.md` et `03d_lecture_react2025.md`, et par
l'inventaire `00_inventaire.xlsx`. Les références « §n » ci-dessous renvoient
aux sections de `04_specifications.md`.

Branche de travail : `feat/ultimate-cartography` (issue de `main` @ `28969a2`).
**Aucun déploiement** sur https://humanome.xyz tant que Christian n'a pas
validé : le déploiement ne se fait que par `scripts/deploy/deploy.mjs`
(identifiants FTP absents de ce poste) ; pousser la branche sur GitHub ne
déclenche rien (la CI `publiable.yml` ne tourne que sur `main` et sur les PR).

---

## 1. Où j'en suis

| Étape | Contenu | Code | Tests développés | Tests validés | Commit |
|---|---|---|---|---|---|
| Installation | dépôt cloné, dépendances, données dérivées, base locale | — | — | ✅ voir §3 | — |
| Cadrage | architecture, modèle, journal | ✅ | — | — | `4710134` |
| P0 | noyau `core/` : modèle, importeurs, formules §5 | ✅ | ✅ 112 tests | ✅ 112 verts | `16cca1a`, `1d6472d` |
| P1 | soleil, heatmap, gestionnaire, date t, liste, modale | ✅ | ✅ 13 tests d'interface | ✅ 125 verts (carto) + suite du site | `e4c21fd` |
| P2 | lecteur surligné, détail, jury, « Pourquoi ? », animation | ✅ | ✅ 30 tests (cœur, DOM, interface) | ✅ 155 verts (carto) + suite du site | `13796b0` |
| P3 | comparaison A/B (8 vues) | ✅ | ✅ 17 tests (cœur, interface) | ✅ 172 verts (carto) + suite du site | `b1907fa` |
| P4 | tableau de bord des métriques | ✅ | ✅ 28 tests (cœur, interface) | ✅ 200 verts (carto) + suite du site | `77d2d93` |
| P5 | exports JSON / HTML / PDF, anonymisation | ✅ | ✅ 39 tests (cœur, interface, e2e Chromium) + validation sur les journaux réels (D-29) | ✅ 239 verts (carto) + suite du site + e2e | `c7e200c`, corrections `90aacee` → `3ff2dcd` |
| P6 | copie serveur et partage (adultes) | ✅ | ✅ 39 tests (cœur, interface, API, e2e Chromium contre l'API locale) | ✅ 262 verts (carto) + suites du site et de l'API + e2e | `a6972bb` |
| P7 | dialogue scripté (option) | ✅ | ✅ 18 tests (cœur, interface, e2e Chromium) | ✅ 279 verts (carto) + suites du site + e2e | `e08f8c9` |
| Vérification | relecture indépendante de P6 et P7 : 13 corrections, 2 décisions à prendre (D-37) | ✅ | ✅ +8 tests, d'autres renforcés (cœur, interface, API, e2e) | ✅ 285 verts (carto) + suites du site et de l'API + e2e | `47af23e` |
| Q3 — angle | l'angle compte les points, la confiance du jury ne fait que la hauteur ; largeur minimale dessinée (D-8) | ✅ | ✅ formules, état, corpus réel réécrits | ✅ carto + suite du site | `ce0cf13` |
| Q22 — clé personnelle | `connect-src` de production ouvert aux seuls fournisseurs (D-36) | ✅ | ✅ 3 tests + 1 e2e sous la CSP de production | ✅ | `38d3c66` |
| Pages V3 | `#/merge` et `#/cartographie-v3` renvoient vers `#/cartographie` ; l'accueil ouvre l'interface ultime (D-38) | ✅ | ✅ tests du site réécrits, ceux de la V3 retirés | ✅ suite du site | `080e04f` |
| Q15 — version partagée | une nouvelle version remplace l'ancienne sous le même lien (D-33) | ✅ | ✅ API, interface, e2e | ✅ | `c4eb6ff` |
| Q9 — surlignage approché | extraits reformulés encadrés en pointillés, dits « approchés » (D-39) | ✅ | ✅ 10 tests + validation sur les journaux réels | ✅ 304 verts (carto) | `b82ebd5`, `693f079` |
| Formation | chapitres de la V3 réécrits pour la nouvelle interface ; « confiance moyenne du jury » à l'écran (D-38, D-8) | ✅ | ✅ suites des guides et de l'aide | ✅ | `5ff7201` |
| Q20 — carnet → portfolio | un dialogue se verse au portfolio : export Markdown, copie autonome (D-40) | ✅ | ✅ 12 tests (un autre renforcé) + 1 e2e + validation sur les journaux réels | ✅ 316 verts (carto) + e2e | `f52b0ed`, `1ed2786` |
| Q10 — archive de compte | « Exporter toutes mes données » emporte les jeux de l'interface (1.1.0) ; schéma JSON du master v4 ; validateurs recompilés (D-25) | ✅ | ✅ 11 tests + 5 renforcés (front, moteur, API) + validation sur les journaux réels | ✅ suite du site 2 240 verts, moteur, API | `e0c4e56` |
| Relecture indépendante | les décisions du 2026-10-14 relues par un agent distinct : 9 défauts, tous corrigés (D-41) | ✅ | ✅ 15 tests (cœur, interface, cas d'utilisation), d'autres renforcés ; surlignage approché revalidé sur les journaux réels (D-39) | ✅ suite du site 2 255 verts | `b651f38` |
| Q17 — version garantie | un cartographe publie la version de l'apprenant, à sa demande, avec sa garantie (D-42) | ✅ | ✅ 8 tests API, 8 d'interface, 1 e2e (deux comptes, API locale) | ✅ voir §3 | `f55b036` |
| Q17 — ancien partage retiré | plus de lien vers une cartographie du site (422) ; « Partager depuis l'interface », « Liens déjà créés » ; la relecture du cartographe ouvre sa révision dans l'interface (D-43) | ✅ | ✅ 13 tests ajoutés, d'autres réécrits ; 21 retirés avec la création (18 du site, 3 de l'API) ; parcours e2e apprenant et cartographe réécrits (et remis en état : activation D5) | ✅ voir §3 | voir §5 |

Légende : ✅ fait · ⏳ en cours · — pas commencé.

---

## 2. Décisions d'implémentation et d'architecture

Chaque décision est numérotée (D-n) pour pouvoir y renvoyer depuis le code et
les commits. Les écarts à la spécification sont signalés **[écart]** et les
choix à faire valider **[à valider]** ; une fois tranchés par Christian
(réponses du 2026-10-14, §4), ils portent **[validé]** ou **[décidé]**.

### D-1 — Emplacement : un module autonome dans le front existant

Le code vit dans `web/src/carto/` :

- `web/src/carto/core/` : noyau pur (aucune dépendance à React ni au DOM),
  testé par Vitest (§5, §13 « noyau pur ») ;
- `web/src/carto/ui/` : composants React minces qui ne font que dessiner.

Il réutilise ce que le site a déjà de solide : lecteur ZIP et identifiants de
la V3 (`web/src/v3/core/zip.js`, `ids.js`), segmentation du portfolio
(`engine/src/portfolio/segment.js`), assainissement DOMPurify
(`web/src/lib/narrative.js`), jetons de thème clair/sombre (`global.css`).
Les autres vues du site ne sont pas modifiées (hors périmètre, §15 décision 12).

### D-2 — Routes préfixées par `#/cartographie` **[écart, validé]**

La spécification (§13) liste `#/cartographie`, `#/jour/<date>`,
`#/comparaison`, `#/tableau-de-bord`, `#/gestionnaire`. Or `#/jour/<date>` est
déjà la vue « journée » historique du site (hors périmètre). Pour ne rien
casser, les cinq espaces vivent sous un même préfixe :

`#/cartographie` · `#/cartographie/jour/<date>` · `#/cartographie/comparaison`
· `#/cartographie/tableau-de-bord` · `#/cartographie/gestionnaire` ·
`#/cartographie/export`.

Depuis P1, `#/cartographie` porte l'interface ultime et l'entrée du menu
« Découvrir » s'intitule « Cartographie ». L'interface V3 reste accessible sur
`#/cartographie-v3` (et sur `#/merge`) ; les fiches UC-VIS-01 et UC-APP-12 le
mentionnent en tête, et leurs tests ouvrent désormais `#/cartographie-v3`.

**Le 2026-10-14**, Christian retire l'interface V3 : `#/cartographie-v3` et
`#/merge` renvoient vers `#/cartographie` (D-38).

### D-3 — Conteneur : le master V3 étendu, réorganisé par journée

Conformément au §4, le conteneur garde l'enveloppe du master V3
(`kind: "competency-map-master"`, `datasetId`, variantes avec provenance,
variante active ou « à examiner », droit de réponse, narratifs) avec
`schemaVersion: "4.0.0"`. Différence structurelle : les observations, traces
et passages sont rangés **dans leur journée** (et non en listes plates) pour
satisfaire l'exigence « un enregistrement IndexedDB par journée, chargement
paresseux » (§4.2). Un master V3 (`3.x`) est un format d'entrée parmi
d'autres, converti par migration.

### D-4 — Stockage en deux niveaux

- **Index léger** (toujours chargé) : référentiel embarqué, liste des
  journées avec cases cochées, étiquettes, variantes, verdicts résumés (code,
  statut, confiance, rôles des traces), volumes, ensembles nommés, revues,
  repères, préférences. Tous les calculs du §5 n'utilisent que lui.
- **Détail par journée** (chargé à la demande) : extraits verbatim, ancres de
  surlignage, jury, pédagogue, pièces, rapports de pôle, kairos, texte du
  portfolio du jour.

IndexedDB `humanome-carto-v4` ; l'import est écrit en **une seule
transaction** (tout ou rien, §3). `localStorage` ne sert qu'aux préférences
d'affichage, toujours sous `try/catch`.

### D-5 — Dates

Les jours sont des chaînes `AAAA-MM-JJ`, comparées comme chaînes. Les seuls
calculs calendaires (jour de la semaine, ajout de jours) passent par
`Date.UTC`, jamais par `new Date("AAAA-MM-JJ")` local (défaut de 2025, §3).

### D-6 — Lecture des formules du §5 (choix d'interprétation) **[validé]**

- **Verdicts qui comptent** : seuls « établie » (toutes variantes) et « renvoi
  au cartographe » fournissent des traces (§5.2). Une « non établie » et un
  court-circuit n'en fournissent pas ; le court-circuit est compté à part,
  jamais comme une absence (§4.2).
- **Confiance cumulée C(c)** (à l'écran : « confiance moyenne du jury »,
  D-8) : moyenne des confiances des seuls verdicts qui
  ont fourni au moins une trace. La confiance d'un verdict de *non-présence*
  mesure la certitude de l'absence : la mêler à la hauteur fausserait le
  miroir.
- **Statut affiché** : une compétence établie au moins une fois dans
  l'ensemble est « établie » (règle optimiste du merge v2) ; sinon, si elle
  n'a que des renvois, son secteur est hachuré.
- **Confiance absente** : on n'invente jamais une confiance. Depuis D-8
  (2026-10-14), les points d'une trace ne dépendent plus de la confiance : la
  trace compte pour l'angle, la hauteur ignore cette confiance (moyenne des
  seules confiances connues), et un secteur sans confiance connue reçoit
  l'épaisseur minimale, signalée.
- **Hors référentiel** : une compétence inconnue du référentiel n'a ni angle
  ni secteur ; elle est conservée et listée à part (point ouvert 8).
- **Anneaux de même capacité** : pour que « l'aire d'un secteur vaut θ·k·C/2
  quel que soit l'anneau » et que l'aire d'un pôle égale la somme de ses
  compétences, les deux anneaux ont la même capacité k = R_ext² − R_int². Le
  rayon de séparation se calcule (`ringGeometry`) : l'anneau des pôles est
  donc plus épais que celui des compétences (même aire, rayon plus petit).
- **Droit de réponse** : stocké par observation (jour + variante +
  compétence), il ne modifie aucun calcul — le miroir montre ce que voit
  l'analyse, la réponse de l'apprenant est posée à côté (point ouvert 5).

### D-7 — Arborescence AuroraCore répartie par journée

Un `verdict.json` d'AuroraCore juge la compétence sur tout le journal, et
chacune de ses traces a sa date. Il est réparti sur les journées de ses
traces : la journée d porte un verdict de même statut et de même confiance,
avec les seules traces de d. Le jury complet, la délibération (voix par voix),
le débat et les pièces du Greffier sont rangés une fois au niveau du run et
référencés. Les feuilles du jour du journal (`<journal>/feuilles/AAAA-MM-JJ.md`)
sont importées comme portfolio : c'est ce qui rend le surlignage possible.

### D-8 — L'angle compte les points ; la confiance du jury ne fait que la hauteur **[décidé]**

**Constat** (P0), mesuré sur les 59 journées publiques
(`assets-existants/merge-prototype`) avec la formule du §5.3, I = 1 − Π(1 − w)
et w = base(rôle) × confiance :

| État à la date t | compétences | I > 0,99 | angle min / médian / max |
|---|---|---|---|
| 2025-12-22 (1 journée) | 24 | 0 | 7,5° / 10,7° / 37,3° |
| 2025-12-31 | 39 | 1 | 2,9° / 10,5° / 14,5° |
| 2026-01-31 | 54 | 39 | 1,5° / 7,2° / 7,2° |
| 2026-03-29 (complet) | 56 | 52 | 2,1° / 6,6° / 6,6° |

Après un mois, la plupart des compétences atteignaient I ≈ 1 et recevaient
le **même** angle : l'angle ne disait plus rien de la quantité de traces.

**Décision de Christian (2026-10-14)** : « L'angle doit être représentatif de
l'intensité d'une trace, c'est-à-dire le nombre de points : plus il y a de
traces pour une compétence, plus elle prend de place. La hauteur du secteur
représente la confiance moyenne du jury » ; et, précisé le même jour : la
confiance du jury ne doit pas intervenir dans la formule de l'angle. D'où, à
la place du §5.2 (pour l'angle) et du §5.3 :

```
points d'une trace     w = 1 (preuve) ou α (indice, 0,5 par défaut)
intensité = points     P(c) = Σ w   sur les traces retenues de c dans S ∩ [début, t]
angle                  θ(c) = 360° × P(c) / Σ P(c')
hauteur (inchangée)    C(c) = moyenne des confiances des verdicts de c
```

C'est la logique du prototype d'AuroraCore (`generate_carto_data.py` : des
secteurs proportionnels aux points), sans la confiance. Plus aucune borne (le
plafond de 0,99 ne servait que le produit). Même corpus, mêmes dates :

| État à la date t | compétences | points | angle min / médian / max |
|---|---|---|---|
| 2025-12-22 (1 journée) | 24 | 18 | 10,0° / 10,0° / 40,0° |
| 2025-12-31 | 39 | 72,5 | 2,5° / 9,9° / 24,8° |
| 2026-01-31 | 54 | 788 | 0,2° / 5,5° / 21,5° |
| 2026-03-29 (complet) | 56 | 1 603,5 | 0,2° / 4,8° / 17,1° |

- **Largeur minimale d'affichage** : une compétence qui n'a que deux indices
  sur 1 600 points vaut 0,2° (moins d'un pixel). Comme l'épaisseur minimale
  du §5.6, un secteur ne disparaît jamais : il reçoit 2 px au bord extérieur,
  pris sur les autres au prorata (`widenNarrowSectors`), et « Pourquoi cette
  surface ? » le signale en donnant l'angle exact. Sur le corpus complet,
  3 secteurs sur 56 sont ainsi élargis.
- Les **moments remarquables** du tableau de bord (D-24) gardent leur propre
  mesure, la force du signal d'une trace (rôle × confiance, `traceSignal`) :
  elle trie des passages à relire, elle n'entre jamais dans l'angle.
- La heatmap sans portfolio (D-11), la comparaison (points absolus, points du
  jour) et la version partagée suivent la même règle ; les textes de lecture
  (légende, rapport imprimable, « Comment lire ce soleil ») le disent.
- **Mots** : à l'écran, la « confiance cumulée » du §5.5 devient la
  « confiance moyenne du jury » (légende, panneau de détail, tableau du
  soleil, rapport imprimable, version partagée, aide) : c'est une moyenne, et
  ce sont les mots de Christian ; « cumulée » laissait croire à une somme.
- **Ce que dit « Pourquoi cette surface ? »** (relecture du 2026-10-14,
  D-41) : l'épaisseur minimale dit sa raison — une confiance si faible que le
  secteur serait invisible, ou une confiance du jury **inconnue** (le secteur
  n'aurait pas de hauteur) ; un pôle dont une compétence est élargie le dit
  aussi (son angle dessiné dépasse le strict proportionnel). Une seule
  fonction calcule l'épaisseur affichée (`displayedOuterRadius`) : un secteur
  dessiné a des points, il ne disparaît donc jamais, même d'une confiance
  nulle ou inconnue.

### D-9 — Import : reconnaissance du contenu, doublons, variantes

- Les fichiers sont reconnus à leur **contenu** (carto_Pn, kairos, document-jour
  du site, `carto_merge.json`, document `cartographie-merge`, arborescence
  AuroraCore, métriques, référentiel, portfolio `.md`/`.txt`), après
  décompression des ZIP imbriqués (lot → run → journée, 3 niveaux).
- Une analyse est identifiée par l'empreinte de son **contenu** (et non du
  conteneur) : la même journée importée en ZIP puis en document-jour du site
  est un doublon ignoré.
- Deux analyses différentes d'une même date deviennent des variantes : la
  journée est « à arbitrer » et ne contribue pas tant que l'apprenant n'a pas
  choisi (règle V3, jamais d'addition de deux runs).
- La date d'une journée vient du chemin (`AAAA-MM-JJ/` ou `AAAA-MM-JJ.zip`) ;
  à défaut, elle est proposée depuis les feuilles citées (« À arbitrer »),
  sinon la journée est en quarantaine (« Bloquant »).
- `competences-data.js` / `carto-data.js` : donnée dérivée, signalée et non
  importée (« jamais comme source », §3).
- Le document `cartographie-merge` du site ne porte que des compteurs : ses
  traces sont reconstituées sans extrait (signalé) ; ses textes évolutifs
  deviennent des narratifs liés à leur ensemble source (§6.4).

### D-10 — Interface : un état partagé, des composants qui dessinent

- `ui/CartoApp.jsx` tient l'état d'écran unique (réducteur) : date t, journée
  inspectée, sélection, survol, filtre de liste, onglet mobile. La chaîne de
  commande du §2 est respectée : les cases (index léger) → heatmap → soleil.
- `ui/useCartoData.js` : ouverture du magasin IndexedDB, enregistrement
  différé (250 ms) et immédiat avant changement de jeu, caches de détails en
  `Map` immuables dans l'état React (aucun `eslint-disable`, aucune référence
  mutable lue au rendu).
- Les espaces suivants (comparaison, tableau de bord, export) sont des
  emplacements (`slots`) que P3–P5 rempliront sans toucher au cœur.
- Soleil : un seul SVG, secteurs annulaires `sectorPath` à deux arcs (un
  secteur de 360° est un anneau `evenodd`), cercles guides 0,25 / 0,5 / 0,75 /
  1, hachures pour les renvois, motifs par pôle en mode « distinctions
  renforcées », titre central au survol, disque central = désélection.
  Équivalent textuel repliable (tableau compétence × journées).
- Heatmap : un seul SVG avec rôle `grid`, focus géré par
  `aria-activedescendant` (flèches ±1 / ±7, Origine / Fin, Entrée = date t,
  Maj+Entrée ou `o` = ouvrir le jour), double-clic et bouton « Ouvrir ce
  jour » pour le tactile, brosse de période optionnelle.
- Modale du jour : piège de focus, Échap, journée précédente / suivante parmi
  les journées actives, « Retour » ; elle ne déplace jamais t (V3).
- Tête de lecture : icônes SVG (jamais d'emoji), vitesses ×0,5 / ×1 / ×2,
  pause automatique à la sélection ou au survol d'un secteur, désactivée sous
  `prefers-reduced-motion`, annonce `aria-live` seulement à la pause et en fin
  de plage. Les états sont calculés à la demande pour la trame affichée.
- Mobile (< 768 px) : onglets Diagramme / Détails / Journées ; les trois
  zones restent dans le DOM pour l'impression.

### D-11 — Valeur de la heatmap et démonstration

- Couleur d'un jour = volume du portfolio de ce jour (caractères), en cinq
  niveaux ipsatifs (quantiles 20 / 40 / 60 / 80 % des jours écrits de la
  personne). Si **aucun** portfolio n'est importé, la heatmap bascule sur la
  somme des points des traces du jour (D-8) et la légende le dit. Un jour sans texte
  reste une case vide, jamais un niveau bas.
- « Explorer la démonstration » importe les 59 documents-jour publics du site
  (`web/public/data/demo/jours/`) dans un jeu local « Démonstration ». Ils
  n'ont pas de portfolio : la heatmap est en mode « poids » et le surlignage
  est indisponible ; la démo anonymisée avec portfolio arrive en P5 (§11.1).

### D-12 — Validation sur les données réelles, sans rien sortir du Mac

Les importeurs ont été exécutés **sur le Mac de Christian** (clone de la
branche hors du dossier synchronisé, script de validation qui n'imprime que
des compteurs) sur les trois journaux AuroraCore. Aucun texte n'a quitté la
machine, rien n'est versionné.

| Journal | journées | avec analyse | avec portfolio | détails de run | bloquants | traces surlignées le jour même : complet / partiel / non retrouvé |
|---|---|---|---|---|---|---|
| 200 | 47 | 43 | 47 | 66 | 0 | 180 / 53 / 69 (sur 302) |
| 300 | 51 | 42 | 51 | 64 | 0 | 120 / 35 / 25 (sur 180) |
| GEN1 | 160 | 9 | 160 | 68 | 0 | 9 / 1 / 0 (sur 10) |

Un diagnostic complémentaire montre qu'une part des passages « non
retrouvés » figure dans la feuille d'un **autre** jour (décalage de date dans
AuroraCore) : le lecteur de P2 cherche d'abord dans la journée de la trace,
puis dans les autres journées, et dit clairement d'où vient le passage.

### D-13 — Lecteur de portfolio : un volet, le texte AFFICHÉ, un `<mark>` par nœud texte

- Volet latéral **non modal** (`ui/PortfolioReader.jsx`) au-dessus des
  modales (il s'ouvre aussi depuis la modale du jour, dont le piège de focus
  est alors suspendu). Focus sur son titre à l'ouverture, rendu au bouton
  déclencheur à la fermeture ; Échap le ferme.
- Le portfolio est rendu en Markdown par le moteur du site (`lib/md.js`,
  DOMPurify), puis la recherche porte sur le **texte affiché** (concaténation
  des nœuds texte, avec un saut de ligne virtuel entre deux blocs) et non sur
  le Markdown brut : un extrait qui contient `**gras**` est réessayé sans ses
  marques. Les plages trouvées sont enveloppées nœud par nœud par l'API DOM
  sur un `<template>` inerte (aucun `<mark>` n'englobe un `<p>`, segments
  blancs ignorés), et la sortie repasse par DOMPurify (`ui/highlight-dom.js`).
- Jaune = début et fin retrouvés, orange (et souligné pointillé, pour ne pas
  dépendre de la couleur) = un seul bout ; toutes les occurrences, avec
  navigation ; l'occurrence courante est cerclée quand il y en a plusieurs ;
  défilement centré (sans animation sous mouvement réduit). Un cadre
  pointillé, sans fond, marque un passage approché (D-39).

### D-14 — Où chercher le passage d'une trace

Ordre : journée du passage (`sourceDate`), journée de la trace, puis les
autres journées du portfolio par distance croissante (`core/passages.js`).
Dans sa journée, un résultat partiel suffit (orange). Ailleurs, seule une
correspondance **complète et exacte** (ancres non raccourcies) déplace le
lecteur, et le volet le dit : « retrouvé tel quel dans la feuille du X, alors
que la trace est datée du Y » (cas réel, D-12), avec un lien vers la journée
de la trace. Une ancre raccourcie à deux mots se trouve n'importe où : elle
ne suffit jamais. Les autres journées ne sont chargées que si le passage
n'est pas retrouvé en entier dans la sienne. Rien de tel quel nulle part : un
passage **approché** est cherché dans la seule journée de la trace (D-39).
Introuvable : le volet le dit et cite l'extrait du jury (défaut
d'AuroraCore). Sans portfolio : il invite à l'importer.

### D-15 — Panneau de détail d'une compétence : traces, verdicts, jury, réponse

- Traces (date, rôle, extrait, « Ouvrir dans le portfolio ») dans l'ordre des
  journées ; puis un bloc dépliable par journée : statut, confiance, preuves,
  indices, motif, prescription, provenance de l'analyse, droit de réponse, et
  « Réflexions du jury » à deux niveaux (examen du Pédagogue — attaques
  nommées par le dictionnaire `ATTAQUES` du moteur —, pièces du Greffier
  ouvrables dans le portfolio).
- AuroraCore : la délibération (six éclairages, président, débat, pièces
  verbatim) porte sur tout le journal ; elle est affichée **une fois** par run,
  au-dessus des journées, et chargée à la demande.
- Mention du niveau de preuve : « exploratoire — un seul codeur automatique ».
- Droit de réponse (Confirmer / Nuancer / Contester + note privée) : stocké
  dans le jeu de données local, jamais envoyé, sans effet sur les calculs ; un
  second clic retire la réponse ; un état inconnu s'affiche « pas encore
  donnée » (jamais « Contestée », défaut de V3). La note privée n'est pas
  imprimée **[validé]** : c'est l'apprenant qui l'écrit ; elle reste visible
  pour lui à l'écran, hors du rapport imprimable (fait pour être remis à
  d'autres) et de toute version partagée.

### D-16 — Panneau d'un pôle et du profil

- Pôle : synthèse, rapport de chaque journée (portrait, territoires denses
  avec leur extrait ouvrable, pistes), passages saillants repliables ; rapport
  de pôle du run pour AuroraCore. Les « territoires non visités » et les
  « émergences » du rapport ne sont **pas** affichés : ils décrivent ce qui
  manque, ce que le miroir s'interdit (§1.2) **[validé]** : « on valorise
  l'existant ».
- Profil (aucune sélection) : portrait kairos de la **dernière journée**
  affichée, présenté comme tel (« kairos de cette journée seule »).
- Synthèses évolutives : affichées seulement si leur ensemble source est
  exactement l'ensemble des journées qui fondent l'état affiché (S jusqu'à t,
  avec analyse) ; sinon masquées avec un message et un bouton « Cocher
  exactement ces journées et afficher l'état complet ». Leurs anciens liens de
  journée ouvrent la modale du jour de l'interface ultime.

### D-17 — Impression

Tous les `<details>` s'ouvrent à `beforeprint` et ceux qu'on a ouverts se
referment à `afterprint`. Le lecteur, les boutons et la note privée ne sont
pas imprimés ; le tableau équivalent du soleil l'est.

### D-18 — Comparaison : deux côtés définis par l'apprenant

- Chaque côté a un nom (choisi par l'apprenant) et une définition : sélection
  courante, ensemble nommé, période (option « journées cochées seulement »),
  étiquette, ou **analyse** (source + run) pour comparer deux analyses du même
  portfolio : `computeState` accepte alors une fonction `variantOf` qui choisit
  la variante de chaque journée (`core/compare.js`).
- La dernière comparaison (A, B, vue) est gardée dans les préférences du jeu ;
  la note de l'apprenant est rangée dans `comparisons[]` du master, sous la clé
  des deux définitions (§9.4).

### D-19 — Préréglages

« Depuis la dernière évaluation », « depuis le début du trimestre » et
« depuis le début de l'année scolaire » comparent l'état cumulé à une date
repère (A) et l'état cumulé à la date de référence (B, la date t ou la
dernière journée cochée analysée) : B contient A, ce que l'interface signale.
« Année scolaire précédente » compare deux années scolaires disjointes. Seules
les journées cochées comptent. Le trimestre est civil, comme dans V3
**[à valider : trimestre scolaire ?]**. Un préréglage sans données le dit et
ne change rien.

### D-20 — Mesures de la comparaison

- Tableau par pôle et compétence : part ipsative, intensité absolue,
  confiance cumulée, nombre de journées, et moyenne [min–max] σ de
  l'**intensité du jour** (traces de ce seul jour) sur les journées observées
  seulement ; Δ = B − A ; Δ relatif seulement quand A dépasse 2 % de part ou
  0,1 d'intensité. Aucune couleur de verdict : les deux ensembles ont deux
  teintes neutres, B toujours en pointillé.
- Avertissement dès que A et B n'ont pas le même nombre de journées analysées
  (critère P3), et dès qu'ils se recouvrent.
- Radar : 7 pôles ou compétences d'un pôle, échelle commune max(A, B) arrondie
  au point supérieur (1 % sous 10 %, sinon 5 %), sans plafond fixe.
- Journées par pôle : les cinq journées où le pôle pèse le plus (somme des
  intensités du jour de ses compétences), en liste non numérotée et allumées
  sur une heatmap — des repères pour choisir quoi relire, pas une note.
- Concentration : part cumulée des cinq plus grandes parts de chaque soleil.

### D-21 — Récit « ce qui a changé »

Phrases factuelles et datées (`changeNarrative`) : tailles et périodes,
journées communes, compétences propres à A ou à B, journées de plus quand B
prolonge A (« depuis le 1er janvier 2026, … apparaît dans 4 journées de
plus »), parts qui diffèrent le plus. Au-delà de cinq compétences propres à un
ensemble, une seule phrase les cite. Les tests vérifient qu'aucune phrase ne
contient de mot de valence (progrès, amélioration, recul, meilleur…).

### D-22 — Tableau de bord : neuf cartes qui se masquent seules

- Profil, Rythme, Phases et repères, Constance, Moments remarquables, Style
  (local), Fonctions cognitives, Rupture lexicale, Ruptures et anomalies
  d'import (`core/dashboard.js`, `ui/Dashboard.jsx`). Chaque carte calcule ses
  données à la volée ; sans données, elle n'est **pas affichée** et une ligne
  « N cartes sans données » en donne la raison (critère P4). L'apprenant peut
  aussi masquer une carte et la rappeler.
- Grille de tuiles de V3 réutilisée telle quelle (glisser-déposer, tailles,
  colonnes automatiques), aux couleurs du site ; la disposition, les cartes
  masquées et la sensibilité des moments sont des préférences du jeu.
- Graphiques SVG maison (`ui/charts.jsx`) dessinés à la largeur réelle de leur
  tuile (les textes gardent leur taille) : axe temporel **réel** (les silences
  se voient, une courbe est coupée au-delà de 7 jours sans donnée), aucun zéro
  inventé, un seul arrêt de tabulation par graphique (← → pour parcourir les
  journées, Entrée pour ouvrir la journée), info-bulle au survol, au toucher et
  au clavier, libellé par point. Couleur = fonction, jamais personne.
- Chaque carte dit sa source : « niveau de preuve : exploratoire — un seul
  codeur » pour ce qui vient des analyses, « calcul local et déterministe »
  pour le reste.
- **Constance** : le trait (points cumulés) est à l'échelle de chaque
  compétence, les pastilles (confiance du verdict de chaque jour) gardent la
  leur, de 0 à 1. Depuis que l'angle compte les points (D-8), une seule
  preuve vaut déjà 1 : avec l'ancienne échelle commune [0 ; 1], tous les
  traits étaient plats, collés en haut (relecture du 2026-10-14, D-41).

### D-23 — Style local et rupture lexicale

- 19 mesures à expressions régulières (`core/stylometry.js`) : longueur des
  mots, variété du vocabulaire (TTR glissant sur 100 mots, pour ne pas
  dépendre de la longueur du texte), mots employés une fois, longueur des
  phrases, interrogatives, exclamatives, ponctuation interne, parenthèses,
  1re et 3e personnes, connecteurs d'opposition et de cause, modalisateurs,
  verbes de pensée, méta-discours, questions qu'on se pose, mots d'émotion,
  interjections, émojis. Les listes de mots sont courtes, lisibles et
  **affichées** dans la carte. Mesure impossible (texte sans phrase…) = null.
- La heatmap journées × mesures est normalisée **ligne par ligne sur les
  journées de la personne** (min–max) ; une journée de moins de 50 mots n'est
  pas mesurée (case vide).
- Rupture lexicale = 1 − cosinus des fréquences de mots pleins (≥ 3 lettres,
  hors mots-outils) entre deux journées écrites consécutives ; non mesurée
  sous 20 mots pleins ; aucun seuil fixe, la médiane de la personne sert de
  repère.

### D-24 — Moments remarquables et fonctions cognitives

- Moments : traces dont la force du signal (rôle × confiance, distincte des
  points de l'angle depuis D-8) atteint un seuil réglé par
  la sensibilité 0–100 (pas de 5) : 0 → 0,9, 50 → 0,6 (défaut), 100 → 0,3 ;
  « signaux forts seulement » sous 35, « signaux faibles inclus » au-dessus de
  65. Chaque moment : date, compétence, barre de confiance (vert > 0,6, orange
  > 0,3, gris sinon), extrait, « Ouvrir dans le portfolio », et « première
  impression » du jour : celle du miroir HumanoTwin si importé, sinon le
  portrait kairos du jour, sinon le début du texte du jour.
- Fonctions cognitives : l'import reconnaît désormais le fichier **miroir**
  d'HumanoTwin (`trajectoire` + `signatures_par_sensibilite`) en plus du format
  `metrics[date][champ]` : sept fonctions (couleur fixe par fonction), premières
  impressions du jour, signatures dédoublonnées avec la plus petite
  sensibilité où elles apparaissent. Courbes à légende cliquable, signatures en
  repères, « inclure les signaux faibles ». Le format définitif reste le point
  ouvert 7.


### D-25 — Archive de l'apprenant : le master v4 complet **[décidé]**

- `core/archive.js` : l'index du master v4 (`kind: "competency-map-master"`,
  `schemaVersion: "4.0.0"`) augmenté de `details` (journée → détail : verdicts,
  traces et extraits, jury, rapports, portfolio du jour), `runDetails`
  (délibérations AuroraCore), `exportedAt` et `includesPortfolio`. Nom :
  `cartographie-<type>-<date>.json`. Autoporteuse : référentiel embarqué.
- La réimportation passe par la chaîne d'import ordinaire (reconnaissance par
  `kind` + `schemaVersion` 4.x) : variantes et détails, portfolio, narratifs,
  métriques, délibérations, et l'**état de l'apprenant** (cases, étiquettes,
  choix de variante, ensembles, réponses au jury, repères, notes de
  comparaison ; titre et préférences seulement dans un jeu vide). Ce qui est
  déjà là gagne ; les doublons sont ignorés et comptés ; rapport d'import.
  Testé sans perte : export → réimport dans un jeu vide → mêmes journées,
  variantes, détails, délibérations et état.
- Sans le portfolio : le texte part, les volumes par jour restent (la heatmap
  reste juste), les extraits cités par le jury restent (ils font partie de
  l'analyse) ; l'interface le dit.
- Un master V3 (`3.x`, interface `#/cartographie-v3`) est converti
  (`importers/v3-master.js`) : mêmes verdicts, traces et extraits que l'import
  direct (test) ; la réponse V3, posée sur chaque lien de preuve, devient celle
  de l'observation (état commun, ou « nuancée » avec une note qui le dit).
- **[décidé]** Christian (2026-10-14, question 10) : « tout sauvegarder ».
  « Exporter toutes mes données » (archive de compte `archive-export`,
  UC-APP-06) passe en **1.1.0** et embarque chaque jeu de données de
  l'interface en archive complète (`jeuxCartographie`) — portfolio, réponses
  au jury et carnet compris ; la démonstration publique, marquée
  `origin: "demo"` à son chargement, n'y est pas **tant qu'elle est intacte**
  (elle se recharge depuis le site) — dès que la personne y ajoute quelque
  chose (un import, une réponse au jury, un dialogue, un ensemble, un repère,
  une note, un passage), ce sont ses données, et elles partent
  (`isPristineDemo`). L'import les restaure par la chaîne d'import de
  l'interface : un jeu de même identifiant est complété (ce qui est là gagne,
  doublons ignorés), sinon il est créé ; il ne compte comme restauré que s'il
  gagne quelque chose (réimporter ne restaure rien). « Ce qui est là gagne »
  vaut pour le portfolio : une archive réimportée dans un jeu qui a déjà le
  sien ne remplace pas le texte d'une journée (rapport : « votre texte est
  conservé ») et ne reprend pas ses passages sans date (rattachés à une
  journée ou écartés depuis) ; un passage sans date déjà en attente n'est
  jamais ajouté deux fois. Un fichier de portfolio, lui, reste une nouvelle
  version qui remplace le texte (avertissement `portfolio-remplace`). Une
  archive 1.0.0 reste valide.
- **Schéma** : `schemas/competency-map-master.schema.json`. Ossature typée
  (journées, variantes, verdicts résumés : statut, rôle des traces et choix de
  variante énumérés, confiance dans [0 ; 1] ou null, compteurs entiers ;
  détails par date ; réponses, ensembles, repères, carnet), racine et
  contenus produits par l'analyse ouverts (réflexions du jury, rapports de
  pôle, kairos, délibérations), car un champ inattendu ne doit jamais faire
  échouer l'export de quelqu'un (`docs/contrats.md`, décision 9). Fixture :
  la sortie exacte de l'interface pour un jeu qui touche chaque partie du
  conteneur (`schemas/fixtures/carto/competency-map-master-exemple.json`,
  régénérée par `web/scripts/carto-master-fixture.mjs`), validée par les
  deux runtimes (moteur, PHP) et par `validate-corpus` ; le corpus réel des
  59 journées publiques est conforme.
- **Robustesse** : un stockage de l'interface illisible n'empêche pas
  l'export — l'archive part sans les jeux, et le message le dit (« exportez-les
  depuis l'espace Export de la cartographie ») ; à l'import, le reste est
  restauré et le message le dit. Chaque jeu est validé seul : un jeu non
  conforme (un master édité à la main, importé) est laissé de côté et nommé,
  le reste de l'archive part. En amont, l'import de l'interface écarte et
  compte les éléments d'état illisibles d'une archive (réponse d'un état
  inconnu, repère sans date, ensemble sans définition, note sans clé) au lieu
  de les recopier (`etat-illisible`).
- **Au passage** : les validateurs précompilés du moteur, à recompiler pour le
  nouveau schéma, étaient périmés — anomalie AN-1 d'UC-SYS-04 : le
  référentiel 7.1.0 publié faisait échouer l'export « en un clic ». Recompilés ;
  UC-SYS-04-F06 vérifie désormais leur fraîcheur (recompilés = versionnés,
  octet pour octet).
- **Validation sur les journaux réels** (sur le Mac, compteurs seulement) :
  l'archive de chaque journal, délibérations AuroraCore comprises, est
  conforme au schéma, et l'archive de compte qui l'embarque aussi.

| Journal | journées | délibérations de run | taille de l'archive | conforme | archive de compte 1.1.0 | validation |
|---|---|---|---|---|---|---|
| 200 | 47 | 66 | 4,4 Mo | oui (0 erreur) | conforme | 26 ms |
| 300 | 51 | 64 | 3,8 Mo | oui (0 erreur) | conforme | 21 ms |
| GEN1 | 160 | 68 | 4,8 Mo | oui (0 erreur) | conforme | 25 ms |

### D-26 — Copie autonome : un modèle construit à part, les données insérées à l'export

- `web/carto-viewer.html` + `src/carto/viewer/` : le **même** `CartoApp` en
  mode `viewer` (lecture seule : magasin en mémoire, rien n'est écrit ; ni
  export, ni import, ni gestion des jeux ; bandeau « copie autonome »).
- `vite.viewer.config.js` construit un bundle IIFE unique ;
  `scripts/build-viewer.mjs` l'insère avec la feuille de style dans **un**
  fichier, `public/carto/viewer-template.html` (≈ 620 Ko, produit de
  construction non versionné ; `npm run build:viewer`, et `prebuild` pour que
  le site déployé le contienne).
- À l'export, le navigateur lit ce modèle (même origine), insère l'archive
  dans `<script type="application/json" id="carto-data">` (`<` échappé en
  `<`, séparateurs U+2028 / U+2029 aussi) et télécharge
  `cartographie-copie-<date>.html`. Le fichier s'ouvre en `file://` sans
  réseau (vérifié dans Chromium, tout le réseau coupé, aucune erreur).
- Portfolio **non inclus par défaut** ; s'il l'est, un avertissement dit que
  le fichier contient le texte intégral.
- Pour garder la copie légère : la table des attaques du Pédagogue est sortie
  dans `engine/src/pipeline/attaques.js` (l'import de `extract.js` tirait le
  validateur ajv), et le chargeur du référentiel publié est fourni par
  `App.jsx` (la copie embarque le sien).

### D-27 — Rapport imprimable

- Aperçu dans un dialogue rattaché à `<body>` ; tant qu'il est ouvert, la
  feuille d'impression ne sort **que** le rapport. Pages A4 : la règle `@page`
  est posée seulement pendant l'aperçu (une page nommée faisait couper Chrome
  avant chaque tableau). Soleil en SVG, aucune capture raster.
- Page 1 : pseudonyme choisi, période, ensemble (nommé s'il correspond à un
  ensemble enregistré), état (complet ou jusqu'à t), référentiel, soleil,
  pôles, légende. Page 2 : profil chiffré, tableau des pôles, compétences
  avec leur confiance cumulée, précautions de lecture. Pages suivantes : les
  réflexions du jury des compétences **choisies** (dernière journée observée,
  ou toutes), avec leurs extraits, le verdict, le motif, la prescription,
  l'examen du Pédagogue et, pour AuroraCore, les six voix et le président —
  pas les délibérations complètes, le débat ni les pièces du Greffier, qui
  réimprimeraient tout le journal. En option, une page de comparaison A/B
  (deux soleils, compétences communes / propres, récit, précautions). Les
  réponses de la personne au jury et sa note ne s'impriment que si elle le
  demande (cohérent avec D-15).
- **Défaut corrigé hors du module** : `styles/twin9-credit.css`, chargé avec
  tout le site (bundle unique), masquait **toute** impression
  (`body * { visibility: hidden }`) pour isoler la facture Twin9 : la
  cartographie (D-17) et le rapport sortaient en pages blanches. La règle est
  désormais limitée à `body:has(.facture-twin9)`.

### D-28 — « Préparer une démo » : anonymisation dans le navigateur

- Propositions : mots à majuscule (y compris composés, « Jean-Pierre », et
  après une élision, « l’Arnaud ») rencontrés au moins deux fois ailleurs
  qu'en début de phrase (portfolio ; à défaut, extraits) ; « J’ai » n'est pas
  un nom (l'apostrophe coupe le mot). Dictionnaire nom → remplacement (par
  défaut « Personne A », « Personne B »…), ajout manuel, enregistrement et
  rechargement **à part** (`cartographie-dictionnaire-<date>.json`).
- Les noms sont remplacés **comme les passages sont cherchés** : en une seule
  passe (un remplacement n'est jamais remplacé à son tour), sans tenir compte
  de la casse, des apostrophes (' ’) ni des blancs, en mot entier au sens des
  lettres (« Sam2 » est remplacé, « Samuel » non) ; une forme en capitales
  reçoit le remplacement en capitales. Sans cela, une ancre écrite
  « christian » ou « J'ai » ne changeait pas comme le portfolio écrit
  « Christian » ou « J’ai », et le passage n'était plus retrouvé (validation
  ci-dessous).
- Motifs : courriels, liens, téléphones (FR, CH, international), adresses →
  repères neutres **entre chevrons simples** (‹courriel›, ‹lien›,
  ‹téléphone›, ‹adresse›, ‹passage retiré›) : des crochets formaient, dans le
  Markdown, des liens qui changeaient le texte affiché ; un lien s'arrête
  désormais aux crochets et aux barres obliques inverses (« [texte](lien) »,
  « \<lien\> » gardent leur ponctuation). Test : remplacer puis afficher =
  afficher puis remplacer.
- **Les mêmes substitutions partout** : portfolio, extraits et ancres de
  surlignage, textes du jury, rapports, narratifs, noms de fichiers,
  identifiants de run (clés des délibérations comprises). Les champs
  techniques (identifiants, empreintes, dates, codes, états) ne reçoivent que
  les noms en forme exacte, bornés par des lettres et des chiffres, jamais les
  motifs (un identifiant hexadécimal peut contenir dix chiffres qui
  ressemblent à un téléphone : testé). Le référentiel n'est pas touché.
- Avant de remplacer, les ancres de chaque passage retrouvé en entier sont
  **alignées sur des mots entiers du texte affiché** (bords extérieurs et
  intérieurs, et bords de l'extrait) : une ancre coupée dans un mot (« …avec
  Chris ») ne recevrait pas le remplacement du nom entier, et le fragment de
  nom resterait dans l'extrait.
- Personnes tierces : les phrases du portfolio qui citent un nom du
  dictionnaire sont listées pour relecture ; « retirer ce passage » le
  remplace par « ‹passage retiré› » partout où il figure, et un extrait
  entièrement contenu dans la phrase retirée part aussi (sinon le passage
  restait lisible dans les extraits du jury).
- Revue avant export : remplacements comptés ; **vérification du surlignage
  trace par trace avec la recherche du lecteur**, dans le texte affiché
  (Markdown rendu) : même statut, même journée, avant et après ; surlignages
  perdus listés avec leur cause (passage retiré, ou remplacement à vérifier) ;
  mots à majuscule restants (noms de fichiers et titres compris, les plus
  fréquents d'abord) ; relecture du texte anonymisé jour par jour,
  remplacements mis en évidence. Les téléchargements (archive, copie
  autonome, ou ouverture dans ce navigateur) n'ouvrent qu'après confirmation
  de la relecture d'un aperçu à jour.
- La table de correspondance n'est **jamais** dans l'export.
- Démo du site : « Explorer la démonstration » ouvre
  `data/demo/carto/archive.json` s'il existe, sinon les 59 journées
  publiques. **[décidé]** Ce fichier, même anonymisé, vient d'un vrai
  portfolio : il n'est jamais versionné (`.gitignore`) ; il se dépose **par
  FTP sur le site**, avec un déploiement autorisé par Christian (question 11).
- Limite connue : sur un journal de 50 journées, l'aperçu calcule une dizaine
  de secondes (rendu de chaque journée, deux fois) pendant lesquelles la page
  ne répond pas ; un message l'annonce.

### D-29 — Validation de P5 sur les journaux réels, et ce qu'elle a corrigé

Sur le Mac, compteurs seulement (même chaîne que l'interface : import,
magasin, archive, réimport ; anonymisation avec la recherche du lecteur dans
le Markdown rendu). Test « en grand » : **toutes** les propositions du journal
deviennent des remplacements (bien plus qu'un vrai dictionnaire de noms), et
tous les motifs sont actifs.

| Journal | journées | archive (sans portfolio) | réimport sans perte | mots remplacés / occurrences | surlignages retrouvés avant → gardés au même endroit | mots du dictionnaire restants |
|---|---|---|---|---|---|---|
| 300 | 51 | 3,71 Mo (3,32) | oui (index, détails, délibérations ; doublons ignorés) | 407 / 88 048 | 159 → **159** | 0 |
| 200 | 47 | 4,32 Mo (3,91) | oui | 189 / 45 983 | 237 → **237** | 0 |
| GEN1 | 160 | 4,65 Mo (4,18) | oui | 60 / 18 769 | 10 → **10** | 0 |

Statuts identiques avant et après (journal 300 : 121 trouvés, 33 partiels,
5 retrouvés ailleurs, 21 non retrouvés — ceux-ci l'étaient déjà, voir P2).
Référentiel intact. La première passe avait cassé 15 à 26 surlignages sur
159 ; quatre corrections, chacune testée :

1. **Surlignage décalé après un émoji** (défaut de P2, lecteur compris) : le
   texte replié comptait un émoji (deux unités de code) pour une seule entrée
   d'index ; tout passage situé après était surligné décalé d'un caractère
   par émoji. Corrigé dans `collapseText` (test avec émojis et accent
   décomposé).
2. Noms remplacés comme les passages sont cherchés (casse, apostrophes,
   blancs) — D-28.
3. Repères neutres sans crochets et liens qui gardent leur ponctuation
   Markdown — D-28.
4. Ancres alignées sur des mots entiers du texte affiché — D-28.


### D-30 — Ce qui part sur le serveur : une version partagée, jamais le master **[validé]**

« Conserver ses données sur nos serveurs » (§12) est lu au plus juste : ce
qui est copié sur le serveur, c'est une **version partagée** composée par
l'apprenant, jamais l'archive complète (master v4), jamais le portfolio. Une
sauvegarde serveur de tout le travail n'est pas faite (question 14).

- **Liste positive** (`web/src/carto/core/share.js`, `buildSharedVersion`) :
  seules les compétences cochées y figurent, avec leurs chiffres
  **recalculés sur cette seule liste** (angles qui somment à 360°, pôles
  refaits) : un retrait ne laisse ni trou ni trace dans le soleil. Les
  journées qui comptent sont celles où une compétence retenue est observée ;
  le jury, les notes, les étiquettes, les ensembles, les métriques ne partent
  jamais.
- **Dates** à la précision choisie : jour, mois (proposé par défaut) ou
  masquées (ni période, ni heatmap, ni date d'extrait ; le nombre de
  journées reste).
- **Heatmap** : poids des traces des seules compétences retenues, par jour ou
  par mois, en cinq niveaux propres à la personne — jamais le volume du
  portfolio (qui dirait combien la personne écrit, sans qu'elle l'ait choisi).
- **Extraits** : aucun par défaut ; ceux que la personne coche passent par la
  relecture (D-33), sans Markdown, bornés à 2 000 caractères.
- **Référentiel embarqué** : tous les pôles (donnée publique ; les symboles du
  mode renforcé restent stables), les seules compétences retenues.
- Le serveur vérifie la même forme **par liste blanche de champs et de
  types**, à tous les niveaux (`api/src/Share/SharedVersion.php`) : un champ
  inconnu ou manquant, un type inattendu (un booléen qui porte du texte, un
  nombre en chaîne), un code de compétence inconnu, en double ou rangé dans
  un autre pôle, une date impossible ou plus fine que la précision choisie,
  une période inversée, un extrait d'une compétence retirée ou trop long, un
  référentiel augmenté (une compétence non retenue), une couleur qui n'est
  pas un code hexadécimal sont refusés (422). Une version partagée n'accepte
  ni `runMeta` ni versions de paquet ou de référentiel. Les deux listes sont
  tenues ensemble par une fixture **produite par le client lui-même**
  (`web/scripts/carto-share-fixture.mjs` écrit la sortie exacte de
  `buildSharedVersion` dans
  `schemas/fixtures/partage/carto-partage-exemple.json`) : le test du client
  exige l'égalité exacte, le test PHP l'accepte et la publie.
- **[écart, validé]** §12.2 propose « PHP 8 + SQLite (ou fichiers JSON) ». Le site a
  déjà une API PHP déployée par FTP, avec comptes, liens de partage hachés,
  quotas, audit et migrations par point d'entrée : la version partagée en
  est un nouveau type de cartographie (`cartographies.type = 'partage'`,
  migration 022) plutôt qu'un second stockage à maintenir.

### D-31 — Adultes seulement : une auto-attestation, gardée par le serveur

- `users.adult_attested_at` (migration 022) : date de l'attestation, posée
  par la personne au moment de partager (« J'atteste avoir 18 ans ou
  plus »), sans date de naissance ni justificatif. `GET /api/auth/me/adult`
  et `PUT {adult}` (`api/src/routes/partage.php`).
- **Le serveur tient la règle**, quoi qu'envoie le client : sans
  attestation, `POST /api/cartographies` de type `partage` et
  `POST /api/cartographies/{id}/share` sur une telle version répondent
  `403 {code: 'adult_required'}` et n'écrivent rien. L'attestation est relue
  sous verrou de la ligne `users` (`SELECT … FOR UPDATE`), dans la
  transaction même de l'insertion : un retrait simultané ne laisse passer ni
  version ni lien.
- **Retirer l'attestation efface** aussitôt toutes les versions partagées du
  compte et leurs liens (§12 : « pour les mineurs, ni copie serveur ni
  partage ») : aucun compte sans attestation ne garde de copie serveur, et
  personne n'a à se redéclarer majeur pour effacer ce qu'il a publié.
  L'interface propose d'abord de tout télécharger (« Télécharger toutes mes
  versions (JSON) »), demande une confirmation en deux temps (« Confirmer :
  effacer mes versions partagées »), puis dit combien de versions ont été
  effacées ; la réponse et l'audit ne portent que ce compteur
  (`deletedVersions`).
- **À chaque publication**, une case est exigée en plus de l'attestation du
  compte : « J'atteste avoir 18 ans ou plus au moment de cette
  publication » (§12.1 : « au moment de la publication »). Lecture de « La
  création de compte n'est pas obligatoire » : toute l'interface s'utilise
  sans compte (tout reste local) ; seul le partage en demande un, puisque
  l'attestation est portée par un compte et que l'API authentifie
  l'apprenant (§12.2) **[validé]** (question 24).
- Le partage historique du site (`#/espace`, cartographies du moteur, mot de
  passe obligatoire) n'est **pas** soumis à l'attestation : le changer
  toucherait un parcours existant (UC-APP-05) ; décision laissée à Christian
  (question 17).
- **Le client** : le module se règle par `{serverEnabled, adultOnly}`
  (§12.2, `deps.share` de `CartoApp`, normalisé par `normalizeShareConfig`) ;
  `serverEnabled` est faux par défaut (copie autonome, phase 1) et vrai sur le
  site, `adultOnly` vrai par défaut. Le serveur répond aussi
  `required: true` : le client ne peut qu'ajouter l'exigence, jamais la
  retirer.
- **Absente de l'interface** : l'espace « Partage »
  (`#/cartographie/partage`) n'apparaît qu'à un compte apprenant connecté,
  sur le site ; pas pour un visiteur, ni dans une copie autonome. Pour un
  compte sans attestation, il ne montre que l'attestation : ni choix, ni
  aperçu, ni publication, ni lien, ni liste des versions — et aucune requête
  de publication n'est possible depuis l'interface.

### D-32 — Le lien : mot de passe facultatif, jamais indexé, journal des accès

- Jeton de 128 bits (existant, stocké haché), expiration 90 jours par défaut
  (1 à 365), révocation immédiate. Pour une version partagée, le mot de
  passe est **facultatif** (§12.1) : `share_links.password_hash` devient
  NULL-able ; sans mot de passe, l'URL se termine par `/ouvert` et
  `GET /api/share/open` (public, même quota par IP que le formulaire, 404
  homogène, 401 `password_required` si le lien a un mot de passe) sert la
  version. Le jeton y voyage dans l'en-tête `X-Share-Token`, **jamais dans
  l'URL de l'API** : sans mot de passe, il suffit à lire la version, et une
  URL finit dans les journaux d'accès du serveur. Un mot de passe qui n'est
  pas du texte est refusé (422) au lieu d'être pris pour une absence de mot
  de passe. Les autres types gardent le mot de passe obligatoire.
- **Jamais indexé** : `X-Robots-Tag: noindex, nofollow, noarchive` et
  `Cache-Control: no-store` sur toutes les réponses publiques de partage,
  plus une balise `robots` tant que la page de partage est affichée. Aucune
  statistique tierce (le site n'en a aucune).
- **Journal des accès** pour l'auteur : `GET /api/shares/{id}/consultations`
  (dates des consultations réussies, tirées des événements d'audit
  `share_consulted` qui ne portent que des identifiants — ni IP, ni
  navigateur). Une ouverture = une consultation : la lecture d'un lien
  ouvert est partagée entre montages (mode strict de React).
- Le lien n'est montré **qu'une fois**, à sa création (seule son empreinte
  est gardée) : l'interface le dit et propose de le copier.

### D-33 — Composer, relire, publier

Espace `ui/SharePanel.jsx`, en trois étapes puis la gestion :

1. **Choisir** : titre (« Ma cartographie de compétences » par défaut, jamais
   le nom du jeu de données, qui peut contenir celui de la personne),
   précision des dates, arbre pôles → compétences à cases à trois états
   (toutes les compétences observées partent cochées, les extraits partent
   décochés **[validé]**, question 23), extraits proposés par compétence
   (traces de l'ensemble coché, chargées à la demande). La version part de
   l'état affiché (journées cochées, date t).
2. **Relire** (§12.2, contenus tiers) : masques des courriels, liens,
   téléphones et adresses (actifs par défaut, avec leurs nombres), appliqués
   au titre comme aux extraits ; mots à majuscule repérés dans le titre et
   les extraits, à remplacer d'un clic par « ‹nom› » (ou un autre nom),
   dans le titre publié comme dans les extraits ; chaque extrait peut être
   modifié ou « Retiré de cette version partagée » ; une case « j'ai relu »
   est exigée, et se décoche dès que le titre, un extrait, un masque ou un
   remplacement change.
3. **Aperçu verrouillé** : le composant même du destinataire (`SharedView`),
   avec les données mêmes ; encart RGPD (ce qui part, hébergement, durée de
   conservation, droits, journal, pas d'indexation), case de demande
   explicite et case d'attestation de cette publication (D-31), puis
   « Publier la version partagée ».

Vocabulaire : on **retire** d'une version partagée ; « Supprimer » n'apparaît
nulle part (le retrait d'une version du serveur s'appelle « Retirer cette
version du serveur »). **Instantané figé** : aucune route ne modifie le
document d'une version, ni son titre (le titre servi est celui du document ;
un `PATCH` du titre est refusé) ; une version partagée est hors du module de
relecture des cartographes (annotations, révisions, garantie : 404).

**Nouvelle version (décision du 2026-10-14, question 15)** : elle se publie,
par défaut, **à la place** de la version la plus récente publiée **depuis ce
jeu** dans ce navigateur (sans elle : comme une version distincte ; jamais, par
défaut, à la place de la version d'un autre jeu, destinée à quelqu'un
d'autre — relecture du 2026-10-14, D-41) — même lien, les
destinataires voient la nouvelle version, l'ancien document est effacé du
serveur (`PUT /api/cartographies/{id}/document` : mêmes gardes que la
publication — attestation relue sous verrou, liste blanche, propriétaire —,
audit `shared_version_replaced`, ids seulement ; le journal des accès du lien
continue). À l'étape d'aperçu, un choix « à la place de « … » » (coché sur la
plus récente de ce jeu) ou « comme une version distincte, avec ses propres
liens » ; le
bouton le dit (« Publier à la place de « … » »). Chaque version porte
« Publier une nouvelle version à la place », qui reprend sa composition :
gardée **dans ce navigateur** à chaque publication (titre, dates,
compétences, extraits choisis, retouches, noms remplacés, masques ;
`localStorage`, jamais sur le serveur ; `ui/shareDrafts.js`) — effacée avec la
version, avec le jeu, avec le compte (UC-CPT-06), et, à l'ouverture de
l'espace Partage, quand la version n'est plus sur le serveur (retirée depuis un
autre appareil) — ou, à défaut,
reconstituée depuis le document publié (titre, dates, compétences ; les
extraits sont à choisir de nouveau). La liste indique « remplacée le … ».

Les textes sont coupés par caractères entiers (un émoji n'est jamais coupé
en deux, ce qui rendait la requête illisible pour le serveur) ; un refus du
serveur s'affiche avec son motif (« document : … »).

Gestion : versions publiées (privée / lien partagé), liens (création avec
expiration et mot de passe facultatif, révocation en deux temps, état
actif / expiré / révoqué), journal des accès, aperçu, export JSON complet
d'une version (document, liens, journal), retrait immédiat, retrait de
l'attestation. Hébergement affiché : « OVHcloud, dans l'Union européenne »
**[validé pour le prototype]** (question 16 : la version finale migrera
probablement chez Infomaniak, en Suisse ; le texte changera alors, avec la
politique de confidentialité).

### D-34 — La vue du destinataire

`ui/SharedView.jsx`, ouverte par `ShareView` pour un partage de type
`partage` (`#/partage/<jeton>` avec mot de passe, `#/partage/<jeton>/ouvert`
sans) : titre, période à la précision choisie, nombre de journées et de
compétences, date de la version ; le soleil (sélection d'un secteur pour
lire une compétence) ; la heatmap (bande des mois, ou calendrier par jour) ;
les compétences par pôle avec leurs chiffres, leur description et les
extraits choisis ; « Comment lire ce soleil » (ce document ne classe pas, ne
compare pas, ne dit rien de ce qui n'a pas été partagé). Lecture seule, sans
comparaison ni droit de réponse, sans aucun appel réseau autre que la
lecture du lien (le référentiel est embarqué). Un document illisible affiche
un message au lieu de casser la page ; la vue est remontée à chaque lien
ouvert, si bien qu'un lien ne montre jamais le document d'un autre.


### D-35 — Dialogue d'accompagnement : un questionnement scripté, tiré des traces

Espace « Dialogue » (`#/cartographie/dialogue`, `ui/DialoguePanel.jsx`,
cœur `core/dialogue.js`), d'après `proto_chatbot_socratique` (fiche
d'analyse : « fonction candidate 3 et 4 ») :

- **Les questions viennent des traces de la personne**, jamais d'un texte
  écrit à l'avance sur quelqu'un (le prototype citait un journal réel en
  dur). Sept fils, dans un ordre fixe, chacun présent seulement si ses
  données existent : **citation** datée (la preuve la plus sûre, la plus
  récente à confiance égale, avec « Lire dans le journal » et « Ouvrir la
  journée ») ; **silence** (« une donnée, pas un trou » : le plus long écart
  du journal, s'il dépasse une semaine et trois fois l'écart habituel de la
  personne) ; **apparition** (la compétence apparue le plus tard) ;
  **constance** (celle qui revient le plus, au moins trois journées) ;
  **renvoi** (une présence que l'analyse renvoie à un cartographe) ;
  **changement de vocabulaire** (le plus grand écart lexical entre deux
  journées écrites consécutives, relatif à la personne, sans seuil fixe) ;
  **écart** entre les deux ensembles de la comparaison (première phrase
  factuelle du récit « ce qui a changé », §9.4).
- **Questions ouvertes, sans valence** (ni progrès, ni faible, ni conseil,
  ni comparaison à quiconque) — un test le vérifie. Vouvoiement, comme le
  reste de l'interface (le prototype tutoyait) **[validé]**.
- **Honnêteté du dispositif** : le script ne lit pas les réponses pour
  choisir la suite ; l'ouverture le dit (« c'est un questionnement, pas une
  conversation »). On peut répondre, passer une question, s'arrêter,
  recommencer.
- **Carnet local** (le prototype ne gardait rien) : « Garder dans mon
  carnet » enregistre questions et réponses (bornées) dans le jeu de données
  (`reflections[]`, dans le navigateur) ; chaque dialogue se relit, se copie
  ou se télécharge en Markdown (pour le recopier dans son journal) et se
  retire en deux temps. Le carnet suit le portfolio dans l'archive JSON
  (exclu quand on exporte sans le texte du portfolio), n'entre dans la copie
  HTML autonome que pour les dialogues versés au portfolio, et avec lui
  seulement (D-40 ; auparavant jamais : une copie se transmet), jamais dans
  une version partagée (liste blanche, D-30) ni dans une démo anonymisée (le
  rapport de la démo le compte), et se restaure à la
  réimportation d'une archive (doublons ignorés, entrées nettoyées et
  bornées comme à la saisie). Dans une copie autonome, rien n'est
  enregistré.

### D-36 — Relances par un modèle de langage : facultatives, sur accord explicite

« Sans LLM par défaut » : le dialogue ne fait **aucune requête**. Une option
repliée, « Relances par un modèle de langage (facultatif) », permet de
demander, après une réponse, une question de relance :

- fournisseur au choix parmi ceux des runs (`PROVIDERS` de
  `lib/run-launcher.js`), **Ollama local proposé d'abord** (la relance ne
  quitte alors pas l'ordinateur) ; clé personnelle (celle déjà enregistrée
  dans le navigateur, ou saisie pour la page seulement) ; appel **direct du
  navigateur** par le moteur (`createProvider`, transport `direct`) — jamais
  par les serveurs de humanome (le « service humanome » des runs n'est pas
  proposé ici **[validé]** : Christian ne paie pas les relances ; seule la
  démo des visiteurs, plafonnée par jour, passe par sa clé) ;
- **accord explicite** : case décochée par défaut, impossible à cocher tant
  que le fournisseur n'est pas utilisable, retirée dès qu'on change de
  fournisseur, de version ou de clé, jamais enregistrée ; puis un bouton par
  réponse (« Demander une relance à … ») : l'accord seul n'envoie rien ;
- la requête (`buildRelaunchRequest`) n'emporte **que** la question, la
  réponse et le passage cité, avec une consigne système qui interdit
  jugement, évaluation, conseil, diagnostic et comparaison ; la relance
  s'affiche en texte simple, bornée, marquée comme venant d'un modèle de
  langage, et se garde dans le carnet avec le nom du modèle ;
- l'option n'existe pas dans la copie autonome (le module est fourni par le
  site : `deps.llm` dans `App.jsx`) ;
- une relance encore en attente quand on recommence le dialogue est
  écartée : elle ne s'attache jamais au dialogue suivant.

**Politique de sécurité du site** : jusqu'au 2026-10-14, `connect-src 'self'`
(`web/public/.htaccess`) interdisait au navigateur tout appel vers un
fournisseur ou vers Ollama — les relances ne pouvaient pas aboutir sur le
site déployé, pas plus que les runs « clé personnelle » existants (défaut
antérieur, constaté sur l'en-tête en ligne). **Décision de Christian
(question 22)** : les runs avec clé personnelle doivent fonctionner sur le
site déployé. `connect-src` autorise désormais, en plus de notre API,
exactement les fournisseurs que le moteur appelle en direct (Anthropic,
OpenAI, Google, xAI, OpenRouter, Ollama sur `localhost:11434`) ; la clé ne
passe jamais par notre serveur. Gardes : `web/src/lib/csp-providers.test.js`
(la liste suit les adaptateurs du moteur, rien d'autre ne s'ouvre) et
`web/e2e/csp-cle-personnelle.e2e.js` (sous la directive de production : la
relance avec clé personnelle part vers le fournisseur, un autre hôte reste
bloqué ; le même test échoue avec l'ancienne directive). La sandbox
promptologue reste fermée (`sandbox-isolation.e2e.js` vert). Pour Ollama
depuis le site, l'utilisateur autorise l'origine (`OLLAMA_ORIGINS`) ; un
appel qui n'aboutit pas affiche « … n'a pas pu être joint depuis cette page
(…). Aucune relance n'a été reçue. »

### D-37 — Vérification indépendante de P6 et P7

Une relecture indépendante de P6 et P7 (un agent distinct, qui n'a pas écrit
le code, avec des sondes écrites hors du dépôt : PHPUnit, Vitest, Node) a
relevé 15 points ; 13 sont corrigés, 2 relèvent d'une décision.

| # | Constat | Suite |
|---|---|---|
| 1 | Retirer l'attestation gardait les versions sur le serveur et cachait le seul moyen de les effacer ; le message du retrait ne s'affichait pas ; annotations et renommage restaient possibles sur une version partagée | corrigé : le retrait efface versions et liens (D-31), message affiché ; version hors du module de relecture, titre figé (D-33) |
| 2 | Liste blanche du serveur trop lâche (types non vérifiés : du texte passait par un booléen ; référentiel augmenté ; `runMeta` accepté ; période inversée) ; certaines versions acceptées faisaient planter la vue du destinataire | corrigé : liste blanche des champs et des types, contrat par la sortie exacte du client (D-30) ; vue du destinataire qui ne plante plus (D-34) |
| 3 | Remplacements de noms et masques jamais appliqués au titre | corrigé (D-33) |
| 4 | La copie HTML « avec portfolio » emportait le carnet du dialogue | corrigé : jamais de carnet dans une copie HTML (D-35) ; depuis la question 20, les seuls dialogues versés au portfolio y entrent, avec lui (D-40) |
| 5 | Le partage historique du site n'exige pas l'attestation | **décision à prendre** (question 17) |
| 6 | La politique de sécurité du site bloque les relances (et les runs « clé personnelle ») | décidé le 2026-10-14 (question 22) : `connect-src` ouvert aux seuls fournisseurs (D-36) |
| 7 | Un mot de passe numérique créait un lien sans mot de passe | corrigé : 422 (D-32) |
| 8 | Le jeton d'un lien ouvert figurait dans l'URL de l'API, donc dans les journaux d'accès | corrigé : en-tête `X-Share-Token` (D-32) |
| 9 | Création de lien et retrait de l'attestation non atomiques | corrigé : verrou de la ligne `users` (D-31) |
| 10 | Version « figée » renommable | corrigé : titre du document, `PATCH` refusé (D-33) |
| 11 | Révisions demandées sur une version partagée : erreur 500 | corrigé : 404 (D-33) |
| 12 | Coupe au milieu d'un émoji (publication refusée sans raison lisible) ; motif des refus du serveur masqué | corrigé : coupes par caractères entiers, motif affiché (D-33) |
| 13 | La vue du destinataire gardait le document d'un lien ouvert avant | corrigé (D-34). Laissé : un lien sans mot de passe ouvert sans `/ouvert` (adresse tronquée à la main) montre le formulaire, et n'importe quel mot de passe l'ouvre ; pour un lien ordinaire, rien ne part avant la saisie |
| 14 | Une relance en attente s'attachait au dialogue recommencé ; un carnet réimporté n'était pas nettoyé | corrigé (D-35, D-36) |
| 15 | `role="log"` posé sur la liste lui retirait sa sémantique | corrigé : le journal enveloppe la liste |

Lectures de la spécification signalées et retenues : attestation redemandée
à chaque publication (D-31) ; compétences cochées par défaut (question 23).
Chaque correction a son test, qui échoue si on la défait (§3).

### D-38 — Retrait des pages V3 **[décidé]**

Christian (2026-10-14), en comparant `#/merge` et `#/cartographie` en local :
« Quel avantage à conserver la vieille [cartographie] sur le site ? » — aucun ;
décision : retirer les pages V3 et renvoyer vers `#/cartographie`.

- **Adresses** : `#/merge` et `#/cartographie-v3` donnent la route
  `redirect` ; l'application remplace l'entrée d'historique par
  `#/cartographie` (le bouton « Précédent » ne ramène pas sur l'ancienne
  adresse) et affiche aussitôt l'interface ultime.
- **Accueil** : « Explorer la cartographie de démonstration » mène à
  `#/cartographie` ; « Ouvrir mes fichiers de cartographie » (plusieurs
  fichiers, ou des dossiers par dépôt) lit les fichiers dans le navigateur et
  les remet à l'interface (`incoming`), qui les importe **une fois**, dans un
  nouveau jeu ; son rapport d'import dit ce qui n'est pas reconnu (il n'y a
  plus de validation de schéma sur l'accueil : l'import de l'interface
  reconnaît davantage de formats).
- **Vue journée historique** (`#/jour/<date>`) conservée pour les journées de
  la démonstration ; son « Retour à la cartographie » mène à `#/cartographie`.
- **Supprimés** : `V3View.jsx`, les panneaux, outils et partage de la V3, leurs
  tests, les tests fonctionnels d'UC-APP-12 (fiche marquée « retiré »), l'e2e
  `timeline-demo`. **Conservés** : `web/src/v3/core/` (conversion des masters
  V3, D-25 ; lecture ZIP ; identifiants) et la grille de tuiles du tableau de
  bord, avec leurs tests unitaires.
- Les **composants de dessin historiques** (`DayView`, `MergeView`) restent le
  rendu des cartographies produites sur le site : essai visiteur, « Mes
  cartographies », relecture du cartographe, établissement, Twin6, Twin9 (et
  l'ancien partage, que la question 17 retire). Les remplacer par l'interface
  ultime, écran par écran, est un chantier proposé à Christian.
- Aide contextuelle (`help/registry.js`) et guides de formation (visiteur 01 et
  02, apprenant 01 et 05) réécrits pour la nouvelle interface ; fiches
  UC-VIS-01, UC-VIS-04, UC-APP-03, UC-APP-12, UC-ETA-04, ADR-009 mises à jour.
- Oubli du premier passage, corrigé ensuite : les trois chapitres de
  formation consacrés à la V3 sont réécrits — apprenant 07 « Votre
  cartographie, pas à pas », cartographe 07 « Relire dans l'interface de
  cartographie » (l'outil de l'entretien ; la garantie reste dans l'espace
  cartographe), employeur 06 « Lire une version partagée » (la vue du
  destinataire, D-34). Les droits de réponse y sont décrits tels qu'ils sont :
  locaux et sans effet sur le soleil (la V3 retirait du soleil une
  observation contestée). Noms de fichier inchangés : ils servent de clés à
  la progression de formation. Sommaires des parcours et `SUMMARY.md` à
  jour.

### D-39 — Surlignage approché des extraits reformulés **[décidé]**

Christian (2026-10-14, question 9) : « Un surlignage approché signalé comme
tel convient. »

- **Quand** : dans la seule journée de la trace, quand rien n'y est retrouvé
  tel quel (ni le passage entier, ni un de ses bouts) et que le passage n'est
  retrouvé tel quel dans aucune autre journée. Ordre (`core/passages.js`) :
  trouvé → retrouvé ailleurs → partiel → **approché** → non retrouvé. Jamais
  dans une autre journée : avec des mots seulement, on finirait toujours par
  trouver quelque chose quelque part.
- **Comment** (`locateApproximate`, `core/highlight.js`) : on garde les mots
  pleins de l'extrait (quatre lettres au moins, hors mots-outils) ; la feuille
  est découpée en phrases ; on retient tour à tour la phrase qui apporte le
  plus de mots de l'extrait encore manquants (deux au moins), quatre phrases
  au plus. Les phrases retenues doivent réunir **au moins 75 %** des mots
  pleins de l'extrait, qui doit en compter quatre au moins ; chacune est
  encadrée de son premier à son dernier mot de l'extrait. En dessous : « non
  retrouvé », on ne devine pas.
- **Phrase** : elle s'arrête à une ponctuation forte **ou à une limite de
  bloc** du texte affiché (paragraphe, élément de liste, titre). Une phrase
  démesurée au regard de l'extrait (plus de quatre fois ses mots pleins, et
  plus de 24 mots) n'est jamais retenue : l'encadrer ne localiserait rien.
  Sans cela, une feuille en liste sans point final formait une seule
  « phrase » : sur une feuille d'essai, la relecture du 2026-10-14 (D-41) a
  obtenu un seul cadre de cinq lignes, 63 % de la feuille, dit « la phrase la
  plus proche ».
- **Signalé comme tel** : un cadre **pointillé** violet, sans fond (ni le
  jaune ni l'orange des passages retrouvés tels quels, et lisible sans les
  couleurs). Le volet dit : « Passage approché : l'extrait du jury ne figure
  pas mot pour mot dans le portfolio (reformulé par l'analyse). La phrase la
  plus proche, qui en contient 89 % des mots, est encadrée en pointillés : à
  vérifier », puis cite l'extrait du jury ; la navigation dit « Phrase 1 sur
  3 », pas « Occurrence ».
- **Premier essai écarté** : une fenêtre de mots glissante, de la longueur de
  l'extrait (`b82ebd5`), ne rattrapait qu'une trace par journal. Un extrait
  reformulé résume souvent plusieurs phrases, parfois éloignées : d'où la
  couverture par phrases (`693f079`).

Validation sur les journaux réels (sur le Mac, compteurs seulement, même
chaîne que l'interface) :

| Journal | non retrouvés avant | approchés (fenêtre) | approchés (phrases) | non retrouvés après | mots de l'extrait couverts | phrases encadrées par trace | part de la feuille encadrée |
|---|---|---|---|---|---|---|---|
| 200 | 65 | 1 | 4 | 61 | 75, 78, 84, 100 % | 1, 2, 3, 3 | 2 à 4 % |
| 300 | 21 | 1 | 6 | 15 | 75 à 82 % | 2, 2, 2, 3, 3, 3 | moins de 1 à 6 % |
| GEN1 | 0 | 0 | 0 | 0 | — | — | — |

Chiffres de la version finale (`b651f38`, phrases coupées aussi aux limites
de bloc, D-41). La première version par phrases (`693f079`) donnait les
mêmes nombres de traces approchées et non retrouvées, avec 75 à 100 % (200)
et 75 à 92 % (300) des mots de l'extrait couverts et 1 à 6 % de la feuille
encadrée : une phrase arrêtée à la fin d'un paragraphe ou d'un élément de
liste encadre moins large, et réunit parfois un peu moins de mots, toujours
au-dessus du seuil.

Pour les traces qui restent non retrouvées, même sans limite du nombre de
phrases, les mots pleins de l'extrait n'atteignent jamais 75 % : moins de la
moitié pour 49 sur 61 (journal 200) et 10 sur 15 (journal 300), 74 % au plus
pour les autres. Le volet continue de les dire non retrouvées et cite
l'extrait.

### D-40 — Verser un dialogue au portfolio **[décidé]**

Question 20 : le prototype annonçait que le texte consigné « fera partie du
portfolio à la prochaine évaluation » ; fallait-il un chemin du carnet vers le
portfolio ? Christian (2026-10-14) : oui, c'est utile « pour la personne
externe qui lit le portfolio ».

- **Un geste explicite, dialogue par dialogue** : « Verser à mon portfolio »
  dans le carnet ; « Retirer de mon portfolio » le défait. Rien n'est
  recopié : un drapeau `versedAt` sur le dialogue (`setReflectionVersed`),
  qui fait l'aller-retour de l'archive. Retirer un dialogue du carnet le
  retire du portfolio.
- **Dans la journée où il a été tenu** (date locale), après le texte de
  cette journée s'il y en a un.
- **Ce que cela change** : (1) espace Export, un format de plus,
  **Portfolio (Markdown)** — le texte de chaque journée (cochées ou non),
  dans l'ordre des dates, suivi des dialogues versés, puis les passages
  restés sans date : à relire, à transmettre à qui lit le portfolio, à
  réimporter, ou à faire analyser lors de l'évaluation suivante ; (2) la
  **copie autonome avec portfolio** emporte les dialogues versés, et eux
  seuls, lisibles dans son espace Dialogue (« versé à son portfolio par son
  auteur ») ; sans portfolio, aucun.
- **Inchangé** : l'archive JSON garde tout le carnet quand on y inclut le
  portfolio ; jamais de carnet dans une version partagée (D-30) ni dans une
  démo (D-28). L'interface ne mêle pas un dialogue versé au texte des
  journées déjà analysées (ni heatmap, ni surlignage, ni volume) : il attend
  l'évaluation suivante. Le portfolio exporté se réimporte **avec** les
  analyses de cette évaluation (il devient alors le texte des journées) ; un
  dialogue versé déjà présent dans le texte de sa journée n'est pas ajouté une
  seconde fois à l'export suivant (relecture du 2026-10-14, D-41 : le fichier
  en portait deux).
- **Forme** (`versedDialogueMarkdown`) : `### Dialogue d'accompagnement du …`,
  puis une ligne qui dit d'où viennent les questions et que les réponses sont
  de l'auteur ; seulement les questions répondues (« **Question.** »,
  « **Réponse.** ») ; le passage cité, daté et attribué au dialogue ; la
  relance, attribuée au modèle de langage qui l'a proposée. Le lecteur — et
  l'analyse suivante — savent ainsi ce qui est de la main de la personne.
- **Contrat de redécoupage** (`core/portfolio-md.js`) : relu par le découpage
  du module Portfolio du site (`segmentText`, celui de l'import), le fichier
  redonne les mêmes journées. Chaque journée s'ouvre sur son en-tête de date
  (sinon `## AAAA-MM-JJ` est ajouté : passage rattaché à la main, titre du
  document ; jamais en double). Une ligne qui ouvrirait une autre journée est
  neutralisée : un séparateur (`---`…) devient le même trait espacé
  (`- - -`), qui s'affiche pareil sans rien couper ; une date seule sur sa
  ligne (dans une réponse, ou dans une feuille qui cite un autre jour) est
  précédée d'un tiret « — ». Les passages sans date viennent à la fin, chacun
  après un séparateur, et restent sans date.

Validation sur les journaux réels (sur le Mac, compteurs seulement) : le
portfolio de chaque journal, plus deux dialogues synthétiques versés — l'un
tenu un jour écrit, l'autre un jour sans texte, avec dans la réponse une date
seule et un séparateur —, exporté puis redécoupé comme à l'import :

| Journal | journées écrites | sans date | redécoupé : mêmes journées | textes repris tels quels | séparateurs en traits espacés | dates neutralisées | dialogues dans leur journée |
|---|---|---|---|---|---|---|---|
| 200 | 47 | 2 | oui (48 avec le jour du dialogue) ; 2 sans date | 47 / 47 | 0 | 0 | 2 / 2 |
| 300 | 51 | 0 | oui (52) | 0 / 51 (feuilles séparées) | 120 | 15 | 2 / 2 |
| GEN1 | 160 | 1 | oui (161) ; 1 sans date | 160 / 160 | 0 | 0 | 2 / 2 |

Le journal 300 vient de feuilles séparées, datées par leur nom de fichier,
avec des séparateurs à l'intérieur des journées et 15 lignes qui portent la
date d'un autre jour : la première version de l'export (`f52b0ed`) leur
ajoutait un en-tête en double et préfixait 139 lignes d'un tiret ; corrigé
(`1ed2786`) : traits espacés, en-tête jamais doublé, seules les 15 dates
précédées d'un tiret. (Les lignes neutralisées des dialogues synthétiques ne
sont pas comptées.)

### D-41 — Relecture indépendante des décisions du 2026-10-14

Comme pour P6 et P7 (D-37), un agent distinct, qui n'a pas écrit le code, a
relu les commits `210325f` à `e8f50e7` (angle, politique de sécurité, retrait
de la V3, version remplacée, surlignage approché, carnet → portfolio, archive
de compte 1.1.0), avec des sondes écrites hors du dépôt. Il relève **9
défauts, aucune faille de sécurité bloquante** ; six reproduits par une sonde
qui échoue comme prévu, trois établis par la lecture du code. Tous sont
corrigés ; chaque correction a son test, qui échoue si on la défait.

| # | Constat | Suite |
|---|---|---|
| 1 | Restaurer une archive de compte dans un jeu existant remplaçait le texte des journées et rajoutait les passages sans date (une correction locale revenait en arrière, un passage écarté revenait) ; l'avertissement n'atteignait pas le message de l'archive de compte | corrigé : sur un jeu qui a déjà son portfolio, une archive ne touche ni au texte d'une journée qui en a un, ni aux passages sans date ; un passage déjà en attente n'est jamais ajouté deux fois (D-25) |
| 2 | Ce que la personne ajoute à la démonstration (son portfolio importé par le gestionnaire, un dialogue…) manquait à « Exporter toutes mes données », qui promet tout | corrigé : seule la démonstration **intacte** est laissée de côté (D-25) |
| 3 | Tableau de bord, Constance : traits plats depuis que l'angle compte les points (échelle [0 ; 1] commune au trait et aux pastilles) | corrigé : le trait à l'échelle de la compétence, les pastilles de 0 à 1 (D-22) |
| 4 | Le portfolio Markdown réimporté « ici », puis exporté de nouveau, portait deux fois chaque dialogue versé | corrigé : un dialogue déjà dans le texte de sa journée n'est pas rajouté ; la carte d'export propose de réimporter le fichier avec les analyses de l'évaluation suivante (D-40) |
| 5 | « Publier à la place » visait par défaut la version la plus récente du compte, même publiée depuis un autre jeu, pour un autre destinataire : son lien aurait montré l'autre contenu | corrigé : par défaut, la plus récente publiée depuis ce jeu ; sinon, une version distincte (D-33) |
| 6 | Surlignage approché : une liste sans ponctuation finale formait une seule « phrase », encadrée en entier | corrigé : limites de bloc, phrases démesurées jamais retenues (D-39) |
| 7 | Un seul jeu non conforme au schéma (un master édité à la main, accepté par l'import de l'interface) faisait échouer toute l'archive de compte, portfolio compris | corrigé : ce jeu est laissé de côté et nommé, le reste part ; l'import de l'interface écarte et compte les éléments d'état illisibles (D-25) |
| 8 | Les brouillons des versions partagées (extraits retouchés, vrais noms remplacés) restaient dans le navigateur après la suppression du jeu ou du compte, ou un retrait fait ailleurs | corrigé : effacés avec le jeu, avec le compte (UC-CPT-06), et à l'ouverture de l'espace Partage pour les versions qui ne sont plus sur le serveur (D-33). Reste : dans un autre navigateur, après la suppression du compte, ils demeurent jusqu'à la suppression du jeu dont ils viennent (qui contient déjà, lui, le portfolio entier) |
| 9 | Restes du passage aux points : la note d'épaisseur minimale disait « confiance si faible » pour une confiance inconnue ; l'élargissement n'était jamais signalé pour un pôle ; `displayedOuterRadius` et son test suivaient encore l'ancienne règle | corrigé : la note dit la raison, le pôle le signale, une seule fonction pour l'épaisseur affichée (D-8) |

Rien de sérieux, d'après la même relecture, sur : la route
`PUT /api/cartographies/{id}/document` (requêtes limitées au propriétaire,
404 pour un autre compte, 422 pour un autre type, CSRF, attestation relue sous
verrou, liste blanche, audit sans contenu) ; la politique de sécurité (le
`connect-src` suit exactement les adaptateurs du moteur ; la sandbox garde son
`default-src 'none'`) ; les injections (dialogues versés rendus en texte,
copie autonome par `scriptSafeJson`, surlignage assaini de nouveau par
DOMPurify) ; les formules (l'élargissement converge et garde la somme ; la
confiance du jury n'entre plus nulle part dans l'angle) ; le retrait de la V3 ;
la copie autonome et la démo (seuls les dialogues versés, avec le portfolio ;
la démo anonymisée n'emporte pas le carnet). **Note retenue** : ouvrir
`connect-src` aux fournisseurs donne à une faille XSS future cinq
destinations où envoyer des données avec la clé d'un attaquant ; compromis
accepté avec D-36, désormais consigné dans `docs/securite-checklist.md`
(risque résiduel, défense en amont).

### D-42 — Une version garantie : publiée par un cartographe, à la demande de l'apprenant **[décidé]**

Christian (2026-10-14), en réponse à la question 17 (retirer l'ancien
partage, alors le seul chemin par lequel un employeur voyait la garantie d'un
cartographe) : la génération du JSON précède la publication ; le cartographe
valide le résultat de l'évaluation par IA, modifie ce qui doit l'être et en
discute avec l'apprenant ; l'apprenant partage ensuite librement, sans que le
cartographe intervienne. Comme les fichiers JSON peuvent être artificiellement
modifiés, **un cartographe publie la cartographie de l'apprenant, à sa
demande** : « au niveau de l'interface, rien ne change. C'est juste que le
cartographe qui publie se porte garant d'avoir vérifié ce que la personne qui
est cartographiée a fait et de ce que l'IA a détectée (ainsi que le groupe
classe qui travaille également avec l'apprenant sur un projet commun). »

- **La demande** (« sous sa demande ») : dans son espace Partage, l'apprenant
  adulte crée un **code de demande** à usage unique (10 caractères A-Z2-9,
  30 jours, cinq en attente au plus) et le remet au cartographe de son choix
  — le modèle des invitations de cartographe. Il coche l'attestation de
  majorité pour cette demande (comme à chaque publication, D-31) ; il peut
  viser une de ses versions, à remplacer sous le même lien (question 15). Il
  voit ses demandes en attente et les annule en deux temps. **[choix
  d'implémentation]** Le code seul autorise la publication : aucun lien
  `cartographe_links` n'est exigé (l'interface n'a pas d'écran d'invitation,
  anomalie connue d'UC-APP-07), et le code est déjà la décision explicite de
  l'apprenant, pour un cartographe qu'il choisit.
- **La publication** : le cartographe ouvre la cartographie de la personne
  dans son interface (le jeu de données qu'il a relu avec elle), saisit le
  code dans l'espace Partage (« Publier pour une personne, avec votre
  garantie »), puis compose la version avec le **même compositeur** (choisir,
  relire, aperçu verrouillé) — rien ne change dans l'interface. À l'aperçu, la
  vue du destinataire montre déjà sa garantie ; à la place de la demande de
  copie et de l'attestation de l'apprenant, une case : « Je garantis cette
  version : j'atteste avoir vérifié ce que <nom> a fait, ce que l'analyse par
  IA a détecté et ce qu'en a vu le groupe classe qui travaille avec <nom> sur
  un projet commun. » La version arrive **dans le compte de l'apprenant**,
  privée, sans lien ; le cartographe ne reçoit pas son identifiant, n'y a
  plus accès, et rien n'est gardé dans son navigateur. Un compte peut être
  apprenant et cartographe : ouvrir une demande remplace, le temps de la
  publication, son propre compositeur.
- **Le serveur** (`api/src/routes/partage.php`, `Share\PublicationRequests`,
  migration 023) : rôle cartographe ; jamais la demande de son propre compte
  (on ne garantit pas sa propre cartographie) ; liste blanche de la version
  partagée (D-30) ; `garant: true` exigé ; l'attestation de **l'apprenant**
  relue sous verrou de sa ligne `users` (même ordre de verrous que le retrait
  de l'attestation) ; version créée (ou remplacée), garantie posée dans
  `cartography_garanties` (nom du cartographe figé, date), demande consommée
  — une seule transaction ; 30 essais de code par heure et par cartographe ;
  audit `shared_version_guaranteed`, ids seulement, jamais le code.
- **Ce qui est garanti est exactement ce qui a été vérifié** (cahier §8) :
  l'apprenant qui remplace lui-même une version garantie lui retire sa
  garantie (`PUT …/document`, audit `garantieRemoved`) — l'interface le dit
  avant (« la garantie de … sera retirée ») ; un cartographe qui supprime son
  compte retire sa garantie, la version reste à l'apprenant ; retirer
  l'attestation efface versions, garanties et demandes.
- **Ce que voit le destinataire** (`SharedView`) : « Relue et garantie par
  <nom>, le <date>, qui atteste avoir vérifié ce que la personne a fait, ce
  que l'analyse par IA a détecté et ce qu'en a vu le groupe classe qui
  travaille avec elle sur un projet commun. » Une version publiée par la
  personne elle-même le dit aussi : « Publiée par la personne elle-même :
  aucun cartographe ne l'a garantie. » **[choix d'implémentation]** La
  publication par l'apprenant lui-même reste possible (« rien ne change ») ;
  le destinataire sait laquelle il lit.
- **Côté apprenant** : chaque version de « Mes versions partagées » dit
  « Garantie par <nom>, le <date> : publiée à votre demande » ou « Publiée par
  vous, sans garantie de cartographe » ; l'aperçu et l'export JSON portent la
  garantie.
- Le module de relecture historique (annotations, révisions, garantie des
  cartographies du site, chapitre 5 du parcours cartographe) est inchangé ;
  sa garantie n'atteignait l'employeur que par l'ancien partage (question 17).
- Docs : matrice des autorisations, registre RGPD (§3 bis A), politique de
  confidentialité, chapitres de formation (apprenant 07, cartographe 07,
  employeur 06).

### D-43 — L'ancien partage est retiré **[décidé]**

Christian (2026-10-14), question 17 : « retire l'ancien partage » — le partage
par lien d'une cartographie du site, depuis « Mes cartographies »
(`#/espace`). Le partage passe désormais par la version partagée de
l'interface (D-30 à D-34), que l'apprenant publie lui-même ou que son
cartographe publie avec sa garantie (D-42).

- **Serveur** (`api/src/routes/share.php`) : `POST
  /api/cartographies/{id}/share` ne crée plus de lien que pour une version
  partagée ; tout autre type (journée, parcours, Twin9) → `422 {code:
  'share_retired'}`, rien n'est écrit ni audité. **[choix
  d'implémentation]** Les liens **déjà créés** restent servis (consultation
  publique, garantie d'une révision comprise), listés et révocables jusqu'à
  leur échéance — 90 jours par défaut : rien n'est révoqué d'office, la
  personne qui a donné un lien n'est pas désavouée. La maintenance les purge
  ensuite comme les autres. Les tests créent ces liens comme le faisait
  l'ancienne route (`AuthTestBase::legacyShareLink`).
- **« Mes cartographies »** : le bouton « Partager » disparaît.
  **« Partager depuis l'interface »** (toute cartographie, copie serveur ou
  non) remet la cartographie à l'interface, dans un **nouveau jeu qui porte
  son titre**, et ouvre l'espace Partage — rien ne quitte le navigateur
  (`lib/interface-handoff.js`, même mécanisme que les fichiers ouverts depuis
  l'accueil). Une analyse Twin9 passe d'abord par l'adaptateur du moteur
  (`twin9ToMergeDocument`, comme la visionneuse « Voir ») ; sans journée
  datée, un message, et rien ne part. **« Liens déjà créés »** (copie serveur
  seulement) ne crée plus rien : il annonce le retrait, liste les liens
  (dates, jamais le jeton), dit « expiré le » d'un lien échu — que le serveur
  ne sert plus — sans lui offrir « Révoquer », et révoque les autres ; il
  renvoie lui aussi vers l'interface. La visibilité « publique » ne crée
  toujours aucun lien : les deux anomalies d'UC-APP-05 (visibilité qui n'est
  pas une condition du partage, expiration en notation scientifique) tombent
  avec la création.
- **Relecture du cartographe** : sa garantie d'une révision n'atteignait
  l'employeur que par l'ancien partage. **[choix d'implémentation]** La page
  de relecture offre **« Ouvrir dans l'interface de cartographie »** : la
  cartographie, ou la révision consultée (jeu « … — révision N »), arrive dans
  son interface, à l'espace Partage, où il ouvre la demande de la personne et
  publie avec sa garantie (D-42). La correction voyage : une compétence
  renvoyée au cartographe est « à confirmer » dans la version publiée.
- **Navigation et aide** : « Partager ma cartographie » reste l'alias du
  tableau de bord ; sa précision devient « version choisie, réservée aux
  adultes ». Aide de l'espace apprenant, du cartographe et de l'employeur
  réécrite en conséquence.
- **Parcours e2e** : le parcours apprenant partage désormais par l'interface
  (attestation, version publiée, lien avec mot de passe, lu par l'employeur,
  mort après la suppression du compte) ; le parcours cartographe se termine
  par la version garantie publiée depuis la révision et lue par l'employeur.
  Les deux parcours étaient arrêtés à l'inscription depuis l'activation par
  code (D5, juillet) : ils activent leur compte jetable dans la base de
  développement, comme `carto-partage.e2e.js`, et la page du cartographe se
  recharge après l'attribution de son rôle.
- **Relecture indépendante** (agent distinct, avant le commit) : rien de
  bloquant ; API correcte (CSRF, rôle, propriété en 404 avant le refus en
  422, rien d'écrit ni d'audité). Corrigé à sa suite : l'encadré de
  signature du cartographe promettait encore « via le lien de partage » ; le
  retrait est testé pour les trois types (journée, parcours, Twin9) ; l'audit
  d'un lien protégé est vérifié (identifiants seuls) ; la phrase du retrait
  est aussi l'`error` de la réponse (un onglet resté sur l'ancien front
  l'affiche) ; « Révoquer » ne disparaît qu'un jour après l'échéance (heure du
  serveur sans fuseau) ; `aria-controls` ; un seul envoi par clic ; bouton de
  la relecture inactif sans document ; textes restants (aide, guides, README,
  offre employeur, registre). **[choix d'implémentation]** Après une
  publication garantie, le jeu ouvert chez le cartographe est une copie de la
  cartographie d'une autre personne : l'interface lui propose aussitôt de
  l'effacer (« Effacer « … » de ce navigateur », en deux temps) ; le registre
  RGPD (§3 bis A) et le chapitre 7 du parcours cartographe le disent.
- **À décider** (§4, questions 25 à 27) : les liens créés avant restent
  servis jusqu'à leur échéance — y compris ceux d'un compte qui n'a jamais
  attesté sa majorité (l'ancien partage ne l'exigeait pas) ; le libellé
  « Publique (partageable) » ; la formulation « lien + mot de passe » de
  `CLAUDE.md`.
- **À retirer plus tard** : les liens créés avant expirent au plus tard le
  2027-10-14 et sont purgés 30 jours après ; « Liens déjà créés », le
  dialogue et les tests `legacyShareLink` pourront alors partir.
- **Catalogue des cas d'utilisation** : UC-APP-05 (fiche, tests), UC-APP-04,
  UC-EMP-01, UC-CAR-05, UC-CPT-06, UC-VIS-04 mis à jour ; les totaux comptent de nouveau
  les seuls identifiants présents dans les tests — ceux d'UC-VIS-01 et
  d'UC-APP-12 n'avaient pas suivi le retrait des pages V3 (D-38) : 962 tests
  unitaires, 1 102 fonctionnels, 212 anomalies.
- Docs : matrice des autorisations, registre RGPD (§5), politique de
  confidentialité, chapitres de formation (apprenant 01 et 06, cartographe 01
  et 07, employeur 01 et 06, visiteur 04), `docs/tests-e2e.md`.

---

## 3. État des tests

### Installation (2026-10-13)

Dépôt cloné depuis GitHub, `npm ci` (moteur et front), données dérivées
régénérées (INSTALL.md §2), base MySQL locale migrée et référentiel exporté
(INSTALL.md §3, via Docker).

| Suite | Résultat | Remarque |
|---|---|---|
| Moteur (Vitest) | **1 069 verts**, 17 sautés (60 fichiers) | identique au dernier état documenté dans `STATUS.md` |
| Front (Vitest) | **1 937 verts** ; 2 fichiers non chargés | `referentiel-v710.test.js` exige l'export statique de la base (refait ensuite, voir plus bas) ; `twin6-prompt-package.test.js` exige les trois gabarits Twin6 non versionnés (anomalie connue UC-SYS-04 AN-2, décision en attente) |
| API (PHPUnit, Docker php:8.2 + MySQL 8) | **1 470 verts** (13 961 assertions) | 23 min 47 s ; identique à `STATUS.md` |
| Front, après export statique du référentiel | `referentiel-v710.test.js` chargé | seul `twin6-prompt-package.test.js` reste non chargeable ici (gabarits Twin6 non versionnés, décision en attente) |

### P0 — noyau `web/src/carto/core/`

| Fichier de test | Contenu | Tests |
|---|---|---|
| `formulas.test.js` | poids, α, borne 0,99, cumul saturant, angles (360° / 180°), anneaux de même capacité, aire = θ·k·C/2, épaisseur minimale, décote désactivée | 22 |
| `state.test.js` | **critères P0** (1 compétence = 360°, 2ᵉ → 180°, aire = θ·k·C/2, aire d'un pôle = Σ), état(S, t), cases décochées, statuts, court-circuit, hors référentiel, variantes à arbitrer, journée seule, « Pourquoi cette surface ? » | 16 |
| `highlight.test.js` | ancres début / fin, normalisation caractère pour caractère, jaune / orange, rétrécissement, occurrences multiples, index d'origine | 13 |
| `heatmap.test.js` | dates sans décalage, semaines ISO, année scolaire août–juillet, grille lundi premier, bandes empilées, clavier ±1/±7, volume / poids, quantiles ipsatifs, silence ≠ faible, teinte de famille | 15 |
| `ops.test.js` | cases, tri-états, cocher jusqu'à / depuis, étiquettes, ensembles nommés et figés, variantes, droit de réponse, repères, notes, normalisations, migration | 14 |
| `import.test.js` | journées Aurora v3, ZIP imbriqués, quarantaine, date proposée, compteurs, doublons, variantes, portfolio, AuroraCore, Merge v2, `cartographie-merge`, métriques, hors référentiel | 17 |
| `store.test.js` | IndexedDB (`fake-indexeddb`) et mémoire : transaction unique, annulation complète, chargement paresseux, suppression, export | 9 |
| `real-corpus.test.js` | 59 journées réelles : 0 bloquant, 3 traces sans extrait sur plus de 1 000, angles = 360°, heatmap | 5 |

Dépendance de développement ajoutée : `fake-indexeddb` (tests du magasin
IndexedDB réel, sans navigateur).

### P1 — interface `web/src/carto/ui/`

| Fichier de test | Contenu | Tests |
|---|---|---|
| `CartoApp.test.jsx` | accueil sans données ; ordre des secteurs ; **critère P1 : décocher change le soleil et la heatmap** ; Tout / Aucune / Maj+clic ; case tri-état d'un mois ; clic sur un jour = date t + liste filtrée ; **critère P1 : double-clic ouvre la modale du jour seul**, navigation précédent / suivant, « Retour » ; l'inspection ne déplace pas t ; une compétence allume ses journées, Échap désélectionne ; clavier de la heatmap ; « Pourquoi cette surface ? » (`w`) ; recherche sans accents ; secteur de 360° | 13 |

Suite complète du front après P1 (2026-10-13) : **2 066 verts** sur 211
fichiers ; seul `twin6-prompt-package.test.js` reste non chargeable (gabarits
Twin6 non versionnés, anomalie connue, sans rapport avec la cartographie).
Les tests existants qui ouvraient la V3 sur `#/cartographie` ouvrent
désormais `#/cartographie-v3` (D-2).

Vérification visuelle : parcours complet dans Chromium (Playwright) à
1 440 px et 390 px — accueil, démonstration, sélection, date t, modale —
sans erreur de console.

### P2 — lecteur surligné, détail, jury

| Fichier de test | Contenu | Tests |
|---|---|---|
| `core/passages.test.js` | ordre de recherche ; trouvé / partiel / retrouvé ailleurs (exact seulement) / introuvable / sans texte ; une ancre raccourcie ne déplace pas le lecteur ; synthèses évolutives visibles seulement pour leur ensemble source | 8 |
| `ui/highlight-dom.test.js` | séparateur de blocs ; extrait sur deux paragraphes = un `<mark>` par nœud texte, aucun autour d'un `<p>` ; segments blancs ignorés ; orange ; toutes les occurrences et occurrence courante ; marques Markdown retirées ; assainissement (ni script, ni image, ni `javascript:`) | 7 |
| `ui/P2.test.jsx` | **critère P2 : passage surligné dans le portfolio importé en cartographie fusionnée** (3 journées), trace suivante, retour à la compétence ; **idem depuis un `carto_merge.json`** ; décalage de date dit comme tel ; introuvable ; sans portfolio ; deux occurrences ; depuis la modale du jour (focus rendu) ; motif / prescription / Pédagogue / Greffier ; droit de réponse enregistré sans effet sur le soleil ; état inconnu ≠ « Contestée » ; rapport de pôle sans « territoires non visités » ; kairos ; synthèse évolutive masquée puis rappelée ; impression ; AuroraCore (six éclairages, président, délibération, pièces, surlignage dans la feuille du journal) | 15 |

Validation du lecteur sur les journaux réels (sur le Mac, compteurs
seulement, même chaîne que l'interface : Markdown rendu, assaini, recherche
dans le texte affiché) :

| Journal | traces | brut, jour même : complet / partiel / absent | lecteur : trouvé / partiel / retrouvé ailleurs / non retrouvé |
|---|---|---|---|
| 200 | 302 | 180 / 53 / 69 | 181 / 51 / 5 / 65 |
| 300 | 180 | 120 / 35 / 25 | 121 / 33 / 5 / 21 |
| GEN1 | 10 | 9 / 1 / 0 | 9 / 1 / 0 / 0 |

Les « non retrouvés » ne sont presque jamais dans le portfolio, même en
ignorant la ponctuation (63 sur 65 pour le journal 200, 21 sur 21 pour le
300) ; 10 et 3 figurent tels quels dans les pièces du Greffier ; pour la
plupart, la moitié à trois quarts seulement de leurs mots se retrouvent dans
la feuille du jour : l'extrait a été **reformulé** par l'analyse (défaut
d'AuroraCore prévu au §8.1). Le lecteur le dit et cite l'extrait. Piste (point
ouvert 9) : un surlignage « approché », clairement signalé, pour les extraits
dont au moins 75 % des mots figurent dans la feuille (18 traces sur ces deux
journaux, estimait-on alors). → Fait le 2026-10-14 (D-39) : 10 traces
approchées (4 et 6) ; les autres restent sous 75 % une fois les mots-outils
écartés.

Suite complète du front après P2 : **2 096 verts** sur 214 fichiers (seul
`twin6-prompt-package.test.js` reste non chargeable, anomalie connue).
Vérification visuelle dans Chromium (1 440 px et 390 px) : lecteur, trace
suivante, détail, jury, sans erreur de console.

### P3 — comparaison de soi à soi

| Fichier de test | Contenu | Tests |
|---|---|---|
| `core/compare.test.js` | communes / seulement A / B ; parts à somme 1 ; **tailles différentes → avertissement** ; recouvrement ; tableau (intensité, confiance, n, moyenne / min / max / σ, Δ, pas de Δ relatif sans base) ; pôles, concentration, échelle du radar ; statistiques ; journées par pôle ; deux analyses du même portfolio ; préréglages (dont indisponibles et journées décochées) ; **récit sans valence** | 12 |
| `ui/P3.test.jsx` | avertissements de taille et de recouvrement ; huit vues au clavier, **aucune ne contient de rang ni de mot de verdict** ; deux périodes de même taille ; communes / seulement A / B ; préréglage indisponible ; note enregistrée | 5 |

Suite complète du front après P3 : **2 113 verts** sur 216 fichiers (seul
`twin6-prompt-package.test.js` reste non chargeable, anomalie connue).
Vérification visuelle dans Chromium sur la démonstration (59 journées) :
les huit vues à 1 440 px, la page à 390 px sans défilement horizontal.

### P4 — tableau de bord

| Fichier de test | Contenu | Tests |
|---|---|---|
| `core/stylometry.test.js` | découpage en mots et en phrases ; 19 mesures sur un texte connu ; texte vide = null ; TTR glissant ; distance lexicale | 8 |
| `core/dashboard.test.js` | données de chaque carte (profil, rythme, constance, moments et sensibilité, style normalisé par ligne, miroir HumanoTwin, rupture lexicale, anomalies) ; **critère P4 : chaque carte sans données vaut null** | 13 |
| `ui/P4.test.jsx` | **critère P4 dans l'interface** (portfolio court, sans portfolio, portfolio long + miroir) avec la raison de chaque carte absente ; masquer / rappeler une carte ; sensibilité des moments et ouverture dans le portfolio ; repère ajouté, vu sur le rythme, retiré en deux temps ; graphique au clavier | 7 |

Suite complète du front après P4 : **2 140 verts** sur 2 141 ; l'unique échec,
`UC-ADM-04-U15` (formulaire des réglages de la démo, sans lien avec la
cartographie), est **instable sous charge** : il passe seul (3 fois sur 3).
`twin6-prompt-package.test.js` reste non chargeable (anomalie connue).
Vérification visuelle dans Chromium : tableau de bord sur la démonstration (59
journées : l'axe temporel réel montre le silence de janvier–février) et sur
un jeu synthétique avec portfolio long et miroir, à 1 440 px et 390 px.


### P5 — exports et démo anonymisée

| Fichier de test | Contenu | Tests |
|---|---|---|
| `core/archive.test.js` | export → réimport dans un jeu vide : journées, variantes, détails, délibérations, état de l'apprenant identiques ; réimport de la même archive = tout en doublon ; sans portfolio (volumes gardés) ; nom de fichier ; master V3 converti = import direct, réponse reprise ; journée V3 sans variante choisie reste à arbitrer | 6 |
| `core/anonymize.test.js` | propositions (élisions, noms composés, « J’ai » exclu) ; noms en mot entier, en une passe, sans tenir compte de la casse, des apostrophes ni des blancs ; repères neutres et identifiants protégés ; courriels, liens (ponctuation Markdown gardée), téléphones, adresses ; **plus aucun nom, mêmes substitutions dans le portfolio, les extraits et les ancres, chaque passage encore retrouvé** ; ancres coupées dans un mot ou d'une autre casse réalignées ; tiers signalés et retirés partout ; table de correspondance jamais exportée ; identifiants jamais touchés par les motifs ; référentiel intact ; mots à majuscule restants ; comptage des motifs ; statuts calculés comme le lecteur | 14 |
| `ui/anonymize-render.test.js` | remplacer puis afficher le Markdown = afficher puis remplacer (liens, liens entre chevrons, échappés, courriels, emphase, listes) | 1 |
| `core/highlight.test.js` (ajout) | un émoji avant le passage ne décale plus le surlignage | +1 |
| `core/report.test.js` | données des pages 1 et 2 ; ensemble nommé ; jeu vide ; jury : dernière journée ou toutes, extraits de ces journées, journées à charger | 4 |
| `viewer/embedded.test.js` | l'archive insérée se relit à l'identique (avec `</script>`, `$&`, U+2028) ; modèle invalide ; magasin en mémoire ; le modèle construit n'a qu'un emplacement de données et aucun module | 4 |
| `ui/P5.test.jsx` | archive téléchargée et réimportée, sans portfolio sur demande ; copie HTML avec et sans portfolio, avertissement, modèle absent ; aperçu du rapport (pseudonyme, soleil, profil, précautions, réflexions choisies dépliées avec extraits, réponses seulement sur demande, impression, fermeture et focus rendu) ; page de comparaison ; **démo : propositions, dictionnaire, tiers, aperçu, vérification du surlignage, relecture, téléchargement sans aucun nom** ; réglage changé = aperçu périmé ; retrait d'un passage de tiers et ouverture de la démo dans le navigateur ; copie autonome en lecture seule | 9 |
| `e2e/carto-export.e2e.js` (Playwright, Chromium) | **critères P5 dans un vrai navigateur** : import des fichiers de Lou, copie autonome téléchargée (portfolio inclus) puis ouverte en `file://`, **tout le réseau coupé** → le passage d'une trace est surligné ; démo anonymisée (Sam → Personne A) téléchargée et ouverte de même → le passage est surligné sous son nouveau nom, les vrais noms n'y sont plus ; aucune erreur de console | 1 |

Vérification visuelle dans Chromium : espace Export et outil de démo à
1 440 px et 390 px ; rapport imprimé en PDF (A4) sur la démonstration de 59
journées : 11 pages (couverture et soleil, profil, réflexions de deux
compétences, comparaison A/B), sans page blanche après la correction de D-27.

Suite complète du front après P5 et ses corrections : **2 179 verts** sur
2 180 (225 fichiers) ; l'unique échec, `UC-ADM-04-U15` (formulaire des
réglages de la démo, sans lien avec la cartographie), reste instable : il
attend un message une seconde au plus après un clic et passe seul 6 fois
sur 7 ; `twin6-prompt-package.test.js` reste non chargeable (anomalie
connue). Moteur : **1 069 verts**, 17 sautés — le test
`UC-SYS-04-U06`, qui fige la commande `prebuild` du front, suit l'ajout de la
construction du modèle de copie autonome (fiche UC-SYS-04 mise à jour).
Bout en bout : `npx playwright test e2e/carto-export.e2e.js` vert (Chromium,
dev-server Vite seul, sans API).

### P6 — copie serveur et lien de partage (adultes)

État à la livraison de P6 ; les corrections de la vérification indépendante
(D-37) et leurs tests sont décrits plus bas.

| Fichier de test | Contenu | Tests |
|---|---|---|
| `core/share.test.js` | liste positive (angles recalculés sur les seules compétences retenues, 360° sans trou, compétence retirée absente partout, référentiel réduit) ; journées comptées ; version vide ou sans titre refusée ; précision au mois et masquée (période, heatmap, dates d'extraits) ; candidats extraits ; extraits relus (Markdown, blancs, courriel et téléphone masqués, nom remplacé, borne de 2 000 caractères, doublons, compétence retirée) ; **même forme que la fixture partagée acceptée par le serveur** ; aucun champ privé ; lecture par le destinataire (même soleil) ; configuration `serverEnabled` / `adultOnly` ; lien absolu ; propositions de relecture | 15 |
| `ui/P6.test.jsx` | **critère P6** : visiteur sans compte, module désactivé, copie autonome → pas d'espace Partage, aucun appel ; compte sans attestation → seule l'attestation, ni choix, ni publication, ni lien, aucun appel ; exigence du serveur même si le client ne l'impose pas ; attestation puis retrait (liens révoqués, fonction refermée) ; composer (cases à trois états, « Retirer de cette version partagée », jamais « Supprimer »), relire, aperçu verrouillé, consentement, publication sans portfolio ni date au jour ; extraits choisis, nom de tiers remplacé, extrait retiré ; gestion (lien sans mot de passe montré une fois, journal des accès, révocation, mot de passe trop court refusé, retrait de la version) | 8 |
| `views/ShareView.test.jsx` (ajouts) | lien ouvert : lecture dès l'ouverture, vue employeur (soleil, extraits), sans formulaire ni comparaison ni réponse, référentiel embarqué ; lien ouvert qui exige un mot de passe ; lien révoqué ; balise `robots` le temps de l'affichage | +4 |
| `router.test.js` (ajout) | `#/partage/<jeton>`, `#/partage/<jeton>/ouvert`, `#/cartographie/partage` | +1 |
| `api/tests/CartoPartageTest.php` (PHPUnit) | **critère P6 côté serveur** : sans attestation, rien n'est stocké ni partagé (403 `adult_required`) ; attestation datée, conservée, journalisée une fois ; visiteur 401 ; **liste blanche** (portfolio, traces du jury, référentiel augmenté, compétence inconnue, liste vide, extrait trop long ou d'une compétence retirée ou daté trop finement, journée trop fine, période avec dates masquées, heatmap de mauvaise précision, mauvais `kind`, version inconnue, visibilité publique) ; lien sans mot de passe (`/ouvert`, `GET` 200, en-têtes `noindex` et `no-store`, audit) ; lien protégé (`GET` 401, `POST` 403 puis 200) ; autres types : mot de passe toujours obligatoire ; journal des accès réservé à l'auteur, contrat de la liste des liens inchangé ; retrait de l'attestation : liens révoqués, fonction refermée, export et effacement possibles ; instantané figé ; **fixture partagée acceptée** ; quota par IP commun au `GET` et au `POST` | 10 |
| `e2e/carto-partage.e2e.js` (Playwright, Chromium, **API docker locale**) | compte apprenant réel sans attestation : seule l'attestation à l'écran, et un `POST` direct est refusé (403), rien en base ; attestation, composition, nom de tiers remplacé, aperçu, publication (en base : la version, sans « Sam » ni texte du portfolio ni compétence retirée), lien sans mot de passe ; un navigateur anonyme l'ouvre (vue employeur, `noindex` dans la page et dans l'en-tête) ; l'auteur voit « Consulté 1 fois » ; retrait de l'attestation → le lien répond « n'existe pas, a expiré ou a été révoqué » ; compte de test effacé | 1 |

Vérification visuelle dans Chromium (API simulée) : attestation, choix,
relecture, aperçu verrouillé, gestion à 1 440 px ; choix à 390 px (pas de
défilement horizontal) ; vue du destinataire à 1 440 et 390 px.

Suites complètes après P6 : front **2 208 verts** sur 2 208 (227 fichiers ;
`twin6-prompt-package.test.js` toujours non chargeable, anomalie connue) ;
API **1 479 verts** (14 090 assertions, 23 min 30 s), puis les 108 tests du
partage et des cartographies rejoués après les derniers changements (dont le
test de la fixture partagée) : verts. La base de développement locale a reçu
la migration 022 (`POST /api/admin/migrate`).

### P7 — dialogue d'accompagnement scripté

État à la livraison de P7 ; voir aussi la vérification indépendante (D-37),
plus bas.

| Fichier de test | Contenu | Tests |
|---|---|---|
| `core/dialogue.test.js` | ordre fixe des fils, présents seulement si leurs données existent ; citation (preuve la plus sûre, la plus récente à confiance égale, sans Markdown ; absente sans détail chargé ; bornée) ; silence relatif au rythme de la personne ; apparition, constance, renvoi ; changement de vocabulaire ; écart seulement s'il y a une comparaison ; **aucune valence, toujours une question** ; jeu d'une journée : aucun fil inventé ; relance : **seulement la question, la réponse et le passage**, consigne système ; relance affichée en texte simple ; carnet (bornes, retrait, Markdown) | 12 |
| `ui/P7.test.jsx` | **critère P7** : dialogue complet (répondre, passer, garder, relire, retirer du carnet) **sans aucune requête** ni fournisseur créé ; s'arrêter, recommencer ; option de relance : accord décoché par défaut, pas de bouton sans accord, l'accord seul n'envoie rien, la relance n'emporte que la question, la réponse et le passage ; changer de modèle retire l'accord ; sans clé, pas d'accord possible ; copie autonome : ni relance ni carnet enregistré | 4 |
| `core/archive.test.js` (ajouts) | le carnet fait l'aller-retour de l'archive sans perte ni doublon ; exclu de l'archive sans portfolio | (dans les 6) |
| `core/anonymize.test.js` (ajout) | le carnet n'entre jamais dans une démo | +1 |
| `router.test.js` (ajout) | `#/cartographie/dialogue` | (dans le test du partage) |
| `e2e/carto-dialogue.e2e.js` (Playwright, Chromium) | **dans un vrai navigateur, toutes les requêtes enregistrées** : dialogue complet et carnet → **aucune requête** ; option ouverte sans accord → aucune ; accord pour Ollama (simulé) → une relance demandée = **une** requête vers `localhost:11434`, qui ne contient que la question, la réponse et le passage (ni le reste du journal, ni la réponse précédente, ni la cartographie) | 1 |

Vérification visuelle dans Chromium : dialogue, carnet et option de
relance à 1 440 px et 390 px (pas de défilement horizontal, aucune requête
enregistrée pendant le dialogue).

Suites complètes après P7 : front **2 225 verts** sur 2 225 (229 fichiers ;
`twin6-prompt-package.test.js` toujours non chargeable, anomalie connue) ;
moteur **1 069 verts**, 17 sautés ; les trois scénarios e2e de la
cartographie (P5, P6, P7) verts. API inchangée depuis P6. Le modèle de la
copie autonome passe de 620 à 711 Ko (les espaces Partage et Dialogue y sont
compilés, inactifs ou sans relance dans une copie).

### Vérification indépendante (P6, P7) — D-37

| Fichier de test | Ajouts et renforts | Tests |
|---|---|---|
| `api/tests/CartoPartageTest.php` | **liste blanche des types** (booléen qui porte du texte, nombre en chaîne, couleur `url()`, compétence inconnue, d'un autre pôle ou absente, code inconnu dans un pôle, référentiel augmenté d'un champ ou d'une compétence, extrait trop long, d'une compétence retirée ou daté trop finement, mois 13, période inversée, angle hors bornes, mauvaise précision de heatmap, date de publication libre, mauvais `kind`, version 2.0.0) ; `runMeta` refusé ; titre = celui du document, `PATCH` du titre refusé ; module de relecture fermé (annotations et révisions 404, garantie 403) ; mot de passe numérique refusé sans créer de lien ; `GET /api/share/open` par en-tête, l'ancienne adresse ne sert plus rien ; **retrait de l'attestation = versions et liens effacés** (compteur, audit, lien 404, publication 403, partage historique intact) | 11 (+1) |
| `core/share.test.js` | **la fixture partagée est la sortie exacte de `buildSharedVersion`** ; masques et remplacements dans le titre ; jamais de coupe au milieu d'un émoji | 17 (+2) |
| `ui/P6.test.jsx` | retrait : versions effacées, message affiché ; case d'attestation à chaque publication ; nom du titre proposé et remplacé, relecture annulée si le titre change | 9 (+1) |
| `views/ShareView.test.jsx` | jeton dans l'en-tête, jamais dans l'URL ; version illisible signalée sans plantage | 12 (+1) |
| `core/dialogue.test.js` | carnet réimporté nettoyé (entrée illisible écartée) | 13 (+1) |
| `ui/P7.test.jsx` | relance revenue après « Recommencer » écartée ; appel bloqué dit comme tel, sans relance inventée | 6 (+2) |
| `ui/P5.test.jsx` | copie HTML « avec portfolio » : jamais le carnet | 9 |
| `e2e/carto-partage.e2e.js` | case d'attestation à la publication ; jeton absent des URL de l'API ; retrait confirmé en deux temps → message, plus aucune ligne en base, lien 404 | 1 |

Suites complètes après la vérification (2026-10-14) : front **2 231 verts**
sur 2 232 (229 fichiers ; 285 pour la cartographie) — l'unique échec,
`UC-ADM-05-F01` (supervision Twin9 par l'administrateur, sans lien avec la
cartographie), attend un message une seconde au plus et cède sous la charge
(l'API tournait en même temps) : il passe seul 3 fois sur 3 ;
`twin6-prompt-package.test.js` toujours non chargeable (anomalie connue).
API **1 481 verts** (14 132 assertions, 23 min 20 s). Moteur inchangé
(1 069 verts, 17 sautés). Les trois scénarios e2e de la cartographie (P5, P6
contre l'API locale, P7) verts.

### Décisions du 2026-10-14 (réponses de Christian, §4)

| Décision | Fichier de test | Contenu | Tests |
|---|---|---|---|
| Angle = points (Q3, D-8) | `core/formulas.test.js` | une preuve = 1 point, un indice = ½ ; **rien ne plafonne** (cent preuves = cent points) ; plus de traces, plus de points ; largeur minimale dessinée : seul le secteur trop étroit est élargi, pris aux autres au prorata, somme inchangée, en cascade si besoin, angles exacts sans minimum | 25 |
| | `core/state.test.js` | **la confiance du jury n'entre pas dans l'angle** (mêmes traces, confiances différentes → même angle, hauteurs différentes) ; trois preuves contre une → 270° et 90° ; confiance inconnue : l'angle compte la trace, la hauteur l'ignore ; secteur trop étroit élargi, θ exact | 20 |
| | `core/real-corpus.test.js` | D-8 sur la démonstration : le plus grand secteur dépasse trois fois la médiane, θ / 360° = P / ΣP, secteurs élargis signalés | 6 |
| | `compare.test.js`, `heatmap.test.js`, `CartoApp.test.jsx`, fixture partagée | suivent la nouvelle formule (fixture régénérée) | — |
| Clé personnelle (Q22, D-36) | `lib/csp-providers.test.js` | le `connect-src` de `web/public/.htaccess` = `'self'` + exactement les fournisseurs du moteur, ni plus ni moins | 3 |
| | `e2e/csp-cle-personnelle.e2e.js` (Chromium) | **sous la CSP de production** : relance avec clé personnelle → une requête vers Anthropic (simulé), clé dans l'en-tête seulement ; un autre hôte bloqué (violation signalée) ; le test échoue avec l'ancienne CSP | 1 |
| Pages V3 (D-38) | `App.test.jsx`, `router.test.js`, `views/HomeView.test.jsx` (nouveau, 4), `DayView.test.jsx`, fiches UC-VIS-01, UC-VIS-04, UC-APP-03, UC-ETA-04, aide | `#/merge` et `#/cartographie-v3` → `#/cartographie` (entrée d'historique remplacée) ; l'accueil lit les fichiers dans le navigateur et les remet à l'interface, importés une fois, dans un nouveau jeu ; retours vers `#/cartographie` ; tests de la V3 retirés avec elle | — |
| Version partagée (Q15, D-33) | `api/tests/CartoPartageTest.php` | `PUT …/document` : même lien, consultations conservées, audit `shared_version_replaced` ; 404 (inconnue, autre compte), 422 (autre type), 403 sans attestation ; même liste blanche qu'à la création | 12 (+1) |
| | `ui/P6.test.jsx` | par défaut, à la place de la plus récente ; version distincte au choix | 10 (+1) |
| | `e2e/carto-partage.e2e.js` | republier à la place : même lien, le visiteur voit le nouveau titre | (dans le 1) |
| Surlignage approché (Q9, D-39) | `core/highlight.test.js` | 75 % des mots pleins : la phrase, de son premier à son dernier mot de l'extrait ; extrait qui résume plusieurs phrases ; sous 75 %, rien ; extrait trop court jamais approché, mots-outils exclus ; une phrase qui ne répète qu'un mot n'apporte rien ; index d'origine après un émoji | 20 (+6) |
| | `core/passages.test.js` | approché seulement dans sa journée ; un bout retrouvé tel quel l'emporte ; jamais dans une autre journée | 11 (+3) |
| | `ui/P2.test.jsx` | extrait reformulé : cadre pointillé, « approché … à vérifier », jamais « retrouvé » | 16 (+1) |

| Carnet → portfolio (Q20, D-40) | `core/portfolio-md.test.js` (nouveau) | verser, retirer : un drapeau, rien de recopié ; dialogue en Markdown (questions répondues seulement, passage daté et attribué, relance attribuée au modèle, aucune ligne qui ouvre une journée) ; **portfolio exporté puis redécoupé = mêmes journées**, dialogue dans la sienne ; dialogue non versé absent, retiré : sorti ; réponse avec une date seule sur sa ligne ou un séparateur : la journée tient ; feuilles séparées (séparateurs en traits espacés, date d'un autre jour neutralisée, en-tête jamais doublé) ; journée sans en-tête, titre du document, passage sans date ; rien à exporter | 8 |
| | `core/archive.test.js` | le versement fait l'aller-retour ; « versed » n'emporte que les dialogues versés | 7 (+1) |
| | `core/dialogue.test.js` | versement illisible écarté à la réimportation | 13 |
| | `ui/P5.test.jsx` | copie autonome : du carnet, les seuls dialogues versés, et avec le portfolio seulement ; portfolio en Markdown téléchargé (texte, dialogue versé, pas le dialogue gardé) ; rien à exporter : bouton désactivé | 10 (+1) |
| | `ui/P7.test.jsx` | verser puis retirer, dans le carnet : messages, mention, enregistrement, aucune requête ; copie autonome : les dialogues versés se lisent, rien à verser ni retirer | 8 (+2) |
| | `e2e/carto-dialogue.e2e.js` | dans Chromium : verser le dialogue gardé, télécharger le portfolio (.md) — le texte et le dialogue y sont, aucune requête réseau | (dans le 1) |
| Archive de compte 1.1.0 (Q10, D-25) | `core/master-schema.test.js` (nouveau) | fixture = sortie exacte de l'interface, conforme ; archive sans portfolio ; champ inconnu et version 4.x ultérieure acceptés, master 3.x refusé ; douze refus localisés (date, choix de variante, statut, confiance, compteur, rôle, clé de détail, réponse, carnet, référentiel, journées) ; **les 59 journées publiques conformes** | 5 |
| | `lib/archive.test.js` | export : un master complet par jeu, démonstration exceptée, archive conforme, jeu non conforme localisé ; archive 1.0.0 importée sans jeux ; import : jeu retrouvé à l'identique, réimport sans effet, jeu complété compté ; stockage illisible : export abouti et signalé, reste importé | 16 (+4) |
| | `ui/CartoApp.test.jsx` | la démonstration chargée est marquée `origin: "demo"` | 14 (+1) |
| | UC-APP-06 (fonctionnels) | **F17** : dans l'application entière, IndexedDB factice — jeux dans l'archive (démonstration exceptée), conforme, portfolio, réponses et carnet compris ; navigateur neuf : jeu restauré à l'identique ; réimport : rien. Faux IndexedDB étendu (transactions sur plusieurs magasins, fin de transaction, plage de clés) | 16 (+1) |
| | moteur : UC-APP-06 U17, U18 ; `validation.test.js` ; UC-SYS-04 F06, F07 | master conforme et embarqué ; jeu non conforme localisé dans l'archive ; six schémas ; **fraîcheur des validateurs** ; `validate-corpus` avec la fixture du master | +2, et 3 renforcés |
| | API : `ValidationTest.php` | le validateur PHP (opis) accepte la fixture du master et l'archive qui l'embarque, refuse un rôle inconnu à son emplacement | +2 |

Validation du surlignage approché sur les journaux réels : D-39.

### Relecture indépendante des décisions du 2026-10-14 (D-41)

| # | Fichier de test | Contenu | Tests |
|---|---|---|---|
| 1, 7 | `core/archive.test.js` | archive réimportée dans le jeu modifié depuis : son texte et ses passages sans date gagnent, rien n'est doublé (rapport « conservé ») ; état illisible (réponse d'un état inconnu, repère sans date, ensemble sans définition) écarté et compté, jamais recopié | 9 (+2) |
| 2, 7 | `lib/archive.test.js` | démonstration intacte laissée de côté ; la même, avec un dialogue de la personne, exportée ; un jeu non conforme écarté et nommé, l'archive part conforme avec les autres | 17 (+1) |
| 7 | UC-APP-06 **U19** | message de « Mes données » : stockage illisible (ce qui manque, quoi faire), jeu non conforme nommé ; l'archive est téléchargée | +1 |
| 2 | `ui/CartoApp.test.jsx` | la démonstration, chargée par l'interface, est intacte ; après l'import du portfolio de la personne, elle ne l'est plus | renforcé |
| 3 | `ui/P4.test.jsx` | Constance : le trait suit les points cumulés (il ne plafonne plus à 1) ; le test échoue avec l'ancienne échelle | 8 (+1) |
| 4 | `core/portfolio-md.test.js` | exporté, réimporté, exporté de nouveau : un seul bloc de dialogue | 9 (+1) |
| 5, 8 | `ui/P6.test.jsx` | une version publiée depuis un autre jeu n'est jamais la cible par défaut (« comme une version distincte ») ; le brouillon d'une version qui n'est plus sur le serveur est effacé | 11 (+1) |
| 8 | `ui/shareDrafts.test.js` (nouveau) | un brouillon par version publiée depuis un jeu ; versions disparues, jeu supprimé ; compte supprimé : tous les brouillons, rien d'autre | 2 |
| 8 | `ui/CartoApp.test.jsx` | supprimer un jeu efface les brouillons de ses versions, pas ceux d'un autre jeu | +1 |
| 8 | UC-CPT-06 **F12** | compte supprimé : brouillons effacés (pas après un refus), clés gardées | +1 |
| 6 | `core/highlight.test.js` | limites de bloc : chaque élément d'une liste est une phrase ; une phrase démesurée n'est jamais retenue | 21 (+1) |
| 6 | `ui/highlight-dom.test.js` | dans le texte affiché (Markdown rendu) : une liste sans ponctuation, un élément par phrase, jamais toute la liste | 8 (+1) |
| 9 | `core/formulas.test.js`, `core/state.test.js` | épaisseur affichée : confiance nulle ou inconnue → épaisseur minimale signalée ; le pôle d'une compétence élargie est marqué | renforcés |
| 9 | `ui/CartoApp.test.jsx` | « Pourquoi cette surface ? » : la note dit « confiance inconnue » ou « confiance si faible » ; un pôle dit qu'une de ses compétences est élargie, un autre non | +2 |

### Version garantie (Q17, D-42)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `api/tests/CartoGarantieTest.php` (nouveau) | **nominal** : code créé (forme, liste, audit sans code), ouvert par le cartographe (nom de la personne, son nom de garant), publication dans le compte de l'apprenant — privée, sans lien, garantie figée, demande consommée, audit d'ids ; le cartographe n'a ensuite ni lecture ni lien ; le destinataire lit la garantie ; un code ne sert qu'une fois — **refus** : sans attestation, sans la case de la demande, version d'un autre ou d'un autre type, rôle, CSRF, plus de cinq demandes ; rôle cartographe exigé, jamais sa propre demande, code inconnu, mal formé ou expiré ; garantie non confirmée, version hors liste blanche, CSRF, attestation de l'apprenant retirée entre-temps : rien n'est écrit — **à la place de** : même lien, garantie du cartographe ; remplacée par l'apprenant : garantie retirée (audit) ; demande effacée avec la version visée — annulation, retrait de l'attestation, départ du cartographe (sa garantie part, la version reste) et de l'apprenant ; quota de codes | 8 |
| `api/tests/RgpdAuditTest.php`, `scripts/rgpd-audit.php` | `carto_publication_requests.apprenant_id` : CASCADE ; couverture d'export « — » | renforcés |
| `ui/Garantie.test.jsx` (nouveau) | l'apprenant crée un code (attestation de la demande), l'annule en deux temps ; demande « pour remplacer » une version ; compte cartographe seul : l'espace Partage s'offre, sans attestation de sa part, code faux ou inconnu refusé ; **le cartographe ouvre la demande, compose avec le même compositeur, voit sa garantie dans l'aperçu, coche sa garantie et publie** (ni demande de copie ni attestation de l'apprenant, aucun brouillon gardé) ; compte apprenant et cartographe ; l'apprenant voit la garantie et est prévenu qu'il la retire en remplaçant lui-même la version ; le destinataire lit qui garantit et ce que couvre la garantie, ou « publiée par la personne elle-même » ; code recopié | 8 |
| `ui/P6.test.jsx` | faux serveur partagé (`test/fake-share-api.js`) ; les onze scénarios inchangés | 11 |
| `e2e/carto-partage.e2e.js` | **deux comptes réels contre l'API locale** : Lou crée un code ; Carl (cartographe) importe la cartographie de Lou, ouvre la demande, compose, voit sa garantie dans l'aperçu, publie ; en base : version privée de Lou, garantie de Carl, demande consommée, rien dans le compte de Carl ; Lou crée le lien ; l'employeur lit « Relue et garantie par Carl E2E, le …, qui atteste avoir vérifié … » | +1 |

### Retrait de l'ancien partage (Q17, D-43)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `api/tests/ShareTest.php`, `CartoPartageTest.php`, `CartographiesTest.php`, `CartographiesPurgeTest.php`, `CartographeGarantieTest.php` et les cas d'utilisation UC-APP-03/04/05, UC-CAR-04/05, UC-CPT-06, UC-EMP-01, UC-ADM-06 | `422 share_retired` pour une journée, un parcours, une analyse Twin9 (rien d'écrit ni d'audité) ; les liens créés avant (helper `legacyShareLink`) restent servis, listés, révocables, purgés avec le compte, comptés par le suivi | 194 réécrits ou gardés ; UC-APP-05 F02, F06, F07 retirés |
| `web/test/usecases/unit/uc-app-05-…` | dialogue isolé : retrait annoncé, aucun formulaire ; renvoi vers l'interface ; lien échu « expiré le » sans « Révoquer » ; panneau : « Liens déjà créés » et « Partager depuis l'interface » ; remise d'une journée (fichier, titre du jeu), d'une analyse Twin9 adaptée, refus sans journée datée | 8 (4 ajoutés, 2 réécrits ; 8 retirés) |
| `web/test/usecases/functional/uc-app-05-…` | **application complète** : « Partager depuis l'interface » → `#/cartographie/partage`, nouveau jeu au titre de la cartographie, attestation d'abord, aucune requête de partage ; le dialogue des liens mène au même endroit ; gestion des liens créés avant (révocation, 401, 404, échec, lien échu) | 8 (2 ajoutés, 6 réécrits ; 7 retirés) |
| `src/views/espace/CartographiesPanel.test.jsx` | bloc « ancien partage retiré » | 5 (3 de création remplacés) |
| `src/views/cartographe/RelectureSection.test.jsx` | « Ouvrir dans l'interface de cartographie » : l'origine, puis la révision consultée (motif corrigé), avec leur titre ; absent sans rappel | +2 |
| UC-APP-04 F, UC-VIS-04 U et F, aide | « Liens déjà créés » ; précision « version choisie, réservée aux adultes » | réécrits |
| `e2e/parcours-apprenant.e2e.js` | inscription D5 ; « Partager depuis l'interface », attestation, version publiée, lien avec mot de passe ; l'employeur (contexte neuf) : mauvais mot de passe refusé, version lue, « publiée par la personne elle-même » ; archive avec le jeu de l'interface ; compte supprimé : lien mort | réécrit |
| `e2e/parcours-cartographe.e2e.js` | ancien partage refusé (IHM et `422`) ; code de demande ; révision garantie ouverte dans l'interface, demande ouverte, version publiée avec la garantie ; lien avec mot de passe ; l'employeur lit « Relue et garantie par Cartographe E2E » et la compétence corrigée « à confirmer » | réécrit |
| `ui/Garantie.test.jsx` | après la publication garantie, le cartographe efface en deux temps la copie de la cartographie de la personne ; l'interface revient à l'accueil | renforcé |
| UC-CAR-05 (fonctionnels, IHM) | l'encadré de signature ne promet plus le lien de partage : « … sera figée et signée. Pour qu'un employeur voie votre garantie, publiez la version partagée… » | 2 réécrits |
| `api/tests/CartoPartageTest.php` | lien protégé d'une version partagée : audit `{cartographieId, shareId, expiresInDays, withPassword: true}`, ni jeton ni mot de passe | renforcé |

---

## 4. Questions à Christian et ses réponses

Réponses reçues le 2026-10-14. « Suite » dit ce qui en découle ici.

1. (§15, point ouvert 1) α, le poids d'un indice : 0,5 par défaut, réglable.
   → **Validé.** Précisé le même jour : la confiance du jury n'entre pas dans
   l'angle ; une preuve vaut 1 point, un indice α (D-8).
2. Données personnelles jamais versionnées (dépôt public) ; tests sur des
   données synthétiques ou le corpus public. → **Validé.**
3. Saturation des angles (D-8). → **Décidé** : l'angle représente le nombre
   de points, la hauteur la confiance moyenne du jury. Suite : fait (D-8).
4. Lecture des formules (D-6). → **Validé.**
5. « Territoires non visités » et « émergences » masqués (D-16). → **Validé** :
   on ne parle pas des compétences sans trace.
6. Note privée du droit de réponse non imprimée (D-15). → Expliquée (c'est
   l'apprenant qui l'écrit) ; **validé** : non imprimée, pour ne pas aller
   chez un employeur.
7. Routes sous `#/cartographie` (D-2). → **Validé.**
8. Démonstration sans portfolio (D-11). → **Validé.**
9. Surlignage approché des extraits reformulés (validation de P2). →
   **Décidé** : à ajouter, signalé comme tel. Suite : fait (D-39).
10. Archive (D-25). → **Décidé** : « Exporter toutes mes données » du site
    sauvegarde aussi la cartographie de l'interface ; schéma JSON du master
    v4 dans `schemas/`. Suite : fait (D-25).
11. Démo anonymisée du site (D-28). → **Décidé** : par FTP sur le site, jamais
    dans GitHub, lors d'un déploiement autorisé par Christian (identifiants
    FTP sur son Mac, non lus ici).
12. Rapport imprimable d'AuroraCore sans les délibérations complètes (D-27).
    → **Validé** (elles restent lisibles à l'écran).
13. Règle d'impression de la facture Twin9 limitée à sa page (D-27). →
    **Validé.**
14. Sauvegarde serveur de toute la cartographie (D-30). → **Non** : ce sont
    des données privées ; seul ce qui est désigné « à partager » va sur le
    serveur.
15. Nouvelle version partagée (D-33). → **Décidé** : elle remplace une version
    existante, sous le même lien. Suite : fait (D-33).
16. Hébergement affiché (D-33). → **Validé** pour le prototype (OVHcloud,
    UE) ; la version finale migrera probablement chez Infomaniak (Suisse).
17. Deux entrées « partager ». → **Décidé** : retirer l'ancien partage
    (`#/espace`). Précision demandée ensuite : l'ancien partage était le seul
    chemin par lequel un employeur voyait la **garantie** d'un cartographe.
    → **Décidé** : un cartographe publie la cartographie de l'apprenant, à sa
    demande, et s'en porte garant ; rien ne change dans l'interface. Suite :
    fait (D-42) ; ancien partage retiré, liens déjà créés servis jusqu'à leur
    échéance (D-43).
18. Version partagée dans l'API PHP/MySQL (D-30, écart au §12.2). →
    **Validé.**
19. Vouvoiement du dialogue (D-35). → **Validé.**
20. Chemin du carnet vers le portfolio (D-35). → **Décidé** : oui (le carnet,
    espace de métacognition, sert au lecteur du portfolio et à l'évaluation
    suivante). Suite : fait (D-40).
21. « Service humanome » pour les relances (D-36). → **Décidé** : non ; seule
    la démo des visiteurs passe par la clé de Christian, plafonnée par jour
    (par défaut 5 $ et 2 millions de tokens, réglables dans
    `#/admin/reglages`).
22. Politique de sécurité (D-36, D-37). → **Décidé** : les runs avec clé
    personnelle doivent fonctionner sur le site déployé ; `connect-src`
    s'ouvre aux fournisseurs. Suite : fait (D-36).
23. Compétences cochées par défaut (D-33). → **Validé.**
24. Attestation sur le compte et à chaque publication ; compte exigé pour
    partager seulement (D-31). → **Validé.**

Questions ouvertes (2026-10-14, D-43) :

25. Liens créés avant le retrait de l'ancien partage : ils restent servis
    jusqu'à leur échéance (90 jours par défaut, 365 au plus). L'ancien partage
    n'exigeait pas l'attestation de majorité : faut-il, au déploiement,
    révoquer les liens des comptes qui ne l'ont jamais posée, voire tous les
    anciens liens ? (Ma recommandation : révoquer ceux des comptes sans
    attestation — une migration d'une ligne — et laisser les autres
    expirer.)
26. Le niveau de confidentialité « Publique (partageable) » ne crée plus
    aucun lien : il ouvre seulement la lecture au cartographe lié, comme
    « Partagée avec mon cartographe ». Garder ce libellé, le renommer
    (« Publique »), ou retirer ce niveau ?
27. `CLAUDE.md` décrit encore le partage employeur comme « lien + mot de
    passe » (résumé et principe RGPD 4). Proposition : « lien vers une
    version partagée choisie par la personne, mot de passe facultatif, jamais
    automatique ». C'est votre texte : je ne l'ai pas modifié.

---

## 5. Chronologie

- **2026-10-13** — Installation, lecture de la spécification et des sources,
  cadrage (D-1 à D-5), création de la branche.
- **2026-10-13** — P0 : noyau `core/` (dates, référentiel, formules, état,
  disposition du soleil, heatmap, ensembles, opérations, surlignage, import,
  magasin) et 111 tests. Constat D-8 sur la saturation des angles.
- **2026-10-13** — P1 : interface (soleil, heatmap scolaire / libre, gestionnaire,
  tête de lecture, liste, modale du jour, « Pourquoi cette surface ? »),
  bascule de `#/cartographie` vers l'interface ultime (V3 sur
  `#/cartographie-v3`), validation des importeurs sur les journaux réels
  (D-12, compteurs seulement).
- **2026-10-13** — P2 : lecteur de portfolio surligné (volet, texte affiché,
  occurrences, décalage de date), panneau de détail (traces, verdicts, jury à
  deux niveaux, droit de réponse), rapports de pôle, kairos, synthèses
  évolutives, impression (D-13 à D-17).
- **2026-10-13** — P3 : comparaison de soi à soi (côtés nommés, préréglages,
  deux analyses du même portfolio, huit vues, précautions, note) (D-18 à D-21).
- **2026-10-13** — P4 : tableau de bord (neuf cartes qui se masquent seules,
  graphiques SVG accessibles, style local, rupture lexicale, moments,
  miroir HumanoTwin) (D-22 à D-24).
- **2026-10-13** — P5 : archive JSON réimportable sans perte (et conversion
  des masters V3), copie autonome HTML lisible en `file://`, rapport
  imprimable A4, « Préparer une démo » (anonymisation vérifiée trace par
  trace) ; correction de l'impression du site (règle Twin9) (D-25 à D-28).
  Validation sur les journaux réels : quatre corrections (dont le décalage du
  surlignage après un émoji, défaut de P2), puis aucun surlignage perdu sur
  406 (D-29).
- **2026-10-14** — P6 : version partagée en liste positive (chiffres
  recalculés, dates au jour, au mois ou masquées, extraits relus), réservée
  aux adultes par auto-attestation et gardée par le serveur (liste blanche,
  403 sans attestation, liens révoqués au retrait), lien à mot de passe
  facultatif jamais indexé, journal des accès, vue du destinataire ; migration
  022 ; e2e contre l'API locale (D-30 à D-34).
- **2026-10-14** — P7 : dialogue d'accompagnement scripté tiré des traces
  (sept fils sans valence), carnet local (archive, jamais partagé ni en
  démo), relances facultatives par un modèle de langage sur accord explicite
  (Ollama local proposé d'abord, appel direct du navigateur, seulement la
  question, la réponse et le passage) ; e2e : aucune requête sans accord
  (D-35, D-36).
- **2026-10-14** — Vérification indépendante de P6 et P7 : 13 corrections
  (retrait de l'attestation qui efface, liste blanche des types, titre relu
  et figé, jeton hors des URL, carnet hors de la copie HTML, verrous,
  robustesse de la vue du destinataire et du dialogue), 2 décisions
  soumises (questions 17 et 22) (D-37).
- **2026-10-14** — Réponses de Christian aux 24 questions (§4). L'angle compte
  les points, la confiance du jury ne fait que la hauteur (D-8) ; politique de
  sécurité ouverte aux seuls fournisseurs, pour les runs et relances avec clé
  personnelle (D-36) ; pages V3 retirées, `#/merge` renvoie vers
  `#/cartographie` (D-38) ; une nouvelle version partagée remplace l'ancienne
  sous le même lien (D-33) ; surlignage approché des extraits reformulés,
  validé sur les journaux réels (D-39) ; un dialogue du carnet se verse au
  portfolio, exporté en Markdown (D-40). Chapitres de formation consacrés à la
  V3 réécrits pour la nouvelle interface (D-38) ; à l'écran, « confiance
  moyenne du jury » (D-8). « Exporter toutes mes données » emporte les jeux de
  l'interface (archive de compte 1.1.0) et le master v4 a son schéma JSON,
  conforme sur les journaux réels (D-25).
- **2026-10-14** — Relecture indépendante des décisions du jour (D-41) : 9
  défauts, tous corrigés — archive de compte (« ce qui est là gagne » aussi
  pour le portfolio ; démonstration laissée de côté seulement intacte ; un jeu
  non conforme n'empêche plus l'export), Constance du tableau de bord,
  dialogues versés jamais doublés, « Publier à la place » limité par défaut
  aux versions du jeu, surlignage approché coupé aux limites de bloc,
  brouillons de partage effacés avec le jeu et avec le compte, notes de
  « Pourquoi cette surface ? » ; risque résiduel de la politique de sécurité
  consigné dans `docs/securite-checklist.md`.
- **2026-10-14** — Question 17 précisée par Christian : la garantie passe par
  la publication. Un cartographe publie la version de l'apprenant, à sa
  demande (code à usage unique), dans le compte de celui-ci, et s'en porte
  garant ; l'employeur le lit ; remplacer soi-même une version garantie lui
  retire sa garantie (D-42, migration 023).
- **2026-10-14** — Ancien partage retiré (D-43) : plus de lien vers une
  cartographie du site (`422 share_retired`) ; « Partager depuis
  l'interface » et « Liens déjà créés » dans « Mes cartographies » ; la page
  de relecture du cartographe ouvre la cartographie ou sa révision dans
  l'interface, pour la publier avec sa garantie ; parcours e2e apprenant et
  cartographe réécrits et remis en état ; catalogue des cas d'utilisation
  recompté.
