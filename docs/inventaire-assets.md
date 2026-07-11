# Inventaire des assets existants

Inventaire d'`assets-existants/` (lecture seule — cahier §9 : « à intégrer, pas à recréer »). Toutes les structures ci-dessous ont été vérifiées par sondage direct des fichiers (node/python3, jamais de lecture intégrale des gros fichiers).

## merge-prototype/ (copie du « prototype merge », dernier travail sur données réelles)

Chaîne complète d'un merge réel : 59 feuilles de journal (22/12/2025 → 29/03/2026), protocole « Aurora v3 — pédagogue adversarial · merge évolutif v3 ».

### carto-data.js (887 Ko)
10 `const` top-level (l.7 → l.20392) :

1. **`domainsData`** — 7 pôles `{id, color, competences[], parFeuille[], tendance_temporelle, tendance_titre, tendance_description, tendance_stats, rapport_html}`.
   - Les 7 pôles : TETE, COEUR, MAIN, AME, RACINES, CITE, FLAMBEAU (id = `"TETE — Penser & Comprendre"`, etc.), une couleur hexa chacun.
   - `tendance_temporelle` observées : `presence_reguliere` (×5), `pic_milieu`, `crescendo` ; `tendance_stats` = `{t1,t2,t3,p1,p2,p3,ecart_max_min}` (scores par tiers de période).
   - `rapport_html` : rapport évolutif narratif du pôle, HTML pré-rendu.
   - `parFeuille` (niveau pôle) : `{date, score, etablies, renvois}` ×59.
   - **Compétence** (54 au total, uniquement les établies) : `{id, code, points, niveau, statut, description, feedback, archetype, archetype_titre, archetype_description, parFeuille[], nb_feuilles_etablies, nb_feuilles_renvois, score_cumule, score_moyen_par_feuille, cumul_preuves, cumul_indices, confiance_moyenne}`.
     - `points` = nb de feuilles où la compétence est établie (vérifié : 1.01 → points 21 = nb_feuilles_etablies 21) ; `niveau` 1-5 = quintile (distribution 10/11/11/11/11 sur 54).
     - `feedback` : HTML pré-rendu (badge verdict, résumé de scores, « Histoire d'apprentissage » = récit LLM, liste de liens `feuilles/<date>/carto-day.html?focus=<code>`).
     - `archetype` (6 valeurs, vérifiées par comptage) : `trait_fondateur` (10), `frontiere_en_mouvement` (19), `pic_intensite` (4), `presence_arriere_plan` (9), `touche_occasionnelle` (4), `en_formation` (8).
     - `parFeuille[]` : `{date, statut, preuves, indices, confiance, score}` ; statuts observés : `présence établie` (680), `présence non établie` (751), `renvoi au cartographe` (470) — les 54 autres occurrences du littéral « présence établie » dans le fichier sont le champ `statut` des 54 compétences, pas des entrées `parFeuille`.
2. **`profilMeta`** — `{journal_id:"merged", date_construction, premiere_date, derniere_date, nb_feuilles:59, feuilles_chronologiques[59], competences_etablies:54, competences_renvoyees:0, competences_orphelines:162, score_total:1478.18, indice_herfindahl:0.0285, evolution_globale[59]{date, score_total, etablies, renvois, non_etablies, herfindahl}, source_protocole}`.
3. **`kairosHtml`** — synthèse évolutive globale, long HTML narratif (portrait, forme du profil, fils transversaux, émergences, invitations, tableau d'évolution).
4. **`profilIpsatif`** — clés `"1"`..`"7"` : `{pole_num, pole_nom, score_cumule, proportion_globale, competences_etablies, competences[]{code, nom, score, proportion_globale, proportion_intra_pole}}` (10+9+5+8+7+8+7 = 54 compétences).
5. **`feuillesData`** — 59 entrées `{date, iso, label, ordre, carto_day_url}`.
6. **`rapportHtml`** — alias : `const rapportHtml = kairosHtml;`.
7-10. **4 const réservées vides** : `connexionsData = []`, `noeudsConceptuels = []`, `patternTemporel = {pattern:'', description:''}`, `piecesData = {}` — emplacements prévus mais non alimentés par le merge (les données correspondantes existent pourtant dans `extracted/*/kairos.json` et `pieces[]`).

### cartographie.html (1368 lignes)
Visualisation vanilla JS/SVG du merge : sunburst 2 anneaux (pôles + compétences). Fonctions clés : `generateData()` l.765 (consomme les const de carto-data.js), `renderCircularDiagram()` l.844, `createSectorPath()` l.1028, `renderDetailsPanel()` l.1043. Responsive géré en JS (slider de redimensionnement, plein écran). Contrairement aux prototypes React, **un bloc `@media print` existe (l.644)** avec bouton `#print-btn` (masque le diagramme, imprime le panneau d'infos). Les liens `feuilles/<date>/carto-day.html` référencés partout (feedback, kairosHtml, feuillesData) **ne correspondent à aucun fichier des assets** (vérifié par `find`) : la page « cartographie d'une journée » liée n'a pas été copiée.

### extracted/&lt;date&gt;/ (59 répertoires datés)
Sorties brutes de la cartographie journalière : 8 fichiers par date — `carto_P1.json` … `carto_P7.json` (un par pôle) + `kairos.json`. Structure vérifiée sur 2026-01-07 (P1) et 2026-03-29 (P4) :
- `carto_P<n>.json` : `{poleNum, passagesSaillants[]{pid, feuille, extraitVerbatim…}, competences[]{code, courtCircuit, pieces[]{numero, pid, contexte}, pedagogue{presomptionAbsence, presomptionSycophantie, conclusionAdversariale}, verdict{statut, nombrePreuves, nombreIndices, confiance, motif, prescription}, tracesRetenues[]{pieceId, type, role}}, auditPole{competencesTotales, competencesNonCourtCircuit, presencesEtablies, renvoisCartographe, nonEtablies, courtCircuits}, rapport}`.
- `kairos.json` : `{kairos{apprenant{portrait…}}, emergencesCrossPoles{competencesOrphelines[]{titre, description…}, connexionsTransversales, noeudsConceptuels}}`.

### intermediate/carto_merge.json (37,8 Mo — sondé via python3, jamais lu en entier)
**Oracle de la rétro-ingénierie du merge** : le pipeline Python amont (`carto_merge.py`) n'est pas dans les assets ; ce fichier est la seule trace complète entrée/sortie. Structure : `{version:"merge-v1", date_construction, periode{premiere, derniere, nb_feuilles:59, feuilles_chronologiques}, feuilles{<date>:{date, carto_par_pole, kairos}} ×59, agrege{par_competence ×61, par_pole ×7, global{kairos_par_feuille, emergences_cumulees}, ipsatif{par_pole, top_5_competences, indice_herfindahl_global, statistiques, evolution_globale}}}`.
- `agrege.par_competence` (×61) : `{code, nom, pole, cumul_preuves, cumul_indices, confiance_moyenne, score, score_moyen_par_feuille, statut_final, nb_feuilles_etablies, nb_feuilles_renvois, nb_feuilles_non_etablies, presence_par_feuille}` → **le référentiel des 61 compétences `{code, nom, pole}` est extractible ici**.
- `agrege.par_pole` (×7) : `{pole_num, pole_nom, score_cumule, competences_etablies, competences_renvoyees, rapports_par_feuille, evolution_par_feuille}`.

### intermediate/prompts/ (69 fichiers) et llm_outputs/ (69 fichiers)
Décomptes vérifiés : 61 `competence_<code>.prompt.md` + 7 `pole_<n>…` + 1 kairos. Prompts LLM autoportants (contexte chiffré injecté + consignes : un paragraphe de prose ≤ 600 caractères, trajectoire, « n'invente rien ») pour générer les récits « Histoire d'apprentissage ». `llm_outputs/` contient les 69 réponses (1 paragraphe chacune), réinjectées telles quelles dans les `feedback` / `rapport_html` / `kairosHtml` de carto-data.js (correspondance vérifiée sur 1.01).

## prototypes-react/ (anciens prototypes, format XML `<CARTO>` INCOMPATIBLE avec les données réelles)

Tous les `.tsx` parsent un document XML `<CARTO><GROUP>…` avec attributs (`NIVEAU`, `NIVEAU_MOYEN`…) — rien à voir avec les JSON réels ci-dessus. Dépendances : React, lucide-react, classes utilitaires Tailwind. **Aucun `@media print` dans tout le dossier** (vérifié par grep). Config `niveaux` 1-4 (Émergent/Praticien/Maître/Sage) dans tous les viewers, alors que les données (réelles comme fictives) utilisent 1-5.

| Fichier | Rôle / état |
|---|---|
| `cartography-viewer [OK].tsx` (49 Ko, 09/2025) | Viewer XML complet : sunburst, calendrier GitHub, timeline play/pause, undo/redo, `filterNodesByDate`. **OK**, référence de la famille. |
| `cartography-viewer+temporal-progression [WIP].tsx` | **Doublon strict** du précédent (MD5 identique) : la fusion annoncée par le nom n'a jamais commencé. |
| `cartography-viewer.tsx` (55 Ko, 11/2025) | Évolution du [OK] (GitHubCalendar refactoré `traces`→`data`, libellés jours, ~443 lignes de diff). État : fonctionnel présumé, doublon partiel. |
| `cartography-viewer-fixed.tsx` (48 Ko, 11/2025) | Variante « fixed » du viewer, même famille. Doublon partiel. |
| `cartography-viewer-responsive.tsx` (32 Ko, 09/2025) | Version mobile : **onglets** Arborescence/Historique (`activeTab`), calendrier par année scolaire. OK, source des patterns mobiles. |
| `temporal-progression [WIP].tsx` (29 Ko) | Vue calendrier GitHub seule. **JSX cassé l.465-471** (fragment `style={{…}} />;` orphelin + accolade excédentaire) — ne compile pas. |
| `temporal-progression-fixed.tsx` (29 Ko) | Même composant, version corrigée compilable. OK. |
| `temporal-progression-test.tsx` / `-test.patched.tsx` (22/24 Ko) | Variantes d'essai du même composant (diffs 367 /122 lignes). Doublons de travail. |
| `unified-cartography.tsx` (34 Ko, 09/2025) | Première tentative de fusion viewer + temporal (TS typé). WIP. |
| `UnifiedCartographyInterface.tsx` (44 Ko, 11/2025) | **Fusion la plus aboutie** : arbre + vue radiale + heatmap calendrier GitHub cliquable dans une même interface, TS typé. Référence pour P2. |
| `unified-competence-viewer.txt` (37 Ko) | Composant React complet sauvegardé en `.txt` (même famille unified). Brouillon/doublon. |
| `competences-data.js` (62 Ko, 11/2025) | Jeu de données **fictif** (« Référentiel Global pour l'Ère Post-AGI v2.0 », domaines A/B/C…, `points` 0-100, `niveau` 1-5), format objet JS `domainsData`. Consommé par carto-phone.html. Utile comme fixture de démo. |
| `carto-phone.html` (24 Ko, 11/2025) | Prototype mobile vanilla chargeant `competences-data.js`. OK. |
| `carto-phone-proto.html` (40 Ko, 11/2025) | Idem avec données fictives embarquées (`generateData()`). Doublon antérieur. |
| `cartographie-proto.html` (48 Ko, 11/2025) | Sunburst vanilla à données fictives embarquées — **ancêtre direct de merge-prototype/cartographie.html** (mêmes `generateData`/`createSectorPath`). Superseded. |

**Idées d'UI à retenir pour P2** : heatmap calendrier type GitHub (cliquable → jour), onglets mobiles Arborescence/Historique, `filterNodesByDate` (état de la carte à une date t), timeline play/pause, undo/redo de navigation. À noter aussi : la fonction `fixUTF8Encoding` présente dans la famille temporal signale des problèmes d'encodage dans les exports XML historiques.

## Formats observés & implications pour les schémas P1

| Format observé (source) | Schéma cible P1 | Transformation |
|---|---|---|
| `extracted/<date>/carto_P1..P7.json` + `kairos.json` (8 fichiers/jour ×59) | `cartographie-jour.schema.json` | Quasi directe : regrouper les 8 fichiers en un document/jour ; conserver verdict/pieces/pedagogue/passagesSaillants (justifications et confiance exigées par §4.3). |
| `carto-data.js` (10 const JS, HTML pré-rendu) | `cartographie-merge.schema.json` | Normalisation : repartir du JSON pur (`carto_merge.json.agrege`), séparer données et HTML (récits LLM bruts disponibles dans `llm_outputs/`), couvrir les **61** compétences et non 54. |
| `carto_merge.json` → `agrege.par_competence` (×61 : code, nom, pole) | `referentiel.schema.json` | Extraction directe du référentiel 7 pôles / 61 compétences ; à croiser avec `assets-existants/referentiel/` (RESPIRE v7) quand disponible. |
| `intermediate/prompts/*.prompt.md` (69 prompts autoportants) | `prompt-package.schema.json` | Modèle du couple prompt-texte + variables injectées ; base des prompt-packages versionnés (§4.3). |
| `carto_merge.json` (entrées `feuilles` + sorties `agrege`) | — (oracle P5) | Rétro-ingénierie de la fonction merge (`carto_merge.py` indisponible) : comparer sortie du portage JS à `agrege` sur les 59 feuilles réelles. |

## Points de vigilance

1. **61 vs 54 compétences** : le référentiel compte 61 compétences, mais `domainsData` n'expose que les 54 établies. Les 7 jamais établies n'existent que dans `carto_merge.json` (`statut_final` ≠ établie). Le schéma merge doit couvrir les 61 (une compétence sans trace reste une donnée).
2. **HTML pré-rendu dans les données** (`feedback`, `rapport_html`, `kairosHtml`) : mélange données/présentation à défaire en P1 — les récits LLM bruts existent séparément dans `llm_outputs/`.
3. **Liens `feuilles/<date>/carto-day.html` morts** : référencés dans tout carto-data.js mais absents des assets. La vue « journée » devra être reconstruite depuis `extracted/` (c'est précisément la fusion P2, cahier §4.4/§9).
4. **Pipeline Python amont indisponible** : ni les prompts de cartographie journalière ni `carto_merge.py` ne sont dans ces assets ; `carto_merge.json` est le seul oracle pour valider le portage P5. Vérifier si `assets-existants/prompts-python/` (prévu au plan) sera livré.
5. **4 const réservées vides** (`connexionsData`, `noeudsConceptuels`, `patternTemporel`, `piecesData`) alors que `extracted/*/kairos.json` contient `connexionsTransversales`/`noeudsConceptuels` et que `pieces[]` existe par compétence : données perdues au merge, à réintégrer dans le schéma merge. Idem pour les 162 `competences_orphelines` cumulées, comptées mais non exposées.
6. **Mismatch niveaux** : données réelles `niveau` 1-5 (quintiles) vs configs TSX à 4 niveaux — à trancher dans le schéma avant P2.
7. **Format XML `<CARTO>`** des prototypes React incompatible avec les JSON réels : réutiliser les idées d'UI, pas les parseurs.
8. **Impression** : seul `merge-prototype/cartographie.html` a un `@media print` ; aucun prototype React n'en a. L'exigence « version imprimable » (§4.4) est à re-couvrir intégralement dans la fusion P2.
