# UC-PRO-04 — Proposer une version par défaut

| Champ | Valeur |
|---|---|
| **Acteur principal** | Promptologue |
| **Acteurs secondaires** | Administrateur (valide ou non la proposition, UC-ADM-03) ; opérateur de déploiement (peut aussi la valider par `POST /api/admin/default-package`, jeton, UC-SYS-02) ; clients de `GET /api/prompt-packages/default` (servent la version une fois validée — l'assistant de run apprenant ne l'exploite pas encore, voir Limites) |
| **Portée** | humanome.xyz — `POST /api/prompt-packages/{id}/{version}/propose-default` ; bouton « Proposer par défaut » de l'accueil `#/promptologue` |
| **Niveau** | Objectif utilisateur (première moitié d'un circuit à deux mains) |
| **Cahier des charges** | §3.4, §4.3 (versions sélectionnables) ; plan P10 point 5 (« version par défaut proposée aux apprenants : proposition promptologue + validation admin ») ; `docs/autorisations.md` (P10) |
| **Statut** | Implémenté (P10) |

## Objectif

Permettre au promptologue de **proposer** qu'une version publiée devienne la
version désignée par défaut — celle que sert `GET /api/prompt-packages/default`
et que `fetchPromptPackages` marque `defaut: true` —, sans pouvoir l'imposer :
la décision revient à l'administrateur (UC-ADM-03), qui engage la plateforme.

## Déclencheur

Sur l'accueil de l'atelier, le promptologue clique « Proposer par défaut » sur
la ligne d'une version publiée.

## Préconditions

- Session portant le rôle `promptologue`.
- La version visée est **publiée** et non privée (UC-PRO-03).

## Garanties en cas de succès

- La proposition `{id, version, proposedBy, proposedAt}` est enregistrée dans
  le réglage `default_prompt_package_proposal`, en remplaçant toute
  proposition précédente.
- Le paquet par défaut servi aux apprenants (`GET
  /api/prompt-packages/default`) est **inchangé**.
- L'administrateur voit la proposition en attente dans ses réglages.

## Garanties minimales (en cas d'échec)

- Aucune proposition n'est enregistrée : une proposition déjà en attente
  reste intacte, et le défaut servi est inchangé.

## Scénario nominal

1. Sur l'accueil (UC-PRO-01), chaque version publiée qui n'est pas le défaut
   courant offre le bouton « Proposer par défaut ».
2. Le promptologue clique : le navigateur envoie
   `POST /api/prompt-packages/{id}/{version}/propose-default` (sans corps)
   avec l'en-tête `X-CSRF-Token`.
3. Le middleware CSRF global vérifie `X-CSRF-Token` (seulement si un cookie
   de session est présent), puis `RoleGuard` vérifie le rôle `promptologue`
   (`401 {error: "Authentication required"}` / `403 {error: "Forbidden"}`),
   puis la route vérifie par `isPublished` que `(id, version)` est une version
   publiée non privée.
4. Il écrit le réglage `default_prompt_package_proposal = {id, version,
   proposedBy: <compte>, proposedAt: <date ISO 8601>}` et répond
   `200 {id, version, status: "proposed"}`.
5. L'IHM confirme : « Proposition envoyée : *id@version* comme version par
   défaut (validation admin requise). » ; la mention **par défaut** reste sur
   l'ancienne version.
6. L'administrateur retrouve la proposition dans `GET /api/admin/settings`
   (`defaultPackage.proposal`) et dans l'écran Réglages (« Proposition
   promptologue en attente »), puis la valide ou non (UC-ADM-03).

## Scénarios alternatifs

- **A1 — Nouvelle proposition** (étape 4) : une seule proposition est en
  attente à la fois ; toute nouvelle proposition, du même ou d'un autre
  promptologue, remplace la précédente.
- **A2 — Version déjà par défaut ou paquet réservé** (étape 3) : l'API
  accepte aussi la version déjà servie par défaut et une version d'un paquet
  réservé (`twin6-ouverte`) ; l'IHM, elle, ne propose pas le bouton sur la
  ligne du défaut courant.

