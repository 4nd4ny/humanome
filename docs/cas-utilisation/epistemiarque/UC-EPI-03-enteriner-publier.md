# UC-EPI-03 — Entériner et publier (compétence, release du référentiel)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Épistémiarque (ou administrateur : garde « épistémiarque ou admin ») |
| **Acteurs secondaires** | Membres épistémiarques (leur vote a fait la majorité, UC-EPI-02) ; exploitation (export statique, régénération des fiches au déploiement, UC-SYS-02) ; promptologues et moteurs Twin6/Twin9 (consomment les fiches de scan) ; visiteurs (page publique du référentiel, UC-VIS-02) ; cartographies (épinglent une release) |
| **Portée** | humanome.xyz — page de vote `#/epistemiarque/proposition/<id>` (section « Décision ») et carte « Publier une version du référentiel » de l'atelier ; API `POST /api/competences/drafts/{id}/publish`, `POST /api/competences/release` ; script `scripts/export-referentiel-static.php` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.5, §4.1 (historisé, versionné : les runs référencent la version utilisée) ; migrations 016 (lockfile `referentiel_snapshot_competences`) et 017 (en-têtes de fiches de pôle) |
| **Statut** | Implémenté |

## Objectif

Faire entrer dans le socle une évolution que la **majorité des membres** a
approuvée : l'**entériner** (la version de compétence devient la version en
vigueur, immuable), puis, quand une ou plusieurs évolutions sont entérinées,
**couper une release** du référentiel — un document complet, immuable,
immédiatement épinglable par les cartographies — assemblé à partir des
compétences publiées, sans second vote.

## Déclencheur

Le décompte d'une proposition atteint la majorité : la section « Décision »
affiche « Majorité atteinte : la compétence peut être entérinée. »

## Préconditions

- Session ouverte, rôle `epistemiarque` ou `admin`.
- La proposition est au statut `review` et son décompte, recalculé contre
  l'électorat courant, est `adopted` (UC-EPI-02).
- Pour une release : 7 pôles en base et une version publiée pour chacune des
  61 compétences (état du corpus RESPIRE v7 semé au déploiement).

## Garanties en cas de succès

- La version de compétence est `published` avec sa note et sa date ; elle
  devient la dernière version en vigueur du code (`GET /api/competences/{code}`),
  les précédentes restent consultables (`…/versions`) et intactes.
- La release est une version `published` du référentiel `respire`, servie par
  `GET /api/referentiel` ; le **lockfile** relie chacun de ses 61 codes à la
  version de compétence qui la compose (provenance).
- Le hash structurel (`contentHash`) n'évolue qu'avec la structure (pôles,
  codes, noms, rattachements) : une définition ou une fiche entérinée ne le
  change pas.

## Garanties minimales (en cas d'échec)

- Rien n'est publié : la proposition reste `review` (transaction annulée) ;
  aucune release partielle, aucun lien de lockfile orphelin.
- Aucune version publiée n'est jamais réécrite.

## Scénario nominal

1. Sur la page de vote, la section « Décision » d'une proposition `adopted`
   propose une « Note de publication » et le bouton « Entériner cette
   compétence ».
2. L'épistémiarque saisit la note et clique : le site envoie
   `POST /api/competences/drafts/{id}/publish` `{releaseNote}` (note rognée ;
   « Entérinée par le vote des membres. » si elle est vide).
3. Le serveur verrouille la ligne (`SELECT … FOR UPDATE`), vérifie qu'elle est
   au statut `review`, **recalcule le décompte** contre l'électorat courant
   (majorité requise), vérifie que la semver est strictement supérieure à
   toutes les versions publiées de la compétence, puis la passe en `published`
   (`release_note`, `published_at`) → `200` (métadonnées, sans contenu).
4. Le site revient à l'atelier : la compétence y figure dans sa nouvelle
   version, sans proposition au vote ; une nouvelle évolution peut être
   proposée (UC-EPI-01).
5. Après un ou plusieurs entérinements, l'épistémiarque saisit une « Version du
   référentiel (semver) » dans la carte « Publier une version du référentiel »
   et clique « Publier le snapshot » : `POST /api/competences/release`
   `{semver, label: "RESPIRE v<semver>"}`.
