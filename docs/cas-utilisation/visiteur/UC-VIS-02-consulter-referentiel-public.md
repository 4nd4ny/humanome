# UC-VIS-02 — Consulter le référentiel public de compétences

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) |
| **Acteurs secondaires** | Épistémiarques (auteurs des versions publiées, UC-EPI-01 à 04) ; exploitation (export statique, UC-SYS-02) ; tout client de l'API publique |
| **Portée** | humanome.xyz — page `#/referentiel[/<code>]` ; API publique `GET /api/referentiel*`, `GET /api/competences*` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §4.1 (référentiel public en lecture, modifiable par les seuls épistémiarques, historisé), §3.5, §3.1 |
| **Statut** | Implémenté (P4 ; compétences atomiques migration 016) |

## Objectif

Permettre à quiconque de lire le référentiel RESPIRE sur lequel reposent
toutes les cartographies : ses 7 pôles et 61 compétences, leurs définitions,
avec un permalien par compétence ; et, par l'API, d'en lire l'historique
immuable (versions publiées, différences, versions de chaque compétence).
L'**édition** du référentiel est hors de ce cas (UC-EPI-01 à 04).

## Déclencheur

Le visiteur choisit « Référentiel » dans la famille « Découvrir » du menu, suit
un permalien `#/referentiel/<code>`, ou un client appelle l'API publique.

## Préconditions

- Au moins une version du référentiel est **publiée** (`referentiel_versions`,
  statut `published`) — import initial RESPIRE v7 puis releases entérinées.
- Pour la page : l'export statique `data/referentiel/index.json` + un fichier
  par version a été produit par `StaticExporter` au déploiement ; à défaut, le
  référentiel embarqué dans le bundle sert de repli.

## Garanties en cas de succès

- Le visiteur lit la **dernière version publiée** ; aucune version en
  brouillon ou soumise au vote n'est jamais visible.
- La consultation de la page ne sollicite **aucun PHP** (fichiers statiques) et
  n'ouvre aucune session ; les lectures d'API non plus.

## Garanties minimales (en cas d'échec)

- La page s'affiche toujours (repli embarqué, v7) ; un permalien inconnu est
  signalé sans empêcher la lecture.
- L'API répond par un statut explicite (404, 503) sans détail SQL.
- Aucune écriture n'est possible sans rôle épistémiarque (401/403).

## Scénario nominal

1. Le visiteur ouvre `#/referentiel` (menu « Découvrir » → « Référentiel »,
   indice « 7 pôles, 61 compétences »). La page affiche « Chargement du
   référentiel… ».
