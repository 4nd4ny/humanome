# UC-CPT-02 — Se connecter et se déconnecter

| Champ | Valeur |
|---|---|
| **Acteur principal** | Tout utilisateur inscrit dont le compte est activé (UC-CPT-01) |
| **Acteurs secondaires** | Administrateur (lit le journal des connexions, UC-ADM-06) |
| **Portée** | humanome.xyz — `#/compte`, panneau de navigation ; `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §2 (le visiteur est l'absence de session), §4.5 (comptes), §6 (principes RGPD) ; journalisation minimale : `CLAUDE.md`, principe RGPD n° 5 ; `docs/autorisations.md` (principes 1, 2 et 6 : 401/403, CSRF) |
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
  hors dev) et un jeton CSRF gardé **en mémoire** par le client ; pour un
  compte porteur d'au moins un rôle, la navigation affiche les familles de ses
  rôles, l'identité (avatar ou initiales + nom) et « Se déconnecter » (un
  compte sans aucun rôle garde la navigation d'un visiteur : AN4).
- Un événement `login` `{pays, reseau}` est journalisé (pays résolu localement,
  réseau tronqué /24 ou /48) ; le quota de connexion du couple IP + email est
  remis à zéro.
- Déconnexion : la ligne de session est supprimée, le cookie expiré, le jeton
  oublié ; le site revient à l'état visiteur.

## Garanties minimales (en cas d'échec)

- Aucune session n'est ouverte.
- Un email inconnu et un mauvais mot de passe produisent la même réponse, au
  même coût (vérification factice `Users::dummyHash`).
- Une déconnexion refusée laisse la session intacte (mais n'est signalée que
  depuis le profil : AN3).

## Scénario nominal

1. Au chargement de l'application, **quelle que soit la route**, le shell
   (`App.jsx`) appelle `GET /api/auth/me` pour construire la navigation ; à
   l'ouverture de `#/compte`, `AccountView` le rappelle (deux appels) → `401`
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

- **A1 — Session déjà ouverte** (étape 1) : les deux appels `GET
  /api/auth/me` (shell et `AccountView`) → `200 {user, csrfToken}` ; le profil
  s'affiche directement, la navigation est connectée et le client récupère le
  jeton de la session. Chaque navigateur a sa propre session et son propre jeton ;
  fermer l'une ne ferme pas l'autre.
- **A2 — Déconnexion depuis la navigation** (étape 6) : le bouton « Se
  déconnecter » du panneau appelle la même route, referme le panneau et ramène
  à l'accueil `#/` — **même si la déconnexion est refusée** (erreur avalée,
  AN3).
- **A3 — API injoignable** (étape 1) : copie statique, `file://`, réseau coupé,
  ou hébergeur qui répond une page HTML au lieu de JSON → l'espace compte
  affiche « L'espace compte est indisponible sur cette copie statique du
  site… » ; l'appel du shell échoue aussi et la navigation reste celle d'un
  visiteur. Une **erreur HTTP** de `/me` autre que `401` (ex. `500`) affiche
  « Impossible de vérifier votre session pour le moment. Réessayez plus
  tard. ». Si tout le réseau tombe pendant la déconnexion, le site repasse
  quand même en état visiteur (déconnexion locale, navigation comprise) ; en
  panne **partielle** (seul le `logout` échoue), voir « Limites ».
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
- **E5 — Déconnexion refusée** (étape 8) : sans cookie `401` ; avec session
  mais jeton CSRF absent ou faux `403 « Jeton CSRF absent ou invalide »` — la
  session reste ouverte ; depuis le profil, le site affiche le message et
  l'utilisateur reste connecté ; depuis le panneau (A2), l'erreur n'est **pas**
  affichée : retour à `#/`, session conservée (AN3). Avec le cookie d'une
  session **expirée ou purgée**, la déconnexion (comme toute mutation) reçoit
  aussi `403 CSRF`, pas `401` ; `GET /me` répond `401` (AN1).
- **E6 — API sans base** (étapes 1, 4, 8) : base non configurée → la connexion
  répond `503 « Service indisponible »` ; `GET /me` et la déconnexion répondent
  `401`, même avec le cookie d'une session valide (la session n'est pas
  touchée).

## Règles de gestion

- **RG1** — Le visiteur est l'absence de session : `401` = pas de cookie de
  session (ou `GET` avec un cookie de session disparue), `403` = session sans
  droit ou jeton CSRF invalide — y compris pour toute **mutation** portant le
  cookie d'une session expirée ou purgée (AN1).
