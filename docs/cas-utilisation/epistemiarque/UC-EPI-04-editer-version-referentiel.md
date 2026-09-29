# UC-EPI-04 — Éditer une version complète du référentiel

| Champ | Valeur |
|---|---|
| **Acteur principal** | Épistémiarque (ou administrateur : garde « épistémiarque ou admin ») |
| **Acteurs secondaires** | Membres épistémiarques (vote, UC-EPI-02 A5) ; espace Decidim (lien facultatif) ; visiteurs et applications qui lisent l'**API** (lectures publiques des versions et du diff) — la page publique `#/referentiel` (UC-VIS-02) lit, elle, l'export statique (L5) |
| **Portée** | API `/api/referentiel/drafts…`, `/api/referentiel/proposals…`, `/api/referentiel[/versions[/{semver}]]`, `/api/referentiel/diff/{from}/{to}` — **aucune IHM** |
| **Niveau** | Objectif utilisateur (sous-fonction technique en l'absence d'interface) |
| **Cahier des charges** | §3.5, §4.1 (référentiel historisé, versions immuables) ; migrations 003 (`referentiel_versions`) et 015 (gouvernance au grain document) |
| **Statut** | Implémenté côté API ; grain **supplanté** par les compétences atomiques (migration 016 : « reste appelable mais est supersédée »), sans vue |

## Objectif

Faire évoluer le référentiel **en un seul document** (7 pôles, 61 compétences,
libellé, couleurs, descriptions) : forker une version, l'éditer, la soumettre
au vote des membres et, à la majorité, la publier comme nouvelle version
immuable — tout en gardant l'historique complet consultable et comparable.

## Déclencheur

