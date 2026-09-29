# UC-EPI-01 — Proposer une modification de compétence

| Champ | Valeur |
|---|---|
| **Acteur principal** | Épistémiarque (un administrateur peut aussi proposer : garde « épistémiarque ou admin ») |
| **Acteurs secondaires** | Autres épistémiarques (éditions concurrentes, puis vote : UC-EPI-02) ; espace participatif Decidim `participer.harmonia.education` (débat externe, lien facultatif) |
| **Portée** | humanome.xyz — atelier `#/epistemiarque` (liste, `editer/<id>`) ; API `/api/competences/…` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.5 (édition collective, Decidim), §4.1 (référentiel versionné, modifiable par les seuls épistémiarques) ; migrations 015 (gouvernance) et 016 (compétences atomiques) |
| **Statut** | Implémenté (grain compétence atomique, correction d'architecture du 2026-07-15) |

## Objectif

Permettre à un épistémiarque de faire évoluer **une** compétence du référentiel
(nom, définition, argument employeur, marqueurs, signaux déclencheurs,
enrichissements, fiche de scan) sous forme d'un **brouillon versionné**, sans
jamais toucher à la version en vigueur, puis de le **soumettre au vote** des
membres, éventuellement adossé à un fil de débat Decidim. Chaque compétence est
une entité atomique : deux épistémiarques qui travaillent sur deux compétences
différentes ne se gênent jamais ; sur la même compétence, la concurrence
optimiste empêche qu'un enregistrement en écrase un autre.

## Déclencheur

L'épistémiarque ouvre l'atelier `#/epistemiarque` (menu « Faire évoluer ›
Édition du référentiel », entrée réservée au rôle `epistemiarque` dans
`web/src/nav.js`) et clique « Proposer une évolution » sur une compétence.

## Préconditions

- L'utilisateur a une session ouverte (UC-CPT-02) et porte le rôle
  `epistemiarque` (ou `admin`), attribué par l'administration (UC-ADM-01).
- La compétence a au moins une version **publiée** (état initial : les 61
  compétences 1.0.0 du corpus RESPIRE v7, semées au déploiement, UC-SYS-02).

## Garanties en cas de succès

- Une nouvelle version de la compétence existe au statut `draft`, puis `review`
  après soumission : contenu gelé, soumise au vote des membres (UC-EPI-02).
- La version publiée en vigueur est **inchangée** et continue d'être servie
  (`GET /api/competences/{code}`) tant que la proposition n'est pas entérinée
  (UC-EPI-03).
- L'auteur (`created_by`) et le soumissionnaire (`submitted_by`) sont ceux de la
  session, jamais une valeur fournie par le client ; la date de soumission et
  l'éventuel lien Decidim sont enregistrés.

## Garanties minimales (en cas d'échec)

- Aucune version publiée n'est modifiée (immutabilité).
- Aucun enregistrement concurrent n'est perdu : un enregistrement fondé sur une
  version périmée est refusé et rien n'est écrit. (Cette garantie vaut pour
  l'édition, protégée par compare-and-swap ; le fork et la soumission ne sont
  pas atomiques : anomalie AN1.)
- Un contenu non conforme au schéma `competence` n'est jamais enregistré.

## Scénario nominal

1. L'épistémiarque ouvre `#/epistemiarque`. Le site vérifie la session
   (`GET /api/auth/me`) : le rôle `epistemiarque` ou `admin` est requis pour
   afficher l'atelier.
2. L'atelier charge `GET /api/competences` (dernière version publiée de chaque
   compétence, par précédence semver) et `GET /api/competences/drafts`
   (brouillons et propositions au vote, les plus récents d'abord, avec leur
   décompte). Il affiche les compétences par pôle ; celles qui ont déjà une
   version éditable portent la mention « déjà en cours d'édition » au lieu du
   bouton.
3. L'épistémiarque clique « Proposer une évolution » : le site envoie
   `POST /api/competences/{code}/drafts` `{semver}` avec la version mineure
   suivante (1.0.0 → 1.1.0) et le jeton CSRF.
4. Le serveur vérifie que la semver est valide, retrouve la dernière version
   publiée du code, refuse un doublon `(code, semver)`, puis crée un brouillon
   `draft` qui copie son contenu riche, son nom et son pôle, calcule son
   `content_hash` et enregistre l'auteur → `201` (métadonnées + `content`).