- **RG2** — Fixation : tout identifiant de session présenté avant la connexion
  est abandonné à l'ouverture de session par `session_regenerate_id(true)`
  (`Session::openForUser`). `session.use_strict_mode` est positionné mais **sans
  effet** : `DbSessionHandler` n'implémente pas `validateId()` et `read()` rend
  `''` pour un identifiant inconnu, qui est donc adopté (AN2).
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
| Session | `sessions` : identifiant, données PHP, `ip_hash`, `user_id` ; supprimée à la déconnexion, en cascade à la purge ; une ligne supprimée peut être **recréée vide** (sans compte) par une requête portant le cookie périmé (AN2) |
| IP | Jamais stockée en clair, mais `ip_hash` = sha256 **non salé** de l'IP (pseudonymisation réversible par énumération pour l'IPv4, AN5) ; seaux de quota hachés (non salés, voir UC-CPT-01 AN2) ; réseau tronqué dans le journal |
| Journal | `audit_events` `login` / `login_failed` : `{pays, reseau}` ; 365 jours ; `user_id` anonymisé à la purge |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/AccountView.jsx` | Formulaire de connexion, profil, « Se déconnecter », état « API indisponible » |
| Front | `web/src/App.jsx` | Lecture de session au démarrage et à chaque `humanome:auth`, navigation selon les rôles, déconnexion du panneau |
| Front | `web/src/nav.js` — `navGroups` | Familles visibles selon la session |
| Front | `web/src/api/client.js` — `login`, `logout`, `fetchMe`, `apiFetch`, `getCsrfToken` | Jeton en mémoire, erreurs typées, API indisponible |
| API | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — `api/src/routes/auth.php` | Orchestration |
| Domaine | `api/src/Auth/Session.php` | Ouverture (régénération, jeton), lecture, destruction |
| Domaine | `api/src/DbSessionHandler.php` | Stockage MySQL des sessions, `ip_hash`, `bindUser` |
| Domaine | `api/src/Middleware/CsrfMiddleware.php` | Garde CSRF des mutations |
| Domaine | `api/src/Auth/RateLimiter.php`, `api/src/ClientIp.php` | Quota IP + email (logique de `ClientIp` testée unitairement par UC-CPT-01-U16 et UC-EMP-01-U08) |
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
| UC-CPT-02-U05 | `DbSessionHandler` | `ip_hash` = sha256(IP) non salé (AN5) ; `bindUser` survit aux écritures ; `destroy` | idem |
| UC-CPT-02-U06 | `Session::openForUser`, `destroy` | ID régénéré, jeton 64 hex, ligne liée ; destruction (RG2) | idem |
| UC-CPT-02-U07 | `CsrfMiddleware` | Logout sans/mauvais jeton → 403 ; bon jeton, GET, login → passent (RG3) | idem |
| UC-CPT-02-U08 | `RateLimiter` (5 / 900 s), `ClientIp` | Horloge figée ; seau construit comme la route ; blocage au 6ᵉ, 30 → 60 → 120 s, plafond ; `reset()` efface le seau (l'appel par la route après un succès : F18) | idem |
| UC-CPT-02-U09 | `login` | POST sans jeton, jeton mémorisé, `humanome:auth` | `web/test/usecases/unit/uc-cpt-02-se-connecter-deconnecter.test.jsx` |
| UC-CPT-02-U10 | `apiFetch` (jeton CSRF) | Jeton jamais écrit dans `localStorage` / `sessionStorage` (RG3) | idem |
| UC-CPT-02-U11 | `logout` | `X-CSRF-Token` envoyé, jeton oublié et événement émis même hors ligne | idem |
| UC-CPT-02-U12 | `fetchMe` | 401 → visiteur ; 200 → profil + jeton ; panne, `file:` ou réponse HTML (non JSON) → API indisponible ; 500 → `ApiError` | idem |
| UC-CPT-02-U13 | `navGroups` | Famille « Compte » visiteur vs « Mon compte » + familles de rôles | idem |
| UC-CPT-02-U14 | `App` (couture `fetchMeFn`) | Relecture de la session à chaque `humanome:auth` : identité, rôles, « Se déconnecter » | idem |
| UC-CPT-02-U15 | `Users::dummyHash`, `findByEmail`, `isVerified` | Même algorithme et coût Argon2id pour un email inconnu (RG4) ; compte non activé reconnu (E3) | `api/tests/UseCases/Unit/UcCpt02SeConnecterDeconnecterTest.php` |
| UC-CPT-02-U16 | `Session::start`, `DbSessionHandler` | **Anomalie AN2 figée** : identifiant inconnu adopté malgré `use_strict_mode=1`, ligne créée ; `openForUser` le remplace | idem |
| UC-CPT-02-U17 | `DbSessionHandler::start` | Cookie `humanome_sid` : `HttpOnly`, `SameSite=Lax`, `lifetime 0`, chemin `/`, `Secure` hors `APP_ENV=dev`, `use_only_cookies` | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-02-F01 | Nominal | API | Cookie planté remplacé, payload, `ip_hash`, journal `login` ; logout 204, ligne supprimée, cookie périmé → 401 | `api/tests/UseCases/Functional/UcCpt02SeConnecterDeconnecterTest.php` |
| UC-CPT-02-F02 | A1 | API | `/me` rend le jeton de la session ; deux navigateurs indépendants | idem |
| UC-CPT-02-F03 | A4 | API | Compte purgé : session supprimée en cascade, journal `login` anonymisé, `/me` → 401 | idem |
| UC-CPT-02-F04 | E1 | API | 422, quota non entamé | idem |
| UC-CPT-02-F05 | E2 | API | 401 identiques, `login_failed` (compte visé / null), aucune session | idem |
| UC-CPT-02-F06 | E3 | API | 403 `email_not_verified` ×6 sans 429 ; mauvais mot de passe → 401 | idem |
| UC-CPT-02-F07 | E4 | API | 429 au 6ᵉ essai avec le bon mot de passe, 30 puis 60 s, /64 ; autre IP / autre email libres | idem |
| UC-CPT-02-F08 | E5 | API | Logout 401 sans session ; 403 sans/faux jeton, session conservée | idem |
| UC-CPT-02-F09 | Nominal | IHM | `<App/>` : connexion → profil + navigation des rôles ; déconnexion → formulaire et navigation visiteur | `web/test/usecases/functional/uc-cpt-02-se-connecter-deconnecter.test.jsx` |
| UC-CPT-02-F10 | A1 | IHM | Session existante → profil direct, sans login | idem |
| UC-CPT-02-F11 | A2 | IHM | Déconnexion depuis le panneau ouvert → panneau refermé, `#/`, navigation visiteur | idem |
| UC-CPT-02-F12 | A3 | IHM | Message « copie statique » ; réseau entièrement coupé : déconnexion locale, navigation visiteur, jeton oublié | idem |
| UC-CPT-02-F13 | E1 | IHM | Messages locaux, aucune requête | idem |
| UC-CPT-02-F14 | E2 | IHM | « Email ou mot de passe incorrect. » | idem |
| UC-CPT-02-F15 | E3 | IHM | Bascule sur l'écran d'activation | idem |
| UC-CPT-02-F16 | E4 | IHM | Message de quota du serveur | idem |
| UC-CPT-02-F17 | E5 | IHM | 403 CSRF affiché ; toujours connecté : `/me` relu, jeton récupéré, navigation connectée | idem |
| UC-CPT-02-F18 | RG6 | API | 4 échecs, succès → seau effacé ; 5 nouveaux échecs restent 401, le 6ᵉ essai → 429 | `api/tests/UseCases/Functional/UcCpt02SeConnecterDeconnecterTest.php` |
| UC-CPT-02-F19 | E5, AN1 | API | **Anomalie figée** : session supprimée (GC) → logout avec le cookie et l'ancien jeton → 403 CSRF ; ligne recréée vide (AN2) ; `/me` → 401 | idem |
| UC-CPT-02-F20 | E6 | API | Base non configurée : login 503 ; `/me` et logout 401 malgré un cookie valide ; session intacte | idem |
| UC-CPT-02-F21 | E5, AN1 | IHM | **Anomalie figée** : session expirée côté serveur → 403 CSRF affiché, profil conservé, navigation visiteur | `web/test/usecases/functional/uc-cpt-02-se-connecter-deconnecter.test.jsx` |
| UC-CPT-02-F22 | A2, AN3 | IHM | **Anomalie figée** : logout refusé depuis le panneau → `#/`, aucun message, toujours connecté | idem |
| UC-CPT-02-F23 | AN4 | IHM | **Anomalie figée** : compte sans rôle → profil affiché, navigation visiteur sans « Se déconnecter » | idem |
| UC-CPT-02-F24 | A3 | IHM | `/me` en 500 → « Impossible de vérifier votre session… » | idem |
| UC-CPT-02-F25 | A3 (limite) | IHM | **Limite figée** : panne partielle (logout perdu, `/me` joignable) → profil « déconnecté », navigation connectée | idem |

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

