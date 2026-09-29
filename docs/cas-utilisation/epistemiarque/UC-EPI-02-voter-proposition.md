# UC-EPI-02 — Voter sur une proposition

| Champ | Valeur |
|---|---|
| **Acteur principal** | Membre épistémiarque (seul rôle votant) |
| **Acteurs secondaires** | Auteur de la proposition (UC-EPI-01, UC-EPI-04) ; administrateur (suit le vote, ne vote pas) ; espace Decidim (fil de débat joint) ; administration des rôles (UC-ADM-01), qui fait varier l'électorat |
| **Portée** | humanome.xyz — page de vote `#/epistemiarque/proposition/<id>` ; API `/api/competences/proposals…` (grain compétence) et `/api/referentiel/proposals…` (grain version, sans IHM) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.5 (édition collective du référentiel), §4.1 ; migration 015 (bulletins `referentiel_votes`) et 016 (`competence_votes`) |
| **Statut** | Implémenté (grain compétence avec IHM ; grain version par API seulement) |

## Objectif

Permettre à chaque membre épistémiarque de se prononcer — **pour**, **contre**
ou **abstention**, avec un commentaire facultatif — sur une proposition
d'évolution ouverte au vote, en voyant ce qui change par rapport à la version
en vigueur, le fil Decidim qui l'étaye et le décompte courant. Une proposition
n'est entérinable (UC-EPI-03) qu'une fois la **majorité des membres** (et non
des seuls votants) atteinte.

## Déclencheur

Une proposition est passée au statut `review` (UC-EPI-01 étape 9 ou UC-EPI-04) ;
le membre ouvre l'atelier et suit « Voter / voir ».

## Préconditions

- Le membre a une session ouverte et porte le rôle `epistemiarque`.
- La proposition existe et est au statut `review`.

## Garanties en cas de succès

- Le bulletin du membre est enregistré (un seul par membre et par proposition,
  modifiable tant que le vote est ouvert), avec son commentaire rogné.
- Le décompte renvoyé et affiché est recalculé contre l'électorat **courant**.

## Garanties minimales (en cas d'échec)

- Aucun bulletin n'est enregistré pour un non-membre, pour une valeur hors
  `{pour, contre, abstention}` ou pour une proposition qui n'est pas au vote.
- Un bulletin n'est jamais compté deux fois.

## Scénario nominal

1. Le membre ouvre `#/epistemiarque` ; la section « Compétences au vote »
   (réponse de `GET /api/competences/drafts`, statut `review`) liste chaque
   proposition avec sa puce de décompte « pour/seuil pour · issue » et le
   lien « Voter / voir ». La liste seule est aussi servie par
   `GET /api/competences/proposals`.
2. Il ouvre `#/epistemiarque/proposition/{id}` : le site appelle
   `GET /api/competences/proposals/{id}`, qui renvoie le contenu proposé, la
   version en vigueur (`baseVersion`, `baseContent`), le décompte (`tally`) et
   les bulletins (`votes` : membre, nom affiché, vote, commentaire, date —
   triés par date de **dernière modification** `updated_at` : un membre qui
   change son vote passe en fin de liste).
