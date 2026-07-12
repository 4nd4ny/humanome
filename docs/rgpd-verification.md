# Vérification RGPD — suppression, export, journalisation

**Portée :** P12.2 (cahier §6). Croise **chaque table** du schéma (migrations
`001` à `010`) avec (a) son sort à la suppression de compte, (b) sa présence
dans l'export/l'accès de la personne, et documente (c) la minimisation des
journaux. Les garanties sont **prouvées sur la base vivante** par
`scripts/rgpd-audit.php` (introspection `information_schema`) et verrouillées
par `api/tests/RgpdAuditTest.php` + les tests de purge par module.

> **Note de numérotation :** l'énoncé parle des « migrations 001-010 ». Le
> schéma en compte effectivement **dix** (`001`…`010`) : `010_admin_golden.sql`
> (module d'administration P12.1) ajoute la colonne `prompt_packages.is_private`
> et la table `golden_grants`. Toutes deux sont couvertes ci-dessous.

## Méthode

`scripts/rgpd-audit.php` lit, sans liste écrite à la main :

1. **toutes** les colonnes dont le nom identifie un utilisateur (`user_id`,
   `author_id`, `apprenant_id`, `cartographe_id`, `accepted_by`, `created_by`,
   `granted_by`, `etablissement_id`), sur **toutes** les tables ;
2. la règle `ON DELETE` (`DELETE_RULE`) de chaque clé étrangère vers `users`.

Le croisement des deux donne le contrôle décisif : **une colonne identifiant un
utilisateur sans clé étrangère vers `users` survivrait à une purge**. La sortie
actuelle est :

```
== Colonnes identifiant un utilisateur SANS clé étrangère vers users ==
  aucune — toute référence utilisateur est régie par une FK (CASCADE/SET NULL).
```

**Résultat : aucune table oubliée par la purge.** 23 clés étrangères vers
`users`, toutes en `CASCADE` (effacement réel) ou `SET NULL` (anonymisation
documentée).

## (a)+(b) Croisement table par table

Légende **suppression** : `CASCADE` = ligne effacée ; `SET NULL` = identifiant
mis à NULL (anonymisation) ; `chaîne` = effacée via une FK vers une table
elle-même en CASCADE ; `—` = pas de donnée personnelle du titulaire.
Légende **export** : `local` = restituée par l'archive client (source = stores
navigateur) ; `via` = récupérable par un autre point d'accès mais **hors**
archive ; `aucun` = non récupérable par la personne elle-même ; `—` = non
applicable.

