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
| P4 | tableau de bord des métriques | ✅ | ✅ 28 tests (cœur, interface) | ✅ 200 verts (carto) + suite du site | (ce commit) |
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
