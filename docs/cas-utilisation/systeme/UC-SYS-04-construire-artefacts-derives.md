# UC-SYS-04 — Construire les données et artefacts dérivés

| Champ | Valeur |
|---|---|
| **Acteur principal** | Mainteneur, depuis son poste (scripts Node lancés à la main) ; chaîne de déploiement qui en rejoue une partie : prebuild du front (`web/package.json`) et `scripts/deploy/stage-api.sh` |
| **Acteurs secondaires** | Épistémiarques (auteurs des définitions et des fiches, UC-EPI-03) ; API (source de `GET /api/admin/dump-fiches`, UC-SYS-02 A5) ; outil de déploiement `deploy.mjs` (consomme les artefacts, UC-SYS-02) ; GitBook (lit `SUMMARY.md`) |
| **Portée** | Scripts Node hors navigateur et hors serveur : `scripts/convert/*`, `scripts/extract-referentiel.mjs`, `enrich-referentiel.mjs`, `extract-fiches.mjs`, `generate-fiches.mjs`, `dump-fiches.mjs`, `build-default-prompt-package.mjs`, `build-twin6-package.mjs`, `build-twin6-prompt-package.mjs`, `build-tuteur-digest.mjs`, `build-validators.mjs`, `validate-corpus.mjs`, `build-gitbook-summary.mjs` |
| **Niveau** | Sous-fonction technique (construction) |
| **Cahier des charges** | §5 (« clone déployable » ; système de prompts converti en JavaScript), §8 (référentiel évolutif), §9 (éléments existants à intégrer, pas à recréer) ; ADR-001, ADR-003, ADR-006 ; `docs/contrats.md` (§3 notes de cohérence, §4 décisions 3, 4, 6 et 8), `INSTALL.md` §2 et §5, `docs/deploiement.md` |
| **Statut** | Implémenté (P1, P8.3, D1/AD-D1, D9, D10, source unique des fiches) — voir « Anomalies constatées » |

## Objectif

Produire, à partir des **seules sources versionnées** (corpus réel hérité en
lecture seule, corpus des définitions et des fiches, schémas JSON, gabarits du
moteur, documentation), toutes les données et tous les artefacts dont le front,
la release de l'API et le déploiement ont besoin — de façon **déterministe**
(octet pour octet), **vérifiable** (validation aux schémas, preuves de parité)
et sans jamais retoucher un JSON produit à la main.

## Déclencheur

- Installation d'une instance ou poste neuf (`INSTALL.md` §2), avant le build
  du front et le déploiement.
- Modification d'une source : schéma (`schemas/`), définitions ou fiches des
  compétences, gabarits du moteur, documentation.
- `npm run build` dans `web/` (hook `prebuild`) et `./scripts/deploy/stage-api.sh`
  rejouent automatiquement une partie de la chaîne.

## Préconditions

- Node ≥ 20 et `npm ci` dans `engine/` (ajv et ajv-formats : validateurs du
  moteur, `build-validators.mjs`).
- Entrées versionnées présentes : `assets-existants/merge-prototype/`
  (`carto-data.js`, `intermediate/carto_merge.json`,
  `extracted/<AAAA-MM-JJ>/carto_P1..P7.json` + `kairos.json` — lecture seule
  absolue), `scripts/data/fiches-v7.json`,
  `scripts/data/referentiel-v7-definitions.json`, `schemas/` (dont
  `schemas/fixtures/`), `content/formation/`, `docs/`.
- Pour Twin6 : les trois gabarits publics `0-mega-prompt.md`, `1-scan-pole.md`
  et `2-kairos-final.md` déposés à la main dans `web/public/data/twin6/prompts/` —
  **aucune source versionnée** ne les fournit (AN-2).
- Pour `dump-fiches.mjs` : API joignable et `MIGRATE_TOKEN` (UC-SYS-02).
- Pour `stage-api.sh` : image Docker `humanome-php` (étape `composer`, hors
  périmètre : UC-SYS-02).

## Garanties en cas de succès

- `web/public/data/demo/merge.json` (`cartographie-merge`),
  `web/public/data/demo/jours/<date>.json` (59 `cartographie-jour`) et leur
  `index.json`, `web/public/data/referentiel/respire-v7.json` (7.0.0) et
  `respire-v7.1.0.json` sont produits et conformes aux schémas (le 7.1.0 l'est
  au schéma source, **pas** aux validateurs versionnés du moteur : AN-1).