2. Le navigateur lit `data/referentiel/index.json` (tableau
   `{referentielId, semver, label, publishedAt, fichier}`, plus récent
   d'abord), retient l'entrée du référentiel `respire` (la première sinon),
   vérifie que `fichier` est un nom sûr (`^[A-Za-z0-9._-]+\.json$`) puis lit
   `data/referentiel/<fichier>` et en contrôle la forme (`poles[]`,
   `competences[]`). Le résultat est mis en cache pour la session.
3. La page affiche l'en-tête « Référentiel de compétences », le libellé et la
   version (« RESPIRE v7.1.0 — version 7.1.0 · 7 pôles, 61 compétences. Public
   en lecture, édité par les épistémiarques, versionné… »), l'encart vers
   l'espace participatif Decidim, puis un bloc par pôle (couleur du pôle) listant
   ses compétences : code (permalien), nom, définition éventuelle.
4. Le visiteur tape dans « Rechercher une compétence » : le filtre porte sur le
   code, le nom et la définition, sans tenir compte des accents ni de la casse ;
   le compteur annonce « n compétence(s) sur 61 pour « … » » et les pôles vides
   sont masqués. Effacer la recherche rétablit les 61.

## Scénarios alternatifs

- **A1 — Version antérieure** (API) : `GET /api/referentiel/versions/{semver}`
  sert le contenu d'une version **publiée** donnée.
- **A2 — Différences entre versions** (API) :
  `GET /api/referentiel/diff/{from}/{to}` sert la différence **structurelle**
  (pôles ajoutés/retirés/modifiés — nom, couleur —, compétences ajoutées,
  retirées, renommées, déplacées ; `identical`, `summary`).
- **A3 — Compétences atomiques** (API) : `GET /api/competences` liste la
  dernière version publiée de chaque compétence (métadonnées, triées par code) ;
  `GET /api/competences/{code}` sert sa fiche riche (`content` :
  identité, protocole…) ; `GET /api/competences/{code}/versions` son historique
  publié, plus récent d'abord.
- **A4 — Lecture par l'API** (étape 2) : `GET /api/referentiel` sert le
  document de la dernière version publiée — le même contenu que le fichier
  statique ; `GET /api/referentiel/versions` liste les versions publiées
  (métadonnées sans contenu).
- **A5 — Permalien** (étape 3) : `#/referentiel/<code>` surligne la compétence
  (`aria-current`) et la fait défiler au centre de l'écran.
- **A6 — Hors ligne / copie statique** (étape 2) : sur `file://`, sans réseau,
  index vide, fichier absent ou de forme inattendue, la page utilise en silence
  le référentiel RESPIRE v7 embarqué dans le bundle.

## Scénarios d'erreur

- **E1 — Compétence inconnue** (A3) : `GET /api/competences/9.99` → `404`
  « Compétence introuvable » ; un code mal formé (`1.1`, `abc`) ne correspond à
  aucune route → `404`.
- **E2 — Aucune version publiée** (A4) : `GET /api/referentiel` → `404`
  « No published referentiel version » ; `/versions` renvoie `[]` ;
  `/versions/{semver}` et `/diff/…` sur une version non publiée (brouillon
  compris) ou inconnue → `404` « Unknown published version ».
- **E3 — Base non configurée** : toutes les lectures publiques → `503`
  « Database not configured ».
- **E4 — Permalien inconnu** (A5) : « Compétence « X » introuvable dans cette
  version du référentiel. » ; l'arbre complet reste affiché.

## Règles de gestion

- **RG1** — Seules les versions au statut `published` sont publiques ; elles
  sont immuables (toute écriture → 409, UC-EPI).
- **RG2** — « Dernière version » = précédence **semver** (7.10.0 > 7.9.0), pas
  l'ordre lexical ni la date.
- **RG3** — Le contenu relu de MySQL est remis sous forme canonique
  (`ContentHash::normalize`) ; `contentHash` = SHA-256 du contenu normalisé.
- **RG4** — La page publique lit l'export **statique** (zéro PHP à la
  consultation) ; l'API sert les mêmes documents à l'application et aux tiers.
- **RG5** — La différence est **structurelle** : une définition ajoutée ou
  modifiée n'en fait pas partie.

## Données et RGPD

