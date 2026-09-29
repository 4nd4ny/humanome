# UC-VIS-02 — Consulter le référentiel public de compétences

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) |
| **Acteurs secondaires** | Épistémiarques (auteurs des versions publiées, UC-EPI-01 à 04) ; exploitation (export statique manuel, UC-EPI-03 étape 8 et limite L1) ; tout client de l'API publique |
| **Portée** | humanome.xyz — page `#/referentiel[/<code>]` ; API publique `GET /api/referentiel`, `/referentiel/versions`, `/referentiel/versions/{semver}`, `/referentiel/diff/{from}/{to}` ; `GET /api/competences`, `/competences/{code}`, `/competences/{code}/versions` (les `GET …/drafts` et `…/proposals` sont réservés aux épistémiarques : 401/403) |
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
  par version a été produit **à la main** par
  `php scripts/export-referentiel-static.php` (`StaticExporter`) contre la base
  **locale** à laquelle il est connecté, avant `npm run build` puis le
  déploiement statique ; `scripts/deploy/deploy.mjs` n'exporte rien (il se
  contente d'importer 7.0.0 et 7.1.0 en base). À défaut d'export, le
  référentiel embarqué dans le bundle sert de repli.

## Garanties en cas de succès

- Le visiteur lit la dernière version présente dans l'**export statique
  déployé** (jamais un brouillon ni une version soumise au vote) — qui peut
  retarder sur la base de production (limite L1).
- La **lecture** du référentiel par la page ne sollicite **aucun PHP**
  (fichiers statiques) ; le shell de l'application sonde seulement la session
  par `GET /api/auth/me`, qui répond `401` sans cookie et n'ouvre aucune
  session. Les lectures de l'API publique n'ouvrent pas de session non plus.

## Garanties minimales (en cas d'échec)

- La page s'affiche toujours (repli embarqué, v7) ; un permalien inconnu **et
  bien encodé** est signalé sans empêcher la lecture (un permalien au
  pourcentage mal formé fait planter l'application, anomalie AN1).
- L'API répond par un statut explicite (404, 503 ; `500` « Internal error »,
  sans détail SQL, sur erreur PDO).
- Aucune écriture n'est possible sans rôle épistémiarque (401/403).

## Scénario nominal

1. Le visiteur ouvre `#/referentiel` (menu « Découvrir » → « Référentiel » ;
   sur l'accueil, la tuile du plan du site porte l'indice « 7 pôles, 61
   compétences »). La page affiche « Chargement du référentiel… ».
