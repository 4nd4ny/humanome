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
   Exceptions : `/api/admin/migrate` (jeton propre, ADR-008) et
   `login`/`register` (pas encore de session porteuse de jeton ; protégés par
   rate-limit). Le jeton est délivré par `GET /api/auth/me` et à l'ouverture de
   session (réponses de `login` et `register`).

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

### P8 — Espace apprenant (cahier §3.2, §6)

| Route | Méthode | Accès |
|---|---|---|
| `/api/cartographies` (opt-in stockage serveur) | GET/POST/PUT/DELETE | `apprenant` — propriétaire uniquement |
| `/api/cartographies/{id}/share` (lien + mdp) | POST/DELETE | `apprenant` — propriétaire uniquement |
| `/api/share/{token}` (consultation employeur) | GET/POST (mdp) | Public — protégé par le mot de passe du lien, pas par un compte (§3.6) |
| `/api/account/export` (archive pivot AD-6) | GET | Connecté — son propre compte |
| `/api/account/import` | POST | Connecté — son propre compte |
| `/api/training/progress` | GET/PUT | Connecté — sa propre progression (contenu de formation public en lecture, §4.6) |
| `/api/account/api-keys` (clés chiffrées, AD-4) | GET/PUT/DELETE | Connecté — ses propres clés |

### P9 — Espace cartographe (cahier §3.3)

| Route | Méthode | Accès |
|---|---|---|
| `/api/cartographe/queue` (cartos « partagées avec mon cartographe ») | GET | `cartographe` — apprenants rattachés uniquement |
| Rattachement apprenant ↔ cartographe (invitation/acceptation) | POST | `apprenant` (invite ou accepte) + `cartographe` |
| Annotations, propositions de correction | POST/PUT | `cartographe` — cartographies partagées avec lui |
| « Valider et garantir » (signature horodatée) | POST | `cartographe` — jamais automatique (§8) |

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
- Tests : `api/tests/AuthRoutesTest.php`, `AuthCsrfTest.php`,
  `AuthRateLimitTest.php`, `AuthRequireRoleTest.php`,
  `AuthAccountDeletionTest.php`.
