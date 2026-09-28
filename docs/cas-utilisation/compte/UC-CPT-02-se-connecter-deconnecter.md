# UC-CPT-02 — Se connecter et se déconnecter

| Champ | Valeur |
|---|---|
| **Acteur principal** | Tout utilisateur inscrit dont le compte est activé (UC-CPT-01) |
| **Acteurs secondaires** | Administrateur (lit le journal des connexions, UC-ADM-06) |
| **Portée** | humanome.xyz — `#/compte`, panneau de navigation ; `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §2 (le visiteur est l'absence de session), §4.5 (comptes), §6.5 (journalisation minimale) ; `docs/autorisations.md` (principes 1, 2 et 6 : 401/403, CSRF) |
| **Statut** | Implémenté (P3.2–P3.3 ; journal des connexions P12 ; `403 email_not_verified` en D5) |

## Objectif

Ouvrir une session authentifiée sur le navigateur courant pour accéder aux
fonctions de son compte et de ses rôles, puis la fermer proprement.

## Déclencheur

L'utilisateur ouvre `#/compte` (lien « Se connecter » de la navigation) ou
clique « Se déconnecter ».

## Préconditions

- Le compte existe et son email est confirmé (`email_verified_at` posé).
- L'API PHP est joignable (sinon A3).

## Garanties en cas de succès

- Connexion : une session serveur (table `sessions`) est liée au compte, sous
  un **identifiant de session neuf** (protection contre la fixation) ; le
  navigateur reçoit un cookie `humanome_sid` (HttpOnly, SameSite=Lax, Secure
  hors dev) et un jeton CSRF gardé **en mémoire** par le client ; la
  navigation affiche les familles des rôles du compte, l'identité (avatar ou
  initiales + nom) et « Se déconnecter ».
- Un événement `login` `{pays, reseau}` est journalisé (pays résolu localement,
  réseau tronqué /24 ou /48) ; le quota de connexion du couple IP + email est
  remis à zéro.
- Déconnexion : la ligne de session est supprimée, le cookie expiré, le jeton
  oublié ; le site revient à l'état visiteur.

## Garanties minimales (en cas d'échec)

- Aucune session n'est ouverte.
- Un email inconnu et un mauvais mot de passe produisent la même réponse, au
  même coût (vérification factice `Users::dummyHash`).
- Une déconnexion refusée laisse la session intacte.

## Scénario nominal

1. L'utilisateur ouvre `#/compte` ; le site appelle `GET /api/auth/me` → `401`
   et affiche l'onglet « Connexion ».
2. Il saisit email et mot de passe ; le site vérifie localement que les deux
   sont renseignés.
3. Le site envoie `POST /api/auth/login` `{email, password}` (route exemptée de
   CSRF).
