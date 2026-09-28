# UC-APP-04 — Stocker une cartographie sur le serveur et régler sa confidentialité

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (compte actif, rôle `apprenant`) |
| **Acteurs secondaires** | Cartographe lié (lecteur selon la visibilité, UC-CAR-01/UC-CAR-02) ; employeur (via les liens de partage, UC-APP-05 / UC-EMP-01) |
| **Portée** | humanome.xyz — espace apprenant `#/espace`, bloc « Mes cartographies » ; API `/api/cartographies` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (confidentialité, choix du stockage), §6.1 (rien sur le serveur par défaut), §6.2 (stockage serveur = opt-in), §6.3 (purge réelle) |
| **Statut** | Implémenté (P8 / contrat M6 ; type `twin9` depuis D12) |

## Objectif

Permettre à l'apprenant de confier, **cartographie par cartographie et par un
geste explicite**, une copie de sa cartographie au serveur (condition du
partage par lien et de la relecture par un cartographe), de régler qui peut la
voir — **privée**, **partagée avec mon cartographe**, **publique
(partageable)** — et de retirer cette copie à tout moment.

## Déclencheur

Dans « Mes cartographies » (`#/espace`), l'apprenant clique **« Copier sur le
serveur »** sur une cartographie, ou change son menu **« Confidentialité »**.

## Préconditions

- La cartographie existe dans le navigateur (carto-store IndexedDB
  `humanome-cartographies`) : produite par un run (UC-APP-02, UC-APP-09,
  UC-APP-10) ou restaurée d'une archive (UC-APP-06). Elle y est **privée** et
  **sans copie serveur** par défaut.
- Pour toute action serveur : compte activé et session ouverte (UC-CPT-01,
  UC-CPT-02), rôle `apprenant`. Le réglage de confidentialité d'une
  cartographie **sans** copie serveur ne demande rien de tout cela.

## Garanties en cas de succès

- Une ligne `cartographies` existe pour ce compte avec `opt_in_at` horodaté
  **par l'INSERT lui-même** : la copie serveur est la trace datée du
  consentement (§6.2). Le navigateur mémorise son `serverId` ; la cartographie
  porte le badge « copie serveur » et devient partageable (UC-APP-05).
- La visibilité serveur est celle choisie ; un cartographe **lié** voit la
  cartographie dans sa file si, et seulement si, elle est `cartographe` ou
  `publique` — un retour à `privee` coupe son accès immédiatement.
- « Retirer du serveur » purge réellement la ligne **et ses liens de partage**
  (FK `ON DELETE CASCADE`) ; la copie locale demeure.

## Garanties minimales (en cas d'échec)

- Rien ne part au serveur avant la confirmation de l'encart RGPD ; le
  portfolio n'est **jamais** envoyé (seul le document de cartographie l'est).
- Un échec serveur laisse la copie locale inchangée (pas de `serverId`, ou
  visibilité locale inchangée) et affiche un message en français.
- Aucune réponse ne révèle l'existence d'une cartographie d'un autre compte
  (même `404`).

## Scénario nominal