5. Le site ouvre l'éditeur `#/epistemiarque/editer/{id}`, qui charge
   `GET /api/competences/drafts/{id}` : contenu et `contentHash` de base.
6. L'épistémiarque modifie le nom, la définition, l'argument employeur, les
   marqueurs fondamentaux, les signaux déclencheurs (passe 1), les
   enrichissements ou la fiche de scan, puis clique « Enregistrer » :
   `PUT /api/competences/drafts/{id}` avec le contenu **complet** et l'en-tête
   `If-Match: <contentHash de base>`.
7. Le serveur valide le contenu (schéma `competence`, code inchangé) et
   l'écrit par *compare-and-swap* sur `content_hash` ; le nom structurel suit
   `identite.nom` → `200` avec la nouvelle empreinte, que le site garde comme
   base du prochain enregistrement (« Compétence enregistrée. »).
8. L'épistémiarque colle éventuellement le lien du débat Decidim puis clique
   « Soumettre au vote » : le site enregistre d'abord les modifications non
   sauvegardées (étape 6), puis envoie `POST /api/competences/drafts/{id}/submit`
   `{decidimUrl?}`.
9. Le serveur revalide le contenu (contrôle défensif : le `PUT` valide déjà ;
   seul un brouillon écrit avant un durcissement du schéma peut échouer ici),
   vérifie que la semver est **strictement
   supérieure** à toutes les versions publiées de la compétence, normalise le
   lien Decidim, efface les bulletins d'un éventuel tour précédent et passe la
   version au statut `review` (`submitted_at`, `submitted_by`, `decidim_url`)
   → `200` avec le décompte (`tally`) du vote qui s'ouvre.
10. Le site ouvre la page de vote `#/epistemiarque/proposition/{id}`
    (UC-EPI-02), avec le lien « Débattre sur Decidim (fil joint) ».

## Scénarios alternatifs

- **A1 — Retrait de la proposition** (après l'étape 9) : sur la page de vote,
  « Retirer la proposition » envoie `POST /api/competences/drafts/{id}/withdraw`.
  La version repasse en `draft`, ses bulletins sont effacés, `submitted_*` et
  `decidim_url` sont remis à vide ; le site rouvre l'éditeur. Une nouvelle
  soumission ouvre un tour de vote **vierge**.
- **A2 — Réenregistrement identique** (étape 7) : renvoyer le même contenu avec
  l'empreinte courante n'est pas un conflit (aucune ligne changée) → `200`,
  empreinte inchangée.
- **A3 — Soumission sans lien Decidim ou avec des modifications en cours**
  (étape 8) : sans lien, le corps est `{}` et la proposition renvoie à l'espace
  Decidim général ; des modifications non enregistrées sont d'abord envoyées
  par `PUT` (avec `If-Match`), puis la soumission part.
- **A4 — Éditeur d'une proposition déjà au vote** (étape 5) : le contenu est
  gelé ; l'éditeur n'affiche pas de formulaire mais « Cette compétence est
  ouverte au vote… » et le lien « Aller à la page de vote ».
- **A5 — Administrateur** (étape 1) : un compte `admin` sans rôle
  `epistemiarque` accède à l'atelier, propose et soumet ; il ne fait pas pour
  autant partie de l'électorat (UC-EPI-02). Sans entrée de menu (réservée au
  rôle épistémiarque), l'administrateur ouvre `#/epistemiarque` directement
  par son URL.

## Scénarios d'erreur

- **E1 — Pas de session** (étape 1) : l'atelier affiche « L'édition du
  référentiel nécessite une session » ; l'API répond `401` à toutes les routes
  d'atelier. Sur une copie statique du site (pas d'API), l'atelier l'indique.
  Une erreur serveur de `GET /api/auth/me` (`500`) est présentée, elle aussi,
  comme une absence de session (anomalie AN5). Une section inconnue
  (`#/epistemiarque/foo`) affiche « Section inconnue de l'atelier
  épistémiarque » et un lien de retour.