4. Le serveur normalise l'email, vérifie le quota du seau `login:` +
   sha256(identité IP + « | » + email) (5 essais / 15 min), vérifie le mot de
   passe (Argon2id), contrôle que le compte est activé, remet le quota à zéro,
   ouvre la session (`Session::openForUser` : `session_regenerate_id(true)`,
   jeton CSRF de 64 hex, ligne liée au compte avec `ip_hash` = sha256 de l'IP),
   journalise `login` et répond `200 {user: {id, email, displayName, roles,
   hasAvatar}, csrfToken}`.
5. Le client mémorise le jeton et émet `humanome:auth` ; le profil s'affiche
   (email, nom affiché, rôles libellés, ex. « Apprenant, Cartographe ») ; le
   shell rappelle `GET /api/auth/me` et reconstruit la navigation.
6. Plus tard, l'utilisateur clique « Se déconnecter » dans son profil.
7. Le site envoie `POST /api/auth/logout` avec l'en-tête `X-CSRF-Token`.
8. Le serveur détruit la session (ligne supprimée, cookie expiré) → `204`.
9. Le client oublie le jeton, émet `humanome:auth` ; le profil laisse place au
   formulaire avec « Vous êtes déconnecté. » et la navigation redevient celle
   d'un visiteur (« Se connecter »).

## Scénarios alternatifs

- **A1 — Session déjà ouverte** (étape 1) : `GET /api/auth/me` → `200 {user,
  csrfToken}` ; le profil s'affiche directement et le client récupère le jeton
  de la session. Chaque navigateur a sa propre session et son propre jeton ;
  fermer l'une ne ferme pas l'autre.
- **A2 — Déconnexion depuis la navigation** (étape 6) : le bouton « Se
  déconnecter » du panneau appelle la même route, referme le panneau et ramène
  à l'accueil `#/`.
- **A3 — API injoignable** (étape 1) : copie statique, `file://` ou réseau
  coupé → l'espace compte affiche « L'espace compte est indisponible sur cette
  copie statique du site… ». Si la panne survient pendant la déconnexion, le
  site repasse quand même en état visiteur (déconnexion locale).
- **A4 — Cookie d'un compte purgé** (étape 1) : la purge a supprimé la session
  en cascade ; `GET /api/auth/me` répond `401` comme pour un visiteur.

## Scénarios d'erreur

- **E1 — Champ vide** (étape 2) : « Indiquez votre adresse email. » ou
  « Indiquez votre mot de passe. », sans requête ; appelée directement, l'API
  répond `422 « Email et mot de passe requis »` sans entamer le quota.
- **E2 — Identifiants invalides** (étape 4) : `401 « Identifiants invalides »`,
  identique pour un email inconnu ; l'échec est compté dans le quota et
  journalisé `login_failed` (avec l'identifiant du compte visé s'il existe,
  `null` sinon). Le site affiche « Email ou mot de passe incorrect. ».
- **E3 — Compte non activé** (étape 4) : `403 {error, code:
  "email_not_verified", email}` quand le mot de passe est bon ; pas de session,
  quota non consommé. Le site ouvre l'écran d'activation (UC-CPT-01 A3).
- **E4 — Trop de tentatives** (étape 4) : à partir du 6ᵉ essai pour le même
  couple IP (/64 en IPv6) + email, `429 « Trop de tentatives de connexion,
  réessayez plus tard »` avec `Retry-After` 30 s puis doublé à chaque essai
  (plafond 15 min), **même avec le bon mot de passe**. Une autre IP ou un autre
  email ne sont pas pénalisés.
- **E5 — Déconnexion refusée** (étape 8) : sans session `401` ; avec session
  mais jeton CSRF absent ou faux `403 « Jeton CSRF absent ou invalide »` — la
  session reste ouverte ; le site affiche le message et l'utilisateur reste
  connecté.

## Règles de gestion

- **RG1** — Le visiteur est l'absence de session : `401` = pas de session,
  `403` = session sans droit ou jeton CSRF invalide.
- **RG2** — Fixation : tout identifiant de session présenté avant la connexion
  est abandonné (`use_strict_mode`, `session_regenerate_id(true)`).
- **RG3** — CSRF double-submit : jeton en session, renvoyé par l'en-tête
  `X-CSRF-Token` sur toute mutation ; côté client, en mémoire uniquement
  (jamais `localStorage`). `login` est exempté (pas encore de session).
- **RG4** — Anti-énumération : même corps `401` et même coût Argon2id pour un
  compte inconnu.
- **RG5** — Journal des connexions : `login` / `login_failed` avec pays (base
  MMDB locale `GEOIP_DB`, `null` si absente) et réseau tronqué ; jamais l'IP
  brute ; rétention 365 jours (purge opportuniste 1 fois sur 100).
- **RG6** — Le quota de connexion est remis à zéro par un succès et n'est pas
  consommé par un compte non activé présentant le bon mot de passe.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Session | `sessions` : identifiant, données PHP, `ip_hash` (sha256), `user_id` ; supprimée à la déconnexion, en cascade à la purge |
| IP | Jamais stockée en clair : `ip_hash`, seaux de quota hachés, réseau tronqué dans le journal |
| Journal | `audit_events` `login` / `login_failed` : `{pays, reseau}` ; 365 jours ; `user_id` anonymisé à la purge |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/AccountView.jsx` | Formulaire de connexion, profil, « Se déconnecter », état « API indisponible » |
| Front | `web/src/App.jsx` | Écoute `humanome:auth`, navigation selon les rôles, déconnexion du panneau |
| Front | `web/src/nav.js` — `navGroups` | Familles visibles selon la session |
| Front | `web/src/api/client.js` — `login`, `logout`, `fetchMe`, `apiFetch`, `getCsrfToken` | Jeton en mémoire, erreurs typées, API indisponible |
| API | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — `api/src/routes/auth.php` | Orchestration |
| Domaine | `api/src/Auth/Session.php` | Ouverture (régénération, jeton), lecture, destruction |
| Domaine | `api/src/DbSessionHandler.php` | Stockage MySQL des sessions, `ip_hash`, `bindUser` |
| Domaine | `api/src/Middleware/CsrfMiddleware.php` | Garde CSRF des mutations |
| Domaine | `api/src/Auth/RateLimiter.php`, `api/src/ClientIp.php` | Quota IP + email |
| Domaine | `api/src/Auth/Users.php` — `findByEmail`, `dummyHash`, `isVerified` | Vérification des identifiants |
| Domaine | `api/src/Auth/LoginJournal.php`, `api/src/Geo/IpAnonymizer.php`, `api/src/Geo/CountryResolver.php` | Journal des connexions |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CPT-02-U01 | `LoginJournal::success`, `failure` | Pays + réseau, `user_id` nul pour un inconnu, jamais l'IP (RG5) | `api/tests/UseCases/Unit/UcCpt02SeConnecterDeconnecterTest.php` |
| UC-CPT-02-U02 | `LoginJournal::prune` | Rétention 365 j, autres événements intacts | idem |
| UC-CPT-02-U03 | `IpAnonymizer::network` | /24, /48, IPv4 mappée, invalide | idem |
| UC-CPT-02-U04 | `CountryResolver::resolve` | Base absente ou introuvable → `null` ; couture de test | idem |
| UC-CPT-02-U05 | `DbSessionHandler` | `ip_hash` = sha256(IP) ; `bindUser` survit aux écritures ; `destroy` | idem |
| UC-CPT-02-U06 | `Session::openForUser`, `destroy` | ID régénéré, jeton 64 hex, ligne liée ; destruction (RG2) | idem |
| UC-CPT-02-U07 | `CsrfMiddleware` | Logout sans/mauvais jeton → 403 ; bon jeton, GET, login → passent (RG3) | idem |
| UC-CPT-02-U08 | `RateLimiter` (5 / 900 s) | Blocage au 6ᵉ, 30 → 60 → 120 s, plafond, `reset` (RG6) | idem |
| UC-CPT-02-U09 | `login` | POST sans jeton, jeton mémorisé, `humanome:auth` | `web/test/usecases/unit/uc-cpt-02-se-connecter-deconnecter.test.jsx` |
| UC-CPT-02-U10 | `apiFetch` (jeton CSRF) | Jeton jamais écrit dans `localStorage` / `sessionStorage` (RG3) | idem |
| UC-CPT-02-U11 | `logout` | `X-CSRF-Token` envoyé, jeton oublié et événement émis même hors ligne | idem |
| UC-CPT-02-U12 | `fetchMe` | 401 → visiteur ; 200 → profil + jeton ; panne / `file:` → API indisponible | idem |
| UC-CPT-02-U13 | `navGroups` | Famille « Compte » visiteur vs « Mon compte » + familles de rôles | idem |
| UC-CPT-02-U14 | `App` (couture `fetchMeFn`) | Relecture de la session à chaque `humanome:auth` : identité, rôles, « Se déconnecter » | idem |
| UC-CPT-02-U15 | `Users::dummyHash`, `findByEmail`, `isVerified` | Même algorithme et coût Argon2id pour un email inconnu (RG4) ; compte non activé reconnu (E3) | `api/tests/UseCases/Unit/UcCpt02SeConnecterDeconnecterTest.php` |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-02-F01 | Nominal | API | Cookie planté remplacé, payload, `ip_hash`, journal `login` ; logout 204, ligne supprimée, cookie périmé → 401 | `api/tests/UseCases/Functional/UcCpt02SeConnecterDeconnecterTest.php` |
| UC-CPT-02-F02 | A1 | API | `/me` rend le jeton de la session ; deux navigateurs indépendants | idem |
| UC-CPT-02-F03 | A4 | API | Compte purgé → 401 | idem |
| UC-CPT-02-F04 | E1 | API | 422, quota non entamé | idem |
| UC-CPT-02-F05 | E2 | API | 401 identiques, `login_failed` (compte visé / null), aucune session | idem |
| UC-CPT-02-F06 | E3 | API | 403 `email_not_verified` ×6 sans 429 ; mauvais mot de passe → 401 | idem |
| UC-CPT-02-F07 | E4 | API | 429 au 6ᵉ essai avec le bon mot de passe, 30 puis 60 s, /64 ; autre IP / autre email libres | idem |
| UC-CPT-02-F08 | E5 | API | Logout 401 sans session ; 403 sans/faux jeton, session conservée | idem |
| UC-CPT-02-F09 | Nominal | IHM | `<App/>` : connexion → profil + navigation des rôles ; déconnexion → formulaire et navigation visiteur | `web/test/usecases/functional/uc-cpt-02-se-connecter-deconnecter.test.jsx` |
| UC-CPT-02-F10 | A1 | IHM | Session existante → profil direct, sans login | idem |
| UC-CPT-02-F11 | A2 | IHM | Déconnexion depuis le panneau → `#/`, navigation visiteur | idem |
| UC-CPT-02-F12 | A3 | IHM | Message « copie statique » ; déconnexion hors ligne = locale | idem |
| UC-CPT-02-F13 | E1 | IHM | Messages locaux, aucune requête | idem |
| UC-CPT-02-F14 | E2 | IHM | « Email ou mot de passe incorrect. » | idem |
| UC-CPT-02-F15 | E3 | IHM | Bascule sur l'écran d'activation | idem |
| UC-CPT-02-F16 | E4 | IHM | Message de quota du serveur | idem |
| UC-CPT-02-F17 | E5 | IHM | 403 CSRF affiché, toujours connecté | idem |

### Tests existants liés (non-régression)

- `api/tests/AuthRoutesTest.php` — login, régénération de session, `/me`, logout.
- `api/tests/AuthRateLimitTest.php` — quota de connexion, /64, remise à zéro.
- `api/tests/AuthCsrfTest.php` — jeton absent, faux, d'une autre session.
- `api/tests/DbSessionHandlerTest.php`, `api/tests/ClientIpTest.php`, `api/tests/GeoIpAnonymizerTest.php`.
- `api/tests/AdminMonitoringTest.php` — journal des connexions vu par l'administrateur.
- `web/src/api/client.test.js`, `web/src/views/AccountView.test.jsx`, `web/src/App.test.jsx` (nav selon les rôles, déconnexion), `web/src/nav.test.js`.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCpt02
cd web && npx vitest run test/usecases --testNamePattern UC-CPT-02
```

## Limites

- Après une déconnexion **hors ligne** (A3), la session serveur n'est pas
  détruite et le cookie reste dans le navigateur : seul l'affichage revient à
  « visiteur ». Au retour du réseau, `GET /api/auth/me` retrouve la session
  tant que le ramasse-miettes des sessions ne l'a pas expirée.
