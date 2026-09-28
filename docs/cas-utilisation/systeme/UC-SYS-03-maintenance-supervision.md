# UC-SYS-03 — Maintenance et supervision technique

| Champ | Valeur |
|---|---|
| **Acteur principal** | Système d'exploitation de la plateforme : sonde de supervision (santé), planificateur externe (maintenance quotidienne), mainteneur (scripts CLI) |
| **Acteurs secondaires** | Administrateur (lit le monitoring, UC-ADM-06) ; employeurs et apprenants (liens de partage purgés, UC-APP-05 / UC-EMP-01) ; visiteurs de la démo (compteurs, UC-VIS-03) |
| **Portée** | `GET /api/health`, `GET /api/status` (publics), `POST /api/admin/maintenance` (jeton `X-Migrate-Token`), en-têtes de sécurité de toute l'API, `scripts/maintenance.php`, `scripts/rgpd-audit.php` |
| **Niveau** | Sous-fonction technique (exploitation) |
| **Cahier des charges** | §5 (mutualisé OVH), §6.3 (effacement vérifiable), §6.5 (compteurs, jamais de contenu) ; ADR-005, ADR-008 ; `docs/deploiement.md` (tâches planifiées, santé), `docs/hebergement.md`, `docs/rgpd-verification.md`, `docs/securite-checklist.md` |
| **Statut** | Implémenté (P12.2, P12.3, P13.6) |

## Objectif

Garder la plateforme saine et observable sur un hébergement **sans cron ni
SSH** : exposer une santé technique consultable par n'importe quelle sonde,
appliquer périodiquement la politique d'expiration des liens de partage et
remettre à zéro les compteurs de la démo, garantir des en-têtes de sécurité
sur toute réponse de l'API, et permettre au mainteneur de **prouver** la
couverture RGPD de l'effacement de compte.

## Déclencheur

- Une sonde (ou le smoke de déploiement, UC-SYS-02) interroge `/api/health` ou
  `/api/status`.
- Un planificateur externe appelle `POST /api/admin/maintenance` (fréquence
  recommandée : quotidienne) ; sur une offre avec cron, `php
  scripts/maintenance.php`.
- Le mainteneur lance `php scripts/rgpd-audit.php [user_id]` sur une base.

## Préconditions

- Pour la maintenance par HTTP : `MIGRATE_TOKEN` configuré côté serveur et
  connu du planificateur (jamais en query string).
- Pour les scripts CLI : variables `DB_*` disponibles (environnement ou
  `.env` de `HUMANOME_SHARED_DIR`, `../shared` ou `api/`).
- Les sondes de santé n'ont besoin d'aucune session ni d'aucun jeton.

## Garanties en cas de succès

- `/api/health` et `/api/status` répondent `200` avec un diagnostic, jamais un
  secret.
- La maintenance a supprimé les liens de partage morts depuis plus de 30 jours,
  les compteurs de démo des jours UTC passés et les défis de preuve de travail
  expirés, et renvoie des **compteurs** seulement.
- Toute réponse de l'API porte les en-têtes durcis.
- Le rapport RGPD liste, pour un compte, ses données par table avec la règle de
  suppression et la couverture d'export ; il signale toute colonne
  utilisateur non gouvernée par une clé étrangère.

## Garanties minimales (en cas d'échec)

- Les sondes ne tombent jamais : une base absente ou injoignable se lit
  `db: "unconfigured"` / `"error"` avec un statut `200`.
- Une maintenance en échec répond `500` générique (détail dans le journal
  serveur) ; les suppressions déjà faites restent acquises (trois requêtes
  sans transaction commune) et un nouvel appel reprend sans risque
  (idempotence).
- Aucune erreur ne divulgue de détail SQL.

## Scénario nominal

1. La sonde appelle `GET /api/health` : l'API renvoie `200 {"status":"ok",
   "version":…, "db":"ok"}` — la version vient de `APP_VERSION`, sinon du
   fichier `VERSION` de la release, sinon `dev` ; la base est testée par
   `SELECT 1`.
2. La page de santé appelle `GET /api/status` : `200 {status, version, db,
   demo: {enabled, remainingToday}, worker: {lastActivityAt, queued}}`, avec
   `Cache-Control: public, max-age=30`. `demo.enabled` suit `DemoConfig`
   (UC-ADM-04) ; `remainingToday` indique si le coupe-circuit journalier
   (tokens ou budget, jour UTC) n'est pas encore atteint ; `worker` donne la
   dernière activité de la file de masse (`MAX(mass_jobs.updated_at)`) et le
   nombre de jobs en attente.
3. Chaque jour, le planificateur appelle `POST /api/admin/maintenance` avec
   `X-Migrate-Token` : la route supprime les `share_links` expirés **ou**
   révoqués depuis plus de 30 jours, les lignes `llm_usage_daily` antérieures au
   jour UTC courant et les `llm_pow_challenges` expirés →
   `200 {shareLinksPurged, demoDaysPruned, powChallengesPruned}`.
4. Un second appel le même jour renvoie des compteurs nuls (idempotent).
5. Sur toutes ces réponses — et sur toutes les autres de l'API, erreurs
   comprises — le middleware `SecurityHeaders` (le plus externe) pose
   `Content-Security-Policy: default-src 'none'; frame-ancestors 'none';
   base-uri 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options:
   DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (tout refusé)
   et `Strict-Transport-Security: max-age=31536000`.

