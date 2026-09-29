# UC-CPT-03 — Gérer son profil (nom affiché, avatar)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Tout utilisateur inscrit et connecté |
| **Acteurs secondaires** | Tout client HTTP, anonyme compris, peut lire `GET /api/users/{id}/avatar` ; dans l'IHM, l'avatar n'est affiché qu'à son propriétaire (navigation et profil) — aucune vue cartographe ni établissement ne l'affiche |
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
  (qualité 0,85), sinon JPEG 0,85 (encodeur WebP absent ou image trop
  lourde), sinon JPEG 0,6, pour rester sous 200 Ko (`resizeAvatar`). Le site
  envoie `PUT /api/auth/me/avatar {avatar (base64), mime}`. Le serveur
  normalise le type déclaré (minuscules, blancs retirés), décode le base64
  strict (une data-URL `data:image/…;base64,…` est tolérée et fournit le type
  **seulement s'il manque** : un `mime` explicite prime ; les blancs sont
  ignorés), valide avec `AvatarValidator` puis stocke et répond
  `200 {status: "ok", mime, size}`. Le site affiche l'image
  (`api/users/{id}/avatar?v=<n>` pour casser le cache), « Photo de profil mise
  à jour. », et les boutons « Changer la photo » / « Retirer la photo ».
- **A2 — Retirer la photo** (étape 2) : « Retirer la photo » →
  `DELETE /api/auth/me/avatar` → `204` (idempotent) ; le site revient aux
  initiales (« Photo de profil retirée. »).
- **A3 — Annuler l'édition du nom** (étape 3) : « Annuler » referme le champ
  sans requête.
