# Matrice d'autorisations — rôles → routes API

**Source :** cahier des charges §2 (glossaire des rôles) et §3 (cas d'utilisation par profil).
**Implémentation :** `api/src/Middleware/RequireRole.php` (P3.3) — garde par rôle posée route par route :

```php
$app->post('/referentiel/versions', $handler)
    ->add(RequireRole::any('epistemiarque', 'admin'));
```

## Principes

1. **Le visiteur est l'absence de session** (cahier §2). Il n'existe pas de rôle
   `visiteur` en base : une route « visiteur » est une route sans garde.
2. **401 vs 403** : `401` = pas de session authentifiée (visiteur) ;
   `403` = session valide mais aucun des rôles requis (ou jeton CSRF invalide).
3. **Les rôles sont cumulables** (table `user_roles`, n-n) et relus en base à
   chaque requête : une attribution ou une révocation est effective immédiatement.
4. **`admin` n'est pas un super-rôle implicite** : chaque garde liste
   explicitement les rôles admis (`RequireRole::any(..., 'admin')` quand le
   cahier le justifie).
5. **Le rôle ne suffit pas toujours** : les routes sur des ressources possédées
   (cartographies, clés API, progression) vérifient EN PLUS la propriété
   (`user_id` de la ressource = utilisateur de la session). Le rôle ouvre la
   porte, la propriété délimite la pièce.
6. **CSRF** (P3.3, `api/src/Middleware/CsrfMiddleware.php`) : toute méthode
   mutante (POST/PUT/PATCH/DELETE) sur `/api/**` exige l'en-tête
   `X-CSRF-Token` égal au jeton de session (double-submit, `hash_equals`).
   Exceptions : `/api/admin/migrate` et `/api/admin/import-*` (jeton propre
   `X-Migrate-Token`, ADR-008), `login`/`register` (pas encore de session
   porteuse de jeton ; protégés par rate-limit), et `POST /api/llm` (M6) :
   route visiteur déjà défendue par ses propres gardes (preuve de travail à
   usage unique, honeypot, quotas IP/horaire et budget quotidien — P6) ; un
   utilisateur connecté doit pouvoir l'appeler exactement comme un visiteur,
   sans en-tête CSRF. Exemption sûre : la route ne lit ni n'écrit AUCUN état
   de compte (la session n'y confère rien), donc un tir forgé cross-site n'y
   gagne rien de plus qu'un tir anonyme. Le jeton est délivré par
   `GET /api/auth/me` et à l'ouverture de session (réponses de `login` et
   `register`).

## Routes actuelles (P0–P3)

| Route | Méthode | Accès | Garde |
|---|---|---|---|
| `/api/health` | GET | Public (visiteur) | — |
| `/api/admin/migrate` | POST | Technique (script de déploiement, ADR-008) | Jeton `MIGRATE_TOKEN` dédié, hors rôles |
| `/api/auth/register` | POST | Visiteur | Rate-limit par IP (10/h) ; rôle `apprenant` attribué par défaut |
| `/api/auth/login` | POST | Visiteur | Rate-limit par IP+email (5 / 15 min, puis 429 à délai progressif) |
| `/api/auth/logout` | POST | Tout utilisateur connecté | Session + CSRF |
| `/api/auth/me` | GET | Tout utilisateur connecté | Session (401 sinon) |
| `/api/auth/account` | DELETE | Tout utilisateur connecté (son propre compte) | Session + CSRF ; purge réelle + audit anonymisé (§6.3) |

## Routes actuelles (P8 — M6) : espace apprenant

Toutes les routes mutantes passent le CSRF global (sauf exemptions du
principe 6). « Propriétaire » = `user_id` de la ressource = utilisateur de la
session ; un id étranger répond `404` exactement comme un id inexistant
(pas d'oracle d'existence).

| Route | Méthode | Accès | Garde |
|---|---|---|---|
| `/api/cartographies` | POST | `apprenant` | Rôle + CSRF ; **le POST est l'opt-in stockage serveur** (`opt_in_at = NOW()` posé par l'INSERT, §6.2) |
| `/api/cartographies` | GET | `apprenant` | Rôle ; liste de métadonnées, **jamais** le document |
| `/api/cartographies/{id}` | GET | `apprenant`, propriétaire | Rôle + propriété ; document inclus |
| `/api/cartographies/{id}` | PATCH | `apprenant`, propriétaire | Rôle + propriété + CSRF ; titre/visibilité uniquement |
| `/api/cartographies/{id}` | DELETE | `apprenant`, propriétaire | Rôle + propriété + CSRF ; purge réelle (ligne + share_links par FK) |
| `/api/cartographies/{id}/share` | POST | `apprenant`, propriétaire | Rôle + propriété + CSRF ; jeton stocké haché (sha256), mdp en `password_hash` ; audit `share_created` (ids seulement) |
| `/api/cartographies/{id}/shares` | GET | `apprenant`, propriétaire | Rôle + propriété ; jamais le jeton en clair |
| `/api/shares/{shareId}` | DELETE | `apprenant`, propriétaire | Rôle + propriété + CSRF ; révocation (`revoked_at`) ; audit `share_revoked` |
| `/api/share/{token}` | POST (mdp) | **Public** (employeur, §3.6 — pas de compte) | Rate-limit IP (buckets hachés, /64 IPv6 via `ClientIp`) ; 404 homogène inconnu/expiré/révoqué (anti-énumération, vérif factice du mdp) ; 403 mauvais mdp ; depuis P9, `garantie` = état figé `{par, date, revisionId}` ou `null`, et le document servi est **celui de la révision garantie** quand `revisionId` est présent (§8). Si le navigateur porte une session, le SPA joint son jeton CSRF comme partout |
| `/api/training/progress` | GET/PUT | Connecté (tout rôle), sa propre progression | Session (+ CSRF sur PUT) |
| `/api/keys` | PUT | Connecté, ses propres clés | Session + CSRF ; chiffrement sodium `crypto_secretbox`, nonce par entrée, clé maîtresse `SODIUM_MASTER_KEY` (hors webroot) ; 503 explicite si non configurée |
| `/api/keys` | GET | Connecté, ses propres clés | Session ; `[{provider, createdAt}]`, **jamais** la clé |
| `/api/keys/{provider}` | GET | Connecté, **propriétaire authentifié seulement** | Session ; renvoie la clé déchiffrée — synchronisation AD-4 : le run s'exécute dans le navigateur (ADR-001) et a besoin de la clé côté client |
| `/api/keys/{provider}` | DELETE | Connecté, ses propres clés | Session + CSRF ; suppression réelle |
| `/api/prompt-packages`, `/api/prompt-packages/{id}/{version}` | GET | Public (comme le référentiel) | — ; versions **publiées** uniquement : un paquet publié est un artefact de méthode, sans donnée d'apprenant (la matrice P10 ci-dessous garde « connecté » pour l'atelier complet) |
| `/api/admin/import-prompt-package` | POST | Technique (script de déploiement, ADR-008) | Jeton `MIGRATE_TOKEN` dédié, hors rôles ; import idempotent par hash |

