# UC-EPI-04 — Éditer une version complète du référentiel

| Champ | Valeur |
|---|---|
| **Acteur principal** | Épistémiarque (ou administrateur : garde « épistémiarque ou admin ») |
| **Acteurs secondaires** | Membres épistémiarques (vote, UC-EPI-02 A5) ; espace Decidim (lien facultatif) ; visiteurs et applications (lectures publiques des versions et du diff, partagées avec UC-VIS-02) |
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
  édite, soumet et publie ; il ne vote pas.
- **A5 — Libellé omis** (étape 1) : le libellé de la source est conservé.

## Scénarios d'erreur

- **E1 — Accès** (toutes étapes) : sans session `401`, sans rôle `403` (routes
  d'atelier `GET /drafts…` comprises), sans jeton CSRF `403`.
- **E2 — Corps illisible** (étapes 1, 3, 4, 6) : JSON invalide → `400` ;
  document vide au `PUT` → `400`.
- **E3 — Champs requis** (étape 1) : `from` ou `semver` absent → `422` ;
  semver invalide → `422` (`/semver`).
- **E4 — Inconnu** (étapes 1 à 6) : source inconnue → `404` « Unknown source
  version » ; brouillon inconnu (ou version publiée demandée comme brouillon)
  → `404` « Unknown draft ».
- **E5 — Version existante** (étapes 1 et 3) : `409`.
- **E6 — Document invalide** (étape 3) : hors schéma (par exemple 60
  compétences) → `422` ; incohérent (numéro de pôle ou code dupliqué, pôle
  inexistant) → `422` avec pointeurs ; autre identifiant de référentiel →
  `422` (`/id`).
- **E7 — Version figée** (étapes 3, 4, 6 et A3) : écriture sur une version
  publiée → `409` (immuable) ; édition d'une proposition au vote → `409` ;
  double soumission → `409` ; retrait d'un brouillon → `409`.
- **E8 — Publication refusée** (étape 6) : jamais soumise → `409` ; majorité
  non atteinte → `409` (message du décompte) ; semver dépassée par une autre
  publication → `409` ; soumission d'une semver non croissante (étape 4) → `409`.
- **E9 — Lecture publique inconnue** (étape 7) : version ou diff entre versions
  non publiées → `404` « Unknown published version ».
- **E10 — Lien Decidim invalide** (étape 4) : `422` (`/decidimUrl`), le
  brouillon reste `draft`.

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
  hash (parité octet avec le moteur et Twin9).
- **RG4** — Gouvernance identique au grain compétence : gel pendant le vote,
  retrait, tours vierges, majorité des membres recalculée à la publication,
  lien Decidim facultatif.
- **RG5** — Semver strictement croissante vérifiée à la soumission puis à la
  publication (versions publiées verrouillées `FOR UPDATE`).
- **RG6** — Versions publiées immuables et servies à l'identique ; précédence
  semver pour « la dernière » (7.10.0 > 7.9.0).

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
| UC-EPI-04-F01 | Nominal | API | Fork 201, liste, rechargement, `PUT` (renommage, couleur, description), soumission, votes, publication, `GET /referentiel`, versions, 7.0.0 intacte, diff | `api/tests/UseCases/Functional/UcEpi04EditerVersionReferentielTest.php` |
| UC-EPI-04-F02 | A1, A5 | API | Fork depuis un brouillon, libellé de la source conservé | idem |
| UC-EPI-04-F03 | A2 | API | `version` modifiée → semver du brouillon | idem |
| UC-EPI-04-F04 | A3 | API | Retrait : brouillon, bulletins effacés, réédition | idem |
| UC-EPI-04-F05 | A4 | API | Admin non membre : fork, soumission, publication | idem |
| UC-EPI-04-F06 | E1 | API | 401 / 403 / CSRF 403 sur les 7 routes d'atelier ; lectures publiques ouvertes | idem |
| UC-EPI-04-F07 | E2, E3 | API | 400 (JSON invalide ×3, `PUT` vide), 422 champs manquants, 422 `/semver` | idem |
| UC-EPI-04-F08 | E4 | API | 404 source inconnue ; 404 « Unknown draft » sur 5 routes et pour une version publiée | idem |
| UC-EPI-04-F09 | E5 | API | 409 à la création et à la renumérotation | idem |
| UC-EPI-04-F10 | E6 | API | 422 schéma, intégrité (`/competences/1/code`), `/id` ; rien d'écrit | idem |
| UC-EPI-04-F11 | E7 | API | 409 sur la version publiée (PUT, submit, publish), retrait d'un brouillon, double soumission, gel | idem |
| UC-EPI-04-F12 | E8 | API | 409 sans vote, sans majorité, semver dépassée, soumission non croissante | idem |
| UC-EPI-04-F13 | E9 | API | 404 diff/version inconnue ou non publiée | idem |
| UC-EPI-04-F14 | E10 | API | 422 lien Decidim, brouillon inchangé | idem |
| UC-EPI-04-F15 | Limite L2 | API | Deux enregistrements concurrents : le dernier gagne, sans avertissement (comportement figé) | idem |
| UC-EPI-04-F16 | Anomalie AN1 | API | Publication au grain version ignorée des compétences atomiques, sans lockfile ; la release suivante l'annule (comportement figé) | idem |

### Tests existants liés (non-régression)

- `api/tests/ReferentielApiTest.php` — lectures publiques, cycle brouillon → publication → diff, semver croissante, vote obligatoire, immutabilité, 422, conflits (session simulée).
- `api/tests/ReferentielAuthzTest.php` — garde 401/403 de chaque route d'écriture, auteur pris dans la session.
- `api/tests/ReferentielGovernanceTest.php` — majorité, rejet, électorat, gel/retrait, tours de vote, lien Decidim.
- `api/tests/ReferentielUnitTest.php` — parité du hash avec l'extracteur Node, normalisation, descriptions hors hash, `Semver`, diff.
- `api/tests/ReferentielImportExportTest.php` — import idempotent, contrôle du `contentHash`, export statique.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcEpi04 --testdox
cd web && npx vitest run test/usecases/unit/uc-epi-04
```

## Anomalies constatées

- **AN1 — Deux sources de vérité divergentes.** Une version publiée au grain
  document (ce cas) n'est répercutée ni dans les compétences atomiques
  (`competence_versions`), ni dans le lockfile (`referentiel_snapshot_competences`,
  aucune ligne pour cette version : provenance non résoluble). La coupe de
  release suivante (UC-EPI-03), qui repart des compétences atomiques, **annule
  silencieusement** les changements structurels entérinés ici (le diff montre
  le renommage inversé). Figé par UC-EPI-04-F16. À trancher : désactiver les
  écritures du grain document, ou répercuter la publication sur les
  compétences atomiques.

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