## Anomalies constatées

- **AN1 — Se déconnecter d'une session expirée ou purgée : `403 CSRF`, affichage
  incohérent.** `Session::exists()` ne regarde que la présence du cookie
  `humanome_sid` : avec le cookie d'une session disparue (ramasse-miettes des
  sessions, purge du compte depuis un autre navigateur, onglet resté ouvert),
  `CsrfMiddleware` démarre une session vide, n'y trouve aucun jeton et répond
  `403 « Jeton CSRF absent ou invalide »` avant la route (pas `401`). Côté IHM,
  `AccountView.handleLogout` ne traite comme déconnexion que
  `ApiUnavailableError` : le profil reste affiché avec le message CSRF, alors
  que le shell (`humanome:auth` → `GET /me` → `401`) repasse la navigation en
  visiteur. Figé par UC-CPT-02-F19 (API) et F21 (IHM) ; même mécanisme que
  UC-EMP-01 AN2 et UC-CPT-06 E1.
- **AN2 — `session.use_strict_mode` inopérant.** `DbSessionHandler` implémente
  seulement `SessionHandlerInterface`, sans `validateId()` ; `read()` rend `''`
  pour un identifiant inconnu, que PHP juge alors valide. Un identifiant
  inconnu présenté par cookie est adopté tel quel, et sa ligne `sessions` est
  (re)créée vide à l'écriture de fin de requête — y compris pour l'identifiant
  d'une session qui vient d'être détruite. La protection contre la fixation ne
  repose que sur `session_regenerate_id(true)` à la connexion (RG2). Figé par
  UC-CPT-02-U16 et F19 : une correction du handler les fera échouer.