- `build/prompt-packages/aurora-v3-reconstruit-1.0.0.json` et
  `twin6-ouverte-1.0.0.json` sont validés par le moteur **avant** écriture ;
  `web/public/data/twin6/prompts/P1..P7.md` et le paquet statique
  `web/public/data/twin6/twin6-ouverte-1.0.0.json` dérivent du même corpus.
- Rejouer un script produit des fichiers identiques octet pour octet : les
  imports serveur, idempotents par hash, restent sans effet (UC-SYS-02 A1).
- Trois artefacts **versionnés** se régénèrent à la demande :
  `engine/src/validation-compiled.js`, `scripts/data/fiches-v7.json`
  (`extract-fiches.mjs`, `dump-fiches.mjs`) et `SUMMARY.md`.

## Garanties minimales (en cas d'échec)

- Toute entrée manquante ou incohérente arrête le script avec un code non nul
  (le plus souvent une exception non rattrapée : trace Node sur la sortie
  d'erreur, code 1) ; `stage-api.sh` (`set -euo pipefail`) et le `prebuild`
  (`&&`) s'arrêtent à la première erreur.
- Aucun script n'écrit dans `assets-existants/`.
- `extract-fiches.mjs`, `dump-fiches.mjs`, `generate-fiches.mjs --verify` et
  `enrich-referentiel.mjs` (définitions manquantes ou surnuméraires) n'écrivent
  rien en cas d'échec. Exceptions : `enrich-referentiel.mjs` quand la structure
  a changé (AN-3), `build-validators.mjs` (validateurs réécrits avant la fumée),
  `extracted-to-day-json.mjs` (journées déjà converties conservées, `index.json`
  non écrit) et `generate-fiches.mjs` (P*.md des pôles précédents déjà écrits).
- Exception (AN-4) : lancés par un chemin qui traverse un lien symbolique,
  `carto-data-to-merge-json.mjs`, `extracted-to-day-json.mjs`,
  `extract-fiches.mjs` et `build-twin6-prompt-package.mjs` sortent en 0 sans rien
  faire ni rien afficher.

## Scénario nominal

Ordre réel, reconstitué d'`INSTALL.md` §2 et §6, du `prebuild` de
`web/package.json` et de `scripts/deploy/stage-api.sh` :

1. **Corpus démo.** `node scripts/convert/carto-data-to-merge-json.mjs` lit les
   déclarations `const NOM = <littéral>;` de `carto-data.js` **sans l'évaluer**
   (`parseCartoDataFile` : JSON, alias vers une constante déjà lue, ou objet JS
   simple) et écrit `demo/merge.json` ; `node
   scripts/convert/extracted-to-day-json.mjs` convertit chaque dossier daté en
   `demo/jours/<date>.json` (7 pôles remis dans l'ordre P1..P7, `kairos` ou
   `null`) et écrit `index.json` (`{date, iso, label JJ/MM/AAAA, ordre}`,
   chronologique).
2. **Référentiel 7.0.0.** `node scripts/extract-referentiel.mjs` reconstruit
   les 7 pôles (`agrege.par_pole`, couleurs de `domainsData`) et les
   61 compétences (`agrege.par_competence`, triées par code) et calcule le
   `contentHash` (RG3) → `referentiel/respire-v7.json`.
3. **Référentiel 7.1.0.** `node scripts/enrich-referentiel.mjs` ajoute à chaque
   compétence sa `description` exacte (`referentiel-v7-definitions.json`), avec
   le **même** `contentHash` → `respire-v7.1.0.json` (`INSTALL.md` §2 ;
   `deploy.mjs` importe la 7.1.0 si le fichier existe).
4. **Validateurs** (quand `schemas/` a changé). `node scripts/build-validators.mjs`
   précompile les cinq schémas (ajv standalone, sans `eval`) dans
   `engine/src/validation-compiled.js`, puis vérifie que `respire-v7.json` passe
   (« smoke: real referentiel validates OK (eval-free) »).
5. **Contrôle.** `node scripts/validate-corpus.mjs` valide avec le moteur les
   59 journées, `merge.json`, `respire-v7.json` et chaque `schemas/fixtures/*.json`
   (type lu dans le document) : une ligne `OK`/`KO` par fichier, bilan
   « N OK, 0 KO sur N fichiers », code 0.
6. **Front.** `npm run build` (dans `web/`) déclenche le `prebuild` :
   `generate-fiches.mjs` régénère `twin6/prompts/P1..P7.md` depuis
   `fiches-v7.json` (RG4), puis `build-twin6-package.mjs` assemble le paquet
   statique Twin6 ; Vite construit ensuite le bundle (UC-SYS-02 étape 1).
7. **Release API.** `./scripts/deploy/stage-api.sh` copie les sources et les
   schémas, lance `build-tuteur-digest.mjs` (`scripts/data/tuteur-digest.md`,
   **avant** la copie de `scripts/data` dans la release — UC-VIS-05), puis
   `build-default-prompt-package.mjs` (paquet par défaut
   `aurora-v3-reconstruit` 1.0.0, RG5), `generate-fiches.mjs` (les P*.md du
   paquet Twin6 ne dépendent donc plus d'un build du front antérieur) et
   `build-twin6-prompt-package.mjs` (paquet publié `twin6-ouverte` 1.0.0, RG6),
   et enfin `composer`.
8. **Consommation.** `node scripts/deploy/deploy.mjs api` importe
   `respire-v7.json`, `respire-v7.1.0.json` (s'il existe) et
   `build/prompt-packages/*.json` (UC-SYS-02 étapes 5 et 8).

## Scénarios alternatifs

- **A1 — Chemins explicites** (étapes 1-3) : les convertisseurs,
  `extract-referentiel.mjs` et `enrich-referentiel.mjs` acceptent leurs chemins
  d'entrée et de sortie en arguments (résolus depuis le dossier courant) ;
  `extracted-to-day-json.mjs` ne retient que les dossiers `AAAA-MM-JJ`.
- **A2 — Resynchroniser le corpus des fiches depuis la base** (après une
  édition gouvernée, UC-EPI-03) : `SITE_URL=… MIGRATE_TOKEN=… node
  scripts/dump-fiches.mjs` — à défaut d'environnement, `SITE_URL` et
  `MIGRATE_TOKEN` sont lus dans `.env.deploy`, puis valent
  `http://localhost:8080` et `dev_migrate_token`. Le script appelle
  `GET /api/admin/dump-fiches` (jeton en en-tête `X-Migrate-Token`) et réécrit
  `scripts/data/fiches-v7.json` avec le **même** `_comment` qu'`extract-fiches`
  (corpus octet-stable quelle que soit sa provenance), à committer avant de
  reconstruire (étape 6).
- **A3 — Réextraire le corpus depuis les P*.md** : `node
  scripts/extract-fiches.mjs` découpe chaque P*.md avec le `parsePole` du moteur,
  **prouve** que le réassemblage redonne le fichier octet pour octet (RG4) et
  réécrit `fiches-v7.json`.
- **A4 — Vérifier sans écrire** : `node scripts/generate-fiches.mjs --verify`
  compare les P*.md au corpus (« parité OK : les 7 P*.md sont byte-identiques au
  corpus fiches-v7.json. »).
- **A5 — Sommaire GitBook** (quand la documentation bouge) : `node
  scripts/build-gitbook-summary.mjs` réécrit `SUMMARY.md` (versionné) : manuels
  par rôle (titre du front-matter `titre:`, sinon premier `# H1`), documentation
  groupée, toutes les fiches `UC-*.md` par acteur dans l'ordre du catalogue,
  tous les ADR.

## Scénarios d'erreur

- **E1 — Corpus amont incomplet** (étape 1) : constante requise absente
  (`domainsData`, `profilMeta`, `kairosHtml`, `profilIpsatif`, `feuillesData`)
  → « Missing const X in carto-data.js » ; littéral ni JSON ni objet simple →
  « const X: literal is neither JSON nor a simple JS object » ; alias vers une
  constante inconnue ; aucune déclaration en colonne 0 ; journée sans
  `carto_Pn.json` → « <date>: missing carto_Pn.json ». Code 1 ; `merge.json`
  n'est pas écrit ; pour les journées, celles déjà converties restent et
  `index.json` n'est pas écrit.
- **E2 — Définitions incohérentes** (étape 3) : manquantes → « Définitions
  manquantes pour N compétence(s) : codes » ; surnuméraires → « Définitions
  surnuméraires (codes inconnus) : codes » ; code 1, rien d'écrit. Structure
  modifiée (hash recalculé ≠ `contentHash` de la base) → « ATTENTION : le hash …
  diffère de 7.0.0 … », code 1, mais le 7.1.0 est **déjà écrit** (AN-3).
- **E3 — Prérequis non générés** : `build-default-prompt-package.mjs`,
  `build-twin6-prompt-package.mjs` ou la fumée de `build-validators.mjs` sans
  `respire-v7.json`, `validate-corpus.mjs` sans corpus démo → `ENOENT`, code 1 ;
  rien d'écrit, sauf `validation-compiled.js`, réécrit avant la fumée.
- **E4 — Fiches incohérentes** : P*.md altéré → `extract-fiches.mjs` :
  « ÉCHEC PARITÉ Pn.md : régénéré (x o) ≠ source (y o), 1er écart … » ;
  même code dans deux pôles → « Code dupliqué entre pôles : code » ; code 1,
  corpus intact. `generate-fiches.mjs --verify` : « Pn.md DIFFÈRE du corpus
  (…) » puis « ÉCHEC : k P*.md divergent du corpus. », code 1, rien d'écrit.
  Corpus sans en-tête d'un pôle → « En-tête de pôle manquant : n », code 1.
- **E5 — Gabarits Twin6 absents** (étapes 6-7, clone neuf) :
  `generate-fiches.mjs` crée le dossier `twin6/prompts/` et y écrit les P*.md,
  mais `build-twin6-package.mjs` et `build-twin6-prompt-package.mjs` →
  « prompt manquant : …/1-scan-pole.md ». Le `prebuild` du front et
  `stage-api.sh` s'arrêtent (AN-2).
- **E6 — Document non conforme** (étape 5) : `KO <fichier> (<type>) — N
  erreur(s)` suivi des 8 premières erreurs (`chemin [mot-clé] message`) puis
  « … M erreur(s) supplémentaire(s) » ; « JSON illisible : … » ; « kind inconnu
  ou absent : … » ; bilan « x OK, y KO sur z fichiers », code 1.
- **E7 — Dérive d'un gabarit du moteur** (étape 7) : une sous-chaîne attendue
  absente (« build-default-prompt-package: expected substring not found »), une
  sentinelle survivante ou un paquet non conforme au schéma arrêtent la
  construction, code 1, rien d'écrit (RG5).
- **E8 — Resynchronisation impossible** (A2) : réponse non 2xx → « dump-fiches:
  HTTP <code> <200 premiers caractères du corps> » ; réponse sans
  `poleHeaders`/`fiches` → « dump-fiches: réponse inattendue (poleHeaders/fiches
  manquants) » ; API injoignable → exception `fetch failed`. Code 1, corpus
  intact.

## Règles de gestion

- **RG1** — Sources versionnées → artefacts dérivés, jamais l'inverse :
  `assets-existants/` est en lecture seule ; un artefact bogué se corrige dans
  le convertisseur, jamais dans le JSON produit (`docs/contrats.md` §4.6). Les
  sorties sont gitignorées (`web/public/data/`, `build/`,
  `scripts/data/tuteur-digest.md`), sauf `validation-compiled.js`,
  `fiches-v7.json` et `SUMMARY.md`, versionnés et régénérés à la main.
- **RG2** — Déterminisme octet pour octet : ni horloge ni aléa (dates de
  publication fixes 2026-07-12 et 2026-07-16 dans les paquets, `generatedAt`
  recopié de l'amont) ; les champs amont sont recopiés sans renommage
  (`docs/contrats.md` §4.1).
- **RG3** — Identité du référentiel : `contentHash` = SHA-256 de
  `JSON.stringify({poles, competences})`, pôles `{num, nom, couleur}` triés par
  numéro, compétences `{code, nom, pole}` triées par code. La `description` de
  la 7.1.0 est hors hash (même empreinte que 7.0.0) et n'est jamais fabriquée :
  61 définitions exactes, ni manquante ni surnuméraire.
- **RG4** — Règle (b) des fiches : `Pn.md` = en-tête du pôle + fiches des
  codes du pôle **triés**, jointes par une ligne vide, + saut de ligne final.
  Source unique : `scripts/data/fiches-v7.json` ; toute réextraction prouve la
  parité octet avant d'écrire.
- **RG5** — Paquet par défaut : les gabarits sont obtenus en appelant les vrais
  constructeurs de prompts du moteur avec des variables sentinelles, remplacées
  ensuite par des `{{placeholders}}` ; chaque remplacement est vérifié et le
  paquet est validé par le moteur avant écriture : une dérive des gabarits casse
  la construction au lieu de dériver silencieusement.
- **RG6** — Twin6 : un seul corpus pour les deux paquets ; textes scan-pôle,
  kairos, méga-prompt et fiches P1..P7 octet pour octet identiques entre le
  paquet statique et le prompt-package ; ce dernier est réservé
  (`metadata.reserved`) et délègue l'exécution au moteur (`engine://…(twin6)`,
  `executerTwin6`).
- **RG7** — Validateurs précompilés (CSP sans `unsafe-eval`) : à régénérer à
  chaque modification de `schemas/`. Étape manuelle : aucune étape de la chaîne
  ne vérifie qu'ils sont à jour (AN-1).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Corpus démo (`assets-existants/merge-prototype`) | Données réelles de référence (corpus Aurora v3), publiées comme démonstration ; lecture seule, aucune donnée d'utilisateur de la plateforme |
| Référentiel, définitions, fiches, gabarits | Contenus de référence publics ; aucune donnée personnelle |
| `dump-fiches.mjs` | Lit des fiches (contenu de référence) ; jeton en en-tête, jamais dans l'URL ; `.env.deploy` hors dépôt |
| `SUMMARY.md`, digest tuteur | Titres et routes seulement |
| Journaux des scripts | Compteurs, chemins et tailles ; en cas d'échec, courts extraits de contenus de référence : 2 × 30 caractères de fiche (source et régénéré, E4), 120 caractères de gabarit (E7), 200 premiers caractères de la réponse HTTP (E8), début du fichier illisible cité par le message de `JSON.parse` (E6) ; aucune donnée d'utilisateur de la plateforme |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Script | `scripts/convert/lib/carto-data-parser.mjs` — `parseCartoDataFile` | Lecture sans évaluation des constantes de `carto-data.js` |
| Script | `scripts/convert/carto-data-to-merge-json.mjs` — `toMergeDocument` | Document `cartographie-merge` de la démo |
| Script | `scripts/convert/extracted-to-day-json.mjs` — `toDayDocument`, `frenchLabel` | Documents `cartographie-jour` et index |
| Script | `scripts/extract-referentiel.mjs` | Référentiel 7.0.0 et `contentHash` (RG3) |
| Script | `scripts/enrich-referentiel.mjs` | Référentiel 7.1.0 (définitions, même hash) |
| Script | `scripts/build-validators.mjs` → `engine/src/validation-compiled.js` | Validateurs précompilés (RG7) |
| Moteur | `engine/src/validation.js` — `validateDocument` | Validation utilisée par les scripts et les tests |
| Script | `scripts/validate-corpus.mjs` | Contrôle du corpus et des fixtures |
| Script | `scripts/generate-fiches.mjs`, `scripts/extract-fiches.mjs` — `reassembleFiche` | Règle (b), aller-retour corpus ↔ P*.md |
| Moteur | `engine/src/twin9/referentiel.js` — `parsePole` | Découpage des P*.md (A3) |
| Script | `scripts/dump-fiches.mjs` | Resynchronisation du corpus depuis l'API (A2) |
| Script | `scripts/build-twin6-package.mjs`, `scripts/build-twin6-prompt-package.mjs` | Paquets Twin6 statique et publié (RG6) |
| Script | `scripts/build-default-prompt-package.mjs` | Paquet par défaut `aurora-v3-reconstruit` (RG5) |
| Script | `scripts/build-tuteur-digest.mjs` | Digest de l'assistant tuteur — testé par UC-VIS-05-U07 |
| Script | `scripts/build-gitbook-summary.mjs` | `SUMMARY.md` (A5) |
| Chaîne | `scripts/deploy/stage-api.sh`, `web/package.json` (`prebuild`), `scripts/deploy/deploy.mjs` | Ordre réel et consommation des artefacts |

## Jeux de tests

Tous les tests sont dans le moteur (exécutés par la CI de publication, entrées
versionnées seulement). Les scripts qui s'exécutent dès l'import sont lancés en
**sous-processus** dans un miroir temporaire (copie des scripts et des entrées
versionnées dans `os.tmpdir()`, `engine/node_modules` relié en lecture seule) :
rien n'est écrit dans le dépôt. Les dossiers temporaires sont résolus par
`realpathSync` : quand `os.tmpdir()` traverse un lien symbolique (macOS :
`/var/folders` → `/private/var/folders`), les scripts à garde CLI ne feraient
rien (AN-4) et les autres imprimeraient des chemins différents de ceux du test.

Les tests fonctionnels (niveau « CLI » : scénario rejoué par l'interface
publique des scripts, en sous-processus) sont rangés dans
`engine/test/usecases/unit/`, seul dossier de cas d'utilisation du moteur prévu
par le catalogue, comme UC-SYS-01-F22, UC-SYS-02-F19 et UC-PRO-08-F17.

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-SYS-04-U01 | `parseCartoDataFile` | Les 10 constantes du `carto-data.js` réel, alias `rapportHtml` = `kairosHtml`, littéral JS non JSON (`patternTemporel`) | `engine/test/usecases/unit/uc-sys-04-construire-artefacts-derives.test.js` |
| UC-SYS-04-U02 | `parseCartoDataFile` | Colonne 0 seulement, littéral multiligne, alias, objet JS simple ; erreurs (aucune déclaration, alias inconnu, code exécutable refusé et jamais évalué) (E1) | idem |
| UC-SYS-04-U03 | `toMergeDocument` | Corpus réel conforme à `cartographie-merge`, recopie sans renommage, valeurs par défaut, constante requise absente refusée (E1) | idem |
| UC-SYS-04-U04 | `toDayDocument`, `frenchLabel` | Pôles remis dans l'ordre P1..P7, kairos facultatif, pôle manquant refusé (E1), journée réelle conforme | idem |
| UC-SYS-04-U05 | `reassembleFiche`, `parsePole` | Règle (b) exacte ; aller-retour octet pour octet sur les 61 fiches du corpus versionné (RG4) | idem |
| UC-SYS-04-U06 | `stage-api.sh`, `prebuild`, `deploy.mjs` | Ordre réel de la chaîne sur les seules lignes actives (étape commentée ou neutralisée refusée), dont les P*.md régénérés avant le paquet Twin6 ; prérequis manuels non rejoués par `stage-api.sh` ; boucles d'import de `deploy.mjs` (référentiels puis paquets) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-SYS-04-F01 | Nominal, étape 1 | CLI | `merge.json` et 59 journées conformes, `index.json` chronologique, sorties identiques au second passage (RG2) | `engine/test/usecases/unit/uc-sys-04-chaine-artefacts-derives.test.js` |
| UC-SYS-04-F02 | A1, E1 | CLI | Chemins relatifs en argument résolus depuis le dossier courant, distinct de la racine du dépôt (convertisseurs, `extract-referentiel`, `enrich-referentiel`), dossiers non datés ignorés ; constante ou pôle manquant → code 1, sortie non écrite | idem |
| UC-SYS-04-F03 | Nominal, étape 2 | CLI | 7.0.0 conforme, pôles colorés, `contentHash` recalculé, égal à la fixture versionnée, déterministe (RG3) | idem |
| UC-SYS-04-F04 | Nominal, étape 3 | CLI | 7.1.0 : 61 définitions exactes, même `contentHash`, déterministe (RG3) | idem |
| UC-SYS-04-F05 | E2 (AN-3) | CLI | Définitions manquantes / surnuméraires → code 1 sans sortie ; structure modifiée → code 1 mais 7.1.0 écrit (comportement actuel) | idem |
| UC-SYS-04-F06 | Nominal, étape 4 (AN-1) | CLI | Validateurs recompilés identiques d'un passage à l'autre, sans `eval` ni `require`, acceptant le 7.1.0 et une archive qui l'embarque ; validateurs versionnés : 61 erreurs `additionalProperties` (comportement actuel) | idem |
| UC-SYS-04-F07 | Nominal, étape 5, E6 | CLI | Tout OK, code 0 ; journée non conforme, JSON illisible, `kind` absent, plus de 8 erreurs tronquées → code 1 ; 7.1.0 hors périmètre | idem |
| UC-SYS-04-F08 | E3 | CLI | Prérequis absents → `ENOENT`, code 1, rien d'écrit sauf `validation-compiled.js` | idem |
| UC-SYS-04-F09 | Nominal, étape 7, E7 | CLI | Paquet `aurora-v3-reconstruit` conforme, placeholders, variables documentées, aucune sentinelle, déterministe ; gabarit du moteur modifié → construction refusée (RG5) | idem |
| UC-SYS-04-F10 | Nominal, étape 6, A3, A4, E4 | CLI | 7 P*.md, `--verify` OK, `extract-fiches` redonne le corpus versionné octet pour octet ; parité rompue, code dupliqué, en-tête manquant → code 1, corpus intact (RG4) | idem |
| UC-SYS-04-F11 | E5 (AN-2) | CLI | Entrées versionnées seules : `generate-fiches` crée le dossier et écrit les 7 P*.md ; paquets Twin6 « prompt manquant » (comportement actuel) | idem |
| UC-SYS-04-F12 | Nominal, étapes 6-7 | CLI | Gabarits Twin6 fournis : paquet publié conforme au schéma `prompt-package`, paquet statique (sans schéma) à la forme exacte du contrat `executerTwin6` (clés, fiches 1..7), textes identiques aux P*.md, réservé, déterministes (RG6) | idem |
| UC-SYS-04-F13 | A2 | CLI + HTTP simulé | `dump-fiches` : requête `GET` avec jeton, corpus identique octet pour octet au versionné ; `.env.deploy`, priorité de l'environnement, jeton par défaut | idem |
| UC-SYS-04-F14 | E8 | CLI + HTTP simulé | 403, réponse incomplète, API injoignable → code 1, corpus intact | idem |
| UC-SYS-04-F15 | A5 | CLI | `SUMMARY.md` : manuels, toutes les fiches UC par acteur (titre H1), tous les ADR, déterministe ; document absent → nom de fichier ; parcours absent → entrée seule | idem |
| UC-SYS-04-F16 | AN-4 | CLI | Les quatre scripts à garde CLI lancés par un chemin qui traverse un lien symbolique : code 0, aucune sortie, rien d'écrit (comportement actuel) ; par le chemin réel, ils travaillent | idem |

### Tests existants liés (non-régression)

- `engine/src/twin9/fiches-corpus.test.js` — aller-retour corpus ↔ P*.md avec
  `reassembleFiche` et `parsePole` (CI moteur).
- `engine/src/validation.test.js` — les cinq types de documents, `$ref` croisés.
- `web/src/data/referentiel-v710.test.js` — invariants du 7.1.0 publié (local :
  lit `web/public/data`).
- `web/src/views/promptologue/twin6-prompt-package.test.js` — identité du paquet
  atelier et du paquet statique (local : lit les artefacts générés).
- `web/test/usecases/unit/uc-vis-05-interroger-assistant-tuteur.test.js` —
  UC-VIS-05-U07, `build-tuteur-digest.mjs` exécuté dans un miroir temporaire.
- `api/tests/FicheParityTest.php`, `api/tests/FicheAdminEndpointsTest.php` —
  parité PHP (`FicheGenerator`) et route `dump-fiches` (aussi UC-SYS-02-F05,
  UC-EPI-03-F13).
- `api/tests/PackagesTest.php` — import du paquet par défaut généré (ignoré si
  `build/prompt-packages/` n'a pas été construit).

### Exécuter

```sh
cd engine && npx vitest run test/usecases/unit/uc-sys-04-construire-artefacts-derives.test.js test/usecases/unit/uc-sys-04-chaine-artefacts-derives.test.js
```

## Anomalies constatées

- **AN-1 — Validateurs versionnés périmés : le moteur refuse le référentiel
  7.1.0.** Le schéma `schemas/referentiel.schema.json` admet
  `competences[].description` (facultatif, ajouté pour la 7.1.0) ; le fichier
  versionné `engine/src/validation-compiled.js` embarque le schéma **tel qu'il
  était avant cet ajout** (seule différence), `build-validators.mjs` n'ayant pas
  été relancé. `validateDocument('referentiel', 7.1.0)` renvoie donc 61 erreurs
  `additionalProperties`, et une archive `archive-export` qui embarque ce
  référentiel est refusée. Or le référentiel publié le plus récent est la 7.1.0
  (importée par `deploy.mjs`, placée en tête de `data/referentiel/index.json`
  par `StaticExporter` — UC-VIS-02 —, chargée par `loadPublishedReferentiel`),
  comme toute release ultérieure (définitions embarquées par
  `SnapshotAssembler`, UC-EPI-03), et l'export d'archive du front
  (`web/src/lib/archive.js`, UC-APP-06) valide l'archive avec ces validateurs :
  l'export RGPD « en un clic » échoue alors avec « L'archive assemblée n'est pas
  conforme au schéma archive-export (61 erreurs) : export annulé ». Rien ne
  détecte la dérive : `validate-corpus.mjs` ne valide que la 7.0.0 et le
  validateur PHP lit les schémas directement. Correctif : relancer
  `node scripts/build-validators.mjs` et ajouter à la chaîne une vérification
  de fraîcheur des validateurs. Figé par UC-SYS-04-F06.
- **AN-2 — La construction Twin6 n'est pas reproductible depuis le dépôt.**
  `web/public/data/` est gitignoré et les gabarits Twin6 publics
  `0-mega-prompt.md`, `1-scan-pole.md` et `2-kairos-final.md` n'ont **aucune**
  source versionnée (seuls les P*.md se régénèrent, depuis `fiches-v7.json`).
  Sur un clone neuf, `npm run build` échoue dès le `prebuild` et `stage-api.sh`
  échoue à `build-twin6-prompt-package.mjs` : la promesse de « clone
  déployable » (cahier §5, `INSTALL.md`) n'est pas tenue pour le front ni pour
  la release de l'API. Corrigé en partie le 2026-09-29 : `generate-fiches.mjs`
  crée désormais son dossier de sortie, et `stage-api.sh` régénère les P*.md
  avant le paquet Twin6 au lieu de dépendre d'un build du front antérieur.
  Reste à versionner les trois gabarits. Figé par UC-SYS-04-F11.
- **AN-3 — `enrich-referentiel.mjs` écrit la 7.1.0 avant de contrôler le
  hash.** Quand la structure de la base a changé, le script écrit
  `respire-v7.1.0.json` (avec une empreinte différente de la 7.0.0) **puis**
  signale l'écart et sort en code 1 : le fichier refusé reste à l'emplacement
  que `deploy.mjs` importe. Figé par UC-SYS-04-F05.
- **AN-4 — Quatre scripts ne font rien, en silence et avec le code 0, quand on
  les lance par un chemin qui traverse un lien symbolique.**
  `carto-data-to-merge-json.mjs` et `extracted-to-day-json.mjs`
  (`process.argv[1] === fileURLToPath(import.meta.url)`), `extract-fiches.mjs`
  (`import.meta.url === pathToFileURL(argv[1]).href`) et
  `build-twin6-prompt-package.mjs`
  (`fileURLToPath(import.meta.url) === resolve(process.argv[1])`) n'appellent
  leur `main` que si leur propre chemin égale `process.argv[1]`. Or Node résout
  les liens symboliques du point d'entrée pour `import.meta.url`, pas pour
  `process.argv[1]` : lancés par un chemin logique (dépôt atteint par un lien,
  par exemple un dossier Dropbox ; `stage-api.sh`, dont `$repo` est calculé par
  `pwd`, donc logique, quand on le lance depuis un tel dossier), ils sortent en 0
  sans rien écrire ni afficher. `stage-api.sh` ne régénère alors pas
  `build/prompt-packages/twin6-ouverte-1.0.0.json` — `deploy.mjs` importe le
  paquet périmé d'un build antérieur, ou aucun —, sans aucune erreur. Un
  chemin relatif lancé depuis le dossier (`node scripts/…`) n'est pas touché :
  Node le résout depuis le dossier courant physique. Correctif : comparer `realpathSync(process.argv[1])` au
  chemin du module. Figé par UC-SYS-04-F16.

## Limites

- `generate-fiches.mjs`, `extract-referentiel.mjs`, `enrich-referentiel.mjs`,
  `build-validators.mjs`, `validate-corpus.mjs`, `dump-fiches.mjs`,
  `build-twin6-package.mjs`, `build-twin6-prompt-package.mjs` (lecture des
  gabarits au chargement du module), `build-default-prompt-package.mjs` et
  `build-gitbook-summary.mjs` s'exécutent dès leur chargement : ils ne sont
  testés qu'en sous-processus, pas unitairement.
- Les tests Twin6 (F12) utilisent des gabarits **synthétiques** : les vrais
  gabarits publics ne sont pas versionnés (AN-2).
- `dump-fiches.mjs` est testé contre un serveur HTTP local qui simule la route ;
  la route réelle est couverte par UC-SYS-02-F05 et UC-EPI-03-F13.
- `SUMMARY.md` versionné n'est pas comparé à sa régénération : il dépend de
  toutes les fiches présentes et se régénère à la main (A5) ; à la rédaction de
  cette fiche, il ne listait pas encore les cas d'utilisation.
- L'export statique des versions **publiées** du référentiel
  (`scripts/export-referentiel-static.php`, depuis la base) relève d'UC-VIS-02
  et d'UC-EPI-03 ; les scripts PHP d'import (`import-referentiel.php`,
  `import-prompt-packages.php`, `seed-competences.php`) relèvent d'UC-SYS-02.
- La conséquence d'AN-1 sur l'export d'archive du front (UC-APP-06) a été
  constatée en appelant `exportArchive` avec un référentiel 7.1.0 injecté ; elle
  n'est figée ici qu'au niveau du moteur (F06), le front relevant d'UC-APP-06.
- L'exécution complète de `stage-api.sh` (Docker, `composer`) n'est pas rejouée :
  seul son ordre est vérifié (U06) ; sa conséquence d'AN-4 (paquet Twin6 non
  régénéré) est déduite du comportement de `build-twin6-prompt-package.mjs`
  figé par F16. `validate-corpus.mjs` enregistre encore un
  hook de chargement des `.json` devenu sans objet depuis les validateurs
  précompilés (note d'outillage de `docs/contrats.md` §5 à actualiser).