## Scénarios alternatifs

- **A1 — Démo épuisée ou éteinte** (étape 2) : plafond de tokens ou budget du
  jour atteint → `remainingToday: false` ; démo éteinte → `enabled: false`,
  `remainingToday: null`.
- **A2 — Maintenance en ligne de commande** (étape 3) : `php
  scripts/maintenance.php` exécute `Maintenance::run` (source de vérité des
  requêtes, recopiées dans la route) et imprime les mêmes compteurs sur une
  ligne JSON, code de sortie 0.
- **A3 — Audit RGPD** : `php scripts/rgpd-audit.php <user_id>` affiche (1) les
  colonnes identifiant un utilisateur **sans** clé étrangère vers `users`
  (« aucune — … » attendu), (2) la règle `ON DELETE` de chaque référence, (3)
  l'empreinte du compte, table par table, avec la règle de suppression et la
  couverture d'export ; après suppression du compte : « aucune donnée
  rattachée à cet identifiant. ». Sans argument, seul l'audit du schéma est
  produit. Lecture seule ; code de sortie 0, ou 2 si une colonne non gouvernée
  existe.

## Scénarios d'erreur

- **E1 — Base absente ou injoignable** (étapes 1-2) : `200` avec `db:
  "unconfigured"` ou `"error"` ; `/status` renvoie alors `demo: {enabled:
  false, remainingToday: null}` et `worker: {lastActivityAt: null, queued:
  null}`.
- **E2 — Jeton de maintenance** (étape 3) : non configuré → `404`, absent ou
  faux → `403`, base non configurée → `503 « Database not configured »`.
- **E3 — Échec de la maintenance** : `500 « Maintenance failed, see server log »`.
- **E4 — Scripts CLI sans base** : message sur la sortie d'erreur (« base de
  données non configurée »), code de sortie 1.

## Règles de gestion

- **RG1** — Les sondes sont publiques, sans session, et ne renvoient ni
  secret ni détail d'erreur ; elles ne peuvent pas échouer à cause de la base.
- **RG2** — Politique d'expiration : un lien de partage est illisible dès son
  expiration ou sa révocation (appliqué à la lecture, UC-EMP-01) ; la
  maintenance ne fait que **purger** les lignes mortes au-delà d'une grâce de
  30 jours (`Maintenance::SHARE_LINK_GRACE_DAYS`). Aucune maintenance n'est
  nécessaire à la **correction** du service.
- **RG3** — Les compteurs de démo sont indexés par jour UTC : le coupe-circuit
  repart de zéro chaque jour sans intervention ; la ligne du jour n'est jamais
  supprimée (coupe-circuit intact).
- **RG4** — Maintenance idempotente, compteurs seulement (§6.5) ; route et
  script produisent les mêmes effets (requêtes dupliquées, tests croisés).
- **RG5** — `SecurityHeaders` est ajouté en dernier dans `Bootstrap` (donc
  exécuté en premier) : il décore aussi les `401/403` des gardes, les `404/405`
  du routeur et les `500`, et **impose** ses valeurs (remplace un en-tête
  homonyme). Les mêmes valeurs sont dupliquées dans
  `api/deploy/webroot/.htaccess` pour l'hébergement OVH.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Liens de partage morts | Supprimés après 30 jours de grâce (empreintes seulement) |