- **AN3 — Déconnexion refusée depuis le panneau : erreur avalée.**
  `App.jsx` (`handleLogout`) ignore toute erreur de `logout()` puis referme le
  panneau et navigue vers `#/` : sur un `403`, aucun message, et l'utilisateur
  — qui croit s'être déconnecté, par exemple sur un poste partagé — reste
  connecté (la relecture de `/me` restaure jeton et navigation). Figé par
  UC-CPT-02-F22.
- **AN4 — Compte connecté sans aucun rôle : navigation de visiteur.** L'état
  « connecté » de la navigation est déduit de `roles.length > 0`
  (`App.jsx`), non de la présence d'un utilisateur. Un administrateur peut
  retirer tous les rôles d'un compte (`UserDirectory::revoke` n'impose aucun
  minimum) : ce compte, connecté, voit « Compte / Se connecter », sans identité
  ni « Se déconnecter » dans le panneau. UC-CPT-02-U13 (`navGroups({roles: []})`
  = visiteur) et F23 figent ce comportement.
- **AN5 — `ip_hash` : empreinte non salée.** `DbSessionHandler::ipHash()` =
  `sha256(REMOTE_ADDR)` sans sel ni poivre : pour une IPv4, l'adresse se
  retrouve en énumérant 2³² valeurs. « Jamais en clair » est exact à la lettre,
  mais c'est une pseudonymisation réversible, donc une donnée personnelle.
  Format figé par UC-CPT-02-U05 et F01.

## Limites

- Après une déconnexion **hors ligne** (A3), la session serveur n'est pas
  détruite et le cookie reste dans le navigateur : seul l'affichage revient à
  « visiteur ». Au retour du réseau, `GET /api/auth/me` retrouve la session
  tant que le ramasse-miettes des sessions ne l'a pas expirée.
- En panne **partielle** (la requête de déconnexion est perdue mais `/me` reste
  joignable), l'espace compte affiche « Vous êtes déconnecté. » alors que le
  shell relit `/me`, récupère le jeton et garde la navigation connectée : la
  session serveur est toujours ouverte (UC-CPT-02-F25).
- Les commentaires de `web/src/api/client.js` (`fetchMe` : « never at app
  boot ») et d'`AccountView.jsx` (« la session n'est vérifiée qu'au montage de
  CETTE route ») sont périmés : le shell appelle `/me` au démarrage (étape 1).
- Les tests de quota utilisent une fenêtre fixe alignée sur l'horloge : les
  tests fonctionnels attendent la fenêtre suivante s'il reste moins de 20 s
  (`api/tests/UseCases/Support/CptSupport.php`) ; les tests unitaires figent
  l'horloge.
