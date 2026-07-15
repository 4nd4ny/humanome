# Spec de portage Twin9 — CONTRATS EXTERNES

> Contrat du porteur JavaScript. Source : `Twin9/` (Python, LECTURE SEULE).
> Couvre : PROTOCOLE.md, l'inventaire des gabarits `protocole/**/*.md`, `config.json`,
> `models.json`, le contrat viewer `window.CARTO9` (DONNEES.md + carto_evolutive.html),
> les invariants de `tests/tests.py`, `bench9.py`, et l'orchestrateur `twin9.py` (`executer()`,
> état persistant, `metrics_v9.json`).
>
> **CONFIDENTIALITÉ** : le TEXTE des prompts de `protocole/**/*.md` (et sa recopie dans
> PROTOCOLE.md, sections 2.x) est confidentiel et n'est JAMAIS reproduit ici. Chaque gabarit
> est référencé par nom de fichier, variables de gabarit et contrat de sortie uniquement.
> L'algorithme (formules, seuils, règles de résolution) est du comportement de code : il est
> documenté intégralement.

---

## 1. PROTOCOLE.md — document généré, pas une source

- **Rôle** : description textuelle de l'algorithme + recopie en clair de tous les prompts.
  Généré par `genere_protocole.py` (lit `protocole/`, `config.json`, et importe depuis le code
  `SEUILS_CONSENSUS`, `VERSION_PROTOCOLE`, `POLE_NOMS`, la banque de jurés). Il **ne dérive
  jamais** des fichiers réellement exécutés : à régénérer après toute retouche de prompt.
- **En-tête à reproduire côté JS** (parité des métadonnées) : protocole `v9.8-contre-lecture`
  (constante `VERSION_PROTOCOLE`, `aurora/journee.py:39`), personas `personas-v1`, empreinte
  personas `1ec337d3a2ef` (calculée, cf. §10.4).
- Le porteur JS doit produire l'équivalent (générateur de doc) OU au minimum exposer les mêmes
  constantes ; **l'empreinte de reprise dépend de `VERSION_PROTOCOLE` et de l'empreinte
  personas** — toute divergence invalide l'état persistant.

### 1.1 L'algorithme en clair (contrat de comportement, repris de PROTOCOLE.md §1)

Pipeline : **0. Découpage** (0 LLM) → **1. Par journée** (impression → tagging → ancrage →
heat → consensus → instruction rapide → tribunal → registre → déclassement/élagage) →
**2. Merge_v3** (fusion 0 LLM → scan global optionnel → second ressort → relectures →
gardien des formulations 0 LLM) → **3. Sorties**.

Seuils du consensus (défauts code `aurora/journee.py:36`, surchargés par
`config.seuils_consensus`) :

| Statut consensus | Règle |
|---|---|
| `non détectée` | aucun lecteur ≥ `conf_min` (0.4) |
| `corroborée` | ratio lecteurs ≥ `corrobore` (0.6), ≥ 2 **familles** (ou ≥ 2 lectures si collège mono-famille), ET « span partagé » (≥ 2 lecteurs sur le même code sur des caractères communs) |
| `à instruire` | ratio ≥ `instruire` (0.25) et ≥ `instruire_min_modeles` (2) lecteurs |
| `minoritaire` | le reste |
| registre | tags sous `conf_min` mais ≥ `suspicion_min` (0.15) → graines, rien n'est jeté |

