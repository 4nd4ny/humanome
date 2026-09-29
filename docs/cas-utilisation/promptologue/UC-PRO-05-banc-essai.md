# UC-PRO-05 — Évaluer un paquet au banc d'essai

| Champ | Valeur |
|---|---|
| **Acteur principal** | Promptologue (rôle `promptologue`, session ouverte) |
| **Acteurs secondaires** | Fournisseur LLM choisi par le promptologue (« Service humanome » via le proxy `api/llm`, ou fournisseur direct avec sa clé personnelle) ; administrateur (détient le Golden Prompt, hors banc — UC-ADM-02) |
| **Portée** | humanome.xyz — atelier promptologue, section `#/promptologue/banc-essai` (exécution 100 % navigateur, ADR-001) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.4 (comparer une version à une autre, et à elle-même sur plusieurs runs), §5 (providers), §6.1 (portfolio côté client), §8 (coût, consistance) ; formation promptologue ch. 4 et 5 ; STATUS D15/D16 |
| **Statut** | Implémenté (P10.4, refondu D15, mesures D16) — voir « Anomalies constatées » |

## Objectif

Mesurer objectivement ce qu'une version de paquet de prompts produit : la
comparer à une autre version (A/B), à elle-même sur plusieurs runs
(consistance), ou à une cartographie de référence importée (score
précision/rappel/F1 calculé par ensembles, jamais par une IA), en connaissant
le coût réel consommé — sur un portfolio de test fictif par défaut.

## Déclencheur

Le promptologue ouvre **Banc d'essai** dans la navigation de l'atelier
(`#/promptologue/banc-essai`), compose son expérience et clique **Lancer**.

## Préconditions

- Session ouverte sur un compte portant le rôle `promptologue` (garde front
  `PromptologueView` ; garde serveur `RoleGuard` sur les brouillons).
- Au moins une version exécutable : le **moteur embarqué**
  `aurora-v3-reconstruit@1.0.0` est toujours disponible ; les versions
  **publiées** et **mes brouillons** viennent de l'API (UC-PRO-01 à UC-PRO-03).
- Un fournisseur LLM utilisable : « Service humanome » (preuve de travail +
  quotas serveur) ou une clé personnelle (Ollama : sans clé).

## Garanties en cas de succès

- Un rapport s'affiche selon le mode : résumé par journée (run simple),
  distance structurelle et compétences stables/divergentes (multi-run),
  tableau A/B + diff de compétences avec les traces du jury (A/B et
  référence), écarts francs / bruit (A/B croisé), score P/R/F1 (référence).
- Les **tokens réels** et le **coût réel** (table de prix indicative) sont
  affichés en run simple, en A/B (run 1 de chaque branche, plus les totaux de
  session en A/B croisé) et en mode référence (côté généré seulement) ; **rien**
  en multi-run.
- L'**estimation** (calculée au lancement, `buildEstimate`) n'est affichée que
  dans le tableau A/B et en mode référence (côté généré seulement) : ni en run
  simple, ni en multi-run.
- Un **JSON téléchargeable** est proposé en run simple (`rapport-run-banc`,
  réimportable tel quel comme référence), en A/B et en mode référence
  (`rapport-ab-prompt-packages`, estimations et configurations incluses) et
  pour un paquet Twin6 (la cartographie merge) ; **pas** en multi-run.
- Rien n'est écrit côté serveur : ni résultat, ni texte du portfolio.

## Garanties minimales (en cas d'échec)

- Aucune saisie invalide (période, température, périmètre, référence) ne
  consomme d'appel LLM. La période, la température et le périmètre sont
  validés **avant** la préparation du fournisseur ; l'absence de référence
  (E4) et le refus Twin6 hors run simple (E5) ne sont détectés **qu'après**
  cette préparation — en mode service, un défi `GET api/llm/challenge` et sa
  preuve de travail (`prime()`), puis la lecture du paquet —, mais toujours
  avant le premier appel LLM.
- Un échec affiche un message ; le **résultat précédent reste affiché**.
- Une clé API personnelle ne quitte jamais le navigateur vers humanome et
  n'entre jamais dans le carnet ni dans ses exports.

## Scénario nominal — comparaison A/B de deux versions

1. Le promptologue ouvre `#/promptologue/banc-essai`. L'atelier vérifie la
   session (`GET api/auth/me`) et le rôle `promptologue`, puis affiche la
   navigation de l'atelier et le banc.
