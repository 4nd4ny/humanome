# UC-ADM-03 — Valider le paquet par défaut et les réglages

| Champ | Valeur |
|---|---|
| **Acteur principal** | Administrateur |
| **Acteurs secondaires** | Promptologue (auteur de la proposition, UC-PRO-04) ; apprenants et lanceur de runs (reçoivent la version par défaut, UC-PRO-01 / UC-APP-02) |
| **Portée** | humanome.xyz — section `#/admin/reglages` ; API de session admin `GET /api/admin/settings`, `POST /api/admin/settings/default-package` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.8 et §4.10 (interface d'administration simple), §4.3 (versions de prompts sélectionnables), §7 (Golden Prompt privé) ; plan P10 point 5 (« proposition promptologue + validation admin ») ; `docs/administration.md` §3 |
| **Statut** | Implémenté (P10 proposition, P12.1 validation en session admin) |

## Objectif

Permettre à l'administrateur de **décider** quelle version publiée de paquet
de prompts est proposée par défaut aux apprenants — le plus souvent en
validant la proposition d'un promptologue — et de lire l'instantané des
réglages de la plateforme (paquet par défaut, état du worker de masse).

## Déclencheur

L'administrateur ouvre `#/admin/reglages` (carte « Réglages » de l'accueil de
l'administration), typiquement après une proposition de promptologue.

## Préconditions

- Session ouverte portant le rôle `admin` (UC-CPT-02, UC-ADM-01).
- Au moins une version publiée et non privée (UC-PRO-03, ou import de
  déploiement UC-SYS-02).

## Garanties en cas de succès

- Le réglage `default_prompt_package = {id, version, validatedAt}` est écrit ;
  `GET /api/prompt-packages/default` sert désormais cette version, quelles
  que soient les publications ultérieures.
- Une proposition en attente portant la **même** version est consommée.
- Un événement d'audit `default_package_set {id, version}` est écrit au nom
  de l'administrateur.

## Garanties minimales (en cas d'échec)

- Le défaut servi et la proposition restent inchangés ; aucun audit.
- L'instantané n'expose jamais la valeur d'un secret.

## Scénario nominal

1. L'administrateur ouvre `#/admin/reglages` ; la vue vérifie la session
   (`GET /api/auth/me`) et exige le rôle `admin`.
2. La section charge en parallèle `GET /api/admin/settings`,
   `GET /api/prompt-packages` (liste publique, UC-PRO-01) et
   `GET /api/admin/demo-config` (bloc « Démo publique », UC-ADM-04).
3. Le serveur (garde `RequireRole::any('admin')`) renvoie l'instantané
   `{defaultPackage: {stored, proposal, effective}, demo, worker, config}` ;
   `effective` vaut le défaut validé, sinon la dernière version publiée non
   privée (`null` si aucune).
4. Le bloc « Version de prompt par défaut » affiche « Effectif : *id
   version* (validé) » ou « (dernier publié, par défaut) », et, s'il y en a
   une, « Proposition promptologue en attente : *id version*. ».
5. L'administrateur choisit une version dans « Valider un paquet publié comme
   défaut » (le bouton « Valider comme défaut » reste désactivé sans choix)
   et clique.
6. Le navigateur envoie `POST /api/admin/settings/default-package`
   `{id, version}` avec l'en-tête `X-CSRF-Token`.
7. Le serveur exige `id` et `version` textuels non vides (trimés), vérifie que
   la version est publiée **et non privée**, écrit
   `default_prompt_package = {id, version, validatedAt}`, supprime la
   proposition si elle porte la même version, journalise
   `default_package_set` et répond `200 {id, version, status: "default"}`.
8. L'IHM affiche « Paquet par défaut : *id version*. » et recharge
   l'instantané : « Effectif : *id version* (validé). », plus de proposition
   en attente.
9. Les apprenants (lanceur de runs), l'atelier promptologue et toute lecture
   de `GET /api/prompt-packages/default` reçoivent désormais cette version.

## Scénarios alternatifs

- **A1 — Valider une autre version que la proposition** (étape 7) : le défaut
  est écrit, la proposition (autre version) reste en attente.
- **A2 — Décider sans proposition** (étape 5) : l'administrateur choisit
  librement une version publiée ; une fois validé, le défaut est **épinglé** :
  une publication ultérieure (UC-PRO-03) ne le déplace plus.
- **A3 — Lire l'état du worker de masse** (étape 4) : la section affiche
  « Jobs en file (en attente + en cours) », « Runs actifs », « Dernière
  activité » (`MAX(updated_at)` des jobs, date courte, ou « jamais ») et
  « Terminés / échoués », dérivés de `mass_jobs` / `mass_runs` (ADR-005).
- **A4 — Chemin technique de déploiement** : sans navigateur, le script de
  déploiement peut valider le défaut par `POST /api/admin/default-package`
  (jeton `X-Migrate-Token`, sans session) — cas UC-SYS-02, non rejoué ici.

La configuration serveur (`#/admin/config`, `ConfigSection`, même instantané
`GET /api/admin/settings` → `config`) est décrite par UC-ADM-04 (A4) ; ce cas
vérifie seulement que l'instantané qu'il lit ne contient aucun secret.

## Scénarios d'erreur

- **E1 — Pas administrateur** (étapes 1 et 3) : API → visiteur `401
  {error: "Authentification requise"}`, autre rôle (ex. promptologue) `403
  {error: "Rôle insuffisant"}` ; IHM → « Cet espace est réservé à
  l'administration de la plateforme. », aucune lecture de réglage.
- **E2 — Jeton CSRF absent ou invalide** (étape 6) : `403 {error: "Jeton CSRF
  absent ou invalide"}`.
- **E3 — Champs manquants** (étape 7) : `id` ou `version` absent, blanc ou non
  textuel → `422 {error: "Champs requis : id et version"}`.
- **E4 — Version non éligible** (étape 7) : inconnue, brouillon ou Golden
  privé → `404 {error: "Version publiée introuvable"}` ; l'IHM l'affiche en
  alerte ; défaut, proposition et journal inchangés.
- **E5 — Aucun paquet publié** (étape 4) : « Effectif : aucun paquet
  publié. », la liste de choix est désactivée.

## Règles de gestion

- **RG1** — Décision à deux mains : le promptologue propose (UC-PRO-04),
  l'administrateur décide ; lui seul écrit `default_prompt_package`.
- **RG2** — Seule une version **publiée et non privée** peut devenir le
  défaut (porte `isPublished`) : un Golden Prompt, jamais.
- **RG3** — La validation consomme la proposition de **la même** version et
  elle seule.
- **RG4** — Défaut effectif = défaut validé, sinon dernière publication non
  privée ; un défaut validé est épinglé.
- **RG5** — Journalisation minimale : `default_package_set` ne porte que
  `{id, version}` (§6.5).
- **RG6** — L'instantané est en lecture seule et sans secret : chaque secret
  de `api/config/app.php` n'y figure que sous forme de booléen `configured`.
- **RG7** — `admin` n'est pas un super-rôle : ces routes de session (avec
  CSRF) sont l'unique surface d'administration, distincte de l'outillage de
  déploiement à jeton (ADR-008).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Défaut validé | `settings.default_prompt_package` : `{id, version, validatedAt}` |