- **E2 — Rôle absent** (étape 1) : « Cet atelier est réservé au rôle
  épistémiarque » ; l'API répond `403`. Les rôles sont relus en base à chaque
  requête : un rôle retiré prend effet à la requête suivante. Un compte purgé
  (`DELETE /api/auth/account` : suppression réelle, sessions en cascade) perd
  sa session → `401` (`403` CSRF sur une mutation, le jeton étant lié à la
  session disparue ; UC-EPI-02-F20) ; le refus d'un compte marqué `deleted_at`
  (`403`) n'est qu'une branche défensive, la production ne posant jamais ce
  marqueur.
- **E3 — Semver absente ou invalide** (étape 4) : `422` (`Champ "semver"
  requis`, ou erreur `/semver`) ; corps non JSON ou scalaire JSON → `400`
  « Invalid JSON body ».
- **E4 — Compétence inconnue** (étape 4) : aucun code publié → `404`
  « Compétence publiée introuvable » ; un code malformé (hors motif `P.NN`) ne
  correspond à aucune route → `404`.
- **E5 — Version déjà existante** (étape 4) : `(code, semver)` pris → `409` ;
  le site affiche le message sur la ligne de la compétence.
- **E6 — Précondition absente** (étape 6) : `PUT` sans `If-Match` → `428`.
- **E7 — Édition concurrente** (étape 7) : l'empreinte envoyée n'est plus
  l'empreinte courante → `409` « Cette compétence a été modifiée par un autre
  épistémiarque ; rechargez avant d'enregistrer. », rien n'est écrit ; le site
  affiche le message et un bouton « Recharger ».
- **E8 — Contenu invalide** (étapes 7 et 9) : non conforme au schéma → `422`
  avec les erreurs par pointeur JSON ; code modifié → `422`
  `/identite/code` ; corps vide, `{}`, `[]` ou non-JSON → `400` ; tableau JSON
  non vide (ex. `[1, 2]`) → `422` (schéma : `type: object`). À l'étape 9, la
  revalidation est défensive (voir étape 9). **Ordre des contrôles du `PUT`** :
  corps (`400`) → `If-Match` (`428`) → existence (`404`) ou statut (`409`) →
  schéma et code (`422`) ; un `PUT` sans `If-Match` répond donc `428` même sur
  un id inconnu ou une proposition au vote.
- **E9 — Version gelée ou publiée** (étape 6, `If-Match` présent) :
  proposition au vote → `409` (« withdraw it before editing ») ; version
  publiée → `409` (immuable) et `GET /api/competences/drafts/{id}` → `404`.
- **E10 — Soumission refusée** (étape 9) : déjà au vote ou publiée → `409` ;
  semver non strictement supérieure à la dernière publiée → `409` ; lien
  Decidim textuel qui n'est pas une URL http(s) valide ou dépasse 500
  caractères → `422` (`/decidimUrl`), la version reste `draft` ; corps non
  JSON → `400`. Un `decidimUrl` **non textuel** (nombre, booléen, objet) n'est
  pas refusé : il est ignoré et la soumission réussit sans lien (anomalie AN4).
- **E11 — Retrait impossible** (A1) : la version n'est pas au vote → `409`.
- **E12 — Jeton CSRF absent** (étapes 3, 6, 8) : mutation avec cookie de
  session mais sans `X-CSRF-Token` → `403`.
- **E13 — Brouillon inconnu** (étapes 5 à 9) : `404` « Brouillon introuvable »
  (au `PUT`, seulement si `If-Match` est présent : sinon `428`, voir E8).

## Règles de gestion

- **RG1** — Un brouillon est toujours forké de la **dernière version publiée**
  du code (précédence semver : 1.10.0 > 1.9.0) ; il en copie le contenu riche,
  le nom et le pôle. Le pôle n'est pas modifiable au grain compétence.
- **RG2** — Unicité `(code, semver)` ; semver 2.0.0 valide à la création ; la
  **croissance stricte** n'est vérifiée qu'à la soumission (et à la
  publication, UC-EPI-03). Le site propose la mineure suivante.
- **RG3** — Concurrence optimiste : l'en-tête `If-Match` (brut ou entre
  guillemets) porte le `content_hash` chargé ; la précondition vit dans le
  `WHERE` de l'`UPDATE` (atomique). Absente → `428` ; périmée → `409` ;
  contenu identique → no-op.
