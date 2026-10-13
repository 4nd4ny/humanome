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
| P6 | copie serveur et partage (adultes) | ✅ | ✅ 39 tests (cœur, interface, API, e2e Chromium contre l'API locale) | ✅ 262 verts (carto) + suites du site et de l'API + e2e | voir §5 |
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

Depuis P1, `#/cartographie` porte l'interface ultime et l'entrée du menu
« Découvrir » s'intitule « Cartographie ». L'interface V3 reste accessible sur
`#/cartographie-v3` (et sur `#/merge`) ; les fiches UC-VIS-01 et UC-APP-12 le
mentionnent en tête, et leurs tests ouvrent désormais `#/cartographie-v3`.

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
  somme des poids des traces du jour et la légende le dit. Un jour sans texte
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
  défilement centré (sans animation sous mouvement réduit).

### D-14 — Où chercher le passage d'une trace

Ordre : journée du passage (`sourceDate`), journée de la trace, puis les
autres journées du portfolio par distance croissante (`core/passages.js`).
Dans sa journée, un résultat partiel suffit (orange). Ailleurs, seule une
correspondance **complète et exacte** (ancres non raccourcies) déplace le
lecteur, et le volet le dit : « retrouvé tel quel dans la feuille du X, alors
que la trace est datée du Y » (cas réel, D-12), avec un lien vers la journée
de la trace. Une ancre raccourcie à deux mots se trouve n'importe où : elle
ne suffit jamais. Les autres journées ne sont chargées que si le passage
n'est pas retrouvé en entier dans la sienne. Introuvable : le volet le dit
et cite l'extrait du jury (défaut d'AuroraCore). Sans portfolio : il invite à
l'importer.

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
  imprimée **[à valider]**.

### D-16 — Panneau d'un pôle et du profil

- Pôle : synthèse, rapport de chaque journée (portrait, territoires denses
  avec leur extrait ouvrable, pistes), passages saillants repliables ; rapport
  de pôle du run pour AuroraCore. Les « territoires non visités » et les
  « émergences » du rapport ne sont **pas** affichés : ils décrivent ce qui
  manque, ce que le miroir s'interdit (§1.2) **[à valider]**.
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

- Moments : traces dont le poids (rôle × confiance) atteint un seuil réglé par
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


