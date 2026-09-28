# UC-CPT-03 — Gérer son profil (nom affiché, avatar)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Tout utilisateur inscrit et connecté |
| **Acteurs secondaires** | Tout tiers qui affiche l'avatar (navigation, cartographe, établissement) via `GET /api/users/{id}/avatar` |
| **Portée** | humanome.xyz — section « Profil » de `#/compte` ; `PATCH /api/auth/me`, `PUT`/`DELETE /api/auth/me/avatar`, `GET /api/users/{id}/avatar` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §4.5 (profil utilisateur), §6 (RGPD) ; décisions D6 / AD-D4 (`STATUS.md`) ; registre RGPD §1 (photo facultative) |
| **Statut** | Implémenté (D6) |

## Objectif

Permettre à l'utilisateur de choisir le nom sous lequel il apparaît et
d'ajouter, remplacer ou retirer une photo de profil, sans jamais faire
confiance au fichier fourni par le navigateur.

## Déclencheur

L'utilisateur connecté ouvre `#/compte` (lien « Profil et rôles » ou identité
dans la navigation) et clique « Modifier » ou « Ajouter une photo ».

## Préconditions

- Session ouverte (UC-CPT-02) ; le client dispose du jeton CSRF.

## Garanties en cas de succès

- Nom : `users.display_name` est mis à jour (espaces de bord retirés) et
  renvoyé partout où `/api/auth/me` est lu (profil, navigation).
- Photo : les octets **validés par le serveur** (type autorisé, taille, magic
  number) sont stockés en base (`users.avatar` MEDIUMBLOB + `avatar_mime`) ;
  `hasAvatar` passe à vrai ; l'image est servie à l'identique.
- Retrait : `avatar` et `avatar_mime` sont effacés ; les initiales remplacent
  la photo.

## Garanties minimales (en cas d'échec)

- Le profil n'est pas modifié ; un fichier refusé n'est jamais stocké.
- Aucune mutation sans session (`401`) ni sans jeton CSRF (`403`).
- Chaque route n'agit que sur le compte de la session (aucun identifiant dans
  l'URL de mutation : pas d'IDOR possible).

## Scénario nominal

1. L'utilisateur voit son profil : avatar (photo ou initiales), email, nom
   affiché, rôles.
2. Il clique « Modifier » : un champ pré-rempli apparaît (190 caractères
   maximum), avec « Enregistrer » et « Annuler ».
3. Il saisit un nouveau nom et clique « Enregistrer » ; le site refuse
   localement un nom vide.
4. Le site envoie `PATCH /api/auth/me {displayName}` avec `X-CSRF-Token`.
5. Le serveur vérifie la session, retire les espaces de bord, contrôle la
   longueur (1 à 190 caractères), met à jour le compte et répond `200 {user}`.
6. Le site affiche le nouveau nom et « Nom affiché mis à jour. » ; il émet
   `humanome:auth`, la navigation relit `/api/auth/me` et affiche le nouveau
   nom près de l'avatar.

## Scénarios alternatifs

- **A1 — Ajouter ou changer la photo** (étape 2) : l'utilisateur choisit un
  fichier (sélecteur limité à JPEG, PNG, WebP). Le navigateur le recadre au
  carré centré, le met à l'échelle en 256 × 256 px et l'encode en WebP
  (qualité 0,85), sinon JPEG 0,85, sinon JPEG 0,6, pour rester sous 200 Ko
  (`resizeAvatar`). Le site envoie `PUT /api/auth/me/avatar {avatar (base64),
  mime}`. Le serveur décode le base64 strict (une data-URL
  `data:image/…;base64,…` est tolérée et fournit le type s'il manque ; les
  blancs sont ignorés), valide avec `AvatarValidator` puis stocke et répond
  `200 {status: "ok", mime, size}`. Le site affiche l'image
  (`api/users/{id}/avatar?v=<n>` pour casser le cache), « Photo de profil mise
  à jour. », et les boutons « Changer la photo » / « Retirer la photo ».
- **A2 — Retirer la photo** (étape 2) : « Retirer la photo » →
  `DELETE /api/auth/me/avatar` → `204` (idempotent) ; le site revient aux
  initiales (« Photo de profil retirée. »).
- **A3 — Annuler l'édition du nom** (étape 3) : « Annuler » referme le champ
  sans requête.