3. Le site affiche l'en-tête (code, nom, semver, « au vote »), le lien
   « Débattre sur Decidim » (fil joint ou espace général), les **changements
   proposés** (nom, définition, argument employeur : seuls les champs
   modifiés), le **décompte** (voix pour / seuil requis, taille de
   l'électorat, barre de progression, compteurs pour / contre / abstention /
   n'ont pas voté), les **votes exprimés** et la section « Mon vote ».
4. Le membre saisit un commentaire facultatif et clique « Pour », « Contre »
   ou « Abstention » : `POST /api/competences/proposals/{id}/votes`
   `{vote, comment}` avec le jeton CSRF.
5. Le serveur vérifie la valeur du bulletin, que la proposition existe et est
   au vote, enregistre le bulletin (insertion ou remplacement), puis renvoie
   `{tally}` recalculé contre l'électorat courant.
6. Le site recharge la proposition : « Mon vote (actuel : Pour) », son
   bulletin dans la liste, le décompte à jour ; si la majorité est atteinte,
   la section « Décision » annonce « Majorité atteinte : la compétence peut
   être entérinée. » (UC-EPI-03).

## Scénarios alternatifs

- **A1 — Changer son vote** (étape 4) : un nouveau clic remplace le bulletin
  précédent (upsert), commentaire compris ; il n'y a jamais deux bulletins du
  même membre.
- **A2 — Majorité « contre »** (étape 5) : dès que les « contre » atteignent le
  seuil, l'issue devient `rejected` (« Décompte — rejetée ») ; la publication
  est refusée (UC-EPI-03 E1). Le vote reste ouvert : un membre peut encore
  changer d'avis, ou un membre (ou un administrateur) retirer la proposition
  (UC-EPI-01 A1) — aucune restriction à l'auteur, ni côté API ni côté IHM.
- **A3 — L'électorat change pendant le vote** (étape 5) : un membre qui perd le
  rôle cesse aussitôt de compter : son bulletin est écarté du décompte et de
  la liste et il ne peut plus voter (`403`) ; un membre qui supprime son
  compte (purge réelle, `DELETE /api/auth/account`) voit son bulletin
  supprimé en cascade. Le seuil est recalculé (⌊N/2⌋+1) : l'arrivée d'un
  membre le relève d'une voix quand N devient pair (3→4 : 2→3) et le laisse
  inchangé sinon (2→3) ; une adoption acquise peut ainsi être perdue.
- **A4 — Administrateur non membre** (étape 3) : il accède à l'atelier par son
  URL (`#/epistemiarque` : pas d'entrée de menu pour un admin non membre, elle
  est réservée au rôle épistémiarque) et à la page de vote (« Voir le vote »),
  sans boutons de vote (« seuls les membres
  épistémiarques y prennent part ») ; l'API lui refuse le vote (`403`). Un
  compte à la fois admin et épistémiarque vote normalement.
- **A5 — Grain version du référentiel** (étapes 1 à 5, sans IHM) :
  `GET /api/referentiel/proposals`, `GET /api/referentiel/proposals/{id}` (avec
  `diff` structurel contre la dernière version publiée, UC-EPI-04) et
  `POST /api/referentiel/proposals/{id}/votes` appliquent les mêmes règles.

## Scénarios d'erreur

- **E1 — Pas de session** (étapes 1 à 4) : `401` sur la consultation et le vote.
- **E2 — Rôle absent** (étapes 1 à 4) : `403` ; la consultation est ouverte aux
  rôles `epistemiarque` et `admin`, le vote au seul rôle `epistemiarque`.
- **E3 — Bulletin invalide** (étape 5) : champ `vote` absent ou non textuel →
  `422` (« Champ "vote" requis » ; « Field "vote" is required » au grain
  version) ; valeur hors énumération (casse comprise) → `422` avec l'erreur
  `/vote`. Concerne l'API seule : l'IHM ne peut pas émettre de bulletin
  invalide (ses trois boutons envoient `pour`, `contre` ou `abstention`) ; une
  erreur serveur au vote (par exemple `403` après un retrait de rôle) est
  affichée telle quelle, sans rechargement.
- **E4 — Proposition inconnue ou close** (étapes 2 et 5) : consultation d'une
  version qui n'est pas au vote (brouillon, publiée, inconnue) → `404`
  « Proposition introuvable » (« Unknown proposal ») ; vote sur une version
  inconnue → `404`, sur un brouillon ou une version publiée (par exemple
  retirée entre-temps) → `409` ; le site affiche le message ou le lien
  « Retour à l'atelier ».
- **E5 — Électorat vide** (étape 3) : aucun compte ne porte le rôle ; le
  décompte est `blocked` (seuil nul) ; le site affiche « Aucun compte ne porte
  le rôle épistémiarque : personne ne peut valider. » ; aucun vote possible.
- **E6 — Corps non JSON** (étape 5) : `400`.
- **E8 — Commentaire trop long** (étape 5) : aucune borne côté API ; au-delà
  de 65 535 octets (colonne `TEXT`), `500` « Internal error » en MySQL strict
  (anomalie AN1).
- **E7 — Jeton CSRF absent** (étape 4) : `403`, aucun bulletin.

## Règles de gestion

- **RG1** — L'électorat est l'ensemble des comptes portant **actuellement** le
  rôle `epistemiarque` ; il est recalculé à chaque lecture et partagé par les
  deux grains (`Electorate`). Le filtre `deleted_at IS NULL` est défensif : la
  suppression de compte est une purge réelle (le compte disparaît).
- **RG2** — Majorité des **membres** : seuil = ⌊N/2⌋ + 1 de l'électorat
  (1→1, 2→2, 3→2, 4→3…) ; abstentions et non-votants rendent le passage plus
  difficile.
- **RG3** — Issue : `adopted` dès que « pour » ≥ seuil ; `rejected` dès que
  « contre » ≥ seuil ; `pending` sinon ; `blocked` si N = 0. `reached` ⇔
  `adopted`. `notVoted` = max(0, N − votants).
- **RG4** — Un bulletin par membre et par proposition (clé unique), modifiable
  tant que la proposition est au vote ; commentaire rogné, vide → `NULL`.
- **RG5** — Seuls les bulletins des membres courants comptent et sont listés.
- **RG6** — Chaque retrait ou resoumission efface les bulletins (UC-EPI-01 RG6).
- **RG7** — Voter est un acte de membre : l'administrateur facilite (il peut
  soumettre et entériner) mais ne vote pas et ne compte pas dans l'électorat.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Bulletin (vote, commentaire) | Nominatif, visible des épistémiarques et administrateurs (nom affiché) ; commentaire libre |
