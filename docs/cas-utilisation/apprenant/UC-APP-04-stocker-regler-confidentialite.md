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
  `publique` — un retour à `privee` coupe son accès immédiatement. La
  visibilité ne gouverne **pas** le partage employeur : un retour à `privee`
  ne révoque pas les liens de partage actifs (RG9, UC-APP-05 anomalie 1).
- « Retirer du serveur » purge réellement la ligne, **ses liens de partage**
  et **tout le travail du cartographe lié** posé dessus — annotations,
  révisions et garantie (UC-CAR-03, UC-CAR-04, UC-CAR-05) — par les FK
  `ON DELETE CASCADE` (migrations 004 et 008) ; la copie locale demeure.

## Garanties minimales (en cas d'échec)

- Rien ne part au serveur avant la confirmation de l'encart RGPD ; le
  portfolio **complet** n'est jamais envoyé. Le document transmis contient
  toutefois des **extraits verbatim** du portfolio
  (`poles[].passagesSaillants[].extraitVerbatim`), et le `runMeta` comme le
  titre produits par l'assistant de run portent l'identifiant et le titre du
  portfolio (anomalie 3).
- Un échec serveur laisse la copie locale inchangée (pas de `serverId`,
  visibilité locale inchangée, `serverId` et cartographie locale conservés
  après un retrait ou une suppression en échec) et affiche un message en
  français.
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
4. Le serveur contrôle d'abord le jeton CSRF (middleware **global**
   `CsrfMiddleware`, exécuté avant les gardes de route, et seulement si un
   cookie de session est présent), puis la session et le rôle (`RequireRole`),
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
  cartographie de sa file et son détail répond `404` immédiatement
  (`api/src/routes/cartographe.php`).
- **A3 — Renommer ou PATCH sans changement** (étape 6, API seulement) :
  `PATCH {titre}` renomme (espaces de bord rognés) sans toucher la
  visibilité ; un `PATCH {}` ou aux mêmes valeurs répond `200` sans effet.