## Scénarios d'erreur

- **E1 — Garde** (étape 3) : visiteur (sans cookie, donc sans contrôle CSRF)
  `401 {error: "Authentication required"}` ; compte sans rôle `promptologue`
  `403 {error: "Forbidden"}` — y compris l'administrateur (il valide, il ne
  propose pas) ; jeton CSRF absent ou invalide `403 {error: "Jeton CSRF absent
  ou invalide"}`, vérifié **avant** le rôle (un compte sans rôle et sans jeton
  reçoit donc le refus CSRF). L'IHM affiche ces messages tels quels, en
  anglais pour ceux de `RoleGuard` (UC-PRO-02 AN-2).
- **E2 — Version non proposable** (étape 3) : version inconnue, brouillon
  (même le sien) ou Golden privé → `404 {error: "Version publiée
  introuvable"}` ; l'IHM affiche le message.

## Règles de gestion

- **RG1** — Décision à deux mains : le promptologue propose, l'administrateur
  valide ; aucune proposition ne modifie à elle seule le défaut servi.
- **RG2** — Seule une version **publiée et non privée** est proposable
  (porte `isPublished`, qui applique le même filtre `status = published` et
  `is_private = 0` que toutes les lectures publiques) : un Golden Prompt ne
  peut jamais devenir le défaut.
- **RG3** — Emplacement unique : la dernière proposition l'emporte ; elle est
  consommée par une validation de la même version, par l'écran admin
  (UC-ADM-03) ou par la route de déploiement à jeton
  `POST /api/admin/default-package` (UC-SYS-02).
