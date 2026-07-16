# Contrats de données (P1)

Les schémas JSON de `schemas/` (draft 2020-12) sont **le contrat entre tous les
modules** (cahier §4.3, §4.5, §6). Doctrine : les schémas se déduisent des
exemples réels, pas l'inverse — on ne « corrige » jamais une donnée réelle pour
la faire rentrer dans un schéma, et on ne renomme pas un champ pour contourner
une friction : toute friction se documente ici.

Validation croisée de tout le corpus :

```
npm run validate:corpus          # à la racine (ou dans web/)
# = node scripts/validate-corpus.mjs
```

Le script valide, via `engine/src/validation.js` (ajv), les 59 documents jour
réels, `merge.json`, le référentiel réel et toutes les fixtures de
`schemas/fixtures/`. État actuel : **68 fichiers, 68 OK**. Le jumeau PHP
(`api/src/Validation.php`, opis/json-schema) charge les mêmes fichiers de
schémas ; les deux runtimes sont testés (`engine/src/validation.test.js`,
`api/tests/ValidationTest.php`) sur des documents jumeaux.

## 1. Rôle de chaque schéma

| Schéma | `kind` | Rôle |
|---|---|---|
| `referentiel.schema.json` | `referentiel` | Référentiel de compétences (RESPIRE v7 : 7 pôles, 61 compétences), versionné semver + `contentHash` SHA-256, édité par les épistémiarques, historisé (cahier §4.1). Document réel : `web/public/data/referentiel/respire-v7.json`. |
| `cartographie-jour.schema.json` | `cartographie-jour` | Résultat de la cartographie d'UNE feuille de portfolio (une journée) : 7 pôles (pièces, examen adversarial du pédagogue, verdicts, rapport narratif) + synthèse kairos. Documents réels : `web/public/data/demo/jours/<date>.json` (59 feuilles). |
| `cartographie-merge.schema.json` | `cartographie-merge` | Agrégat chronologique de TOUTES les feuilles (merge évolutif v3) : séries temporelles par pôle et par compétence, archétypes, profil ipsatif, narratifs HTML. Source du sunburst. Document réel : `web/public/data/demo/merge.json`. |
| `prompt-package.schema.json` | `prompt-package` | Paquet promptologue : textes de prompts + variables + code JS d'orchestration (sandbox Web Worker) + métadonnées (version, auteur, modèle cible, référentiel compatible, changelog). |
| `archive-export.schema.json` | `archive-export` | Format pivot de portabilité (ADR-006) : archive autoporteuse embarquant portfolios en texte intégral, référentiels et prompt-packages COMPLETS, cartographies produites et journal d'audit. Sert l'export/suppression RGPD, l'import de compte et le seed d'instance. Référence les 4 autres schémas par `$ref` sur leur `$id` absolu. |

