# UC-APP-06 — Exporter et importer son archive complète

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (fonctionne aussi sans session) |
| **Acteurs secondaires** | — (le serveur ne fournit que des lectures) |
| **Portée** | humanome.xyz — section « Mes données » du tableau de bord `#/espace`, entièrement dans le navigateur |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (exporter/importer son compte complet : portfolio, cartographies, prompts utilisés, référentiel), §4.2, §5 (clone déployable), §6.1 (export local systématique), §6.3 (export en un clic) |
| **Décisions** | ADR-006 (archive d'export, format pivot), ADR-001 (client-first) ; `docs/autorisations.md` (P8 : pas de route `/api/account/export|import` en v1) |
| **Statut** | Implémenté (P8.6 ; documents de masse ajoutés en P11) |

## Objectif

Permettre à l'apprenant de télécharger, **en un clic**, une archive JSON
autoporteuse et validée (`archive-export`) contenant ses portfolios, ses
cartographies, le référentiel et le paquet de prompts, puis de **restaurer**
portfolios et cartographies depuis ce fichier dans n'importe quel navigateur
— sans que l'archive ne transite jamais par le serveur.

## Déclencheur

L'apprenant clique « Exporter toutes mes données » (ou « Importer une
archive ») dans la section « Mes données » du tableau de bord `#/espace`.

## Préconditions

- Pour l'export : rien d'obligatoire (une archive vide est valide) ; pour un
  contenu utile, des portfolios (UC-APP-01) et/ou des cartographies
  (UC-APP-02, UC-APP-10) dans le stockage local.
- Pour l'import : un fichier `.json` produit par un export (de cette instance
  ou d'une autre).

## Garanties en cas de succès

- Export : un fichier `humanome-export-AAAA-MM-JJ.json` conforme au schéma
  `archive-export`, **validé par le moteur avant le téléchargement**.
- Import : portfolios et cartographies restaurés dans IndexedDB, avec de
  nouveaux identifiants, **privés et sans copie serveur**.

## Garanties minimales (en cas d'échec)

- Aucune archive non conforme n'est jamais téléchargée.
- Un fichier refusé n'écrit **rien** dans le stockage local.
- Aucune donnée n'est envoyée au serveur (lectures seules).

## Scénario nominal

1. L'apprenant ouvre `#/espace` ; la section « Mes données » (dans « Mes
   cartographies ») annonce le contenu de l'archive et rappelle que la
   suppression du compte se fait dans l'espace compte (UC-CPT-06).
2. Il clique « Exporter toutes mes données ».
3. Le navigateur rassemble en parallèle : l'identité du compte
   (`GET api/auth/me` → rôles, email, nom affiché), les portfolios et les
   cartographies locaux, le référentiel publié (fichier statique, repli sur la
   copie embarquée), un paquet de prompts (`GET api/prompt-packages` puis
   `GET api/prompt-packages/{id}/{version}` du premier de la liste) et ses
   documents produits en cohorte (`GET api/mes-documents-masse`).
4. Il assemble l'archive : `schemaVersion` `1.0.0`, `kind`, `exportedAt`,
   `account`, `portfolios` (texte intégral + segmentation des journées
   datées), `referentiels`, `promptPackages`, `cartographies` (document +
   paquet + référentiel + `runMeta`), `audit` vide ; puis la valide avec le
   moteur (`validateDocument('archive-export')`).
5. Le fichier `humanome-export-AAAA-MM-JJ.json` (JSON indenté) est
   téléchargé ; message « Archive téléchargée (…) : n portfolio(s),
   m cartographie(s). »
6. Sur un autre navigateur (stockage vide, avec ou sans compte), il clique
   « Importer une archive » et choisit le fichier.
7. Le navigateur lit le fichier, vérifie qu'il s'agit de JSON, que
   `kind` vaut `archive-export`, puis le valide au schéma.
8. Il restaure chaque portfolio (segments reconstruits depuis la
   segmentation) et chaque cartographie (visibilité `privee`, sans copie
   serveur, titre dérivé : « Journée du JJ/MM/AAAA », « Parcours du … au … »),
   en ignorant les doublons.
9. Message « Import terminé : n portfolio(s) et m cartographie(s) restaurés
   (les doublons sont ignorés). » ; la liste des cartographies est rafraîchie.