| Proposition | `settings.default_prompt_package_proposal` : identifiants seulement, supprimée à la validation de la même version |
| Audit | `default_package_set` : `{id, version}` + id de l'administrateur |
| Secrets de configuration | Jamais exposés : booléen `configured` |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/admin/reglages` |
| Front | `web/src/views/AdminView.jsx` | Garde admin, onglets |
| Front | `web/src/views/admin/ReglagesSection.jsx` — `DefaultPackage`, `onValidate`, tableau du worker | Affichage, choix, validation, rechargement |
| Front | `web/src/views/admin/admin-api.js` — `fetchSettings`, `setDefaultPackage`, `listPublishedPackages`, `frDate` | Appels HTTP, formatage |
| API | `GET /api/admin/settings`, `POST /api/admin/settings/default-package` — `api/src/routes/admin.php` | Orchestration, `422`, mapping `AdminException` |
| API | `api/src/Middleware/RequireRole.php`, `api/src/Middleware/CsrfMiddleware.php` | Rôle admin, CSRF |
| Domaine | `api/src/Admin/PlatformStatus.php` — `setDefaultPackage`, `snapshot` | Validation, instantané (défaut, worker, config) |
| Domaine | `api/src/Admin/AdminException.php` | Erreur `404` typée |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `isPublished`, `latestPublishedAnyPackage` | Porte, repli |
| Domaine | `api/src/Packages/SettingsRepository.php` | Défaut et proposition |
| Domaine | `api/src/Auth/Audit.php` | `default_package_set` |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ADM-03-U01 | `PlatformStatus::setDefaultPackage` | Défaut `{id, version, validatedAt}`, audit (RG5) | `api/tests/UseCases/Unit/UcAdm03ValiderPaquetDefautReglagesTest.php` |
| UC-ADM-03-U02 | `setDefaultPackage` | Proposition de même version consommée, autre conservée (RG3, A1) | idem |
| UC-ADM-03-U03 | `setDefaultPackage`, `AdminException` | Inconnue, brouillon, Golden → 404, rien d'écrit (RG2, E4) | idem |
| UC-ADM-03-U04 | `snapshot` → `defaultPackage` | Rien publié, repli, validé prioritaire, proposition (RG4, E5) | idem |
| UC-ADM-03-U05 | `snapshot` → `worker` | File, statuts, runs actifs, dernière activité (A3) | idem |
| UC-ADM-03-U06 | `snapshot` → `config`, `demo` | Secrets en booléens, aucune valeur (RG6) | idem |
| UC-ADM-03-U07 | `fetchSettings`, `setDefaultPackage` (front) | Routes, corps, jeton CSRF | `web/test/usecases/unit/uc-adm-03-valider-paquet-defaut-reglages.test.js` |
| UC-ADM-03-U08 | `listPublishedPackages`, `frDate` | Repli `[]`, date courte / tiret | idem |
| UC-ADM-03-U09 | `parseHash` | Route `#/admin/reglages` | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ADM-03-F01 | Nominal | API | Proposition lue, validée (id trimé), consommée ; défaut servi changé ; audit | `api/tests/UseCases/Functional/UcAdm03ValiderPaquetDefautReglagesTest.php` |
| UC-ADM-03-F02 | A1 | API | Autre version validée, proposition conservée | idem |
| UC-ADM-03-F03 | A2 | API | Défaut épinglé malgré une publication ultérieure | idem |
| UC-ADM-03-F04 | A3 + RG6 | API | Instantané : worker, secrets `configured`, aucune valeur secrète dans la réponse | idem |
| UC-ADM-03-F05 | E1, E2 | API | 401 visiteur, 403 promptologue (lecture et écriture), 403 CSRF | idem |
| UC-ADM-03-F06 | E3 | API | 422 pour id/version manquants, blancs, non textuels | idem |
| UC-ADM-03-F07 | E4 | API | Inconnue, brouillon, Golden → 404 ; défaut et journal inchangés | idem |
| UC-ADM-03-F08 | Nominal | IHM | `<App/>` : effectif, proposition, bouton désactivé puis validation (CSRF), rechargement « (validé) » | `web/test/usecases/functional/uc-adm-03-valider-paquet-defaut-reglages.test.jsx` |
| UC-ADM-03-F09 | E4 | IHM | 404 serveur → alerte, rien de validé | idem |
| UC-ADM-03-F10 | E5 | IHM | « aucun paquet publié », choix désactivé | idem |
| UC-ADM-03-F11 | E1 | IHM | Promptologue : explication du rôle, aucune lecture `/api/admin/*` | idem |
| UC-ADM-03-F12 | A3 | IHM | Tableau du worker (file, runs actifs, dernière activité, terminés / échoués) | idem |