- **A4 — Lecture publique de l'avatar (API) et repli sur les initiales
  (IHM)** : `GET /api/users/{id}/avatar` est public en lecture (une photo de
  profil n'est pas un secret) : `200` avec le type stocké et `Cache-Control:
  private, max-age=300`, `404 « Avatar introuvable »`, ou `503 « Service
  indisponible »` sans base configurée. Dans l'IHM, seul le propriétaire voit
  son avatar (navigation, profil) ; si l'image ne se charge pas, le composant
  `Avatar` retombe sur les initiales (1 ou 2 lettres).

## Scénarios d'erreur

- **E1 — Nom invalide** (étapes 3 et 5) : vide ou blanc → « Le nom affiché est
  requis. » sans requête ; côté API, vide, blanc ASCII, absent ou > 190
  caractères → `422 {error: "Validation échouée", fields: {displayName}}` (un
  nom fait d'espaces Unicode est accepté par l'API : AN3).
- **E2 — Pas de session** (étapes 5, A1, A2) : `401 « Authentification
  requise »`.
- **E3 — Jeton CSRF absent ou invalide** : `403 « Jeton CSRF absent ou
  invalide »`, rien ne change.
- **E4 — Image refusée par le serveur** (A1) : `422` avec l'un des messages
  « Données d’image invalides (base64 attendu) » (base64 invalide **ou avatar
  vide**), « Format non supporté : seuls JPEG, PNG et WebP sont acceptés. »,
  « Image trop lourde (N Ko, maximum 200 Ko). », « Le contenu du fichier ne
  correspond pas à une image PNG/JPEG/WebP. ». Le message « Image vide. »
  d'`AvatarValidator` est **inatteignable** par l'API (un avatar vide est
  refusé avant, par le contrôle base64) : seul UC-CPT-03-U03 l'exerce. Le
  site affiche le message serveur ; la photo existante n'est pas touchée.
- **E5 — Image illisible par le navigateur** (A1) : le chargement ou
  l'encodage échoue → « Image non prise en charge (JPEG, PNG ou WebP). », sans
  requête. Le même message s'affiche aussi, à tort, quand l'envoi d'une image
  valide échoue au niveau réseau ou reçoit une réponse non JSON (AN1).

## Règles de gestion

- **RG1** — Le nom affiché est l'identifiant « en clair » : 1 à 190
  caractères (comptés en caractères par l'API), espaces de bord retirés —
  côté serveur, seuls les blancs ASCII (espace, `\t`, `\n`, `\r`, `\v`, `\0`)
  sont retirés par `trim()` ; l'IHM (`String.prototype.trim`) retire aussi les
  espaces Unicode (AN3).
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
| Front | `web/src/App.jsx` | Identité (avatar + nom) dans le panneau de navigation, relue à chaque `humanome:auth` |
| API | `PATCH /api/auth/me`, `PUT`/`DELETE /api/auth/me/avatar`, `GET /api/users/{id}/avatar` — `api/src/routes/auth.php` | Orchestration, décodage base64 / data-URL |
| Domaine | `api/src/Media/AvatarValidator.php` | Type, taille, magic number |
| Domaine | `api/src/Auth/Users.php` — `updateDisplayName`, `setAvatar`, `deleteAvatar`, `getAvatar` | Persistance |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CPT-03-U01 | `AvatarValidator::validate` | JPEG, PNG, WebP réels acceptés | `api/tests/UseCases/Unit/UcCpt03GererProfilTest.php` |
| UC-CPT-03-U02 | `AvatarValidator::validate` | GIF, SVG, type vide ou non normalisé refusés (le validateur seul ne normalise pas ; la route le fait : F03) ; type jugé **avant** vacuité et taille (RG2) | idem |
| UC-CPT-03-U03 | `AvatarValidator::validate` | Vide refusé (« Image vide. », inatteignable par HTTP) ; 204 800 octets acceptés, 204 801 refusés | idem |
| UC-CPT-03-U04 | `AvatarValidator::validate` | Magic number incohérent, WebP tronqué refusés | idem |
| UC-CPT-03-U05 | `Users::updateDisplayName` | Mise à jour ; ligne supprimée intacte | idem |
| UC-CPT-03-U06 | `Users::setAvatar`, `getAvatar`, `deleteAvatar` | Aller-retour binaire exact, retrait (RG3) | idem |
| UC-CPT-03-U07 | `Users::getAvatar` | Inconnu / supprimé → `null` ; comptes indépendants (RG4) | idem |
| UC-CPT-03-U08 | `initials` | 2 initiales, 1 mot, vide → « ? » | `web/test/usecases/unit/uc-cpt-03-gerer-profil.test.jsx` |
| UC-CPT-03-U09 | `avatarUrl` | URL relative, encodage, version anti-cache | idem |
| UC-CPT-03-U10 | `Avatar` | Image puis repli sur initiales à l'erreur de chargement | idem |
| UC-CPT-03-U11 | `resizeAvatar` | Recadrage carré centré (portrait), 256 × 256, WebP | idem |
| UC-CPT-03-U12 | `MAX_AVATAR_BYTES`, `AVATAR_SIZE` | Plafond client = `MAX_BYTES` lu dans `api/src/Media/AvatarValidator.php` | idem |
| UC-CPT-03-U13 | `updateProfile`, `uploadAvatar`, `deleteAvatar` | URL, méthodes, corps (aucun pour DELETE), `X-CSRF-Token`, `humanome:auth` | idem |
| UC-CPT-03-U14 | `AccountView` — `handleSaveName` (seul) | Échec hors API → « Enregistrement impossible. », édition conservée | idem |
| UC-CPT-03-U15 | `AccountView` — `handleAvatarDelete` (seul) | Refus API → message serveur, photo conservée ; échec réseau → « Suppression impossible. » | idem |
| UC-CPT-03-U16 | `AccountView` — sélecteur de photo | `accept="image/jpeg,image/png,image/webp"` (A1) | idem |
| UC-CPT-03-U17 | `App` (couture `fetchMeFn`) | Identité de navigation relue sur `humanome:auth` : initiales → photo (URL sans version) + nouveau nom | idem |
| UC-CPT-03-U18 | `resizeAvatar` | Repli JPEG 0,85 sans encodeur WebP ; image trop lourde → WebP 0,85, JPEG 0,85, JPEG 0,6 rendu au-delà du plafond | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-03-F01 | Nominal | API | PATCH → 200 `{user}` nom nettoyé, `/me` et base à jour | `api/tests/UseCases/Functional/UcCpt03GererProfilTest.php` |
| UC-CPT-03-F02 | A1 | API | PUT PNG puis JPEG → 200 ; image restituée à l'octet près, type, cache privé | idem |
| UC-CPT-03-F03 | A1 | API | Data-URL sans `mime`, base64 coupé de retours à la ligne ; `mime` normalisé (`' IMAGE/PNG '`) ; `mime` explicite prioritaire sur la data-URL | idem |
| UC-CPT-03-F04 | A2 | API | DELETE 204 idempotent, image 404, `hasAvatar` faux | idem |
| UC-CPT-03-F05 | A4 | API | Lecture anonyme ; sans photo / inconnu → 404 ; sans base → 503 | idem |
| UC-CPT-03-F06 | E1 | API | 422 (vide, blanc, absent, 191 caractères) ; 190 caractères acceptés ; **anomalie AN3 figée** : nom d'espaces Unicode accepté | idem |
| UC-CPT-03-F07 | E2, E3 | API | Photo préexistante ; 401 « Authentification requise » sans session ; 403 sans jeton et avec un faux jeton ; nom et photo intacts | idem |
| UC-CPT-03-F08 | E4 | API | Photo préexistante ; cinq refus 422, quatre messages distincts ; photo d'origine intacte | idem |
| UC-CPT-03-F09 | Nominal | IHM | `<App/>` : Modifier → Enregistrer, PATCH + CSRF, profil et navigation à jour | `web/test/usecases/functional/uc-cpt-03-gerer-profil.test.jsx` |
| UC-CPT-03-F10 | A1 | IHM | Fichier redimensionné envoyé, image `?v=1`, navigation avec photo | idem |
| UC-CPT-03-F11 | A2 | IHM | Retrait → initiales | idem |
| UC-CPT-03-F12 | A3 | IHM | Annuler sans requête | idem |
| UC-CPT-03-F13 | A4 | IHM | Propre photo en échec de chargement → repli sur les initiales | idem |
| UC-CPT-03-F14 | E1 | IHM | Refus local du nom vide ; 422 serveur affiché | idem |
| UC-CPT-03-F15 | E4 | IHM | Message 422 du serveur, pas d'avatar | idem |
| UC-CPT-03-F16 | E5 | IHM | Image illisible → message local, aucune requête | idem |
| UC-CPT-03-F17 | RG4 | API | Les PATCH, PUT et DELETE de Bob ne touchent ni le nom ni la photo d'Ada | `api/tests/UseCases/Functional/UcCpt03GererProfilTest.php` |
| UC-CPT-03-F18 | E5, AN1 | IHM | **Anomalie figée** : PUT perdu (réseau) → « Image non prise en charge… » après une requête | `web/test/usecases/functional/uc-cpt-03-gerer-profil.test.jsx` |
| UC-CPT-03-F19 | A1, AN2 | IHM | **Anomalie figée** : après un échec de chargement, la nouvelle photo envoyée reste en initiales | idem |

### Tests existants liés (non-régression)

- `api/tests/AuthAvatarTest.php` — PATCH nom, PUT JPEG/PNG/WebP, refus, DELETE, GET 200/404, purge, session, IDOR.
- `web/src/components/Avatar.test.jsx`, `web/src/lib/resize-image.test.js` — composant et encodage borné.
- `web/src/views/AccountView.test.jsx` — édition du nom, envoi et retrait de la photo.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCpt03
cd web && npx vitest run test/usecases --testNamePattern UC-CPT-03
```

## Anomalies constatées

- **AN1 — Échec réseau présenté comme un format refusé.** `handleAvatarFile`
  affiche « Image non prise en charge (JPEG, PNG ou WebP). » pour toute erreur
  qui n'est pas une `ApiError`. Or `ApiUnavailableError` n'hérite pas
  d'`ApiError` et le client la lève sur une panne réseau ou toute réponse non
  JSON (413 ou 5xx HTML de l'hébergeur mutualisé) : une image valide dont
  l'envoi échoue est présentée comme un format non supporté, après une
  requête. Figé par UC-CPT-03-F18.
- **AN2 — Repli sur les initiales définitif jusqu'au remontage.** Dans
  `Avatar`, l'état `failed` n'est jamais remis à zéro quand `version` ou
  `hasAvatar` change, et `AccountView` ne passe pas de `key` : après un échec
  de chargement (F13), une nouvelle photo envoyée avec succès affiche « Photo
  de profil mise à jour. » mais toujours les initiales, contrairement à A1.
  Figé par UC-CPT-03-F19.
- **AN3 — Nom fait d'espaces Unicode accepté par l'API.** `trim()` de PHP ne
  retire que les blancs ASCII : un nom composé uniquement d'espaces Unicode
  (U+00A0, U+3000…) n'est pas vide pour l'API, qui répond `200` ; le nom
  affiché devient invisible pour les personnes liées. L'IHM le refuse
  localement (`String.prototype.trim`). Figé par UC-CPT-03-F06.

## Limites

- Un refus `422` du `PATCH` n'affiche que le message général « Validation
  échouée » (le détail par champ n'est pas repris) ; en pratique le champ est
  borné à 190 caractères et le nom vide est refusé localement.
- Le champ du nom est borné par `maxLength={190}`, qui compte des unités
  UTF-16 : un nom contenant des émojis est tronqué plus tôt que les
  « 190 caractères » comptés par l'API.
- L'avatar de la navigation est chargé sans paramètre de version : après un
  remplacement, le navigateur peut afficher l'ancienne image jusqu'à 5 minutes
  (`Cache-Control: private, max-age=300`) ; le profil, lui, casse le cache.
- Le dernier recours d'encodage (JPEG 0,6) n'est pas recontrôlé côté client :
  s'il dépasse encore 200 Ko, c'est le serveur qui refuse (E4).