- **A4 — Affichage de l'avatar par un tiers** : `GET /api/users/{id}/avatar`
  est public en lecture (une photo de profil n'est pas un secret) : `200` avec
  le type stocké et `Cache-Control: private, max-age=300`, ou `404 « Avatar
  introuvable »`. Si l'image ne se charge pas, le composant `Avatar` retombe
  sur les initiales (1 ou 2 lettres).

## Scénarios d'erreur

- **E1 — Nom invalide** (étapes 3 et 5) : vide ou blanc → « Le nom affiché est
  requis. » sans requête ; côté API, vide, absent ou > 190 caractères → `422
  {error: "Validation échouée", fields: {displayName}}`.
- **E2 — Pas de session** (étapes 5, A1, A2) : `401 « Authentification
  requise »`.
- **E3 — Jeton CSRF absent ou invalide** : `403 « Jeton CSRF absent ou
  invalide »`, rien ne change.
- **E4 — Image refusée par le serveur** (A1) : `422` avec l'un des messages
  « Données d'image invalides (base64 attendu) », « Format non supporté :
  seuls JPEG, PNG et WebP sont acceptés. », « Image vide. », « Image trop
  lourde (N Ko, maximum 200 Ko). », « Le contenu du fichier ne correspond pas à
  une image PNG/JPEG/WebP. ». Le site affiche le message serveur.
- **E5 — Image illisible par le navigateur** (A1) : le chargement ou
  l'encodage échoue → « Image non prise en charge (JPEG, PNG ou WebP). », sans
  requête.

## Règles de gestion

- **RG1** — Le nom affiché est l'identifiant « en clair » : 1 à 190
  caractères (comptés en caractères), espaces de bord retirés.
- **RG2** — Le serveur ne fait jamais confiance au client : liste blanche de
  types, 200 Ko maximum (204 800 octets), magic number réel (`FF D8 FF`,
  signature PNG, `RIFF….WEBP`). Le redimensionnement client n'est qu'un
  confort.
- **RG3** — L'avatar vit en base (pas de fichier sur le serveur) : il part
  avec le compte (UC-CPT-06) et peut être retiré indépendamment.
- **RG4** — Les mutations portent sur le compte de la session uniquement ; la
  lecture de l'avatar est publique mais ne sert que les octets de l'image.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Nom affiché | `users.display_name` ; visible des personnes liées (cartographe, garantie figée à la signature) |
| Photo | `users.avatar` + `avatar_mime` ; facultative (consentement) ; retrait indépendant ; purge avec le compte (registre RGPD §1) |
| Fichier d'origine | Jamais transmis : seul le rendu redimensionné part du navigateur |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/AccountView.jsx` — `handleSaveName`, `handleAvatarFile`, `handleAvatarDelete` | Édition du nom, choix / retrait de la photo, messages |
| Front | `web/src/lib/resize-image.js` — `resizeAvatar`, `AVATAR_SIZE`, `MAX_AVATAR_BYTES` | Recadrage, mise à l'échelle, encodage borné |
| Front | `web/src/components/Avatar.jsx` — `Avatar`, `initials` | Image ou initiales, repli en cas d'erreur de chargement |
| Front | `web/src/api/client.js` — `updateProfile`, `uploadAvatar`, `deleteAvatar`, `avatarUrl` | Appels, cassage de cache, `humanome:auth` |
| Front | `web/src/App.jsx` | Identité (avatar + nom) dans le panneau de navigation |
| API | `PATCH /api/auth/me`, `PUT`/`DELETE /api/auth/me/avatar`, `GET /api/users/{id}/avatar` — `api/src/routes/auth.php` | Orchestration, décodage base64 / data-URL |
| Domaine | `api/src/Media/AvatarValidator.php` | Type, taille, magic number |
| Domaine | `api/src/Auth/Users.php` — `updateDisplayName`, `setAvatar`, `deleteAvatar`, `getAvatar` | Persistance |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CPT-03-U01 | `AvatarValidator::validate` | JPEG, PNG, WebP réels acceptés | `api/tests/UseCases/Unit/UcCpt03GererProfilTest.php` |
| UC-CPT-03-U02 | `AvatarValidator::validate` | GIF, SVG, type vide ou non normalisé refusés (RG2) | idem |
| UC-CPT-03-U03 | `AvatarValidator::validate` | Vide refusé ; 204 800 octets acceptés, 204 801 refusés | idem |
| UC-CPT-03-U04 | `AvatarValidator::validate` | Magic number incohérent, WebP tronqué refusés | idem |
| UC-CPT-03-U05 | `Users::updateDisplayName` | Mise à jour ; ligne supprimée intacte | idem |
| UC-CPT-03-U06 | `Users::setAvatar`, `getAvatar`, `deleteAvatar` | Aller-retour binaire exact, retrait (RG3) | idem |
| UC-CPT-03-U07 | `Users::getAvatar` | Inconnu / supprimé → `null` ; comptes indépendants (RG4) | idem |
| UC-CPT-03-U08 | `initials` | 2 initiales, 1 mot, vide → « ? » | `web/test/usecases/unit/uc-cpt-03-gerer-profil.test.jsx` |
| UC-CPT-03-U09 | `avatarUrl` | URL relative, encodage, version anti-cache | idem |
| UC-CPT-03-U10 | `Avatar` | Image puis repli sur initiales à l'erreur de chargement | idem |
| UC-CPT-03-U11 | `resizeAvatar` | Recadrage carré centré (portrait), 256 × 256, WebP | idem |
| UC-CPT-03-U12 | `MAX_AVATAR_BYTES`, `AVATAR_SIZE` | Plafond client = plafond serveur | idem |
| UC-CPT-03-U13 | `updateProfile`, `uploadAvatar`, `deleteAvatar` | Méthodes, corps, `X-CSRF-Token`, `humanome:auth` | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-03-F01 | Nominal | API | PATCH → 200 `{user}` nom nettoyé, `/me` et base à jour | `api/tests/UseCases/Functional/UcCpt03GererProfilTest.php` |
| UC-CPT-03-F02 | A1 | API | PUT PNG puis JPEG → 200 ; image restituée à l'octet près, type, cache privé | idem |
| UC-CPT-03-F03 | A1 | API | Data-URL sans `mime`, base64 coupé de retours à la ligne | idem |
| UC-CPT-03-F04 | A2 | API | DELETE 204 idempotent, image 404, `hasAvatar` faux | idem |
| UC-CPT-03-F05 | A4 | API | Lecture anonyme ; sans photo / inconnu → 404 | idem |
| UC-CPT-03-F06 | E1 | API | 422 (vide, blanc, absent, 191 caractères) ; 190 caractères acceptés | idem |
| UC-CPT-03-F07 | E2, E3 | API | 401 sans session ; 403 sans jeton ; rien ne change | idem |
| UC-CPT-03-F08 | E4 | API | Cinq refus 422 avec leurs messages ; rien stocké | idem |
| UC-CPT-03-F09 | Nominal | IHM | `<App/>` : Modifier → Enregistrer, PATCH + CSRF, profil et navigation à jour | `web/test/usecases/functional/uc-cpt-03-gerer-profil.test.jsx` |
| UC-CPT-03-F10 | A1 | IHM | Fichier redimensionné envoyé, image `?v=1`, navigation avec photo | idem |
| UC-CPT-03-F11 | A2 | IHM | Retrait → initiales | idem |
| UC-CPT-03-F12 | A3 | IHM | Annuler sans requête | idem |
| UC-CPT-03-F13 | A4 | IHM | Image en échec → initiales | idem |
| UC-CPT-03-F14 | E1 | IHM | Refus local du nom vide ; 422 serveur affiché | idem |
| UC-CPT-03-F15 | E4 | IHM | Message 422 du serveur, pas d'avatar | idem |
| UC-CPT-03-F16 | E5 | IHM | Image illisible → message local, aucune requête | idem |

### Tests existants liés (non-régression)

- `api/tests/AuthAvatarTest.php` — PATCH nom, PUT JPEG/PNG/WebP, refus, DELETE, GET 200/404, purge, session, IDOR.
- `web/src/components/Avatar.test.jsx`, `web/src/lib/resize-image.test.js` — composant et encodage borné.
- `web/src/views/AccountView.test.jsx` — édition du nom, envoi et retrait de la photo.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCpt03
cd web && npx vitest run test/usecases --testNamePattern UC-CPT-03
```

## Limites

- Un refus `422` du `PATCH` n'affiche que le message général « Validation
  échouée » (le détail par champ n'est pas repris) ; en pratique le champ est
  borné à 190 caractères et le nom vide est refusé localement.
- L'avatar de la navigation est chargé sans paramètre de version : après un
  remplacement, le navigateur peut afficher l'ancienne image jusqu'à 5 minutes
  (`Cache-Control: private, max-age=300`) ; le profil, lui, casse le cache.
- Le dernier recours d'encodage (JPEG 0,6) n'est pas recontrôlé côté client :
  s'il dépasse encore 200 Ko, c'est le serveur qui refuse (E4).