Ancrage (0 LLM) : exact → normalisation espaces+typographie → fenêtre approchée difflib
ratio ≥ **0.82**. Introuvable = rejeté + compté (taux d'hallucination par lecteur).

Instruction rapide : pour CHAQUE compétence à signal (corroborée ou à instruire, **aucun
plafond**) : greffier (20) → juge léger (20b) × `juge_leger.passes` en conversations séparées.
Résolution mécanique (pièces d'abord, statuts ensuite) : concordance « établie » (pièces
communes ré-ancrées, barème respecté) → contre-lecture 20c (si activée) → publiée si 20c
confirme ; concordance « non établie » → non établie ; **tout désaccord** → tribunal.

Tribunal (séquence) : greffier (20) → accusation (21a) → défense (21b) → réplique (22a) →
briefing (22b) → jurés (23, parallèles, aveugles) → si position minoritaire : relance (23b)
+ second tour (23c, chacun UNE fois) → gardiens (25a support / 25b raisonnement, jamais de
position sur la présence) → **RÉSOLUTION CALCULÉE** (programme) → président (24, porte-parole).

Résolution calculée :
1. drapeau du gardien du raisonnement → **renvoi au cartographe** ;
2. aucune détection survivante → **présence non établie** ;
3. détection ET contestation subsistantes → **renvoi** ;
4. « le support gonfle » + détection isolée (< 2 détections) → **renvoi** (résolution durcie) ;
5. détection(s) que personne ne conteste → **présence établie**.

Garde-fous mécaniques : traces publiées = pièces du greffier citées par les détections
survivantes, RÉ-ANCRÉES verbatim (citation introuvable ≠ preuve) ; « présence établie »
exige ≥ 1 preuve OU ≥ 2 indices (barème v7) ; « preuve décisive » exige la convergence de
DEUX FAMILLES de modèles.

**Confiance calculée (déterministe)** — D/C/A = détections / contestations / abstentions
finales :
- établie : `min(0.95, 0.55 + 0.10×min(D,3) + 0.05×min(preuves,3) − 0.05×A)` ;
- non établie : `min(0.95, 0.60 + 0.10×C + 0.05×A)` ;
- renvoi : `0.5`.

Merge_v3 : établie ≥ 2 journées → `présence consolidée` ; 1 journée → `présence établie
(à confirmer)` ; trajectoires (consolidation, intermittence, émergence récente, apparition
isolée, en sommeil, frontière persistante, signal isolé, stable absente). Second ressort :
compétences jamais établies dont les suspicions **non jugées** reviennent sur
≥ `merge.seuil_faisceau_journees` (2) journées → instruction en FAISCEAU (mêmes prompts
21a→24), statut `établie par faisceau (second ressort)`. Autorité de la chose jugée : dossier
inchangé (empreinte) → verdict repris sans appel LLM ; seul un fait nouveau rouvre.

Trois étages de modèles :

| Étage | Rôles | Réglage |
|---|---|---|
| TAGGERS (v8) | N lecteurs × 7 pôles | `models.json`, `--models nom[:passes]` |
| RAPIDE (v6) | lecteur (10), greffier (20), juge léger (20b) ×N, contre-lecture (20c), gardien du support (25a) | `backend_rapide` ; à défaut `model_mini` de `backend_tribunal` |
| PROFOND (v7) | arène (21a-22b), jurés (23*), gardien du raisonnement (25b), président (24), second ressort, relectures, scan global | `backend_tribunal` |

---

## 2. Résolution des gabarits (`aurora/templates.py`)

- Syntaxe : `{$VARIABLE}` — regex Python `\{\$([A-Z_][A-Z0-9_]*)\}` (majuscules, chiffres,
  underscore ; commence par lettre majuscule ou `_`).
- `resolve(text, variables, strict=False)` : chaque `{$VAR}` remplacé par
  `str(variables['VAR'])`. Variable absente : **laissée telle quelle** + warning (une seule
  ligne listant les manquantes triées) ; en mode `strict` : erreur (`KeyError`). Le pipeline
  n'utilise jamais `strict=True`.
- `resolve_file(path, variables)` : lecture UTF-8 puis `resolve`.
- Parité : la substitution est un `re.sub` en un passage — une variable dont la VALEUR contient
  `{$AUTRE}` n'est **pas** re-substituée.

---

## 3. Inventaire des gabarits `protocole/**/*.md`

> Convention : « en-tête parsé » = des lignes `**Champ** : valeur` en tête du markdown de
> sortie que le code extrait mécaniquement (les enums ci-dessous sont le contrat de parsing,
> pas le texte du prompt). Les fichiers de cache indiqués sont écrits sous
> `resultats_v9/{run}/journees/{id}/…` et servent d'artefacts de reprise.

### 3.1 `tagger/P1.md` … `P7.md` — le référentiel RESPIRE (fiches, PAS des prompts)

- Aucun `{$VAR}`. Structure parsée par `aurora/referentiel.py` :
  titre `# Pôle N — NOM : sous-titre`, puis sections `## X.YY — Nom de la compétence`
  (essence, manifestations, traces obliques, distinction critique, pièges).
- Regex de découpe : `^##\s+(\d\.\d{2})\s*—\s*(.+?)\s*$` (MULTILINE) — le tiret est un
  **tiret cadratin** `—` (U+2014). `header` = texte avant la 1re section. Chaque compétence :
  `{code, nom, fiche_md}` (fiche_md = du `##` jusqu'à la section suivante, `.strip()`).
- 61 compétences au total sur 7 pôles ; codes uniques exigés (erreur sinon).
- `POLE_NOMS` : 1 `TÊTE — Penser & Comprendre`, 2 `CŒUR — Relier & Naviguer`,
  3 `MAIN — Créer & Incarner`, 4 `ÂME — Discerner & Juger`, 5 `RACINES — Évoluer & Résister`,
  6 `CITÉ — Gouverner & S'ouvrir`, 7 `FLAMBEAU — Transmettre & Piloter`.
- `Pole.fiche_complete(ordre)` : `header.rstrip() + "\n\n" + fiches jointes par "\n\n---\n\n"
  + "\n"`, sections éventuellement permutées (décorrélation par lecteur, cf. §10.5).

### 3.2 Étape scan (`protocole/scan/`) — backend PROFOND

| Fichier | Étape | Variables | Contrat de sortie |
|---|---|---|---|
| `00-condense-fidele.md` | 9bis-a, un appel par journée nouvelle | `{$JOURNEE_ID}` `{$DATE}` `{$TEXTE}` | Un unique bloc ```json : `{"condense_fidele": {"resume": str, "pepites": [str verbatim, 1-3], "forme": str, "singularites": str}}` (~400-700 caractères visés) |
| `01-arpenteur.md` | 9bis-b, 1 appel sur le portfolio ENTIER (condensés) | `{$JOURNAL_ID}` `{$PREMIERE_DATE}` `{$DERNIERE_DATE}` `{$NB_JOURNEES}` `{$LISTE_61}` `{$CONDENSES}` | Bloc ```json : `{"arpentage": {"observationsHorsReferentiel": [{titre, description, journeesCitees[], indices[], pourquoiHorsReferentiel, hypotheseFalsifiable, testEntretien, codesLesPlusProches[]}], "continuites": [{titre, description, journeesCitees[≥2], indices[], codesRelies[]}], "grainesReferentiel": [{code "X.YY", journeesCitees[], indices[], pourquoiInvisibleAuJour}]}}` |
| `02-retour-aux-sources.md` | 9bis-c, 1 appel par suspicion de l'Arpenteur | `{$TYPE}` `{$TITRE}` `{$DESCRIPTION}` `{$INDICES}` `{$DOSSIER}` (texte brut des journées citées) | Bloc ```json : `{"retour_aux_sources": {"issue": "retrouvée"\|"partiellement retrouvée"\|"non retrouvée", "extraits": [{"journee": id, "verbatim": str}], "commentaire": str}}` — chaque `verbatim` est ré-ancré mécaniquement ; extrait approximatif rejeté et compté contre le lecteur `arpenteur` |

### 3.3 Étape journée (`protocole/lourd/` + `tagger/1-tag-pole.md`)

| Fichier | Étape / cadence | Backend | Variables | Contrat de sortie / parsing | Cache |
|---|---|---|---|---|---|
| `lourd/10-premiere-impression.md` | 10 — 1×/journée, avant tagging | RAPIDE | `{$JOURNEE}` `{$PORTFOLIO}` | Markdown : titre `# Lecteur — Première impression — {id}`, sections `## Voix`, `## Texture`, `## Authenticité` (ligne `**Indicateur** :` parsée, enum `habitée`\|`mixte`\|`produite`), `## Question spontanée`. ≤ 250 mots. Nourrit jurés, gardien du support, kairos | `journees/{id}/10-premiere-impression.md` |
| `tagger/1-tag-pole.md` | tagging — N lecteurs × 7 pôles/journée | TAGGERS | `{$POLE_NUM}` `{$POLE_NOM}` `{$POLE_FICHES}` `{$JOURNEE}` `{$PORTFOLIO}` | Un unique bloc ```json : `{"tags": [{"competence": "X.YY", "extrait": str verbatim, "confiance": 0-1, "justification": str}], "alertes": [str]}` — zéro tag valide ; instructions embarquées signalées dans `alertes` | `journees/{id}/tags_{lecteur}_P{n}.json` |
| `lourd/20-greffier.md` | ouvre chaque instruction (léger ET tribunal partagent le dossier) | RAPIDE | `{$CODE}` `{$NOM}` `{$POLE_NUM}` `{$POLE_NOM}` `{$COMPETENCE_FICHE}` `{$FEUILLES}` `{$CALQUES}` | Markdown : `### Pièces extraites` avec `#### Pièce N` (champs `**Extrait**` « verbatim », `**Date**`, `**Localisation**`, `**Type**` ∈ {trace concrète, déclaration étayée, déclaration nue, intention, observation tierce}, `**Vigilance**` ∈ {aucune, généricité, fluidité suspecte, vocabulaire-signal, incohérence de registre}) + `### Bilan` (compteurs). Sentinelle EXACTE si vide : texte commençant par `DOSSIER VIDE` → **court-circuit** (présence non établie, confiance 0.9, étage `tribunal-court-circuit`). SEUL acteur à voir la superposition des calques | `journees/{id}/tribunal/{code}/20-greffier.md` |
| `lourd/20b-juge-leger.md` | ×`juge_leger.passes` (défaut config 2), conversations séparées | RAPIDE | `{$CODE}` `{$NOM}` `{$COMPETENCE_FICHE}` `{$DOSSIER}` `{$PASSE}` `{$PASSES}` | Markdown, **en-tête parsé** : `**Statut** :` ∈ {présence établie, présence non établie, renvoi au cartographe} ; `**Pièces retenues** :` liste `P<n> (type, rôle)` ou `—` ; `**Confiance** : 0.xx`. Corps : 3 sections Temps 1/2/3 + `**Motif du verdict**` + `**Prescription**`. Barème en cascade (cf. §1.1) et grille de confiance côté prompt, mais la résolution inter-passes est mécanique côté code | `journees/{id}/tribunal/{code}/20b-leger-{k}.md` |
| `lourd/20c-contre-lecture.md` | 1× SEULEMENT si les N lectures 20b concordent « établie » ; aveugle à leurs contenus ; désactivable (`--sans-contre-lecture`) | RAPIDE | `{$CODE}` `{$NOM}` `{$COMPETENCE_FICHE}` `{$DOSSIER}` `{$PASSES}` | Même en-tête parsé que 20b (`**Statut**`, `**Pièces retenues**`, `**Confiance**`). Résolution mécanique : « établie » → convergence confirmée, étage `leger-v6xN+cl` ; tout autre statut → tribunal + graine `contre-lecture` au registre | `journees/{id}/tribunal/{code}/20c-contre-lecture.md` |
| `lourd/21a-accusation.md` | arène — réquisitoire POUR | PROFOND | `{$CODE}` `{$NOM}` `{$COMPETENCE_FICHE}` `{$DOSSIER}` | Markdown libre (Thèse / Arguments avec pièces citées / Patterns / Auto-évaluation `forte`\|`modérée`\|`faible`). Non parsé mécaniquement : sert de variable `{$REQUISITOIRE}` en aval | `…/tribunal/{code}/21a-accusation.md` |
| `lourd/21b-defense.md` | arène — plaidoirie CONTRE (5 lignes d'attaque) | PROFOND | + `{$REQUISITOIRE}` | Markdown libre → `{$PLAIDOIRIE}` | `21b-defense.md` |
| `lourd/22a-replique.md` | arène — réponse attaque par attaque | PROFOND | `{$CODE}` `{$NOM}` `{$DOSSIER}` `{$REQUISITOIRE}` `{$PLAIDOIRIE}` | Markdown libre → `{$REPLIQUE}` | `22a-replique.md` |
| `lourd/22b-briefing.md` | arène — synthèse neutre, seule matière lue par les jurés | PROFOND | `{$CODE}` `{$NOM}` `{$REQUISITOIRE}` `{$PLAIDOIRIE}` `{$REPLIQUE}` | Markdown libre → `{$BRIEFING}` | `22b-briefing.md` |
| `lourd/23-jure.md` | 1×/juré, parallèles, aveugles entre eux | PROFOND | `{$JURE_NOM}` `{$JURE_ANGLE}` `{$CODE}` `{$NOM}` `{$COMPETENCE_FICHE}` `{$DOSSIER}` `{$BRIEFING}` `{$PREMIERE_IMPRESSION}` | **En-tête parsé** : `**Position** :` ∈ {détection, contestation, abstention} ; `**Pièces** :` (`P1, P3` ou `—`) ; `**Piège visé** :`. Détection sans pièce = nulle ; contestation nomme son piège | `23-{slug(juré)}.md` |
| `lourd/23b-relance.md` | second tour — rédigé par le juré MINORITAIRE (1 seul second tour) | PROFOND | `{$JURE_NOM}` `{$MA_POSITION}` `{$MA_POSITION_R1}` `{$CODE}` `{$NOM}` `{$DOSSIER}` | **En-tête parsé** : `**Position maintenue** :` (mêmes 3 valeurs, révision possible), `**Pièces**`, `**Piège visé**` ; corps = argument + questions | `23b-relance.md` |
| `lourd/23c-second-tour.md` | chaque AUTRE juré, une fois, en connaissance de la relance | PROFOND | `{$JURE_NOM}` `{$JURE_ANGLE}` `{$RELANCEUR_NOM}` `{$POSITION_RELANCEUR}` `{$RELANCE}` `{$MA_POSITION_R1}` `{$CODE}` `{$NOM}` `{$COMPETENCE_FICHE}` `{$DOSSIER}` `{$PREMIERE_IMPRESSION}` | **En-tête parsé** : `**Position** :` / `**Pièces**` / `**Piège visé**`. Positions finales = second tour (ou premier s'il n'y en a pas eu) ; le relanceur n'a pas de r2 : sa seconde parole EST la relance | `23c-{slug(juré)}.md` |
| `lourd/25a-gardien-support.md` | gardien n°1 — le canal, jamais la présence | **RAPIDE** | `{$CODE}` `{$NOM}` `{$COMPETENCE_FICHE}` `{$DOSSIER}` `{$PREMIERE_IMPRESSION}` `{$AVIS_JURES}` | **En-tête parsé** : `**Constat** :` ∈ {neutre, le support masque, le support gonfle} + `## Motif`. Effet : `gonfle` durcit la résolution ; `masque` verse une graine `support-masque` | `25a-gardien-support.md` |
| `lourd/25b-gardien-raisonnement.md` | gardien n°2 — vice de raisonnement du collège | PROFOND | `{$CODE}` `{$NOM}` `{$COMPETENCE_FICHE}` `{$DOSSIER}` `{$REQUISITOIRE}` `{$PLAIDOIRIE}` `{$AVIS_JURES}` | **En-tête parsé** : `**Drapeau** :` ∈ {aucun, vice de raisonnement} + `## Motif`. Drapeau → renvoi au cartographe | `25b-gardien-raisonnement.md` |
| `lourd/24-president.md` | porte-parole (APRÈS la résolution calculée) | PROFOND | `{$CODE}` `{$NOM}` `{$POLE_NUM}` `{$VERDICT_CALCULE}` (intangible) `{$DOSSIER}` `{$REQUISITOIRE}` `{$PLAIDOIRIE}` `{$REPLIQUE}` `{$AVIS_JURES}` `{$GARDIENS}` | Markdown (Délibération : synthèse des positions en table, second tour, gardiens, analyse réflexive, point du désaccord si renvoi ; Prescription) **PUIS bloc ```json final** : `{"prescription": {"pour_apprenant": str, "pour_cartographe": str\|null}}` — seul le JSON est parsé (statut/scores/jury déjà calculés) | `24-president.md` |

### 3.4 Étape merge (`protocole/merge/`) — backend PROFOND

| Fichier | Cadence | Variables | Contrat de sortie |
|---|---|---|---|
| `01-kairos-evolutif.md` | 1× en fin de merge | `{$PREMIERE_DATE}` `{$DERNIERE_DATE}` `{$NB_JOURNEES}` `{$DATES_LISTE}` `{$DONNEES}` | Un unique bloc ```json — objet `kairos_evolutif`, clés camelCase EXACTES : `{"kairos": {"apprenant": {"portrait", "formeProfil", "ceQuiRelieLesPoles", "ceQuiEmergeEntreLesLignes", "invitationsPourLaSuite": [3-5], "syntheseCompleteMarkdown"}}, "emergencesCrossPoles": {"competencesOrphelines": [0-3 × {titre, description, extraitsPortfolio[], pourquoiOrpheline, hypothese, testEntretien, enRelationAvecCodes[]}], "connexionsTransversales": [0-3 × {titre, description, codesRelies[], extraitsPartages[], metaPattern}], "noeudsConceptuels": [0-3 × {nom, description, codesRelies[]}], "patternTemporel": {"type": "spirale"\|"escalier"\|"linéaire"\|"régression productive"\|"chaotique"\|"indéterminé", "evidence"}, "coherenceImpressionsVerdicts": {"convergences", "divergences"}}}`. `syntheseCompleteMarkdown` : 5 titres exacts dans l'ordre `## Portrait`, `## La forme de votre profil`, `## Ce qui relie vos pôles`, `## Ce qui émerge entre les lignes`, `## Invitations pour la suite` (600-900 mots). Aucun code de compétence dans la prose apprenant. Échec → `kairos = null` (repli, incident compté) |
| `02-pole-evolutif.md` | 7× (un par pôle) | `{$POLE_NUM}` `{$POLE_NOM}` `{$NB_JOURNEES}` `{$PREMIERE_DATE}` `{$DERNIERE_DATE}` `{$DONNEES}` | Markdown court : titre `## Évolution du pôle {n} — {nom}` + 1-2 paragraphes (≤ 150 mots), sans codes → `rapports_poles[num]` |
| `03-competence-evolution.md` | ≤ `merge.max_histoires` (12) appels — consolidées / à confirmer / faisceau | `{$CODE}` `{$NOM}` `{$POLE_NUM}` `{$POLE_NOM}` `{$NB_JOURNEES}` `{$NB_JOURNEES_ETABLIES}` `{$PREMIERE_DATE}` `{$DERNIERE_DATE}` `{$STATUT_FINAL}` `{$TRAJECTOIRE}` `{$CUMUL_PREUVES}` `{$CUMUL_INDICES}` `{$CONFIANCE_MOY}` `{$SCORE_CUMULE}` `{$DONNEES}` | Un seul paragraphe markdown NU (3-5 phrases, ≤ 600 caractères, sans titre ni préambule) → `histoires[code]` |
| `04-rapporteur.md` | 1× — le rapport prescriptif final (v4-50), généré PENDANT le run | `{$JOURNAL_ID}` `{$NB_JOURNEES}` `{$PREMIERE_DATE}` `{$DERNIERE_DATE}` `{$DONNEES}` | Un unique bloc ```json : `{"rapport": {"journal_id", "date", "portrait", "forme_profil", "territoires_denses": [{competence_nom, description, extrait_portfolio}], "non_trouve", "emergences", "pistes": [≤5], "pour_cartographe": {"renvois": [{competence_code, question_entretien}], "alertes_gardien": [], "incoherences": str\|null, "vigilance_gaming": str\|null, "profil_ipsatif_complet"}, "rapport_complet_markdown"}}` (schéma v4 ; sections apprenant 800-1200 mots, sans codes). Échec → `rapport = null` + incident |

### 3.5 Annexe A de PROTOCOLE.md — valeurs attendues des variables (contrat d'assemblage)

| Variable | Valeur attendue | Source |
|---|---|---|
| `{$JOURNEE}` | id de la journée (unique, ex. `2026-03-04`) | découpage |
| `{$PORTFOLIO}` | texte intégral de la journée, balises de prompt neutralisées | portfolio |
| `{$POLE_NUM}` / `{$POLE_NOM}` | 1-7 / TÊTE, CŒUR, MAIN, ÂME, RACINES, CITÉ, FLAMBEAU | référentiel |
| `{$POLE_FICHES}` | fiche complète du pôle (`P{n}.md`), sections `## X.YY` **permutées par lecteur** (décorrélation §10.5) | référentiel |
| `{$CODE}` / `{$NOM}` | code (`1.04`) et intitulé de la compétence | référentiel |
| `{$COMPETENCE_FICHE}` | la seule section `## X.YY — …` de la fiche de pôle | référentiel |
| `{$FEUILLES}` | `═══ Feuille : {id} ═══` + texte de la journée (tribunal) ; ou dossier de faisceau assemblé mécaniquement (second ressort) | journée / merge |
| `{$CALQUES}` | superposition vivante pour la compétence : lignes `- « extrait » — calque {lecteur}, confiance 0.xx` (≤ 10 lignes, sous-seuil inclus) — GREFFIER SEULEMENT | calques |
| `{$PREMIERE_IMPRESSION}` | sortie complète du prompt 10 | étape 10 |
| `{$DOSSIER}` | sortie complète du greffier (20) | étape 20 |
| `{$REQUISITOIRE}` / `{$PLAIDOIRIE}` / `{$REPLIQUE}` / `{$BRIEFING}` | sorties complètes 21a / 21b / 22a / 22b | arène |
| `{$JURE_NOM}` / `{$JURE_ANGLE}` | nom + angle du juré (banque `tribunal9.py`, Annexe B) | tribunal |
| `{$MA_POSITION}` / `{$MA_POSITION_R1}` | position parsée du juré au 1er tour / son texte complet | parsing |
| `{$RELANCEUR_NOM}` / `{$POSITION_RELANCEUR}` / `{$RELANCE}` | juré minoritaire, sa position, son argument 23b | second tour |
| `{$AVIS_JURES}` | concaténation des voix finales des jurés (r1 + relance/r2), séparées par `---` | tribunal |
| `{$GARDIENS}` | sorties 25a + 25b concaténées | gardiens |
| `{$VERDICT_CALCULE}` | bloc résumé du verdict calculé : statut + motif de règle, D/C/A, second tour, constats gardiens, traces ancrées, confiance | résolution |
| `{$PREMIERE_DATE}` / `{$DERNIERE_DATE}` / `{$NB_JOURNEES}` / `{$DATES_LISTE}` | bornes/liste des dates de la période | merge |
| `{$DONNEES}` | kairos : résumés journaliers (établies + citations + authenticité) puis registre du ténu ; pôle : codes établis AVEC intitulés par journée ; histoire : attestations datées avec citations ; rapporteur : dossier complet | merge |

### 3.6 Le jury (Annexe B) — composition CALCULÉE, jamais par un modèle

- **Socle (4, toujours présents)** : Linguiste, Historien, Pédagogue, Sociologue.
- **Spécialiste du pôle (5e siège)** : P1→Ingénieur, P2→Interprète, P3→Artisan, P4→Éthicien,
  P5→Clinicien du récit, P6→Politiste, P7→Compagnon. Surchargeable par
  `config.jury.specialistes` / `jury.par_competence`.
- **Transversaux (règles mécaniques)** : **Archiviste** siège si l'impression du jour est
  `produite` (et `jury.archiviste_si_produite`) ; **Portraitiste** siège au second ressort
  (`jury.portraitiste_au_second_ressort`).
- **Modes** (`config.jury.mode` / `--jury`) :
  - `socle4+1` (défaut) : socle + spécialiste (+ transversaux sur règles) ;
  - `socle2+2` : Linguiste + Pédagogue + paire du pôle (`PAIRES_2PLUS2` :
    P1 Ingénieur+Historien ; P2 Interprète+Sociologue ; P3 Artisan+Historien ;
    P4 Éthicien+Archiviste ; P5 Clinicien du récit+Portraitiste ; P6 Politiste+Sociologue ;
    P7 Compagnon+Historien) ;
  - `aleatoire` : tirage pseudo-aléatoire DÉTERMINISTE (graine `jury.graine` + code + contexte)
    de `jury.taille_aleatoire` lunettes (2-6), SANS AUCUNE règle transversale ni surcharge
    (`composer_jury` retourne immédiatement : l'Archiviste ne s'ajoute jamais dans ce mode ;
    `test_jury_aleatoire_taille` tolère taille ou taille+1 par prudence, mais le code produit
    exactement `min(taille, 13)` jurés).
- `infos_personas()` → `{"version": "personas-v1", "empreinte": "%x" % stable_hash("|".join(
  "{nom}={angle}" pour nom trié de la banque))}` — l'empreinte change à toute retouche d'angle.

---

## 4. `config.json` — sémantique de chaque clé

| Clé | Valeur actuelle | Sémantique |
|---|---|---|
| `seuils_consensus.conf_min` | 0.4 | seuil d'entrée au consensus (un tag < conf_min ne compte pas) |
| `seuils_consensus.corrobore` | 0.6 | ratio de lecteurs pour `corroborée` |
| `seuils_consensus.instruire` | 0.25 | ratio pour `à instruire` |
| `seuils_consensus.instruire_min_modeles` | 2 | minimum de lecteurs pour `à instruire` |
| `seuils_consensus.suspicion_min` | 0.15 | plancher du registre des suspicions (sous conf_min) |
| `max_workers` | 6 | parallélisme (pool de threads) |
| `parallel_jures` | true | jurés du premier tour en parallèle |
| `juge_leger.passes` | 2 | lectures 20b par dossier (CLI `--leger-passes`) — **entre dans l'empreinte de reprise** (défaut 3 dans `empreinte_journee` si la clé manque !) |
| `juge_leger.contre_lecture` | true | active la 20c (CLI `--sans-contre-lecture` → false) — entre dans l'empreinte (défaut false si absent) |
| `jury.mode` | "socle4+1" | composition (cf. §3.6) — entre dans l'empreinte |
| `jury.taille_aleatoire` | 5 | taille du tirage en mode `aleatoire` (clampée [2,6] par la CLI) |
| `jury.graine` | 1 | graine du tirage aléatoire déterministe |
| `jury.archiviste_si_produite` | true | règle transversale Archiviste |
| `jury.portraitiste_au_second_ressort` | true | règle transversale Portraitiste |
| `jury.specialistes` | {} | surcharge {pole: nom_juré} du spécialiste |
| `jury.par_competence` | {} | surcharge {code: nom_juré} |
| `premiere_impression` | true | active l'étape 10 — entre dans l'empreinte |
| `backend_tribunal.kind` | "claude-cli" | backend de l'analyse PROFONDE (`claude-cli`, `anthropic`, `openai`, `ollama`, `mock`) |
| `backend_tribunal.cmd` | "claude" | binaire CLI |
| `backend_tribunal.model` | "claude-opus-4-6" | modèle profond (CLI `--modele-tribunal`) |
| `backend_tribunal.model_mini` | "claude-sonnet-4-6" | modèle de repli pour l'étage RAPIDE si `backend_rapide` absent (CLI `--modele-rapide` le surcharge alors) |
| `backend_tribunal.prix_usd_mtok` | [5.0, 25.0] | prix USD/Mtok [entrée, sortie] — projection bench9 |
| `backend_rapide.*` | kind claude-cli, model claude-sonnet-4-6, prix [3, 15] | backend de l'analyse RAPIDE (fournisseur libre) |
| `backend_tribunal_local` | ollama qwen2.5:14b, `donnees_sensibles_ok: true` | remplaçant BLOQUANT des deux étages en `--donnees-reelles` |
| `calques.accumulation` | true | stigmergie inter-exécutions (archives de calques sur texte identique) |
| `calques.max_archives` | 12 | plafond d'archives par journée (écrêtage) |
| `merge.relectures` | true | relectures génératives (CLI `--sans-relectures` → false) |
| `merge.max_histoires` | 12 | plafond d'appels 03-competence-evolution |
| `merge.second_ressort` | true | tribunal de second ressort (faisceaux) |
| `merge.seuil_faisceau_journees` | 2 | récurrence minimale (journées distinctes) d'une suspicion non jugée pour instruire un faisceau |
| `merge.rapporteur` | true | appel 04-rapporteur |
| `scan_global.enabled` | false | scan global (CLI `--scan-global` → true) |
| `scan_global.retour_max_caracteres` | 30000 | taille de LOT technique du retour aux sources (PAS un plafond d'instruction) |
| `_note` | — | documentation embarquée (à conserver telle quelle) |

Tous les seuils sont marqués **[CALIBRATION]** (à régler sur données réelles via bench9).
Aucun plafond d'instruction journalier : l'économie vient du routage.

## 5. `models.json` — sémantique de chaque clé

Objet `{"_note": str, "modeles": [ … ]}`. Chaque entrée :

| Clé | Sémantique |
|---|---|
| `name` | nom court du lecteur (clé des backends, des labels `tag_…`, de `ancrage_par_modele`) ; passes multiples → `name#k` |
| `kind` | type de backend : `anthropic`, `openai` (API compatible), `ollama`, (`mock` forcé par `--mock`) |
| `model` | id du modèle chez le fournisseur |
| `family` | famille pour l'exigence de diversité : deux modèles de la même famille ne comptent que pour une (corroboration) ; défaut si absente : `name.split("#")[0]` |
| `base_url` | endpoint (openai-compatibles et ollama) |
| `env_key` | nom de la variable d'environnement portant la clé API |
| `weight` | pondération du lecteur dans la heat map (défaut 1.0) |
| `enabled` | false = exclu du roster (sans passer par `--models`) |
| `donnees_sensibles_ok` | true = autorisé sur journaux réels (`--donnees-reelles`) — locaux uniquement (nLPD/RGPD) |
| `passes` | nombre de lectures décorrélées par défaut (défaut 1) ; surchargé par `--models nom:N` |
| `prix_usd_mtok` | [entrée, sortie] USD par Mtok pour bench9 (0 = local) |

Roster actuel : claude (anthropic, enabled), gpt (openai, enabled), gemini (openai/google,
enabled), grok (désactivé), deepseek (désactivé), qwen (ollama, sensibles_ok), glm (ollama,
sensibles_ok), minimax (désactivé), gemma (ollama, sensibles_ok, family google). En
`--donnees-reelles` seuls qwen, glm, gemma (+ minimax si activé) peuvent siéger.

---

## 6. Contrat viewer — `window.CARTO9` (DONNEES.md, INTÉGRAL)

Le fichier `carto-evolutive-data.js` (généré par `merge3.ecrire_sorties`) définit
`window.CARTO9` : depuis la v9.2 il embarque **le dossier clinique complet** (élève : suivre
le raisonnement ; enseignant : instruire un arbitrage), hors-ligne, sans autre fichier.
**Toute chaîne `</` y est échappée `<\/`** (texte d'élève sûr dans un `<script>`).

### 6.1 Racine

```
CARTO9
├─ journal_id, date, periode {debut, fin, n_journees}, roster [noms]
├─ personas {version, empreinte}, jury_mode
├─ kairos            ← palais mental JSON (schéma §3.4/01) — null si repli
├─ rapport           ← rapport final (Rapporteur, schéma v4 §3.4/04) — null si échec (incident compté)
├─ profil_ipsatif    {competences_etablies, competences_renvoyees,
│                     par_pole{POLE: {proportion %, competences[{code, nom, proportion,
│                     score_preuves, score_indices, score}]},
│                     concentration{top_5_competences[], part_du_top_5}}
│                     (aussi écrit dans profil_ipsatif.json — formule v4 : preuves + indices × confiance)
├─ kairos_evolutif   (markdown), rapports_poles {num: md}, histoires {code: md}
├─ journees [ … ]    ← une entrée par journée, ordre chronologique
└─ competences {code: …} ← les 61 compétences fusionnées
```

### 6.2 `journees[i]`

| Champ | Contenu |
|---|---|
| `id`, `date`, `titre` | identifiant unique (dates dupliquées suffixées `_b`), date ISO ou null |
| `texte` | texte intégral de la journée (affichage avec heat) |
| `segments` | heat map **opératoire** : `[{start, end, heat 0-1, models[], comps[], conf_moyenne, details[{model, code, conf}]}]` — les marques des codes dont le tribunal a conclu l'absence en sont déclassées (voir `spans_ecartes`) |
| `etablies`, `renvois` | listes de codes |
| `premiere_impression` | markdown du Lecteur — peut être null |
| `authenticite` | `"habitée" \| "mixte" \| "produite" \| null` |
| `consensus` | `{code: {statut, ratio, modeles[], span_partage}}` pour les 61 codes |
| `legers` | instruction rapide par compétence examinée : `{code: {lectures: [{statut, pieces[], conf}] (×passes), resolution, ecartes?[], dossier_vide?, erreur?}}` — fichiers `tribunal/{code}/20b-leger-{k}.md` |
| `graines` | registre des suspicions du jour : `[{code, nom, journee, date, source, detail, extrait, question, jugee?}]` — sources : sous-seuil, minoritaire, contre-lecture, contestation-jury, detection-jury, renvoi, overflow, support-masque (+ leger-ecarte, scan-global côté tests). `jugee` (optionnel) : instruite et non retenue (« tribunal du … : non retenue » / « second ressort … : faisceau non retenu ») — conservée en archive, ne redéclenche plus de jury sans fait nouveau |
| `validations` | métadonnées de la heat : `{code: {statut, voie "leger-v6xN"/"tribunal"/…, jury [composition] ou null, jury_mode, lectures_leger, n_traces}}` |
| `jury_mode` / `personas` | mode de composition du jour ; `{version, empreinte}` des personas |
| `spans_ecartes` | marques DÉCLASSÉES après verdict d'absence : `[{model, code, start, end, conf}]` — retirées de `segments`, archivées ici |
| `calques` | `[{id, lecteur, llm, passe, horodatage, n_tags, n_elagues?, source "run"/"archive"}]` — un calque par lecteur et par scan ; archives = exécutions antérieures sur texte identique (`--rescan`). Élagage post-verdict LOCAL au calque du run (magasin : `etat/calques/{journal}/{journee}.json`, sections `tags` vivants / `elagues` avec verdict) |
| `rejets` | citations non ancrées : `[{model, competence, extrait, motif}]` |
| `alertes_injection` | `[{model, alerte}]` |
| `verdicts` | `{code: verdict}` — complets (§6.3). Omis : les « non établie » sans matière (étage non-détectée) |

### 6.3 `journees[i].verdicts[code]` (Schéma 1 enrichi)

| Champ | Contenu |
|---|---|
| `statut` | `présence établie \| présence non établie \| renvoi au cartographe` |
| `etage` | `leger-v6xN \| leger-v6xN+cl \| tribunal \| tribunal-court-circuit \| minoritaire \| non-détectée` |
| `score_preuves`, `score_indices` | entiers, ou `"R"` si renvoi |
| `confiance` | 0-1, **mécanique** (déterministe) |
| `motif_regle` | règle de résolution appliquée, en clair (tribunal seulement) |
| `jury` | `{detections[], contestations[], abstentions[], second_tour, relance_par, positions_r1 {juré: pos}, positions_finales, pieges_nommes[], consensus, dissidences[]}` — null hors tribunal |
| `gardien` | `{support: {constat neutre/masque/gonfle}, raisonnement: {drapeau bool}}` — null hors tribunal |
| `traces_probantes` | `[{piece, extrait (ré-ancré verbatim), date, type, role}]` |
| `prescription` | `{pour_apprenant, pour_cartographe}` |
| `dossier_cartographe` | si renvoi : `{motif, desaccord, pieges_envisages[], citations[]}` |
| `deliberation` | le procès intégral (tribunal et court-circuit) — §6.4 |

### 6.4 `deliberation`

| Champ | Contenu |
|---|---|
| `greffier_md` | dossier des pièces |
| `arene` | `{accusation_md, defense_md, replique_md, briefing_md}` |
| `jures` | `{nom: {r1_md, r2_md, position_r1, position_finale, pieces[], piege}}` — composition dans `jury.composition`. **Le juré relanceur n'a pas de `r2_md`** : sa seconde parole EST `relance_md` |
| `relance_md`, `relance_par` | argument de réouverture (null si pas de second tour) |
| `gardiens` | `{support_md, raisonnement_md}` |
| `president_md` | récit du porte-parole |

Chronologie d'affichage suggérée : greffier → accusation → défense → réplique → briefing →
jurés r1 → relance → jurés r2 → gardiens → *résolution calculée* (`motif_regle` +
`jury.positions_finales`) → président.

### 6.5 `competences[code]`

| Champ | Contenu |
|---|---|
| `statut_temporel` | `présence consolidée \| présence établie (à confirmer) \| établie par faisceau (second ressort) \| renvoi au cartographe \| présence non établie` |
| `trajectoire` | consolidation, intermittence, émergence récente, apparition isolée, en sommeil, frontière persistante, signal isolé, stable absente |
| `attestations` | `[{jour_index, journee, date, etage, confiance, score_preuves, score_indices, citations[]}]` — additives, datées |
| `signaux` | `[{jour_index, journee, type renvoi/minoritaire/instruite/faisceau-renvoi}]` |
| `heat_timeline` | heat max par journée (même ordre que `journees`) |
| `graines`, `graines_recurrentes` | registre cumulé (mêmes objets que côté journée) |
| `faisceau` | si second ressort : `{statut, confiance, motif, prescription, traces[], jury, gardien, dossier_cartographe, deliberation}` — autorité de la chose jugée (dossier inchangé non réinstruit) |
| `cumul_preuves`, `cumul_indices`, `confiance_moyenne`, `score_cumule`, `pole`, `nom` | agrégats |

### 6.6 Autres fichiers de sortie

- `carto_evolutive.json` — même contenu que `CARTO9.competences` + relectures (sans les journées).
- `journees/{id}/carto_jour.json` — cartographie journalière complète (source des entrées
  viewer) + `empreinte`, `ancrage_stats_jour`, `incidents_jour`.
- Les procès restent archivés en markdown : `journees/{id}/tribunal/{code}/*.md` et
  `second_ressort/{code}/*.md` (chemins donnés dans le cahier du cartographe).
- Ordres de grandeur : mock/PLANT-01 (10 journées) ≈ 1,3 Mo de data.js ; roster réel : 3-6 Mo.
  Optimisation naturelle si lent : charger `deliberation` à la demande depuis les
  `carto_jour.json`.

### 6.7 Survol `viewer/carto_evolutive.html` (234 lignes, autonome, hors-ligne)

- Une page statique + `<script src="carto-evolutive-data.js">` ; défaut si absent :
  `{journees: [], competences: {}, periode: {}}`.
- 3 onglets : **Synthèse** (kairos_evolutif en markdown minimal + compétences actives triées
  par `score_cumule` décroissant, sparkline sur `heat_timeline`), **Carte additive** (matrice
  compétences × journées, tri par code croissant), **Journées** (boutons par journée).
- Compétence « active » = `statut_temporel !== "présence non établie" || signaux.length > 0`.
- Mapping CSS des statuts : consolidée→`s-cons`, à confirmer et faisceau→`s-conf`,
  renvoi→`s-renv`, autre→`s-abs`.
- **Formules d'opacité** (parité visuelle) : cellules/sparkline `0.08 + 0.8×heat`
  (`.toFixed(2)`), cellule sans heat `0.04` ; surlignage du texte (`<mark>`)
  `--a = 0.10 + 0.8×heat` ; tooltip heat `(100×x).toFixed(0)%`.
- Rendu du texte du jour : itération sur `segments` triés (start croissant), texte hors
  segments échappé, segments dans `<mark>` avec title `models — comps`.
- Fonctions globales : `CARTO9_vue(nom)`, `CARTO9_jour(i)`, `CARTO9_comp(code)`.
- `esc()` échappe `& < " '` ; `md()` rend `## `→h2, `> `→blockquote (après échappement,
  matche `&gt; `), `**x**`→b, `\n\n`→`<p>`.
- Attestation sur la matrice : bord vert (`outline`) si `attestations.some(jour_index===i)` ;
  pointillé violet si signal `renvoi` ce jour.

---

## 7. `tests/tests.py` — les 25 invariants (oracle de la chaîne, mock déterministe)

Cadre : mock only, `salt="test-proto"` (ou dédié), 3 journées par défaut, état désactivé sauf
tests d'état. Portfolio de référence : `tests/portfolios/PLANT-01.md`.

**§1 Pipeline (jours=4)**
1. `test_sorties_completes` — les 6 sorties existent et > 100 octets (`carto_evolutive.json`,
   `rapport_evolutif.md`, `rapport.md`, `profil_ipsatif.json`, `metrics_v9.json`,
   `viewer/carto_evolutive.html`) ; 4 journées ; aucun incident `*_echec` ; `jury_mode` ∈
   {socle4+1, socle2+2, aleatoire} ; `personas.version` et `.empreinte` présents.
2. `test_schema_verdicts` — chaque verdict : `code` == clé, `statut` ∈ 3 statuts jour,
   `0 ≤ confiance ≤ 1`, `etage` commence par `leger-v6x` ou ∈ {tribunal,
   tribunal-court-circuit, minoritaire, non-détectée} ; si établie : `score_preuves ≥ 1 OU
   score_indices ≥ 2` ET `traces_probantes` non vide.
3. `test_traces_ancrees_verbatim` — chaque `traces_probantes[].extrait` est une sous-chaîne
   EXACTE du texte de sa journée, et porte une `date`.
4. `test_resolution_calculee_personne_ne_vote` — étage tribunal : `motif_regle` présent ;
   établie ⇒ détections non vides ET aucune contestation ; non établie ⇒ aucune détection ;
   renvoi ⇒ (détection ET contestation) OU drapeau gardien OU (constat `gonfle` ET < 2
   détections).
5. `test_registre_rien_ne_se_perd` — graines non vides ; `source` ∈ {sous-seuil, minoritaire,
   leger-ecarte, contre-lecture, contestation-jury, detection-jury, renvoi, support-masque,
   scan-global} ; chaque graine a `question` et `code`.
6. `test_profil_ipsatif_100` — somme des `par_pole[*].proportion` = 100.0 ± 0.5 ;
   `concentration.top_5_competences` non vide.
7. `test_statut_temporel_et_trajectoires` — consolidée ⇒ ≥ 2 attestations ; à confirmer ⇒
   exactement 1 ; attestée ⇒ `trajectoire` non vide ; ≥ 1 consolidée sur 4 journées.
8. `test_viewer_embarque` — le HTML contient `CARTO9` et fait > 10 000 caractères.

**§2 Instruction rapide (salt="cltest")**
9. `test_contre_lecture_par_defaut` — étage `leger-v6x2+cl` présent ; fichiers
   `20c-contre-lecture.md` écrits ; au moins une convergence cassée (résolution contenant
   « contre-lecture » et « résisté ») ; graines source `contre-lecture` avec « contre-examen »
   dans la question.
10. `test_leger_passes_remonte_et_sans_cl` — `--leger-passes 3 --sans-contre-lecture` : étage
    `leger-v6x3`, aucun étage `*+cl`, aucun fichier 20c, labels `leger_*_p3` présents aux
    métriques, aucun label `contre-lecture_*`.

**§3 Options**
11. `test_jours_limite` — `jours=2` ⇒ `resume.n_journees == 2`.
12. `test_sans_relectures` — pas d'étape `relectures` dans `metrics.par_etape`.
13. `test_nlpd_filtre_roster` — `--donnees-reelles` : roster ⊆ {qwen, glm, gemma, minimax}
    (base du nom avant `#`) ; claude/gpt/gemini absents.
14. `test_passes_multiples_mono_famille` — `--models qwen:2` : roster == [qwen#1, qwen#2] ;
    des entrées consensus `corroborée`/`à instruire` portées par exactement ces 2 lecteurs ;
    des statuts produits.
15. `test_jury_socle2plus2` — `jury_mode` propagé dans carto ; chaque tribunal contient
    Linguiste ET Pédagogue.
16. `test_jury_aleatoire_taille` — mode aléatoire taille 3 : chaque tribunal a 3 ou 4 jurés
    (Archiviste éventuel).

**§4 État persistant**
17. `test_reprise_puis_invalidation_par_config` — run 2 identique : `appels_llm < moitié` du
    run 1 et **mêmes statuts** ; run 3 avec `leger_passes=3` : appels > run 2 (l'empreinte
    invalide, jamais de réutilisation d'artefact périmé).
18. `test_rescan_cumule_les_calques` — `--rescan` : `len(calques)` du 2e run > 1er run pour la
    même journée.

**§5 Fumée CLI**
19. `test_cli_twin9` — exit 0 ; dernière ligne stdout = JSON `resume` ; `n_journees == 1`.
20. `test_cli_bench9` — `bench9.py --runs 1 --jours 2 --mock` exit 0.

**§6 Scan global (état partagé, salt="test-scan")**
21. `test_1_sans_scan_inchange` — scan off : pas de `scan_global.json`, pas de section
    « L'Arpenteur — ce que le découpage » au rapport, `metrics.scan_global` null, pas d'étape
    `scan-global`, pas d'entrée `arpenteur` dans l'ancrage.
22. `test_2_scan_e2e` — `scan_global.json.observations` non vide ; orphelines
    (`type == "hors-referentiel"`) présentes avec `hypotheseFalsifiable` + `testEntretien` et
    **sans** graines ; chaque observation a `extraits_ancres` avec `span` + `verbatim` ;
    graines `scan-global` au registre (extrait non vide, question contenant « portfolio
    entier », compte == `carto.scan_global.graines_versees`) ; ≥ 1 rejet d'ancrage compté pour
    `arpenteur` ; étape `scan-global` aux métriques ; rapport avec sections « L'Arpenteur — ce
    que le découpage » et « Hypothèse falsifiable ».
23. `test_3_incremental_chose_vue` — run identique : `passe_globale_rejouee == false`,
    `condenses_repris == n_journees`, AUCUN appel scan aux métriques, mais versement rejoué
    (`graines_versees` > 0).
24. `test_4_carte_se_souvient` — scan désactivé avec observations en état : pas de
    `scan_global.json`, pas d'appels, mais graines toujours versées (additif) + section
    Arpenteur au rapport.
25. `test_5_fait_nouveau_journee_ajoutee` — 1 journée ajoutée (même `journal_id`) :
    `passe_globale_rejouee == true`, `condenses_repris == n_journees − 1`, exactement 1 label
    `condense_*` et un label `arpenteur_global`.

---

## 8. `bench9.py` — survol (5 axes + jury, projection de coût)

R runs indépendants (`etat=False`, `salt="bench-run{k}"`) → `bench_report.json` +
`bench_report.md` dans `resultats_bench/{id}_{date}` (ou `--out`).

| Axe | Contenu |
|---|---|
| **Coût** (`axe_cout`) | tokens ≈ `caractères/4` (in = `prompt_chars/4`, out = `response_chars/4`) ; prix : backend `_tribunal` → `config.backend_tribunal.prix_usd_mtok` (défaut [5, 25]), `_rapide` → `config.backend_rapide.prix_usd_mtok` (défaut [3, 15]), sinon `models.json[name.split("#")[0]].prix_usd_mtok` (défaut [0,0] ; `qwen#2` → tarif de qwen) ; `usd = (t_in×p0 + t_out×p1)/1e6` ; agrégats par étape et par modèle, moyennes par run (division entière `int(x/n)` pour appels/tokens, `round(x/n, 4)` pour USD) |
| **Rapidité** (`axe_rapidite`) | mur total et par étape, secondes LLM cumulées, `gain_parallelisme = LLM cumulé / mur` (null si LLM < 1 s), latence par appel : moyenne + p95 (`sorted(lat)[int(0.95×(len−1))]`) |
| **Reproductibilité** (`axe_reproductibilite`) | ≥ 2 runs ; accord exact des `statut_temporel` par compétence ; **kappa de Fleiss** sur la matrice items×5 catégories (None si < 2 runs ou variance nulle) ; Jaccard des attestations journalières (paires de runs, ensemble de tuples (journée, code)) ; liste des compétences instables |
| **Fiabilité** (`axe_fiabilite`) | taux d'ancrage moyens par modèle, rejets totaux, incidents cumulés, échecs d'appels, violations « établie sans trace », complétude 61 |
| **Pertinence** (`axe_pertinence`, si GT `tests/gt/gt_{id}.json`) | précision/rappel/F1 à 2 seuils : « présent » (attendu ≥ 1 ; détecté = statut ∈ {consolidée, à confirmer, faisceau}) et « franche » (attendu ≥ 2 ; détecté = {consolidée, faisceau}) ; MAE sur barème 0-3 via `_score_v9` (consolidée → 3 si `cumul_preuves ≥ 4` sinon 2 ; faisceau → 2 ; à confirmer → 1 ; renvoi → 1 ; sinon 0) ; **Spearman** (rangs moyens ex æquo, None si < 3 points) entre scores GT et `score_cumule` ; anti-gaming (pièges = codes GT avec `traces_plantees` contenant « PIÈGE » ou « Déclaration » et `score_attendu ≤ 1` ; évité si statut ≠ consolidée) ; couverture des `journees_attendues` (intersection avec les dates d'attestations). En mock : avertissement (mesure la chaîne, pas les modèles) |
| **Jury** (`axe_jury`, « la valeur des lunettes ») | par juré cumulé sur les runs : sièges, détections/contestations/abstentions (positions_finales), revirements (position_r1 ≠ finale), détections solitaires et solitaires publiées |

CLI : `--portfolio --runs(3) --mock --gt --out --models --sans-relectures --jours
--donnees-reelles --config --jury --jury-taille`. Sortie stdout : JSON
`{out, cout_usd, accord, kappa, f1_seuil1}`.

---

## 9. `twin9.py` — `executer()` : l'enchaînement exact

### 9.1 Signature

```python
executer(portfolio_path, out_dir=None, roster_path=None, config_path=None,
         mock=False, donnees_reelles=False, only=None, salt=None,
         sans_relectures=False, jours=None, etat=True, etat_path=None,
         modele_tribunal=None, modele_rapide=None, rescan=False, jury_mode=None,
         jury_taille=None, scan_global=False, leger_passes=None,
         sans_contre_lecture=False) -> dict  # resume
```

`parse_models_arg("qwen:3,glm")` → `{"qwen": 3, "glm": None}` (None = passes de models.json ;
`max(1, int(k))` ; entrées vides ignorées ; retourne None si chaîne vide/None).

### 9.2 Étapes, dans l'ordre STRICT

1. **Config** : charge `config_path` ou `{impl}/config.json` si existant (sinon `{}`), puis
   surcharges CLI dans cet ordre : `sans_relectures` → `merge.relectures=False` ;
   `modele_tribunal` → `backend_tribunal.model` ; `modele_rapide` → `backend_rapide.model` SI
   `backend_rapide` existe, SINON `backend_tribunal.model_mini` ; `jury_mode` → `jury.mode` ;
   `jury_taille` → clamp `max(2, min(6, int(t)))` (+warn) → `jury.taille_aleatoire` ;
   `scan_global` → `scan_global.enabled=True` ; `leger_passes` → clamp `max(1, int(p))` →
   `juge_leger.passes` ; `sans_contre_lecture` → `juge_leger.contre_lecture=False`.
2. **Découpage** : `pf = split_portfolio(path)` → `{journal_id, feuilles[{id, date, titre,
   texte}]}` ; `date = datetime.date.today().isoformat()` ; suffixe `_%H%M%S` si `rescan` ;
   `base = out_dir` ou `{impl}/resultats_v9/{journal_id}_{date}{suffixe}` ; création
   `base/journees/`.
3. **Roster** (`_charger_roster`) : itère `models.json.modeles` dans l'ordre du fichier ;
   filtre `enabled` ; filtre `only` (noms) ; filtre nLPD (`donnees_reelles` et non
   `donnees_sensibles_ok` → exclu + warn) ; passes = `only[name]` si dict sinon
   `int(m.passes, défaut 1)` ; si passes > 1 : copies `name#k` (k=1..N) avec `passe=k` et
   `seed = stable_hash("{name}|passe{k}") % (2**31 − 1)`. Roster vide → RuntimeError. Si
   `mock` : `kind="mock"` partout. Si `salt` : `salt` posé partout. Enfin, pour toute entrée
   avec `passe` : `salt = "{salt_actuel_ou_vide}|passe{k}"` (décorrélation, y compris en mock —
   sans salt de run cela donne `"|passe2"`).
4. **Familles** : `sorted({m.family ou m.name.split("#")[0]})` ; si < 2 → warn mono-famille
   (la corroboration mesure la stabilité ; 2 lectures concordantes co-localisées suffisent).
5. **Backends** : un par entrée roster (`make_backend(spec)`, `kind` défaut mock).
   `bt_spec = dict(config.backend_tribunal ou {"kind": "claude-cli"})` ; si
   `donnees_reelles && !mock` → `_garde_backend_sensible` (BLOQUANT : accepte kind ∈
   {ollama, mock} ou `donnees_sensibles_ok` ; sinon remplace par
   `config.backend_tribunal_local` s'il est local/autorisé ; sinon RuntimeError) ; si mock →
   `kind="mock"` ; si salt → posé. **`config["backend_tribunal"] = bt_spec` (réinjecté : entre
   dans l'empreinte de reprise)**. Idem `backend_rapide` (optionnel) →
   `ctx.rapide = (backend, model)`.
6. **Référentiel** : `load_referentiel({impl}/protocole/tagger)` ; `poles` = liste ordonnée
   par numéro croissant (`sorted(poles_all)`).
7. **ctx** : `{impl_dir, protocole_dir, base_dir, logs_dir=journees_dir, journees_dir,
   journal_id, date, config, poles, backend_tribunal, rapide, calques_dir, incidents: {},
   textes_journees: {}, ancrage_stats: {}}`. `calques_dir` =
   `{dir(etat_path) ou {impl}/etat}/calques/{journal_id}{".mock" si mock}` si `etat`, sinon
   None (un état isolé n'accumule pas de calques dans le magasin du projet).
8. **Journées** : `journees = pf.feuilles[:jours]` si `jours` ; `textes_journees[id] = texte`.
   Si `etat` : `ep = etat_path` ou `{impl}/etat/{journal_id}{".mock" si mock}.json` ;
   `etat_data` = lecture ou `{"journal_id", "journees": {}}`. Écrit
   `base/journees_index.json` : `[{id, date, titre, caracteres: len(texte)}]`.
   `etapes.decoupage = round(t−t0, 2)`.
9. **Boucle par journée** : `fp = empreinte_journee(jr, roster, config)` (§9.3). Reprise si
   PAS `rescan` ET entrée d'état avec `empreinte == fp` : `carto = ent.carto` +
   `rehydrater(ctx, carto)` (re-cumule `ancrage_stats_jour` et `incidents_jour` dans le ctx —
   les métriques globales ne mentent pas après reprise). Sinon
   `cartographier_journee(ctx, jr, roster, backends)` puis état mis à jour :
   `{empreinte, date, titre, texte, carto}`.
10. **Carte additive** : les journées de l'état ABSENTES du fichier courant restent :
    itération `sorted(etat_data.journees.items())`, ajout des cartos (et
    `textes_journees.setdefault(jid, ent.texte)`). Tri final :
    `cartos.sort(key=lambda c: (c.date or c.journee, c.journee))`.
    `etapes.journees` arrondi 2 déc.
11. **Merge** : `ctx.etat_faisceaux = etat_data.setdefault("faisceaux", {})` (None sans état) ;
    `competences = fusionner(ctx, cartos)` ; **9bis AVANT le second ressort** : si
    `config.scan_global.enabled` → `ctx.etat_scan = etat_data.setdefault("scan_global", {})`
    puis `arpenter(ctx, cartos, competences, backend_tribunal)` ; SINON si l'état contient
    `scan_global.observations` → versement mécanique 0 LLM
    `verser_scan(ctx, competences, etat_scan)` (« la carte se souvient ») ;
    `second_ressort(...)` ; `rel = relectures(...)` ;
    `carto_evo = ecrire_sorties(ctx, cartos, competences, rel, roster)` ; écriture de l'état
    (`write_json(ep, etat_data)`). `etapes.merge`, `etapes.total`.
12. **Métriques** (§9.4) → `base/metrics_v9.json` ; **resume** retourné :
    `{base_dir, n_journees: len(cartos), statuts: carto_evo.statuts, appels_llm,
    tokens_estimes, duree_s, incidents, viewer: base/viewer/carto_evolutive.html}`.
    `main()` imprime `json.dumps(resume, ensure_ascii=False)` sur stdout (dernière ligne).

### 9.3 Empreinte de reprise (`empreinte_journee` — PARITÉ CRITIQUE)

```
empreinte(
  jr["texte"],
  sorted((name, model, family, weight[déf. 1.0], kind) pour chaque m du roster),
  (bt.kind, bt.model, bt.model_mini),          # backend_tribunal APRÈS réinjection (salt/mock inclus dans config mais seuls kind/model/model_mini comptent)
  (br.kind, br.model),                         # backend_rapide ou {} → (None, None)
  seuils,                                      # dict(SEUILS_CONSENSUS, **config.seuils_consensus)
  (int(juge_leger.passes, défaut 3), bool(juge_leger.contre_lecture, défaut False)),
  config.jury (dict tel quel), infos_personas(),
  bool(premiere_impression, défaut True), VERSION_PROTOCOLE)
```

où `empreinte(*parts) = "%x" % stable_hash(json.dumps(parts, sort_keys=True,
ensure_ascii=False, default=str))` et `stable_hash(s) = int(md5(utf8(s)).hexdigest()[:12], 16)`
(48 bits). Dans `cartographier_journee`, l'empreinte effective du cache est
`empreinte(empreinte_journee(...), sorted(ids des calques archivés))` — l'arrivée d'une
archive invalide la reprise. Les tuples Python sont sérialisés en tableaux JSON ; les valeurs
absentes en `null` ; **JSON avec séparateurs par défaut Python `", "` et `": "`** (json.dumps
sans `separators`) — à reproduire à l'octet près en JS.

### 9.4 `metrics_v9.json`

Collecte des enregistrements d'appels : pour chaque backend tagger → `records` avec
`backend = name` ; backend tribunal → `backend = "_tribunal"` ; backend rapide →
`backend = "_rapide"`. Chaque record (`CallRecord.as_dict`) :
`{label, model, seconds: round(s,2), prompt_chars, response_chars,
tokens_estimes: int((prompt_chars+response_chars)/4), ok}`.

Affectation étape par label — `p = label.split("_")[0]` :
`tag`→`tagging` ; `lecteur`→`premiere-impression` ; `greffier`/`leger`/`contre-lecture`→
`second-ressort` si `"_faisceau_" in label` sinon `instruction-rapide` ;
`accusation`/`defense`/`replique`/`briefing`/`jure`/`jure2`/`relance`/`gardien`/`president`→
`second-ressort` si `_faisceau_` sinon `tribunal` ; `condense`/`arpenteur`/`retour`→
`scan-global` ; `merge`→`relectures` ; sinon `autre`.

`par_etape[e] = {appels, tokens_estimes (somme), secondes_llm (somme arrondie 2 déc. à chaque
ajout), echecs (ok=False)}`. `ancrage_par_modele[name] = {ancres, rejets,
taux: round(ancres/total, 3) ou null si total=0}` (cumulé, journées reprises comprises).
`tribunaux_sieges` = nb de labels commençant par `president_` sans `_faisceau_`.

Schéma complet : `{journal_id, date, n_journees, n_journees_reprises_etat, roster [noms],
familles_roster, mono_famille (bool), jury_mode (str), jury_taille_aleatoire (int),
personas {version, empreinte}, appels_llm, tokens_estimes_total, secondes_llm_cumulees
(round 2), murs_par_etape_s {decoupage, journees, merge, total}, par_etape, tribunaux_sieges,
scan_global (objet du ctx ou null), incidents, ancrage_par_modele, statuts_finaux
(= carto_evo.statuts), appels_detail [records]}`.

### 9.5 CLI (`main`)

`--portfolio` (requis), `--out`, `--roster`, `--config`, `--mock`, `--donnees-reelles`,
`--models`, `--salt`, `--sans-relectures`, `--jours N`, `--sans-etat`, `--etat CHEMIN`,
`--modele-tribunal`, `--modele-rapide`, `--jury {socle4+1,socle2+2,aleatoire}`,
`--jury-taille`, `--leger-passes`, `--sans-contre-lecture`, `--scan-global`, `--rescan`.
Logs sur stderr (`[%7.1fs] LEVEL msg`), resume JSON sur stdout, exit 0.

---

## 10. Points de vigilance parité (idiomes Python à reproduire)

1. **`stable_hash`** : `int(hashlib.md5(s.encode("utf-8")).hexdigest()[:12], 16)` — 12 hex =
   48 bits, PAS BigInt-64 ; toutes les graines en dérivent (`seed % (2**31 − 1)`, permutations,
   empreintes `"%x" %` → hex minuscule sans zéros de tête).
2. **`empreinte(*parts)`** : `json.dumps(parts, sort_keys=True, ensure_ascii=False,
   default=str)` — séparateurs Python par défaut `", "` / `": "` (PAS le JSON.stringify
   compact de JS), clés triées récursivement, tuples → tableaux, non-sérialisables → `str()`.
   Reproduire à l'octet près sinon toute reprise d'état est invalidée.
3. **Défauts divergents dans l'empreinte** : `juge_leger.passes` défaut **3** et
   `contre_lecture` défaut **False** dans `empreinte_journee`, alors que la config livrée dit
   2/true — l'empreinte lit la config APRÈS surcharges CLI et réinjection de
   `backend_tribunal`/`backend_rapide` (salt/mock modifient `bt_spec` mais seuls
   kind/model/model_mini entrent dans l'empreinte).
4. **Empreinte personas** : `"%x" % stable_hash("|".join("{nom}={angle}" pour noms TRIÉS de la
   banque))` — tri Python `sorted()` sur chaînes = ordre des points de code Unicode (attention
   aux noms accentués : `Éthicien` trie APRÈS les noms ASCII). Valeur attendue avec la banque
   actuelle : `1ec337d3a2ef`.
5. **Permutation de décorrélation** (`referentiel.permutation`) : `h = stable_hash(str(clé))` ;
   rotation `idx[h % n:] + idx[:h % n]` ; puis inversion si `(h >> 8) % 2` — h ≥ 0, donc
   modulo Python == modulo JS ici, mais rester vigilant : ailleurs, `%` Python sur négatif ≠
   JS (`-1 % 5` = 4 en Python, −1 en JS).
6. **`round()` Python = arrondi banquier (half-even)** : `round(0.125, 2) = 0.12`. Utilisé
   partout (`round(x, 2)` secondes, `round(x, 3)` taux d'ancrage, `round(x, 4)` USD).
   `Math.round`/`toFixed` JS arrondissent half-away/half-even différemment — implémenter un
   `pyRound`.
7. **`tokens_estimes = int((p + r) / 4)`** : troncature vers zéro (`Math.trunc`), pas
   d'arrondi. bench9 utilise en revanche `chars/4` en flottant pour l'USD, et `int(x/n)` pour
   les moyennes par modèle.
8. **Ordre d'itération des dicts = ordre d'insertion** (Python 3.7+) : roster (ordre du
   fichier models.json + expansion des passes en séquence), `backends`, `par_etape`,
   `consensus`… Les Map/objets JS conservent aussi l'insertion : NE PAS trier là où Python ne
   trie pas ; trier là où il trie (`sorted(etat_data.journees.items())`,
   `sorted(carto_evo.statuts.items())`, `sorted(poles_all)`, familles, `journees_index`).
9. **Tri des cartos** : clé `(c.date or c.journee, c.journee)` — tuple lexicographique ; les
   dates ISO trient chronologiquement en chaîne ; `date` peut être null. Ids dupliqués :
   suffixe `_b` au découpage.
10. **Ancrage difflib** : la fenêtre approchée exige ratio ≥ 0.82
    (`difflib.SequenceMatcher.ratio()`) — porter l'algorithme exact de difflib (autojunk !)
    ou figer une implémentation compatible ; c'est l'oracle du rejet d'hallucinations.
11. **Regex référentiel** : `^##\s+(\d\.\d{2})\s*—\s*(.+?)\s*$` en MULTILINE avec tiret
    cadratin U+2014 ; codes `X.YY` (1 chiffre, point, 2 chiffres). Extraction JSON des
    réponses LLM : blocs ``` (dernier en priorité), réparation minimale (guillemets
    typographiques `""''` → droits, virgules finales supprimées).
12. **Formats de chaînes hashées / labels** : `"%s|passe%d"` (seed et salt), `"%s#%d"` (noms
    de passes), labels d'appels `tag_…`, `lecteur_…`, `leger_{code}_p{k}`,
    `contre-lecture_{code}`, `president_{code}`, suffixe `_faisceau_` (second ressort),
    `condense_{id}`, `arpenteur_global`, `retour_…`. Le routage métrique dépend du PREMIER
    segment avant `_`.
13. **Écriture JSON** : `write_json` = `json.dump(indent=2, ensure_ascii=False)` + **newline
    final**. `resume` stdout : `ensure_ascii=False`, compact par défaut Python (`", "`).
    data.js viewer : échapper `</` en `<\/`.
14. **Horloge** : `datetime.date.today().isoformat()` (date locale), suffixe rescan
    `time.strftime("%H%M%S")` ; chemins d'état `.mock` distincts
    (`etat/{journal}.mock.json`, calques `etat/calques/{journal}.mock/`).
15. **Clamps CLI** : jury-taille `max(2, min(6, int))`, leger-passes `max(1, int)`,
    passes `--models` `max(1, int)` — avec warns, jamais d'erreur.

---

## 11. Dépendances entre modules (vue contrats)

```
twin9.executer
 ├─ aurora.portfolio.split_portfolio      (découpage, ids _b, journal_id)
 ├─ aurora.referentiel.load_referentiel   (P1..P7 → 61 fiches ; permutation décorrélation)
 ├─ aurora.backends.make_backend          (mock déterministe salt/seed ; CallRecord)
 ├─ aurora.journee.cartographier_journee  (10 → tagger → ancrage/heat/consensus → 20/20b/20c
 │    │                                    → tribunal9 → registre → déclassement/élagage)
 │    ├─ aurora.templates.resolve_file    ({$VAR})
 │    ├─ aurora.heatmap                   (segments, marks)
 │    └─ aurora.tribunal9                 (arène, jury calculé, gardiens, résolution, président)
 ├─ aurora.journee.empreinte_journee / rehydrater   (état persistant)
 ├─ aurora.scan9.arpenter / verser        (00 → 01 → 02, ancrage, versement additif)
 ├─ aurora.merge3.fusionner / second_ressort / relectures / ecrire_sorties
 │                                         (carte additive, faisceaux + chose jugée,
 │                                          merge/01-04, CARTO9, rapports, profil ipsatif)
 └─ aurora.util                            (stable_hash, empreinte, extract_json, ancrage,
                                            read/write_json, logs)
```

Specs détaillées des modules internes : voir les autres fichiers `spec-*.md` de ce dossier
(portfolio, journee, heatmap, tribunal9, merge3, scan9, backends, util).