| Compteurs de démo | Agrégats journaliers sans contenu ; jours passés supprimés |
| Défis de preuve de travail | Empreintes à usage unique ; expirés supprimés |
| Rapport RGPD | Comptages par table, aucune donnée personnelle affichée |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| API | `api/src/routes/system.php` — `GET /health`, `GET /status`, `POST /admin/maintenance` | Sondes, maintenance à jeton |
| Domaine | `api/src/Bootstrap.php` — `version`, ordre des middlewares | Version servie, `SecurityHeaders` le plus externe |
| Domaine | `api/src/Middleware/SecurityHeaders.php` | En-têtes durcis |
| Domaine | `api/src/Llm/UsageCounters.php`, `api/src/Llm/DemoConfig.php` | Coupe-circuit journalier, état de la démo |
| Script | `scripts/maintenance.php` — `Maintenance::run` | Purge (source de vérité), CLI |
| Script | `scripts/rgpd-audit.php` — `RgpdAudit` | Audit du schéma et empreinte d'un compte |
| Serveur | `api/deploy/webroot/.htaccess` | Copie des en-têtes côté Apache (documentée) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-SYS-03-U01 | `Maintenance::run` | Grâce de 30 jours (expiré ou révoqué), liens vivants gardés, idempotent (RG2, RG4) | `api/tests/UseCases/Unit/UcSys03MaintenanceSupervisionTest.php` |
| UC-SYS-03-U02 | `Maintenance::run` | Jours UTC passés supprimés, jour courant gardé, défis expirés, tuteur intact (RG3) | idem |
| UC-SYS-03-U03 | `UsageCounters` | Incrément, coupe-circuit par tokens ou budget, remise à zéro UTC, table blanche | idem |
| UC-SYS-03-U04 | `Bootstrap::version` | `APP_VERSION`, sinon `dev` sans fichier `VERSION` | idem |
| UC-SYS-03-U05 | `SecurityHeaders::process` | Six en-têtes imposés, statut et type conservés (RG5) | idem |
| UC-SYS-03-U06 | `RgpdAudit` | Aucune colonne non gouvernée, règles `ON DELETE`, empreinte vide après purge | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-SYS-03-F01 | Nominal (1-2) | API | `/health` et `/status` exacts (version, base, démo, file du worker, cache) | `api/tests/UseCases/Functional/UcSys03MaintenanceSupervisionTest.php` |
| UC-SYS-03-F02 | A1 | API | Démo épuisée → `remainingToday` faux ; éteinte → `enabled` faux | idem |
| UC-SYS-03-F03 | E1 | API | Base absente / injoignable : `200`, diagnostic, aucun détail SQL | idem |
| UC-SYS-03-F04 | Nominal (3-4) | API | Purge par la route à jeton, compteurs, second appel nul | idem |
| UC-SYS-03-F05 | E2, E3 | API | `404` / `403` / `503` / `500` générique | idem |
| UC-SYS-03-F06 | A2, E4 | CLI | `maintenance.php` : ligne JSON, mêmes effets ; sans base → code 1 | idem |
| UC-SYS-03-F07 | Nominal (5), RG5 | API | En-têtes sur `200`, `401`, `403`, `404`, `405`, `500` | idem |
| UC-SYS-03-F08 | A3 | CLI | `rgpd-audit.php` : schéma sain, empreinte, vide après `DELETE /api/auth/account` | idem |
| UC-SYS-03-F09 | AN-1 | API | Comportement actuel : la maintenance efface l'historique démo du monitoring | idem |

### Tests existants liés (non-régression)

- `api/tests/HealthTest.php`, `api/tests/StatusTest.php`, `api/tests/SystemRoutesTest.php` — sondes.
- `api/tests/MaintenanceTest.php` — classe et route produisent les mêmes effets.
- `api/tests/SecurityHeadersTest.php` — en-têtes sur `200`, `401`, `404`.
- `api/tests/RgpdAuditTest.php` — règles `ON DELETE` attendues, purge d'un compte peuplé.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcSys03 --testdox
```

## Anomalies constatées

- **AN-1 — La maintenance efface l'historique affiché par le monitoring.**
  `Maintenance::run` (et la route) suppriment les lignes `llm_usage_daily`
  des jours passés, conçues à l'origine comme de simples compteurs de
  coupe-circuit. Or le tableau de bord de monitoring (UC-ADM-06), ajouté
  depuis, lit cette même table pour la série quotidienne des tokens de la démo
  (« détecteur d'anomalies ») et pour son coût « tout temps » : après chaque
  maintenance, seul le jour courant subsiste. La table `tuteur_usage_daily`,
  elle, n'est pas purgée (traitement incohérent entre les deux sources).
  Correctif possible : ne purger qu'au-delà d'une rétention (ex. 365 jours,
  comme le journal des connexions). Figé par UC-SYS-03-F09.

## Limites

- L'offre OVH gratuite n'a pas de cron : la maintenance n'a lieu que si un
  planificateur externe appelle la route (non requis pour la correction, RG2).
- `worker.lastActivityAt` est renvoyé au format DATETIME MySQL
  (`AAAA-MM-JJ HH:MM:SS`), contrairement aux dates ISO « T » de l'API d'administration.
- `/status` annonce `demo.enabled: false` quand la base n'est pas configurée,
  même si le fichier active la démo — cohérent avec `POST /api/llm`, qui
  répond alors `503`.
- La préséance réelle entre les en-têtes Apache (`.htaccess`) et ceux posés
  par PHP ne peut être vérifiée qu'en production (note du fichier).