### Tests existants liés (non-régression)

- `api/tests/AdminSettingsTest.php` — garde, forme de l'instantané, validation,
  refus des versions non publiées et du Golden.
- `api/tests/PackagesDefaultTest.php` — `testAdminValidationSetsTheServedDefault`
  (chemin technique à jeton, UC-SYS-02).
- `web/src/views/admin/ReglagesSection.test.jsx`, `web/src/views/AdminView.test.jsx`.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcAdm03 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-ADM-03
```

## Limites

- **L1** — Aucun moyen (IHM ou API de session) de **retirer** un défaut
  validé pour revenir au repli « dernière publication » : il ne peut qu'être
  remplacé par une autre version.
- **L2** — Deux chemins écrivent le même réglage : la route de session
  (auditée, `default_package_set`) et la route de déploiement à jeton
  `POST /api/admin/default-package` (UC-SYS-02), qui n'écrit **pas**
  d'événement d'audit.
- **L3** — La liste de choix reprend toutes les versions publiques, y compris
  celles d'un paquet réservé (`twin6-ouverte`) : rien n'empêche d'en faire le
  défaut. Elle ne présélectionne pas la version proposée.
- L'instantané `demo` est obsolète (`editableInUi: false`) : voir UC-ADM-04,
  AN-1.