| Compte supprimé | Purge réelle (`DELETE`) : ses bulletins sont supprimés en cascade (FK `ON DELETE CASCADE`), il sort de l'électorat. Le marqueur `deleted_at` n'est jamais posé par la production (filtre défensif seulement) |
| Journalisation | Aucune entrée d'audit dédiée au vote |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/EpistemiarqueView.jsx` — `AtelierSection` (propositions au vote), `PropositionSection`, `TallyPanel`, `TallyChip`, `CompetenceChange`, `voteLabel`, `outcomeShort`, `outcomeMessage` | Page de vote, décompte, décision |
| Front | `web/src/views/epistemiarque/competence-api.js` — `getProposal`, `vote` ; `listProposals` (non utilisé par la vue : l'atelier lit `competences/drafts`) | Client grain compétence |
| Front | `web/src/views/epistemiarque/api.js` — `listProposals`, `getProposal`, `vote` | Client grain version (non branché sur une vue) |
| API | `api/src/routes/competences.php` — `GET /competences/proposals[/{id}]`, `POST /competences/proposals/{id}/votes` | Consultation (épistémiarque ou admin), vote (membre) |
| API | `api/src/routes/referentiel.php` — `GET /referentiel/proposals[/{id}]`, `POST /referentiel/proposals/{id}/votes` | Idem au grain version, avec `diff` |
| API | `api/src/Referentiel/RoleGuard.php` — `any('epistemiarque')` vs `any('epistemiarque', 'admin')` | Garde du vote / de la consultation |
| Domaine | `api/src/Referentiel/MajorityTally.php` | Règle de majorité (pure) |
| Domaine | `api/src/Referentiel/Electorate.php` | Corps électoral courant |
| Domaine | `api/src/Referentiel/CompetenceGovernance.php` — `castVote`, `tally`, `votes` | Bulletins au grain compétence |
| Domaine | `api/src/Referentiel/ReferentielGovernance.php` — `castVote`, `tally`, `votes`, `electorateIds`, `electorateSize` | Bulletins au grain version |
| Domaine | `api/src/Referentiel/ReferentielDiff.php` — `compute` | Diff structurel de la proposition (A5) |
| Domaine | `api/src/Referentiel/CompetenceRepository.php` — `findById`, `latestPublished` | Proposition et version en vigueur (`baseVersion`, `baseContent`, étape 2) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-EPI-02-U01 | `MajorityTally::compute` | Seuil ⌊N/2⌋+1 pour N = 1…6 et 61 ; forme du décompte (RG2) | `api/tests/UseCases/Unit/UcEpi02VoterPropositionTest.php` |
| UC-EPI-02-U02 | `MajorityTally::compute` | Adoptée, rejetée, en cours (abstentions/non-votants), bloquée (RG3) | idem |
| UC-EPI-02-U03 | `Electorate`, `ReferentielGovernance::electorateIds/Size` | Rôle courant, admins exclus, recalcul ; `deleted_at` exclu (branche défensive) (RG1) | idem |
| UC-EPI-02-U04 | `CompetenceGovernance::castVote` | 422 `/vote`, inconnue → null, upsert, commentaire rogné (relu en base), vide → NULL, hors vote → 409 (RG4) | idem |
| UC-EPI-02-U05 | `CompetenceGovernance::tally` | Seuil recalculé : 3→4 membres fait passer le seuil de 2 à 3 (adoption perdue) ; bulletin d'ex-membre écarté ; 3→2 membres, seuil inchangé (RG2, RG5) | idem |
| UC-EPI-02-U06 | `CompetenceGovernance::votes` | Membres courants, nom, commentaire, ordre de dernière modification (`updated_at`) | idem |
| UC-EPI-02-U07 | `ReferentielGovernance` | Mêmes règles au grain version (422, null, upsert, commentaire rogné, ex-membre, 409 après retrait) | idem |
| UC-EPI-02-U08 | `createCompetenceApi` | Liste, détail, vote (commentaire null par défaut) | `web/test/usecases/unit/uc-epi-02-voter-proposition.test.jsx` |
| UC-EPI-02-U09 | `createEpistemiarqueApi` | Mêmes routes sous `referentiel/proposals` | idem |
| UC-EPI-02-U10 | `TallyPanel` (vue isolée) | Voix/seuil, électorat (singulier/pluriel), barre de progression, compteurs | idem |
| UC-EPI-02-U11 | `outcomeMessage`, section Décision | Messages « en cours », « rejetée », « bloquée », sans bouton d'entérinement | idem |
| UC-EPI-02-U12 | `CompetenceChange` | Champs modifiés seulement ; première version ; aucun changement textuel | idem |
| UC-EPI-02-U13 | « Mon vote », votes exprimés | Vote courant du membre ; admin non membre sans boutons | idem |
| UC-EPI-02-U14 | `TallyChip`, `AtelierSection` | Puce « 2/2 pour · majorité atteinte », « 0/— · aucun électeur » ; « Voir le vote » pour un non-membre | idem |
| UC-EPI-02-U15 | `RoleGuard::any('epistemiarque')` / `any('epistemiarque', 'admin')` | 401 sans session ; admin seul : vote 403, consultation admise ; membre (id en chaîne) et admin + membre admis ; `deleted_at` refusé (défensif) | `api/tests/UseCases/Unit/UcEpi02VoterPropositionTest.php` |
| UC-EPI-02-U16 | `PropositionSection` (lien Decidim) | Fil joint : `href` du fil et « (fil joint) » ; sans lien : espace Decidim général, sans mention | `web/test/usecases/unit/uc-epi-02-voter-proposition.test.jsx` |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-EPI-02-F01 | Nominal | API | Liste et détail (version en vigueur, lien Decidim), vote commenté, majorité à 2/3, bulletins nominatifs | `api/tests/UseCases/Functional/UcEpi02VoterPropositionTest.php` |
| UC-EPI-02-F02 | A1 | API | Changement de vote : un seul bulletin, commentaire remplacé | idem |
| UC-EPI-02-F03 | A2 | API | Majorité contre → `rejected`, publication 409 ; vote toujours ouvert | idem |
| UC-EPI-02-F04 | A3 | API | Nouveau membre : 4 membres, seuil 2→3, adoption perdue ; rôle retiré : bulletin écarté, seuil 2, vote refusé ; vote du nouveau membre compté | idem |
| UC-EPI-02-F05 | A4 | API | Admin : consultation 200, vote 403 ; admin + membre vote | idem |
| UC-EPI-02-F06 | A5 | API | Grain version : liste, détail avec `diff` (renommage), votes jusqu'à `adopted` | idem |
| UC-EPI-02-F07 | E1 | API | 401 sur les 6 routes des deux grains | idem |
| UC-EPI-02-F08 | E2 | API | 403 pour un compte sans rôle épistémiarque (liste, détail, vote, aux deux grains), aucun bulletin | idem |
| UC-EPI-02-F09 | E3, E6 | API | 422 vote absent / non textuel / hors énumération, 400 non JSON, aux deux grains (version bien au vote), aucun bulletin | idem |
| UC-EPI-02-F10 | E4 | API | 404 consultation hors vote (« Proposition introuvable » / « Unknown proposal ») ; vote 404 (inconnue) / 409 (brouillon, publiée), aux deux grains ; aucun bulletin | idem |
| UC-EPI-02-F11 | E7 | API | Sans jeton CSRF → 403, aucun bulletin | idem |
| UC-EPI-02-F12 | E5 | API | Électorat vide → `blocked`, seuil nul, vote impossible | idem |
| UC-EPI-02-F13 | Nominal | IHM | `<App/>` : puce, « Voter / voir », changements, décompte, vote commenté (CSRF), « Mon vote », majorité atteinte | `web/test/usecases/functional/uc-epi-02-voter-proposition.test.jsx` |
| UC-EPI-02-F14 | A1 | IHM | Pour puis Contre : « Mon vote (actuel : Contre) », deux POST envoyés, décompte affiché à jour (l'unicité du bulletin est prouvée côté API par F02) | idem |
| UC-EPI-02-F15 | A2 | IHM | « Décompte — rejetée », pas de bouton d'entérinement | idem |
| UC-EPI-02-F16 | A4 | IHM | Admin : « Voir le vote », pas de boutons, message aux non-membres | idem |
| UC-EPI-02-F17 | E4 | IHM | Proposition retirée entre-temps → message 409 ; inconnue → 404 et retour à l'atelier | idem |
| UC-EPI-02-F18 | E5 | IHM | « aucun électeur » dans l'atelier et sur la page de vote | idem |
| UC-EPI-02-F19 | A3, E2 | IHM | Rôle perdu pendant la consultation : vote refusé (403 « Forbidden », message anglais affiché tel quel, AN2), un seul POST, pas de rechargement, boutons réactivés | idem |
| UC-EPI-02-F20 | A3 | API | Purge de compte (`DELETE /api/auth/account`, 204) : bulletin supprimé en cascade, électorat 2, adoption perdue ; ancienne session → 401 (CSRF 403 sur mutation) | `api/tests/UseCases/Functional/UcEpi02VoterPropositionTest.php` |
| UC-EPI-02-F21 | E8, AN1 | API | Commentaire de 70 000 caractères → 500 « Internal error », aucun bulletin, aux deux grains (comportement figé) | idem |

### Tests existants liés (non-régression)

- `api/tests/ReferentielGovernanceTest.php` — majorité des membres, rejet, électorat vide, ex-membre, changement de vote, tour vierge, vote hors review, valeur invalide.
- `api/tests/CompetenceGovernanceTest.php` — mêmes règles au grain compétence, vote réservé aux membres (admin 403).
- `api/tests/CompetenceApiTest.php` — cycle complet avec vote (session simulée).
- `api/tests/ReferentielAuthzTest.php` — garde du vote au grain version.
- `web/src/views/EpistemiarqueView.test.jsx` — décompte, changement proposé, vote.
- `api/tests/RgpdAuditTest.php` — `competence_votes.user_id` et `referentiel_votes.user_id` en `CASCADE` à la purge.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcEpi02 --testdox
cd web && npx vitest run test/usecases/unit/uc-epi-02 test/usecases/functional/uc-epi-02
```

## Anomalies constatées

- **AN1 — Commentaire de vote non borné.** Les routes de vote
  (`competences.php`, `referentiel.php`) ne contrôlent que le type du
  commentaire, stocké en `TEXT` (65 535 octets). Au-delà, MySQL 8 en mode
  strict (défaut de `docker-compose`, aucune surcharge de `sql_mode` dans
  `Db.php`) lève une `PDOException` : réponse `500` « Internal error » au lieu
  d'un `422`, aucun bulletin. En mode non strict (selon la configuration de
  l'hébergement), le commentaire serait tronqué en silence. Figé par
  UC-EPI-02-F21, à inverser en `422` quand une borne sera ajoutée.
- **AN2 — Refus de la garde en anglais.** Un vote refusé par `RoleGuard`
  (`{"error": "Forbidden"}`) est affiché tel quel par la page de vote
  (convention « UI en français » ; même anomalie que UC-EPI-01 AN2). Figé par
  UC-EPI-02-F19.

## Limites

- **L1** — Pas d'IHM de vote au grain version : `web/src/views/epistemiarque/api.js`
  n'est importé par aucune vue (UC-EPI-04 L1).
- **L2** — Aucune clôture automatique du vote : une proposition `rejected`
  reste au statut `review` jusqu'à son retrait ; une proposition `adopted` doit
  être entérinée explicitement (UC-EPI-03).