## Routes prévues (P4–P12) — matrice cible

Légende : ✔ = accessible (avec vérification de propriété le cas échéant),
— = refusé. « Connecté » = tout rôle. Statut : **prévu**, à confirmer au
moment du prompt correspondant.

### P4 — Référentiel (cahier §4.1, §3.5)

| Route | Méthode | Visiteur | Apprenant | Cartographe | Promptologue | Épistémiarque | Employeur | Établissement | Admin |
|---|---|---|---|---|---|---|---|---|---|
| `/api/referentiel` (dernière version publiée) | GET | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/api/referentiel/versions`, `/versions/{v}`, diff | GET | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Brouillons : création, édition, relecture | POST/PUT | — | — | — | — | ✔ | — | — | ✔ |
| Publication d'une version (immuable) | POST | — | — | — | — | ✔ | — | — | ✔ |

### P6 — Proxy LLM et démo (cahier §3.1)

| Route | Méthode | Accès |
|---|---|---|
| `/api/llm` (proxy plateforme) | POST | Visiteur et connectés — garde-fous anti-abus (quotas IP/global, preuve de travail), pas de rôle |

### P8 — Espace apprenant (cahier §3.2, §6) — **implémenté en M6**, voir la matrice « Routes actuelles (P8) » ci-dessus

Écarts au prévisionnel, actés par le contrat d'API M6 :
- l'édition d'une cartographie est un `PATCH` (titre/visibilité), pas un `PUT` ;
- la révocation d'un lien est `DELETE /api/shares/{shareId}` (le lien a sa
  propre identité), pas un DELETE sur `/cartographies/{id}/share` ;
- les clés vivent sous `/api/keys` (et non `/api/account/api-keys`) ;
- l'archive export/import (AD-6) reste **locale au navigateur** (client-first,
  §6.1) : pas de routes `/api/account/export|import` en v1 — l'archive se
  construit côté client depuis le portfolio local + les cartographies.

### P9 — Espace cartographe (cahier §3.3, §8) — **implémenté en M7**

Principe d'accès : « cartographe lié » = lien `cartographe_links` créé par
l'acceptation d'un code d'invitation émis par l'apprenant, **et** cartographie
en visibilité `cartographe` ou `publique` (l'apprenant reste maître : un
retour à `privee` coupe l'accès immédiatement). Tout refus (id inconnu,
apprenant non lié, visibilité `privee`) répond le **même 404** (pas d'oracle
d'existence). Codes d'invitation : 10 caractères A-Z2-9, 30 jours, usage
unique, homogènes en 404 (inconnu = expiré = déjà utilisé = auto-lien).

| Route | Méthode | Accès | Garde |
|---|---|---|---|
| `/api/cartographe/invitations` | POST | `apprenant` | Rôle + CSRF ; plafond de 10 codes en attente (429 au-delà) → 201 `{code, expiresAt}` |
| `/api/cartographe/invitations` | GET | `apprenant` | Rôle ; ses codes avec statut (`en_attente`/`acceptee`/`expiree`) |
| `/api/cartographe/invitations/{code}/accept` | POST | `cartographe` | Rôle + CSRF ; 404 homogène ; auto-lien refusé ; idempotent sur lien existant ; audit `invitation_accepted` (ids seulement) |
| `/api/cartographe/apprentis` | GET | `cartographe` | Rôle ; ses apprenants liés |
| `/api/cartographe/cartographies` | GET | `cartographe` | Rôle ; file des cartos des apprenants liés, visibilité `cartographe`/`publique` ; métadonnées, **jamais** le document |
| `/api/cartographe/cartographies/{id}` | GET | `cartographe` lié | Rôle + lien + visibilité ; document + annotations + révisions (méta) + garantie |
| `/api/cartographies/{id}/annotations` | POST/GET | Propriétaire **ou** `cartographe` lié | Accès résolu par `Links::access()` (+ CSRF sur POST) ; `{competenceCode, type: commentaire\|hallucination\|oubli, texte}` |
| `/api/annotations/{annotationId}` | DELETE | **Auteur seul** | + CSRF ; annotation étrangère = 404 comme inexistante |
| `/api/cartographies/{id}/revisions` | POST | Propriétaire **ou** `cartographe` lié | + CSRF ; document **validé au schéma serveur** (`Validation.php`, type identique à la carto, 422 sinon) ; une nouvelle révision **retire la garantie** en place (§8, audit `garantie_retiree`) |
| `/api/cartographies/{id}/revisions` | GET | Propriétaire **ou** `cartographe` lié | Métadonnées seulement |
| `/api/revisions/{revisionId}` | GET | Propriétaire **ou** `cartographe` lié | Document ; l'accès suit la cartographie parente |
| `/api/cartographies/{id}/garantie` | POST | `cartographe` **lié uniquement** | + CSRF ; jamais le propriétaire (on ne garantit pas sa propre carto, §8 — 404), jamais automatique ; fige `{par, date, revisionId?}` ; 409 si déjà garantie par un **autre** cartographe (une signature humaine ne s'écrase pas en silence) ; re-pose par le même = remplacement ; audit `garantie_posee` |
| `/api/cartographies/{id}/garantie` | DELETE | Le cartographe **signataire** | + CSRF ; toujours possible (c'est son nom) même si la visibilité a changé ; audit `garantie_retiree` |

Purge RGPD (migration 008) : suppression du compte **apprenant** → cascade
cartographies → annotations/révisions/garanties + invitations + liens ;
suppression du compte **cartographe** → liens, ses annotations et sa garantie
purgés, les révisions restent à l'apprenant **anonymisées** (`author_id` SET
NULL — le document corrigé est une donnée de l'apprenant), invitations
anonymisées (`accepted_by` SET NULL).

### P10 — Espace promptologue (cahier §3.4)

| Route | Méthode | Accès |
|---|---|---|
| `/api/prompts` (packages et versions publiées) | GET | Connecté (sélection d'une version pour un run) |
| Brouillons : création, édition, banc d'essai | POST/PUT | `promptologue` — un brouillon ne tourne que chez son auteur |
| Publication d'une version (immuable) | POST | `promptologue` |
| Version par défaut proposée aux apprenants | POST | `promptologue` (proposition) + `admin` (validation) |
| Comparaison au Golden Prompt | POST | `promptologue` — si autorisée par `admin` (§7) |

### P11 — Établissements (cahier §3.7)

| Route | Méthode | Accès |
|---|---|---|
| Cohortes, codes d'invitation | GET/POST | `etablissement` — ses propres cohortes |
| Cartographies de ses élèves | GET | `etablissement` — consentement visible, ses élèves uniquement |
| Budget, fournisseur LLM, suivi de masse | GET/PUT | `etablissement` — son propre compte |

### P12 — Administration (cahier §3.8, §4.10)

| Route | Méthode | Accès |
|---|---|---|
| Golden Prompt (import, autorisations d'accès) | GET/POST | `admin` |
| Clés plateforme, plafonds démo, config | GET/PUT | `admin` |
| Attribution / révocation des rôles | POST/DELETE | `admin` |

### Backlog (hors v1, annexe B du plan)

Marketplace employeur (bibliothèque payante des cartographies consenties,
§4.8) : accès `employeur` payant — la v1 se limite au lien individuel
`/api/share/{token}`, qui ne requiert aucun compte.

## Traçabilité

- Rôles en base : migration `scripts/migrations/001_users_roles.sql`
  (7 rôles seedés ; le visiteur est l'absence de session).
- Sessions : `api/src/DbSessionHandler.php` (cookie HttpOnly, SameSite=Lax,
  Secure hors dev, régénération d'ID à la connexion).
- Garde : `api/src/Middleware/RequireRole.php` ; CSRF :
  `api/src/Middleware/CsrfMiddleware.php` ; routes :
  `api/src/routes/auth.php`.
- P8 (M6) : routes `api/src/routes/{cartographies,share,training,keys,packages}.php` ;
  domaine `api/src/Cartographies/`, `api/src/Share/`, `api/src/Keys/`,
  `api/src/Packages/` ; migration `scripts/migrations/007_cartographies_run_meta.sql` ;
  paquet par défaut `scripts/build-default-prompt-package.mjs` +
  `scripts/import-prompt-packages.php`.
- P9 (M7) : routes `api/src/routes/{cartographe,annotations}.php` (+ garantie
  dans `share.php`) ; domaine `api/src/Cartographe/` (`Invitations`, `Links`,
  `Annotations`, `Revisions`, `Garanties`) ; migration
  `scripts/migrations/008_cartographe_garanties_settings.sql`.
- Tests : `api/tests/AuthRoutesTest.php`, `AuthCsrfTest.php`,
  `AuthRateLimitTest.php`, `AuthRequireRoleTest.php`,
  `AuthAccountDeletionTest.php` ; P8 : `CartographiesTest.php`,
  `CartographiesCsrfTest.php` (matrice CSRF + exemption `/api/llm`),
  `CartographiesPurgeTest.php` (purge RGPD croisée avec 004/005),
  `ShareTest.php`, `TrainingTest.php`, `KeysTest.php`, `PackagesTest.php` ;
  P9 : `CartographeInvitationsTest.php`, `CartographeQueueTest.php`,
  `AnnotationsTest.php`, `CartographeRevisionsTest.php`,
  `CartographeGarantieTest.php` (partage public avec garantie),
  `CartographePurgeTest.php` (purge RGPD croisée avec 008).
