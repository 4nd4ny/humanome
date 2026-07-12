# Rapport de parité du moteur de cartographie (gate M4 / P5)

**Date d'exécution : 2026-07-12.** Ce rapport clôt le jalon M4 conformément à
`docs/plan-portage-moteur.md` (« Gate M4 : rapport `docs/rapport-parite-moteur.md` publié
avant d'ouvrir M5 »). Tous les chiffres ci-dessous sont issus de l'exécution réelle des
trois harnais de parité (`scripts/parity/`) et de la suite de tests du moteur, sur le
corpus réel de 59 journées (`web/public/data/demo/jours/`) et les oracles en lecture seule
d'`assets-existants/merge-prototype/`.

**Rappel du contexte.** Le pipeline Python d'origine (`carto_merge.py`, prompts
d'extraction Aurora v3) n'est pas disponible. Le moteur JS (`engine/`, ESM sans DOM,
ADR-001) a été **rétro-conçu depuis les artefacts observables**, chaque étage étant vérifié
contre un oracle indépendant : l'étage B1 est par exemple testé depuis les agrégats de
l'oracle (et non depuis notre propre merge), pour que les étages ne masquent pas leurs
erreurs mutuelles.

---

## 1. Tableau de parité par étage

| Étage | Module | Oracle | Harnais | Résultat constaté |
|---|---|---|---|---|
| **A — merge numérique** | `engine/src/pipeline/merge.js` | `intermediate/carto_merge.json` (59 feuilles, `merge-v1`) | `parity-merge.mjs` | **PARITÉ 100 % — 0 écart** sur `periode` + `agrege` : **132 618 valeurs feuilles comparées** (62 pour `periode`, 132 556 pour `agrege` : `par_competence` ×61, `par_pole` ×7, `global`, `ipsatif`). Exécution : 14 ms. Exit 0. |
| **B1 — prompts narratifs** | `engine/src/pipeline/narrative-prompts.js` | `intermediate/prompts/*.prompt.md` | `parity-prompts.mjs` | **69/69 prompts identiques, 0 différent** (61 compétences + 7 pôles + 1 kairos), diff normalisé (CRLF→LF, espaces de fin de ligne, sauts de ligne finaux) — en pratique identité octet pour octet du contenu. Exit 0. |
| **B2 — document merge final** | `engine/src/pipeline/merge-document.js` | `web/public/data/demo/merge.json` (document réel converti de `carto-data.js`) | `parity-document.mjs` | **81/81 vérifications OK, 0 écart**, deep-equal du document complet : 0 diff. Détail : niveau **54/54**, archetype **54/54**, points **54/54**, feedback HTML **54/54**, champs hors feedback **54/54**, tendances de pôle **7/7**, `rapport_html` **7/7**, `kairosHtml` + alias `rapportHtml` OK, enveloppe/`profilMeta`/`profilIpsatif`/`feuilles` OK. Exit 0. |
| **C — extraction journalière** | `engine/src/pipeline/extract.js` | *aucun oracle amont (prompts originaux perdus)* | — (vérification structurelle ajv + invariants, cf. §3) | Prompts **recréés** depuis le protocole observé ; sortie validée au schéma `cartographie-jour` + invariants du corpus. 20 tests dédiés verts. |
| **Tests moteur** | `engine/` complet | — | `cd engine && npm test` | **182/182 tests verts, 15 fichiers** (merge 18, narrative-prompts 15, merge-document 33, extract 20, validation 5, intégration 2, providers 61, runs 19, consistance 7, index 2). Durée : ~440 ms. Revue adversariale P5 (2026-07-12) : +6 tests de régression (parseur JSON hostile, corps 200 non-JSON, plafond Retry-After). |

Chiffres de contrôle du corpus agrégé (identiques oracle/moteur) : score total **1478.18**,
compétences établies **54**, non établies **7**, renvoyées **0**.

### Détail étage A — ce qui est comparé

Comparaison structurelle stricte (insensible à l'ordre des clés, stricte sur les valeurs et
l'ordre des tableaux) de :

- `periode` (premiere, derniere, nb_feuilles, feuilles_chronologiques ×59) ;
- `agrege.par_competence` : 61 compétences × (12 champs d'agrégat + `presence_par_feuille`
  ×59 avec traces et pièces enrichies) ;
- `agrege.par_pole` : 7 pôles × (score cumulé, compteurs, `evolution_par_feuille` ×59,
  `rapports_par_feuille` ×59 avec passages saillants et audits) ;
- `agrege.global` : `kairos_par_feuille` ×59, `emergences_cumulees` (orphelines,
  connexions transversales, nœuds conceptuels, avec `source_journal`) ;
- `agrege.ipsatif` : proportions par pôle et par compétence, top 5, Herfindahl global,
  statistiques, `evolution_globale` ×59 (avec Herfindahl du jour).

Exclus assumés du diff (cf. §3) : `version`, `date_construction`, recopie brute `feuilles{}`.

### Détail étage B2 — règles retrouvées

Les trois règles que le plan demandait de rétro-découvrir sont retrouvées et vérifiées sur
la totalité des exemples :

- **Filtrage 61 → 54** : une compétence agrégée est rendue ssi
  `statut_final === "présence établie"` (équivalent, sur ce corpus, à
  `nb_feuilles_etablies > 0`). Vérifié : les 7 domaines rendent 10+9+5+8+7+8+7 = 54
  compétences, longueurs identiques à l'oracle.
- **Quintiles → `niveau`** : 54/54 exacts (distribution 10/11/11/11/11). Formule au §2.
- **`archetype`** : arbre de décision retrouvé, 54/54 exacts (aucun cas indécidable — la
  règle est bien déterministe, elle n'a PAS dû être reclassée en sortie LLM). Formule au §2.

---

## 2. Formules et règles rétro-découvertes

**Cette section est désormais la spécification de référence du merge** (les commentaires
d'en-tête de `merge.js`, `narrative-prompts.js` et `merge-document.js` en sont la copie de
travail). Toute réimplémentation doit reproduire ces règles à l'identique.

### 2.1 Arrondis — la clé de la parité numérique

- **`pythonRound(x, n)`** (`merge.js`) : `round()` de Python 3 = arrondi décimal de la
  **valeur binaire exacte** du double, demi vers le chiffre pair (*banker's rounding*),
  implémenté via l'expansion décimale exacte (`toFixed(n+60)`) + BigInt.
  `Math.round(x·10^n)/10^n` diverge **réellement** sur le corpus (1 cas à 4 décimales :
  `round(5.17/8, 4)` = 0.6462 en Python, 0.6463 via Math.round).
- **`formatFixed2(x)`** (`narrative-prompts.js`) : `'%.2f'` de Python = arrondi correct à
  2 décimales du double exact, demi vers le pair. `toFixed(2)` de JS arrondit les
  demi-valeurs exactes vers le haut (0.625 → Python `0.62`, toFixed `0.63`) : divergence
  potentielle contrôlée par le jumeau exact.

### 2.2 Étage A — merge numérique

- **Score d'une feuille pour une compétence** : `score = round(preuves + indices × confiance, 2)`.
- **Agrégats par compétence, sur les SEULES feuilles « présence établie »** :
  - `cumul_preuves`, `cumul_indices` = sommes sur les feuilles établies ;
  - `confiance_moyenne = round(moyenne des confiances établies, 4)` (0 si aucune) ;
  - `score = round(cumul_preuves + cumul_indices × confiance_moyenne, 2)` — avec
    `confiance_moyenne` **déjà arrondie** à 4 décimales (ordre des arrondis significatif) ;
  - `score_moyen_par_feuille = round(score / nb_feuilles_etablies, 4)` (0 si aucune) ;
  - `statut_final` = « présence établie » si ≥ 1 feuille établie, sinon « présence non
    établie » (« renvoi au cartographe » jamais observé en statut final, cf. §3).
- **Compétence absente d'un pôle d'une journée** (9 cas réels, tous le 2026-03-26) :
  entrée synthétique `{ statut: "présence non établie", court_circuit: true, confiance: 0,
  motif: "Compétence non triée pour cette feuille (court-circuit).", prescription: '',
  traces: [], pieces: [] }` — **sans** clé `pedagogue`.
- **`pedagogue: null`** (court-circuits + 40 cas hors court-circuit) → `{}` dans le merge.
- **Verdict de court-circuit** (`raison`/`prescriptionMinimale`) → `motif: ''`,
  `prescription: ''`.
- **Enrichissement des pièces** (jointure `pid` → `passagesSaillants` du pôle) :
  `extraitVerbatim` = pièce si présent, sinon passage, sinon `''` ; idem `auteur`.
- **Enrichissement des traces** (jointure `pieceId` → `pieces[].numero` puis `pid` →
  passage) : `{ pieceId, pidPassage (null si pièce introuvable), type, role,
  extraitVerbatim: LE PASSAGE (pas la pièce — vérifié sur les 15 cas du corpus où les deux
  textes divergent), contexte: la pièce, auteur: la pièce enrichie }`.
- **Par pôle** : `score_cumule = round(Σ scores arrondis des compétences, 2)` ;
  `evolution_par_feuille[].score = round(Σ scores des présences établies du jour, 2)`.
- **Ipsatif** : proportions = `round(score / Σ scores arrondis, 4)` ;
  Herfindahl = `round(Σ (score_i/total)², 4)` (0 si total nul) — idem par feuille sur les
  scores établis du jour ; top 5 = tri décroissant des compétences établies.

### 2.3 Étage B1 — prompts narratifs (69 fichiers)

- **Trois gabarits** (compétence / pôle / kairos), texte fixe extrait **verbatim** des
  fichiers oracle (constantes gelées dans `narrative-prompts.js` — ne pas reformuler).
- Dates au format français `JJ/MM/AAAA` + rappel ISO dans chaque en-tête de feuille ;
  nombres au format `%.2f` (cf. `formatFixed2`).
- **Le drapeau `court_circuit` gagne sur les données** : même quand la journée porte un
  motif (cas de la feuille 2026-03-26), seule la ligne de statut
  « court-circuit (compétence non triée pour cette feuille) » est émise.
- Les traces **sans `extraitVerbatim` sont sautées** (5 occurrences dans le corpus).
- `motif`/`prescription` vides → lignes omises.
- Blocs de rapports (pôle/kairos) : un bloc par feuille, **vide si le run du jour n'a rien
  produit** (observé : 2026-01-06 partout, 2026-03-07 sur le pôle 6) ; texte interpolé
  verbatim moins le saut de ligne final (l'oracle le supprime).
- Ordre de génération : compétences par code croissant, pôles 1..7, kairos.

### 2.4 Étage B2 — document merge final

- **Filtrage** : rendu ssi `statut_final === "présence établie"` (61 → 54).
- **`niveau` (1..5)** : quintile du `score_moyen_par_feuille` **parmi les compétences
  rendues**. Seuils = `statistics.quantiles(v, n=5)` de Python, méthode par défaut
  « exclusive » : 4 points de coupe aux positions 1-based `(len+1)·k/5`, interpolation
  linéaire ; `niveau = 1 + nombre de seuils ≤ valeur` (une valeur égale au seuil bascule
  dans le quintile supérieur). Vérifié 54/54, distribution 10/11/11/11/11.
- **`points` = `nb_feuilles_etablies`** (54/54).
- **`archetype`** — arbre de décision, vérifié 54/54 :
  1. `nb_feuilles_renvois >= nb_feuilles_etablies` → `frontiere_en_mouvement` ;
  2. sinon `niveau === 3` → `en_formation` ;
  3. sinon `freqHaute = nb_feuilles_etablies >= médiane des nb_feuilles_etablies des
     compétences RENDUES du même pôle` :
     - `niveau >= 4` : `freqHaute ? trait_fondateur : pic_intensite` ;
     - `niveau <= 2` : `freqHaute ? presence_arriere_plan : touche_occasionnelle`.
- **Tendance temporelle des pôles** : feuilles chronologiques coupées en tiers à
  `floor(n/3)` et `floor(2n/3)` ; `t_i` = somme des `etablies` d'`evolution_par_feuille`
  par tiers ; `p_i = 100·t_i/total` (**bruts**, non arrondis pour la décision) ;
  `ecart_max_min = round(max−min, 1)` (arrondi pour l'affichage seulement). Si l'écart
  **brut** > 12 : `crescendo` si p3 max, `pic_milieu` si p2 max (`decrescendo` si p1 —
  non observé) ; sinon `presence_reguliere`. Vérifié 7/7 (dont le cas limite pôle 7 :
  écart 12.0 → régulière).
- **HTML** : gabarits reconstruits chaîne à chaîne (badge, `score-summary`, histoire
  d'apprentissage, liens feuilles `feuilles/<date>/carto-day.html?focus=<code>`, rapports
  de pôle avec tableau d'évolution — ligne liée ssi le rapport de la feuille existe —,
  kairos avec tableau d'évolution globale). Échappement identique à `html.escape` de
  Python (`'` → `&#x27;`). Détails de parité fine : pourcentage de confiance **tronqué**
  (`Math.floor(confiance_moyenne × 100)`, observé 54/54), pluriel ajouté sauf pour N = 1
  (« 0 preuves décisives » observé), span renvois omis quand 0 renvoi (observé : 3.06,
  6.01), `score` affiché `Math.round`, intensité `toFixed(2)`.
- **Conversion Markdown → HTML des narratifs** : sous-ensemble exact du convertisseur du
  prototype — `##` → `<h4>` (niveau + 2), une ligne non vide = un `<p>`, listes `- `
  fusionnées à travers les lignes vides dans le même `<ul>`, `> ` → `<blockquote>`
  (lignes consécutives fusionnées), `**gras**`/`*italique*`/`` `code` `` inline,
  échappement AVANT pose des balises.
- Couleurs de pôles, titres/descriptions d'archétypes et de tendances : constantes gelées
  (extraites du document réel).

### 2.5 Invariants du protocole d'extraction (corpus complet, base de l'étage C)

Relevés sur les 59 journées × 61 compétences :

- 1653 court-circuits, tous avec `raison = "aucune pièce extraite par le Greffier"`,
  `confiance: 1`, 0 preuve / 0 indice, `pedagogue: null` ;
- `verdict.confiance = conclusionAdversariale.confianceFinale` : **1937/1937** ;
- `nombrePreuves`/`nombreIndices` = comptage des rôles des `tracesRetenues` :
  **1126/1162** (les 36 écarts sont des incohérences du LLM d'origine, pas une règle) ;
- typologie des attaques a..h rétro-nommée depuis les 2895 `motifAttaque` du corpus (les
  raisonnements citent littéralement « (a) insuffisance probatoire », « (g)
  mouvement-vers »…) ; verdicts d'attaque à 3 valeurs ; statuts à 3 valeurs.

---

## 3. Points de non-parité assumés

1. **Contenu des narratifs LLM** (feedback des compétences, rapports de pôle, kairosHtml) :
   sorties de modèle non reproductibles. Seule la **structure de prompt** est testée (B1,
   69/69) ; dans B2 les narratifs réels (`llm_outputs/*.md`) sont injectés tels quels via
   `narrativeTexts` et le harnais vérifie l'**assemblage** (54/54 feedback HTML identiques).
   Justification : c'est la frontière déterministe/stochastique du pipeline ; le
   déterminisme s'arrête au prompt et reprend à l'injection.
2. **Étage C recréé sans oracle** : les prompts d'extraction Aurora v3 originaux n'existent
   pas dans les assets. `buildExtractionPrompt` (×7 pôles) et
   `buildKairosExtractionPrompt` (×1) sont **réécrits** depuis le protocole observé
   (§2.5) ; la sortie est vérifiée **structurellement** (ajv contre
   `cartographie-jour.schema.json` + invariants), jamais par diff de contenu. Qualité à
   valider par le banc d'essai P10 (multi-run de consistance, module P5 `consistency.js`).
3. **Horodatages et champs volatils** : `date_construction` (et `generatedAt` qui en
   dérive) exclus du diff A — contexte d'exécution, pas logique métier. `version`
   (`merge-v1`) recopiée mais non testée. La recopie brute `feuilles{}` de
   `carto_merge.json` (duplication intégrale des entrées) n'est pas reproduite :
   redondante, cf. `docs/contrats.md`.
4. **Appris pendant l'exécution — cas indécidables documentés** (nouveaux par rapport au
   plan initial, reportés dans `plan-portage-moteur.md`) :
   - **Seuil de tendance** : la coupure exacte est indécidable dans l'intervalle
     (12.0, 13.04] sur les 7 exemples disponibles ; **12 retenu** (compatible avec le cas
     limite réel : pôle 7, écart 12.0 → `presence_reguliere`).
   - **`decrescendo`** : jamais observé (aucun pôle décroissant) ; titre et description
     déduits par symétrie des trois libellés observés.
   - **« renvoi au cartographe » en statut final cumulé** : jamais observé (0 renvoyée sur
     61) ; la règle de déclenchement éventuelle est indécidable, le statut final implémenté
     est binaire (établie / non établie) et `competences_renvoyees` est calculé mais vaut
     0 sur tout le corpus.
   - **Cas dégénéré à 1 compétence rendue** : pas de quintiles possibles ; niveau 3 neutre
     choisi (non observé — le corpus en rend 54).

Aucun autre écart n'a été constaté : contrairement à l'hypothèse prudente du plan
(« archetype : si indécidable, la classer sortie LLM »), **l'archétype s'est révélé
entièrement déterministe** (arbre §2.4, 54/54).

---

## 4. Implications pour le rôle promptologue (P10)

Le portage fixe le point de départ de l'atelier promptologue (plan-prompts §P10, étape 1 :
« importe les versions existantes […] comme prompt-packages v1..n ») :

- **Les prompts d'extraction recréés sont la v1 du prompt-package par défaut.** Faute
  d'originaux, `buildExtractionPrompt` + `buildKairosExtractionPrompt`
  (`engine/src/pipeline/extract.js` — 8 appels LLM par journée : 7 pôles + 1 kairos) sont
  la **première version versionnable** du paquet : texte des prompts (protocole Greffier →
  Pédagogue adversarial avec typologie d'attaques a..h → Verdict → Audit → Rapporteur →
  Kairos), gabarits JSON de sortie stricts, et code d'orchestration JS. À importer en base
  comme `prompt-package` v1 dès P10, avec ce rapport comme changelog de genèse.
- **Les gabarits narratifs B1 sont, eux, prouvés à l'identique** (69/69) : ils entrent dans
  le paquet avec un statut plus fort — parité octale avec l'historique — et ne doivent être
  reformulés qu'en connaissance de cause (toute retouche crée une v2, jamais une correction
  silencieuse de la v1).
- **La validation de l'étage C est structurelle, pas de parité** : le banc d'essai P10
  (multi-run de consistance `engine/src/consistency.js`, comparaison A/B entre versions,
  schéma ajv) est l'outil de mesure de qualité des évolutions du paquet. Les invariants du
  corpus (§2.5 : constantes de court-circuit, confiance = confianceFinale, comptage des
  rôles) servent de tests de régression comportementale pour toute v2.
- **La typologie d'attaques a..h est désormais explicite et nommée** (rétro-nommée du
  corpus) : c'est un objet éditorial que le promptologue peut faire évoluer version par
  version, là où elle n'était qu'implicite dans les sorties du pipeline d'origine.
- Les formules du §2 étant la spec du merge, le promptologue n'a **pas** la main sur les
  étages A/B2 (déterministes, hors prompt-package) : son périmètre est C (extraction) et
  B1 (narratifs), exactement la frontière tracée par les oracles.

---

## Annexe — reproduction

```bash
node scripts/parity/parity-merge.mjs      # étage A  : 0 écart, exit 0
node scripts/parity/parity-prompts.mjs    # étage B1 : 69/69, exit 0
node scripts/parity/parity-document.mjs   # étage B2 : 81 OK / 0 DIFF, exit 0 (-v : verbeux)
cd engine && npm test                     # 176/176, 15 fichiers
```

Oracles (lecture seule) : `assets-existants/merge-prototype/intermediate/carto_merge.json`,
`assets-existants/merge-prototype/intermediate/prompts/`,
`assets-existants/merge-prototype/llm_outputs/`, `web/public/data/demo/merge.json` ;
entrées : `web/public/data/demo/jours/*.json` (59),
`web/public/data/referentiel/respire-v7.json`.