### D-25 — Archive de l'apprenant : le master v4 complet

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
- **[à valider]** Cette archive est distincte de l'archive de compte du site
  (`archive-export` 1.0.0, UC-APP-06, schéma dans `schemas/`), qui ne contient
  pas le master de cartographie. Deux suites possibles : l'embarquer dans
  l'archive de compte, et/ou écrire un schéma JSON du master v4 dans
  `schemas/` (aujourd'hui, le contrat est le code et ses tests).

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
  publiques. **[à valider]** Ce fichier, même anonymisé, vient d'un vrai
  portfolio : il n'est jamais versionné (`.gitignore`) ; il se dépose par FTP
  ou se place dans `web/public/data/demo/carto/` avant la construction.
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


### D-30 — Ce qui part sur le serveur : une version partagée, jamais le master **[à valider]**

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
- Le serveur vérifie la même forme **par liste blanche de champs**, à tous
  les niveaux (`api/src/Share/SharedVersion.php`) : un champ inconnu, une
  date plus fine que la précision choisie, un extrait d'une compétence
  retirée ou trop long, un référentiel augmenté sont refusés (422). Les deux
  listes sont tenues ensemble par une fixture partagée
  (`schemas/fixtures/partage/carto-partage-exemple.json`) : le test PHP
  l'accepte, le test du client compare sa forme à celle de
  `buildSharedVersion`.
- **[écart]** §12.2 propose « PHP 8 + SQLite (ou fichiers JSON) ». Le site a
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
  `403 {code: 'adult_required'}` et n'écrivent rien. Retirer l'attestation
  révoque aussitôt tous les liens actifs des versions partagées du compte ;
  les versions restent consultables, téléchargeables et effaçables par leur
  auteur (droits d'export et d'effacement).
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
  `GET /api/share/{token}` (public, même quota par IP que le formulaire,
  404 homogène, 401 `password_required` si le lien a un mot de passe) sert
  la version. Les autres types gardent le mot de passe obligatoire.
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
   précision des dates, arbre pôles → compétences à cases à trois états,
   extraits proposés par compétence (traces de l'ensemble coché, chargées à
   la demande). La version part de l'état affiché (journées cochées, date t).
2. **Relire** (§12.2, contenus tiers) : masques des courriels, liens,
   téléphones et adresses (actifs par défaut, avec leurs nombres) ; mots à
   majuscule repérés dans le titre et les extraits, à remplacer d'un clic
   par « ‹nom› » (ou un autre nom) ; chaque extrait peut être modifié ou
   « Retiré de cette version partagée » ; une case « j'ai relu » est exigée.
3. **Aperçu verrouillé** : le composant même du destinataire (`SharedView`),
   avec les données mêmes ; encart RGPD (ce qui part, hébergement, durée de
   conservation, droits, journal, pas d'indexation) et case de demande
   explicite, puis « Publier la version partagée ».

Vocabulaire : on **retire** d'une version partagée ; « Supprimer » n'apparaît
nulle part (le retrait d'une version du serveur s'appelle « Retirer cette
version du serveur »). **Instantané figé** : aucune route ne modifie le
document d'une version ; une nouvelle version est une nouvelle publication,
les anciennes restent jusqu'à leur retrait (question 15).

Gestion : versions publiées (privée / lien partagé), liens (création avec
expiration et mot de passe facultatif, révocation en deux temps, état
actif / expiré / révoqué), journal des accès, aperçu, export JSON complet
d'une version (document, liens, journal), retrait immédiat, retrait de
l'attestation. Hébergement affiché : « OVHcloud, dans l'Union européenne »
**[à valider]** (question 16).

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
lecture du lien (le référentiel est embarqué).

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
journaux).

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

---

## 4. Questions ouvertes pour Christian

1. (§15, point ouvert 1) Valeur de α (poids d'un indice) : 0,5 retenu par défaut, réglable.
2. Les données personnelles (portfolios, journaux 300 / 200 / GEN1 du dossier
   AuroraCore) ne sont **jamais** versionnées : le dépôt est public. Les tests
   utilisent des données synthétiques ou le corpus déjà public
   (`assets-existants/merge-prototype`).
3. Saturation des angles sur une longue période (D-8) : garder la formule telle
   quelle, ou une des pistes proposées ?
4. Lecture des formules (D-6) : moyenne des confiances des seuls verdicts qui
   fournissent des traces, statut optimiste, hors référentiel sans secteur.
5. Miroir et rapports de pôle (D-16) : « territoires non visités » et
   « émergences » masqués — à confirmer.
6. Note privée du droit de réponse non imprimée (D-15) — à confirmer.
7. Routes préfixées par `#/cartographie` (D-2) plutôt que `#/jour/<date>`
   (déjà pris par la vue historique du site).
8. Démonstration sans portfolio (D-11) : le surlignage y est indisponible
   jusqu'à la démo anonymisée de P5.
9. Surlignage « approché » des extraits reformulés par l'analyse (validation
   P2) : à ajouter, signalé comme tel, ou s'en tenir au message actuel ?
10. Archive de cartographie (D-25) : l'embarquer dans l'archive de compte du
    site (`archive-export`, UC-APP-06) ? Écrire un schéma JSON du master v4
    dans `schemas/` ?
11. Démo anonymisée du site (D-28) : où la déposer — par FTP dans la release
    courante (perdue à la release suivante) ou dans `web/public/data/demo/carto/`
    avant chaque construction (jamais versionnée) ?
12. Rapport imprimable (D-27) : pour AuroraCore, les six voix et le président
    sont imprimés, pas les délibérations complètes ni le débat ni les pièces
    du Greffier (tout le journal) — à confirmer.
13. Correction hors module (D-27) : la règle d'impression de la facture Twin9
    masquait toute autre impression du site ; elle est désormais limitée à la
    page qui affiche une facture — à confirmer.
14. Copie serveur (D-30) : seule la version partagée est copiée sur le
    serveur. Faut-il aussi offrir aux adultes une sauvegarde serveur de toute
    leur cartographie (portfolio compris), pour la retrouver sur un autre
    appareil ?
15. Nouvelle version (D-33) : une nouvelle publication crée une version
    distincte, avec ses propres liens. Préférez-vous qu'elle remplace une
    version existante sous le même lien (le destinataire voit alors la mise à
    jour) ?
16. Hébergement affiché (D-33) : « OVHcloud, dans l'Union européenne » — à
    confirmer (centre de données de l'offre mutualisée).
17. Deux entrées « partager » coexistent pour un apprenant connecté : celle
    du site (« Partager ma cartographie », `#/espace`, cartographies du
    moteur, mot de passe obligatoire) et l'espace Partage de l'interface
    ultime. Faut-il les réunir ?
18. §12.2 (D-30, **[écart]**) : la version partagée vit dans l'API PHP/MySQL
    existante du site plutôt que dans un stockage SQLite ou JSON séparé.

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