Chaque document porte `schemaVersion` (semver du schéma d'enveloppe, « 1.0.0 »
partout aujourd'hui) et `kind` (discriminant, `const` dans chaque schéma) —
c'est la clé de dispatch de `validateDocument(kind, data)` des deux runtimes.

Philosophie de fermeture : les **enveloppes** construites par nos
convertisseurs sont fermées (`additionalProperties: false`) ; les **blocs de
sortie LLM recopiés tels quels** (contenu de `poles[]`, `kairos`, `domains`,
`profilMeta`…) sont ouverts (`additionalProperties: true`) — seuls les champs
décrits sont garantis, de futurs runs peuvent en ajouter sans casser le
contrat.

## 2. Mapping formats legacy → schémas

### 2.1 `carto-data.js` (10 consts) → document `cartographie-merge`

Convertisseur : `scripts/convert/carto-data-to-merge-json.mjs` (parser :
`scripts/convert/lib/carto-data-parser.mjs`). Entrée :
`assets-existants/merge-prototype/carto-data.js` (lecture seule absolue),
sortie : `web/public/data/demo/merge.json`. Les constantes amont sont
**recopiées telles quelles, sans renommage de champ** ; l'enveloppe
(`schemaVersion`, `kind`, `generatedAt`, `source`, `periode`, `narratifs`,
`reserved`) est construite par le convertisseur.

| Const legacy | Destination dans le document merge |
|---|---|
| `domainsData` | `domains` (verbatim — 7 pôles, compétences agrégées, `parFeuille`, `rapport_html`, tendances) |
| `profilMeta` | `profilMeta` (verbatim) **et** enveloppe : `generatedAt` = `date_construction ?? null`, `source.protocole` = `source_protocole ?? null`, `source.journalId` = `journal_id ?? null`, `periode` = `{premiere_date, derniere_date, nb_feuilles}` |
| `kairosHtml` | `narratifs.kairosHtml` |
| `rapportHtml` | `narratifs.rapportHtml` (dans `carto-data.js` c'est littéralement `const rapportHtml = kairosHtml;` — le parser résout l'alias ; champ conservé distinct car le viewer hérité lit les deux) |
| `profilIpsatif` | `profilIpsatif` (verbatim — dictionnaire indexé « 1 » à « 7 ») |
| `feuillesData` | `feuilles` (verbatim, y compris `carto_day_url` — voir §2.3) |
| `connexionsData` | `reserved.connexionsData` (tableau vide dans le corpus) |
| `noeudsConceptuels` | `reserved.noeudsConceptuels` (tableau vide dans le corpus) |
| `patternTemporel` | `reserved.patternTemporel` (`{pattern: "", description: ""}` dans le corpus) |
| `piecesData` | `reserved.piecesData` (objet vide dans le corpus) |

### 2.2 `extracted/<date>/*.json` → document `cartographie-jour`

Convertisseur : `scripts/convert/extracted-to-day-json.mjs`. Entrée :
`assets-existants/merge-prototype/extracted/<date>/` (8 fichiers par journée :
`carto_P1.json` … `carto_P7.json` + `kairos.json` — sorties LLM brutes du
protocole Aurora v3), sortie : `web/public/data/demo/jours/<date>.json` +
`index.json`.

| Fichier amont | Destination dans le document jour |
|---|---|
| `carto_P<n>.json` (n = 1…7) | `poles[n-1]` (verbatim ; les 7 sont obligatoires, l'absence d'un pôle fait échouer la conversion) |
| `kairos.json` | `kairos` (verbatim ; `null` si le fichier est absent — prévu par le convertisseur, non observé dans le corpus : les 59 feuilles ont un kairos) |
| — | Enveloppe construite : `schemaVersion`, `kind`, `date` (= nom du dossier, AAAA-MM-JJ) |

`index.json` (hors schéma, fichier de service pour le fetch paresseux) liste
`{date, iso, label JJ/MM/AAAA, ordre}` par journée ; `feuilles[]` du merge a la
même forme plus `carto_day_url`.

### 2.3 Liens `feuilles/<date>/carto-day.html` → routes `#/jour/<iso>?focus=<code>`

Le HTML narratif hérité (les `feedback` de compétences du merge en contiennent
1262, plus `feuilles[].carto_day_url`) pointe vers des pages
`feuilles/<date>/carto-day.html?focus=<code>` du prototype **qui n'existent pas
dans les assets**. Décision (plan-fusion-visu, ADR-009) :

- les données sont conservées **telles quelles** dans `merge.json` (on ne
  réécrit pas la donnée) ;
- les liens sont **réécrits au rendu**, après sanitization DOMPurify, vers la
  route hash `#/jour/<iso>?focus=<code>` de la vue Journée reconstruite depuis
  les documents `cartographie-jour`.

## 3. Écarts observés entre exemples réels et schémas, et traitement

Écarts relevés lors de la déduction des schémas depuis le corpus réel
(59 feuilles, 413 pôles, 3590 verdicts), tous absorbés par le schéma — la
donnée réelle est la vérité :

| Écart observé | Traitement dans le schéma |
|---|---|
| `poles[].rapport` absent de la sortie LLM sur 8 pôles / 413 | `rapport` requis mais nullable (`oneOf` null) |
| `pedagogue: null` sur toutes les compétences court-circuitées **et** sur 40 compétences non court-circuitées | `pedagogue` requis mais nullable ; `courtCircuit` reste le discriminant du profil de verdict |
| Deux profils de `verdict` : complet (`motif`, `prescription`) après examen du pédagogue vs court-circuit (`raison`, `prescriptionMinimale`, 0 preuve / 0 indice) | les 4 champs textuels sont optionnels ; seuls `statut`, `confiance`, `nombrePreuves`, `nombreIndices` sont requis |
| `passagesSaillants[].auteur` présent sur 2942/3042 passages, `feuille` sur 2654/3042 | champs optionnels |
| `pieces[].auteur` présent sur 304/4098 pièces, `extraitVerbatim` sur 238/4098 (sinon l'extrait se retrouve via `pid`) | champs optionnels |
| `generatedAt` / `date_construction` sans fuseau horaire (`AAAA-MM-JJThh:mm:ss`) | pattern dédié, pas de `format: date-time` |
| `tendance_temporelle` : 3 valeurs observées seulement (`presence_reguliere`, `pic_milieu`, `crescendo`) | pas d'enum (vocabulaire non fermé), valeurs en `examples` |
| `domains[].competences[].statut` : seule « présence établie » observée (le merge ne retient que les compétences établies) | enum complet des 3 statuts conservé (contrat plus général que le corpus) |
| `archetype` : 6 valeurs toutes observées | enum fermé |
| `profilMeta.ponderation_temporelle` **absente du corpus** mais lue par le viewer historique (`cartographie.html` affiche « -X %/an ») | champ **optionnel** documenté dans le schéma (`decote_annuelle` seul champ consommé) — voir §4 |
| Fixtures `referentiel-mini.json` et référentiel embarqué dans `archive-export-exemple.json` : 2 pôles / 4 compétences, en contradiction assumée avec le schéma (7/61) | **fixtures corrigées** (2026-07) : remplacées par un instantané du référentiel réel RESPIRE v7 (`schemas/fixtures/referentiel-respire-v7.json`) ; références alignées (`referentielCompatible`, `referentielId: "respire"`, `referentielVersion: "7.0.0"`, exemples de variables). Le schéma n'a pas été assoupli : 7 pôles / 61 compétences sont une propriété structurelle de RESPIRE v7, cohérente avec le document réel ; un référentiel de forme différente imposera une révision majeure conjointe schéma + référentiel. |

Notes de cohérence hors de portée de JSON Schema (vérifiées par le code, pas
par les schémas) : jointures `pid` → `passagesSaillants`, `pieceId` →
`pieces[].numero`, cohérence `type`/`document` des cartographies d'archive
(clauses if/then), cohérence référentielle des archives
(`referentielId`/`referentielVersion` → `referentiels[]`), et `contentHash` du
référentiel = SHA-256 de `JSON.stringify({poles, competences})` tel que calculé
par `scripts/extract-referentiel.mjs`.

## 4. Décisions

1. **Noms de champs français conservés tels quels.** Les sorties LLM et les
   constantes legacy nomment leurs champs en français (`passagesSaillants`,
   `courtCircuit`, `presomptionSycophantie`, `score_cumule`…), et mélangent
   camelCase (jour) et snake_case (merge). C'est le contrat réel : aucun
   renommage, aucune normalisation de casse. Les conventions « code en
   anglais » s'appliquent au code, pas aux données.
2. **HTML narratif pré-rendu stocké en chaîne, sanitizé au rendu (ADR-007).**
   `narratifs.kairosHtml`, `narratifs.rapportHtml`, `domains[].rapport_html`,
   `competences[].feedback` sont du HTML hérité stocké tel quel dans les
   documents. Le schéma ne contraint pas leur contenu ; ils passent par
   DOMPurify côté client avant toute injection, et la réécriture des liens
   (§2.3) se fait après sanitization.
3. **`rapportHtml` est un alias de `kairosHtml` dans le corpus actuel**
   (`const rapportHtml = kairosHtml;` dans `carto-data.js`). Les deux champs
   restent distincts dans le schéma (requis tous les deux) car le viewer lit
   les deux et qu'ils pourront diverger.
4. **Champs réservés vides conservés** (`reserved.connexionsData`,
   `reserved.noeudsConceptuels`, `reserved.patternTemporel`,
   `reserved.piecesData`) : constantes amont vides mais présentes dans le
   contrat du viewer hérité. Regroupées sous `reserved` (structure interne non
   garantie) plutôt que supprimées, pour compatibilité et pour accueillir de
   futurs merges qui les rempliraient.
5. **`ponderation_temporelle` optionnelle, absente du corpus.** Le viewer
   historique sait l'afficher, aucun document réel ne la porte : elle est
   spécifiée optionnelle dans `profilMeta` (avec `decote_annuelle` requis quand
   elle est présente) au lieu d'être inventée dans les données.
6. **Corpus démo intouchable.** `web/public/data/**` est régénéré uniquement
   par les convertisseurs depuis `assets-existants/` (lecture seule absolue) :
   `node scripts/convert/carto-data-to-merge-json.mjs && node
   scripts/convert/extracted-to-day-json.mjs && node
   scripts/extract-referentiel.mjs`. Un artefact bogué se corrige dans le
   convertisseur, jamais dans le JSON produit.
7. **`PUT /api/prompt-packages/drafts/{draftId}` accepte deux formes de corps**
   (friction M7 constatée à l'intégration) : la notation `{document}` du
   contrat M7 a été lue « enveloppe `{"document": …}` » côté front (analogie
   avec `POST /api/cartographies/{id}/revisions {document, note}`) et
   « le corps EST le document » côté API (analogie avec l'import admin). Les
   deux implémentations étant testées et livrées, la route désambiguïse au
   lieu de renommer : si le corps porte une clé `document` objet, c'est
   l'enveloppe (un prompt-package valide n'a jamais de champ `document`
   objet) ; sinon le corps est le document nu. Réponses inchangées.

8. **Twin6 dans l'atelier : paquet PUBLIÉ « twin6-ouverte », immuable, réservé
   (D1/AD-D1).** Le protocole open source Twin6 alimente DEUX artefacts depuis
   un SEUL corpus (`web/public/data/twin6/prompts/*.md`) : le paquet statique
   public servi par `#/twin6-ouverte` (`scripts/build-twin6-package.mjs`) et un
   document `prompt-package` importé publié en base
   (`scripts/build-twin6-prompt-package.mjs`, `build/prompt-packages/`), forkable
   dans l'atelier promptologue au même titre qu'`aurora-v3-reconstruit`. Les
   textes scan-pole / kairos / fiches P1..P7 sont **byte-identiques** entre les
   deux (source unique, prouvé par `twin6-prompt-package.test.js`).
   - **Sémantique de version.** Une version publiée de `twin6-ouverte` est
     **immuable** : une évolution du référentiel/corpus produit
     `twin6-ouverte@1.1.0`, etc. (jamais une réécriture de `1.0.0`). L'import est
     idempotent par hash de contenu ; un contenu DIFFÉRENT sous un couple
     (id, version) existant est un 409.
   - **Réservation.** `metadata.reserved: true` marque le paquet comme propriété
     du **pipeline source-unique**. Un promptologue ne peut pas republier sous le
     nom `twin6-ouverte` : `POST /api/prompt-packages/drafts` exige alors un
     `toId` (nouveau nom de paquet, slug frais) — le fork est SA copie, publiée
     sous son propre nom. Le drapeau `reserved` remonte dans
     `GET /api/prompt-packages` pour piloter l'UI.
   - **Exécution déléguée au moteur.** `code.orchestration` porte le marqueur
     `engine://…(twin6)` : le banc d'essai et `#/twin6-ouverte` appellent
     `executerTwin6` sur le portfolio **entier** (7 scan-pôle + kairos →
     `cartographie-merge`), jamais l'extraction par jour d'aurora.

## 5. Note d'outillage

`engine/src/validation.js` importe les schémas en imports JSON « nus »
(compatibles Vite, sans `with { type: 'json' }`, non supportés par toutes les
chaînes). Node ≥ 17.5 les refuse : `scripts/validate-corpus.mjs` enregistre
donc un hook de loader (`node:module` `register`) qui sert les `.json` comme
modules ES, ce qui permet de valider le corpus avec **exactement** le même code
que l'application, sans dupliquer la configuration ajv.