2. Le navigateur lit `data/referentiel/index.json` (tableau
   `{referentielId, semver, label, publishedAt, fichier}`, plus récent
   d'abord), retient l'entrée du référentiel `respire` (la première sinon),
   vérifie que `fichier` est un nom sûr (`^[A-Za-z0-9._-]+\.json$`) puis lit
   `data/referentiel/<fichier>` et en contrôle la forme (`poles[]`,
   `competences[]`). Le résultat — y compris le **repli** — est mis en cache
   pour toute la durée de la page.
3. La page affiche l'en-tête « Référentiel de compétences », le libellé et la
   version (« <libellé> — version 7.1.0 · 7 pôles, 61 compétences. Public en
   lecture, édité par les épistémiarques, versionné… » ; libellé de
   production : « RESPIRE v7.1 », les tests utilisent « RESPIRE v7.1.0 »),
   l'encart vers
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
- **A6 — Hors ligne / copie statique** (étape 2) : sur `file://` (aucune
  lecture tentée), sans réseau, index vide, illisible ou au JSON invalide, nom
  de fichier dangereux (`../x.json`), fichier absent ou de forme inattendue,
  la page utilise en silence le référentiel RESPIRE v7 embarqué dans le
  bundle.

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
- **E4 — Permalien inconnu** (A5) : pour un code bien encodé, « Compétence
  « X » introuvable dans cette version du référentiel. » ; l'arbre complet
  reste affiché. Un pourcentage mal formé (`#/referentiel/%`, `%E9`…) n'est
  pas couvert (anomalie AN1).

## Règles de gestion

- **RG1** — Seules les versions au statut `published` sont publiques ; elles
  sont immuables (toute écriture → 409, UC-EPI).
- **RG2** — « Dernière version » = précédence **semver** (`Semver::compare` :
  7.10.0 > 7.9.0), ni l'ordre lexical, ni l'ordre d'insertion, ni la date.
- **RG3** — Le contenu relu de MySQL est remis sous forme canonique
  (`ContentHash::normalize` : ordre des clés fixe, pôles triés par `num`,
  compétences par `code`, clés annexes conservées **après** les clés cœur).
  `contentHash` = SHA-256 du corps **structurel** canonique
  `{poles: [{num, nom, couleur}], competences: [{code, nom, pole}]}` :
  définitions, libellé et version en sont exclus, si bien que deux versions
  qui ne diffèrent que par leurs définitions (7.0.0 et 7.1.0 en production)
  partagent la même empreinte.
- **RG4** — La page publique lit l'export **statique** (zéro PHP pour lire le
  référentiel) ; l'API sert aux tiers et à l'application les mêmes documents
  **qu'au moment de l'export** (limite L1).
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
| Front | `web/src/data/load.js` — `getReferentiel` | Référentiel RESPIRE v7 embarqué (repli) |
| Front | `web/src/nav.js` — `FAMILIES` ; `web/src/components/FamilyTiles.jsx` | Entrée « Référentiel » de la famille « Découvrir », indice de la tuile |
| API | `GET /api/referentiel`, `/referentiel/versions`, `/referentiel/versions/{semver}`, `/referentiel/diff/{from}/{to}` — `api/src/routes/referentiel.php` | Lectures publiques du référentiel |
| API | `GET /api/competences`, `/competences/{code}`, `/competences/{code}/versions` — `api/src/routes/competences.php` (motif de route `{code:[0-9]\.[0-9]{2}}`) | Lectures publiques des compétences ; garde des codes |
| API | `api/src/Referentiel/RoleGuard.php` — `any` | Écritures et ateliers réservés (401/403, garantie minimale) |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `latestPublished`, `publishedVersions`, `findPublished`, `metadata` | Versions publiées, précédence semver |
| Domaine | `api/src/Referentiel/ContentHash.php` — `normalize`, `compute` | Forme canonique et empreinte structurelle (RG3) |
| Domaine | `api/src/Referentiel/Semver.php` — `compare` | Précédence semver (RG2) |
| Domaine | `api/src/Referentiel/ReferentielDiff.php` — `compute` | Différence structurelle |
| Domaine | `api/src/Referentiel/StaticExporter.php` — `export` ; `scripts/export-referentiel-static.php` (CLI manuel) | Fichiers statiques lus par la page |
| Domaine | `api/src/Referentiel/CompetenceRepository.php` — `latestPublishedByCode`, `latestPublished`, `publishedVersions`, `metadata` | Compétences atomiques publiées |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-VIS-02-U01 | `ReferentielRepository::publishedVersions`, `latestPublished`, `Semver::compare` | Plus récente d'abord (7.10.0 > 7.9.0, insérées en ordre inverse et à dates inversées), brouillon exclu (RG1, RG2) | `api/tests/UseCases/Unit/UcVis02ConsulterReferentielTest.php` |
| UC-VIS-02-U02 | `ReferentielRepository::findPublished` | Brouillon ou inconnue → `null` | idem |
| UC-VIS-02-U03 | `mapRow` → `ContentHash::normalize`, `ReferentielRepository::metadata` | Ordre canonique des clés (document, pôles, compétences, clé annexe `description` après les clés cœur), empreinte cohérente, métadonnées sans contenu (RG3) | idem |
| UC-VIS-02-U04 | `ReferentielDiff::compute`, `ContentHash::normalize` | Renommage détecté ; définition seule = identique (RG5) et même `contentHash` (RG3) | idem |
| UC-VIS-02-U05 | `StaticExporter::export` | Un fichier par version publiée + index (plus récente d'abord), brouillon non exporté (RG4) | idem |
| UC-VIS-02-U06 | `CompetenceRepository::latestPublishedByCode`, `publishedVersions`, `latestPublished` | Dernière publiée par code, tri, brouillons exclus | idem |
| UC-VIS-02-U07 | `CompetenceRepository::latestPublished`, `metadata` | Contenu riche relu, métadonnées sans contenu (la garde des codes est le motif de route, F07) | idem |
| UC-VIS-02-U08 | `parseHash`, `referentielHash` | Routes et permaliens | `web/test/usecases/unit/uc-vis-02-consulter-referentiel-public.test.js` |
| UC-VIS-02-U09 | `loadPublishedReferentiel` | Index au format `StaticExporter`, préférence `respire`, première entrée sinon, cache | idem |
| UC-VIS-02-U10 | `loadPublishedReferentiel` | Index vide, en erreur HTTP ou au JSON invalide, forme inattendue, 404, `file://` (aucune lecture), nom de fichier dangereux → repli embarqué (A6) | idem |
| UC-VIS-02-U11 | `parseHash` | **Comportement actuel figé** — anomalie AN1 (permalien mal encodé → `URIError`) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-02-F01 | A4 | API | `GET /api/referentiel` → 7.1.0 (pas le brouillon) ; aucune session PHP active, aucun `Set-Cookie` | `api/tests/UseCases/Functional/UcVis02ConsulterReferentielTest.php` |
| UC-VIS-02-F02 | A4 | API | `/versions` : métadonnées seules, plus récente d'abord, aucune session | idem |
| UC-VIS-02-F03 | A1, E2 | API | `/versions/7.0.0` ; version soumise au vote et inconnue → 404 « Unknown published version » ; la version au vote n'est pas servie par `/referentiel` | idem |
| UC-VIS-02-F04 | A2, E2 | API | `/diff/7.0.0/7.1.0` ; version au vote / inconnue → 404 « Unknown published version » | idem |
| UC-VIS-02-F05 | A3 | API | `/competences` : dernière publiée par code, sans contenu, aucune session | idem |
| UC-VIS-02-F06 | A3 | API | `/competences/{code}` (fiche riche) et `/versions` (historique) | idem |
| UC-VIS-02-F07 | E1 | API | Inconnue → 404 ; mal formée → 404 ; historique inconnu → `[]` | idem |
| UC-VIS-02-F08 | E2 | API | Aucune version publiée → 404 et liste vide | idem |
| UC-VIS-02-F09 | E3 | API | Base non configurée → 503 partout | idem |
| UC-VIS-02-F10 | A4, RG4 | API | Script CLI `export-referentiel-static.php` (processus séparé, base de test) : export = contenu de l'API au moment de l'export ; nom de fichier sûr (contrat avec le front) | idem |
| UC-VIS-02-F11 | Garantie minimale | API | Le visiteur ne peut rien écrire (401) | idem |
| UC-VIS-02-F12 | Nominal (1-3) | IHM | Shell réel (sans session injectée) : indice de la tuile, clic sur « Référentiel » du menu, « Chargement du référentiel… », 7.1.0, 7 pôles (couleur), 61 compétences, définition, Decidim ; lecture = les 2 fichiers statiques, seule requête d'API = `api/auth/me` | `web/test/usecases/functional/uc-vis-02-consulter-referentiel-public.test.jsx` |
| UC-VIS-02-F13 | Nominal (4) | IHM | Recherche sans accents sur code, nom, définition ; aucun résultat ; retour aux 61 compétences et 7 pôles rendus (recherche blanche puis vide) | idem |
| UC-VIS-02-F14 | A5 | IHM | Permalien : surbrillance, `aria-current`, défilement de la ligne 7.03 | idem |
| UC-VIS-02-F15 | A6 | IHM | Hors ligne → référentiel embarqué v7 | idem |
| UC-VIS-02-F16 | E4 | IHM | Code inconnu → message, arbre intact | idem |
| UC-VIS-02-F17 | A6 | IHM | Index désignant `../x.json` → fichier jamais lu, référentiel embarqué v7, 61 compétences | idem |

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

## Anomalies constatées

- **AN1 — Permalien mal encodé : l'application plante.** `parseHash`
  (`web/src/router.js`) applique `decodeURIComponent` au segment du permalien
  sans `try/catch` : `#/referentiel/%`, `#/referentiel/100%` ou
  `#/referentiel/%E9` lèvent une `URIError`. `App` calculant sa route
  initiale par `useState(currentRoute)`, sans frontière d'erreur, la page
  reste **blanche** au lieu du message E4. Les motifs `#/compte/…`,
  `#/espace/…`, `#/guides/…`, `#/admin/…`… ont le même défaut. Comportement
  actuel figé par UC-VIS-02-U11.

## Limites

- La page publique ne montre que la dernière version : l'historique et les
  différences ne sont consultables que par l'API (pas d'IHM publique).
- La différence entre versions ignore les définitions (RG5) : une release qui
  n'ajoute que des définitions est annoncée `identical: true`.
- `GET /api/competences/{code}/versions` répond `200 []` pour un code inconnu,
  là où `GET /api/competences/{code}` répond `404`.
- **L1** — Une release coupée dans l'atelier de **production** est servie
  aussitôt par `GET /api/referentiel`, mais reste absente de la page publique
  tant qu'il n'y a pas eu ré-export (`scripts/export-referentiel-static.php`,
  contre la base locale) puis redéploiement (voir UC-EPI-03, L1) : aucun
  déploiement ni build n'exécute l'export.
- Un repli pris sur une panne passagère reste en cache jusqu'au rechargement
  de la page (la page reste en v7.0.0 embarquée).
