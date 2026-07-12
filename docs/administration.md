# Administration (P12.1)

Module d'administration de humanome.xyz : cahier des charges §3.8 (rôle
administrateur), §4.10 (module administration), §6 (RGPD) et §7 (modèle
économique / Golden Prompt). Livré au jalon M9.

L'administration se présente sous deux formes complémentaires :

1. **Une UI d'administration** (`#/admin`), servie par une **API SESSION admin**
   (`RequireRole::any('admin')`), pour les opérations courantes : rôles, Golden
   Prompt, réglages.
2. **Un fichier de configuration versionnable** (`api/config/app.php`) pour la
   configuration serveur — conforme à la note du cahier « une interface
   d'administration simple (un fichier de configuration édité à la main) suffit
   en v1 ».

> ⚠️ Ne pas confondre avec l'outillage de **déploiement** (`routes/system.php`,
> `routes/packages.php`, `routes/worker.php`) protégé par le jeton
> `X-Migrate-Token` (ADR-008, script de déploiement uniquement) :
> `POST /api/admin/migrate`, `/api/admin/grant-role`, `/api/admin/default-package`,
> `/api/admin/import-*`, `/api/admin/worker-tick`. Ces routes existent pour le
> pilotage hors-navigateur d'un hébergement sans SSH ; l'UI d'administration,
> elle, s'appuie sur une **vraie session** avec le rôle `admin` et le CSRF.

Le rôle `admin` **n'est pas un super-rôle implicite** ailleurs dans
l'application (voir `docs/autorisations.md`) : les routes `/api/admin/*` de
session ci-dessous sont l'unique surface d'administration.

---

## 1. Rôles — comptes et attribution

Section `#/admin/roles`. Permet de lister les comptes et leurs rôles, puis
d'attribuer ou de retirer les **rôles du référentiel §2** (`apprenant`,
`cartographe`, `promptologue`, `epistemiarque`, `employeur`, `etablissement`,
`admin` — le « visiteur » est l'absence de session, jamais un rôle attribuable).

| Méthode | Route | Effet |
|---|---|---|
| `GET` | `/api/admin/users?query=&page=` | Comptes + rôles, recherche e-mail/nom, pagination (20/page). |
| `POST` | `/api/admin/users/{id}/roles` `{role}` | Attribue un rôle (idempotent). |
| `DELETE` | `/api/admin/users/{id}/roles/{role}` | Retire un rôle (idempotent). |

- Les rôles sont relus en base **à chaque requête** : un changement de rôle est
  effectif immédiatement (aucune reconnexion nécessaire).
- **Anti-verrouillage** : un administrateur **ne peut pas retirer son propre
  rôle admin** (409). La plateforme conserve donc toujours au moins
  l'administrateur agissant. Un admin peut retirer le rôle admin d'un *autre*
  compte, et peut retirer un rôle *non-admin* de lui-même. L'UI masque le
  bouton de retrait correspondant (🔒).
- **Audit (§6.5)** : chaque attribution/retrait laisse un événement
  (`role_granted` / `role_revoked`) contenant l'identifiant cible et le nom du
  rôle (valeur du référentiel §2, non-PII) — **jamais l'e-mail**. L'acteur est
  l'administrateur de la session (contrairement à l'outillage jeton, qui laisse
  l'acteur nul).

---

## 2. Golden Prompt (cahier §7)

Section `#/admin/golden`. Le **Golden Prompt** est la version « haut de gamme »
du prompt de cartographie, longuement travaillée, gardée **privée** jusqu'à
constitution du capital de la Fondation (cahier §7).

**Modélisation.** Un Golden Prompt est un `prompt_packages` normal, marqué
`is_private = 1` (migration 010). La confidentialité est une propriété du
*paquet* (toutes ses versions la partagent).

**Importé hors git.** Son contenu ne vit **que** dans la base de données ; il
n'est jamais commité dans le dépôt. L'import se fait par
`POST /api/admin/golden {document}` (coller le document prompt-package dans
l'UI). Idempotent par hash de contenu ; une version publiée est immuable (409
si un contenu différent réutilise `(id, version)`). Refuse de masquer un paquet
public partageant le slug (409).

**Jamais exposé.** Tous les chemins de lecture publics du module prompt-package
filtrent `is_private = 0`, donc un Golden Prompt est **structurellement
invisible** :