- **A4 — Retirer du serveur** (après l'étape 5) : « Retirer du serveur » envoie
  `DELETE /api/cartographies/{serverId}` → `204` ; la ligne, ses liens de
  partage et le travail du cartographe lié (annotations, révisions, garantie)
  sont purgés par cascade : un lien transmis à un employeur répond désormais
  le `404` de UC-EMP-01 (`api/src/routes/share.php`), la cartographie sort de
  la file du cartographe et son détail répond `404`, puis `GET`/`DELETE`
  répondent `404`. Aucun avertissement n'indique à l'apprenant que la
  relecture et la garantie seront perdues (voir Limites). Le navigateur
  efface `serverId` (« Copie serveur de « *titre* » supprimée (les liens de
  partage sont purgés). »). Si la copie n'existait déjà plus (`404`), le local
  est réaligné sans erreur.
- **A5 — Supprimer la cartographie** (étape 1) : « Supprimer » s'arme au
  premier clic (« Annuler » désarme), « Confirmer la suppression » supprime la
  copie serveur (si `serverId` ; `404` toléré ; aucune requête sans
  `serverId`) **puis** la cartographie locale ; mêmes effets de cascade que A4.
- **A6 — Visibilité omise** (étape 3, API) : sans `visibility`, la copie est
  créée `privee`.

## Scénarios d'erreur

- **E1 — Pas de session** (étape 4) : **sans cookie de session**, `401
  {"error": "Authentification requise"}` sur chaque route ; l'IHM affiche
  « Connectez-vous (espace compte) pour copier une cartographie sur le
  serveur. » (ou « … pour changer la confidentialité de la copie serveur. »,
  « … pour retirer une cartographie du serveur. », « … pour supprimer la
  copie serveur. » selon l'action) et ne mémorise aucun `serverId`. Avec un
  cookie de session **expiré** (ligne `sessions` purgée, cookie encore
  présent), le CSRF global passe avant `RequireRole` : `POST`/`PATCH`/`DELETE`
  répondent `403 {"error": "Jeton CSRF absent ou invalide"}` — affiché tel
  quel par l'IHM — et seuls les `GET` répondent `401`.
- **E2 — Rôle `apprenant` absent** (étape 4) : `403 {"error": "Rôle
  insuffisant"}` ; message du serveur affiché.
- **E3 — Jeton CSRF absent ou invalide** (étapes 4 et 7) : `403 {"error":
  "Jeton CSRF absent ou invalide"}` ; rien n'est créé ni modifié.
- **E4 — Corps de copie invalide** (étape 4) : `422 {"error": "Validation
  échouée", "fields": {…}}` — type hors `jour|merge|twin9`, titre vide ou >
  190 caractères, visibilité inconnue, document absent / vide / liste / > 8 Mo,
  `runMeta` non objet ou > 64 Ko, paire de versions incomplète ou version non
  publiée (message `Paquet de prompts publié introuvable : id@version`).
  Aucune ligne créée ; l'IHM n'affiche que le message général « Validation
  échouée » (le détail `fields` n'est pas montré) et laisse l'encart ouvert.
- **E5 — PATCH invalide** (étape 7) : `422` (titre vide, non chaîne ou > 190
  caractères, visibilité inconnue) ; **tout ou rien** : aucun champ n'est
  appliqué.
- **E6 — Id inconnu ou appartenant à un autre compte** (étapes 7, 8, A4) :
  **même** `404 {"error": "Cartographie introuvable"}` sur `GET`, `PATCH` et
  `DELETE` ; la ligne d'autrui reste intacte.
- **E7 — Échec du PATCH vu de l'IHM** (étape 7) : message d'erreur (ex.
  « Cartographie introuvable ») ; la visibilité locale et le menu restent sur
  l'ancienne valeur. Sur un `404`, `serverId` n'est **pas** réaligné
  (anomalie 4) : chaque nouveau réglage échoue de même.
- **E8 — Échec du retrait ou de la suppression vu de l'IHM** (A4, A5) : toute
  erreur autre que `404` (`401` hors session, `403`, `500`…) affiche un
  message (`401` → « Connectez-vous (espace compte) pour retirer une
  cartographie du serveur. » ou « … pour supprimer la copie serveur. »,
  sinon le message du serveur) ; `serverId`, le badge et la cartographie
  locale sont conservés, les boutons redeviennent actifs (« Supprimer »
  désarmé).

## Règles de gestion

- **RG1** — Le `POST /api/cartographies` **est** l'opt-in : `opt_in_at =
  NOW()` est posé par l'INSERT, jamais par un champ du client.
- **RG2** — Propriété : toute requête est filtrée par `user_id` ; un id
  étranger se comporte exactement comme un id inexistant (`404`).
- **RG3** — `type ∈ {jour, merge, twin9}` ; `titre` rogné, 1 à 190
  caractères (comptés en caractères, `mb_strlen`) ; `visibility ∈ {privee,
  cartographe, publique}`, défaut `privee`.
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
- **RG8** — La suppression est une purge réelle : ligne + `share_links` +
  `cartography_annotations` + `cartography_revisions` +
  `cartography_garanties` (cascade, migrations 004 et 008). La suppression du
  compte purge aussi toutes les copies (UC-CPT-06).
- **RG9** — Seuls `cartographe` et `publique` ouvrent la lecture au
  cartographe **lié** ; `publique` n'ouvre rien de plus côté serveur (le
  partage employeur passe par un lien, UC-APP-05). Réciproquement, la
  visibilité n'est pas une condition du partage : « Partager » est offert dès
  qu'une copie serveur existe, et le passage à `privee` ne révoque pas les
  liens actifs (UC-APP-05, anomalie 1).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Portfolio | Jamais transmis **en entier** ; le document contient des extraits verbatim (`passagesSaillants[].extraitVerbatim`), et `runMeta`/titre produits par l'assistant de run portent l'id et le titre du portfolio (anomalie 3) |
| Document de cartographie | Colonne JSON `cartographies.document`, uniquement après confirmation explicite |
| Consentement | `opt_in_at` (date de l'opt-in), `created_at`/`updated_at` |
| Copie locale | IndexedDB du navigateur ; `serverId` relie la copie locale à la copie serveur |
| Retrait | `DELETE` = purge réelle (ligne, liens de partage, annotations, révisions, garantie) ; pas d'événement d'audit dédié |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/EspaceView.jsx`, `web/src/views/espace/DashboardSection.jsx` | Vérification de session au montage, bloc « Mes cartographies » |
| Front | `web/src/views/espace/CartographiesPanel.jsx` — encart d'opt-in, `toServerPayload`, `handleCopyToServer`, `handleVisibilityChange`, `handleRemoveFromServer`, `handleDelete`, `serverErrorMessage` | Parcours IHM, corps du POST, messages |
| Front | `web/src/views/espace/cartographies-panel-bridge.js`, `carto-store-bridge.js` | Chargement du panneau et du store (ponts chantier C) |
| Front | `web/src/lib/carto-store.js` — `createCartoStore`, `VISIBILITIES`, `updateCartography` | Copie locale, défaut `privee`, trace `serverId` |
| Front | `web/src/api/client.js` — `fetchMe`, `apiFetch`, `ApiError` | Session (401 = non connecté), jeton CSRF en mémoire, erreurs typées |
| API | `api/src/routes/cartographies.php` — `POST/GET /api/cartographies`, `GET/PATCH/DELETE /api/cartographies/{id}` | Validation, opt-in, propriété |
| API | `api/src/Middleware/CsrfMiddleware.php` (global, avant les gardes de route), `api/src/Middleware/RequireRole.php` | 403 CSRF, 401/403 — logique unitaire couverte par UC-CPT-02-U07 (`CsrfMiddleware`) et UC-ADM-01-U10 (`RequireRole`) |
| API | `api/src/routes/cartographe.php` — `GET /api/cartographe/cartographies[/{id}]` | Effet de la visibilité pour le cartographe lié (A2), disparition après purge (A4) |
| API | `api/src/routes/share.php` — `POST /api/share/{token}` | Lien employeur mort après la purge (A4, UC-EMP-01) |
| Domaine | `api/src/Cartographies/CartographyRepository.php` — `create`, `listForUser`, `findForUser`, `updateForUser`, `deleteForUser`, `ownedBy`, `resolvePromptVersion`, `resolveReferentielVersion` | Stockage, projection, propriété, versions publiées |
| Domaine | `api/src/Cartographe/Links.php` — `queueFor`, `findForCartographe` | Effet de la visibilité pour le cartographe lié |
| Données | `scripts/migrations/004_cartographies_share_links.sql`, `007_cartographies_run_meta.sql`, `008_cartographe_garanties_settings.sql`, `021_cartographies_twin9.sql` | Tables ; cascade vers `share_links`, `cartography_annotations`, `cartography_revisions`, `cartography_garanties` |

La visionneuse « Voir » (`CartographyViewer`) relève de UC-APP-03.
`api/src/Validation.php` n'est **pas** sollicité par ce cas (anomalie 1) : il
ne sert que d'oracle au test UC-APP-04-U10.

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-04-U01 | `CartographyRepository::create` | `opt_in_at` posé par l'INSERT, document, `run_meta`, FK de versions (RG1) | `api/tests/UseCases/Unit/UcApp04StockerConfidentialiteTest.php` |
| UC-APP-04-U02 | `CartographyRepository::listForUser` | Clés de métadonnées exactes, pas de document, tri, `shares` = liens actifs (RG6) | idem |
| UC-APP-04-U03 | `CartographyRepository::findForUser` | Tout pour le propriétaire, `null` pour autrui ou id inconnu (RG2) | idem |
| UC-APP-04-U04 | `CartographyRepository::updateForUser` | Titre/visibilité, no-op = propriété, étranger = `false` sans effet (RG7) | idem |
| UC-APP-04-U05 | `CartographyRepository::deleteForUser` | Purge ligne + liens + annotations, révisions, garantie ; comptes intacts ; étranger = `false` (RG8) | idem |
| UC-APP-04-U06 | `CartographyRepository::ownedBy` | Propriétaire seulement | idem |
| UC-APP-04-U07 | `CartographyRepository::resolvePromptVersion` | Publiée → id ; brouillon ou inconnue → `null` (RG5) | idem |
| UC-APP-04-U08 | `CartographyRepository::resolveReferentielVersion` | Idem pour le référentiel (RG5) | idem |
| UC-APP-04-U09 | `Links::queueFor`, `findForCartographe` | Seules `cartographe`/`publique` sont lisibles ; retour à `privee` coupe (RG9) | idem |
| UC-APP-04-U10 | `CartographyRepository::create` (oracle `Validation::validate`) | Le Repository stocke le document sans le valider (par conception) ; le document minimal des tests n'est pas conforme au schéma | idem |
| UC-APP-04-U11 | `carto-store` — `VISIBILITIES`, `saveCartography` | Trois niveaux alignés sur l'API, défaut `privee`, `serverId` nul | `web/test/usecases/unit/uc-app-04-stocker-regler-confidentialite.test.jsx` |
| UC-APP-04-U12 | `carto-store` — `updateCartography` | `serverId` puis visibilité consignés, `updatedAt` avancé, id inconnu → erreur française | idem |
| UC-APP-04-U13 | Ponts `cartographies-panel-bridge`, `carto-store-bridge` | Panneau et store présents, contrat de fonctions exposé | idem |
| UC-APP-04-U14 | `apiFetch` | Jeton CSRF de `auth/me` rejoué sur POST/PATCH/DELETE, jamais sur GET | idem |
| UC-APP-04-U15 | `CartographiesPanel` (isolé) — `toServerPayload` | Corps du POST avec/sans références de versions et `runMeta` | idem |
| UC-APP-04-U16 | `CartographiesPanel` (isolé) | Exactement trois niveaux libellés en français, type Twin9 étiqueté | idem |
| UC-APP-04-U17 | `CartographiesPanel` (isolé) — `serverErrorMessage` | `401` sur PATCH, retrait, suppression, POST → invitation propre à chaque action ; autre statut → message du serveur | idem |
| UC-APP-04-U18 | `CartographiesPanel` (isolé) — `handleVisibilityChange` | Sans `serverId` aucune requête ; avec, `PATCH` avant le report local | idem |
| UC-APP-04-U19 | `CartographiesPanel` (isolé) — `handleRemoveFromServer` | `404` toléré (`serverId` effacé) ; autre erreur affichée, `serverId` conservé | idem |
| UC-APP-04-U20 | `CartographiesPanel` (isolé) — `handleDelete` | Armement, annulation, confirmation ; sans `serverId` aucune requête ; `404` toléré ; autre erreur = local conservé | idem |
| UC-APP-04-U21 | `fetchMe` | `200` → `{user}` + jeton CSRF mémorisé ; `401` → `{user: null}` ; `500` relancé ; réponse non JSON → API indisponible | idem |

`RequireRole` et `CsrfMiddleware` : logique unitaire couverte par
UC-ADM-01-U10 et UC-CPT-02-U07. `EspaceView`/`DashboardSection` (vérification
de session au montage) sont exercés par les tests fonctionnels IHM.

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-04-F01 | Nominal | API | `201 {id}`, `opt_in_at` posé par l'INSERT (un `optInAt`/`opt_in_at` client est ignoré, RG1), liste sans document, détail complet, `PATCH` → métadonnées | `api/tests/UseCases/Functional/UcApp04StockerConfidentialiteTest.php` |
| UC-APP-04-F02 | A6 | API | Visibilité omise → `privee` | idem |
| UC-APP-04-F03 | A2 | API | `cartographe` ouvre la file du cartographe lié, `privee` la coupe (404) | idem |
| UC-APP-04-F04 | A2 | API | `publique` : lié oui, non lié non | idem |
| UC-APP-04-F05 | A3 | API | Renommage rogné, `PATCH {}` sans effet, `type`/`document` ignorés (RG7) | idem |
| UC-APP-04-F06 | A4 | API | Lien employeur opérant avant ; `204`, purge ligne + liens + annotation, révision et garantie du cartographe lié ; file et détail du cartographe vides/`404` ; lien employeur mort (`404` + message) | idem |
| UC-APP-04-F07 | E1 | API | `401` sur les cinq routes, rien de stocké ni modifié | idem |
| UC-APP-04-F08 | E2 | API | `403 Rôle insuffisant` | idem |
| UC-APP-04-F09 | E3 | API | `403` CSRF sur POST/PATCH/DELETE, sans jeton ou avec un jeton faux, rien ne change | idem |
| UC-APP-04-F10 | E4 | API | `422` champ par champ (type, titre, visibilité, document absent/liste/vide, runMeta, paires de versions incomplètes ou non publiées) | idem |
| UC-APP-04-F11 | E4 | API | Document > 8 Mo → `422` | idem |
| UC-APP-04-F12 | E5 | API | `PATCH` invalide → `422`, tout ou rien | idem |
| UC-APP-04-F13 | E6 | API | Id étranger ou inconnu → corps `404` identiques | idem |
| UC-APP-04-F14 | Anomalie 1 | API | Document non conforme ou de type croisé stocké (`201`) — comportement actuel figé | idem |
| UC-APP-04-F23 | E1, E3 | API | Cookie de session expiré : `403` CSRF sur POST/PATCH/DELETE (même avec l'ancien jeton), `401` sur les GET, rien ne change | idem |
| UC-APP-04-F24 | Nominal (RG3) | API | Bornes acceptées : type `twin9`, titre rogné de 190 caractères multi-octets relu à l'identique | idem |
| UC-APP-04-F15 | Nominal | IHM | Encart sans requête, POST avec CSRF, badge, `serverId`, PATCH synchronisé | `web/test/usecases/functional/uc-app-04-stocker-regler-confidentialite.test.jsx` |
| UC-APP-04-F16 | A1 | IHM | Confidentialité locale sans aucune requête | idem |
| UC-APP-04-F17 | A4 | IHM | Retrait → message, badge ôté ; copie déjà absente (404) réalignée | idem |
| UC-APP-04-F18 | A5 | IHM | Suppression en deux temps : DELETE serveur **avant** le local ; sans copie, aucune requête ; copie déjà absente (`404`) tolérée | idem |
| UC-APP-04-F19 | E1 | IHM | Anonyme : « Connectez-vous… », pas de `serverId` | idem |
| UC-APP-04-F20 | E2, E4 | IHM | Seul le message général du serveur est affiché (pas `fields`), encart ouvert, pas de badge | idem |
| UC-APP-04-F21 | E7, anomalie 4 | IHM | PATCH en échec : visibilité locale inchangée + message ; `serverId` périmé conservé, nouvel échec au réglage suivant — comportement actuel figé | idem |
| UC-APP-04-F22 | Anomalie 2 | IHM | Autre appareil : copies serveur ni listées ni demandées — comportement actuel figé | idem |
| UC-APP-04-F25 | E8 | IHM | Retrait en échec (`500`, puis `401`) : message, `serverId` et badge conservés, bouton réarmé | idem |
| UC-APP-04-F26 | E8 | IHM | Suppression en échec (`500`) : message, cartographie locale conservée, « Supprimer » réarmé | idem |
| UC-APP-04-F27 | Anomalie 3 | IHM | Le POST porte des extraits verbatim du portfolio, et `runMeta`/titre son titre, alors que l'encart dit « jamais votre portfolio » — comportement actuel figé | idem |

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
   (UC-EMP-01) ni par la relecture. Figé par UC-APP-04-F14 (UC-APP-04-U10
   établit seulement que le Repository, par conception, ne valide pas).
2. **« Retrouver depuis un autre appareil » : promesse non tenue par l'IHM.**
   L'encart d'opt-in (« … afin de pouvoir le partager par lien et le
   retrouver depuis un autre appareil ») et le chapitre de formation apprenant
   6 annoncent l'accès multi-appareils, mais le panneau « Mes cartographies »
   ne lit que le carto-store local et n'appelle jamais `GET
   /api/cartographies` (utilisé seulement par l'atelier promptologue) : sur un
   autre navigateur, les copies serveur restent invisibles et irrécupérables
   par l'IHM. Figé par UC-APP-04-F22.
3. **« Jamais votre portfolio » : des extraits du portfolio partent quand
   même.** L'encart d'opt-in affirme que seul « le document de la cartographie
   (jamais votre portfolio) » est stocké ; or ce document contient, par
   construction, des **citations exactes** du portfolio
   (`poles[].passagesSaillants[].extraitVerbatim`, « Citation exacte du
   portfolio de l'apprenant » selon `schemas/cartographie-jour.schema.json`),
   et le `runMeta` produit par l'assistant de run (`RunWizard`,
   UC-APP-02-F01) porte `portfolioId` et `portfolioTitre`, repris dans le
   titre des cartographies — alors que la migration 007 réserve `run_meta` aux
   compteurs et identifiants, « jamais de texte de portfolio ». L'information
   RGPD donnée à l'apprenant est donc incomplète. Figé par UC-APP-04-F27.
4. **`serverId` périmé après un `404` sur le `PATCH`.** Le retrait et la
   suppression tolèrent le `404` et réalignent la copie locale ; le changement
   de confidentialité, lui, ne traite aucun statut : si la copie serveur a
   disparu (autre appareil, purge), `serverId` reste en local, le badge
   « copie serveur » demeure et **chaque** réglage de confidentialité échoue
   avec « Cartographie introuvable », jusqu'à ce que l'apprenant pense à
   cliquer « Retirer du serveur ». Figé par UC-APP-04-F21.

## Limites

- Le renommage (`PATCH {titre}`) n'est pas proposé par l'IHM (API seulement).
- Ni la copie serveur ni son retrait ne produisent d'événement d'audit : la
  trace du consentement est `opt_in_at`, et le retrait efface la ligne.
- Une erreur du carto-store local **après** un `PATCH` réussi laisserait la
  visibilité serveur en avance sur la locale (ordre : serveur puis local).
- De même, un `POST` réussi suivi d'un échec du carto-store (enregistrement de
  `serverId`) laisserait une copie serveur **orpheline** : invisible dans
  l'IHM (anomalie 2), non retirable par elle, et un nouveau clic en créerait
  une seconde.
- Le retrait et la suppression détruisent sans avertissement le travail du
  cartographe lié (annotations, révisions) et la garantie (RG8).
- La visibilité `privee` ne coupe pas les liens de partage employeur actifs ;
  le libellé « Publique (partageable) » laisse croire le contraire (voir
  UC-APP-05, anomalie 1).
- Un refus `422` n'est affiché que « Validation échouée » : l'apprenant ne
  voit pas le champ en cause (`fields`).
- Avec un cookie de session expiré, une mutation affiche « Jeton CSRF absent
  ou invalide » au lieu de l'invitation à se connecter (E1).