- **RG4** — `content_hash` = sha256 de la forme canonique du contenu riche
  (clés d'objet triées récursivement, ordre des listes conservé) : insensible
  au réordonnancement des clés par MySQL, strictement interne à PHP (distinct
  du hash structurel du référentiel).
- **RG5** — Chaque écriture revalide le contenu contre
  `schemas/competence.schema.json` et impose `identite.code` = code de la
  compétence.
- **RG6** — Une proposition au vote est gelée ; le retrait la rend éditable et
  efface les bulletins ; chaque soumission ouvre un tour vierge.
- **RG7** — Lien Decidim facultatif : URL http(s) valide d'au plus 500
  caractères, espaces rognés ; une valeur vide équivaut à « aucun lien ».
- **RG8** — L'auteur et le soumissionnaire sont lus dans la session.
- **RG9** — Deux compétences différentes ne se bloquent jamais : verrouillage
  et empreintes sont par version de compétence.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Contenu de compétence | Référentiel public par nature ; aucune donnée personnelle attendue |
| Auteur, soumissionnaire | Identifiants de compte (`created_by`, `submitted_by`), remis à `NULL` si le compte est purgé (FK `ON DELETE SET NULL`) |
| Lien Decidim | URL publique de débat, facultative |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Routes `#/epistemiarque[/editer/<id>\|proposition/<id>]` |
| Front | `web/src/views/EpistemiarqueView.jsx` — garde de rôle, `AtelierSection`, `ProposeButton`, `EditeurSection`, `ListEditor` | Atelier, fork, éditeur riche, enregistrement CAS, soumission |
| Front | `web/src/views/epistemiarque/competence-api.js` — `createCompetenceApi`, `nextCompetenceVersion` | Client fin (chemins, `If-Match`), version suggérée |
| Front | `web/src/api/client.js` — `apiFetch`, `fetchMe`, `ApiError`, `ApiUnavailableError` | En-têtes additionnels, jeton CSRF, erreurs typées, sonde de session |
| Front | `web/src/nav.js` | Entrée de menu « Édition du référentiel » (rôle `epistemiarque` seulement) |
| API | `api/src/routes/competences.php` — `GET /competences`, `GET /competences/drafts[/{id}]`, `POST /competences/{code}/drafts`, `PUT /competences/drafts/{id}`, `…/submit`, `…/withdraw` | Orchestration, 400/404/409/422/428 |
| API | `api/src/Referentiel/RoleGuard.php` | 401/403, rôles relus en base |
| Domaine | `api/src/Referentiel/CompetenceRepository.php` — `createDraft`, `updateDraft`, `findById`, `editableVersions`, `latestPublished`, `latestPublishedByCode` (étape 2), `publishedVersions` (semver à la soumission), `validateContent`, `metadata` | Fork, CAS, validation |
| Domaine | `api/src/Referentiel/CompetenceHash.php` | Empreinte canonique du contenu riche |
| Domaine | `api/src/Referentiel/CompetenceGovernance.php` — `submit`, `withdraw` | Ouverture et retrait du vote |
| Domaine | `api/src/Referentiel/DecidimLink.php`, `Semver.php` | Lien Decidim, validité/précédence semver |
| Domaine | `ConflictException` (→ 409), `InvalidDocumentException` (→ 422) | Erreurs métier |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-EPI-01-U01 | `CompetenceRepository::createDraft` | Fork de la dernière publiée par précédence semver (1.10.0 > 1.9.0, insérée ni en premier ni en dernier), copie nom/pôle/contenu, auteur (RG1, RG8) | `api/tests/UseCases/Unit/UcEpi01ProposerModificationCompetenceTest.php` |
| UC-EPI-01-U02 | `createDraft`, `Semver::isValid` | Semver invalide → 422 `/semver`, doublon → 409, code inconnu → null, semver inférieure acceptée à la création (RG2) | idem |
| UC-EPI-01-U03 | `CompetenceRepository::updateDraft` | CAS : nouvelle empreinte, nom structurel suivi, hash périmé/absent → 409 sans écriture, réécriture identique = no-op (RG3) | idem |
| UC-EPI-01-U04 | `updateDraft`, `validateContent` | Publiée → 409, au vote → 409, hors schéma → 422, code modifié → 422 `/identite/code`, inconnu → null (RG5, RG6) | idem |
| UC-EPI-01-U05 | `CompetenceHash` | Insensible à l'ordre des clés, sensible à l'ordre des listes et au contenu, distinct du hash structurel (RG4) | idem |
| UC-EPI-01-U06 | `CompetenceGovernance::submit` | draft → review, `submitted_by`, lien Decidim rogné, bulletins résiduels effacés | idem |
| UC-EPI-01-U07 | `CompetenceGovernance::submit` | Inconnue → null ; publiée, déjà au vote, semver non croissante → 409 ; lien invalide → 422 sans écriture ; contenu revalidé hors schéma → 422, statut et `submitted_at` inchangés (étape 9) | idem |
| UC-EPI-01-U08 | `CompetenceGovernance::withdraw` | review → draft, bulletins et méta de soumission effacés ; brouillon → 409 | idem |
| UC-EPI-01-U09 | `DecidimLink::normalize` | Vide → null, http(s) accepté, autres schémas / > 500 caractères → 422 (RG7) | idem |
| UC-EPI-01-U10 | `editableVersions`, `metadata` | Brouillons + propositions, plus récents d'abord ; métadonnées sans contenu | idem |
| UC-EPI-01-U11 | `RoleGuard::any` | 401 sans session, 403 sans rôle ou rôle retiré (même session, relu à chaque requête), passage épistémiarque/admin ; `deleted_at` refusé (branche défensive) | idem |
| UC-EPI-01-U12 | `parseHash` | Routes de l'atelier et sections `editer/…`, `proposition/…` | `web/test/usecases/unit/uc-epi-01-proposer-modification-competence.test.js` |
| UC-EPI-01-U13 | `createCompetenceApi` | Chemins/méthodes des lectures et du fork | idem |
| UC-EPI-01-U14 | `createCompetenceApi.saveDraft` | `PUT` du contenu complet avec `If-Match` (absent sans base) | idem |
| UC-EPI-01-U15 | `submitDraft`, `withdrawDraft` | `{decidimUrl}` seulement s'il est fourni ; retrait sans corps | idem |
| UC-EPI-01-U16 | `nextCompetenceVersion` | Mineure suivante, repli 1.1.0 | idem |
| UC-EPI-01-U17 | `apiFetch` | `If-Match` transmis, jeton CSRF appris de `auth/me`, 409/428 → `ApiError` | idem |
| UC-EPI-01-U18 | `EpistemiarqueView` (garde de rôle, vue isolée) | Admin sans rôle épistémiarque : atelier affiché, `list`/`listDrafts` appelés (A5) ; promptologue refusé sans appel | `web/test/usecases/unit/uc-epi-01-proposer-modification-competence-vue.test.jsx` |
| UC-EPI-01-U19 | `EditeurSection`, `ListEditor` (vue isolée) | Ajout d'un signal, suppression et édition d'un marqueur, argument employeur, enrichissements ; `saveDraft` reçoit le contenu complet et l'empreinte de base (étape 6) | idem |
| UC-EPI-01-U20 | `fetchMe` | Session → `{user}` ; 401 → `{user: null}` ; 500 → `ApiError` ; réponse non JSON → `ApiUnavailableError` | `web/test/usecases/unit/uc-epi-01-proposer-modification-competence.test.js` |
| UC-EPI-01-U21 | `EpistemiarqueView` (vue isolée) | API absente → « copie statique » ; `auth/me` en 500 → « nécessite une session » (AN5, figé) ; section inconnue → message et retour (E1) | `web/test/usecases/unit/uc-epi-01-proposer-modification-competence-vue.test.jsx` |
| UC-EPI-01-U22 | `createDraft`, `CompetenceGovernance::submit` | Anomalie AN1 (figé) : fork concurrent intercalé → `PDOException` (500, pas 409) ; soumission concurrente → seconde soumission acceptée, bulletin effacé, soumissionnaire écrasé | `api/tests/UseCases/Unit/UcEpi01ProposerModificationCompetenceTest.php` |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-EPI-01-F01 | Nominal | API | Liste, fork 201, rechargement, `PUT` If-Match 200 (pôle inchangé malgré un `pole` dans le contenu, RG1), soumission 200 avec tally et lien Decidim ; `createdBy`/`submittedBy` forgés ignorés (RG8) ; version en vigueur servie à l'identique (id, nom, empreinte, contenu) | `api/tests/UseCases/Functional/UcEpi01ProposerModificationCompetenceTest.php` |
| UC-EPI-01-F02 | A1 (+ A3) | API | Retrait : brouillon, bulletins effacés, réédition, resoumission en tour vierge sans lien | idem |
| UC-EPI-01-F03 | A2 | API | Réenregistrement identique → 200, empreinte inchangée | idem |
| UC-EPI-01-F04 | A5 | API | Admin non membre : fork 201, soumission 200, électorat inchangé | idem |
| UC-EPI-01-F05 | E1, E2 | API | 401 anonyme, 403 sans rôle sur les 6 routes d'atelier ; lecture publique ouverte | idem |
| UC-EPI-01-F06 | E3, E4, E5 | API | 422 semver absente/invalide, 400 corps non JSON ou scalaire, 404 code inconnu ou malformé, 409 doublon | idem |
| UC-EPI-01-F07 | E6, E7 (RG9) | API | 428 sans If-Match ; 409 au second éditeur, contenu du premier conservé ; autre compétence jamais bloquée | idem |
| UC-EPI-01-F08 | E8 | API | 422 hors schéma / tableau JSON / code modifié, 400 corps vide, ordre des contrôles (428 avant 404, 400 avant tout), rien d'écrit | idem |
| UC-EPI-01-F09 | E9 | API | Proposition gelée 409 ; publiée immuable 409 et 404 en brouillon | idem |
| UC-EPI-01-F10 | E10 | API | 409 double soumission / publiée / semver non croissante, 422 lien Decidim, 400 JSON invalide ; `decidimUrl` non textuel ignoré, 200 sans lien (AN4, figé) | idem |
| UC-EPI-01-F11 | E11, E13 | API | Retrait d'un brouillon 409 ; id inconnu → 404 sur GET/PUT/submit/withdraw | idem |
| UC-EPI-01-F12 | E12 | API | Cookie sans jeton CSRF → 403 au fork, au `PUT` (même avec If-Match) et à la soumission ; rien n'est écrit | idem |
| UC-EPI-01-F13 | Limite L1, AN3 | API | Deux brouillons d'une même compétence acceptés ; après publication de 1.2.0, le brouillon 1.1.0 n'est plus ni soumissible (409) ni retirable (409) et reste listé (comportement figé) | idem |
| UC-EPI-01-F14 | Nominal | IHM | `<App/>` : atelier, « Proposer une évolution », édition, `PUT` If-Match avec le contenu complet (fiche, protocole, marqueurs, argument employeur comparés au contenu chargé), lien Decidim, soumission, page de vote | `web/test/usecases/functional/uc-epi-01-proposer-modification-competence.test.jsx` |
| UC-EPI-01-F15 | A1 | IHM | « Retirer la proposition » → éditeur rouvert | idem |
| UC-EPI-01-F16 | A4 | IHM | Éditeur d'une proposition au vote gelé ; « déjà en cours d'édition » dans l'atelier | idem |
| UC-EPI-01-F17 | A3 | IHM | Soumission avec fiche modifiée non enregistrée : `PUT` puis `submit` `{}` ; lien vers l'espace Decidim général | idem |
| UC-EPI-01-F18 | E1, E2 | IHM | Anonyme, sans rôle, copie statique : messages, aucun appel aux compétences (dans les trois cas) | idem |
| UC-EPI-01-F19 | E7 | IHM | 409 concurrent : message + bouton « Recharger » | idem |
| UC-EPI-01-F20 | E5, E10, AN2 | IHM | Fork 409 signalé sur la ligne (message serveur anglais affiché tel quel, figé) ; lien Decidim 422 affiché, on reste dans l'éditeur | idem |

### Tests existants liés (non-régression)

- `api/tests/CompetenceAtomicTest.php` — import idempotent, code imposé, lost update impossible, no-op, deux compétences indépendantes, gel puis retrait.
- `api/tests/CompetenceApiTest.php` — cycle fork → CAS → vote → publication (session simulée), 428/409, gardes 401/403.
- `api/tests/CompetenceGovernanceTest.php` — lien Decidim (domaine et HTTP), tour de vote vierge à la resoumission.
- `api/tests/ReferentielUnitTest.php` — `Semver` (précédence, validité).
- `web/src/views/EpistemiarqueView.test.jsx` — garde de rôle, atelier, éditeur (If-Match, signal, 409, gel), fiche de scan préservée.
- `api/tests/RgpdAuditTest.php` — règles FK de purge (`competence_versions.created_by` / `submitted_by` → `SET NULL`, `competence_votes` → `CASCADE`).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcEpi01 --testdox
cd web && npx vitest run test/usecases/unit/uc-epi-01 test/usecases/functional/uc-epi-01
```

## Anomalies constatées

- **AN1 — Fork et soumission non atomiques.** `createDraft` fait un `SELECT` de
  doublon puis un `INSERT` : deux forks simultanés du même `(code, semver)`
  donnent `201` pour l'un et, pour l'autre, une `PDOException` sur la
  contrainte unique, rendue en `500` « Internal error » au lieu du `409` (E5).
  `CompetenceGovernance::submit` vérifie le statut sur une lecture antérieure
  puis écrit `UPDATE … WHERE id = ?` sans `AND status = 'draft'` : deux
  soumissions concurrentes réussissent toutes deux (E10 « déjà au vote → 409 »
  n'est pas garanti) et la seconde efface les bulletins déposés entre-temps et
  écrase `submitted_by` et `decidim_url`. L'édition, elle, est protégée
  (compare-and-swap). Figé par UC-EPI-01-U22 (course simulée de façon
  déterministe par une seconde connexion).
- **AN2 — Messages serveur en anglais dans l'IHM.** Plusieurs erreurs métier
  du parcours sont rédigées en anglais côté serveur et affichées telles quelles
  par l'atelier (`errorMessage` → `serverMessage`), contre la convention « UI
  en français » : doublon de fork (« Competence 1.01@1.1.0 already exists »,
  E5), semver invalide (E3), proposition gelée (« withdraw it before
  editing », E9), version immuable (E9), semver non croissante (« Semver must
  be strictly increasing… », E10). Figé par UC-EPI-01-F20 (IHM) et F09/F10
  (API).
- **AN3 — Brouillon dépassé : compétence bloquée dans l'IHM.** Conséquence de
  L1 et L2 : si deux brouillons 1.1.0 et 1.2.0 coexistent et que 1.2.0 est
  publiée, le brouillon 1.1.0 ne peut plus être ni soumis (`409`, semver non
  croissante), ni retiré (`409`, pas au vote), ni supprimé (aucune route), ni
  renuméroté (la semver n'est pas éditable au grain compétence). Or sa seule
  présence remplace « Proposer une évolution » par « déjà en cours d'édition »
  (`AtelierSection` : `editingByCode` inclut tout brouillon) : la compétence
  n'est plus proposable depuis l'IHM. Figé par UC-EPI-01-F13.
- **AN4 — `decidimUrl` non textuel ignoré en silence.** Un `decidimUrl`
  nombre, booléen ou objet n'est pas refusé (`422`) : la route le remplace par
  `null` et la soumission réussit sans lien. Figé par UC-EPI-01-F10.
- **AN5 — Panne de `auth/me` présentée comme une absence de session.** Une
  erreur serveur (`ApiError` 500) de la sonde de session fait afficher
  « L'édition du référentiel nécessite une session. Connectez-vous » à un
  épistémiarque pourtant connecté (seule `ApiUnavailableError` est distinguée).
  Figé par UC-EPI-01-U21.

## Limites

- **L1** — L'API accepte plusieurs brouillons simultanés d'une même compétence
  (semver différentes) : seule l'IHM l'évite en masquant le bouton (« déjà en
  cours d'édition »). Le conflit ne réapparaît qu'à la soumission ou à la
  publication (semver non croissante, UC-EPI-03 E3), et laisse alors un
  brouillon définitivement bloqué (anomalie AN3). Figé par UC-EPI-01-F13.
- **L2** — Aucune route ne supprime un brouillon abandonné ; il reste listé
  dans l'atelier (et masque le bouton de proposition de sa compétence, AN3).
- **L3** — Si l'enregistrement préalable à la soumission (A3) échoue en `409`,
  l'éditeur affiche le message mais pas le bouton « Recharger » (réservé à
  l'enregistrement explicite).
- **L4** — `If-Match` n'accepte que l'empreinte brute ou entre guillemets (pas
  la forme faible `W/"…"` des ETag HTTP).
- **L5** — On ne peut proposer que l'évolution d'une compétence **existante** :
  aucune route ne crée ni ne retire une compétence, et le schéma du
  référentiel fige 61 compétences en 7 pôles (UC-EPI-03 L2).