2. Le banc charge ses sources en parallèle : versions publiées
   (`GET api/prompt-packages`), **mes** brouillons (`GET
   api/prompt-packages/drafts`, puis `GET api/prompt-packages/drafts/{draftId}`
   pour le document de chacun), portfolios locaux (IndexedDB du navigateur) et
   versions publiées du référentiel (`GET api/referentiel/versions`). Le
   sélecteur propose : le moteur embarqué, les versions « (publiée) », les
   brouillons « (mon brouillon) ».
3. Il choisit le mode **A/B (deux versions)**, **Version A** (par exemple
   l'étalon embarqué) et **Version B** (une version publiée), le portfolio de
   test (« Fixture embarquée : Maya, 3 journées » par défaut), les journées
   (tout le journal), le périmètre (référentiel entier), la version du
   référentiel (embarquée), le fournisseur (« Service humanome » par défaut),
   éventuellement une température, puis clique **Lancer**.
4. Le banc prend un verrou synchrone (anti double-clic) et prépare le run :
   journées retenues (`filterDayGroups`), périmètre, température (0 à 2,
   virgule décimale acceptée), référentiel de chaque branche, pré-vol du
   périmètre sur chaque référentiel, fournisseur de chaque branche
   (`createProviderBundle`, preuve de travail pré-résolue par `prime()` en mode
   service), puis résout les paquets (`GET
   api/prompt-packages/{id}/{version}` pour une version publiée).
5. Pour chaque branche, `runVersionOnDays` exécute la version journée par
   journée : paquet « moteur » (embarqué ou marqueur `engine://`) →
   `extractDay` (7 appels pôle + 1 kairos par journée), **avec les gabarits
   du moteur** — les `prompts[]` d'un paquet `engine://` ne sont pas
   transmis (anomalie AN-3) ; paquet à code personnalisé → sandbox
   (UC-PRO-07), avec ses propres gabarits. Le fournisseur est enveloppé une
   seule fois : température injectée et **usage réel cumulé** (`inputTokens`,
   `outputTokens`, nombre de mesures). La progression s'affiche.
6. Le banc construit le rapport A/B (`buildAbReport`) : par branche,
   compétences établies (total), appels LLM, tokens réels, coût réel,
   durée mesurée, estimation (`buildEstimate` : pôles retenus, **aucun** récit
   de fusion) ; par journée, compétences communes / seulement A / seulement
   B ; puis le diff de compétences avec les délibérations du jury des deux
   côtés (`buildCompetenceDiff`, `CompetenceDiff`) et le lien **Télécharger le
   rapport JSON** (configuration de chaque branche incluse).

## Scénarios alternatifs

- **A1 — Run simple** (étape 3) : une seule version. Tableau par journée
  (établies, renvois), usage et coût réels, exécution « moteur embarqué » ou
  « sandbox », lien **Télécharger le run** (`rapport-run-banc`, réimportable
  comme référence).
- **A2 — Multi-run de consistance** (étape 3) : N = 2 à 5 runs de la même
  version ; pour chaque journée, `compareRuns` (moteur) : distance
  structurelle moyenne (0 = runs identiques, 1 = désaccord maximal), accord en
  %, compétences stables et divergentes avec les numéros de runs.
- **A3 — A/B croisé** (étape 3) : 2 à 5 runs **par branche**. Pour chaque
  (journée, compétence), fraction d'établissement pA/pB : **écart franc**
  (les deux branches stables — p ≤ 0,25 ou p ≥ 0,75 — et opposées),
  **bruit** (une branche instable), **accord** ; consistance interne de chaque
  branche ; totaux de tokens et de coût **de session**. Le tableau A/B et le
  diff portent sur le run 1 de chaque branche.
- **A4 — Vs référence importée** (étape 3) : un JSON de référence (document
  jour, tableau de documents, ou export du banc) est importé comme côté B ;
  seule la version testée est exécutée. Score par pur calcul d'ensembles :
  vrais positifs = communes, faux positifs = seulement générées, faux
  négatifs = manquées ; précision, rappel, F1 ; seules les journées couvertes
  des deux côtés sont scorées (les autres sont listées « hors score »).
- **A5 — Fournisseur, modèle ou référentiel distinct pour B** (étape 3) :
  en A/B, cases « Fournisseur/modèle distinct pour B » et « Référentiel
  distinct pour B » — pour comparer des LLM à prompt constant, ou deux
  versions du référentiel (`GET api/referentiel/versions/{semver}`).
- **A6 — Périmètre restreint** (étape 3) : une journée ou une période ; un
  pôle ou **une** compétence. Le moteur n'instruit que les pôles retenus
  (sans kairos), le document est marqué `perimetre.partiel` ; l'estimation
  suit le même périmètre.
- **A7 — Mon brouillon** (étape 3) : un brouillon s'exécute depuis le document
  déjà chargé, sans nouvel aller-retour serveur.
- **A8 — Paquet à référentiel en dur** (étapes 3 et 5) : paquet Twin6
  (drapeau `reserved` ou nom), fiches de compétences en toutes lettres dans
  les gabarits, orchestration qui ignore `referentiel` → alerte avant le run,
  puis alerte définitive une fois le paquet chargé.
- **A9 — Paquet Twin6 en run simple** (étape 5) : `executerTwin6` sur le
  **portfolio entier** (7 scan-pôle + kairos) → cartographie globale (merge),
  téléchargeable.
- **A10 — Interruption volontaire** (étape 5) : bouton **Interrompre** →
  statut neutre « Run interrompu » (pas une erreur) ; en multi-run (≥ 2 runs
  achevés) et en A/B (≥ 1 run par branche), rapport partiel sur les runs
  achevés.
- **A11 — Carnet du banc** (à tout moment) : méta-page markdown (rendue via
  DOMPurify), configurations emblématiques nommées mémorisées et rechargeables
  (références disparues signalées avec replis sûrs), export/import JSON ;
  stockage local `humanome-banc-carnet`, **jamais de clé API**.
- **A12 — Portfolio local** (étape 3) : un portfolio du navigateur (segments
  datés) remplace la fixture.

## Scénarios d'erreur

- **E1 — Pas de session ou pas le rôle** (étape 1) : message « nécessite une
  session » ou « réservé au rôle promptologue » ; aucune source n'est
  chargée. Côté API, les brouillons répondent `401` sans session, `403` sans
  rôle.
- **E2 — Période invalide** (étape 4) : date de début postérieure à la date de
  fin, ou aucune journée correspondante → message, aucun appel LLM.
- **E3 — Température invalide** (étape 4) : hors [0 ; 2] → message.
- **E4 — Référence absente ou invalide** (étapes 3-4) : « Importez d'abord un
  JSON de référence (côté B). » ; JSON non reconnu, sans date, en double ou
  invalide au schéma (le marqueur `perimetre.partiel` d'un fichier importé ne
  désactive pas la validation) → message.
- **E5 — Paquet Twin6 hors run simple ou avec périmètre restreint**
  (étapes 4-5) : refus explicite (modes par jour inapplicables ; référentiel
  en dur).
- **E6 — Périmètre absent du référentiel d'une branche** (étape 4) : en A/B à
  double référentiel, refus **avant** que la branche A ne consomme d'appels.
- **E7 — Échec d'exécution** (étape 5) : clé personnelle manquante,
  fournisseur en erreur (quota, HTTP), quota ou document invalide en sandbox
  → message d'erreur ; le résultat précédent reste affiché.
- **E8 — Portfolio local sans journée datée** (étapes 3-4) : alerte à la
  sélection, refus au lancement.

## Règles de gestion

- **RG1** — Un brouillon ne s'exécute que chez son auteur : le banc ne liste
  que `GET api/prompt-packages/drafts` (brouillons de la session) ; un
  brouillon d'autrui répond `404` comme un identifiant inconnu.
- **RG2** — Le Golden Prompt n'apparaît jamais au banc (paquets privés exclus
  de toute lecture publique) ; la comparaison au Golden relève d'une
  autorisation d'administration (UC-ADM-02), sans fonction dans le banc.