Un épistémiarque (ou un outil qui appelle l'API en son nom) veut une
évolution qui touche plusieurs compétences ou les pôles d'un coup (couleur ou
nom d'un pôle, renommages groupés).

## Préconditions

- Session ouverte, rôle `epistemiarque` ou `admin` ; jeton CSRF.
- Une version source existe pour le référentiel `respire` (7.0.0 importée au
  déploiement, UC-SYS-02).

## Garanties en cas de succès

- Une nouvelle version `draft`, puis `review`, puis `published`, conforme au
  schéma et aux contrôles d'intégrité, avec un `contentHash` recalculé.
- La version publiée devient la dernière servie (`GET /api/referentiel`) ; les
  précédentes restent servies à l'identique (`/versions/{semver}`) et
  comparables (`/diff/{from}/{to}`).

## Garanties minimales (en cas d'échec)

- Aucun document invalide n'est enregistré ; aucune version publiée n'est
  modifiée ; la proposition reste en l'état en cas de refus de publication.

## Scénario nominal

1. L'épistémiarque crée un brouillon : `POST /api/referentiel/drafts`
   `{from: "7.0.0", semver: "7.1.0", label?}`. Le serveur vérifie la semver,
   retrouve la version source, refuse une version déjà existante, remplace
   `version` (et `label` s'il est fourni) dans une copie du document, la valide
   et la normalise, enregistre l'auteur (session) → `201` (métadonnées +
   `content`).
2. Il liste les versions éditables (`GET /api/referentiel/drafts` : brouillons
   et propositions, les plus récents d'abord, décompte pour celles au vote) et
   recharge le brouillon (`GET /api/referentiel/drafts/{id}`).
3. Il envoie le document **complet** modifié : `PUT /api/referentiel/drafts/{id}`.
   Le serveur le normalise (ordre canonique, `contentHash` recalculé, clés
   inconnues écartées), le valide (schéma puis intégrité), impose le même
   identifiant de référentiel, accepte un changement de `version` s'il ne
   percute aucune version existante → `200`.
4. Il soumet : `POST /api/referentiel/drafts/{id}/submit` `{decidimUrl?}` —
   revalidation, semver strictement supérieure aux versions publiées, lien
   Decidim normalisé, bulletins d'un tour précédent effacés, statut `review`
   → `200` avec le décompte.
5. Les membres consultent `GET /api/referentiel/proposals/{id}` (document,
   version de base, **diff** contre la dernière publiée, décompte, bulletins)
   et votent (`POST /api/referentiel/proposals/{id}/votes`, UC-EPI-02 A5).
6. À la majorité, il publie : `POST /api/referentiel/drafts/{id}/publish`
   `{releaseNote?}`. Le serveur verrouille la ligne, exige le statut `review`
   et la majorité recalculée, revalide le document, verrouille les versions
   publiées et exige une semver strictement supérieure, puis publie (contenu
   normalisé, `contentHash`, note, date) → `200` (métadonnées).
7. La version est servie publiquement : `GET /api/referentiel` (dernière),
   `GET /api/referentiel/versions` (plus récente d'abord),
   `GET /api/referentiel/versions/{semver}`, et
   `GET /api/referentiel/diff/{from}/{to}` (pôles ajoutés / retirés / modifiés ;
   compétences ajoutées / retirées / renommées / déplacées ; résumé ;
   `identical`).

## Scénarios alternatifs

- **A1 — Fork depuis un brouillon** (étape 1) : `from` peut désigner une
  version non publiée ; son contenu est repris.
- **A2 — Renumérotation** (étape 3) : changer `version` dans le document
  renomme la semver du brouillon.
- **A3 — Retrait** (après l'étape 4) : `POST /api/referentiel/drafts/{id}/withdraw`
  → `draft`, bulletins effacés, lien Decidim retiré ; l'édition est rouverte.
- **A4 — Administrateur** (étapes 1, 3, 4, 6) : un `admin` non membre forke,
  édite, soumet et publie ; il ne vote pas (`403` au grain version aussi) et
  ne compte pas dans l'électorat.
- **A5 — Libellé omis** (étape 1) : le libellé de la source est conservé.

## Scénarios d'erreur

- **E1 — Accès** (toutes étapes) : sans session `401`, sans rôle `403` (routes
  d'atelier `GET /drafts…` comprises), sans jeton CSRF `403`.
- **E2 — Corps illisible** (étapes 1, 3, 4, 6) : JSON invalide → `400` ;
  document vide au `PUT` → `400`.
- **E3 — Champs requis** (étape 1) : `from` ou `semver` absent → `422` ;
  semver invalide → `422` (`/semver`).
- **E4 — Inconnu** (étapes 1 à 6) : source inconnue → `404` « Unknown source
  version » ; aux étapes 1 à 4 et 6, brouillon inconnu (ou version publiée
  demandée comme brouillon) → `404` « Unknown draft » ; à l'étape 5,
  proposition inconnue ou pas au vote → `404` « Unknown proposal »
  (UC-EPI-02 E4).
- **E5 — Version existante** (étapes 1 et 3) : `409`.
- **E6 — Document invalide** (étape 3) : hors schéma (par exemple 60
  compétences) → `422` ; incohérent (numéro de pôle ou code dupliqué, pôle
  inexistant) → `422` avec pointeurs ; autre identifiant de référentiel →
  `422` (`/id`).
- **E7 — Version figée** (étapes 3, 4, 6 et A3) : écriture sur une version
  publiée → `409` (immuable) ; édition d'une proposition au vote → `409` ;
  double soumission → `409` ; retrait d'un brouillon → `409`.
- **E8 — Publication refusée** (étape 6) : jamais soumise → `409` ; majorité
  non atteinte → `409` (message du décompte) ; proposition rejetée (majorité
  « contre ») ou aucun membre épistémiarque → `409` avec le message
  correspondant (`MajorityMessage`, UC-EPI-03-U04) ; semver dépassée par une
  autre publication → `409` ; soumission d'une semver non croissante
  (étape 4) → `409`.
- **E9 — Lecture publique inconnue** (étape 7) : version ou diff entre versions
  non publiées → `404` « Unknown published version ».
- **E10 — Lien Decidim invalide** (étape 4) : URL qui n'est pas http(s)
  valide → `422` (`/decidimUrl` « URL invalide »), ou lien de plus de 500
  caractères → `422` (`/decidimUrl` « URL trop longue ») ; le brouillon reste
  `draft`.
- **E11 — Libellé ou semver trop longs** (étapes 1 et 3) : libellé de plus de
  190 caractères ou semver valide de plus de 32 → `500` « Internal error »
  (anomalie AN2).

## Règles de gestion

- **RG1** — Un brouillon est un fork d'une version existante (publiée ou non)
  du référentiel `respire` ; semver 2.0.0 valide et unique.
- **RG2** — Chaque écriture porte le document **complet**, normalisé puis
  validé : schéma `referentiel` (exactement 7 pôles et 61 compétences) et
  intégrité (numéros de pôle uniques, codes uniques, rattachement à un pôle
  existant) ; `id` invariant ; le `contentHash` fourni par le client est
  ignoré et recalculé ; les clés de premier niveau inconnues sont écartées.
- **RG3** — `contentHash` structurel : `{pôles (num, nom, couleur),
  compétences (code, nom, pôle)}` ; les descriptions sont conservées mais hors
  hash. Le hash est identique octet par octet à celui de l'extracteur Node
  `scripts/extract-referentiel.mjs`, si bien qu'aucune empreinte épinglée
  (oracles moteur, vecteurs Twin9) ne change ; le moteur ne calcule pas de
  `contentHash`.
- **RG4** — Gouvernance identique au grain compétence : gel pendant le vote,
  retrait, tours vierges, majorité des membres recalculée à la publication,
  lien Decidim facultatif.
- **RG5** — Semver strictement croissante vérifiée à la soumission puis à la
  publication (versions publiées verrouillées `FOR UPDATE`).
- **RG6** — Versions publiées immuables et servies à l'identique ; précédence
  semver pour « la dernière » (7.10.0 > 7.9.0).
- **RG7** — Pas de propriété du brouillon : toute personne portant le rôle
  `epistemiarque` ou `admin` peut éditer, soumettre, retirer et publier
  n'importe quel brouillon (aucune route ne compare la session à
  `created_by` ou `submitted_by`) ; l'auteur (`created_by`) et le
  soumissionnaire (`submitted_by`) sont seulement tracés. Les étapes 3, 4 et
  6 peuvent donc être jouées par un autre membre que l'auteur (F01 : Bao
  publie le brouillon d'Alix ; F15 : Bao écrase le brouillon d'Alix).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Document du référentiel | Public par nature ; aucune donnée personnelle |
| Auteur, soumissionnaire | `created_by`, `submitted_by`, remis à `NULL` si le compte est purgé |
| Bulletins | Voir UC-EPI-02 |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/epistemiarque/api.js` — `createEpistemiarqueApi`, `suggestNextVersion`, `DECIDIM_URL` | Client fin du grain version (branché sur aucune vue) |
| API | `api/src/routes/referentiel.php` — `GET/POST /referentiel/drafts`, `GET/PUT /referentiel/drafts/{id}`, `…/submit`, `…/withdraw`, `…/publish`, `GET /referentiel[/versions[/{semver}]]`, `GET /referentiel/diff/{from}/{to}` | Orchestration, 400/404/409/422 |
| API | `api/src/Referentiel/RoleGuard.php` | 401/403 |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `createDraft`, `updateDraft`, `validateDocument`, `publish`, `findById`, `findPublished`, `editableVersions`, `publishedVersions`, `latestPublished`, `metadata` | Cycle de vie, invariants |
| Domaine | `api/src/Referentiel/ContentHash.php` — `normalize`, `compute` | Forme canonique, hash structurel |
| Domaine | `api/src/Referentiel/ReferentielGovernance.php` — `submit`, `withdraw`, `tally` ; `MajorityMessage.php` ; `DecidimLink.php` ; `Semver.php` | Vote au grain version |
| Domaine | `api/src/Referentiel/ReferentielDiff.php` | Diff structurel |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-EPI-04-U01 | `ReferentielRepository::createDraft` | Fork (version/libellé remplacés, hash, auteur), fork d'un brouillon, libellé conservé (RG1, A1, A5) | `api/tests/UseCases/Unit/UcEpi04EditerVersionReferentielTest.php` |
| UC-EPI-04-U02 | `createDraft` | 422 `/semver`, source inconnue → null, doublon → 409 | idem |
| UC-EPI-04-U03 | `updateDraft` | Hash recalculé, renumérotation, collision 409, `/id` 422, inconnu null, publiée 409, au vote 409 (RG2) | idem |
| UC-EPI-04-U04 | `validateDocument` | Intégrité (pôle dupliqué, code dupliqué, pôle inexistant) avec pointeurs ; 60 compétences → schéma ; document non hachable | idem |
| UC-EPI-04-U05 | `ContentHash::normalize`, `compute` | Ordre canonique, hash recalculé, description hors hash, clé inconnue écartée (RG2, RG3) | idem |
| UC-EPI-04-U06 | `ReferentielGovernance::submit`, `withdraw` | Semver non croissante 409, soumission (auteur, Decidim), retrait (bulletins effacés), Decidim invalide 422, retrait d'un brouillon 409 | idem |
| UC-EPI-04-U07 | `ReferentielRepository::publish` | Brouillon 409, sans majorité 409 (message), publication, semver dépassée 409, inconnue null, déjà publiée 409 (RG5) | idem |
| UC-EPI-04-U08 | `ReferentielDiff::compute` | Pôle modifié, renommé + déplacé, ajout/retrait, description ignorée, documents incomplets tolérés | idem |
| UC-EPI-04-U09 | Lectures du dépôt, `metadata` | Précédence semver (7.10.0), version par semver, éditables par id décroissant, métadonnées sans contenu (RG6) | idem |
| UC-EPI-04-U10 | `createEpistemiarqueApi` | Lectures : chemins | `web/test/usecases/unit/uc-epi-04-editer-version-referentiel.test.js` |
| UC-EPI-04-U11 | `createEpistemiarqueApi` | Cycle : fork, `PUT` sans `If-Match`, soumission avec/sans lien, retrait, publication | idem |
| UC-EPI-04-U12 | `suggestNextVersion`, `DECIDIM_URL` | Mineure suivante (repli 7.1.0), espace Decidim | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-EPI-04-F01 | Nominal | API | Fork 201, liste, rechargement, `PUT` (renommage, couleur, description), soumission, liste avec décompte, consultation de la proposition (`baseVersion`, diff, lien Decidim), votes, publication par un autre membre (RG7), `GET /referentiel`, versions, 7.0.0 servie à l'identique (document et empreinte), diff | `api/tests/UseCases/Functional/UcEpi04EditerVersionReferentielTest.php` |
| UC-EPI-04-F02 | A1, A5 | API | Fork depuis un brouillon, libellé de la source conservé | idem |
| UC-EPI-04-F03 | A2 | API | `version` modifiée → semver du brouillon | idem |
| UC-EPI-04-F04 | A3 | API | Retrait : brouillon, bulletins effacés, lien Decidim (présent avant) retiré, réédition | idem |
| UC-EPI-04-F05 | A4 | API | Admin non membre : fork, édition, soumission (électorat 2, sans l'admin), vote refusé 403 sans bulletin, publication | idem |
| UC-EPI-04-F06 | E1 | API | 401 / 403 sur les 7 routes d'atelier, CSRF 403 sur les 5 routes d'écriture ; lectures publiques ouvertes | idem |
| UC-EPI-04-F07 | E2, E3 | API | 400 (JSON invalide ×3, `PUT` vide), 422 champs manquants, 422 `/semver` | idem |
| UC-EPI-04-F08 | E4 | API | 404 source inconnue ; 404 « Unknown draft » sur 5 routes et pour une version publiée | idem |
| UC-EPI-04-F09 | E5 | API | 409 à la création et à la renumérotation | idem |
| UC-EPI-04-F10 | E6 | API | 422 schéma, intégrité (`/competences/1/code`), `/id` ; rien d'écrit | idem |
| UC-EPI-04-F11 | E7 | API | 409 sur la version publiée (PUT, submit, publish), retrait d'un brouillon, double soumission, gel | idem |
| UC-EPI-04-F12 | E8 | API | 409 sans vote, sans majorité, semver dépassée, soumission non croissante | idem |
| UC-EPI-04-F13 | E9 | API | 404 diff/version inconnue ou non publiée | idem |
| UC-EPI-04-F14 | E10 | API | 422 lien Decidim, brouillon inchangé | idem |
| UC-EPI-04-F15 | Limite L2 | API | Deux enregistrements concurrents (Bao écrase le brouillon d'Alix, RG7) : le dernier gagne, sans avertissement (comportement figé) | idem |
| UC-EPI-04-F16 | Anomalie AN1 | API | Publication au grain version ignorée des compétences atomiques, sans lockfile ; la release suivante l'annule (comportement figé) | idem |
| UC-EPI-04-F17 | E11, AN2 | API | Libellé de 191 caractères ou semver de 36 caractères → 500 « Internal error », aucun brouillon ; 190 caractères acceptés (comportement figé) | idem |

### Tests existants liés (non-régression)

- `api/tests/ReferentielApiTest.php` — lectures publiques, cycle brouillon → publication → diff, semver croissante, vote obligatoire, immutabilité, 422, conflits (session simulée).
- `api/tests/ReferentielAuthzTest.php` — garde 401/403 de chaque route d'écriture, auteur pris dans la session.
- `api/tests/ReferentielGovernanceTest.php` — majorité, rejet, électorat, gel/retrait, tours de vote, lien Decidim.
- `api/tests/ReferentielUnitTest.php` — parité du hash avec l'extracteur Node, normalisation, descriptions hors hash, `Semver`, diff.
- `api/tests/ReferentielImportExportTest.php` — import idempotent, contrôle du `contentHash`, export statique.
- `api/tests/RgpdAuditTest.php` — règles FK de purge (`referentiel_versions.created_by` / `submitted_by` → `SET NULL`, `referentiel_votes` → `CASCADE`).
- Tests UC du même lot qui ciblent du code sollicité ici : UC-EPI-01-U09 (`DecidimLink`), UC-EPI-01-U11 et UC-EPI-02-U15 (`RoleGuard`), UC-EPI-02-U07 (`ReferentielGovernance` : vote, décompte, retrait), UC-EPI-02-F06 (consultation et vote au grain version, étape 5), UC-EPI-03-U04 (`MajorityMessage`, trois messages).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcEpi04 --testdox
cd web && npx vitest run test/usecases/unit/uc-epi-04
```

## Anomalies constatées

- **AN1 — Deux sources de vérité divergentes.** Une version publiée au grain
  document (ce cas) n'est répercutée ni dans les compétences atomiques
  (`competence_versions`), ni dans le lockfile (`referentiel_snapshot_competences`,
  aucune ligne pour cette version : la version de référentiel reste
  résoluble — une cartographie épingle `referentiel_version_id` et le
  document complet reste servi — mais pas le lien vers les versions de
  compétence atomiques qui la composeraient ; aucun code ne lit encore ce
  lockfile). La coupe de
  release suivante (UC-EPI-03), qui repart des compétences atomiques, **annule
  silencieusement** les changements structurels entérinés ici (le diff montre
  le renommage inversé). Figé par UC-EPI-04-F16. À trancher : désactiver les
  écritures du grain document, ou répercuter la publication sur les
  compétences atomiques.

- **AN2 — Libellé ou semver trop longs : erreur serveur.** Les colonnes
  `label VARCHAR(190)` et `semver VARCHAR(32)` (migration 003) ne sont bornées
  ni par le schéma `referentiel` (`label` sans `maxLength`) ni par
  `Semver::isValid` (une pré-version longue reste valide). En MySQL 8 strict
  (défaut de `docker-compose`), l'`INSERT` lève une `PDOException` : `500`
  « Internal error » au lieu d'un `422`, aucun brouillon. En mode non strict,
  la colonne serait tronquée et divergerait de `content.label` /
  `content.version`. Correctif attendu : `maxLength` 190 sur `label` et
  longueur maximale de semver (schéma ou `Semver`). Figé par UC-EPI-04-F17.

## Limites

- **L1** — Pas d'IHM : `web/src/views/epistemiarque/api.js` n'est importé par
  aucune vue ; l'atelier `#/epistemiarque` ne travaille qu'au grain compétence
  (UC-EPI-01 à 03).
- **L2** — Pas de concurrence optimiste à ce grain : deux enregistrements
  concurrents du même brouillon se succèdent, le dernier écrase le premier
  sans avertissement (contrairement au `If-Match` du grain compétence). Figé
  par UC-EPI-04-F15.
- **L3** — Le schéma fige 7 pôles et 61 compétences : ajout, retrait, fusion
  ou scission de compétences sont impossibles à ce grain aussi (UC-EPI-03 L2).
- **L4** — Aucune route ne supprime un brouillon abandonné.
- **L5** — La publication ne régénère pas l'export statique lu par la page
  publique `#/referentiel` (UC-VIS-02 RG4) : `StaticExporter::export` n'est
  appelé que par `scripts/export-referentiel-static.php`. La version publiée
  ici n'est visible sur la page qu'après ré-export et redéploiement
  (UC-EPI-03 étape 8 et L1, UC-SYS-02) ; elle est en revanche servie aussitôt
  par l'API.