- `GET /api/prompt-packages` — non listé ;
- `GET /api/prompt-packages/default` — jamais servi comme défaut ;
- `GET /api/prompt-packages/{id}/{version}` — 404 ;
- `POST …/propose-default` (via `isPublished`) — 404, non proposable ;
- lancement de masse (`isPublished`/`findPublished`) — non exécutable ;
- `POST /api/prompt-packages/drafts` (dérivation) — **non dérivable** par un
  promptologue (404 à la source).

**Autorisation au cas par cas.** L'administrateur autorise un promptologue
donné via `POST /api/admin/golden/{id}/grant {userId}` (le compte cible doit
porter le rôle `promptologue`, 422 sinon). L'autorisation est enregistrée dans
`golden_grants` ; `GET /api/admin/golden` liste les Golden et leurs
promptologues autorisés. Audit : `golden_imported`, `golden_access_granted`.

> La *consommation* d'un Golden autorisé (comparaison au banc d'essai
> promptologue, cahier §3.4) se branche sur `golden_grants` — le modèle
> d'autorisation est livré ici ; l'endpoint de lecture contrôlé par grant est un
> ajout ultérieur côté promptologue.

**RGPD (`golden_grants`).** `package_id`/`user_id` en CASCADE (le grant meurt
avec le paquet ou le compte purgé) ; `granted_by` en SET NULL (l'admin peut
être purgé, la trace datée survit sans l'identifier).

---

## 3. Réglages plateforme

Section `#/admin/reglages`. `GET /api/admin/settings` renvoie un instantané
(affichage), et `POST /api/admin/settings/default-package {id, version}` est la
seule écriture de la section.

- **Version de prompt par défaut** (réutilise `settings.default_prompt_package`,
  P10) : le promptologue **propose** (`propose-default`), l'administrateur
  **valide**. La cible doit être **publiée et non-privée** (un Golden ne peut
  jamais devenir le défaut, 404 sinon). L'instantané expose la valeur stockée,
  la proposition en attente, et la résolution effective (défaut = dernier
  publié non-privé). Audit : `default_package_set`.
- **Plafonds démo** : l'UI **affiche** les valeurs effectives (`GET` →
  `config/demo.php` + variables `DEMO_*`). En v1 la démo se règle **par
  environnement** (documenté) ; l'UI ne les édite pas (`editableInUi: false`).
- **État du worker de masse** : dérivé de `mass_jobs` — « jobs en file »
  (en attente + en cours), compte par statut, runs actifs, et **dernière
  activité** (`MAX(updated_at)`, approximation du « dernier tick » : les ticks
  ADR-005 ne tiennent pas de journal, ils ne renvoient que des compteurs).

---

## 4. Configuration serveur versionnable (`api/config/app.php`)

Section `#/admin/config`. Le fichier `api/config/app.php` documente, en un seul
endroit versionné, les variables d'environnement lues par l'application et
leurs valeurs par défaut. Chaque valeur est surchargeable par variable
d'environnement (`~/app/shared/.env` hors webroot en prod ; `docker-compose.yml`
en dev) — la variable, si non vide, gagne.

**Le fichier ne contient jamais de secret.** Les secrets (mot de passe MySQL,
`ANTHROPIC_API_KEY`, `MIGRATE_TOKEN`, `POW_SECRET`, `SODIUM_MASTER_KEY`) et le
**Golden Prompt** restent hors git, dans `~/app/shared/.env` et la base. Pour
les entrées secrètes, `GET /api/admin/settings` et l'UI n'exposent que l'état
`configuré`/`absent`, **jamais la valeur**.

---

## Migration 010

`scripts/migrations/010_admin_golden.sql` (forward-only, expand — ADR-008) :

- `ALTER TABLE prompt_packages ADD COLUMN is_private TINYINT(1) NOT NULL
  DEFAULT 0` : tous les paquets existants restent publics ; seul l'import
  Golden pose `is_private = 1`.
- `CREATE TABLE golden_grants (package_id, user_id, granted_by, created_at)`.

## Tests

- PHP : `AdminUsersTest` (liste/recherche/pagination, grant/revoke, garde de
  rôle 401/403, anti-verrouillage, audit), `AdminGoldenTest` (import privé,
  **non-exposition sur les 5 chemins publics**, grant promptologue, audit),
  `AdminSettingsTest` (instantané, défaut publié/non-privé, secrets masqués).
- Web : `AdminView.test.jsx` (garde de rôle), `admin/RolesSection.test.jsx`
  (tableau, attribution, retrait, anti-verrouillage).