| Migration | Table | Personnelle ? | Suppression du compte | Export / accès |
|---|---|---|---|---|
| 001 | `users` | oui (email, nom, empreinte mdp) | **DELETE** direct | `local` (bloc compte) |
| 001 | `roles` | non (référence) | — | — |
| 001 | `user_roles` | oui (rôles) | CASCADE `user_id` | — |
| 002 | `sessions` | oui (session) | CASCADE `user_id` | — |
| 002 | `rate_limits` | non (buckets hachés, sans `user_id`) | — (expire) | — |
| 003 | `referentiel_versions` | non (contenu collectif immuable) | SET NULL `created_by` | — |
| 003 | `prompt_packages` | non (contenu collectif) | — | — |
| 003 | `prompt_versions` | non (contenu collectif) | SET NULL `created_by` | — |
| 004 | `cartographies` | oui (document opt-in + méta) | CASCADE `user_id` | `local` (store cartographies) |
| 004 | `share_links` | empreintes seules (jamais de clair) | chaîne via `cartographies` (validité 90 j déf., 1-365) | `—` (hachages) |
| 005 | `training_progress` | oui (avancement) | CASCADE `user_id` | `local` (store formation) |
| 005 | `user_api_keys` | oui (clé chiffrée) | CASCADE `user_id` | `aucun` (secret, jamais réexporté — choix de conception) |
| 005 | `audit_events` | trace | SET NULL `user_id` (anonymisée) | `—` |
| 006 | `llm_usage_daily` | non (compteurs anonymes) | — (entretien) | — |
| 006 | `llm_pow_challenges` | non (empreintes anti-rejeu) | — (TTL 2 min) | — |
| 007 | `cartographies.run_meta` | oui (compteurs de run) | avec `cartographies` | `local` |
| 008 | `cartographe_invitations` | oui (invitation) | CASCADE `apprenant_id` / SET NULL `accepted_by` | `—` |
| 008 | `cartographe_links` | oui (lien apprenant↔cartographe) | CASCADE (deux côtés) | `—` |
| 008 | `cartography_annotations` | oui (expression du cartographe) | CASCADE `author_id` + chaîne `cartographie_id` | `via` (espace cartographe) |
| 008 | `cartography_revisions` | oui (données de l'apprenant, révisées) | SET NULL `author_id` + chaîne `cartographie_id` | `via` (lien de partage / cartographe) |
| 008 | `cartography_garanties` | oui (signature, nom figé) | CASCADE `cartographe_id` + chaîne | `via` |
| 008 | `settings` | non (config plateforme) | — | — |
| 009 | `cohortes` | oui (côté établissement) | CASCADE `etablissement_id` | `—` |
| 009 | `cohorte_membres` | oui (consentement) | CASCADE `user_id` | `via` (`GET /api/cohortes`) |
| 009 | `cohorte_portfolios` | **oui (texte du portfolio)** | CASCADE `user_id` | `local` (déposé depuis le store local) — voir limite 1 |
| 009 | `etablissement_config` | oui (clé/budget établissement) | CASCADE `user_id` | `aucun` (secret) |
| 009 | `mass_runs` | oui (côté établissement) | CASCADE `etablissement_id` | `—` |
| 009 | `mass_jobs` | **oui (cartographies produites)** | CASCADE `user_id` ; `portfolio_id` SET NULL | `aucun` côté apprenant — voir limite 2 |
| 010 | `prompt_packages.is_private` | non (drapeau) | — | — |
| 010 | `golden_grants` | oui (autorisation d'accès) | CASCADE `user_id` / SET NULL `granted_by` | `—` |

**Conclusion suppression :** toute donnée personnelle du titulaire est soit
réellement effacée (CASCADE / chaîne), soit anonymisée par un `SET NULL`
**documenté et légitime** (trace d'audit, contenu collectif immuable, révision
appartenant à l'apprenant). Vérifié de bout en bout par
`RgpdAuditTest::testEmpreinteEtPurgeSurComptePeuple` (empreinte non vide avant,
strictement vide après) et par les tests de purge de chaque module
(`AuthAccountDeletionTest`, `CartographiesPurgeTest`, `CartographePurgeTest`,
`MasseRgpdPurgeTest`).

## Limites d'accès/portabilité identifiées (pas des bugs de purge)

Ces deux points concernent l'**accès/portabilité** (RGPD art. 15/20), pas
l'effacement (art. 17, qui est complet) : les données ci-dessous **sont bien
purgées** à la suppression du compte, mais leur **récupération par l'apprenant
lui-même** n'est pas offerte par l'archive « un clic ».

1. **`cohorte_portfolios` (texte déposé en cohorte).** Aucun point d'accès
   apprenant ne re-sert le texte déposé (le dépôt est `POST` uniquement).
   Impact atténué : le dépôt provient du **portfolio local** de l'apprenant,
   toujours présent dans son navigateur et couvert par l'archive locale ; le
   dépôt serveur est une copie de traitement transitoire, effacée au départ de
   la cohorte. Récupérabilité de fait : **oui, via la source locale**.

2. **`mass_jobs.document` (cartographies journalières produites en masse).**
   Ces documents « appartiennent à l'apprenant » (le commentaire de la
   migration 009 le dit, et `user_id` est en CASCADE), mais le **seul** point
   d'accès est `GET /api/etablissement/membres/{membreId}/documents`, réservé au
   rôle `etablissement`. **Il n'existe aucun point d'accès apprenant** pour que
   la personne récupère ses propres cartographies de masse. Preuve dans le code
   et les tests : `MasseRgpdPurgeTest::testDepartRetireLAccesDeLEtablissement…`
   affirme « the produced cartography leaves the establishment's reach » au
   départ, « but it stays with the learner » — or *stays* ne signifie pas
   *accessible* : la ligne subsiste en base sans aucune route pour l'apprenant.
   Requête qui l'objective (aucune route apprenant ne la sélectionne) :

   ```sql
   -- Documents de masse d'un apprenant : produits, purgés à la suppression du
   -- compte (user_id CASCADE), mais illisibles par l'apprenant lui-même —
   -- servis UNIQUEMENT à l'établissement (etablissement.php, RequireRole
   -- 'etablissement'). Aucun handler côté rôle 'apprenant' ne fait ce SELECT.
   SELECT j.id, j.day_date
     FROM mass_jobs j
     JOIN mass_runs r ON r.id = j.run_id
    WHERE j.user_id = :apprenant_id AND j.status = 'done';
   ```

   Ce n'est **pas un bug de purge** (la donnée disparaît bien à la suppression
   du compte) et **pas** un manquement à l'effacement. C'est une **lacune de
   portabilité** : un point d'accès apprenant (`GET /api/mes-documents-masse`,
   ou l'intégration au store cartographies pour l'inclure à l'archive) reste à
   ajouter. Hors périmètre du chantier B (ne touche ni le module établissement
   ni le routage) — **signalé** pour le backlog M9/P13. Une fois ajouté, la
   colonne export de `mass_jobs` passerait de `aucun` à `local`/`via`.

## (c) Minimisation des journaux (cahier §6.5)

Revue exhaustive de tous les points de journalisation de `api/src`.

### `error_log` — messages d'exception uniquement

Tous les appels sont de la forme `error_log('[module] ' . $e->getMessage())`
(plus `error_log('[worker-tick] ' . json_encode($counters))` — compteurs
seuls). Ce qui pourrait fuiter par un message d'exception PDO :

- **Valeur d'une contrainte d'unicité en doublon.** MySQL renvoie la valeur
  fautive (`Duplicate entry 'x' for key '…'`). Les clés uniques du schéma sont :
  `users.email` (la **seule** PII), et par ailleurs `roles.name`,
  `referentiel_versions(referentiel_id,semver)`, slugs de paquets,
  `share_links.token_hash`, `cartographe_invitations.code`, `cohortes.code`,
  `etablissement_config.worker_token_hash`, `mass_jobs(run_id,user_id,day_date)`
  — soit des hachages, des codes aléatoires ou des entiers, **non sensibles**.
  Le **seul** `INSERT INTO users` (email) est `Auth\Users::create`, appelé par
  `POST /api/auth/register`, dont le `catch` traite le code `23000`
  (email en doublon) par une réponse **409 sans journalisation** ; le `throw`
  n'atteint jamais un `error_log`. Aucun chemin ne journalise donc un email.
- **Valeurs de paramètres liés.** `Db.php` fixe `PDO::ATTR_EMULATE_PREPARES =
  false` : les paramètres partent séparément de la requête et **n'apparaissent
  jamais** dans le texte de l'exception. Un « data too long / truncated » cite
  le **nom** de la colonne, jamais la valeur.

**Conclusion :** aucun `error_log` ne peut journaliser de contenu de portfolio/
cartographie, de mot de passe, de clé d'API ou de jeton.

### `audit_events` — faits structurés minuscules

Tous les `Audit::record(...)` n'écrivent que des identifiants entiers, des
compteurs et des valeurs de **liste blanche** (`role` parmi les rôles §2 ;
`provider` ∈ {`humanome`,`endpoint`} ; `cause` ∈ {`retrait`,
`nouvelle_revision`}). Jamais d'email, de contenu, de mot de passe, de clé ni de
jeton. Le nouveau `POST /api/admin/maintenance` ne journalise que des compteurs
(liens purgés, jours de démo, défis) en cas de succès, un message d'exception
générique en cas d'échec.

## Entretien périodique (application des durées)

`scripts/maintenance.php` (classe canonique) et `POST /api/admin/maintenance`
(entrée de production, `X-Migrate-Token`, même modèle que le worker-tick —
aucun script shell n'est livré à la release OVH, ADR-008) appliquent :

- **purge des liens de partage morts** au-delà de 30 jours de grâce (`expires_at`
  ou `revoked_at` antérieurs à `NOW() - 30 jours`) — mise en œuvre de la
  politique d'expiration exigée par P12. À distinguer de la **validité** d'un
  lien, fixée par l'apprenant à sa création (`share.php` `expiresInDays` :
  **90 jours par défaut**, bornée à 1-365) ; le lien devient inopérant à
  l'expiration, la purge n'efface que la ligne dormante 30 jours plus tard ;
- **remise à zéro des compteurs démo journaliers** : suppression des lignes
  `llm_usage_daily` des jours UTC passés (la **ligne du jour** est conservée
  pour ne pas réinitialiser le coupe-circuit budgétaire en cours de journée) et
  des défis anti-rejeu expirés.

**Fréquence recommandée : quotidienne** (cron OVH). Idempotent. Couvert par
`api/tests/MaintenanceTest.php` (classe **et** route, effets identiques).