Aucune donnée personnelle : le référentiel est un contenu public. Les
métadonnées exposées (`releaseNote`, `publishedAt`, `decidimUrl`) ne
contiennent pas l'auteur du brouillon.

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash`, `referentielHash` | Routes `#/referentiel[/<code>]` |
| Front | `web/src/views/ReferentielView.jsx` | Arbre, recherche, permalien, encart Decidim |
| Front | `web/src/data/referentiel.js` — `loadPublishedReferentiel` | Export statique, gardes, repli embarqué, cache |
| API | `GET /api/referentiel`, `/referentiel/versions`, `/referentiel/versions/{semver}`, `/referentiel/diff/{from}/{to}` — `api/src/routes/referentiel.php` | Lectures publiques du référentiel |
| API | `GET /api/competences`, `/competences/{code}`, `/competences/{code}/versions` — `api/src/routes/competences.php` | Lectures publiques des compétences |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `latestPublished`, `publishedVersions`, `findPublished`, `metadata` | Versions publiées, précédence semver |
| Domaine | `api/src/Referentiel/ReferentielDiff.php` — `compute` | Différence structurelle |
| Domaine | `api/src/Referentiel/StaticExporter.php` — `export` | Fichiers statiques lus par la page |
| Domaine | `api/src/Referentiel/CompetenceRepository.php` — `latestPublishedByCode`, `latestPublished`, `publishedVersions`, `metadata` | Compétences atomiques publiées |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-VIS-02-U01 | `ReferentielRepository::publishedVersions`, `latestPublished` | Plus récente d'abord (7.10.0 > 7.9.0), brouillon exclu (RG1, RG2) | `api/tests/UseCases/Unit/UcVis02ConsulterReferentielTest.php` |
| UC-VIS-02-U02 | `ReferentielRepository::findPublished` | Brouillon ou inconnue → `null` | idem |
| UC-VIS-02-U03 | `mapRow`, `ReferentielRepository::metadata` | Contenu canonique, empreinte cohérente, métadonnées sans contenu (RG3) | idem |
| UC-VIS-02-U04 | `ReferentielDiff::compute` | Renommage détecté ; définition seule = identique (RG5) | idem |
| UC-VIS-02-U05 | `StaticExporter::export` | Un fichier par version publiée + index (plus récente d'abord), brouillon non exporté (RG4) | idem |
| UC-VIS-02-U06 | `CompetenceRepository::latestPublishedByCode`, `publishedVersions`, `latestPublished` | Dernière publiée par code, tri, brouillons exclus | idem |
| UC-VIS-02-U07 | `CompetenceRepository::latestPublished`, `metadata`, `CODE_RE` | Contenu riche relu, métadonnées sans contenu | idem |
| UC-VIS-02-U08 | `parseHash`, `referentielHash` | Routes et permaliens | `web/test/usecases/unit/uc-vis-02-consulter-referentiel-public.test.js` |
| UC-VIS-02-U09 | `loadPublishedReferentiel` | Index au format `StaticExporter`, préférence `respire`, cache | idem |
| UC-VIS-02-U10 | `loadPublishedReferentiel` | Index vide/illisible, forme inattendue, 404 → repli embarqué (A6) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-02-F01 | A4 | API | `GET /api/referentiel` → 7.1.0 (pas le brouillon), sans session | `api/tests/UseCases/Functional/UcVis02ConsulterReferentielTest.php` |
| UC-VIS-02-F02 | A4 | API | `/versions` : métadonnées seules, plus récente d'abord | idem |
| UC-VIS-02-F03 | A1, E2 | API | `/versions/7.0.0` ; brouillon et inconnue → 404 | idem |
| UC-VIS-02-F04 | A2, E2 | API | `/diff/7.0.0/7.1.0` ; brouillon/inconnue → 404 | idem |
| UC-VIS-02-F05 | A3 | API | `/competences` : dernière publiée par code, sans contenu | idem |
| UC-VIS-02-F06 | A3 | API | `/competences/{code}` (fiche riche) et `/versions` (historique) | idem |
| UC-VIS-02-F07 | E1 | API | Inconnue → 404 ; mal formée → 404 ; historique inconnu → `[]` | idem |
| UC-VIS-02-F08 | E2 | API | Aucune version publiée → 404 et liste vide | idem |
| UC-VIS-02-F09 | E3 | API | Base non configurée → 503 partout | idem |
| UC-VIS-02-F10 | A4, RG4 | API | Export statique = contenu de l'API ; nom de fichier sûr (contrat avec le front) | idem |
| UC-VIS-02-F11 | Garantie minimale | API | Le visiteur ne peut rien écrire (401) | idem |
| UC-VIS-02-F12 | Nominal (1-3) | IHM | Menu → page : 7.1.0, 7 pôles, 61 compétences, définition, Decidim ; seules les 2 lectures statiques | `web/test/usecases/functional/uc-vis-02-consulter-referentiel-public.test.jsx` |
| UC-VIS-02-F13 | Nominal (4) | IHM | Recherche sans accents sur code, nom, définition ; aucun résultat ; retour aux 61 | idem |
| UC-VIS-02-F14 | A5 | IHM | Permalien : surbrillance, `aria-current`, défilement | idem |
| UC-VIS-02-F15 | A6 | IHM | Hors ligne → référentiel embarqué v7 | idem |
| UC-VIS-02-F16 | E4 | IHM | Code inconnu → message, arbre intact | idem |

### Tests existants liés (non-régression)

- `api/tests/ReferentielApiTest.php`, `api/tests/CompetenceApiTest.php` — lectures publiques et cycle d'édition.
- `api/tests/ReferentielUnitTest.php` — empreinte de contenu, semver, diff.
- `api/tests/ReferentielImportExportTest.php` — import idempotent, export statique.
- `web/src/views/ReferentielView.test.jsx`, `web/src/data/referentiel.test.js`, `web/src/data/referentiel-v710.test.js`, `web/src/App.test.jsx` (route `#/referentiel`).

### Exécuter

```sh
docker compose run --rm -e DB_TEST_NAME=humanome_test_vis php vendor/bin/phpunit --filter UcVis02 --testdox
cd web && npx vitest run test/usecases/unit/uc-vis-02 test/usecases/functional/uc-vis-02
```

## Limites

- La page publique ne montre que la dernière version : l'historique et les
  différences ne sont consultables que par l'API (pas d'IHM publique).
- La différence entre versions ignore les définitions (RG5) : une release qui
  n'ajoute que des définitions est annoncée `identical: true`.
- `GET /api/competences/{code}/versions` répond `200 []` pour un code inconnu,
  là où `GET /api/competences/{code}` répond `404`.
