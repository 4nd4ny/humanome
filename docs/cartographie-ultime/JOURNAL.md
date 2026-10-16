# Journal d'avancement — interface ultime de cartographie

Source des exigences : `INDEX/04_specifications.md` du dossier de travail
« Cartographie » de Christian (version 0.1 du 2026-10-13), complété par les
fiches de lecture `01_synthese_phase3.md`, `02_modele_de_donnees_commun.md`,
`03_aurora_chaine_donnees_et_extraits.md`, `03b_lecture_proto.md`,
`03c_lecture_site_humanome.md` et `03d_lecture_react2025.md`, et par
l'inventaire `00_inventaire.xlsx`. Les références « §n » ci-dessous renvoient
aux sections de `04_specifications.md`.

Branche de travail : `feat/ultimate-cartography` (issue de `main` @ `28969a2`).
Aucun déploiement sur https://humanome.xyz tant que Christian n'avait pas
validé. **Validé le 2026-10-14** : déployé le même jour, avec son
autorisation, puis fusionné dans `main` (D-46).

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
| Q17 — ancien partage retiré | plus de lien vers une cartographie du site (422) ; « Partager depuis l'interface », « Liens déjà créés » ; la relecture du cartographe ouvre sa révision dans l'interface (D-43) | ✅ | ✅ 13 tests ajoutés, d'autres réécrits ; 21 retirés avec la création (18 du site, 3 de l'API) ; parcours e2e apprenant et cartographe réécrits (et remis en état : activation D5) | ✅ voir §3 | `9e7685c` |
| Q25–29 | « Partager » ; `CLAUDE.md` décrit le nouveau partage (D-44) | ✅ | ✅ tests de libellés mis à jour | ✅ | `8f3b196` |
| Pôle ouvert sur 360° | double-clic sur un pôle : ses compétences font tout le tour ; clic au centre : retour à tous les pôles ; aussi dans la version partagée (D-45) | ✅ | ✅ 28 tests (cœur, passage animé, interface, liste) + 1 e2e Chromium + revue visuelle + relecture indépendante | ✅ voir §3 | `1377f2b` |
| Déploiement | humanome.xyz : release API `v1.1.0-106-gc6a0231`, migrations 022 et 023, front ; vérifié en ligne ; branche fusionnée dans `main` (D-46) | ✅ | — | ✅ vérification en ligne (Chromium) | voir D-46 |
| Q30 — thème au chargement | le script anti-FOUC autorisé par son hash dans la CSP de production ; garde de synchronisation ; déployé (D-47) | ✅ | ✅ 1 test (garde du hash) + vérification Chromium avant et après, sur le bundle puis en ligne | ✅ | voir §5 |
| Démo avec portfolio | le journal de la démonstration sur le site seulement (archive de l'interface), passages surlignés ; guide du visiteur (D-48) | ✅ | ✅ 2 392 traces vérifiées par le chemin du lecteur + vérification en ligne | ✅ | voir §5 |
| Q31 — portfolio de Google Docs | échappements, traits, sauts de ligne et images rendus ; « 1er » lu par le découpage ; démonstration redéposée, front redéployé (D-49) | ✅ | ✅ 9 tests (rendu, surlignage, découpage) + 2 392 traces revérifiées + vérification en ligne | ✅ | voir §5 |
| Comparaison par défaut | janvier face à mars ; préréglage « Janvier et mars » ; changer de vue ne fige plus A et B ; déployé (D-50) | ✅ | ✅ 2 tests (cœur, interface) + vérification en ligne | ✅ | voir §5 |
| Comparaison : deux moitiés | première moitié des journées analysées face à la seconde, par défaut et par un préréglage ; remplace janvier et mars (D-51) | ✅ | ✅ 2 tests réécrits (cœur, interface) | ✅ | voir §5 |
| En-tête allégé | « Réinitialiser l’affichage » ; ni « Comparer A / B », ni « Exporter », ni case « mode expert » (ses réglages deviennent une tuile) ; légende du soleil sur deux lignes, toujours (D-52) | ✅ | ✅ voir D-53 | ✅ | voir §5 |
| Cartographie en tuiles | douze tuiles masquables, déplaçables, redimensionnables ; au départ, le soleil et le détail ; disposition gardée dans le navigateur (D-53) | ✅ | ✅ 25 tests (disposition, interface, copie autonome) + e2e Chromium + relecture indépendante | ✅ | voir §5 |
| Q32 — tableaux et rendu | Markdown rendu par marked : tableaux, encadrés, listes numérotées et imbriquées, styles « comme à l'impression » ; surlignage identique sur les 2 392 traces (D-54) | ✅ | ✅ voir §3 + 2 392 traces revérifiées + relecture indépendante | ✅ | voir §5 |
| Q33 — traits à l'import | après un titre daté, un trait ne coupe plus : il reste dans sa journée ; export du portfolio adapté (D-55) | ✅ | ✅ voir §3 + journal de la démonstration redécoupé en ses 67 journées | ✅ | voir §5 |
| Lecteur épuré | en tête fixe, la journée entre ◁ ▷ (trace précédente / suivante) et la fermeture ; l'extrait du jury cité seulement s'il n'est pas retrouvé tel quel ; plus de navigation par jour ni de ligne d'état (D-56) | ✅ | ✅ voir §3 | ✅ | `6b9ee6b`, `b3fabf3` |
| Démo sur Chrome Android | une démonstration intacte se met à jour d'elle-même, en arrière-plan, quand le site en dépose une nouvelle (D-57) | ✅ | ✅ voir §3 | ✅ | `c7efc6f`, `b3fabf3` |
| Anneau des pôles | élément d'interface : chaque pôle l'occupe en entier ; épaisseur réglable, 30 par défaut (de 0 à 160) ; les feuilles passent de 51,5 à 125 de hauteur (D-58) | ✅ | ✅ voir §3 + e2e Chromium | ✅ | `abc134a`, `b3fabf3` |
| Heatmap | « Tout voir » (du premier au dernier jour) par défaut, « Année scolaire », « Période libre » ; contraste renforcé toujours (D-59) | ✅ | ✅ voir §3 | ✅ | `abc134a`, `b3fabf3` |
| Thème sombre | le soleil et la heatmap suivent le thème ; marches sombres des sept couleurs choisies et validées (D-60) | ✅ | ✅ voir §3 + e2e Chromium | ✅ | `842711e`, `b3fabf3` |
| Déploiement | D-56 à D-60 : front déployé, vérifié en ligne au bureau et au téléphone (démonstration ancienne mise à jour en 1,9 s) | ✅ | — | ✅ vérification en ligne (Chromium) | voir D-60 |
| Commandes des tuiles | à la souris, au survol ou au clavier seulement, posées sur la fin de la barre ; toujours affichées sur un écran tactile ; Cartographie et Tableau de bord (D-61) | ✅ | ✅ voir §3 + e2e Chromium (souris, clavier, tactile à 360 px) | ✅ | `88d72af` |
| Tableau de bord en panneaux | « Panneaux » et « Réinitialiser l'affichage » dans l'en-tête ; au départ, le profil et le rythme ; cartes sans données dites dans le menu ; disposition gardée dans le navigateur (D-61) | ✅ | ✅ voir §3 + e2e Chromium | ✅ | `88d72af` |
| Résumé du profil | ni « Points (total) » ni phrase sur le court-circuit (D-62) | ✅ | ✅ voir §3 | ✅ | `88d72af` |
| Couleurs en clair | marches claires des pôles, validées pour les daltoniens ; bordures et marques des pôles aux deux thèmes (D-63) | ✅ | ✅ voir §3 + e2e Chromium | ✅ | `88d72af` |
| Déploiement | D-61 à D-63 : front déployé en deux passes (la seconde pour les titres au téléphone, `af81072`), vérifié en ligne au bureau et au téléphone | ✅ | — | ✅ vérification en ligne (Chromium) | voir D-63 |
| Palettes | « Réglages » (ex-« Réglages de l'encodage ») : cinq palettes des pôles, validées pour les daltoniens ; préférence du navigateur ; rapport et version partagée sur la palette par défaut (D-64) | ✅ | ✅ voir §3 + e2e Chromium | ✅ | `6203560`, `90134c2` |
| Départ de la hauteur | la hauteur part d'une confiance réglable de 0 à 0,5, 0,25 par défaut ; épaisseur minimale de 1 à 6 px (D-65) | ✅ | ✅ voir §3 + e2e Chromium | ✅ | `6203560`, `90134c2` |
| Déploiement | D-64 et D-65 : front déployé, vérifié en ligne au bureau et au téléphone | ✅ | — | ✅ vérification en ligne (Chromium) | voir D-65 |
| Chaque information une fois | portrait de la journée sans « Synthèse complète » ; compétence, pôle, modale du jour et rapport imprimé sans redites ; sort des pièces du Greffier ; décision du président d'abord, sans rien déplier ; textes complets qui ne font que redire non gardés (D-66) | ✅ | ✅ voir §3 + vérification Chromium sur la démonstration + deux relectures indépendantes | ✅ | `073c632`, `b72858d`, `3c8160f` |
| Déploiement | D-66 : front et archive de la démonstration allégée (18,4 → 17,2 Mo) déployés, vérifiés en ligne au bureau et au téléphone ; une démonstration d'avant mise à jour d'elle-même en 3,3 s | ✅ | — | ✅ vérification en ligne (Chromium) | voir D-66 |
| Démonstration lue à la demande | un index (38 Ko compressés), puis le seul fichier de ce qu'on ouvre : une compétence, un pôle, la journée, son texte, une délibération (D-67) | ✅ | ✅ voir §3 + relecture indépendante + démonstration refaite à l'identique | ✅ | `b640358` |
| Seconde lecture | le jury AuroraCore joint à chaque compétence, la décision du président d'abord, sans effet sur le soleil ; rapport de pôle (D-68) | ✅ | ✅ voir §3 | ✅ | `b640358` |
| Démonstration enrichie | dès qu'on y met quelque chose à soi, elle se copie dans le navigateur ; l'ancien dossier de version peut se retirer du site (D-67) | ✅ | ✅ voir §3 + seconde relecture indépendante | ✅ | `6c50346` |
| Déploiement | D-67 et D-68 : démonstration découpée avec sa seconde lecture, front ; vérifiés en ligne au bureau et au téléphone ; place sur le serveur : ancienne archive et plus ancienne version de l'API sauvegardées sur le Mac puis effacées (question 41) | ✅ | — | ✅ vérification en ligne (Chromium) | voir D-68 |

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
- **Décidé ensuite** (§4, questions 25 à 29) : les liens créés avant ne sont
  pas révoqués (le site n'est pas encore ouvert au public) ; le niveau
  « Publique (partageable) » s'intitule « Partager » et `CLAUDE.md` décrit le
  nouveau partage (D-44) ; la publication par l'apprenant seul et le code de
  demande sans invitation préalable sont confirmés.
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

### D-44 — « Partager », et le partage décrit dans `CLAUDE.md` **[décidé]**

Christian (2026-10-14), réponses aux questions 25 à 29 (§4) :

- Le niveau de confidentialité `publique` s'intitule **« Partager »** (il
  s'appelait « Publique (partageable) ») : « Mes cartographies », aide de
  l'espace apprenant, file du cartographe, formation (apprenant 06,
  cartographe 01 et 04), fiches UC-APP-03 et UC-APP-04. La valeur enregistrée
  et l'effet ne changent pas : lisible par le cartographe lié, aucun lien
  créé — le partage avec un employeur passe par l'interface (D-43).
- `CLAUDE.md` (résumé et principe RGPD 4) : « lien vers une version choisie
  par la personne, mot de passe facultatif, jamais automatique ».
- Rien à changer pour le reste : les liens créés avant ne sont pas révoqués,
  l'apprenant peut publier seul, et le code de demande suffit au cartographe.

### D-45 — Ouvrir un pôle sur 360° **[décidé]**

Christian (2026-10-14) : « lorsque l'on double clique sur un des 7 domaines de
compétences du référentiel (sur les arc-cercles centraux), j'aimerai “ouvrir”
l'arc de cercle et présenter sur 360 degrés toutes les compétences associées au
domaine correspondant, à la place du carto-sun principal. Un clic au centre
permet de revenir à la vue complète des 7 domaines de compétence. »

- **Disposition** (`core/state.js`, `layoutPole`) : les compétences observées
  du pôle se partagent le tour, chacune selon sa **part des points du pôle**
  (θ = 360° × points / points du pôle), dans l'ordre du référentiel à partir
  de −90°, avec la même largeur minimale dessinée que le soleil principal. Les
  **hauteurs ne changent pas** (confiance moyenne du jury, mêmes anneaux) ;
  l'anneau du pôle fait le tour entier, à la hauteur de sa confiance.
- **Ouvrir** : double-clic sur l'arc du pôle ; au clavier, « o » ou
  Maj+Entrée sur le pôle ; dans le panneau de détail d'un pôle, « Ouvrir ce
  pôle sur 360° ». Le pôle ouvert est sélectionné.
- **Revenir** : le **centre** (↩ et « N pôles »), un nouveau double-clic sur
  l'anneau, Échap (un appui désélectionne s'il y a une sélection, le suivant
  referme), ou « Revenir aux N pôles » dans le détail. **[choix d'implémentation]** N est
  le nombre de pôles du soleil complet à la date t — 7 pour une cartographie
  complète, moins tant que des pôles n'ont aucune trace (« revenir au soleil
  entier » s'il n'y en a qu'un) : le centre annonce ce qu'on retrouvera.
- **Ce qui reste** : la date t, les journées cochées, les réglages — le pôle
  ouvert suit l'état cumulé, y compris pendant le passage animé. Choisir une
  compétence d'un autre pôle (dans la liste, par exemple) le referme ; une du
  même pôle le garde.
- **Lecture** : chaque compétence porte son **code**, dans le secteur s'il est
  assez épais (encre contrastée sur sa couleur), juste au-dessus sinon, dès
  que l'arc a la place de l'écrire. Les libellés accessibles disent « x % du
  pôle (y % du soleil) » ; la légende sous le soleil garde le chemin du
  retour ; « Pourquoi cette surface ? » ajoute « Dans le pôle ouvert » (angle
  et part) et la formule.
- **Animation** (`ui/sunTransition.js`, pure) : l'arc s'ouvre en une
  demi-seconde (480 ms, départ et arrivée en douceur) — le pôle et ses
  compétences glissent et s'élargissent en tournant le moins possible, les
  autres pôles s'effacent dessous, le nom du pôle glisse vers le haut de
  l'anneau ; la fermeture fait l'inverse, l'arc qui se resserre découvre les
  autres. Aucune animation si le mouvement est réduit (préférence du système
  ou de l'interface). Pendant le passage, les secteurs qui s'effacent ne sont
  ni cliquables ni atteignables au clavier.
- **Version partagée** (vue du destinataire et aperçu verrouillé) : même
  geste **[choix d'implémentation]** — c'est le même soleil ; « Comment lire
  ce soleil » le dit. Les petits soleils (journée, comparaison, rapport) ne
  s'ouvrent pas.
- **Corrigé en chemin** : un clic sur un secteur du soleil faisait défiler
  **toute la page** jusqu'à l'élément choisi de la liste (`scrollIntoView`) —
  306 px dans une fenêtre de 1 280 × 720 — et le second clic d'un double-clic
  tombait à côté du soleil. **[choix d'implémentation]** La colonne de gauche
  (journées et compétences) défile désormais seule, collante comme celle du
  détail (au-delà de 767 px) ; la liste y suit la sélection — y compris une
  compétence d'un pôle replié, montrée dès que son pôle s'ouvre — sans jamais
  faire défiler la page (`revealInList`). Le double-clic ne surligne plus le
  nom du pôle, et au doigt un double appui ouvre le pôle au lieu d'agrandir la
  page (vérifié en émulation mobile Chromium).
- **Revue visuelle** (captures sur des données synthétiques couvrant les 61
  compétences, non versionnées) : les 7 pôles ouverts, les trames
  d'ouverture et de fermeture, thèmes clair et sombre, largeur de téléphone.
  Corrigé à sa suite : codes en encre contrastée (une règle CSS l'emportait
  sur l'attribut), saut du nom du pôle en fin d'animation, éclat des secteurs
  atténués à la fin de la fermeture, ordre de dessin à la fermeture.
- **Relecture indépendante** (agent distinct, avant le commit ; suites
  repassées, vérifications dans Chromium) : rien de bloquant. Corrigé à sa
  suite : un seul appui d'Échap, le soleil ayant le focus, désélectionnait
  **et** refermait le pôle (le raccourci de la page repassait derrière celui
  du soleil, avec l'état déjà mis à jour) — le soleil marque l'événement
  traité, la page n'y touche plus (l'e2e le reproduit, jsdom non) ; à la toute
  fin de l'ouverture, sur un écran à plus de 60 Hz, un arc presque complet
  disparaissait une trame (extrémités confondues à l'arrondi) — tracé en
  anneau dès 1e-4 rad du tour ; anneau de focus du centre effacé quand le pôle
  est ouvert ; un passage inversé en cours de route faisait sauter l'opacité ;
  l'arrivée du passage suit la date t si elle bouge ; « o » avec Ctrl, Cmd ou
  Alt reste au navigateur ; la liste ne suivait plus la sélection (voir
  ci-dessus).
- Docs : aide de la cartographie, formation (apprenant 07, cartographe 07,
  visiteur 02, employeur 06).

### D-46 — Déploiement sur humanome.xyz et fusion dans `main` **[fait]**

Christian (2026-10-14, 15 h 16) : « Tu peux déployer sur le site de
démonstration à l'aide des identifiants et mot de passe FTP présents dans
“humanome.xyz/cahier des charges/ftp-humanome.xyz.txt” puis valider la PR et
merger la branche avec main de Github. »

- **Avant** : la production tournait `v1.1.0-20-g471d7cd`, un ancêtre de
  `main` et de la branche (rien en ligne ne se perdait). Migrations nouvelles :
  `022` et `023` seulement, toutes deux additives (valeur d'énumération, colonne
  facultative, table neuve).
- **Ce qui est parti** : release API `20261014-133427-v1.1.0-106-gc6a0231`
  (723 fichiers) ; `migrate` → `022_carto_partage_adultes.sql` et
  `023_carto_publication_garantie.sql` appliquées, 21 déjà là ; référentiels
  7.0.0 et 7.1.0, compétences (61), fiches et paquets de prompts **inchangés** ;
  `health` → `{"status":"ok","version":"v1.1.0-106-gc6a0231","db":"ok"}`. Front :
  `.htaccess` (CSP `connect-src` des fournisseurs, question 22), `index.html`,
  le bundle, le modèle de la copie autonome ; l'ancien bundle retiré ; données
  de démo inchangées. Les deux exports statiques du référentiel restent ceux de
  la production (même contenu ; l'export local ne différait que par la mise en
  forme et les dates de publication de la base locale).
- **Comment** : le FTP n'est pas joignable depuis le conteneur cloud ; il l'est
  depuis la VM Linux du Mac, où le déploiement a tourné. Les artefacts ont été
  construits dans le conteneur (`npm run build` ; `stage-api.sh`, dont les
  dépendances de production viennent du `vendor/` installé, élagué par
  `composer install --no-dev` hors ligne — le téléchargement depuis GitHub
  échouait à travers le proxy) puis remis à la VM par le dossier partagé. Les
  identifiants : ceux du fichier désigné par Christian (identiques à ceux du
  `.env.deploy` de sa copie du dépôt, d'où vient aussi le jeton de
  migration) ; un `.env.deploy` éphémère dans la VM, jamais affiché, effacé
  ensuite. Le shell distant s'arrête au bout de 180 s : `deploy.mjs api` a été
  coupé à 175 fichiers sur 723, **avant** l'écriture du pointeur (production
  intacte) ; la même release a ensuite été complétée par un téléversement
  reprenable et parallèle (mêmes étapes, même ordre, outil ponctuel hors
  dépôt), vérifiée fichier par fichier (tailles), puis le pointeur écrit et
  l'étape HTTPS jouée comme dans `deploy.mjs`. Front par `deploy.mjs static`,
  après un `--dry-run` relu (4 envois, 1 suppression).
- **Vérifié en ligne** (Chromium, depuis le conteneur) : démonstration (7 pôles,
  56 compétences), TETE ouvert sur 360° (1.01 à 1.10, « Centre : revenir aux
  7 pôles »), retour ; CSP servie ; ancien bundle en 404. Releases gardées :
  `v1.1.0-4`, `v1.1.0-20` (retour arrière possible : `deploy.mjs rollback`) et
  la nouvelle.
- **Non déployé** : la démo anonymisée `data/demo/carto/archive.json` (question
  11) — aucune n'a été préparée (« Préparer une démo » sur un journal choisi,
  avec la relecture de Christian) ; « Explorer la démonstration » garde les 59
  journées publiques.
- **Constaté** (antérieur à ce déploiement) : le script anti-FOUC de
  `index.html` est refusé par la CSP de production depuis qu'elle existe (le
  seul hash autorisé est celui du bootstrap de la sandbox). Question 30 ;
  corrigé ensuite (D-47), où l'effet exact est décrit.
- **Fusion** : PR `feat/ultimate-cartography` → `main`, CI verte
  (`check-publiable`, moteur), fusionnée par un commit de fusion.

### D-47 — Le script anti-FOUC autorisé par la CSP de production **[décidé]**

Christian (2026-10-14), question 30 : « feu vert pour réaliser cette
correction. Déploie ensuite le correctif sur le site. »

- **L'effet exact** (mesuré dans Chromium sur le bundle construit, sous la CSP
  de production d'avant) : le script en ligne de `index.html` est refusé
  (`script-src-elem`) et **rien d'autre ne pose le thème au chargement** —
  `lib/theme.js` ne gère que la bascule à chaud. Le choix explicite d'un
  visiteur (clair ou sombre) n'était donc pas réappliqué quand il revenait ou
  rechargeait la page : elle suivait le thème du système, alors que le bouton
  de thème affichait son choix. Ce n'était pas un simple éclair au chargement.
- **Correction** (`web/public/.htaccess`) : `script-src` autorise ce script
  **par son hash** (`'sha256-VNZJ2x9PRW+GU3XSKT9vt2Pezkb2MMkrNIOKCPOuxzY='`),
  jamais par `'unsafe-inline'` ; le commentaire de la CSP l'explique. Vite
  recopie ce script tel quel dans `dist/index.html` (même hash, vérifié).
- **Garde** (`web/src/anti-fouc.test.js`) : un seul script en ligne admis dans
  `index.html` ; son hash, recalculé depuis la source, doit figurer dans
  `script-src`. Le test échoue sur la CSP d'avant (vérifié).
- **Vérifié avant le déploiement**, dans Chromium sur le bundle construit avec
  la CSP de production appliquée : avant, une violation et aucun thème posé ;
  après, aucune violation et le thème posé pendant l'analyse du `<head>`, avant
  le bundle — pour « sombre » comme pour « clair ».
- **Déploiement** : front seul (`.htaccess`), par `deploy.mjs static` depuis la
  VM du Mac ; même vérification ensuite sur le site en ligne.
- Docs : `docs/securite-checklist.md` (CSP), `STATUS.md`.

### D-48 — La démonstration du site avec son portfolio **[décidé]**

Christian (2026-10-14, 16 h 48) : « Importe également le portfolio markdown
correspondant à la cartographie de démonstration, pour qu'on puisse ouvrir les
passages surlignés. Mais ne les inclus pas dans le GitHub. Uploade les sur le
site uniquement. »

- **Le portfolio** : les extraits des 59 journées publiques de la démonstration
  viennent du journal « 300 » d'AuroraCore (51 feuilles, sur le Mac de
  Christian, jamais versionnées). Recomposé dans l'ordre de son index, il
  compte 67 journées datées (titres « ### J.MM.AAAA », dont deux « 1er ») :
  les 59 de la démonstration et 8 jours écrits sans analyse (1er février, 3 au
  9 février).
- **Découpage** : importé tel quel, il aurait laissé l'essentiel de son texte
  « sans date » — le découpage du site (`engine/src/portfolio/segment.js`)
  coupe aussi aux séparateurs (`---`) et ne lit pas « 1er.01.2026 ».
  **[choix d'implémentation]** Le journal est découpé à ses seuls titres
  datés, puis passe par l'export de l'interface (`buildPortfolioMarkdown`),
  dont le Markdown se redécoupe exactement en ces journées : séparateurs
  internes neutralisés (« - - - »), « ## AAAA-MM-JJ » ajouté devant les deux
  journées « 1er » (inutile depuis D-49 : le découpage lit « 1er »). Le texte
  n'est pas retouché autrement.
- **Sur le site, et seulement là** : `data/demo/carto/archive.json`, l'archive
  de l'interface portfolio compris, marquée « démonstration » (67 journées,
  18,4 Mo, 3,3 Mo compressés à l'envoi), construite avec le code même de
  l'interface (import, magasin, archive) sur la VM du Mac et déposée par FTP,
  hors du manifeste du front : un déploiement ne l'efface pas. « Explorer la
  démonstration » l'ouvre (D-28) ; sans elle, ce sont les 59 journées
  publiques, sans portfolio. Ni le journal ni l'archive ne sont dans le dépôt ;
  les copies de travail ont été effacées.
- **Vérifié** : sur les 2 392 traces, par le chemin même du lecteur (Markdown
  rendu, texte affiché), 2 329 passages retrouvés tels quels (97,4 %), 55 en
  partie, 2 dans la feuille d'un autre jour, 1 approché, 5 introuvables. En
  ligne (Chromium) : démonstration ouverte en 4 s, heatmap au volume écrit,
  passage surligné dans le lecteur.
- **Constaté** (rendu, antérieur) : ce texte vient d'un export de Google Docs ;
  ses 2 246 échappements Markdown (`\!`, `\*`, `\-`…) s'affichent tels quels, et
  les 120 séparateurs neutralisés comme des puces : le petit moteur Markdown du
  site (`web/src/lib/md.js`) ne connaît ni les échappements ni les traits
  horizontaux. Question 31, faite en D-49.
- **À refaire** si la démonstration change : dans l'interface, importer les
  journées et le portfolio, puis exporter l'archive portfolio compris et la
  déposer à la même adresse ; pour ce journal, découper d'abord aux titres
  datés, comme ci-dessus.
- Docs : guide du visiteur (chapitre 2 : portfolio consultable, heatmap au
  volume écrit).

### D-49 — Le portfolio venu de Google Docs, sans symboles parasites (question 31) **[décidé]**

Christian (2026-10-14, 18 h 09) : « Question 31 : oui ! Corrige l'export Google
Docs du journal, les symboles et les lignes de séparation. Puis uploade les
fichiers corrigés sur le site web. »

- **Rendu** (`web/src/lib/md.js`, le moteur Markdown du site : lecteur de
  portfolio, copie autonome, guides, réflexions du jury). Ce que Google Docs
  écrit en exportant un document en Markdown s'affiche comme dans le
  document :
  - **échappements** (règle du CommonMark) : `\!`, `\*`, `\-`, `\#`, `\[`…
    (2 246 dans la démonstration) — le caractère, sans sa barre oblique ; il
    n'ouvre ni gras, ni lien, ni puce, ni titre. Écart assumé : l'échappement
    vaut aussi dans le code inline ;
  - **traits** (CommonMark) : `---`, `- - -`, `***`, `___`, espacés ou non,
    seuls sur leur ligne — un trait (`<hr>`), jamais une puce, aussi dans une
    citation (les 120 séparateurs du journal) ;
  - **[choix d'implémentation]** **sauts de ligne** : une ligne finie par deux
    espaces passe à la ligne (CommonMark ; Google Docs l'écrit pour un retour
    à la ligne dans un paragraphe : listes numérotées, énumérations) ; le
    caractère U+000B, que Google Docs écrit pour un retour à la ligne dans une
    cellule de tableau, aussi — le navigateur l'affichait en petit carré « VT »
    (753 dans la démonstration) ;
  - **[choix d'implémentation]** **images** : jamais chargées (ADR-007, `img`
    interdit), elles s'affichaient en `![][imageN]` (34 dans le journal, dont
    les données ne sont pas dans les feuilles) ; « [image] » à leur place, ou
    « [image : texte] » quand elles en ont un.
  - Ce qui reste visible est dans le journal même : des astérisques et des
    triples accents graves (le 4 mars : du Markdown collé tel quel dans le
    document, que Google Docs a échappé) et 20 barres obliques voulues (dans
    du code, ou écrites telles quelles).
- **Surlignage** : le texte affiché change, pas l'endroit des passages. Un
  extrait du jury recopié du texte brut garde ses barres obliques et ses
  images : `stripMarkdownMarks` (`core/highlight.js`) les traite comme le
  rendu avant de chercher ; un saut de ligne reste un blanc dans le texte
  affiché. Sur les 2 392 traces de la démonstration, par le chemin du
  lecteur : **2 356 passages retrouvés tels quels (98,5 %, contre 97,4 % en
  D-48)**, 28 en partie (55 avant), 2 dans la feuille d'un autre jour,
  1 approché, 5 introuvables — extraits tronqués ou reformulés par l'analyse,
  et un lien Markdown recopié.
- **Découpage** (`engine/src/portfolio/segment.js`) : un titre « 1er.01.2026 »
  ou « ### 1er/02/2026 » ouvre la journée du premier du mois ; « 11er » ou
  « 2er » n'ouvrent rien. Les titres « ## AAAA-MM-JJ » que l'archive de la
  démonstration ajoutait devant ces deux journées (D-48) ne sont plus
  nécessaires.
- **Sur le site seulement, comme en D-48** : archive de la démonstration
  reconstruite avec ce code (67 journées, 18,4 Mo, texte non retouché) et
  redéposée ; front redéployé deux fois (échappements et traits, puis sauts
  de ligne et images), depuis la VM du Mac. **Vérifié en ligne** (Chromium) :
  le 22 décembre, le 1er janvier, le 4 et le 8 mars n'affichent ni barre
  oblique d'échappement, ni carré « VT », ni `![` ; les traits sont des traits,
  les listes numérotées vont à la ligne, les images sont des « [image] », le
  passage est surligné. Copies de travail effacées (journal recomposé,
  archive, outils).
- **Pas fait** (questions 32 et 33) : les tableaux s'affichent encore en
  lignes de barres verticales ; un journal de Google Docs importé tel quel
  dans l'interface se découpe encore à ses traits.
- Docs : commentaire d'en-tête de `lib/md.js` (les chapitres de formation ont
  des tableaux, contrairement à ce qu'il disait).

### D-50 — La comparaison s'ouvre sur janvier face à mars **[décidé]**

Christian (2026-10-14, 21 h 09) : « Par défaut, dans l'onglet comparaison,
comparer janvier et mars. »

- **Par défaut**, tant que la personne n'a choisi ni A ni B : A = **janvier**,
  B = **mars** — deux périodes d'un mois entier, journées cochées seulement,
  nommées « Janvier 2026 » et « Mars 2026 ». Sur la démonstration :
  26 journées analysées face à 19 ; l'avertissement de tailles différentes
  s'affiche, comme pour toute comparaison de tailles inégales.
- **[choix d'implémentation]** L'année est la plus récente où janvier et mars
  ont chacun une journée analysée et cochée ; la date t n'y joue pas. Sans une
  telle année (un portfolio qui commence en avril, par exemple), la
  comparaison par défaut reste celle d'avant : « depuis la dernière
  évaluation », sinon la sélection courante des deux côtés.
- **[choix d'implémentation]** Un préréglage « Janvier et mars », en tête des
  préréglages, y ramène après un autre choix.
- **Corrigé en chemin** : changer de vue (Tableau, Radar…) enregistrait A et B
  tels qu'affichés, ce qui figeait la comparaison par défaut. Seule la vue est
  désormais gardée ; A et B ne le sont qu'une fois choisis (un côté modifié,
  un préréglage). Un navigateur où la comparaison de la démonstration a déjà
  été ouverte, et une vue changée, avant ce déploiement garde l'ancienne
  comparaison : le préréglage « Janvier et mars » la remplace.
- Code : `comparePreset(…, 'january-march')` (`core/compare.js`) ;
  `ComparePanel.jsx` (préréglages, comparaison par défaut, enregistrement).
- **Déployé** (front seul, depuis la VM du Mac) et **vérifié en ligne**
  (Chromium) : la démonstration s'ouvre sur « Janvier 2026 » (26 journées
  analysées) face à « Mars 2026 » (19) ; une vue changée est gardée au
  rechargement, A et B restent janvier et mars.
- Docs : guides de l'apprenant (chapitre 7) et du visiteur (chapitre 2).

### D-51 — La comparaison s'ouvre sur le début du portfolio face à sa fin **[décidé]**

Christian (2026-10-14, 21 h 45, rectification de D-50) : « C'est juste pour la
version de démonstration que j'aimerai afficher ces deux périodes pour avoir
quelque chose à comparer qui ne soit pas 66 journées vs 67. Pour un cas
général (puisque c'est ce que tu as fait finalement), alors diviser le nombre
de journées en deux pour comparer le début du portfolio avec la fin et
ajouter un bouton avant "Depuis la dernière évaluation" de manière à pouvoir
rapidement revenir à cette configuration. Et du coup, applique ce cas général
à la place de comparer janvier et mars. »

- **Remplace D-50.** Par défaut, tant que la personne n'a choisi ni A ni B :
  les journées analysées et cochées, coupées en deux dans l'ordre du temps —
  A, « Première moitié », du premier au dernier jour de la moitié ; B,
  « Seconde moitié ». Deux périodes, journées cochées seulement ; la date t
  n'y joue pas. Sur la démonstration : du 22 décembre au 30 janvier
  (30 journées analysées) face au 31 janvier – 29 mars (29).
- **[choix d'implémentation]** Le compte porte sur les journées **analysées**
  (celles que la comparaison compare) ; impair, A prend la journée de plus,
  et l'avertissement de tailles différentes le dit. Moins de deux journées
  analysées : la sélection courante des deux côtés, comme avant.
- Préréglage « Première et seconde moitié », placé avant « Depuis la dernière
  évaluation » ; « Janvier et mars » est retiré. Ce que D-50 avait corrigé
  reste : changer de vue ne fige pas A et B.
- Docs : guides de l'apprenant (chapitre 7) et du visiteur (chapitre 2).

### D-52 — En-tête allégé : réinitialiser, sans doublons ni « mode expert » **[décidé]**

Christian (2026-10-14, 21 h 45, « Diminution de la charge cognitive
extrinsèque de l'interface ») : « Ajouter un bouton "reset" de l'interface
dans le header. Le carto-context-actions est redondant avec les boutons dans
la nav carto-space : à supprimer. La check box "mode expert" semble ne rien
modifier visuellement. On peut la supprimer également. La hauteur du
carto-sun-caption doit être constant et permettre de toujours afficher deux
lignes. »

- **« Réinitialiser l'affichage »**, dans l'en-tête de l'espace Cartographie,
  en deux temps (« Revenir à la vue de départ ») : les tuiles de départ
  (D-53), plus de sélection, de pôle ouvert, de date t ni de filtre du jour ;
  les tuiles sont remontées (recherche, regroupements). **[choix
  d'implémentation]** Les données ne bougent pas : journées cochées,
  étiquettes, ensembles, préférences du jeu (motifs renforcés, réglages de
  l'encodage, calendrier de la heatmap).
- **Retirés** : « Comparer A / B » et « Exporter » (les espaces Comparaison
  et Export), et la case « mode expert ».
- **« Mode expert » modifiait bien quelque chose**, hors de la vue : sous le
  panneau de détail, les **réglages de l'encodage** — α, le poids d'un indice,
  et l'épaisseur minimale d'un secteur. α doit rester réglable (question 1).
  **[proposition appliquée, réversible]** La case disparaît ; les réglages
  deviennent une tuile, « Réglages de l'encodage », masquée au départ (D-53).
- **[choix d'implémentation]** La date t ne s'affiche dans l'en-tête que
  fixée, avec « revenir à l'état complet » (qui retire aussi le filtre du
  jour) ; sans elle, la légende du soleil dit déjà « État complet des
  journées cochées ».
- **Légende sous le soleil** (`carto-sun-caption`) : hauteur constante de
  deux lignes — un titre et une phrase, une ligne chacun ; une phrase seule,
  deux lignes au plus ; au-delà, points de suspension (le texte entier reste
  lu par les lecteurs d'écran). Vérifié dans Chromium : même hauteur,
  survolée ou non, égale à deux lignes. Vaut pour tous les soleils (journée,
  comparaison, version partagée).

### D-53 — La cartographie en tuiles **[décidé]**

Christian (2026-10-14, 21 h 45, « Amélioration de l'UX ») : « Le tableau de
bord a un système de gestion des div (ou tuiles) sur une grille que je trouve
excellent. Je souhaite la même souplesse d'interface pour l'onglet
cartographie. […] Par défaut, prévoir une vue minimaliste avec juste le
carto-sun avec dessous le carto-detail, tous deux en pleine largeur. La div
carto-col doit d'ailleurs ne plus être limitée en largeur et utiliser tout
l'espace disponible. Tout le reste masqué […], y compris les date de la
période dans le header (et le compteur de nombre de journées cochées), qu'il
faudrait du coup déplacer dans la tuile "Journées". Les choix de
customisation de l'interface doivent être stockée dans la mémoire du
navigateur. »

- **Douze tuiles**, sur la grille du tableau de bord (`TileGrid`, V3) :
  Soleil, Détail, Journées, Compétences, Heatmap et lecture (la tête de
  lecture avec la heatmap), Légende (avec « distinctions renforcées »),
  Tableau équivalent, Importer, Étiquettes, Ensembles nommés, Jeux de données
  (avec le nom du jeu), Réglages de l'encodage. Chacune se déplace (poignée ⠿,
  ou ◀ ▶ au clavier), se redimensionne (coin ◢, ou menu de taille ; tailles
  ajoutées : pleine largeur ×3 et ×4) et se masque (✕).
- **Vue de départ** : le soleil et, dessous, le détail, en pleine largeur.
  L'espace Cartographie prend toute la largeur de la page (plus de borne à
  1 600 px ni de colonnes) ; le soleil s'ajuste à sa tuile, haute de 2 à
  4 rangées selon la hauteur de l'écran (fenêtre de 1 400 × 950 px : dessin de
  1 310 × 623 px, contre 560 px de large au plus avant).
- **Menu « Panneaux »** dans l'en-tête : une case par tuile ; une tuile
  affichée se place à la suite des autres. La période et le compteur de
  journées cochées sont dans la tuile Journées.
- **Gardée dans ce navigateur** (`localStorage`, `humanome-carto-tiles`) :
  tuiles affichées, ordre, tailles — une disposition pour tous les jeux de
  données, jamais dans le jeu ni dans une archive ; illisible ou stockage
  bloqué (copie ouverte depuis le disque) : la vue de départ.
- **[choix d'implémentation]** Après un import (sauf la démonstration), le
  rapport s'ouvre : dans la tuile Importer si elle est affichée, sinon en
  bandeau au-dessus des tuiles ; un seul état pour toute l'interface (fermé
  dans le Gestionnaire, il ne revient pas). Le compteur d'anomalies de la
  tuile Journées le rouvre.
- **[choix d'implémentation]** Les onglets « Diagramme / Détails / Journées »
  des écrans étroits disparaissent : sur un téléphone, les tuiles s'empilent
  sur une colonne (vérifié à 390 px : menu « Panneaux » ouvert vers la
  droite, dans l'écran). Une copie autonome n'a ni « Importer » ni « Jeux de
  données ».
- **Accessibilité** : chaque tuile est une région nommée ; une tuile masquée
  donne le focus à « Panneaux » ; « Réinitialiser » le donne à « Annuler »,
  puis le rend au bouton (tous les boutons en deux temps) ; ◀ ▶ gardent le
  focus sur la tuile déplacée (défaut antérieur de la grille, corrigé aussi au
  tableau de bord) ; tuile masquée, l'équivalent textuel du soleil reste dans
  la page, hors de la vue, pour les lecteurs d'écran et l'impression.
- Le gestionnaire est découpé en sections réutilisables (`Manager.jsx`) ;
  l'espace Gestionnaire garde sa mise en page.
- **Relecture indépendante** (agent distinct, avant la fusion) : six points,
  tous corrigés — un rapport d'import fermé dans le Gestionnaire revenait en
  bandeau ; l'équivalent textuel du soleil n'était plus dans la page ni
  imprimé par défaut ; « revenir à l'état complet » laissait les contours du
  jour choisi ; focus perdu (✕, réinitialisation, ◀ ▶) ; marge du détail
  collée à sa bordure ; trois tests qui ne vérifiaient pas tout ce qu'ils
  annonçaient.
- Docs : guides du visiteur (chapitre 2), de l'apprenant et du cartographe
  (chapitre 7), aide de la cartographie.

### D-54 — Le Markdown rendu comme à l'impression : tableaux, encadrés, listes (question 32) **[décidé]**

Christian (2026-10-15, 0 h 59) : « Les tableaux qui ne sont pas rendus.
Quelles sont les 13 journées de la démonstration et les 9 chapitres de
formation concernés ? Ok pour les rendre en vrais tableaux. Idem pour faire un
encadré autour des tableaux d'une seule case. Mais la question plus générale
est de savoir si on affiche du Markdown brut comme si c'était du code, ou si
on lui applique les styles correspondant au rendu imprimable. […] Pour moi,
être capable de surligner les passages est plus important que le rendu. Mais
s'il existe un librairie javascript + CSS capable de faire un rendu plus
élégant tout en conservant le surlignage, alors je veux bien qu'elle soit
utilisée. »

- **Les tableaux** : dans la démonstration, 37 tableaux sur 13 journées —
  27 vrais tableaux (2, 3 et 7 janvier, dont 19 ce jour-là ; 13 et 14 mars)
  et 10 tableaux d'une seule case, que Google Docs écrit pour un encadré
  (28 et 30 décembre ; 23 et 30 janvier ; 3 et 10 février ; 4 et 29 mars).
  Dans la formation, 12 tableaux sur 9 chapitres : administrateur 2,
  apprenant 1, cartographe 2, employeur 1 et 2, promptologue 1 à 4.
- **Le Markdown n'était déjà pas montré comme du code** : titres, gras,
  italique, listes à puces, citations, liens et traits étaient mis en forme.
  Restaient à l'état brut les tableaux, les listes numérotées (des lignes de
  texte), les listes imbriquées (aplaties) et les blocs de code ; et le petit
  moteur maison lisait mal les gras sur plusieurs lignes ou imbriqués.
- **Bibliothèque** : **marked** 18.0.14 (CommonMark et tableaux GFM),
  13,5 Ko compressés, +2 % du site. markdown-it 15 rend la même chose pour
  41 Ko ; il n'y a pas de bibliothèque qui surligne à notre place : le
  surlignage reste le nôtre, il lit le texte affiché. La feuille de style est
  la nôtre aussi (`web/src/styles/markdown.css`, et la typographie du lecteur
  dans `carto.css`), aux couleurs du site, thèmes clair et sombre : tableaux
  à filets fins et en-tête sur fond discret, encadré à cadre fin, titres
  gradués, listes en retrait, code sur fond discret.
- **Surlignage inchangé, mesuré** : sur la démonstration, par le chemin du
  lecteur, l'issue de **chacune des 2 392 traces est la même avant et
  après**, une à une (2 356 passages retrouvés tels quels, 28 en partie, 2
  dans la feuille d'un autre jour, 1 approché, 5 introuvables). Dans un
  tableau rendu, deux cases sont séparées par un blanc dans le texte
  affiché ; un extrait recopié avec ses « | » est cherché sans elles en
  dernier recours (une barre peut aussi être du texte : « P(A | B) ») ; le
  surlignage se pose case par case.
- **Ce qui change à l'écran, sur la démonstration** : 27 tableaux,
  10 encadrés, 9 listes numérotées (38 éléments), les listes imbriquées ;
  barres verticales visibles : de 586 à 20 (du texte) ; le code collé le
  30 janvier s'affiche tel qu'écrit, astérisques compris (l'ancien moteur en
  faisait du gras) ; quatre titres vides ne montrent plus « ### ».
- **Réglages**, pour qu'un journal s'affiche comme son document et que rien
  de ce qui y est écrit ne disparaisse (`web/src/lib/md.js`) :
  - tableau : alignement des colonnes en classes (l'attribut `style` est
    interdit par l'assainissement) ; une ligne qui a plus de cases que
    l'en-tête garde le surplus dans sa dernière case (marked le jetterait :
    Google Docs n'échappe pas les « | ») ; défilement horizontal sur un écran
    étroit plutôt qu'un mot coupé ;
  - **encadré** : un tableau d'une seule case et sans autre ligne ; ses blancs
    sont gardés (le code de deux encadrés de la démonstration garde son
    retrait), son alignement aussi (centré le 28 décembre) ;
  - liste numérotée : le numéro écrit est celui affiché ;
  - **[choix d'implémentation]** écarts assumés au CommonMark, pour des
    journaux : un trait sous une ligne reste un trait (pas de titre
    « souligné ») ; un retrait n'est pas du code ; un bloc ``` ou ~~~ n'en est
    un que refermé ; le HTML écrit reste du texte ; seul `[texte](url)` fait
    un lien ; « [nom]: valeur » reste du texte (seules les données d'image de
    Google Docs sont cachées) ; barré : `~~texte~~` seulement ; échappements
    aussi dans le code inline (D-49) ;
  - **[choix d'implémentation]** un gras fermé après un blanc
    (« **texte **suite » ; deux fois le 13 mars, avec une espace fine) ou
    ouvert avant reste du gras : Google Docs l'écrit ainsi quand le blanc
    voisin est en gras ; le blanc passe hors des astérisques, hors code. Pas
    pour l'italique seul : essayé, il prenait la fermeture d'une citation en
    italique (« *"…"*, puis … *mot* ») pour une ouverture ;
  - images, U+000B, cases de tâches : comme en D-49 (« [image] », saut de
    ligne, « [ ] » écrit).
- **Formation** : 12 tableaux rendus ; 9 chapitres perdent leurs astérisques
  parasites (gras sur plusieurs lignes, gras et italique croisés que l'ancien
  moteur appariait mal) ; « &lt;id&gt; » affichait ses entités : il affiche
  `<id>`. Un « **n'**atteste » (gras fermé sur une apostrophe devant une
  lettre, que le CommonMark ne ferme pas) devient « **n'atteste pas** »
  (employeur, chapitre 3).
- **Relecture indépendante** (agent distinct) : 13 points ; corrigés — cases
  en trop jetées, définitions « [nom]: valeur » qui cachaient une ligne,
  bloc de code jamais refermé qui avalait la journée, barré d'un seul tilde,
  numéros de liste récrits par le navigateur, gras à blanc d'un seul côté,
  détection du code dans cette réparation, mot coupé dans un tableau sur
  téléphone, journée scindée juste avant un trait dont le début disparaissait
  (lu comme un front-matter), recherche répétée à l'identique, version de
  marked non figée, titre d'un lien réécrit perdu, rendu lent sur des « ![ »
  répétés ; un test qui ne prouvait pas qu'il passait par le retrait des
  barres. **[choix d'implémentation]** Un fichier exporté avant D-55 (voir
  ci-dessous) n'est pas reconnu comme tel.
- **Rapidité** : un journal de 400 Ko se rend en 0,4 s. Un paragraphe
  pathologique (100 Ko d'astérisques et d'accents graves alternés, sans ligne
  vide) prend une vingtaine de secondes, dans marked même : aucun texte réel
  n'en approche, et il ne ralentit que le navigateur qui l'affiche.
- Code : `web/src/lib/md.js` (marked, réglages), `core/highlight.js`
  (`stripTableMarks`, `locateRendered`), `ui/highlight-dom.js` (un `<br>`
  sépare deux lignes dans le texte affiché ; un portfolio n'a pas de
  front-matter), `web/src/styles/markdown.css`, `carto.css` (lecteur).
- Docs : guides de l'apprenant (chapitre 7) et du visiteur (chapitre 2).

### D-55 — Un trait reste dans sa journée (question 33) **[décidé]**

Christian (2026-10-15, 0 h 59) : « Un journal de Google Docs importé **tel
quel** dans l'interface se découpe encore à chacun de ses traits (`---`), qui
ouvrent une partie sans date. Les remplacer par des balises <hr> de sorte que
dans un texte qui a des titres datés, un trait ne coupe plus — il reste un
trait dans sa journée. »

- **[choix d'implémentation]** Le trait reste `---` dans le texte, qu'on ne
  retouche pas, et s'affiche en `<hr>`, comme depuis D-49 : c'est le
  découpage qui change. Écrire la balise `<hr>` dans le texte l'aurait
  affichée en toutes lettres (le HTML écrit dans un texte reste du texte,
  ADR-007).
- **Règle** (`engine/src/portfolio/segment.js`, le même découpage partout :
  import de l'interface, module Portfolio, export) : un séparateur (`---`,
  `***`, `___`, `===`) ne coupe qu'avant le premier titre daté ; après, il
  reste un trait dans sa journée. Un texte sans aucun titre daté coupe à
  chaque trait, comme avant.
- **Vérifié sur la démonstration** : le journal reconstitué (ses 67 journées
  bout à bout, traits rétablis) se découpait en 187 parties, dont 120 sans
  date portant 99,6 % du texte ; il se découpe désormais en ses **67
  journées**, mêmes dates, mêmes textes. L'archive de la démonstration n'a
  rien à refaire : ses traits, espacés depuis D-48 (« - - - »), s'affichent
  pareil.
- **Export du portfolio** (question 20) : les journées gardent leurs traits
  tels quels (plus de « - - - ») ; **les passages sans date passent en tête
  du fichier**, chacun après un trait `***` — avant le premier titre daté, un
  trait coupe encore — leurs propres traits espacés et leurs dates seules
  précédées d'un « — ». Réexporté, le fichier ne change plus.
  **[choix d'implémentation]** Un fichier exporté avant ce déploiement
  (format du 14 octobre, passages sans date à la fin) : réimporté, ces
  passages se rattachent à la dernière journée, à re-scinder dans le
  gestionnaire ; un dialogue versé qu'il contient n'est pas doublé.
- Docs : cas d'utilisation UC-APP-01 (règle RG5 bis), guide de l'apprenant
  (chapitre 7).
- **Déployé** (front seul, depuis la VM du Mac, D-54 et D-55 ensemble) et
  **vérifié en ligne** (Chromium) : la démonstration s'ouvre, une trace est
  surlignée en jaune ; le 7 janvier, 19 tableaux et 2 listes numérotées, plus
  aucune barre verticale ni carré « VT » ; le 28 décembre, l'encadré centré ;
  le 10 février, le code de l'encadré garde son retrait ; le 13 mars,
  2 tableaux. Aucune erreur dans la page. Copies de travail effacées (archive,
  scripts, paquets).

### D-56 — Le lecteur de portfolio, épuré **[décidé]**

Christian (2026-10-15, 8 h 11), point 1 : « Dans le lecteur de portfolio,
remonter les boutons "Trace précédente", "Trace suivante" et les laisser en
sticky autour du titre du jour […]. On peut les remplacer par deux triangles
blanc […]. Le bouton "Retour à la compétence" est redondant avec le bouton
"Fermer le lecteur" : à supprimer. […] A ce niveau, le lecteur ne cherche pas à
lire le portfolio, mais à voir les traces qui on permis l'évaluation. Nous
pouvons supprimer les boutons "Jour précédent", "Jour suivant" […].
L'Extrait cité par le jury ne doit être affiché que si l'extrait n'est pas
trouvé dans le texte surligné : sinon c'est redondant. […] N'afficher
carto-reader-legend uniquement lorsque c'est nécessaire. » Point 3 : « Avoir
uniquement ce dont l'utilisateur a besoin de voir, au moment où il en a
besoin. […] adopter la posture d'un ergonome, spécialiste en psychologie
cognitive, pour ne pas surcharger l'affichage d'informations non
indispensables. »

- **En tête, fixe au défilement** : la journée affichée, entre deux triangles
  « blancs » (contour seul, comme ◁ et ▷, dessinés en SVG pour être les
  mêmes partout) — trace précédente, trace suivante, aussi ← et → — puis la
  fermeture. Les triangles ne bougent pas d'une trace à l'autre (le titre
  prend la place qui reste) ; arrivés au bout, ils s'éteignent sans perdre le
  focus du clavier. **[choix d'implémentation]** La fermeture est une croix
  (« Fermer le lecteur » pour les lecteurs d'écran, Échap au clavier), celle
  des tuiles : avec le libellé, la date et ses triangles ne tenaient pas sur
  une ligne de téléphone.
- **Dessous, ce qui défile** : la compétence, puis « trace 2 sur 34, indice »
  — et « datée du … » seulement quand la journée lue n'est pas celle de la
  trace (le décalage de date de l'analyse, qui avait son lien « Lire la
  journée de la trace ») ; l'extrait du jury **seulement s'il n'est pas
  retrouvé tel quel** (un bout seul, approché, introuvable, pas de texte ce
  jour-là, pas de portfolio), sa légende disant pourquoi en une phrase et ce
  que veulent dire l'orange ou les pointillés ; puis le texte de la journée.
  Retrouvé, l'extrait se lit surligné : il n'est plus cité deux fois.
- **Retirés** : le surtitre « Lecteur de portfolio », « Retour à la
  compétence », jour précédent / suivant et « Revenir au passage », la ligne
  d'état visible, la légende des couleurs à chaque trace (elle ne paraît que
  pour un bout orange à côté d'un passage retrouvé, seul cas que rien
  d'autre n'explique).
- **Lecteurs d'écran** : une zone d'état invisible dit la trace, la journée
  et le résultat (« Trace 2 sur 34, samedi 3 janvier 2026 : passage
  surligné. »).
- Le surlignage ne s'affiche qu'une fois la recherche terminée — plus
  d'aller-retour d'une journée à l'autre ; pendant la recherche dans les
  autres journées, une ligne discrète le dit.
- **La même posture ailleurs**, dans ce qui a été touché : les réglages de
  l'encodage (« Valeurs par défaut » seulement quand un réglage s'en écarte,
  plus de note sur les points ouverts de la spécification), la légende de la
  heatmap (seulement ce que la période contient), le calendrier (rien à régler
  en « Tout voir »), le nom des pôles (écrit seulement s'il tient). D'autres
  allégements sont proposés plutôt que faits : questions 35 et 36.

### D-57 — Une démonstration intacte se met à jour d'elle-même **[décidé]**

Christian (2026-10-15, 8 h 11), point 2 : « sur smartphone : l'interface
indique ne pas trouver le fichier markdown alors que sur ordinateur je peux
voir qu'il s'affiche bien. » Puis : « tout fonctionne bien avec Mozilla sous
Android, ce n'est que Chrome sous Android qui a ce problème et qui affiche le
message d'erreur "Aucun portfolio importé […]". »

- **Cause** (reproduite en émulation Pixel 7 sur le site en ligne) : un
  navigateur qui avait ouvert la démonstration avant le dépôt de son archive
  avec portfolio (D-48) garde sa première copie, sans portfolio, dans sa base
  locale ; Firefox, qui n'en avait pas, charge l'archive.
- **Correction** : la démonstration en place s'affiche aussitôt ; en
  arrière-plan, une requête HEAD (4 s au plus) lit la version déposée (son
  en-tête Last-Modified) ; différente de celle d'où vient la copie, l'archive
  est téléchargée (2 min au plus, arrêtée si la page se ferme) et importée
  dans un nouveau jeu, qui remplace l'ancien — à l'écran aussi s'il y était —
  **seulement si l'ancien est toujours intact**, relu juste avant (en mémoire
  ici, puis dans la base : un autre onglet a pu y toucher) ; sinon c'est la
  copie neuve qui s'en va.
- **Garde-fous** (relecture indépendante) : une version qui n'a pas pu être
  chargée n'est retentée qu'un jour plus tard, jamais à chaque visite ; une
  copie à jour déjà dans la base est reprise plutôt que retéléchargée ;
  « intacte » se mesure à ce que l'archive apportait d'elle-même (une archive
  déposée peut contenir des ensembles ou des repères) ; un enregistrement
  différé ne recrée jamais un jeu supprimé ou remplacé dans un autre onglet
  (il le dit), et n'écrit que ce qui a changé ici.
- « Explorer la démonstration », quand l'archive est déposée mais que son
  téléchargement échoue : les journées publiques, et un message dit pourquoi
  les passages ne se surlignent pas. Dans le lecteur, une démonstration sans
  son portfolio dit de recharger la page (elle n'a pas de fichier à importer).
- **[choix d'implémentation]** La version est l'en-tête Last-Modified (OVH le
  donne) ; sans lui, rien ne change. Le premier lancement après ce
  déploiement retélécharge une fois la démonstration de chaque navigateur qui
  l'avait déjà (sa copie n'a pas de version) : environ 18 Mo, compressés à
  l'envoi.

### D-58 — L'anneau des pôles, élément d'interface réglable **[décidé]**

Christian (2026-10-15, 8 h 11), point 4 : « La taille du rayon de l'anneau
intérieur des sept domaines de compétence de la cartographie, va devenir
paramétrable. Le paramètre sera inclus dans le panneau "Régalges de
l'encodage", entre "Poids de l'ince alpha" et "Épaisseur minimale d'un
secteur". Par défaut, utilise 20% du rayon total, de manière a pouvoir
visualiser d'avantage les variations au niveau des feuilles représentant les
compétences. » Point 5 : « Supprime le calcul de la hauteur de cet anneau
intérieur et utilise pour chacun des sept domaines de compétence, 100% de
l'espace disponible. Ils deviennent un élément d'interface et plus un élément
de mesure. » Précisé (question 34) : « un rayon égal à celui du centre du
soleil : donc 30+30px = 60px. En paramètre, l'utilisateur doit pouvoir changer
le rayon pour aller de 0px (donc 30+0px : on n'affiche plus l'anneau central)
à 160px (donc 30+160px : on n'affiche plus les feuilles de compétences). »

- **Géométrie** (`ringGeometry`, `sunGeometry`) : soleil de 190, centre de
  30 ; anneau des pôles de 30 à 30 + t ; écart de 5 seulement entre deux
  anneaux présents ; compétences jusqu'au bord, de capacité k = 190² − r²
  (une confiance de 1 touche le bord). Par défaut t = 30 : les feuilles vont
  de 65 à 190, soit **125 de hauteur au lieu de 51,5** (2,4 fois plus pour
  lire la confiance). À 0, plus d'anneau : les compétences partent du
  centre ; au-delà de 150, l'écart avalerait les feuilles : l'anneau va
  jusqu'au bord, et le réglage dit « (compétences masquées) ».
- **Pôles pleins** : chaque arc occupe toute la hauteur de l'anneau ; plus de
  cercles de confiance sur lui. La confiance d'un pôle reste dite (survol,
  détail, « Pourquoi cette part ? », qui remplace « Pourquoi cette surface ? »
  pour un pôle) ; la légende dit de l'anneau intérieur qu'il « range, il ne
  mesure rien ». Conséquence : « l'aire d'un pôle égale la somme de celles de
  ses compétences » ne vaut plus (D-6), l'aire d'un pôle n'étant plus dessinée.
- **Noms des pôles** écrits le long de leur arc, à l'endroit en bas comme en
  haut, seulement s'ils y tiennent, au contraste du texte courant (4,5:1) ;
  aucun nom pendant l'ouverture d'un pôle sur 360° (il glisserait d'un bord à
  l'autre).
- **Réglage** « Épaisseur de l'anneau des pôles », de 0 à 160 par pas de 5,
  entre α et l'épaisseur minimale ; « Valeurs par défaut » ramène les trois.
  Il appartient au jeu de données (ses préférences). **[choix
  d'implémentation]** Le rapport imprimable et la version partagée gardent
  l'anneau standard (30) : ce sont des documents pour d'autres, pas
  l'exploration de la personne.

### D-59 — Heatmap : tout voir par défaut, contraste renforcé toujours **[décidé]**

Christian (2026-10-15, 8 h 11), point 6 : « L'intervalle d'affichage par
défaut de la Heatmap devrait être du premier jour au dernier. Pas l'année
scolaire. Du coup prévoir trois boutons au lieu de deux dans la
carto-heatmap-control : tout voir, année scolaire, période libre. La case à
cocher de constraste renforcé peut être supprimée : on applique le constrate
renforcé systématiquement. »

- **Trois boutons** : « Tout voir » (défaut : du premier au dernier jour du
  jeu, cochés ou non, rangés par années scolaires — de décembre à mars, une
  seule bande), « Année scolaire » (avec ses flèches), « Période libre » (dates
  et pinceau). Rien à régler en « Tout voir ».
- **Préférences** : l'ancien défaut (année scolaire sans année choisie)
  s'affiche en « Tout voir » ; choisir « Année scolaire » retient l'année
  affichée — c'est ce qui distingue un choix de l'ancien défaut, sans
  migration des jeux.
- **Contraste renforcé toujours** (les cinq niveaux à 25, 45, 65, 82 et 100 %
  de la teinte) ; la case et sa préférence disparaissent.
- En chemin : un mois entamé moins de deux semaines avant le suivant ne
  superpose plus son nom au sien (« déc. » sur « janv. ») ; le dernier mois a
  la place du sien ; la légende ne dit que ce que la période contient ; le
  pinceau s'arrête avec un changement de calendrier.

### D-60 — Le soleil et la heatmap suivent le thème sombre **[décidé]**

Christian (2026-10-15, 8 h 11), point 7 : « Lorsqu'on bascule en mode
sombre, le carto-sun et la heatmap restent en thème clair. C'est un bug. »

- **Cause** : la surface des visualisations (`--viz-surface`) était claire
  dans les deux thèmes, par choix ancien du site (« le sunburst […] est conçu
  sur fond clair »), et chaque couleur calculée se mélangeait vers le blanc.
- **Correction** : dans l'interface (`.carto-app`), les jetons des
  visualisations passent au sombre avec le site — réglage du système ou choix
  explicite — à l'écran seulement : imprimée, la cartographie reste claire,
  comme le rapport. Chaque couleur calculée existe dans les deux thèmes et
  voyage en propriétés CSS (`--c`, `--c-dark`) : changer de thème ne
  redessine rien.
- **Marches sombres choisies, pas inversées** (skill dataviz) : même teinte,
  luminance OKLCH dans la bande sombre (0,52 à 0,66), au moins 3:1 sur la
  surface sombre (#141d31, celle des cartes). Validées par le script
  `validate_palette` : tout passe, y compris la séparation pour les
  daltoniens entre voisins (pire ΔE 11, entre CŒUR et MAIN, que la seule
  luminance sépare). Une couleur inconnue du référentiel est ramenée dans la
  même bande.

  | Pôle | Clair (référentiel) | Sombre |
  |---|---|---|
  | TÊTE | `#2563eb` | `#2563eb` |
  | CŒUR | `#10b981` | `#03835a` |
  | MAIN | `#ec4899` | `#ed499a` |
  | ÂME | `#8b5cf6` | `#8b5cf6` |
  | RACINES | `#f59e0b` | `#c88007` |
  | CITÉ | `#06b6d4` | `#0b96af` |
  | FLAMBEAU | `#f97316` | `#db6410` |

- La rampe de la heatmap part de la surface du thème (du blanc vers la
  teinte en clair, de la surface sombre vers la teinte en sombre) ; l'anneau
  des pôles se fond un peu dans la surface, plus clair en clair, plus sombre
  en sombre. Les légendes disent « plus la couleur est intense », plus
  « foncée ».
- En chemin : le passage **approché** du lecteur gardait une encre noire sans
  fond — invisible en sombre ; il prend l'encre du texte.
- Constat sur le référentiel (question 37) : en clair, ses couleurs ne
  passent pas ces vérifications — CŒUR et MAIN confondus en deutéranopie
  (ΔE 4,9), quatre couleurs sous 3:1 sur le blanc.

**Déploiement de D-56 à D-60** (front seul, depuis la VM du Mac, les copies
de production du référentiel gardées) : trois fichiers envoyés, l'ancien
paquet retiré ; l'archive de la démonstration, hors du manifeste, intacte.
**Vérifié en ligne** (Chromium) :

- **au bureau**, navigateur neuf :
  - le nouveau paquet est servi ;
  - l'anneau des pôles va de 30 à 60, avec les noms TETE, COEUR, MAIN, AME et FLAMBEAU écrits sur l'arc ;
  - la démonstration est chargée avec sa version ;
  - le lecteur n'a que ses trois boutons, surligne la trace 1 sur 34 sans citer l'extrait, puis la trace suivante ;
  - le calendrier est sur « Tout voir », sans case de contraste ;
  - les trois réglages sont dans l'ordre demandé ;
  - en thème sombre, la surface est #141d31 ;
- **au téléphone** (émulation Pixel 7), le cas de Chrome Android :
  - avec une démonstration ouverte avant le dépôt de son portfolio, le lecteur cite l'extrait et dit de recharger la page ;
  - au rechargement, le soleil s'affiche en 0,6 s, la démonstration est mise à jour en arrière-plan en 1,9 s, et la trace est surlignée ;
- aucune erreur dans les pages ;
- copies de travail effacées : paquet, dossier de déploiement, fichier d'accès.

### D-61 — Commandes des tuiles au survol ; le tableau de bord en panneaux **[décidé]**

Christian (2026-10-15, 11 h 19), réponse à la question 35 : « Ok pour
n'afficher les commandes des tuiles qu'au survol ou au focus de la tuile, sauf
sur écran tactile. Applique la même logique à l'onglet tableau de bord. Prévois
également pour tableau de bord un bouton "Réinitialiser l'affichage" et un
sélecteur de panneau comme pour l'onglet Cartographie avec uniquement "Profil,
Rythme" sélectionnées dans la vue par défaut, les autres non sélectionnées. »

- **Commandes au survol**, dans la Cartographie et le Tableau de bord : avec
  une souris (`hover: hover` et `pointer: fine`), la barre d'une tuile ne
  montre que son titre. La poignée, les flèches, la taille, la croix et le coin
  de redimensionnement paraissent au survol de la tuile, quand le clavier y
  entre (`:focus-visible`) ou pendant le choix d'une taille. Un clic de souris
  sur une commande ne les retient pas : le pointeur parti, elles s'effacent.
  Dans un champ de saisie de la tuile (la recherche des compétences), elles
  restent, puisqu'on y écrit.
- **Sur un écran tactile**, rien ne change : elles restent affichées, à leur
  place. Sur un téléphone, le titre reste entier (sans cela : « Prof » et
  « Ryth » au tableau de bord, à 360 px) : menu de taille étroit, commandes
  serrées ; un titre court partage sa ligne avec elles, un long les fait
  passer à la ligne. Un ordinateur à écran tactile dont le pointeur principal
  est une souris ou un pavé suit la souris : un toucher sur la tuile en fait
  paraître les commandes.
- **[choix d'implémentation]** Les flèches, la taille et la croix se posent
  alors sur la fin de la barre, sur un fondu de sa couleur : rien ne bouge au
  survol, et sans survol le titre a toute la barre, hors la place de la
  poignée — une tuile étroite (« Compétences ») n'est plus coupée par des
  commandes invisibles. Au survol d'une tuile étroite, elles couvrent la fin
  d'un long titre. Elles restent dans l'ordre du clavier et pour les lecteurs
  d'écran.
- **Le tableau de bord en panneaux, comme la Cartographie** : « Panneaux » et
  « Réinitialiser l'affichage » (en deux temps), à la même place, dans
  l'en-tête. Au départ, le profil et le rythme, côte à côte sur un écran
  large (seul affiché, l'un d'eux prend toute la largeur) ; une case par
  carte ; la croix d'une tuile la masque (le focus va à « Panneaux »). Plus de bouton « Masquer » dans les cartes, ni de « Cartes
  masquées » sous la grille. « Réinitialiser » revient au profil et au rythme
  et remet les cartes à zéro (tableau replié, fonctions cognitives toutes
  affichées) ; la sensibilité des moments, une préférence du jeu, reste.
- **Cartes sans données** : elles restent dans « Panneaux », sans case
  active, avec ce qui leur manque (« Sans données : aucun portfolio
  importé. » ; pour les anomalies, « Rien à signaler. ») ; la liste « N cartes
  sans données » sous la grille disparaît. À l'écran, les cartes sont des
  panneaux, comme dans la Cartographie (« Masquer le panneau Profil »).
  Une carte de départ sans données (le rythme sans portfolio) paraît d'elle-même
  quand ses données arrivent.
- **[écart]** La disposition du tableau de bord quitte le jeu de données
  (`dashboardHidden`, `dashboardLayout`) pour le navigateur
  (`humanome-carto-dashboard-tiles`), comme celle de la Cartographie (D-53 ;
  spec §14.4 : une préférence de présentation) : elle vaut pour tous les jeux.
  Les deux anciennes préférences sont retirées à la lecture d'un jeu (master
  v4 : préférences en structure ouverte, schéma inchangé) ; une disposition
  déjà réglée repart de la vue de départ.
- **En chemin** : la carte Profil tient dans ses deux rangées. Large, le radar
  et le reste côte à côte ; étroite, l'un sous l'autre, plus serrés. Elle
  débordait de 50 à 70 px et cachait « Afficher le tableau ».

### D-62 — Le résumé du profil, allégé **[décidé]**

Christian (2026-10-15, 11 h 19), question 36 : « Ok pour retirer du résumé du
profil "Points (total)" et la phrase sur le "court-circuit". »

- La tuile Détail, sans sélection, dit la période, les journées retenues et
  les compétences observées, puis le portrait (kairos). La mention « Hors
  référentiel », qui ne paraît que si une analyse cite un code inconnu, reste.
- Le calcul ne change pas : « Pourquoi cette surface ? » dit toujours les
  points, et la journée seule les compétences non instruites ce jour-là.

### D-63 — Couleurs des pôles en clair, plus sombres pour les daltoniens **[décidé]**

Christian (2026-10-15, 11 h 19), question 37 : « Ok pour des couleurs un cran
plus sombre pour les daltoniens. »

- **Traduites à l'affichage, comme en sombre** (D-60) : le référentiel garde
  ses couleurs (une décision des épistémiarques ; sa version et son empreinte
  ne changent pas), l'interface en montre des marches claires choisies. Le
  soleil, la heatmap, l'anneau des pôles, la comparaison, le tableau de bord,
  la liste, le détail, le lecteur, la journée seule, le partage et le rapport
  imprimable prennent les mêmes. Une couleur inconnue (un autre référentiel)
  est assombrie, même teinte, jusqu'à 3:1 sur le blanc.
- **Deux valeurs diffèrent de la proposition [écart, à confirmer]** :
  RACINES `#c88007` au lieu de `#d97706`, FLAMBEAU `#c2410c` au lieu de
  `#ea580c`. Assombris au même
  niveau, ces deux pôles, non voisins dans le soleil, se seraient confondus
  pour un deutéranope (ΔE 1,6, contre 6,2 avec les couleurs du référentiel).
  RACINES garde ainsi sa teinte (c'est aussi sa marche sombre) et FLAMBEAU
  descend d'un cran de plus : ΔE 10,4 entre eux.

  | Pôle | Référentiel | Clair (affiché) | Sombre (D-60) |
  |---|---|---|---|
  | TÊTE | `#2563eb` | `#2563eb` | `#2563eb` |
  | CŒUR | `#10b981` | `#047857` | `#03835a` |
  | MAIN | `#ec4899` | `#ec4899` | `#ed499a` |
  | ÂME | `#8b5cf6` | `#8b5cf6` | `#8b5cf6` |
  | RACINES | `#f59e0b` | `#c88007` | `#c88007` |
  | CITÉ | `#06b6d4` | `#0891b2` | `#0b96af` |
  | FLAMBEAU | `#f97316` | `#c2410c` | `#db6410` |

- **Validé** par le script `validate_palette` de la skill dataviz, sur le
  blanc. Entre voisins (dans l'ordre du soleil) : séparation pour les
  daltoniens, pire ΔE 10,4 (CŒUR et MAIN : 4,9 avec le référentiel) ; vision
  normale, pire 22,6 ; les sept à 3:1 au moins. Entre toutes les paires,
  seules TÊTE et ÂME, inchangées et jamais voisines, restent proches pour un
  protanope (ΔE 2,3, comme avant).
- Les bordures et marques d'un pôle (détail, liste, journée, lecteur,
  comparaison, partage) prennent aussi, en sombre, la marche sombre (classe
  `carto-pole`) : elles gardaient la couleur du référentiel dans les deux
  thèmes.
- **Hors du périmètre** : les pages Référentiel, « Essayer » et la journée du
  site (`#/jour/…`) gardent les couleurs du référentiel. Si les épistémiarques adoptent ces marches dans une
  prochaine version, l'interface les montrera telles quelles (elles passent
  déjà les vérifications).

**Déploiement de D-61 à D-63** (front seul, depuis la VM du Mac, les copies
de production du référentiel gardées). Deux passes : la seconde après une
correction pour les téléphones, où la barre de chaque tuile passait à la
ligne même pour un titre court. Trois fichiers envoyés chaque fois, l'ancien
paquet retiré ; l'archive de la démonstration, hors du manifeste, intacte.
**Vérifié en ligne** (Chromium) :

- **au bureau**, navigateur neuf :
  - le nouveau paquet est servi ;
  - les commandes du soleil sont effacées sans survol, affichées au survol ;
  - le résumé du profil dit la période, les journées retenues et les compétences observées ;
  - le soleil a les sept couleurs claires attendues ;
  - le tableau de bord montre le profil et le rythme côte à côte, sans débordement, avec « Panneaux 2/8 » (« Fonctions cognitives » sans données, et sa raison) et « Réinitialiser l'affichage » ;
- **au téléphone** (Pixel 7, et écran tactile de 360 px) : commandes affichées, titres entiers, « Soleil » sur la ligne de ses commandes ;
- seules erreurs : le favicon absent (404, sans lien) et `/api/auth/me` sans compte (401) ;
- copies de travail effacées : paquets, dossiers de déploiement, fichier d'accès.

### D-64 — Des palettes au choix, dans « Réglages » **[décidé]**

Christian (2026-10-15, 13 h 28) : « Les couleurs sont un peu moches.
Peut-être qu'on pourrait proposer deux palettes : l'actuelle et une pastel ?
Un paramètre qui pourrait se choisir dans "Reglages de l'encodage" que l'on
pourra renommer "Réglages". Idéalement proposer plusieurs palettes (pas que
deux). »

- **« Réglages »** : la tuile « Réglages de l'encodage » change de nom. Elle
  garde ses curseurs — α, départ de la hauteur (D-65), anneau des pôles,
  épaisseur minimale — et propose la **palette des pôles** : un bouton par
  palette, avec les couleurs des pôles du référentiel dans le thème affiché,
  puis son nom. Dans une tuile assez large, les curseurs et la palette sont
  côte à côte (la tuile s'ouvre sur deux colonnes ; sur une seule, l'un sous
  l'autre, trois rangées). « Valeurs par défaut » ramène tout, la palette
  comprise.
- **Cinq palettes**, toutes dans les familles de teintes du référentiel
  (TÊTE bleu, CŒUR vert, MAIN rose, ÂME violet, RACINES or, CITÉ bleu-vert,
  FLAMBEAU orangé) : la palette change le ton, jamais ce qu'une couleur
  désigne.

  | Palette | Thème | TÊTE | CŒUR | MAIN | ÂME | RACINES | CITÉ | FLAMBEAU |
  |---|---|---|---|---|---|---|---|---|
  | Contrastée (par défaut) | clair | `#2563eb` | `#047857` | `#ec4899` | `#8b5cf6` | `#c88007` | `#0891b2` | `#c2410c` |
  | | sombre | `#2563eb` | `#03835a` | `#ed499a` | `#8b5cf6` | `#c88007` | `#0b96af` | `#db6410` |
  | Vive | clair | `#2084f7` | `#1cd08a` | `#df2781` | `#8b5afe` | `#d7a214` | `#0ca1c4` | `#f5694a` |
  | | sombre | `#0780fb` | `#0eb073` | `#db117d` | `#9180f4` | `#b68f12` | `#1294bb` | `#dd6652` |
  | Pastel | les deux | `#9dbafe` | `#8ee5bf` | `#ea86ae` | `#f1c8fe` | `#efc167` | `#6fd3f2` | `#fe9e85` |
  | Terre | clair | `#5c8ece` | `#377b4c` | `#cb7c97` | `#85579b` | `#b58f25` | `#02859d` | `#b55f42` |
  | | sombre | `#5594e5` | `#2a7d4e` | `#c87a92` | `#8c5caf` | `#a6810e` | `#048aa2` | `#ae5038` |
  | Profonde | clair | `#0454bd` | `#136536` | `#bd377e` | `#692b9c` | `#9d6a17` | `#007a99` | `#8b2b08` |
  | | sombre | `#2b7ee6` | `#288d4c` | `#ef4e99` | `#8e53d6` | `#a56e0b` | `#249dbe` | `#d4765b` |

  Contrastée, ce sont les couleurs d'avant (D-63 en clair, D-60 en sombre).
  Vive est proche des couleurs du référentiel, en plus éclatant. Pastel est
  la même dans les deux thèmes. Terre est faite de tons rompus, Profonde de
  tons denses.
- **Validées** par le script `validate_palette` de la skill dataviz, sur les
  voisins du soleil, bouclage FLAMBEAU → TÊTE compris (pire ΔE pour les
  daltoniens, pire ΔE en vision normale, contraste le plus bas sur la
  surface) :

  | Palette | Clair | Sombre |
  |---|---|---|
  | Contrastée | 10,4 · 22,6 · 3,2:1 | 11,0 · 22,7 · 3,3:1 |
  | Vive | 15,0 · 24,7 · **2,0:1** | 8,1 · 23,6 · 3,5:1 |
  | Pastel | 11,4 · 16,7 · **1,5:1** | 11,4 · 16,7 · 6,8:1 |
  | Terre | 11,8 · 16,6 · 3,0:1 | 10,5 · 15,1 · 3,2:1 |
  | Profonde | 10,9 · 18,6 · 4,7:1 | 11,8 · 20,6 · 3,5:1 |

  Toutes séparent leurs voisins pour les daltoniens (8 au moins) et en vision
  normale (15 au moins). Contrastée, Terre et Profonde atteignent aussi 3:1
  sur la surface dans les deux thèmes, avec la luminance et la saturation de
  la skill. Vive et Pastel, plus claires, restent sous 3:1 en clair : les
  noms des pôles sur l'anneau et le tableau équivalent compensent (le
  « relief » de la skill). Pastel sort, par nature, de la bande de luminance,
  et son violet (ÂME) est un peu moins saturé que le plancher (0,085 contre
  0,10). Le test `colors.test.js` refait ces mesures.
- **[choix d'implémentation]** La palette est une préférence de ce
  navigateur, comme la disposition des tuiles (D-61) : jamais dans le jeu de
  données, elle suit la personne d'un jeu à l'autre. Le rapport imprimé et la
  version partagée (son aperçu dans l'espace Partage compris) gardent la
  palette Contrastée : des documents lus par d'autres, comme l'anneau des
  pôles standard (D-58).
- **Ce qui suit la palette** : le soleil, l'anneau des pôles, la heatmap, la
  comparaison, le tableau de bord, la liste, le détail, le lecteur, la
  journée seule et le partage. Trois garde-fous, pour qu'aucune palette ne
  perde la lecture :
  - la case la plus forte d'une rampe de heatmap atteint 3:1 sur la surface
    (la marche Pastel y est assombrie, dans sa teinte) ;
  - le titre du détail, coloré par son pôle, garde 4,5:1 (`--pole-text` ;
    inchangé avec Contrastée, mêlé davantage à l'encre avec Pastel) ;
  - les hachures d'un renvoi au cartographe sont tracées à l'encre sur une
    couleur trop claire pour des traits blancs (Pastel, Vive ; aussi l'anneau
    d'un pôle tout en renvoi, avec Contrastée).
- **Une couleur inconnue** (un autre référentiel, une couleur retouchée par
  les épistémiarques) : avec Contrastée, comme avant (assombrie jusqu'à 3:1,
  ramenée dans la bande sombre) ; avec les autres, la marche de la couleur du
  référentiel de teinte la plus proche, décalée comme la couleur s'en écarte
  — deux clartés d'une même teinte restent distinctes (relecture).
- **[écart]** Pas de palette « Référentiel » (les couleurs d'origine, un
  temps envisagée) : presque identique à Vive, et CŒUR et MAIN s'y confondent
  pour les daltoniens (ΔE 4,9). Contrastée reste la palette par défaut :
  « l'actuelle » de la demande, et la plus lisible. Changer de défaut est
  une question (38).

### D-65 — La hauteur part d'une confiance réglable, 0,25 par défaut **[décidé]**

Christian (2026-10-15, 13 h 28) : « Le carto-sun a un petit défaut de
logique. Puisqu'une compétences à au minimum la valeur de l'indice alpha,
dans la représentation graphique des moyennes de ces valeurs, nous devrions
supprimer la quantité alpha pour que l'affichage montre davantage les
différences entre les compétences du référentiel. »

- **Analyse, soumise à Christian** : α fait les points, donc l'angle ;
  retrancher α à chaque compétence ne déplace presque pas les angles (chacune
  perd la même quantité). Ce qui écrase les différences, ce sont les
  hauteurs : les confiances moyennes du jury vont de 0,35 à 0,68 (la moitié
  centrale de 0,53 à 0,60), dessinées à partir de 0. Christian a choisi
  « Hauteurs : départ réglable » : un nouveau réglage dans « Réglages », la
  hauteur part d'une confiance de 0 à 0,5, 0,25 par défaut (le premier
  cercle pointillé). α garde son rôle dans les points.
- **Formule** : h = (C − c₀) / (1 − c₀), bornée à [0 ; 1], avec c₀ le
  départ ; r_ext² = r_int² + k·h ; surface = θ·k·h/2. Avec c₀ = 0, on
  retrouve h = C. Le pied d'un secteur vaut c₀, le bord extérieur 1 ; les
  cercles pointillés marquent les confiances au-dessus du départ (0,5, 0,75
  et 1 par défaut).
- **Effet sur la démonstration** : de la confiance la plus basse (0,35) à la
  plus haute (0,68), les hauteurs vont de 27 à 85 px au lieu de 59 à 96 px.
  L'écart passe de 37 à 58 px (× 1,6) et la plus haute est 3,1 fois plus
  haute que la plus basse, contre 1,6.
- **Une confiance au départ ou en dessous** garde un secteur, à l'épaisseur
  minimale, et « Pourquoi cette surface ? » le dit (« sa confiance (0,20) ne
  dépasse pas le départ de la hauteur (0,25) »). L'épaisseur minimale va
  désormais de 1 à 6 px : à 0, ces secteurs auraient disparu (un secteur qui
  a des points ne disparaît jamais, §5.6). Une épaisseur de 0 déjà réglée
  devient 1 px (relecture).
- **Ce qui le dit** : la légende (« de 0,25 au pied du secteur à 1 au bord
  extérieur (à 0,25 ou moins, le secteur garde une épaisseur minimale) » ;
  « Surface : points × hauteur ») ; « Pourquoi cette surface ? » (la
  confiance, la hauteur, la formule de h) ; « Comment lire ce soleil » dans
  la version partagée ; l'aide et les guides (apprenant, cartographe,
  employeur, visiteur).
- **[choix d'implémentation]** Le départ est un réglage du jeu, comme α et
  l'anneau (`preferences.params.heightOrigin`, 0,25 par défaut, ramené dans
  ses bornes et au centième). Le rapport imprimé garde le départ par défaut ;
  la version partagée aussi, et ses lecteurs le voient dès ce déploiement
  (comme l'anneau en D-58) : les données d'une version figée ne changent
  pas, sa lecture suit l'encodage du site.

**Déploiement de D-64 et D-65** (front seul, depuis la VM du Mac, les copies
de production du référentiel gardées) : trois fichiers envoyés, l'ancien
paquet retiré ; l'archive de la démonstration, hors du manifeste, intacte.
**Vérifié en ligne** (Chromium) :

- **au bureau**, navigateur neuf :
  - le nouveau paquet est servi ;
  - CŒUR en `#047857` par défaut, quatre cercles guides (0,5, 0,75, 1 et la base à 0,25) ;
  - « Réglages » : α, départ de la hauteur (confiance 0,25), anneau, épaisseur minimale, puis les cinq palettes, Contrastée cochée ;
  - la légende dit le départ et l'épaisseur minimale en dessous ; « Surface : points × hauteur » ;
  - Pastel recolore le soleil (CŒUR `#8ee5bf`), en clair comme en sombre, et reste au rechargement ;
  - « Pourquoi cette surface ? » d'une compétence : confiance 0,47, hauteur 0,29, formule de h ;
  - « Valeurs par défaut » ramène Contrastée et efface la préférence ;
- **au téléphone** (Pixel 7) : la tuile « Réglages » sur une colonne, trois rangées, tout visible ;
- seules erreurs : le favicon absent (404, sans lien) et `/api/auth/me` sans compte (401) ;
- copies de travail effacées : paquets, dossiers de déploiement, fichier d'accès.

### D-66 — Chaque information une fois **[décidé]**

Christian (2026-10-16, 5 h 30) : « 1) Dans le panneau "Détail" de la
cartographie, la "synthèse complète" reprends mot pour mot ce que l'on vient
juste de lire au dessus. Élimine toutes les redondances d'informations dans
les fichiers construits. 2) Par contre, lorsque j'ai voulu approfondir les
réflexions du juré qui ont conduit à la décision du président pour la
validité d'une trace de compétences, je ne l'ai pas trouvé. » Ses deux
questions (3 et 4) : questions 39 et 40.

- **Constat sur la démonstration** (59 journées, analyse Aurora v3) :
  - la « synthèse complète » du portrait de chaque journée redit ses
    rubriques, phrase à phrase : 59 sur 59 ; le rapport complet d'un pôle
    (jamais affiché : il contient les territoires non visités, D-16) redit
    les siennes 174 fois sur 405 ;
  - panneau d'une compétence : la liste « Journées observées » redisait les
    journées des verdicts ; la ligne d'une journée redisait les chiffres du
    panneau quand la compétence n'en a qu'une ; la conclusion du Pédagogue
    redisait la confiance du verdict (1 937 fois sur 1 937) ; les pièces
    retenues du Greffier redisaient l'extrait de leur trace (environ 2 400) ;
    un verdict AuroraCore, réparti sur les journées de ses traces, redisait à
    chacune le motif et la prescription du président ;
  - panneau d'un pôle : 264 passages saillants sur 3 038 redisaient, le même
    jour, l'extrait d'un territoire dense ;
  - rapport imprimé : le niveau de preuve dit deux fois ; la part de chaque
    pôle et l'état de l'ensemble redits en couverture ; les chiffres d'une
    compétence redits sur sa fiche.
- **La règle** (`core/restatement.js`, fonctions pures) : un texte complet ne
  se garde que pour ce qu'il ajoute à ses rubriques, et ce reste seul
  s'affiche là où le texte s'afficherait (le portrait d'une journée ; le
  rapport complet d'un pôle ne s'affiche jamais, D-16). Une phrase est
  « déjà dite » quand **chacun** de ses mots se retrouve dans les rubriques,
  dans une suite de quatre mots, à la typographie près (guillemets,
  apostrophes, ponctuation, « **Titre.** texte » ou « Titre — texte ») ; ne
  sont pardonnées que les étiquettes d'un extrait cité (« Extrait : »,
  « L'extrait — ») et une coquille (un mot de cinq lettres ou plus, même
  début, deux lettres d'écart au plus, ni nombre ni mot de sens comme
  « jamais » ou « sans » : « errors » pour « erreurs », le 29 janvier). Une
  négation, un nombre, un mot changé, une précision ajoutée font une phrase
  neuve. Les titres en gras et les étiquettes (« Invitations : ») sont des
  titres ; une liste reste une liste ; une phrase ne se coupe pas dans des
  guillemets. Le master V3 n'a pas les invitations en rubrique : sa synthèse,
  qui les contient, est gardée et ses invitations se lisent en puces.
- **À l'écran** :
  - portrait de la journée : ses rubriques, puis « Suite du portrait » ; plus
    de « Synthèse complète » ; ce qu'une synthèse dit de plus s'y lit, sous le
    titre de sa section ;
  - compétence : plus de « Journées observées » (les journées se lisent avec
    leur verdict) ; la ligne d'une journée dit statut, confiance et preuves,
    et le statut seul quand c'est la seule journée et qu'elle a les chiffres
    du panneau ; dépliée, le motif et la prescription seulement ; l'analyse
    dite une fois quand toutes les journées viennent de la même ; le statut
    brut en info-bulle ; la confiance finale du Pédagogue seulement si elle
    diffère de celle du verdict (80 se lit 0,8) ;
  - **réflexions du jury** (point 2) : l'examen du Pédagogue a un niveau de
    moins à déplier (ses trois temps sous leur titre) ; chaque pièce du
    Greffier dit son sort dans le verdict — « retenue comme preuve »,
    « retenue comme indice », « non retenue » —, à côté du raisonnement qui
    les cite par numéro ; l'extrait d'une pièce retenue, lu plus haut dans
    les traces, ne se redit pas (« Son extrait se lit plus haut, parmi les
    traces ») ; une trace sans numéro de pièce (reconstituée depuis des
    compteurs) laisse le sort des autres pièces non dit, plutôt que « non
    retenue » ;
  - AuroraCore : la **décision du président** (verdict argumenté,
    prescription) et les voix se lisent sans rien déplier, en tête des
    verdicts de la compétence ; ce qui y a conduit se déplie au-dessous :
    « Éclairages des voix », « Raisonnement du président » (convergences,
    tensions, analyse réflexive, délibération complète), débat, pièces. Le
    motif et la prescription d'une journée sont ceux du président : dits une
    fois — dans la décision quand la délibération est là, à la journée
    sinon ; dans la modale du jour, au verdict, les voix dans les
    réflexions ;
  - pôle : un passage saillant dont l'extrait est celui d'un territoire dense
    du même jour se lit sous ce territoire, par son seul contexte (« Passage
    saillant : … ») ; un passage qui n'est qu'une partie de l'extrait, qui le
    dépasse ou qui vient d'une autre feuille reste à part, entier, avec son
    lien ; une journée sans rien d'affichable n'ouvre plus de bloc vide ;
  - modale du jour : les traces sans leur date (c'est le jour), le verdict
    sans les chiffres de sa ligne ; une présence établie sans trace retenue
    le dit sur sa ligne (son groupe dit « présence non établie ») ;
  - rapport imprimé : niveau de preuve dit une fois (précautions de lecture) ;
    en couverture, la légende des pôles sans leurs parts et le soleil sans
    légende d'état (le tableau du profil et les faits les disent) ; la fiche
    d'une compétence sans ses chiffres (dans le tableau du profil), ceux de
    sa seule journée non redits ; la décision du président d'abord.
- **Dans les fichiers construits** : à l'import (Aurora v3, master V3) et à la
  relecture d'une archive, un texte complet qui ne fait que redire n'est pas
  gardé (`docs/contrats.md`, décision 10 : une exception au « sans perte »,
  aucun champ renommé). Détails de la démonstration : 17,3 → 16,0 Mo (les 59
  synthèses, 0,34 Mo ; 174 rapports complets, 0,87 Mo).
- **Pas fait, à décider** : un extrait est encore gardé jusqu'à trois fois par
  journée (passages, pièces, traces : 1,6 Mo) ; ne le garder qu'une fois est
  un changement de contrat (question 40).
- Docs : `docs/contrats.md` (décision 10) ; formation du cartographe
  (chapitre 7 : sort des pièces, décision du président d'abord).

**Déploiement de D-66** (depuis la VM du Mac, les copies de production du
référentiel gardées) : front — trois fichiers envoyés, l'ancien paquet
retiré ; **archive de la démonstration** (sur le site seulement, hors du
manifeste) reconstruite sans les textes complets qui ne font que redire —
les 59 synthèses et 174 rapports complets de pôle ; tout le reste identique,
vérifié — : 18,4 → 17,2 Mo, redéposée sous un nom provisoire puis renommée.
**Vérifié en ligne** (Chromium) :

- **au bureau**, navigateur neuf :
  - le nouveau paquet est servi ; la démonstration s'ouvre en 4,7 s ;
  - portrait du 29 mars : ni « Synthèse complète », ni phrase répétée ;
  - 6.01 (une seule journée) : sa ligne dit le statut seul ; 2.01 : 19 journées, chacune avec sa confiance et ses preuves ;
  - réflexions du jury : l'examen du Pédagogue à un niveau ; le sort des cinq pièces ; un seul extrait cité parmi elles (la pièce non retenue), quatre renvois aux traces ;
  - une trace ouverte dans le portfolio, surlignée ;
  - CŒUR : 14 extraits dans le premier rapport, aucun répété, un passage saillant lu sous son territoire ;
- **une démonstration intacte d'avant** (version du 14 octobre) s'est mise à jour d'elle-même, en 3,3 s (D-57) ;
- **au téléphone** (Pixel 7) : aucun défilement horizontal, pièces du Greffier comprises ;
- seules erreurs : le favicon absent (404, sans lien) et `/api/auth/me` sans compte (401) ;
- copies de travail effacées : paquet, dossier de déploiement, archives, fichier d'accès.

### D-67 — La démonstration lue à la demande **[décidé]**

Christian (2026-10-16, 8 h 44) : « Ok pour choix A et choix 1. » Le choix 1
de la question 40 : la démonstration découpée en fichiers statiques, chacun
lu au moment où l'on ouvre ce qu'il contient (le choix A, de la question 39 :
D-68).

- **Un écart avec la proposition, voulu** : elle disait « une journée par
  fichier ». Mesuré sur la démonstration, c'est le mauvais grain : ouvrir une
  compétence lirait toutes ses journées — 19 en moyenne, 45 pour 7.03 —, soit
  6,5 Mo en moyenne (1,3 Mo compressés) et 13,6 Mo au pire ; ouvrir un pôle,
  les 59 journées (16 Mo). Les fichiers sont donc rangés **par ce que l'on
  ouvre** :

  | Fichier | Ce qu'il porte | Nombre | Taille (compressée) |
  |---|---|---|---|
  | `jours/<date>.json` | ce qui ne tient qu'à la journée : portrait kairos, émergences, run | 59 | 10 Ko (4 Ko) |
  | `portfolio/<date>.json` | le texte de la journée | 67 | 6 Ko (3 Ko), 40 Ko au plus |
  | `competences/<code>.json` | les verdicts détaillés d'une compétence, toutes journées : extraits, jury, pièces | 61 | 183 Ko (41 Ko), 359 Ko au plus |
  | `poles/<n>.json` | rapports et passages saillants d'un pôle, toutes journées | 7 | 579 Ko (134 Ko), 737 Ko au plus |
  | `lectures/<clé>.json` | une délibération de run (la seconde lecture, D-68) | 64 | 49 Ko (15 Ko) |

  Chaque information est dans un fichier, un seul : refaite à partir de tous
  les fichiers, chaque journée est celle de l'archive (testé).
- **L'index** (`index.json`, 0,7 Mo, 38 Ko compressés) : le jeu sans ses
  détails — journées, verdicts résumés, référentiel, état, secondes
  lectures — et, sous `remote`, où lire chaque fichier, dans un **dossier de
  version** (`v-` suivi de l'empreinte du contenu). Une nouvelle
  démonstration se dépose, l'index en dernier ; l'ancien dossier peut alors
  se retirer (voir plus bas).
- **Ce que la personne y met à elle** (une réponse au jury, un repère, un
  passage rattaché, une analyse importée) : la démonstration devient alors
  un jeu d'ici — ses fichiers sont copiés dans son navigateur, en
  arrière-plan (comme avant D-67, mais pour elle seule), et elle ne dépend
  plus du site ; un échec (hors ligne, onglet fermé trop tôt) se retente au
  retour du réseau, puis à chaque ouverture. Intacte, elle se met à jour
  d'elle-même (D-57). D'où la règle de dépôt : **l'ancien dossier de
  version se garde tant que la place le permet, puis se retire** —
  l'hébergement gratuit plafonne à 100 Mo, une version en prend 20 (voir le
  déploiement). S'il doit partir avant le dépôt du nouveau, qui ouvre la
  démonstration pendant ce temps la voit sans détails jusqu'à sa mise à
  jour.
- **À l'ouverture**, la démonstration télécharge l'index seul (au lieu de
  l'archive entière : 17,2 Mo, 3,3 Mo compressés). Ensuite, sans sélection,
  le portrait du dernier jour (un fichier) ; une compétence, son fichier ;
  un pôle, le sien ; le lecteur, le texte de la journée (ceux des autres
  journées seulement si le passage n'y est pas) ; une délibération, à
  l'ouverture de son repli ; dans la modale du jour, la compétence qu'on y
  déplie. Chaque fichier est lu une fois par visite ; rien n'est rangé dans
  le navigateur que l'index, tant qu'elle reste intacte (testé). Un fichier qui ne se lit pas ne prive
  pas les autres de ce qu'ils portent : l'erreur le nomme (« introuvable
  sur le site », « site injoignable »), le reste s'affiche, et il est
  redemandé à la prochaine ouverture. Une lecture commencée avant une
  écriture (un import, un passage rattaché) n'est pas rangée : elle portait
  l'ancien index ; la journée se relit avec ce que l'écriture a apporté.
- **Exporter** la démonstration rend une archive complète, sans renvoi au
  site (testé : celle d'origine).
- **Compatibilité** : une archive entière déposée (`archive.json`) se lit
  encore, d'un bloc, si l'index manque ; une démonstration intacte d'avant se
  met à jour d'elle-même, sur la date de l'index (D-57).
- **Sûreté** : un index ne s'ouvre que depuis le site, par « Explorer la
  démonstration » — importé d'un fichier, il est refusé (ses renvois ne
  mèneraient nulle part, ou ailleurs) ; ses fichiers sont lus à côté de lui,
  sur ce site, jamais à une autre adresse ; il n'ouvre qu'un jeu neuf : dans
  un jeu qui a déjà quelque chose (une journée, un passage sans date, une
  synthèse), rien n'en est pris. Une démonstration intacte ne part pas dans
  l'archive de compte, et rien n'est lu pour elle ; enrichie mais le site
  injoignable, elle y est nommée et le reste part.
- **Code** : `core/split.js` (découpage et remontage, fonctions pures) ;
  `core/store.js` (lecture des fichiers) ; `ui/useCartoData.js` et ses
  lecteurs, qui disent chacun ce dont ils ont besoin (une compétence, un
  pôle, la journée, son texte) ; `web/scripts/carto-demo-split.mjs`, qui
  découpe une archive. Schéma : `remote`, ajout 4.x (`docs/contrats.md`,
  décision 11).
- **Non retenus** : (2) la mémoire bornée — une visite ne lit plus que ce
  qu'elle ouvre ; (3) l'extrait gardé une fois, changement de contrat
  (version 5 du master).

### D-68 — La seconde lecture : le jury AuroraCore joint à chaque compétence **[décidé]**

Christian (2026-10-16, 8 h 44) : « Ok pour choix A et choix 1. » Le choix A
de la question 39 : garder les verdicts par journée pour le soleil et
joindre la délibération AuroraCore à chaque compétence, en seconde lecture,
sans effet sur le soleil.

- **À l'import** (`core/import.js`) : un run AuroraCore joint à un jeu qui a
  déjà ses analyses par journée (ou qui en reçoit dans le même lot) devient
  une **seconde lecture**. Il n'ajoute aucune variante aux journées (elles ne
  passent pas « à arbitrer ») ; ses feuilles passent après les autres textes
  du lot, ne donnent que le texte d'une journée du jeu qui n'en a pas et
  n'ajoutent aucune journée ; le compte rendu le dit (« jointe en seconde
  lecture […] ne change pas le soleil »). Seul, il fait le soleil comme
  avant, réparti sur les journées de ses traces. Le même run joint deux
  fois, ou déjà réparti sur les journées : un doublon.
- **Le format** (`readings`, ajout 4.x facultatif — `docs/contrats.md`,
  décision 12) : par lecture, son run, son journal, sa date d'analyse et, par
  compétence, statut, confiance, preuves et indices ; ses délibérations
  restent au niveau du run (`runDetails`, « <run>|<code> » et
  « <run>|pole:<n> »). L'archive l'emporte ; réimportée, rien n'est doublé.
- **À l'écran** — panneau d'une compétence, sous « Verdicts par journée » :
  « Seconde lecture », une ligne par lecture (pour 1.01 : « Jury AuroraCore
  du 19 avril 2026 : présence établie · confiance 0,85 · 3 preuves, 4
  indices »).
  Dépliée :
  - la **décision du président** (verdict argumenté, prescription) et les
    voix, sans rien déplier de plus ;
  - « Traces retenues par ce jury » : une trace qui cite, le même jour, un
    passage déjà listé plus haut ne le redit pas (« Le même passage qu'une
    trace listée plus haut ») ; chacune s'ouvre dans le portfolio ;
  - ce qui a conduit à la décision, replié : éclairages des voix,
    raisonnement du président, débat contradictoire, pièces du Greffier.

  Panneau d'un pôle : le rapport du pôle par ce jury. Une délibération n'est
  lue qu'à l'ouverture de sa ligne (D-67).
- **Sur la démonstration** (journal 300, analyse AuroraCore du 19 avril
  2026) : 57 compétences jugées, 64 délibérations (3,2 Mo, lues à la
  demande) ; journées et variantes identiques, soleil inchangé (vérifié).
  Les deux lectures s'accordent sur 37 présences établies ; pour 15
  compétences établies par les journées, ce jury renvoie au cartographe ;
  pour 4 (2 établies, 2 en renvoi par les journées), il ne les établit pas ;
  la 57ᵉ (3.07) est non établie des deux côtés, hors du soleil. Sur les 180
  traces de ce jury, 50 citent un passage déjà listé plus haut ; dans le
  texte de leur journée, 120 se retrouvent entières, 33 en partie, 4
  approchées ; 12 sont dans la feuille d'un autre jour, 11 introuvables
  telles quelles (l'extrait est alors cité).
- **Limite** : une compétence que seule la seconde lecture établirait
  n'entre ni dans le soleil ni dans la liste (c'est le choix A) : on ne
  l'ouvre pas. Aucune sur la démonstration ; s'il le faut, le panneau du
  pôle pourra la nommer.
- **Pas de seconde lecture** dans la version partagée (elle ne porte que ce
  que la personne choisit) ni dans la modale du jour (elle porte sur une
  journée).
- **Code** : `ui/SecondReading.jsx` ; `core/importers/aurora-core.js` (le
  run rendu aussi en `readings`) ; `core/import.js` ; `core/archive.js` ;
  `ui/PoleReports.jsx`. Docs : formation du cartographe (chapitre 7) et
  guide du visiteur.

**Déploiement de D-67 et D-68** (depuis la VM du Mac, les copies de
production du référentiel gardées) :

- **La démonstration** : l'analyse AuroraCore du journal 300 copiée du Mac,
  sans les feuilles et les copies que l'interface n'emploie pas (421
  fichiers sur 954), jointe à l'archive du site par l'import même de
  l'interface — journées et variantes identiques, archive conforme au
  schéma —, puis découpée (258 fichiers, 19,8 Mo ; l'index, 0,7 Mo) ;
  ouverte comme sur le site puis exportée, c'est l'archive d'origine. Le
  site seulement ; copies de travail effacées.
- **Place sur le serveur** : l'hébergement est l'offre gratuite de 100 Mo ;
  le dépôt s'est arrêté à 191 fichiers sur 258 (« Disk quota exceeded »), à
  75,8 Mo visibles par FTP. Christian (10 h 32) : « Nous manquons de place
  sur le serveur. Que contient le répertoire app ? Peut-on le supprimer ?
  Que pourrais-tu enlever d'autre qui n'est pas utile ? », puis (10 h 34) :
  « Je te propose de faire une sauvegarde locale sur le MacBook de tout ce
  que tu supprimes avant de l'effacer sur le serveur. » `app/` est l'API,
  gardée (question 41). **Sauvegardés sur le Mac**
  (`humanome.xyz/backup-manuel/2026-10-16/`, tailles et empreinte
  vérifiées), **puis effacés** : l'ancienne démonstration d'un bloc
  `archive.json` (17,2 Mo) et la plus ancienne version de l'API, v1.1.0-4
  (3,7 Mo, 667 fichiers, sauvegardée en archive). Après le dépôt : 56,1 Mo
  visibles.
- **Dépôt** : le dossier de version, l'index (sous un nom provisoire, puis
  renommé), le front (trois fichiers, l'ancien paquet retiré) ; puis le
  front une seconde fois, avec la copie d'une démonstration enrichie.
- **Vérifié en ligne** (Chromium) :
  - au bureau, navigateur neuf : la démonstration s'ouvre en 3,0 s sur
    l'index et le portrait du dernier jour ; 1.01 lit son seul fichier ;
    « Seconde lecture » : « Jury AuroraCore du 19 avril 2026 : présence
    établie · confiance 0,85 · 3 preuves, 4 indices » ; dépliée, la
    délibération (un fichier) : la décision du président d'abord, sept
    traces dont trois déjà listées plus haut, puis les replis ; une trace
    ouverte dans le portfolio, surlignée (pas entière dans sa journée : les
    textes des autres journées sont lus) ; le pôle TETE : son fichier, et le
    rapport de la seconde lecture à l'ouverture ;
  - une démonstration chargée avant le dépôt (l'archive entière) s'est mise
    à jour d'elle-même en 3,1 s : lue à la demande, seconde lecture
    visible, plus aucun détail rangé dans le navigateur ;
  - une réponse au jury : la démonstration se copie dans le navigateur en
    3,0 s (259 fichiers, chacun une fois) ; ensuite, plus rien n'est
    demandé au site ;
  - au téléphone (Pixel 7) : aucun défilement horizontal, seconde lecture
    dépliée ;
  - seules erreurs : le favicon absent (404) et `/api/auth/me` sans compte
    (401) ; `api/health` → `v1.1.0-106-gc6a0231`.

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

### Pôle ouvert sur 360° (D-45)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `core/state.test.js` | `layoutPole` : parts 270° / 90° à partir de −90°, mêmes rayons, anneau du pôle entier ; largeur minimale dessinée ; pôle sans trace | +4 |
| `ui/sunTransition.test.js` (nouveau) | départ (chaque secteur à sa place), arrivée (au tour près), mi-chemin (l'arc s'élargit, ceux qui partent s'effacent dessous), nom du pôle qui glisse vers le haut sans quitter l'arc, rotation minimale pour chaque pôle, fermeture (les autres dessous, puis à leur place), passage inversé en cours de route (repart de l'opacité affichée), adoucissement | 8 |
| `ui/PoleZoom.test.jsx` (nouveau) | **application complète** : double-clic sur MAIN → seules 3.01 et 3.02, à 20 % et 80 % du pôle, codes écrits, légende avec le retour ; centre → tous les pôles, sélection gardée ; nouveau double-clic qui referme ; « o », Maj+Entrée, Échap (désélectionne, puis referme), aussi sur le soleil même ; « o » avec Ctrl, Cmd ou Alt sans effet ; boutons du panneau de détail ; compétence d'un autre pôle qui referme, du même pôle qui garde ; date t : le pôle suit l'état cumulé, retour « aux 2 pôles » ; « Pourquoi cette surface ? » : 288,0° (80,0 %) ; mouvement réduit sans passage ; **version partagée** : même geste, au clavier aussi | 11 |
| `ui/CartoApp.test.jsx` | presque un tour : un anneau, jamais un arc aux extrémités confondues | +1 |
| `ui/CompetencyList.test.jsx` (nouveau) | `revealInList` : la boîte défilante de la liste suit la sélection au plus près (dessous, dessus, déjà visible), la colonne aussi ; jamais une boîte qui contient aussi le soleil, jamais la page | 4 |
| `e2e/carto-soleil.e2e.js` (nouveau) | Chromium, vrai double-clic (deux clics, puis le double-clic) : un clic sur un pôle ne fait pas défiler la page ; MAIN s'ouvre, géométrie vérifiée **degré par degré sur le tracé rendu** (anneau sur 360°, 3.01 ≈ 72°, 3.02 ≈ 288°) ; centre → retour ; « o », puis un appui d'Échap qui ne fait **qu'une** chose (vérifié après plus qu'un passage), puis le suivant ; la liste montre la compétence choisie dans le soleil, dans sa colonne, page immobile | +1 |

Suites complètes après D-45 : site 2 285 verts (235 fichiers), moteur 1 071
(+ 17 ignorés), API 1 489 (14 328 assertions), e2e 16 sur 16 dans Chromium.

### Question 31 — portfolio venu de Google Docs (D-49)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `lib/md.test.js` | caractère échappé affiché sans sa barre oblique (`\!`, titre `1\.` en gras, `\<code\>`), qui n'ouvre ni gras, ni lien, ni puce, ni titre ; barre oblique devant une lettre gardée ; traits `---`, `- - -`, `***`, `* * *`, `___`, entre deux puces, dans une citation ; `--` n'en est pas un, une puce reste une puce ; trait gardé par DOMPurify ; deux espaces en fin de ligne et U+000B → `<br>` (paragraphe, cellule, citation, puce), une seule espace rejoint les lignes ; image → « [image] » ou « [image : texte] », `\!` n'ouvre pas d'image, aucune `<img>` | 6 |
| `ui/highlight-dom.test.js` | export de Google Docs rendu : ni barre oblique ni tirets de trait dans le texte affiché, extrait échappé retrouvé en entier ; sauts de ligne et images rendus, extraits (images, cellule) retrouvés en entier | 2 |
| moteur : `portfolio/segment.test.js` | « 1er.01.2026 », « ### 1er/02/2026 », deux journées dans l'ordre ; jamais « 11er » ni « 2er » | 1 |
| démonstration (script temporaire, non versionné) | les 2 392 traces par le chemin du lecteur ; échappements, traits, carrés « VT » et images dans le texte affiché des 67 journées | voir D-49 |

Suites complètes après D-49 : site **2 294 verts** (235 fichiers) — une
exécution sur trois a connu un échec isolé, non reproduit (les deux
suivantes entièrement vertes) ; moteur **1 072 verts** (+ 17 ignorés) ; e2e
Chromium verts : copie autonome (P5), dialogue (P7), soleil (D-45), guides
publics. API inchangée.

### Comparaison par défaut (D-50)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `core/compare.test.js` | « janvier et mars » : l'année la plus récente où les deux mois ont une journée analysée et cochée (2026 plutôt que 2025 ; 2027, sans mars, écartée), mois entiers, noms, journées résolues ; date de référence sans effet ; mars décoché → l'année d'avant ; sans janvier ni mars : indisponible, dit comme tel | +1 |
| `ui/P3.test.jsx` | **application complète** : la comparaison s'ouvre sur « Janvier 2026 » contre « Mars 2026 » (bornes, nombres de journées) ; changer de vue est gardé sans figer A et B ; une autre période pour B est gardée avec A ; « Janvier et mars » y ramène (le test échoue avec l'ancien défaut, et avec l'ancien enregistrement) ; sans janvier ni mars, « depuis la dernière évaluation » reste le défaut | +1 |

Suites complètes après D-50 : site **2 296 verts** (235 fichiers) ; une
exécution précédente, avant la dernière retouche, a vu échouer une fois
`UC-ADM-05-F01` (supervision Twin9, sans lien : il cède sous la charge, déjà
noté plus haut ; seul, 3 fois sur 3 vert). Moteur inchangé. e2e Chromium
verts : copie autonome (P5), dialogue (P7), soleil (D-45), guides publics.

### Deux moitiés, en-tête allégé, tuiles (D-51, D-52, D-53)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `core/compare.test.js` | « première et seconde moitié » : journées analysées et cochées coupées en deux dans l'ordre, A prend la journée de plus, noms et bornes ; moitiés disjointes (tailles signalées, jamais de recouvrement) ; date de référence sans effet ; journée décochée sortie du compte ; une seule journée : indisponible, dit comme tel | réécrit |
| `ui/P3.test.jsx` | **application complète** : la comparaison s'ouvre sur les deux moitiés (bornes, nombres, aucun avertissement pour deux moitiés égales) ; bouton placé avant « Depuis la dernière évaluation » ; changer de vue ne fige pas A et B ; le préréglage y ramène. Le critère P3 (tailles, recouvrement) passe par « Depuis la dernière évaluation » | réécrit, +0 |
| `ui/tiles.test.js` (nouveau) | disposition de départ ; tailles par défaut (soleil de 2 à 4 rangées selon l'écran, pleine largeur) ; afficher (à la suite), masquer (garde sa place) ; ordre rendu par la grille, masquées à la suite ; stockage : relu à l'identique ; absent, illisible, autre version, bloqué → départ ; nettoyage des tuiles inconnues et des tailles | 7 |
| `ui/Tiles.test.jsx` (nouveau) | **application complète** : vue de départ (soleil et détail, toute la largeur de la grille) ; en-tête sans période, compteur, doublons ni « mode expert » ; « Panneaux » (afficher, à la suite, ✕, tout masquer) ; période et compteur dans Journées ; réglages de l'encodage (α enregistré) et légende (motifs renforcés) en tuiles ; disposition gardée (ordre, taille) au rechargement ; « Réinitialiser » en deux temps (tuiles, sélection, date t) ; date t dans l'en-tête seulement fixée ; **relecture** : équivalent textuel toujours là une seule fois, contours du jour retirés avec la date t, focus (✕, réinitialiser, ◀ ▶), rapport fermé dans le Gestionnaire qui ne revient pas (le test échoue sans la correction) | 11 |
| `ui/P5.test.jsx` | copie autonome : ni « Importer » ni « Jeux de données » parmi les panneaux, même si la disposition gardée les affiche | +1, 1 renforcé |
| `ui/CompetencyList.test.jsx` | la liste suit la sélection dans sa tuile, jamais au-delà (grille, page) | réécrits |
| `CartoApp`, `P2`, `PoleZoom`, UC-VIS-01 (fonctionnels) | sélecteurs des tuiles ; toutes les tuiles affichées pour les tests qui manipulent liste et heatmap ; UC-VIS-01-F16 : le rapport s'ouvre de lui-même après l'import | mis à jour |
| `e2e/carto-soleil.e2e.js` | la légende du soleil garde sa hauteur de deux lignes au survol ; la liste, affichée par « Panneaux », suit la sélection dans sa tuile, page et soleil immobiles ; disposition gardée au rechargement ; réinitialisation | +3 étapes |

Suites complètes après D-53 : site **2 315 verts** (237 fichiers) ; moteur
inchangé ; e2e Chromium : les 16 scénarios (11 fichiers) verts, dont ceux qui
passent par l'API locale (Docker).

### Tableaux, rendu, traits (D-54, D-55)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `lib/md.test.js` | listes numérotées (premier numéro, numéros écrits gardés), imbriquées, cases de tâches écrites ; blocs ``` refermés, ~~barré~~ seulement ; tableaux (en-tête, lignes, alignement en classes, mise en forme dans les cases, surplus de cases gardé dans la dernière, barre échappée) ; encadré (alignement, barres intérieures, sauts U+000B) ; assainissement qui garde tableaux et encadrés ; écarts pour les journaux (trait sous une ligne, retrait, adresses et HTML en texte, « [nom]: valeur » en texte, données d'image cachées, bloc jamais refermé, « ```code``` » inline) ; U+000B dans un titre, du code, une image ; gras à blanc réparé (espace fine comprise), jamais l'italique seul, ni une citation en italique, ni le code ; titre d'un lien réécrit ; « ![ » répété rendu vite ; cas de D-49 réécrits pour la sortie de marked | 20 → 38 |
| `ui/highlight-dom.test.js` | tableau et encadré rendus : extrait aux barres introuvable tel quel, retrouvé en entier sans raccourcir l'extrait ; barre qui est du texte retrouvée telle quelle ; surlignage case par case ; un `<br>` sépare deux lignes du texte affiché ; journée scindée avant un trait affichée en entier | 10 → 13 |
| `core/highlight.test.js` | `stripTableMarks` (barres, lignes de séparation, même recopiées bout à bout ; barre échappée gardée) ; `locateRendered` : barre de texte cherchée telle quelle, barre de tableau retirée en dernier | 21 → 23 |
| `core/portfolio-md.test.js` | traits gardés tels quels dans une journée ; passages sans date en tête, après `***`, leurs traits espacés et leurs dates neutralisées ; réexport identique ; dialogue d'un export d'avant D-55 jamais doublé | 9 → 10, 3 réécrits |
| moteur : `portfolio/segment.test.js` | après un titre daté, un trait reste dans sa journée (couverture contiguë du texte) ; avant, il coupe encore | 31 → 32 |
| moteur : UC-APP-01-U21 | séparateur : journée non datée avant le premier titre daté, trait dans sa journée après (RG5 bis) | réécrit |
| démonstration (scripts temporaires, non versionnés, sur la VM du Mac) | les 2 392 traces par le chemin du lecteur, avant et après, une à une ; tableaux, encadrés, listes et marques visibles dans le texte affiché des 67 journées ; le journal reconstitué découpé par l'ancien et le nouveau découpage | voir D-54, D-55 |

### Lecteur, démonstration, anneau, heatmap, thème sombre (D-56 à D-60)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `ui/P2.test.jsx` | lecteur : rien que la journée, ses deux triangles et la fermeture ; triangle éteint au bout ; ← revient à la trace précédente ; l'extrait n'est pas cité quand le passage est retrouvé, il l'est (avec sa raison) introuvable, approché, sans portfolio ; décalage de date dit sur la ligne de la trace ; lecteurs d'écran : trace, journée, résultat ; les flèches gardent leur rôle sur les occurrences | 16, réécrits |
| `ui/CartoApp.test.jsx` | démonstration : affichée tout de suite puis remplacée en arrière-plan (portfolio compris, version retenue, pas de rapport d'import) ; même version : rien de téléchargé ; nouvelle version : remplacée ; enrichie : jamais vérifiée ; **enrichie pendant le téléchargement par un autre onglet : gardée**, la copie neuve s'en va ; site injoignable ou démo absente : rien ne change ; échec : retenté un jour plus tard seulement ; « Explorer » retient la version ; archive impossible à télécharger : journées publiques et message. Un jeu supprimé dans un autre onglet n'est pas recréé. Heatmap : trois boutons, « Tout voir » par défaut, plus de case de contraste, légende de ce que la période contient, l'année choisie retenue, pinceau arrêté ; l'ancien défaut s'affiche en « Tout voir » ; clavier borné au dernier jour | +12, 1 réécrit |
| `ui/Tiles.test.jsx` | réglages dans l'ordre demandé (α, anneau, épaisseur minimale) ; anneau à 0 : plus d'arc de pôle ; à 155 : « (compétences masquées) » ; « Valeurs par défaut » seulement si un réglage s'en écarte, et ramène les trois | réécrit |
| `ui/P5.test.jsx` | le soleil du rapport imprimable garde l'anneau standard, même réglé à 0 | +1 |
| `ui/colors.test.js` (nouveau) | marches sombres : même teinte, bande de luminance, 3:1 sur la surface sombre ; CŒUR et MAIN séparés par la luminance ; couleur inconnue ramenée dans la bande ; OKLCH aller-retour ; rampe de la heatmap ancrée sur la surface du thème ; anneau des pôles fondu ; noms et codes à 4,5:1 dans les deux thèmes | 8 |
| `core/formulas.test.js` | anneau des pôles de l'épaisseur du centre par défaut ; réglable (0 : masqué, sans écart ; maximum : plus de compétences ; hors bornes ramené) ; au-delà de 150, jusqu'au bord ; soleil de l'interface 30 / 60 / 65 / 190 ; réglage illisible ramené au défaut | 3 réécrits, +2 |
| `core/state.test.js` | aire des compétences = θ·k·C/2 ; un pôle occupe toute la hauteur de son anneau, quelle que soit sa confiance ; anneau réglable (0, maximum, sans débord) ; pôle ouvert sur 360° : même anneau | 1 réécrit, +1 |
| `core/heatmap.test.js` | un mois entamé une semaine avant le suivant tait son nom | +1 |
| `core/store.test.js` | `saveExistingDataset` : enregistre un jeu présent, jamais un jeu supprimé (mémoire et IndexedDB) | +2 |
| `core/ops.test.js`, `lib/archive.test.js` | préférences par défaut (« Tout voir », anneau de 30, plus de contraste) ; démonstration intacte mesurée à ce que l'archive apportait | 1 réécrit, +1 |
| `e2e/carto-soleil.e2e.js` | sondes aux nouveaux rayons (pôles à 45, compétences à 66) ; arcs de pôles cliqués en un point de leur surface ; **thème sombre** : surface et couleurs choisies, le choix explicite « clair » l'emporte | +1 étape |
| fixture `schemas/fixtures/carto/competency-map-master-exemple.json` | régénérée (préférences : `poleRingPx`, plus de `highContrast`) | — |

Suites complètes : site **2 366 verts** (238 fichiers) — une exécution sous
charge a vu échouer une fois `UC-APP-07-F08` (sans lien, vert seul et à
l'exécution suivante) ; moteur **1 073 verts** ; e2e Chromium : soleil,
copie autonome, partage (deux scénarios), dialogue, verts contre l'API locale.
Relecture indépendante (un agent distinct, 24 points, aucun bloquant) : 21
traités, voir §5 ; laissés : le titre d'une démonstration renommée (l'archive
impose le sien), le repli faute d'en-tête Last-Modified (OVH le donne), la
bande d'une semaine d'une période qui déborde le 1er août (c'est bien une autre
année scolaire).

### Tuiles, tableau de bord, résumé du profil, couleurs (D-61 à D-63)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `ui/P4.test.jsx` | **vue de départ** : le profil et le rythme seulement, « Panneaux » et « Réinitialiser l'affichage » dans l'en-tête, plus de « Masquer » dans les cartes ni de listes sous la grille, la source de chaque carte dite ; sans portfolio, le profil seul sur toute la largeur, la case du rythme dit ce qui lui manque, puis le rythme paraît avec le portfolio ; commandes dans l'en-tête des seuls espaces en tuiles, chacun avec ses panneaux ; cartes sans données dites dans « Panneaux » (« Rien à signaler. » pour les anomalies) ; la croix masque et donne le focus à « Panneaux », la case réaffiche à la suite ; Échap referme le menu ; disposition gardée au rechargement, rien dans le jeu ; « Réinitialiser » en deux temps, cartes remises à zéro ; le trait de constance dans la couleur de son pôle | 8 → 14, réécrits |
| `ui/tiles.test.js` | tableau de bord : neuf cartes, profil et rythme au départ, sa propre clé (pas de mélange avec la cartographie), tailles côte à côte ou pleine largeur seul | 7 → 11 |
| `ui/Tiles.test.jsx` | résumé du profil : période, journées retenues, compétences observées, ni points ni court-circuit ; le soleil dessine CŒUR en `#047857` (marche sombre jointe), le détail porte les deux marches | +2 |
| `ui/colors.test.js` | marches claires (CŒUR, RACINES, CITÉ, FLAMBEAU plus sombres ; TÊTE, MAIN, ÂME telles quelles ; casse ignorée) : même teinte, jamais plus claires, 3:1 sur le blanc ; couleur inconnue assombrie jusqu'à 3:1 ; CŒUR et MAIN séparés par la luminance dans les deux thèmes ; RACINES et FLAMBEAU aussi ; heatmap d'un seul pôle ; `poleTone`, `poleVars` | 8 → 12 |
| `core/ops.test.js` | `dashboardHidden` et `dashboardLayout` retirés à la lecture d'un jeu | renforcé |
| `e2e/carto-soleil.e2e.js` | à la souris : commandes effacées, paraissent au survol, pas retenues par un clic, au clavier oui (dans la barre et dans la tuile) ; titre d'une tuile étroite entier ; tableau de bord : profil et rythme côte à côte, commandes au survol, « Panneaux », réinitialisation ; **tactile à 360 px** : commandes affichées, à leur place, titres entiers (un titre court sur la ligne des commandes, un long au-dessus) ; couleur claire de CŒUR | +2 étapes, +1 scénario |
| fixture `schemas/fixtures/carto/competency-map-master-exemple.json` | régénérée (préférences : plus de `dashboardHidden` ni de `dashboardLayout`) | — |

Suites complètes : site **2 382 verts** (238 fichiers) ; moteur **1 073
verts** ; e2e Chromium : soleil (souris et tactile), copie autonome, dialogue,
partage (deux scénarios, contre l'API locale), verts. Relecture indépendante
(un agent distinct) : aucun défaut bloquant, deux à corriger — sur un
téléphone de 360 px, les titres du tableau de bord réduits à rien (« Prof »,
« Ryth ») ; le profil seul gardait un tiers de la largeur — et des points
mineurs, traités : un clic de souris retenait les commandes, l'anomalie
« sans données » (rien à signaler), une couleur inconnue recalculée à chaque
case, la place des commandes rendue dans tous les espaces, deux tests
manquants (le rythme qui paraît, Échap), la journée du site hors du périmètre
des couleurs. Laissés et dits en D-61 : au survol d'une tuile étroite, les
commandes couvrent la fin d'un long titre ; un ordinateur à écran tactile
suit la souris.

### Palettes et départ de la hauteur (D-64, D-65)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `ui/colors.test.js` | cinq palettes, Contrastée par défaut, sept couleurs par thème ; voisins du soleil séparés pour les daltoniens (ΔE ≥ 8, simulation de Machado) et en vision normale (ΔE ≥ 15), dans les deux thèmes ; 3:1 pour Contrastée, Terre et Profonde (Vive et Pastel en sombre) ; couleur inconnue : deux clartés d'une teinte distinctes, une couleur retouchée sur sa marche, un gris gris ; rampe de heatmap à 3:1 dans toute palette ; titre du pôle à 4,5:1, Contrastée inchangée ; `poleTone`, `poleVars`, `poleFill` selon la palette | 12 → 19 |
| `core/formulas.test.js` | départ de la hauteur : 0,25 par défaut, bornes, centième, géométrie sans réglage à 0 ; h = (C − c₀)/(1 − c₀) ; aire = θ·k·h/2 ; écart de la démonstration (rapport 1,9 → 4,3 entre 0,35 et 0,68) ; sous le départ, épaisseur minimale signalée ; épaisseur minimale de 1 à 6 ; cercles guides au-dessus du départ | +7 |
| `ui/Tiles.test.jsx` | « Réglages » : α, départ de la hauteur, anneau, épaisseur minimale (1 à 6) ; le départ à 0 rend son cercle au soleil ; « Valeurs par défaut » ramène les quatre ; la légende dit le départ ; **palette** : cinq choix, Contrastée cochée, les pôles du référentiel dans chacune, Pastel recolore le soleil, gardée dans le navigateur (jamais dans le jeu), retrouvée au retour ; « Valeurs par défaut » la ramène sans toucher au jeu, le focus revient au premier réglage | réécrit, +1 |
| `ui/CartoApp.test.jsx` | « Pourquoi cette surface ? » : confiance et hauteur, formule de h, raison de l'épaisseur minimale (sous le départ, ou à peine au-dessus) ; sans départ, une confiance nulle ne parle pas de départ | +1, renforcé |
| `ui/palette.test.jsx` | préférence lue (inconnue, absente, stockage bloqué : la palette par défaut) et gardée (la palette par défaut efface la clé) ; la version partagée, rendue sous Pastel, reste en Contrastée et dit d'où part la hauteur | 3 (nouveau) |
| `e2e/carto-soleil.e2e.js` | « Réglages » : Pastel recolore le soleil, gardée au rechargement, « Valeurs par défaut » la ramène ; au téléphone, un titre long (« Ensembles nommés ») passe au-dessus des commandes, entier | +1 étape, adapté |
| fixture `schemas/fixtures/carto/competency-map-master-exemple.json` | régénérée (préférences : `heightOrigin`) | — |

Suites complètes : site **2 401 verts** (239 fichiers) ; moteur inchangé ;
e2e Chromium : soleil (souris et tactile), copie autonome, dialogue, partage
(deux scénarios, contre l'API locale), verts. Relecture indépendante (un
agent distinct) : aucun défaut bloquant ; six à corriger, traités — une
couleur inconnue perdait sa clarté dans les palettes autres que Contrastée ;
à une épaisseur minimale de 0, les secteurs sous le départ disparaissaient ;
deux formulations de « Pourquoi cette surface ? » ; la légende et la version
partagée taisaient l'épaisseur minimale sous le départ ; des hachures
invisibles sur Pastel ; « Valeurs par défaut » écrivait le jeu pour la
seule palette — et des points mineurs (départ au centième, tests de la
version partagée et du stockage). Laissés : la marque d'un pôle et les puces
de liste dans la couleur brute (décoratives), les codes du rapport imprimé
entre 3,2 et 4,2:1 (antérieur, palette par défaut).

### Chaque information une fois (D-66)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `ui/Redundancy.test.jsx` | ce qu'un texte complet ajoute : rien quand il redit (typographie, balisage, étiquette), ses phrases neuves sous leur titre ; une négation, un nombre, un mot changé, une précision, un « mais » entre deux rubriques font une phrase neuve ; une coquille non, un préfixe de sens (« impossible ») si ; titres en gras, étiquettes, listes et guillemets ; portrait de la journée sans la synthèse qui le redit, ce qu'elle ajoute lu une fois dans la suite, une synthèse seule affichée ; verdict d'une journée (complet, sans la ligne, sans le statut, sans les textes du président) ; ligne d'une journée qui ne redit les chiffres du panneau que s'ils diffèrent ; motif AuroraCore tu seulement si la délibération est là et le dit ; décision du président d'abord, sans rien déplier, puis voix, éclairages et raisonnement ; décision non redite ; confiance finale seulement si elle diffère (80 = 0,8) ; sort des pièces, extrait d'une pièce retenue non redit, sort non dit quand une trace n'a pas de numéro de pièce ; passages saillants sous leur territoire (même extrait, même jour), à part sinon (une partie, plus long, autre feuille) ; import : rubriques redites non gardées, un ajout gardé, un texte seul gardé, master V3 (invitations dans la seule synthèse) ; archive d'avant allégée à la lecture, l'original intact | 24 (nouveau) |
| `ui/P2.test.jsx` | compétence d'une journée : sa ligne dit le statut seul, dépliée le motif et la prescription ; sort de la pièce ; pas de confiance finale redite ; compétence de deux journées : chaque ligne dit sa confiance et ses preuves ; portrait de la journée : la forme du profil une fois ; **AuroraCore** : la décision du président et les voix hors de tout repli, le raisonnement sous « Raisonnement du président » ; modale du jour : le motif du président une fois, au verdict, les voix dans les réflexions, pas de seconde décision | renforcé, +1 |
| `ui/P5.test.jsx` | rapport imprimé : niveau de preuve une fois ; fiche d'une compétence d'une seule journée sans ses chiffres ni ceux de sa journée | renforcé |
| `ui/CartoApp.test.jsx` | plus de « Journées observées » : les journées se lisent avec leur verdict | adapté |
| `core/import.test.js` | le rapport complet d'un pôle qui redit ses rubriques n'est pas gardé | adapté |
| `test/fixtures.js` | synthèse complète et rapport complet du jeu « Lou » : ils redisent leurs rubriques, comme d'ordinaire | adapté |
| fixture `schemas/fixtures/carto/competency-map-master-exemple.json` | régénérée (identifiants de variante : leurs fichiers ont changé) | — |

Suites complètes : site **2 426 verts** (240 fichiers) ; moteur inchangé ;
e2e Chromium : soleil (souris et tactile), copie autonome, dialogue, partage
(deux scénarios, contre l'API locale), verts. Vérifié aussi dans Chromium
sur la démonstration : portrait sans phrase répétée ; compétence d'une seule
journée (6.01) sur sa ligne courte ; examen du Pédagogue à un niveau ; sort
des pièces, extraits des pièces retenues non redits ; territoires et passages
sans extrait répété (0 sur 14 dans le premier rapport de CŒUR) ; rapport
imprimé de trois compétences sans phrase ni chiffre redits (restent les
noms des pôles et les intitulés des temps de l'examen). Deux relectures
indépendantes (un agent distinct chaque fois). La première : cinq défauts —
la première règle (« des rubriques, donc pas de texte complet ») perdait les
invitations du master V3 ; des passages plus longs que l'extrait cité étaient
tus, et le contexte des autres perdu ; la décision du président enfouie à
trois niveaux ; la confiance finale redite ; le niveau de preuve redit dans
le rapport. La seconde : six défauts — la règle tolérait 15 % de mots
nouveaux, si bien qu'une négation, un nombre ou une précision ajoutée
passaient pour « déjà dits » (perte silencieuse) ; les pièces retenues
redisaient l'extrait de leur trace ; la décision du président, rendue à la
journée, était repliée dans la délibération ; les listes aplaties et les
guillemets coupés dans ce qu'une synthèse ajoute ; « non retenue » dit d'une
pièce quand une trace n'a pas de numéro ; titres en gras et étiquettes pris
pour des phrases — et des points mineurs (passages d'une autre feuille ou
partiels, confiance en pourcentage, rapport imprimé, commentaires). Tous
traités.

### Démonstration lue à la demande, seconde lecture (D-67, D-68)

| Fichier de test | Contenu | Tests |
|---|---|---|
| `core/split.test.js` | découpage : un index sans détails, des fichiers par journée, texte, compétence, pôle et délibération, sous un dossier de version (même contenu, même version) ; chaque information une fois (journées refaites = archive, taille totale ≈ celle des détails) ; besoins (« tout », journée, texte, compétence, pôle) ; ouvert depuis l'index : rien rangé ici, la seconde lecture dans l'index ; une compétence : son seul fichier, une fois ; un fichier qui ne se lit pas : erreur en français, le reste gardé, relu ensuite ; délibération lue sur le site ; ajouts rangés par-dessus (un passage rattaché part du texte du site) ; export = archive d'origine, seconde lecture comprise ; passages dans un autre ordre que les pôles : archive refaite identique ; un index importé d'un fichier refusé ; un jeu qui a déjà quelque chose (passage sans date) n'en prend rien, ni synthèses ni métriques ; devenu d'ici : tout rangé (un passage rattaché, une journée et une délibération à la personne gardés), plus rien demandé au site, et un enregistrement d'avant ne le rend pas au site ; un fichier qui manque pendant la copie : rien n'est écrit | 16 (nouveau) |
| `ui/useCartoData.test.jsx` | une lecture commencée avant un import n'est pas rangée, la journée se relit avec la nouvelle analyse ; une journée sans texte n'en attend pas ; intacte, la démonstration reste lue à la demande, enrichie elle devient d'ici en arrière-plan (chaque fichier lu une fois) ; une démonstration qui apporte ses passages sans date n'est pas copiée à l'ouverture (sa version et ce qu'elle apporte retenus avant qu'elle s'affiche) ; devenue d'ici, ce qu'elle avait lu par morceaux se relit en entier ; un index qui renvoie hors du site n'est pas suivi ; un jeu d'ici : une journée lue une fois, quels que soient les besoins | 7 (nouveau) |
| `ui/CartoApp.test.jsx` | démonstration lue à la demande : l'index d'abord, puis le portrait du dernier jour, une compétence, un pôle — un fichier chacun, rien rangé ici ; une archive entière (`archive.json`) se lit encore, d'un bloc ; D-57 sur la date de l'index (repli sur l'archive) ; modale du jour : une compétence dépliée un jour est refermée le jour suivant, et se déplie avec son contenu | +3, adaptés |
| `core/import.test.js` | seconde lecture : jointe sans changer le soleil (journées, variantes et état identiques, rien à arbitrer), résumé par compétence, délibérations et rapport de pôle gardés, compte rendu sans « répartis », texte du journal conservé ; même lot que des analyses par journée ; lot avec le portfolio (son texte, pas la feuille, sans « texte remplacé ») ; pas de journée ajoutée, traces sans date non dites « non placées » ; doublon ; run déjà réparti sur les journées ; un jeu qui n'a que des runs AuroraCore : le nouveau se répartit, comme avant ; seul, un run fait le soleil | +7, renforcé |
| `core/archive.test.js` | aller-retour d'une archive avec seconde lecture et délibérations ; réimportée, rien n'est doublé | renforcé |
| `core/master-schema.test.js` | `readings` et `remote` dans le schéma : l'index découpé conforme, renvois mal formés refusés ; statut ou identifiant d'une lecture invalides refusés | +1, renforcé |
| `ui/SecondReading.test.jsx` | traces rapprochées (même jour, l'un contient l'autre, à la typographie près ; jamais un extrait trop court) ; nom de la lecture ; soleil inchangé ; ligne repliée, délibération non lue ; dépliée : décision du président d'abord, voix, traces (le passage déjà listé non redit), éclairages et raisonnement repliés ; trace ouverte et surlignée dans sa journée ; compétence non jugée : pas de section ; pôle : rapport de la lecture, lu à l'ouverture | 7 (nouveau) |
| `lib/archive.test.js` | archive de compte : une démonstration lue à la demande intacte n'est pas exportée et rien n'en est lu ; enrichie mais le site injoignable, elle est nommée, le reste part | +1 |
| fixtures | `louCoreRun()` (run AuroraCore synthétique de Lou) ; `competency-map-master-exemple.json` régénérée (seconde lecture et délibérations) | — |

Vérifié aussi sur la démonstration elle-même (hors du dépôt) : ouverte comme
sur le site puis exportée, l'archive est celle d'origine (journées, détails,
délibérations, seconde lecture), en 258 requêtes, une par fichier.
Suites complètes : site **2 468 verts** (243 fichiers) ; moteur **1 073
verts** (17 sautés) ; API : validation du master (PHPUnit, Docker php:8.2),
verte ; e2e Chromium : soleil (souris et tactile), copie autonome, dialogue,
partage (deux scénarios, contre l'API locale), verts. Relecture indépendante
(un agent distinct) : quatorze points, tous traités, chacun avec son test.
Deux bloquants : l'archive de compte lisait une démonstration lue à la
demande en entier avant de la laisser de côté, et un seul fichier
injoignable y faisait perdre tous les jeux ; le script disait de retirer
l'ancien dossier de version, dont une démonstration enrichie dépend. Six à
corriger : un index refusé laissait passer ses synthèses et ses métriques,
et un jeu qui n'avait que des passages sans date l'acceptait ; dans un lot
mêlé, la feuille d'une seconde lecture prenait la place du texte du
portfolio ; un run déjà réparti sur les journées pouvait être joint aussi en
seconde lecture ; la modale du jour gardait ouverte, vide, une compétence
d'une journée à l'autre ; une lecture commencée avant un import rangeait un
détail périmé ; un jeu d'ici était relu par chacun de ses lecteurs. Six
mineurs : un index importé d'un fichier, ou un renvoi vers un autre site,
était suivi ; la date redite dans « Le même passage » ; une journée sans
texte attendait son texte ; « non placées » dit des traces d'une seconde
lecture, et des journées ajoutées par ses feuilles ; un fichier absent
privait les autres journées des leurs, et l'erreur était en anglais ;
l'ordre d'origine des passages perdu au découpage. Seconde relecture (un
agent distinct), sur la copie d'une démonstration enrichie, ajoutée quand
l'hébergement a montré qu'il ne peut pas garder toutes les versions : deux
bloquants — la copie pouvait partir à l'ouverture d'une démonstration qui
apporte ses passages sans date (ce qu'elle apporte n'était retenu qu'après
son affichage) ; un échec de copie ne se retentait pas, si bien que la
règle de retrait des dossiers n'était pas tenue — ; un à corriger : après
la copie, une journée lue par morceaux passait pour complète (un pôle ouvert
ensuite restait « Chargement… ») ; un mineur : un second onglet restait sur
le site. Tous traités, chacun avec son test.

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
    dans GitHub, lors d'un déploiement autorisé par Christian. Suite : au
    déploiement du 2026-10-14 (D-46), aucune démo anonymisée n'était préparée ;
    elle partira quand Christian l'aura produite et relue (« Préparer une
    démo »).
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

Questions du 2026-10-14 sur l'ancien partage et la version garantie (D-42,
D-43), réponses du même jour :

25. Anciens liens (l'ancien partage n'exigeait pas l'attestation de
    majorité) : les révoquer au déploiement ? → **Non** : le site n'est pas
    encore ouvert au public, Christian est seul à l'utiliser. Ils expirent
    normalement.
26. Le niveau « Publique (partageable) » ne crée plus aucun lien. →
    **Décidé** : il s'intitule « Partager ». Suite : fait (D-44).
27. `CLAUDE.md` décrivait le partage employeur comme « lien + mot de
    passe ». → **Proposition acceptée** : « lien vers une version choisie par
    la personne, mot de passe facultatif, jamais automatique ». Suite : fait
    (D-44).
28. Publication par l'apprenant seul, sans cartographe (D-42, choix
    d'implémentation) : la garder ? → **Oui**, elle reste possible ; le
    destinataire lit « Publiée par la personne elle-même ».
29. Le code de demande suffit-il pour qu'un cartographe publie, sans
    invitation préalable acceptée (D-42, choix d'implémentation) ? →
    **Oui** : « laisser comme ça, le code suffit ».

Question posée après le déploiement du 2026-10-14 (D-46) :

30. Le script anti-FOUC de `index.html` (thème clair ou sombre appliqué avant
    le premier rendu) est refusé par la CSP de production depuis qu'elle
    existe. Ajouter son hash à `script-src`, avec un test qui le garde
    synchronisé comme celui du bootstrap de la sandbox ? → **Décidé**
    (2026-10-14, 15 h 57) : « feu vert pour réaliser cette correction.
    Déploie ensuite le correctif sur le site. » Suite : fait et déployé
    (D-47).

Question posée après la démonstration avec portfolio (D-48) :

31. Le portfolio de la démonstration, exporté de Google Docs, affiche ses
    échappements Markdown (`\!`, `\*`… : 2 246) et ses séparateurs neutralisés
    comme des puces (120) : le moteur Markdown du site ne connaît ni les
    échappements ni les traits horizontaux. Les lui apprendre (règles du
    CommonMark), en vérifiant que le surlignage reste au même endroit ? Cela
    vaut pour tout portfolio venu de Google Docs. → **Décidé** (2026-10-14,
    18 h 09) : « oui ! Corrige l'export Google Docs du journal, les symboles et
    les lignes de séparation. Puis uploade les fichiers corrigés sur le site
    web. » Suite : fait — avec les sauts de ligne, les carrés « VT » et les
    images — et déployé (D-49).

Questions posées après D-49 :

32. Les **tableaux** (`| … | … |`, puis `| --- | --- |`) ne sont pas rendus :
    leurs lignes s'affichent bout à bout, barres verticales comprises, dans
    13 journées de la démonstration et dans 9 chapitres de formation. Les
    rendre en vrais tableaux (règle du GFM) ? Google Docs fait aussi d'un
    encadré un tableau d'une seule case (le 4 mars, un texte entier) : il
    deviendrait un encadré. Le surlignage suivrait : 29 extraits du jury
    recopient des lignes de tableau avec leurs `|`. → **Décidé** (2026-10-15,
    0 h 59) : « Ok pour les rendre en vrais tableaux. Idem pour faire un
    encadré autour des tableaux d'une seule case. […] s'il existe un
    librairie javascript + CSS capable de faire un rendu plus élégant tout en
    conservant le surlignage, alors je veux bien qu'elle soit utilisée. »
    Suite : fait avec la bibliothèque marked et une feuille de style du site,
    surlignage identique sur les 2 392 traces ; déployé (D-54).
33. Un journal de Google Docs importé **tel quel** dans l'interface se découpe
    encore à chacun de ses traits (`---`), qui ouvrent une partie sans date :
    celui de la démonstration donnerait 188 parties, dont 120 sans date qui
    portent 98,5 % du texte (la démonstration y échappe : son archive est
    préparée à part, D-48). Proposition : dans un texte qui a des titres
    datés, un trait ne coupe plus — il reste un trait dans sa journée ; sans
    aucun titre daté, il coupe comme aujourd'hui. → **Décidé** (2026-10-15,
    0 h 59) : « Les remplacer par des balises <hr> de sorte que dans un texte
    qui a des titres datés, un trait ne coupe plus — il reste un trait dans sa
    journée. » Suite : fait — le trait reste `---` dans le texte et s'affiche
    en `<hr>` ; l'export du portfolio place ses passages sans date en tête ;
    déployé (D-55).

Questions posées après D-55 :

34. Anneau des pôles à « 20 % du rayon total » (2026-10-15, 8 h 11, point 4) :
    s'il s'arrête à 20 % du rayon (38) avec le disque central de 30, il ne
    fait plus que 8 : trop mince pour le nom des pôles et pour cliquer. Bord à
    20 % avec un centre réduit, ou épaisseur de 20 % ? → **Décidé**
    (2026-10-15) : « Nous allons mettre un rayon égal à celui du centre du
    soleil : donc 30+30px = 60px. En paramètre, l'utilisateur doit pouvoir
    changer le rayon pour aller de 0px […] à 160px […]. » Suite : fait (D-58).
35. **Proposition** (posture d'ergonome, D-56) : les commandes de chaque tuile
    (◀ ▶, taille, ✕) sont toujours affichées, quatre par tuile ; elles
    pourraient n'apparaître qu'au survol ou au focus de la tuile (toujours sur
    un écran tactile, où le survol n'existe pas). → **Décidé** (2026-10-15,
    11 h 19) : « Ok pour n'afficher les commandes des tuiles qu'au survol ou
    au focus de la tuile, sauf sur écran tactile. Applique la même logique à
    l'onglet tableau de bord. Prévois également pour tableau de bord un
    bouton "Réinitialiser l'affichage" et un sélecteur de panneau comme pour
    l'onglet Cartographie avec uniquement "Profil, Rythme" sélectionnées dans
    la vue par défaut, les autres non sélectionnées. » Suite : fait (D-61).
36. **Proposition** : le résumé du profil (tuile Détail, sans sélection) dit
    les « Points (total) » et « 1 613 compétences n'ont pas été instruites
    (court-circuit) » — des mots de l'analyse, pas de la personne. Garder la
    période, les journées retenues, les compétences observées et le portrait ?
    → **Décidé** (2026-10-15, 11 h 19) : « Ok pour retirer du résumé du
    profil "Points (total)" et la phrase sur le "court-circuit". » Suite :
    fait (D-62).
37. **Proposition** sur les couleurs du référentiel, en clair : CŒUR
    (`#10b981`) et MAIN (`#ec4899`), voisins dans le soleil, se confondent en
    deutéranopie (ΔE 4,9, sous le plancher de 6) ; RACINES, CITÉ, FLAMBEAU et
    CŒUR sont sous 3:1 sur le blanc. Avec CŒUR `#047857`, RACINES `#d97706`,
    CITÉ `#0891b2` et FLAMBEAU `#ea580c` (mêmes teintes, un cran plus
    sombres), toutes les vérifications passent. C'est le référentiel, donc
    une décision des épistémiarques ; en sombre, c'est déjà réglé (D-60).
    → **Décidé** (2026-10-15, 11 h 19) : « Ok pour des couleurs un cran plus
    sombre pour les daltoniens. » Suite : fait à l'affichage (D-63), le
    référentiel inchangé. Les vérifications de la proposition ne portaient que
    sur les pôles voisins : entre toutes les paires, RACINES et FLAMBEAU s'y
    confondaient pour un deutéranope (ΔE 1,6). D'où deux valeurs plus justes,
    **à confirmer** : RACINES `#c88007` (sa teinte gardée) et FLAMBEAU
    `#c2410c` (ΔE 10,4 entre eux). Suite (13 h 28) : « Les couleurs sont un
    peu moches » — ces couleurs deviennent la palette Contrastée, par défaut,
    parmi cinq (D-64).
38. **Proposition** : la palette par défaut reste Contrastée, « l'actuelle »
    (3:1 sur la surface, daltoniens compris). Terre et Profonde passent aussi
    toutes les vérifications, 3:1 compris ; Vive et Pastel, plus claires, non
    (relief : noms des pôles, tableau équivalent). Garder Contrastée par
    défaut, ou en choisir une autre ? *(en attente)*

Questions posées avec D-66 (2026-10-16, 5 h 30) :

39. « Est-ce que ces informations [les réflexions des jurés qui ont conduit à
    la décision du président] sont disponibles dans les fichiers markdown ou
    JSON produits par l'analyse de l'algorithme exécuté en amont, ou dois-je
    les ajouter au projet en cours pour que tu puisses les publier ? »
    → **Réponse** : la démonstration vient de l'analyse Aurora v3 par
    journée, qui n'a qu'un juge, le Pédagogue : son examen en trois temps
    (présomption d'absence, de complaisance, conclusion) est déjà affiché
    (compétence → Verdicts par journée → une journée → Réflexions du jury),
    et c'est tout ce que ces fichiers contiennent — ni six voix, ni
    président. Le jury complet existe pour ce même journal : l'analyse
    AuroraCore du 19 avril 2026 (`AuroraCore/portfolios/feuilles/300/`, sur
    le Mac), 57 compétences (37 établies, 15 renvois, 5 non établies), par
    compétence un verdict, la délibération des six voix et du président, un
    briefing (3,0 Mo) et les pièces versées (3,1 Mo). Rien à ajouter :
    l'interface lit déjà ce format.
    Mais l'importer tel quel ajouterait une seconde analyse aux 42 journées
    (sur 59) où ses 180 traces sont datées : elles passeraient « à arbitrer »
    et ne compteraient plus. **Trois
    façons de faire, à choisir** : (A, proposée) garder les verdicts par
    journée pour le soleil et joindre la délibération AuroraCore à chaque
    compétence, en seconde lecture, sans effet sur le soleil ; (B) laisser
    AuroraCore faire le soleil de ces 57 compétences ; (C) garder les deux
    analyses et les confronter dans « Comparaison ». Données personnelles :
    sur le site seulement, comme le portfolio (D-48).
    → **Décidé** (2026-10-16, 8 h 44) : « Ok pour choix A et choix 1. »
    Suite : fait (D-68) — la seconde lecture, sous les verdicts par journée
    de chaque compétence, la décision du président d'abord ; soleil
    inchangé. Déposée sur le site avec la démonstration.
40. « Comment peux-tu faire pour ne pas tout charger en mémoire et lire les
    fichiers de données uniquement au moment où l'utilisateur les
    sollicite ? » → **Réponse** : c'est déjà le cas pour l'essentiel —
    l'index (journées, verdicts résumés, ~0,7 Mo) est en mémoire ; le détail
    d'une journée (extraits, jury, rapports), le portfolio et une
    délibération AuroraCore restent dans la base du navigateur jusqu'à ce
    qu'on les ouvre. Trois points faibles : la démonstration se télécharge
    d'un bloc à la première ouverture (18,4 Mo, 3,3 Mo compressés) ; ce qui
    est lu reste en mémoire jusqu'au rechargement (une compétence observée
    40 jours charge 40 journées) ; un extrait est gardé jusqu'à trois fois
    par journée. **Proposition** : (1) la démonstration découpée en fichiers
    statiques — un index, une journée par fichier, une délibération par
    compétence, le portfolio par journée —, chacun lu quand on l'ouvre
    (compatible avec l'hébergement : rien que des fichiers) ; (2) une
    mémoire bornée, qui oublie les journées les moins récemment lues ; (3)
    un extrait gardé une fois, la trace renvoyant à sa pièce (version 5 du
    master, avec sa conversion). Le (1) et le (2) ne changent rien au
    format ; le (3) en est un changement.
    → **Décidé** (2026-10-16, 8 h 44) : « Ok pour choix A et choix 1. »
    Suite : fait (D-67), en rangeant les fichiers par ce que l'on ouvre (une
    compétence, un pôle, la journée, son texte, une délibération) plutôt
    qu'une journée par fichier, qui aurait fait lire 6,5 Mo en moyenne pour
    une compétence ; la démonstration s'ouvre sur un index de 38 Ko
    compressés. Le (2) et le (3) ne sont pas faits.

Question posée avec le déploiement de D-67 et D-68 (2026-10-16) :

41. « Nous manquons de place sur le serveur. Que contient le répertoire
    app ? Peut-on le supprimer ? Que pourrais-tu enlever d'autre qui n'est
    pas utile ? » (10 h 32) → **Réponse** : `app/` est l'API du site (comptes,
    copies serveur, partages, proxy LLM) ; il ne se supprime pas. Il pèse
    19,5 Mo : trois versions de l'API (3,7 à 3,9 Mo ; seule celle du 14
    octobre tourne, celle du 17 juillet sert de retour arrière), la base
    pays db-ip (8,2 Mo, le pays des connexions au monitoring) et le `.env`.
    Fait, avec une sauvegarde sur le Mac d'abord (sa proposition de 10 h 34) :
    l'ancienne démonstration d'un bloc (17,2 Mo) et la plus ancienne version
    de l'API (3,7 Mo) effacées (voir le déploiement de D-68). **À décider** :
    la version d'API précédente (3,8 Mo ; sans elle, plus de retour arrière en
    une commande), la base pays (8,2 Mo ; sans elle, plus de pays au
    monitoring), les 59 journées publiques (14,6 Mo ; la vue « journée » de
    l'ancien site les lit encore et la démonstration s'en sert en secours :
    les retirer demande de modifier le site). **Proposition**, pour les
    mises à jour de la démonstration : garder ses fichiers compressés sur le
    serveur (environ 5 Mo par version au lieu de 20), ce qui permettrait d'en
    garder deux. *(en attente)*

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
- **2026-10-14** — Réponses aux questions 25 à 29 (D-44) : le niveau
  « Publique (partageable) » devient « Partager » ; `CLAUDE.md` décrit le
  partage par une version choisie, mot de passe facultatif.
- **2026-10-14** — Pôle ouvert sur 360° (D-45), à la demande de Christian :
  un double-clic sur un pôle du soleil l'ouvre, ses compétences font tout le
  tour selon leur part des points du pôle ; un clic au centre ramène à tous
  les pôles ; passage animé d'une demi-seconde (aucun si le mouvement est
  réduit) ; même geste dans la version partagée. Corrigé en chemin : un clic
  dans le soleil ne fait plus défiler la page jusqu'à la liste — la colonne de
  gauche défile seule et la liste y suit la sélection. Relu par un agent
  distinct avant le commit : six corrections (Échap, dernière trame, focus du
  centre, passage inversé, « o » avec modificateur, liste).
- **2026-10-14** — Déploiement sur humanome.xyz autorisé par Christian (D-46) :
  release API `v1.1.0-106-gc6a0231`, migrations 022 et 023, front ; vérifié en
  ligne ; branche fusionnée dans `main`.
- **2026-10-14** — Question 30 (D-47) : le script anti-FOUC est autorisé par
  son hash dans la CSP de production — le thème choisi par un visiteur est de
  nouveau réappliqué au chargement ; déployé et vérifié en ligne.
- **2026-10-14** — Démonstration avec son portfolio (D-48) : le journal
  correspondant, découpé à ses titres datés, déposé sur le site seulement
  (archive de l'interface) ; 97,4 % des passages retrouvés tels quels ; guide
  du visiteur mis à jour.
- **2026-10-14** — Question 31 (D-49) : le site rend les exports de Google
  Docs sans symboles parasites — échappements, traits, sauts de ligne,
  images ; le découpage lit « 1er » ; archive de la démonstration
  reconstruite et redéposée, front redéployé ; 98,5 % des passages retrouvés
  tels quels ; questions 32 (tableaux) et 33 (traits à l'import).
- **2026-10-14** — Comparaison par défaut (D-50), à la demande de Christian :
  janvier face à mars ; préréglage « Janvier et mars » ; changer de vue ne
  fige plus A et B ; déployé et vérifié en ligne.
- **2026-10-14** — Rectification de Christian (D-51) : la comparaison s'ouvre
  sur la première moitié des journées analysées face à la seconde, avec son
  préréglage ; janvier et mars retirés. En-tête allégé (D-52) :
  « Réinitialiser l'affichage », plus de doublons ni de « mode expert » (ses
  réglages deviennent une tuile), légende du soleil sur deux lignes. La
  cartographie en tuiles (D-53) : douze tuiles, au départ le soleil et le
  détail, disposition gardée dans le navigateur. Relu par un agent distinct
  (six corrections) ; déployé et vérifié en ligne.
- **2026-10-15** — Questions 32 et 33 (D-54, D-55) : le Markdown rendu par la
  bibliothèque marked — tableaux, encadrés, listes numérotées et imbriquées,
  styles comme à l'impression — avec un surlignage identique sur les
  2 392 traces de la démonstration ; un trait ne coupe plus une journée
  datée (journal de la démonstration redécoupé en ses 67 journées), l'export
  du portfolio place ses passages sans date en tête. Relu par un agent
  distinct (13 points traités) ; déployé et vérifié en ligne.
- **2026-10-15** — Demande de Christian de 8 h 11 (D-56 à D-60) : lecteur de
  portfolio épuré (la journée entre ◁ ▷, l'extrait du jury cité seulement
  s'il n'est pas retrouvé) ; démonstration intacte mise à jour d'elle-même,
  en arrière-plan (cause du défaut de Chrome Android : une copie antérieure au
  dépôt du portfolio) ; anneau des pôles réglable (30 par défaut, de 0 à 160),
  pôles pleins, feuilles 2,4 fois plus hautes ; heatmap « Tout voir » par
  défaut, contraste renforcé toujours ; soleil et heatmap au thème sombre,
  marches sombres validées. Question 34 posée et tranchée ; propositions 35
  à 37. Relu par un agent distinct (24 points, 21 traités : mise à jour de
  la démonstration en arrière-plan, relue avant de remplacer, retentée un
  jour plus tard ; passage approché lisible en sombre ; rapport à l'anneau
  standard ; légende de la heatmap ; contraste des noms…). Déployé (front) et
  vérifié en ligne, au bureau et au téléphone.
- **2026-10-15** — Réponses de Christian aux propositions 35 à 37 (11 h 19,
  D-61 à D-63) : à la souris, les commandes des tuiles ne paraissent qu'au
  survol ou au clavier, posées sur la fin de la barre (toujours affichées sur
  un écran tactile) ; le tableau de bord en panneaux, comme la cartographie
  (« Panneaux », « Réinitialiser l'affichage », au départ le profil et le
  rythme, disposition gardée dans le navigateur) ; résumé du profil sans
  total des points ni court-circuit ; couleurs des pôles plus sombres en
  clair, traduites à l'affichage, avec deux valeurs plus justes que celles
  proposées (RACINES et FLAMBEAU, à confirmer). Relu par un agent distinct
  (aucun bloquant ; les deux défauts à corriger et sept points mineurs
  traités). Déployé (front) et vérifié en ligne, au bureau et au téléphone.
- **2026-10-15** — Demande de Christian de 13 h 28 (D-64, D-65) : la tuile
  « Réglages » (ex-« Réglages de l'encodage ») propose cinq palettes des
  pôles — Contrastée par défaut, Vive, Pastel, Terre, Profonde —, toutes
  validées pour les daltoniens, gardées dans le navigateur ; le rapport et la
  version partagée restent sur la palette par défaut. Pour le « défaut de
  logique » d'α, analyse puis choix de Christian : la hauteur part d'une
  confiance réglable (0,25 par défaut), les écarts de hauteur de la
  démonstration 1,6 fois plus visibles ; α garde son rôle dans les points.
  Relu par un agent distinct (aucun bloquant ; six défauts et des points
  mineurs traités). Question 38 posée (la palette par défaut). Déployé
  (front) et vérifié en ligne, au bureau et au téléphone.
- **2026-10-16** — Demande de Christian de 5 h 30 (D-66) : chaque
  information une fois. Le portrait d'une journée perd sa « Synthèse
  complète », qui redisait ses rubriques (59 sur 59) ; seul ce qu'un texte
  complet ajoute se lit, et seul cela se garde à l'import et à la relecture
  d'une archive (`core/restatement.js`). Panneaux d'une compétence et d'un
  pôle, modale du jour, rapport imprimé : ce qu'une ligne dit déjà ne se
  redit plus. Pour le point 2, chaque pièce du Greffier dit son sort dans le
  verdict, l'examen du Pédagogue a un niveau de moins à déplier, et une
  délibération AuroraCore montre d'abord la décision du président, sans
  rien déplier. Relu deux fois par un agent distinct (cinq, puis six
  défauts, traités ; la seconde relecture a rendu stricte la règle du « déjà
  dit », qui laissait passer une négation ou un nombre). Questions 39 (les
  délibérations du jury sont dans AuroraCore, sur le Mac : trois façons de
  les joindre) et 40 (lire les données à la demande : proposition en trois
  points) posées. Déployé (front, et l'archive de la démonstration allégée
  de 1,2 Mo) et vérifié en ligne, au bureau et au téléphone.
- **2026-10-16** — Réponse de Christian de 8 h 44 (« Ok pour choix A et
  choix 1. », D-67, D-68). La démonstration se lit à la demande : un index
  de 38 Ko compressés, puis le seul fichier de ce qu'on ouvre — rangés par
  compétence, pôle, journée, texte et délibération plutôt qu'une journée par
  fichier, qui aurait fait lire 6,5 Mo en moyenne pour une compétence. La
  seconde lecture : l'analyse AuroraCore du 19 avril 2026 (57 compétences,
  six voix et un président) jointe à chaque compétence, la décision du
  président d'abord, sans effet sur le soleil. Relu par un agent distinct
  (quatorze points, dont deux bloquants, traités). Au dépôt, l'hébergement
  gratuit (100 Mo) est plein : à la demande de Christian (10 h 32, 10 h 34),
  l'ancienne démonstration d'un bloc et la plus ancienne version de l'API
  sont sauvegardées sur le Mac puis effacées (question 41) ; une
  démonstration enrichie se copie désormais dans le navigateur, pour que
  l'ancien dossier de version puisse se retirer (relu par un agent distinct :
  quatre points, traités). Déployé et vérifié en ligne, au bureau et au
  téléphone.