## Scénarios alternatifs

- **A1 — Sans compte ou hors ligne** (étape 3) : chaque lecture en échec est
  remplacée par une valeur neutre : `account` null (archive anonyme),
  `promptPackages` vide, référentiel embarqué, pas de documents de masse ;
  l'export aboutit.
- **A2 — Documents produits en cohorte** (étape 3) : les cartographies de
  masse de l'apprenant (RGPD art. 15/20) sont ajoutées
  (`id` `masse-<run>-<job>`, `runMeta.modele` « cartographie de masse —
  cohorte « <nom> » »).
- **A3 — Réimport** (étape 8) : doublons détectés par **contenu** (texte
  intégral du portfolio, document de la cartographie), y compris à
  l'intérieur d'une même archive : « 0 portfolio(s) et 0 cartographie(s)
  restaurés ».
- **A4 — Archive d'une autre instance** (étape 8) : les versions de paquet et
  de référentiel sont conservées comme traçabilité ; les marqueurs neutres
  (`inconnu`, `0.0.0`) redeviennent « non renseigné ».

## Scénarios d'erreur

- **E1 — Fichier non JSON** (étape 7) : « Ce fichier n'est pas un JSON
  valide. »
- **E2 — Autre document** (étape 7) : « Document non reconnu : une archive
  humanome doit porter « kind: archive-export » (…) ».
- **E3 — Archive non conforme** (étape 7) : « Archive non conforme au schéma
  archive-export (N erreur(s)) : rien n'a été importé. »
- **E4 — Archive assemblée non conforme** (étape 4) : « L'archive assemblée
  n'est pas conforme au schéma archive-export (N erreur(s)) : export annulé,
  rien n'a été téléchargé. » (cas réel : anomalie A-03).

## Règles de gestion

- **RG1** — Tout se passe dans le navigateur : l'export ne fait que des
  lectures `GET` ; **aucune route serveur** n'exporte ni n'importe d'archive.
- **RG2** — Validation par le moteur avant tout téléchargement et avant toute
  écriture à l'import.
- **RG3** — Le bloc `account` ne contient que `roles`, `email`,
  `displayName` ; jamais de clé API ni de mot de passe (le schéma le refuse).
- **RG4** — Portfolios : la segmentation ne garde que les journées datées aux
  offsets entiers valides ; `source` hors {`colle`, `gdocs`, `fichier`} →
  `colle`.
- **RG5** — Cartographies : type `merge` ou `jour` (tout autre type est
  exporté en `jour`) ; traçabilité absente → marqueurs neutres `inconnu` /
  `0.0.0` (jamais inventée) ; `runMeta` réduit aux clés du schéma
  (`modele`, `dateRun`, `tokens{entree, sortie, total}`, `coutEstime`) ;
  visibilité et copie serveur ne sont pas exportées.
- **RG6** — Import : identifiants régénérés, visibilité `privee`, `serverId`
  null (l'opt-in serveur ne s'importe jamais, §6.2) ; seuls portfolios et
  cartographies sont restaurés.
- **RG7** — Les paquets privés (Golden Prompt) ne sont jamais servis, donc
  jamais exportés.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Archive | Construite, validée et téléchargée dans le navigateur ; jamais envoyée |