1. L'apprenant ouvre `#/espace`. La vue vérifie la session (`GET
   /api/auth/me`, qui remet le jeton CSRF gardé en mémoire du client) et
   affiche « Mes cartographies » : chaque cartographie **locale** avec son
   titre, son type (Journée, Parcours (merge), Analyse Twin9), sa date, son
   menu « Confidentialité » et ses actions.
2. Il clique **« Copier sur le serveur »** : un encart rappelle l'engagement
   (« Copie serveur = choix explicite (RGPD) », jamais le portfolio, retrait
   possible à tout moment). **Aucune requête** n'est émise.
3. Il clique **« Je confirme la copie sur le serveur »** : le navigateur envoie
   `POST /api/cartographies` avec l'en-tête `X-CSRF-Token` et le corps
   `{type, titre, visibility, document}`, complété de
   `promptPackageId`/`promptPackageVersion`, `referentielId`/
   `referentielVersion` et `runMeta` quand la cartographie locale les connaît.
4. Le serveur vérifie la session et le rôle (`RequireRole`), le jeton CSRF,
   valide le corps (RG3 à RG6), résout les versions **publiées**, insère la
   ligne avec `opt_in_at = NOW()` et répond `201 {id}`.
5. Le navigateur enregistre `serverId = id` dans le carto-store et affiche le
   badge « copie serveur », le message « « *titre* » est copiée sur le serveur
   (retrait possible à tout moment). » et les boutons **« Partager »**
   (UC-APP-05) et **« Retirer du serveur »**.
6. L'apprenant choisit un niveau dans « Confidentialité » : **Privée**,
   **Partagée avec mon cartographe** ou **Publique (partageable)**. Le
   navigateur envoie `PATCH /api/cartographies/{serverId}` `{visibility}`.
7. Le serveur vérifie la propriété, met à jour la ligne et répond `200` avec
   les **métadonnées** (sans document) ; le navigateur reporte la visibilité
   dans la copie locale.
8. Côté API, l'apprenant peut relire ses copies : `GET /api/cartographies`
   (métadonnées seulement : `id, type, titre, visibility, createdAt,
   updatedAt, hasDocument, shares` — `shares` = liens **actifs**) et `GET
   /api/cartographies/{id}` (document, `optInAt`, `promptPackage`,
   `referentiel`, `runMeta`, `shares`).

## Scénarios alternatifs

- **A1 — Cartographie sans copie serveur** (étape 6) : le changement de
  confidentialité est purement local (carto-store), **sans aucune requête** ;
  il sera transmis avec la copie si l'apprenant la crée ensuite.
- **A2 — Effet de la visibilité pour le cartographe** (étape 7) : en
  `cartographe` ou `publique`, un cartographe **lié** (UC-CAR-01) voit la
  cartographie dans `GET /api/cartographe/cartographies` et peut l'ouvrir ; un
  cartographe non lié ne voit rien ; le retour à `privee` fait disparaître la
  cartographie de sa file et son détail répond `404` immédiatement.
- **A3 — Renommer ou PATCH sans changement** (étape 6, API seulement) :
  `PATCH {titre}` renomme (espaces de bord rognés) sans toucher la
  visibilité ; un `PATCH {}` ou aux mêmes valeurs répond `200` sans effet.
- **A4 — Retirer du serveur** (après l'étape 5) : « Retirer du serveur » envoie
  `DELETE /api/cartographies/{serverId}` → `204` ; la ligne et ses liens de
  partage sont purgés (un lien transmis à un employeur répond désormais le
  `404` de UC-EMP-01), puis `GET`/`DELETE` répondent `404`. Le navigateur
  efface `serverId` (« Copie serveur de « *titre* » supprimée (les liens de
  partage sont purgés). »). Si la copie n'existait déjà plus (`404`), le local
  est réaligné sans erreur.
- **A5 — Supprimer la cartographie** (étape 1) : « Supprimer » s'arme au
  premier clic, « Confirmer la suppression » supprime la copie serveur (si
  `serverId`, `404` toléré) **puis** la cartographie locale.
- **A6 — Visibilité omise** (étape 3, API) : sans `visibility`, la copie est
  créée `privee`.

## Scénarios d'erreur

- **E1 — Pas de session** (étape 4) : `401 {"error": "Authentification
  requise"}` sur chaque route ; l'IHM affiche « Connectez-vous (espace compte)
  pour copier une cartographie sur le serveur. » et ne mémorise aucun
  `serverId`.
- **E2 — Rôle `apprenant` absent** (étape 4) : `403 {"error": "Rôle
  insuffisant"}` ; message du serveur affiché.
- **E3 — Jeton CSRF absent ou invalide** (étapes 4 et 7) : `403 {"error":
  "Jeton CSRF absent ou invalide"}` ; rien n'est créé ni modifié.
- **E4 — Corps de copie invalide** (étape 4) : `422 {"error": "Validation
  échouée", "fields": {…}}` — type hors `jour|merge|twin9`, titre vide ou >
  190 caractères, visibilité inconnue, document absent / vide / liste / > 8 Mo,
  `runMeta` non objet ou > 64 Ko, paire de versions incomplète ou version non
  publiée (message `Paquet de prompts publié introuvable : id@version`).
  Aucune ligne créée ; l'IHM affiche le message et laisse l'encart ouvert.
- **E5 — PATCH invalide** (étape 7) : `422` (titre vide, non chaîne ou > 190
  caractères, visibilité inconnue) ; **tout ou rien** : aucun champ n'est
  appliqué.
- **E6 — Id inconnu ou appartenant à un autre compte** (étapes 7, 8, A4) :
  **même** `404 {"error": "Cartographie introuvable"}` sur `GET`, `PATCH` et
  `DELETE` ; la ligne d'autrui reste intacte.
- **E7 — Échec du PATCH vu de l'IHM** (étape 7) : message d'erreur (ex.
  « Cartographie introuvable ») ; la visibilité locale et le menu restent sur
  l'ancienne valeur.

## Règles de gestion

- **RG1** — Le `POST /api/cartographies` **est** l'opt-in : `opt_in_at =
  NOW()` est posé par l'INSERT, jamais par un champ du client.
- **RG2** — Propriété : toute requête est filtrée par `user_id` ; un id
  étranger se comporte exactement comme un id inexistant (`404`).
- **RG3** — `type ∈ {jour, merge, twin9}` ; `titre` rogné, 1 à 190
  caractères ; `visibility ∈ {privee, cartographe, publique}`, défaut
  `privee`.
- **RG4** — `document` : objet JSON non vide d'au plus 8 Mo (encodage JSON) ;
  `runMeta` : objet JSON d'au plus 64 Ko.
- **RG5** — Références de versions : chaque paire (`promptPackageId` +
  `promptPackageVersion`, `referentielId` + `referentielVersion`) est complète
  ou absente et doit désigner une version **publiée** (une cartographie ne
  pointe jamais vers une version non rejouable).
- **RG6** — La liste ne transporte **jamais** de document ; le document ne
  voyage que sur le `GET` unitaire du propriétaire. Le `PATCH` ne répond que
  des métadonnées.
- **RG7** — `PATCH` ne modifie que `titre` et `visibility`.
- **RG8** — La suppression est une purge réelle : ligne + `share_links`
  (cascade). La suppression du compte purge aussi toutes les copies (UC-CPT-06).
- **RG9** — Seuls `cartographe` et `publique` ouvrent la lecture au
  cartographe **lié** ; `publique` n'ouvre rien de plus côté serveur (le
  partage employeur passe par un lien, UC-APP-05).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Portfolio | Jamais transmis par ce cas (seul le document de cartographie l'est) |
| Document de cartographie | Colonne JSON `cartographies.document`, uniquement après confirmation explicite |
| Consentement | `opt_in_at` (date de l'opt-in), `created_at`/`updated_at` |
| Copie locale | IndexedDB du navigateur ; `serverId` relie la copie locale à la copie serveur |
| Retrait | `DELETE` = purge réelle (ligne + liens de partage) ; pas d'événement d'audit dédié |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/EspaceView.jsx`, `web/src/views/espace/DashboardSection.jsx` | Vérification de session au montage, bloc « Mes cartographies » |
| Front | `web/src/views/espace/CartographiesPanel.jsx` — encart d'opt-in, `toServerPayload`, `handleCopyToServer`, `handleVisibilityChange`, `handleRemoveFromServer`, `handleDelete`, `serverErrorMessage` | Parcours IHM, corps du POST, messages |
| Front | `web/src/views/espace/cartographies-panel-bridge.js`, `carto-store-bridge.js` | Chargement du panneau et du store (ponts chantier C) |
| Front | `web/src/lib/carto-store.js` — `createCartoStore`, `VISIBILITIES`, `updateCartography` | Copie locale, défaut `privee`, trace `serverId` |
| Front | `web/src/api/client.js` — `fetchMe`, `apiFetch`, `ApiError` | Jeton CSRF en mémoire, erreurs typées |
| API | `api/src/routes/cartographies.php` — `POST/GET /api/cartographies`, `GET/PATCH/DELETE /api/cartographies/{id}` | Validation, opt-in, propriété |
| API | `api/src/Middleware/RequireRole.php`, `api/src/Middleware/CsrfMiddleware.php` | 401/403, jeton CSRF |
| Domaine | `api/src/Cartographies/CartographyRepository.php` — `create`, `listForUser`, `findForUser`, `updateForUser`, `deleteForUser`, `ownedBy`, `resolvePromptVersion`, `resolveReferentielVersion` | Stockage, projection, propriété, versions publiées |
| Domaine | `api/src/Cartographe/Links.php` — `queueFor`, `findForCartographe` | Effet de la visibilité pour le cartographe lié |
| Données | `scripts/migrations/004_cartographies_share_links.sql`, `007_cartographies_run_meta.sql`, `021_cartographies_twin9.sql` | Tables, cascade vers `share_links` |

La visionneuse « Voir » (`CartographyViewer`) relève de UC-APP-03.

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-04-U01 | `CartographyRepository::create` | `opt_in_at` posé par l'INSERT, document, `run_meta`, FK de versions (RG1) | `api/tests/UseCases/Unit/UcApp04StockerConfidentialiteTest.php` |
| UC-APP-04-U02 | `CartographyRepository::listForUser` | Clés de métadonnées exactes, pas de document, tri, `shares` = liens actifs (RG6) | idem |
| UC-APP-04-U03 | `CartographyRepository::findForUser` | Tout pour le propriétaire, `null` pour autrui ou id inconnu (RG2) | idem |
| UC-APP-04-U04 | `CartographyRepository::updateForUser` | Titre/visibilité, no-op = propriété, étranger = `false` sans effet (RG7) | idem |
| UC-APP-04-U05 | `CartographyRepository::deleteForUser` | Purge ligne + liens, étranger = `false` (RG8) | idem |
| UC-APP-04-U06 | `CartographyRepository::ownedBy` | Propriétaire seulement | idem |
| UC-APP-04-U07 | `CartographyRepository::resolvePromptVersion` | Publiée → id ; brouillon ou inconnue → `null` (RG5) | idem |
| UC-APP-04-U08 | `CartographyRepository::resolveReferentielVersion` | Idem pour le référentiel (RG5) | idem |
| UC-APP-04-U09 | `Links::queueFor`, `findForCartographe` | Seules `cartographe`/`publique` sont lisibles ; retour à `privee` coupe (RG9) | idem |
| UC-APP-04-U10 | `Validation::validate` | Écart : le document minimal stocké n'est pas conforme au schéma (anomalie 1) | idem |
| UC-APP-04-U11 | `carto-store` — `VISIBILITIES`, `saveCartography` | Trois niveaux alignés sur l'API, défaut `privee`, `serverId` nul | `web/test/usecases/unit/uc-app-04-stocker-regler-confidentialite.test.jsx` |
| UC-APP-04-U12 | `carto-store` — `updateCartography` | `serverId` puis visibilité consignés, `updatedAt` avancé, id inconnu → erreur française | idem |
| UC-APP-04-U13 | Ponts `cartographies-panel-bridge`, `carto-store-bridge` | Panneau et store présents, contrat de fonctions exposé | idem |
| UC-APP-04-U14 | `apiFetch` | Jeton CSRF de `auth/me` rejoué sur POST/PATCH/DELETE, jamais sur GET | idem |
| UC-APP-04-U15 | `CartographiesPanel` (isolé) — `toServerPayload` | Corps du POST avec/sans références de versions et `runMeta` | idem |
| UC-APP-04-U16 | `CartographiesPanel` (isolé) | Exactement trois niveaux libellés en français, type Twin9 étiqueté | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-04-F01 | Nominal | API | `201 {id}`, `opt_in_at`, liste sans document, détail complet, `PATCH` → métadonnées | `api/tests/UseCases/Functional/UcApp04StockerConfidentialiteTest.php` |
| UC-APP-04-F02 | A6 | API | Visibilité omise → `privee` | idem |
| UC-APP-04-F03 | A2 | API | `cartographe` ouvre la file du cartographe lié, `privee` la coupe (404) | idem |
| UC-APP-04-F04 | A2 | API | `publique` : lié oui, non lié non | idem |
| UC-APP-04-F05 | A3 | API | Renommage rogné, `PATCH {}` sans effet | idem |
| UC-APP-04-F06 | A4 | API | `204`, purge ligne + liens, lien employeur mort, `404` ensuite | idem |
| UC-APP-04-F07 | E1 | API | `401` sur les cinq routes, rien de stocké ni modifié | idem |
| UC-APP-04-F08 | E2 | API | `403 Rôle insuffisant` | idem |
| UC-APP-04-F09 | E3 | API | `403` CSRF sur POST/PATCH/DELETE, rien ne change | idem |
| UC-APP-04-F10 | E4 | API | `422` champ par champ (type, titre, visibilité, document, runMeta, versions) | idem |
| UC-APP-04-F11 | E4 | API | Document > 8 Mo → `422` | idem |
| UC-APP-04-F12 | E5 | API | `PATCH` invalide → `422`, tout ou rien | idem |
| UC-APP-04-F13 | E6 | API | Id étranger ou inconnu → corps `404` identiques | idem |
| UC-APP-04-F14 | Anomalie 1 | API | Document non conforme ou de type croisé stocké (`201`) — comportement actuel figé | idem |
| UC-APP-04-F15 | Nominal | IHM | Encart sans requête, POST avec CSRF, badge, `serverId`, PATCH synchronisé | `web/test/usecases/functional/uc-app-04-stocker-regler-confidentialite.test.jsx` |
| UC-APP-04-F16 | A1 | IHM | Confidentialité locale sans aucune requête | idem |
| UC-APP-04-F17 | A4 | IHM | Retrait → message, badge ôté ; copie déjà absente (404) réalignée | idem |
| UC-APP-04-F18 | A5 | IHM | Suppression en deux temps : DELETE serveur puis local | idem |
| UC-APP-04-F19 | E1 | IHM | Anonyme : « Connectez-vous… », pas de `serverId` | idem |
| UC-APP-04-F20 | E2, E4 | IHM | Message serveur affiché, encart ouvert, pas de badge | idem |
| UC-APP-04-F21 | E7 | IHM | PATCH en échec : visibilité locale inchangée + message | idem |
| UC-APP-04-F22 | Anomalie 2 | IHM | Autre appareil : copies serveur ni listées ni demandées — comportement actuel figé | idem |

### Tests existants liés (non-régression)

- `api/tests/CartographiesTest.php` — CRUD, `opt_in_at`, liste sans document, propriété, purge, type `twin9`.
- `api/tests/CartographiesCsrfTest.php` — matrice CSRF des routes P8.
- `api/tests/CartographiesPurgeTest.php` — la suppression du compte purge copies et liens (UC-CPT-06).
- `api/tests/CartographeQueueTest.php` — file du cartographe selon la visibilité, bascule immédiate.
- `web/src/views/espace/CartographiesPanel.test.jsx` — composant isolé (opt-in, confidentialité, suppression).
- `web/src/lib/carto-store.test.js` — store local.
- `web/src/views/EspaceView.test.jsx` — tableau de bord.
- `web/e2e/parcours-apprenant.e2e.js` (étape « Opt-in explicite ») et `web/e2e/parcours-cartographe.e2e.js` (confidentialité « partagée avec mon cartographe » + copie serveur).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcApp04 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-APP-04
```

## Anomalies constatées

1. **Document non validé au schéma lors de la copie serveur.** `POST
   /api/cartographies` ne vérifie que « objet JSON non vide ≤ 8 Mo » : un
   document non conforme à `schemas/cartographie-*.schema.json`, ou d'un
   autre type que le `type` déclaré (ex. `type: merge` avec un document
   `cartographie-jour`), est stocké (`201`). `api/src/Validation.php` n'est
   appliqué qu'aux révisions (UC-CAR-04) et aux résultats du worker. Risque :
   un document stocké peut ne pas être affichable par la vue partagée
   (UC-EMP-01) ni par la relecture. Figé par UC-APP-04-U10 et UC-APP-04-F14.
2. **« Retrouver depuis un autre appareil » : promesse non tenue par l'IHM.**
   L'encart d'opt-in (« … afin de pouvoir le partager par lien et le
   retrouver depuis un autre appareil ») et le chapitre de formation apprenant
   6 annoncent l'accès multi-appareils, mais le panneau « Mes cartographies »
   ne lit que le carto-store local et n'appelle jamais `GET
   /api/cartographies` (utilisé seulement par l'atelier promptologue) : sur un
   autre navigateur, les copies serveur restent invisibles et irrécupérables
   par l'IHM. Figé par UC-APP-04-F22.

## Limites

- Le renommage (`PATCH {titre}`) n'est pas proposé par l'IHM (API seulement).
- Ni la copie serveur ni son retrait ne produisent d'événement d'audit : la
  trace du consentement est `opt_in_at`, et le retrait efface la ligne.
- Une erreur du carto-store local **après** un `PATCH` réussi laisserait la
  visibilité serveur en avance sur la locale (ordre : serveur puis local).