6. Le serveur assemble le document depuis la dernière version publiée de
   chaque compétence et les pôles (`description` = définition rognée, hors
   hash), recalcule le `contentHash` structurel, valide le document (schéma :
   exactement 7 pôles et 61 compétences, plus contrôles d'intégrité), refuse
   une semver existante ou non strictement supérieure aux versions publiées,
   puis insère la release publiée et son lockfile dans une transaction →
   `201` `{status: "imported", id, semver, contentHash}`.
7. Le site affiche « Release 7.1.0 publiée (snapshot du référentiel). ». La
   release est aussitôt la dernière version servie par l'API et épinglable par
   les nouvelles cartographies ; `GET /api/referentiel/diff/{de}/{à}` la compare
   aux précédentes.
8. **Propagation (exploitation)** — la page publique `#/referentiel` lit des
   fichiers statiques : `php scripts/export-referentiel-static.php [dossier]`
   (StaticExporter) écrit un `respire-v<semver>.json` par version publiée et un
   `index.json` (plus récente d'abord), mis en ligne au déploiement suivant. Les
   fiches de scan des versions **en vigueur** sont régénérées depuis la base
   par `FicheGenerator` : `GET /api/admin/dump-fiches` (resynchronisation du
   corpus, Twin6) et `POST /api/admin/generate-fiches` (setting Twin9), appelés
   par la chaîne de déploiement (UC-SYS-02).

## Scénarios alternatifs

- **A1 — Administrateur** (étapes 2 et 5) : un `admin` non membre entérine une
  proposition adoptée et coupe une release (il ne vote pas, UC-EPI-02 A4).
- **A2 — Note absente** (étape 2) : l'IHM envoie la note par défaut ; un appel
  API sans corps publie avec `release_note` `NULL`.
- **A3 — Libellé absent** (étape 5) : l'API prend « RESPIRE v<semver> » ; la
  note de release est fixe (« Coupe de release depuis les compétences
  atomiques publiées »).
- **A4 — Changement structurel** (étape 6) : un **renommage** entériné change
  le `contentHash` de la release et apparaît dans le diff (`renamed`) ; un
  changement de définition seule garde le même hash (`identical` au diff).

## Scénarios d'erreur

- **E1 — Majorité non atteinte** (étape 3) : `409` avec un message lisible —
  « Majorité non atteinte : *p* voix « pour » sur *s* requises (*N* membres). »,
  « Cette proposition a été rejetée par la majorité des membres
  épistémiarques. » ou « Aucun membre épistémiarque ne peut valider… » ; le
  site affiche le message et reste sur la proposition.
- **E2 — Pas une proposition au vote** (étape 3) : brouillon jamais soumis →
  `409` ; version déjà publiée → `409` ; id inconnu → `404`.
- **E3 — Semver dépassée** (étape 3) : une version supérieure de la même
  compétence a été entérinée entre-temps (deux propositions concurrentes,
  UC-EPI-01 L1) → `409`.
- **E4 — Électorat modifié depuis le vote** (étape 3) : un votant « pour » a
  perdu le rôle ; le décompte recalculé n'atteint plus la majorité → `409`.
- **E5 — Release : semver absente ou invalide** (étape 6) : `422`
  (« Champ "semver" requis » ou erreur de schéma `/version`) ; corps non JSON →
  `400`.
- **E6 — Release : corpus incomplet** (étape 6) : moins de 61 compétences
  publiées ou de 7 pôles → `422` (gate de complétude), aucune release.
- **E7 — Release : semver existante ou non croissante** (étape 6) : `409`.
- **E8 — Accès** (étapes 2 et 5) : sans session `401`, sans rôle `403`, sans
  jeton CSRF `403`.

## Règles de gestion

- **RG1** — Entériner = publier une proposition `review` dont la majorité des
  membres est atteinte **au moment de la publication** (décompte recalculé,
  pas mémorisé).
- **RG2** — Immutabilité : une version publiée (compétence ou release) n'est
  jamais modifiée ; l'historique est conservé.
- **RG3** — Semver strictement croissante par compétence (vérifiée à la
  soumission et de nouveau à la publication) et par référentiel pour les
  releases ; précédence semver (1.10.0 > 1.9.0), pas ordre alphabétique.
- **RG4** — Une release n'a pas de second vote : les évolutions ont été
  entérinées compétence par compétence ; elle est soumise à la complétude
  (schéma 7/61 + intégrité) et produit un lockfile de provenance.
- **RG5** — Le `contentHash` d'une release ne porte que le corps structurel
  `{pôles (num, nom, couleur), compétences (code, nom, pôle)}` — parité octet
  avec le moteur et Twin9 ; définitions et fiches sont hors hash.
- **RG6** — Seules les versions **en vigueur** alimentent la release, l'export
  et les fiches : une proposition au vote ne se propage jamais.
- **RG7** — Fiche de pôle = en-tête brut + fiches des compétences du pôle
  (ordre des codes) jointes par une ligne vide + saut de ligne final.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Versions publiées, releases | Référentiel public, immuable ; aucune donnée personnelle |
| Lockfile | Identifiants de versions de compétence et empreintes ; `RESTRICT` : une version qui compose une release ne peut être supprimée |
| Export statique | Fichiers publics (référentiel), sans PHP à la consultation |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/EpistemiarqueView.jsx` — `PropositionSection` (`publish`), `CutReleaseCard` | Entérinement, coupe de release, messages |
| Front | `web/src/views/epistemiarque/competence-api.js` — `publishDraft`, `cutRelease` | Client fin |
| API | `api/src/routes/competences.php` — `POST /competences/drafts/{id}/publish`, `POST /competences/release`, `GET /competences[/{code}[/versions]]` | Orchestration |
| API | `api/src/routes/referentiel.php` — `GET /referentiel`, `/referentiel/versions`, `/referentiel/diff/{from}/{to}` | Lecture de la release (partagé avec UC-VIS-02) |
| API | `api/src/routes/system.php` — `GET /admin/dump-fiches`, `POST /admin/generate-fiches` | Propagation des fiches (déploiement) |
| Domaine | `api/src/Referentiel/CompetenceRepository.php` — `publish`, `latestPublished`, `publishedVersions`, `latestPublishedByCode` | Entérinement, version en vigueur |
| Domaine | `api/src/Referentiel/CompetenceGovernance.php` — `tally` ; `MajorityMessage.php` | Majorité recalculée, message |
| Domaine | `api/src/Referentiel/SnapshotAssembler.php` ; `ContentHash.php` | Assemblage de la release, hash structurel |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `cutReleaseFromDocument`, `validateDocument` | Gate de complétude, semver, lockfile |
| Domaine | `api/src/Referentiel/StaticExporter.php` ; `scripts/export-referentiel-static.php` | Export statique |
| Domaine | `api/src/Referentiel/FicheGenerator.php` | Fiches de scan régénérées depuis la base |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-EPI-03-U01 | `CompetenceRepository::publish` | Adoptée → publiée (note, date, contenu voté), nouvelle version en vigueur, ancienne intacte (RG1, RG2) | `api/tests/UseCases/Unit/UcEpi03EnterinerPublierTest.php` |
| UC-EPI-03-U02 | `publish` | Inconnue → null ; brouillon, publiée, en cours, rejetée, bloquée → 409, transaction annulée | idem |
| UC-EPI-03-U03 | `publish` | Semver dépassée par une publication concurrente → 409 (RG3) | idem |
| UC-EPI-03-U04 | `MajorityMessage::forTally` | Trois messages (en cours, rejetée, bloquée) | idem |
| UC-EPI-03-U05 | `latestPublishedByCode` | Précédence semver, tri par code, brouillons ignorés (RG6) | idem |
| UC-EPI-03-U06 | `SnapshotAssembler::assembleDocument` | Ordre canonique, pôles, description rognée/omise, hash = `ContentHash` du corps (RG5) | idem |
| UC-EPI-03-U07 | `SnapshotAssembler::structuralHash` | Définition entérinée : hash inchangé ; renommage : hash changé (A4) | idem |
| UC-EPI-03-U08 | `ReferentielRepository::cutReleaseFromDocument` | Complétude 61/7 (422), release + lockfile (61 liens, provenance), 409 semver existante / non croissante (RG4) | idem |
| UC-EPI-03-U09 | `StaticExporter::export` | Release exportée en dossier temporaire, valide au schéma, définition entérinée, index le plus récent d'abord | idem |
| UC-EPI-03-U10 | `FicheGenerator` | `poleFiches` (RG7), `corpus`, `fichesStructure` depuis les versions en vigueur ; fiche au vote non propagée | idem |
| UC-EPI-03-U11 | `createCompetenceApi` | `publishDraft` et `cutRelease` : routes et corps | `web/test/usecases/unit/uc-epi-03-enteriner-publier.test.jsx` |
| UC-EPI-03-U12 | `CutReleaseCard` (vue isolée) | Bouton inactif sans version, semver rognée, libellé par défaut, succès puis 409 affichés | idem |
| UC-EPI-03-U13 | Section Décision (vue isolée) | Note par défaut / rognée, retour à l'atelier | idem |
| UC-EPI-03-U14 | Section Décision (vue isolée) | Refus 409 : message, on reste, bouton réactivé | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-EPI-03-F01 | Nominal | API | Entérinement 200, version en vigueur, versions, release 201 (même hash), `GET /referentiel` 7.1.0 avec définition, diff identique, lockfile | `api/tests/UseCases/Functional/UcEpi03EnterinerPublierTest.php` |
| UC-EPI-03-F02 | A1 | API | Admin non membre : entérinement 200, release 201 | idem |
| UC-EPI-03-F03 | A2, A3 | API | Sans note → `NULL` ; sans libellé → « RESPIRE v7.1.0 » | idem |
| UC-EPI-03-F04 | A4 | API | Renommage entériné : hash de release changé, diff `renamed` | idem |
| UC-EPI-03-F05 | E1 | API | 409 « Majorité non atteinte : 1 voix… (2 membres) », reste `review` | idem |
| UC-EPI-03-F06 | E2 | API | Brouillon 409, publiée 409, inconnue 404 | idem |
| UC-EPI-03-F07 | E3 | API | 2.0.0 entérinée puis 1.1.0 → 409 | idem |
| UC-EPI-03-F08 | E4 | API | Votant « pour » privé de rôle → 409 à la publication | idem |
| UC-EPI-03-F09 | E5, E7 | API | 422 semver absente/invalide, 400 non JSON, 409 existante / inférieure | idem |
| UC-EPI-03-F10 | E6 | API | Corpus incomplet → 422, aucune version publiée | idem |
| UC-EPI-03-F11 | E8 | API | 401 / 403 / CSRF 403 sur entérinement et release | idem |
| UC-EPI-03-F12 | Nominal, étape 8 | CLI | `scripts/export-referentiel-static.php` (dossier temporaire) : code 0, fichiers et index, définition entérinée | idem |
| UC-EPI-03-F13 | Nominal, étape 8 | API | `GET /api/admin/dump-fiches` : fiche nouvelle après entérinement, pas avant | idem |
| UC-EPI-03-F14 | Anomalie AN1 | API | Corps non JSON à l'entérinement ignoré : 200, note `NULL` (comportement figé) | idem |
| UC-EPI-03-F15 | Nominal | IHM | `<App/>` : vote décisif, note, « Entériner », atelier à jour (v1.1.0), release 7.1.0 | `web/test/usecases/functional/uc-epi-03-enteriner-publier.test.jsx` |
| UC-EPI-03-F16 | A2 | IHM | Note vide → note par défaut, retour à l'atelier | idem |
| UC-EPI-03-F17 | E1 | IHM | Majorité perdue entre-temps : 409 affiché, on reste | idem |
| UC-EPI-03-F18 | E6, E7 | IHM | Release 422 puis succès puis 409 : messages | idem |

### Tests existants liés (non-régression)

- `api/tests/CompetenceAtomicTest.php` — entérinement indépendant par compétence, publication sans majorité refusée, snapshot byte-identique, coupe de release.
- `api/tests/CompetenceReleaseTest.php` — gate de complétude (domaine et HTTP), release HTTP + lockfile, oracle du hash structurel, `RESTRICT` du lockfile.
- `api/tests/CompetenceGovernanceTest.php` — rejet et électorat vide bloquent la publication.
- `api/tests/FicheParityTest.php`, `api/tests/FicheAdminEndpointsTest.php` — parité octet des fiches, édition gouvernée propagée à Twin6/Twin9, garde-fou de `generate-fiches`.
- `api/tests/ReferentielImportExportTest.php` — export statique (un fichier par version publiée + index).
- `web/src/views/EpistemiarqueView.test.jsx` — entérinement, coupe de release.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcEpi03 --testdox
cd web && npx vitest run test/usecases/unit/uc-epi-03 test/usecases/functional/uc-epi-03
```

## Anomalies constatées

- **AN1** — `POST /api/competences/drafts/{id}/publish` ne rejette pas un corps
  non JSON : `$parseBody` renvoie `null`, la note est ignorée et la
  publication a lieu (`200`, note `NULL`), alors que `/submit`, `/votes`,
  `/release` et la route équivalente du grain version répondent `400`.
  Sans gravité (la publication reste soumise à la majorité), figé par
  UC-EPI-03-F14.

## Limites

- **L1** — La page publique ne voit une release qu'après ré-export **et**
  redéploiement : `scripts/export-referentiel-static.php` exporte la base à
  laquelle il est connecté (locale), l'hébergement n'a ni SSH ni route
  d'export, et le déploiement pousse les fichiers locaux vers la production
  (pas l'inverse). Une release coupée dans l'atelier de production n'a donc
  pas de chemin outillé vers la page publique ; elle est en revanche servie
  aussitôt par l'API (`GET /api/referentiel`) et épinglable.
- **L2** — Le schéma du référentiel fige 7 pôles et 61 compétences : ajouter
  ou retirer une compétence (évolution « mineure » ou « majeure » décrite dans
  la formation épistémiarque, chapitre 4) n'est pas possible — aucune route
  ne crée ni ne retire une compétence atomique, et la release serait refusée
  par le gate de complétude.
- **L3** — Le diff entre releases est structurel : une évolution de
  définition ou de fiche seule donne `identical: true`.
- **L4** — Une release peut être coupée sans aucun nouvel entérinement (même
  contenu, nouvelle semver).
- **L5** — La coupe de release repart **uniquement** des compétences
  atomiques : une version publiée entre-temps au grain document (UC-EPI-04)
  est ignorée et ses changements structurels sont annulés (UC-EPI-04 AN1).