| Identité | `roles`, `email`, `displayName` lus via la session ; aucun secret |
| Portfolios, cartographies | Lus / restaurés dans IndexedDB |
| Documents de masse | Lus via `GET api/mes-documents-masse` (droit d'accès et de portabilité) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/espace/ExportSection.jsx` (dans `CartographiesPanel.jsx`) | Boutons, champ fichier, messages, rafraîchissement |
| Front | `web/src/lib/archive.js` — `exportArchive`, `importArchive`, `downloadJson` | Assemblage, projections, lectures, restauration, dédoublonnage |
| Front | `web/src/lib/carto-store.js`, `web/src/lib/portfolio-store.js` | Sources et cibles locales |
| Front | `web/src/api/client.js` — `fetchMe`, `apiFetch` ; `web/src/data/referentiel.js` | Lectures du compte, des paquets, de la masse ; référentiel |
| Moteur | `engine/src/validation.js` — `validateDocument('archive-export')` ; `schemas/archive-export.schema.json` | Contrat pivot (ADR-006) |
| API | `GET /api/auth/me`, `GET /api/prompt-packages`, `GET /api/prompt-packages/{id}/{version}`, `GET /api/mes-documents-masse` | Lectures seules |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `listPublished`, `findPublished` | Paquet embarqué, filtrage des paquets privés |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-06-U01 | `validateDocument('archive-export')` | Fixture d'exemple valide et autoporteuse | `engine/test/usecases/unit/uc-app-06-exporter-importer-archive.test.js` |
| UC-APP-06-U02 | idem | Archive anonyme minimale valide (A1) | idem |
| UC-APP-06-U03 | idem | Clé API ou mot de passe dans `account` refusés (RG3) | idem |
| UC-APP-06-U04 | idem | Cohérence type/document ; type `twin9` refusé | idem |
| UC-APP-06-U05 | idem | `source` énumérée, segmentation stricte | idem |
| UC-APP-06-U06 | idem | `runMeta` : clés du schéma seules ; forme de l'assistant refusée | idem |
| UC-APP-06-U07 | `exportArchive` | Portfolios : texte, segmentation datée, normalisations ; nom de fichier ; téléchargement indenté | `web/test/usecases/unit/uc-app-06-exporter-importer-archive.test.js` |
| UC-APP-06-U08 | `exportArchive` | **Comportement actuel** : `runMeta` de l'assistant → `modele` « inconnu », tokens perdus ; forme schéma conservée (A-02) | idem |
| UC-APP-06-U09 | `exportArchive` | Lectures : compte filtré, 1er paquet publié, documents de masse ; uniquement des GET | idem |
| UC-APP-06-U10 | `exportArchive` | Archive non conforme : exception, aucun téléchargement (E4) | idem |
| UC-APP-06-U11 | `importArchive` | Segments reconstruits, ids régénérés, privée sans copie, marqueurs → null, titres | idem |
| UC-APP-06-U12 | `importArchive` | Doublons ignorés, y compris dans une même archive (A3) | idem |
| UC-APP-06-U13 | `importArchive` | JSON invalide, autre `kind`, schéma : refus sans écriture (E1-E3) | idem |
| UC-APP-06-U14 | `PromptPackageRepository` | 1er de `listPublished` = ordre alphabétique puis plus ancienne ; privé jamais servi | `api/tests/UseCases/Unit/UcApp06ExporterImporterArchiveTest.php` |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-06-F01 | Nominal (export) | IHM | `<App/>` : archive validée, téléchargée, compte, 4 cartographies, sans visibilité ni `serverId`, que des GET | `web/test/usecases/functional/uc-app-06-exporter-importer-archive.test.jsx` |
| UC-APP-06-F02 | Nominal (import) | IHM | Navigateur neuf : 1 portfolio + 4 cartographies restaurés, privés, sans badge serveur | idem |
| UC-APP-06-F03 | A1 | IHM | Hors ligne : archive anonyme, sans paquet, référentiel embarqué | idem |
| UC-APP-06-F04 | A2 | IHM | Document de masse inclus (`masse-4-11`) | idem |
| UC-APP-06-F05 | A3 | IHM | Réimport : 0 restauré | idem |
| UC-APP-06-F06 | A4 | IHM | Fixture d'une autre instance : titre dérivé, traçabilité conservée | idem |
| UC-APP-06-F07 | E1, E2, E3 | IHM | Fichier refusé (3 cas), alerte, rien d'importé | idem |
| UC-APP-06-F08 | E4 (anomalie A-03) | IHM | **Comportement actuel** : une analyse Twin9 locale annule tout l'export | idem |
| UC-APP-06-F09 | Nominal (anomalie A-01) | IHM | **Comportement actuel** : paquet embarqué = 1er publié, pas celui des cartographies | idem |
| UC-APP-06-F10 | Nominal (anomalie A-02) | IHM | **Comportement actuel** : `modele` « inconnu », pas de tokens | idem |
| UC-APP-06-F11 | Nominal, étape 9 (anomalie A-04) | IHM | **Comportement actuel** : « Mes portfolios » non rafraîchi avant rechargement | idem |
| UC-APP-06-F12 | Nominal (étape 3) | API | Compte sans secret, liste + document du paquet, masse vide | `api/tests/UseCases/Functional/UcApp06ExporterImporterArchiveTest.php` |
| UC-APP-06-F13 | A1 | API | Sans session : `auth/me` et masse en 401, paquets lisibles | idem |
| UC-APP-06-F14 | RG1, RG7 | API | Aucune route d'export/import (404) ; paquet privé ni listé ni lisible | idem |

### Tests existants liés (non-régression)

- `web/src/lib/archive.test.js` — export valide, marqueurs neutres, compte et paquet, masse, aller-retour, refus.
- `web/src/views/espace/CartographiesPanel.test.jsx` — « Mes données » : import d'archive (store mémoire).
- `engine/src/validation.test.js` — validateurs compilés, dont `archive-export`.
- `api/tests/MasseLearnerAccessTest.php` — `GET /api/mes-documents-masse` (droits, isolation, départ de cohorte).
- `api/tests/PackagesTest.php` — lecture publique des paquets publiés.
- `web/e2e/parcours-apprenant.e2e.js` — étape « Export de l'archive » (validée par le moteur, navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcApp06 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-APP-06
cd engine && npx vitest run test/usecases --testNamePattern UC-APP-06
```

## Anomalies constatées

- **A-01 — Les « prompts utilisés » ne sont pas ceux des cartographies.** Le
  schéma exige que « chaque paquet utilisé par au moins une cartographie de
  l'archive [soit] embarqué intégralement » ; `defaultGetPromptPackages`
  embarque le **premier** élément de `GET api/prompt-packages` (ordre
  alphabétique du paquet, puis version la plus **ancienne**), quel que soit le
  paquet référencé par les cartographies (en pratique
  `aurora-v3-reconstruit@1.0.0`). L'archive peut donc ne pas contenir le
  paquet dont elle cite l'identifiant. Figé par U14 et F09.
- **A-02 — `runMeta` : contrats divergents entre l'assistant et l'archive.**
  L'assistant (UC-APP-02) enregistre `{mode, provider, model, jours,
  generatedAt, usage{inputTokens, outputTokens, mesures}}` ; l'archive
  n'accepte que `{modele, dateRun, tokens{entree, sortie, total},
  coutEstime}`. À l'export, le modèle devient « inconnu », la date du run est
  remplacée par la date de modification locale et les **compteurs de tokens
  mesurés sont perdus**. Friction de format à consigner dans
  `docs/contrats.md`. Figé par U06, U08 et F10.
- **A-03 — Une analyse Twin9 locale bloque tout l'export.** Les résultats
  Twin9 sont enregistrés localement avec le type `twin9` (UC-APP-10) ;
  l'export les projette en `type: 'jour'` avec leur document natif, non
  conforme à `cartographie-jour` : la validation échoue et **aucune** archive
  n'est téléchargée (« export annulé »). L'export RGPD « en un clic » devient
  impossible pour tout apprenant ayant une analyse Twin9. Figé par U10 et F08.
- **A-04 — « Mes portfolios » non rafraîchi après import.** L'import rafraîchit
  la liste des cartographies, pas le bloc « Mes portfolios » du tableau de
  bord, qui n'affiche les portfolios restaurés qu'au rechargement. Figé par
  F11.

## Limites

- L'import ne restaure que portfolios et cartographies : `account`,
  préférences, `referentiels`, `promptPackages` et `audit` de l'archive sont
  ignorés (ADR-006 annonce une « restauration complète d'un compte »).
- Le référentiel embarqué est la version **publiée au moment de l'export**,
  pas nécessairement celle citée par chaque cartographie.
- Les copies serveur des cartographies ne sont pas relues (voir UC-APP-03,
  A-01) : l'archive reflète le stockage local du navigateur.
- `web/src/lib/download-json.js` n'est **pas** sollicité : ce module sert le
  téléchargement « un clic » des résultats Essayer, Twin6 et Twin9 ; l'archive
  et « Télécharger le JSON » utilisent `downloadJson` de `archive.js`
  (homonyme, arguments dans l'ordre inverse : `(filename, data)` contre
  `(data, filename)`).