- **RG4** — Un paquet réservé reste proposable (aucune règle ne l'exclut).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Proposition | Réglage `settings.default_prompt_package_proposal` : identifiants seulement (`id`, `version`, `proposedBy` = id de compte, `proposedAt`) ; **non effacée** par la suppression du compte de son auteur (la table `settings` n'a pas de clé étrangère) : elle ne disparaît que remplacée ou consommée (UC-PRO-04-F08) |
| Journal | Aucun événement d'audit n'est écrit à la proposition (voir Limites) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/promptologue/AccueilSection.jsx` — `proposeDefault`, bouton « Proposer par défaut » | Action et message de confirmation |
| Front | `web/src/views/promptologue/api.js` — `proposeDefault` | Appel HTTP |
| Front | `web/src/api/client.js` — `apiFetch`, `ApiError` | Jeton CSRF, message d'erreur affiché en alerte |
| API | `POST /api/prompt-packages/{id}/{version}/propose-default` — `api/src/routes/packages.php` | Garde, porte, écriture |
| API | `api/src/Referentiel/RoleGuard.php`, `api/src/Middleware/CsrfMiddleware.php` | Rôle, CSRF |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `isPublished` | Version proposable |
| Domaine | `api/src/Packages/SettingsRepository.php` — `set`, `DEFAULT_PACKAGE_PROPOSAL` | Emplacement de la proposition |
| API | `GET /api/prompt-packages/default` — `routes/packages.php` ; `PromptPackageRepository::latestPublishedAnyPackage` | Défaut servi (inchangé), `isDefault` de l'IHM |
| API | `GET /api/admin/settings` — `routes/admin.php` ; `PlatformStatus::defaultPackage` | Proposition visible de l'administrateur (étape 6) |

`CsrfMiddleware` est partagé : son test unitaire vit dans UC-CPT-02-U07 ;
`apiFetch` (jeton joint, message d'erreur) dans UC-PRO-03-U09.

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-PRO-04-U01 | `PromptPackageRepository::isPublished` | Publiée (même réservée) oui ; brouillon, inconnue, privée non — préconditions vérifiées en base (RG2, RG4) | `api/tests/UseCases/Unit/UcPro04ProposerVersionDefautTest.php` |
| UC-PRO-04-U02 | `SettingsRepository::set` | Emplacement unique, dernière proposition gagnante (RG3) | idem |
| UC-PRO-04-U03 | `SettingsRepository` | Les deux réglages sont des clés distinctes et indépendantes | idem |
| UC-PRO-04-U04 | `createPromptologueApi.proposeDefault` | `POST` sans corps, segments encodés | `web/test/usecases/unit/uc-pro-04-proposer-version-defaut.test.js` |
| UC-PRO-04-U05 | `AccueilSection` — `proposeDefault`, `isDefault` | Bouton absent sur le défaut ; appel `(id, version)` et message ; message d'erreur, repli « La proposition a échoué. » | idem |
| UC-PRO-04-U06 | `RoleGuard::any('promptologue')` | 401 sans session ; 403 apprenant et admin ; passage promptologue | `api/tests/UseCases/Unit/UcPro04ProposerVersionDefautTest.php` |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-PRO-04-F01 | Nominal, RG1 | API | 200 « proposed », `proposedBy`/`proposedAt`, défaut servi inchangé, proposition visible de l'admin | `api/tests/UseCases/Functional/UcPro04ProposerVersionDefautTest.php` |
| UC-PRO-04-F02 | A1 | API | Une nouvelle proposition remplace la précédente | idem |
| UC-PRO-04-F03 | A2 | API | Défaut courant et paquet réservé acceptés | idem |
| UC-PRO-04-F04 | E1 | API | 401, 403 apprenant, 403 admin (corps `Forbidden`), 403 CSRF (vérifié avant le rôle) ; proposition en attente et défaut intacts | idem |
| UC-PRO-04-F05 | E2 | API | Inconnue, brouillon, Golden (préconditions vérifiées), paquet inconnu → 404 ; proposition en attente et défaut intacts | idem |
| UC-PRO-04-F06 | Nominal, A2 | IHM | `<App/>` : bouton absent sur le défaut, POST + CSRF, confirmation, mention « par défaut » inchangée | `web/test/usecases/functional/uc-pro-04-proposer-version-defaut.test.jsx` |
| UC-PRO-04-F07 | E2 | IHM | 404 serveur → alerte, pas de confirmation, « par défaut » inchangé | idem |
| UC-PRO-04-F08 | Limite (RGPD) | API | Compte de l'auteur supprimé : la proposition reste, `proposedBy` désigne le compte purgé (comportement figé) | `api/tests/UseCases/Functional/UcPro04ProposerVersionDefautTest.php` |

### Tests existants liés (non-régression)

- `api/tests/PackagesDefaultTest.php` — `testProposeDefaultRequiresPromptologueAndAPublishedVersion`,
  `testAdminValidationSetsTheServedDefault` (consommation de la proposition par
  la route de déploiement **à jeton** `POST /api/admin/default-package`,
  UC-SYS-02, et non par l'écran admin UC-ADM-03).
- `api/tests/UseCases/Unit/UcCpt02SeConnecterDeconnecterTest.php` — UC-CPT-02-U07
  (`CsrfMiddleware`).
- `api/tests/AdminGoldenTest.php` — Golden non proposable.
- `web/src/views/PromptologueView.test.jsx` — « proposer par défaut ».

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcPro04 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-PRO-04
```

## Limites

- Pas d'événement d'audit pour la proposition. La validation par l'écran
  admin écrit `default_package_set` (UC-ADM-03) ; la route de déploiement à
  jeton, elle, n'écrit aucun audit (UC-SYS-02). Seul le réglage garde
  l'auteur et la date de la **dernière** proposition.
- L'accueil n'indique pas qu'une proposition est déjà en attente, ni laquelle.
- v1 : la validation n'a pas d'effet visible côté apprenant. L'assistant de
  run (`RunWizard`) présélectionne toujours le paquet embarqué et n'affiche
  pas la marque `defaut` (UC-APP-02, anomalie A-01) ; le sélecteur du run de
  masse ne la signale pas non plus (UC-ETA-03).
- La proposition survit à la suppression du compte de son auteur
  (`proposedBy` pointe alors vers un compte purgé) jusqu'à son remplacement ou
  sa consommation (UC-PRO-04-F08).
