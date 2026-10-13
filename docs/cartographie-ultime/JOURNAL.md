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
| P0 | noyau `core/` : modèle, importeurs, formules §5 | ✅ | ✅ 111 tests | ✅ 111 verts | (ce commit) |
| P1 | soleil, heatmap, gestionnaire, date t, liste, modale | — | — | — | — |
| P2 | lecteur surligné, détail, jury, « Pourquoi ? », animation | — | — | — | — |
| P3 | comparaison A/B (8 vues) | — | — | — | — |
| P4 | tableau de bord des métriques | — | — | — | — |
| P5 | exports JSON / HTML / PDF, anonymisation | — | — | — | — |
| P6 | copie serveur et partage (adultes) | — | — | — | — |
| P7 | dialogue scripté (option) | — | — | — | — |

Légende : ✅ fait · ⏳ en cours · — pas commencé.

---

## 2. Décisions d'implémentation et d'architecture

Chaque décision est numérotée (D-n) pour pouvoir y renvoyer depuis le code et
les commits. Les écarts à la spécification sont signalés **[écart]** et les
choix à faire valider **[à valider]**.

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

### D-2 — Routes préfixées par `#/cartographie` **[écart]**

La spécification (§13) liste `#/cartographie`, `#/jour/<date>`,
`#/comparaison`, `#/tableau-de-bord`, `#/gestionnaire`. Or `#/jour/<date>` est
déjà la vue « journée » historique du site (hors périmètre). Pour ne rien
casser, les cinq espaces vivent sous un même préfixe :

`#/cartographie` · `#/cartographie/jour/<date>` · `#/cartographie/comparaison`
· `#/cartographie/tableau-de-bord` · `#/cartographie/gestionnaire` ·
`#/cartographie/export`.

L'interface V3 actuellement servie sur `#/cartographie` reste accessible (elle
sera déplacée sur `#/cartographie-v3` quand la nouvelle interface la
remplacera, en P1).

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

### D-6 — Lecture des formules du §5 (choix d'interprétation) **[à valider]**

- **Verdicts qui comptent** : seuls « établie » (toutes variantes) et « renvoi
  au cartographe » fournissent des traces (§5.2). Une « non établie » et un
  court-circuit n'en fournissent pas ; le court-circuit est compté à part,
  jamais comme une absence (§4.2).
- **Confiance cumulée C(c)** : moyenne des confiances des seuls verdicts qui
  ont fourni au moins une trace. La confiance d'un verdict de *non-présence*
  mesure la certitude de l'absence : la mêler à la hauteur fausserait le
  miroir.
- **Statut affiché** : une compétence établie au moins une fois dans
  l'ensemble est « établie » (règle optimiste du merge v2) ; sinon, si elle
  n'a que des renvois, son secteur est hachuré.
- **Confiance absente** : poids nul (on n'invente jamais une confiance).
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

### D-8 — Constat sur le corpus réel : le cumul saturant aplatit les angles **[à discuter]**

Mesuré sur les 59 journées publiques (`assets-existants/merge-prototype`) :

| État à la date t | compétences | I > 0,99 | angle min / médian / max |
|---|---|---|---|
| 2025-12-22 (1 journée) | 24 | 0 | 7,5° / 10,7° / 37,3° |
| 2025-12-31 | 39 | 1 | 2,9° / 10,5° / 14,5° |
| 2026-01-31 | 54 | 39 | 1,5° / 7,2° / 7,2° |
| 2026-03-29 (complet) | 56 | 52 | 2,1° / 6,6° / 6,6° |

En moyenne, un verdict qui compte porte 2,07 traces et les poids vont jusqu'à
0,99 : après un mois, la plupart des compétences atteignent I ≈ 1 et
reçoivent le **même** angle. C'est la conséquence mathématique de la formule
décidée (« une trace très claire pèse plus que dix traces vagues ») ; sur une
longue période, l'angle ne distingue plus que les compétences rares, et la
lecture repose sur la hauteur (confiance). L'implémentation suit la
spécification à la lettre ; pistes à discuter : abaisser la borne des poids,
intensité calculée par journée puis cumulée, ou échelle de saturation
réglable.

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

---

## 4. Questions ouvertes pour Christian

1. (§15, point ouvert 1) Valeur de α (poids d'un indice) : 0,5 retenu par défaut, réglable.
2. Les données personnelles (portfolios, journaux 300 / 200 / GEN1 du dossier
   AuroraCore) ne sont **jamais** versionnées : le dépôt est public. Les tests
   utilisent des données synthétiques ou le corpus déjà public
   (`assets-existants/merge-prototype`).

---

## 5. Chronologie

- **2026-10-13** — Installation, lecture de la spécification et des sources,
  cadrage (D-1 à D-5), création de la branche.
- **2026-10-13** — P0 : noyau `core/` (dates, référentiel, formules, état,
  disposition du soleil, heatmap, ensembles, opérations, surlignage, import,
  magasin) et 111 tests. Constat D-8 sur la saturation des angles.