- **RG3** — Le score vs référence est un **pur calcul d'ensembles**. F1 vaut 0
  quand précision et rappel sont définis et nuls (TP = 0, FP ≥ 1, FN ≥ 1) ;
  F1 vaut `null` dès que la précision (aucune établie générée dans le
  périmètre) **ou** le rappel (aucune établie de référence dans le périmètre)
  est indéfini — y compris quand l'autre côté porte des données (par exemple
  1 faux positif, 0 faux négatif).
- **RG4** — Le coût réel se calcule sur les tokens **mesurés** ; en mode
  service, sur le modèle de tarification de référence (`claude-sonnet-5`),
  arrondi au dix-millième (un micro-run payant n'affiche jamais « 0 $ »).
- **RG5** — L'estimation reflète ce que le banc exécute : pôles retenus
  (+ kairos seulement en périmètre entier) et **zéro** récit de fusion.
- **RG6** — Seuils de stabilité du multi-run croisé : p ≤ 0,25 ou p ≥ 0,75
  (bornes incluses).
- **RG7** — Le fournisseur est choisi par l'utilisateur, jamais par le paquet
  (sandbox, UC-PRO-07).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Portfolio de test | Fixture fictive par défaut ; portfolio local seulement s'il est dans le navigateur (usage réel = consentement de la personne, formation ch. 4) ; texte envoyé au seul fournisseur LLM choisi |
| Clé API personnelle | État mémoire du composant ; transport direct vers le fournisseur ; exclue du carnet et de ses exports (`sanitizeConfig`) |
| Carnet du banc | `localStorage` (`humanome-banc-carnet`) du navigateur |
| Rapports | Générés et téléchargés localement (URL `data:`), jamais envoyés au serveur |
| Usage mesuré | Compteurs de tokens uniquement |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/PromptologueView.jsx` | Garde de rôle, dispatch de la section `banc-essai` |
| Front | `web/src/api/client.js` — `fetchMe` ; API `GET /api/auth/me` (`api/src/routes/auth.php`) | Session et rôles (étape 1) |
| Front | `web/src/views/promptologue/BancEssaiSection.jsx` | Composition, orchestration (`execute`), rendu des rapports, carnet, `fixtureDayGroups` (segmentation `engine/src/portfolio/segment.js` — `segmentText`) |
| Front | `web/src/views/promptologue/api.js` — `createPromptologueApi`, `normalizeDraftEntry` | Sources du banc |
| Front | `web/src/views/promptologue/bench.js` — `runVersionOnDays`, `filterDayGroups`, `buildRunReport`, `buildAbReport`, `buildMultiRunReport`, `buildAbMultiReport`, `scoreVsReference`, `normalizeReferenceImport`, `validatePartialJour`, `buildCompetenceDiff`, `realCostUsd`, `sumUsages`, `detectReferentielEnDur`, `usesTwin6Engine`, `extractTwin6Templates`, `dayGroupsToPortfolio` | Logique pure du banc |
| Front | `web/src/views/promptologue/carnet.js`, `web/src/lib/md.js` — `renderMarkdown` (DOMPurify) | Carnet du banc et rendu de sa méta-page (A11) |
| Front | `web/src/views/promptologue/CompetenceDiff.jsx` | Diff avec traces du jury |
| Front | `web/src/lib/consistency-view.js` — `buildConsistencyView` | Modèle d'affichage du multi-run (accord %, stables, divergentes) |
| Front | `web/src/lib/run-launcher.js` — `createProviderBundle`, `buildEstimate`, `BUILTIN_PACKAGE` ; `web/src/lib/demo-llm.js` — `createDemoProvider` | Fournisseur par branche, estimation, service humanome (PoW) |
| Front | `web/src/lib/portfolio-store.js` — `createPortfolioStore` | Portfolios locaux IndexedDB (A12) |
| Front | `web/src/lib/sandbox/index.js` — `usesEngineOrchestration` | Routage moteur / sandbox |
| Moteur | `engine/src/pipeline/extract.js` — `extractDay`, `restreindreReferentiel` | Extraction d'une journée, périmètre |
| Moteur | `engine/src/twin6/index.js` — `executerTwin6` | Run Twin6 sur le portfolio entier (A9) |
| Moteur | `engine/src/validation.js` — `validateDocument` | Validation au schéma de la référence importée (E4) |
| Moteur | `engine/src/consistency.js` — `compareRuns` | Consistance multi-run |
| Moteur | `engine/src/providers/estimate.js` (`estimateRun`, `getModelPricing`), `engine/src/providers/index.js` (`createProvider` : transports direct et proxy, normalisation de l'usage) | Estimation, table de prix, fournisseurs |
| API | `GET /api/prompt-packages`, `/prompt-packages/{id}/{version}`, `/prompt-packages/drafts[/{draftId}]` — `api/src/routes/packages.php` | Sources publiées et brouillons |
| API | `GET /api/referentiel/versions[/{semver}]` — `api/src/routes/referentiel.php` | Versions du référentiel |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `listPublished`, `listDrafts`, `findDraft`, `findPublished` | Lectures filtrées (publique, propriétaire, non privée) |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `publishedVersions`, `findPublished`, `metadata` | Versions du référentiel |

`engine/src/runs/*` (checkpoints, reprise) n'est **pas** sollicité : le banc
n'a ni checkpoint ni reprise (voir « Limites »). `engine/src/providers/mock.js`
n'est pas non plus du code sollicité : c'est le double de test des unitaires.

Éléments couverts hors des tests de cette fiche : `executerTwin6` (moteur
Twin6, UC-APP-09 : `engine/test/usecases/unit/uc-app-09-*.test.js` ; ici
remplacé par une couture en F14), `validatePartialJour` (sonde tolérante,
UC-PRO-07), `createPortfolioStore` (IndexedDB, `web/src/lib/portfolio-store.test.js` ;
couture en F17 et F25), `fetchMe` et `GET /api/auth/me` (UC-CPT-02 ; ici
exercés par F01 côté API et par les tests IHM rendus dans `<App/>`).

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-PRO-05-U01 | `PromptPackageRepository::listPublished` | Ni brouillon ni Golden privé ; drapeau `reserved` vrai (paquet Twin6 réservé) et faux | `api/tests/UseCases/Unit/UcPro05BancEssaiTest.php` |
| UC-PRO-05-U02 | `PromptPackageRepository::listDrafts` | Brouillons du seul auteur, métadonnées (RG1) | idem |
| UC-PRO-05-U03 | `PromptPackageRepository::findDraft` | Document pour l'auteur, `null` pour autrui (RG1) | idem |
| UC-PRO-05-U04 | `PromptPackageRepository::findPublished` | Document exécutable ; `null` pour brouillon et Golden (RG2) | idem |
| UC-PRO-05-U05 | `ReferentielRepository::publishedVersions`, `metadata`, `findPublished` | Tri semver décroissant ; clé `semver` (AN-1) ; document 7 pôles / 61 compétences | idem |
| UC-PRO-05-U06 | `createPromptologueApi` | Routes des sources, segments encodés, lectures seules | `web/test/usecases/unit/uc-pro-05-banc-essai.test.js` |
| UC-PRO-05-U07 | `normalizeDraftEntry` | Brouillon avec document ; sans document écarté | idem |
| UC-PRO-05-U08 | `fixtureDayGroups`, `FIXTURE_LABEL` | Fixture fictive Maya : 3 journées datées | idem |
| UC-PRO-05-U09 | `runVersionOnDays` + `extractDay` réel | 24 appels, documents reconstruits, usage cumulé, température, progression | idem |
| UC-PRO-05-U10 | `runVersionOnDays` (périmètre) | 1 appel, document `perimetre.partiel` | idem |
| UC-PRO-05-U11 | `createProviderBundle` | Service (`demo` / tarif `claude-sonnet-5`), clé obligatoire, fournisseur inconnu | idem |
| UC-PRO-05-U12 | `usesEngineOrchestration`, `usesTwin6Engine`, `detectReferentielEnDur` | Routage moteur / sandbox / Twin6 ; alerte : Twin6, fiche « ## X.YY — » dans un gabarit, orchestration sans `referentiel` (A8) | idem |
| UC-PRO-05-U13 | `buildEstimate` | Sans fusion, pôles retenus, modèle hors table (RG5) | idem |
| UC-PRO-05-U14 | `realCostUsd`, `sumUsages` | Modèle de tarif, totaux de session (RG4) | idem |
| UC-PRO-05-U15 | `buildAbReport` → `scoreVsReference` | P = R = F1 = 75 %, journée hors score, `codesRetenus` ; F1 = 0 en désaccord total, `null` si P ou R indéfini (RG3) | idem |
| UC-PRO-05-U16 | `buildAbMultiReport` | Seuils 0,25/0,75 inclus, bruit à 0,5 (RG6) | idem |
| UC-PRO-05-U17 | `addConfig`, `exportCarnet`, `importCarnet`, `renderMarkdown` | Aucune clé exportée, réimport ; méta-page assainie (A11) | idem |
| UC-PRO-05-U18 | `compareRuns` | Basculement au run 2 sur 3 : divergence, distance exacte | `engine/test/usecases/unit/uc-pro-05-banc-essai.test.js` |
| UC-PRO-05-U19 | `compareRuns` | Renvoi = demi-distance | idem |
| UC-PRO-05-U20 | `estimateRun` | Surcharges `callsPerDay` / `mergeCalls` | idem |
| UC-PRO-05-U21 | `getModelPricing` | Modèles tarifés, `demo` non tarifé | idem |
| UC-PRO-05-U22 | `createProvider` (moteur) | Transport direct : clé vers le seul fournisseur, température, usage `input_tokens` → `inputTokens` ; transport proxy : température recopiée, aucune clé (RG4) | `engine/test/usecases/unit/uc-pro-05-banc-essai.test.js` |
| UC-PRO-05-U23 | `filterDayGroups` | Tout / journée / période ; période inversée et sélection vide refusées (E2) | `web/test/usecases/unit/uc-pro-05-banc-essai.test.js` |
| UC-PRO-05-U24 | `buildMultiRunReport`, `buildConsistencyView` | Modèle affiché du multi-run : stables, divergente, runs groupés (A2) | idem |
| UC-PRO-05-U25 | `buildRunReport`, `normalizeReferenceImport` (→ `validateDocument`, `validatePartialJour`) | Run exporté réimportable comme référence ; forme inconnue, journée sans date, date en double, document invalide malgré le marqueur `perimetre.partiel` refusés (A1, A4, E4) | idem |
| UC-PRO-05-U26 | `buildCompetenceDiff` | Écart avec pièces, verbatim et verdicts des deux côtés | idem |
| UC-PRO-05-U27 | `runVersionOnDays` (branche moteur) | Anomalie AN-3 : ni le paquet ni ses `prompts[]` ne sont transmis à `extractDay` (comportement actuel figé) | idem |
| UC-PRO-05-U28 | `restreindreReferentiel` | Pôle, compétence, périmètre entier ; périmètre absent → « périmètre vide » (A6, E6) | `engine/test/usecases/unit/uc-pro-05-banc-essai.test.js` |
| UC-PRO-05-U29 | `createDemoProvider` | `prime()` pré-résout une preuve ; phases `challenge`/`pow`/`llm` par appel (mécanisme de AN-2) ; corps du proxy | `web/test/usecases/unit/uc-pro-05-banc-essai.test.js` |
| UC-PRO-05-U30 | `CompetenceDiff` (rendu seul) | Extrait verbatim, verdicts des deux côtés, « Aucun écart » | idem |
| UC-PRO-05-U31 | `PromptologueView` (rendu seul) | Garde : sans rôle ou sans session, banc absent et aucune source lue (E1) | idem |
| UC-PRO-05-U32 | `extractTwin6Templates`, `dayGroupsToPortfolio` | Gabarits Twin6 extraits, paquet incomplet refusé, portfolio entier en feuilles datées (A9) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-PRO-05-F01 | Nominal (étapes 1-2) | API | Rôle dans `auth/me`, publiées, mes brouillons avec document | `api/tests/UseCases/Functional/UcPro05BancEssaiTest.php` |
| UC-PRO-05-F02 | Nominal (étape 4) | API | Document complet d'une version publiée ; 404 sinon | idem |
| UC-PRO-05-F03 | RG1 | API | Brouillon d'autrui ni listé ni lisible, 404 identique ; contre-épreuve : l'auteur le voit (identité = cookie de chaque requête) | idem |
| UC-PRO-05-F04 | E1 | API | Brouillons : 401 sans session, 403 sans rôle — y compris juste après une session promptologue | idem |
| UC-PRO-05-F05 | A5 | API | Versions du référentiel (`semver`), document d'une version | idem |
| UC-PRO-05-F06 | Nominal | IHM | `<App/>` : A/B embarqué vs publiée, 48 appels, tokens et coûts réels, estimation du rapport (24 appels, `claude-sonnet-5`, RG5) = cellule affichée, diff, rapport JSON | `web/test/usecases/functional/uc-pro-05-banc-essai.test.jsx` |
| UC-PRO-05-F07 | A1 (+ étape 4) | IHM | Run simple, usage/coût, export réimportable = document fixture ; température « 0,7 » transmise 0.7 ; double-clic = un seul run | idem |
| UC-PRO-05-F08 | A2 | IHM | 3 runs, divergence au run 2, distance affichée = 2 / (3 × n) ; ni usage, ni estimation, ni lien de téléchargement | idem |
| UC-PRO-05-F09 | A3 + A5 | IHM | 2×2 runs, B sur Anthropic direct : 1 écart franc (100 % / 0 %), 1 bruit ; clé jamais envoyée à humanome ; coûts de session | idem |
| UC-PRO-05-F10 | A4 | IHM | Référence importée : P/R/F1 75 %, journée hors score | idem |
| UC-PRO-05-F11 | A6 | IHM | Une compétence : 1 appel, document partiel | idem |
| UC-PRO-05-F12 | A7 | IHM | Brouillon exécuté sans lecture de version publiée | idem |
| UC-PRO-05-F13 | A8 | IHM | Alerte « référentiel en dur » avant run : drapeau `reserved`, puis présomption par le nom (sans drapeau) | idem |
| UC-PRO-05-F14 | A9 | IHM | Twin6 : portfolio entier, résultat merge, alertes, cartographie téléchargeable | idem |
| UC-PRO-05-F15 | A10 | IHM | Interruption au run 3 : statut neutre, rapport partiel (2 runs) | idem |
| UC-PRO-05-F16 | A11 | IHM | Carnet : sans clé en stockage ni export, rechargement ; carnet importé à référence disparue → « avec réserves », repli sûr | idem |
| UC-PRO-05-F17 | A12 | IHM | Portfolio local comme portfolio de test | idem |
| UC-PRO-05-F18 | E1 | IHM | Anonyme / sans rôle : banc absent, sources non chargées (réseau de chaque cas inspecté) | idem |
| UC-PRO-05-F19 | E2 | IHM | Période inversée, 0 appel | idem |
| UC-PRO-05-F20 | E3 | IHM | Température hors bornes (« 2.5 »), 0 appel | idem |
| UC-PRO-05-F21 | E4 | IHM | Référence absente (après un défi de preuve de travail, 0 appel LLM) puis invalide au schéma | idem |
| UC-PRO-05-F22 | E5 | IHM | Twin6 en multi-run ; Twin6 + périmètre | idem |
| UC-PRO-05-F23 | E6 | IHM | Périmètre absent du référentiel B, 0 appel | idem |
| UC-PRO-05-F24 | E7 | IHM | 429 du fournisseur puis clé manquante ; résultat précédent conservé | idem |
| UC-PRO-05-F25 | E8 | IHM | Portfolio local non daté | idem |
| UC-PRO-05-F26 | Anomalie AN-1 | IHM | Forme réelle `{semver}` : seule la version embarquée proposée (comportement actuel figé) | idem |
| UC-PRO-05-F27 | Anomalie AN-3 | IHM | Brouillon `engine://` au gabarit marqué : 8 appels avec les gabarits du moteur, marque jamais envoyée, aucune alerte (comportement actuel figé) | idem |
| UC-PRO-05-F28 | A6 (en A/B) + RG5 | IHM | Une compétence : 1 appel par branche ; estimations A et B à 1 appel | idem |
| UC-PRO-05-F29 | A10 (A/B, run simple) | IHM | A/B croisé interrompu au run 2 de B : rapport partiel 2 × 1 ; run simple interrompu : « Run interrompu. », aucun rapport | idem |

Les tests IHM jouent le **vrai** moteur et la **vraie** logique du banc : seul
le réseau est simulé (API humanome, proxy `api/llm` avec preuve de travail de
difficulté 0, API Anthropic), le LLM factice rejouant les documents jour
fixtures (`web/test/usecases/support/banc.js`). F14, F17 et F25 rendent
`PromptologueView` avec ses coutures (`benchDeps` : moteur Twin6, portfolios
IndexedDB).

### Tests existants liés (non-régression)

- `web/src/views/promptologue/BancEssaiSection.test.jsx` — composant isolé (coutures `runFn`, `createBundleFn`).
- `web/src/views/promptologue/bench.test.js`, `carnet.test.js`, `CompetenceDiff.test.jsx`.
- `web/src/lib/run-launcher.test.js`, `web/src/lib/consistency-view.test.js`, `web/src/lib/demo-llm.test.js`.
- `engine/src/consistency.test.js`, `engine/src/providers/estimate.test.js`, `engine/src/providers/mock.test.js`, `engine/src/pipeline/extract.test.js` (`restreindreReferentiel`, périmètre).
- `api/tests/PackagesDraftsTest.php`, `api/tests/PackagesTest.php`, `api/tests/ReferentielApiTest.php`.
- `api/tests/PackagesTwin6Test.php` — drapeau `reserved` exposé par la liste publique (A8).
- `web/src/lib/md.test.js` (`renderMarkdown`), `web/src/lib/portfolio-store.test.js` (portfolios locaux), `engine/src/twin6/index.test.js` (`executerTwin6`).
- `web/e2e/parcours-promptologue.e2e.js` — étape « Banc d'essai : A/B ancienne vs nouvelle version » (navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcPro05 --testdox
cd web && npx vitest run test/usecases/unit/uc-pro-05 test/usecases/functional/uc-pro-05
cd engine && npx vitest run test/usecases/unit/uc-pro-05
```

## Anomalies constatées

- **AN-1 — Versions du référentiel jamais proposées avec l'API réelle.**
  `GET /api/referentiel/versions` renvoie des métadonnées
  `{id, referentielId, semver, label, …}` (`ReferentielRepository::metadata`),
  alors que `BancEssaiSection` ne retient que les entrées portant une clé
  `version` (`typeof v?.version === 'string'`). Contre l'API réelle, le
  sélecteur « Version du référentiel » ne propose donc que la version
  embarquée : le volet « référentiel distinct pour B » de A5 et E6 sont inatteignables
  en production. Les tests des composants et F23 utilisent la forme attendue
  par le front (`{version}`) ; U05 et F05 figent la forme réelle de l'API ;
  F26 fige le comportement actuel de l'IHM. Même cause racine : UC-PRO-06,
  anomalie AN-1.
- **AN-2 — Progression masquée en mode « Service humanome ».** Le rappel
  `onPhase` du fournisseur de service (`buildBundle`) réécrit le statut
  « Préparation (challenge|pow|llm)… » à **chaque** appel LLM : la
  progression « Run i/n — Jour x/y — n appel(s) LLM » n'est visible qu'entre
  deux appels. Comportement figé par F15 ; mécanisme figé par U29. (Mineur,
  ergonomie.)
- **AN-3 — Gabarits d'un paquet `engine://` ignorés au banc.** Un paquet
  dont l'orchestration contient `engine://` (détection par sous-chaîne,
  `usesEngineOrchestration`) est exécuté par `extractDay`, qui instancie
  **ses propres** gabarits : `runVersionOnDays` ne lui transmet ni le paquet
  ni ses `prompts[]`. C'est le cas du paquet par défaut publié
  `aurora-v3-reconstruit@1.0.0` et de **tout brouillon forké de lui**
  (`PromptPackageRepository::createDraft` recopie `code.orchestration`). Un
  promptologue qui édite les gabarits d'un tel fork puis compare, en A/B,
  l'ancienne et la nouvelle version compare donc deux exécutions identiques —
  seul le bruit du fournisseur les distingue —, sans aucun avertissement du
  banc. Le parcours e2e `web/e2e/parcours-promptologue.e2e.js` (sentinelle
  ajoutée à un gabarit puis A/B) exerce ce cas sans le détecter. Comportement
  actuel figé par U27 et F27 ; F06 en tient compte (B = paquet `engine://`).
  À corriger côté front (transmettre les gabarits au moteur, ou avertir).

## Limites

- Un paquet `engine://` (paquet par défaut et ses forks) est mesuré avec les
  gabarits du moteur, pas les siens (AN-3) : le banc ne mesure réellement
  des gabarits édités que pour un paquet à code personnalisé (sandbox,
  UC-PRO-07).
- Aucune comparaison au Golden Prompt dans le banc (RG2) — alors que
  `docs/autorisations.md` mentionne une « Comparaison au Golden Prompt » pour
  un promptologue autorisé : aucune route ne consomme l'autorisation
  (UC-ADM-02).
- Pas de checkpoint ni de reprise : un run interrompu en mode simple ou
  référence est perdu (« Run interrompu. »), seuls multi-run et A/B offrent un
  rapport partiel.
- Aucun résultat n'est persisté : l'archivage passe par le rapport JSON
  téléchargé et le carnet local (formation ch. 4 §6 : reporter le constat dans
  le changelog à la publication, UC-PRO-03).
- Le portfolio local exige IndexedDB (sinon seule la fixture est proposée).
