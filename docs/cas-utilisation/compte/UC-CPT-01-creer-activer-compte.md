# UC-CPT-01 — Créer un compte et l'activer par code email

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur qui devient utilisateur inscrit (rôle `apprenant` par défaut) |
| **Acteurs secondaires** | Transport email (`mail()` de l'hébergeur OVH) ; administrateur (attribue ensuite d'autres rôles, UC-ADM-01) |
| **Portée** | humanome.xyz — `#/compte` (onglet « Inscription »), `#/activer?email=…&code=…`, `POST /api/auth/register`, `/activate`, `/resend` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (« Créer un compte »), §4.5 (comptes), §6 (principes RGPD) ; journalisation minimale : `CLAUDE.md`, principe RGPD n° 5 ; anti-énumération et activation par code : décisions D5 / AD-D3 (`STATUS.md`) |
| **Statut** | Implémenté (P3, durci en D5 : double saisie de l'email, activation par code) |

## Objectif

Permettre à un visiteur de créer un compte humanome.xyz rattaché à une adresse
email dont **le titulaire de la boîte** prouve la possession (code à 4 chiffres
reçu par email), puis d'arriver connecté avec le rôle `apprenant`.

Attention : la personne qui prouve la possession de la boîte (activation) n'est
pas forcément celle qui a choisi le mot de passe (inscription) ; le mot de
passe reste celui de l'inscrivant (anomalie AN1).

## Déclencheur

Le visiteur ouvre `#/compte` et choisit « Inscription » — ou clique le lien
`#/activer?email=…&code=…` du mail de confirmation.

## Préconditions

- L'API PHP est joignable (sinon l'espace compte affiche le message « copie
  statique », voir UC-CPT-02 A3).
- Aucune session n'est ouverte dans ce navigateur (un visiteur est l'absence de
  session, cahier §2).

## Garanties en cas de succès

- Un compte `users` existe avec l'email normalisé (minuscules, sans espaces),
  une empreinte **Argon2id** du mot de passe et le rôle `apprenant`.
- `email_verified_at` est posé à l'activation ; le code est effacé (usage unique).
- Une session authentifiée est ouverte (identifiant de session régénéré, jeton
  CSRF délivré) ; la navigation du site passe en mode « connecté ».
- Audit : `account_created` (sans détail) à l'inscription, `login`
  (`{pays, reseau}`) à l'activation — jamais d'IP brute.

## Garanties minimales (en cas d'échec)

- Aucune session n'est ouverte tant que le code n'a pas été confirmé.
- Aucun **corps ni statut** de réponse ne permet de savoir si une adresse est
  inscrite, déjà activée ou verrouillée (activation et renvoi répondent de façon
  générique), hormis le `409` explicite de l'inscription — **hors canal
  temporel** : le temps de réponse n'est pas égalisé (RG4).
- Le code n'est jamais stocké en clair ; une inscription refusée ne crée rien
  et n'envoie aucun email.
- Un compte jamais activé n'est **jamais purgé** : il reste en base (email, nom,
  empreintes) et bloque l'adresse (`409`) tant que le titulaire de la boîte ne
  l'active pas (AN3).

## Scénario nominal

1. Le visiteur ouvre `#/compte` : le site appelle `GET /api/auth/me` → `401`,
   et affiche les onglets « Connexion » / « Inscription ». Il choisit
   « Inscription ».
2. Il saisit son nom affiché, son email, la **confirmation** de l'email
   (collage autorisé) et un mot de passe.
3. Le site contrôle localement : email non vide, double saisie identique
   (insensible à la casse), nom non vide, mot de passe d'au moins 10 caractères.
4. Le site envoie `POST /api/auth/register` `{email, emailConfirm, password,
   displayName}` (route exemptée de CSRF : pas encore de session).
5. Le serveur compte la tentative pour l'IP (`register:` + sha256 de l'identité
   IP, IPv6 regroupées par /64) **avant toute validation**, normalise et valide
   les champs, vérifie l'unicité de l'email puis, dans une transaction : crée
   le compte (Argon2id), attribue le rôle `apprenant`, journalise
   `account_created`, pose un code aléatoire à 4 chiffres **haché** (Argon2id,
   expiration 30 min, compteur d'essais à 0) et envoie l'email (code en clair +
   lien `<SITE_URL>/#/activer?email=…&code=…`). Réponse `201
   {status: "pending_activation", email, message}` — **sans session**.
6. Le site bascule sur l'écran « Activer votre compte » (notice « Compte créé !
   Un code de confirmation à 4 chiffres vous a été envoyé par email. »), email
   pré-rempli.
7. L'utilisateur saisit le code ; le site vérifie localement le format
   `^\d{4}$`.
8. Le site envoie `POST /api/auth/activate` `{email, code}`.
9. Le serveur valide le format, compte la tentative pour l'IP (20 / 15 min),
   retrouve le compte, vérifie qu'il n'est ni activé, ni expiré, ni verrouillé,
   puis vérifie le code ; il active le compte (`markVerified`), ouvre la
   session (`Session::openForUser` : ID régénéré, jeton CSRF de 64 hex),
   journalise `login` et répond `200 {user: {id, email, displayName, roles:
   ["apprenant"], hasAvatar: false}, csrfToken}`.
10. Le client garde le jeton CSRF en mémoire et émet l'événement
    `humanome:auth` : le profil s'affiche (« Compte activé, bienvenue ! »,
    rôle « Apprenant ») et la navigation se met à jour (« Profil et rôles »,
    « Se déconnecter »).

## Scénarios alternatifs

- **A1 — Lien du mail** (étape 7) : l'utilisateur clique
  `#/activer?email=…&code=…`. Le routeur ouvre l'écran d'activation avec
  email et code pré-remplis ; un clic sur « Activer mon compte » suffit. Le
  serveur ignore la casse et les espaces autour de l'email et du code. Un lien
  **sans email** (`#/activer`, `#/activer?code=…`) ouvre le formulaire de
  connexion, pas l'écran d'activation.
- **A2 — Renvoi du code** (étape 7) : « Renvoyer le code » →
  `POST /api/auth/resend {email}`. Pour un compte existant non activé, le
  serveur régénère le code (nouvelle empreinte, expiration repoussée, essais
  remis à 0) et renvoie un email. **Hors quota (E8)**, la réponse est `200
  {status: "ok", message: "Si un compte non activé existe…"}` (inconnu, déjà
  activé ou adresse invalide compris, sans envoi). Une adresse mal formée est
  écartée **avant** les quotas : elle n'en consomme aucun.
- **A3 — Reprise ultérieure** (étape 1) : l'utilisateur revient plus tard et
  tente de se connecter ; `POST /api/auth/login` répond `403 {code:
  "email_not_verified", email}` (voir UC-CPT-02 E3) et le site ouvre l'écran
  d'activation avec la notice « Ce compte n'est pas encore activé… » ; le
  scénario reprend à l'étape 7.

## Scénarios d'erreur

- **E1 — Contrôle local** (étape 3) : email vide, double saisie divergente, nom
  vide ou mot de passe trop court → message (`role="alert"`), **aucune
  requête**.
- **E2 — Validation serveur** (étape 5) : `422 {error: "Validation échouée",
  fields}` — email invalide ou > 255 caractères, confirmation différente, mot de
  passe < 10 caractères ou > 1024 octets, nom vide ou > 190 caractères. Le site
  affiche les messages par champ. Rien n'est créé, aucun email.
- **E3 — Adresse déjà utilisée** (étape 5) : `409 « Un compte existe déjà avec
  cette adresse email »` (la comparaison ignore la casse).
- **E4 — Trop d'inscriptions** (étape 5) : au-delà de 10 par heure et par IP,
  `429` + `Retry-After` (30 s, doublé ensuite, plafonné à la fenêtre).
- **E5 — Code refusé** (étape 9) : code faux, expiré, compte inconnu, déjà
  activé ou verrouillé → **même** `401 « Code invalide ou expiré »`. Chaque
  code faux incrémente le compteur ; au 5ᵉ, même le bon code est refusé
  jusqu'à un renvoi (A2). Le site affiche le message et reste sur l'écran.
- **E6 — Code mal formé** (étapes 7 et 9) : refus local « Saisissez le code à
  4 chiffres reçu par email. » ; côté API, `422 « Email et code à 4 chiffres
  requis »`, sans consommer ni essai ni quota IP.
- **E7 — Trop d'activations depuis l'IP** (étape 9) : au-delà de 20 tentatives
  en 15 min, `429`, même avec le bon code.
- **E8 — Trop de renvois** (A2) : au-delà de 3 par heure et par compte, ou de 10
  par heure et par IP, `429 « Trop de demandes de code, réessayez plus tard »`,
  sans email. Le quota par compte est indexé sur l'email seul, quel que soit le
  demandeur (AN5).
- **E9 — API sans base** (étapes 5 et 9, A2) : base de données non configurée
  → `503 « Service indisponible »` sur `register`, `activate` et `resend` ; rien
  n'est créé, aucun email.

## Règles de gestion

- **RG1** — Rôle `apprenant` attribué par défaut (cahier §3.2) ; les autres
  rôles relèvent de l'administration (UC-ADM-01).
- **RG2** — Pas de session avant activation : l'activation est le « premier
  login qui confirme ».
- **RG3** — Code : 4 chiffres, haché (Argon2id), 30 minutes, 5 essais,
  usage unique ; un renvoi régénère le code et rouvre les 5 essais. Le vrai
  garde-fou du code court est le quota de renvoi (E8).
- **RG4** — Anti-énumération (D5) : `activate` et `resend` renvoient des corps
  et statuts identiques quel que soit l'état du compte. Le **temps de réponse
  n'est pas égalisé** : `activate` n'exécute la vérification Argon2id que pour un
  compte en attente dont le code est vivant, et `resend` ne hache un code et
  n'envoie un mail que pour un compte non activé ; les autres cas répondent
  immédiatement. Le login, lui, égalise les temps (`Users::dummyHash`,
  UC-CPT-02).
- **RG5** — Quotas (`RateLimiter`, fenêtre fixe, seaux hachés, IPv6 par /64) :
  inscription 10/h/IP comptée avant validation ; activation 20/15 min/IP ;
  renvoi 3/h/compte + 10/h/IP. Seule l'inscription compte avant de comparer ;
  activation et renvoi (comme le verrou de 5 essais) lisent puis incrémentent
  en deux temps : les bornes ne sont pas strictes sous requêtes parallèles
  (AN4).
- **RG6** — Email normalisé `trim` + minuscules (la collation
  `utf8mb4_unicode_ci` rend en outre la recherche et l'index unique
  insensibles à la casse) ; mot de passe compté en caractères (`mb_strlen`
  ≥ 10) et borné en octets (≤ 1024).
- **RG7** — `register`, `activate`, `resend` sont exemptés de CSRF (routes de
  visiteur, protégées par quotas).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Email, nom affiché | `users` ; purgés avec le compte (UC-CPT-06). Un compte **jamais activé** n'est jamais purgé (AN3) |
| Mot de passe | Empreinte Argon2id uniquement |
| Code de confirmation | Empreinte Argon2id, expiration, compteur ; effacés à l'activation (registre RGPD §1 bis) ; conservés sans limite pour un compte jamais activé (AN3) |
| Empreinte d'email (quota de renvoi) | `rate_limits`, seau `resend:acct:` + sha256(email) **non salé** ; non purgé par UC-CPT-06 ; supprimé seulement au prochain renvoi vers la même adresse dans une fenêtre ultérieure (AN2) |
| IP du visiteur | Jamais en clair, mais **empreintes sha256 non salées** : seaux `register:`, `activate:`, `resend:ip:` = sha256(« v4:a.b.c.d » ou préfixe /64) — pseudonymisation réversible par énumération pour l'IPv4 — conservés sans limite (même règle de purge) (AN2) ; journal `login` = pays + réseau tronqué (/24, /48) |
| IP (session) | À l'activation, `sessions.ip_hash` = sha256(IP) non salé ; supprimé avec la session (UC-CPT-02) |
| Email transporté | `mail()` OVH (sous-traitant d'hébergement), aucun service tiers |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/activer?email=&code=` |
| Front | `web/src/App.jsx` | Route `activer` → `AccountView initialActivation` ; écoute `humanome:auth` (couvert fonctionnellement : F12, F13 ; logique d'écoute testée unitairement en UC-CPT-02-U14) |
| Front | `web/src/views/AccountView.jsx` — `handleSubmit`, `submitErrorMessage`, `handleActivate`, `handleResend`, choix initial du mode | Formulaire d'inscription, contrôles locaux, écran d'activation, renvoi |
| Front | `web/src/api/client.js` — `register`, `activate`, `resendCode`, `apiFetch`, `ApiError`, `notifyAuthChanged` | Appels, jeton CSRF, erreurs par champ |
| API | `POST /api/auth/register`, `/activate`, `/resend` — `api/src/routes/auth.php` | Orchestration, `$sendVerification` (fermeture interne à la route : couverte fonctionnellement, F01 et F03), valeurs des quotas |
| Domaine | `api/src/Auth/Users.php` — `create`, `assignRole`, `rolesOf`, `hashPassword`, `findByEmail`, `findById`, `setVerificationCode`, `bumpVerificationAttempts`, `markVerified`, `isVerified` | Compte et code |
| Domaine | `api/src/Auth/Audit.php` | `account_created` |
| Domaine | `api/src/Auth/RateLimiter.php`, `api/src/ClientIp.php` | Quotas |
| Domaine | `api/src/Mail/MailerFactory.php`, `MemoryMailer.php`, `PhpMailMailer.php` | Envoi du code (`PhpMailMailer` n'est vérifié que comme implémentation par défaut : l'exercer enverrait un vrai mail) |
| Domaine | `api/src/Auth/Session.php`, `api/src/Auth/LoginJournal.php` | Session et journal à l'activation (détaillés en UC-CPT-02) |
| Domaine | `api/src/Middleware/CsrfMiddleware.php` | Exemptions des routes visiteur |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CPT-01-U01 | `Users::create`, `assignRole`, `rolesOf` | Compte créé non activé et sans rôle ; rôle attribué puis relu ; rôle inconnu refusé (le rôle `apprenant` par défaut est posé par la route : F01) | `api/tests/UseCases/Unit/UcCpt01CreerActiverCompteTest.php` |
| UC-CPT-01-U02 | `Users::hashPassword` | Argon2id, jamais en clair | idem |
| UC-CPT-01-U03 | `setVerificationCode`, `bumpVerificationAttempts` | Empreinte fournie stockée telle quelle + expiration, essais comptés, nouveau code = essais à 0 (le hachage du code est fait par la route : F01) | idem |
| UC-CPT-01-U04 | `markVerified`, `isVerified` | Activation, code effacé (usage unique) | idem |
| UC-CPT-01-U05 | `findByEmail` | Colonnes de vérification lues, casse indifférente (collation), ligne supprimée invisible | idem |
| UC-CPT-01-U06 | `MailerFactory`, `MemoryMailer` | Couture de test, extraction du code du lien | idem |
| UC-CPT-01-U07 | `Audit::record` | Sans détails → `details` NULL, événement daté (la route n'en passe aucun : F01) | idem |
| UC-CPT-01-U08 | `RateLimiter` | Blocage au-delà de la limite, fenêtre fixe, 30 s au premier refus puis 60 s, plafond = fenêtre ; paramètres des quatre quotas reproduits (valeurs réelles de la route : F07, F10, F11) | idem |
| UC-CPT-01-U09 | `CsrfMiddleware` | Exemption de register/activate/resend, aucune session ouverte (RG7) | idem |
| UC-CPT-01-U10 | `parseHash` | `#/activer?email=&code=` → route `activer` | `web/test/usecases/unit/uc-cpt-01-creer-activer-compte.test.jsx` |
| UC-CPT-01-U11 | `register` | Quatre champs POSTés, aucun événement `humanome:auth` | idem |
| UC-CPT-01-U12 | `activate` | Jeton CSRF mémorisé, `humanome:auth` émis | idem |
| UC-CPT-01-U13 | `resendCode` | POST `{email}`, réponse générique | idem |
| UC-CPT-01-U14 | `apiFetch`, `ApiError` | 422 → `fields` ; 409/429 → message serveur | idem |
| UC-CPT-01-U15 | `AccountView` (écran d'activation, seul) | Email seul pré-rempli, champ code (4, `one-time-code`), indice 30 min, « Retour à la connexion » | idem |
| UC-CPT-01-U16 | `ClientIp::bucketIdentity` | IPv6 par /64, IPv4 complète, IPv4 mappée ; seau `register:` = sha256 non salé de l'identité (AN2) | `api/tests/UseCases/Unit/UcCpt01CreerActiverCompteTest.php` |
| UC-CPT-01-U17 | `AccountView` (inscription, seul) — `handleSubmit`, `submitErrorMessage` | Quatre refus locaux sans requête ; 422 à deux champs → messages joints ; **anomalie AN6 figée** : 5 émojis passent le contrôle local | `web/test/usecases/unit/uc-cpt-01-creer-activer-compte.test.jsx` |
| UC-CPT-01-U18 | `AccountView` (choix initial du mode) | Lien `#/activer` sans email → formulaire de connexion | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-01-F01 | Nominal | API | 201 sans session, compte non activé, code haché 30 min, audit, mail ; puis 200 activé, session, `/me`, journal `login` | `api/tests/UseCases/Functional/UcCpt01CreerActiverCompteTest.php` |
| UC-CPT-01-F02 | A1 | API | Paramètres du lien du mail, casse et espaces ignorés | idem |
| UC-CPT-01-F03 | A2 | API | Renvoi : nouveau mail, essais à 0 ; réponse générique sans envoi (inconnu, déjà activé) | idem |
| UC-CPT-01-F04 | A3 | API | Login 403 `email_not_verified`, puis activation, puis login | idem |
| UC-CPT-01-F05 | E2 | API | 422 champ par champ, rien créé ; 10 caractères accentués acceptés | idem |
| UC-CPT-01-F06 | E3 | API | 409 casse comprise, pas de second mail | idem |
| UC-CPT-01-F07 | E4 | API | 11ᵉ inscription → 429 `Retry-After: 30`, /64 partagé, autre /64 libre | idem |
| UC-CPT-01-F08 | E5 | API | Verrou à 5 essais ; corps 401 identiques (faux, verrouillé, inconnu, expiré, déjà activé) | idem |
| UC-CPT-01-F09 | E6 | API | 422, ni essai ni quota consommé | idem |
| UC-CPT-01-F10 | E7 | API | 21ᵉ activation depuis l'IP → 429 même avec le bon code | idem |
| UC-CPT-01-F11 | E8 | API | 4ᵉ renvoi du compte, 11ᵉ renvoi de l'IP → 429 sans mail | idem |
| UC-CPT-01-F12 | Nominal | IHM | `<App/>` : inscription → activation → profil « Apprenant », navigation connectée | `web/test/usecases/functional/uc-cpt-01-creer-activer-compte.test.jsx` |
| UC-CPT-01-F13 | A1 | IHM | `#/activer?…` pré-remplit email et code | idem |
| UC-CPT-01-F14 | A2 | IHM | « Renvoyer le code » : message générique, nouveau code accepté | idem |
| UC-CPT-01-F15 | A3 | IHM | Connexion d'un compte non activé → écran d'activation → profil | idem |
| UC-CPT-01-F16 | E1 | IHM | Quatre contrôles locaux, aucune requête | idem |
| UC-CPT-01-F17 | E2, E3 | IHM | Messages 422 et 409 affichés | idem |
| UC-CPT-01-F18 | E4 | IHM | Message 429 affiché | idem |
| UC-CPT-01-F19 | E5, E6 | IHM | Code mal formé refusé localement ; code faux → « Code invalide ou expiré » | idem |
| UC-CPT-01-F20 | E8 | IHM | Renvoi refusé (429) affiché, aucune confirmation, le code déjà reçu active toujours | idem |
| UC-CPT-01-F21 | AN1 | API | **Anomalie figée** : tiers inscrit l'adresse avec son mot de passe, le titulaire active, le tiers se connecte (200) | `api/tests/UseCases/Functional/UcCpt01CreerActiverCompteTest.php` |
| UC-CPT-01-F22 | AN3 | API | **Anomalie figée** : compte non activé conservé (code expiré), inscrivant sans session ni suppression possible (403 puis 401), adresse bloquée (409) ; seul le titulaire s'en défait (renvoi → activation → suppression) | idem |
| UC-CPT-01-F23 | A2 | API | 11 renvois vers une adresse mal formée : réponse générique, aucun seau `resend:`, quota intact | idem |
| UC-CPT-01-F24 | AN5 | API | **Anomalie figée** : 3 renvois + 5 codes faux d'un tiers → le titulaire a le bon code verrouillé (401) et le renvoi refusé (429) | idem |
| UC-CPT-01-F25 | E9 | API | Base non configurée → 503 « Service indisponible » sur les trois routes, rien créé, aucun mail | idem |

Les tests IHM jouent `<App/>` contre un faux serveur en mémoire qui rejoue le
contrat HTTP des routes du compte (`web/test/usecases/support/cpt.js`).

### Tests existants liés (non-régression)

- `api/tests/AuthRoutesTest.php` — inscription en attente, activation, validation, doublon, double saisie.
- `api/tests/AuthActivationTest.php` — login bloqué, verrou, expiration, renvoi, anti-énumération, backfill 018.
- `api/tests/AuthRateLimitTest.php` — quota d'inscription par IP.
- `api/tests/AuthCsrfTest.php` — exemptions de `login`/`register`.
- `api/tests/ClientIpTest.php` et UC-EMP-01-U08 — identité IP des seaux (/64, IPv4 mappée, entrée invalide).
- `web/src/views/AccountView.test.jsx` — composant isolé (double saisie, activation, lien `#/activer`).
- `web/e2e/parcours-apprenant.e2e.js` — étape « Création de compte » **périmée depuis D5** : elle ne
  remplit ni la double saisie ni le code, `getByLabel('Email')` désigne aussi « Confirmez l’email »
  (mode strict de Playwright) et elle attend « Compte créé, bienvenue ! », texte absent de
  `web/src`. Elle ne couvre donc **pas** ce cas tant qu'elle n'est pas réécrite.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCpt01
cd web && npx vitest run test/usecases --testNamePattern UC-CPT-01
```

## Anomalies constatées

- **AN1 — Pré-détournement de compte : l'activation ne redéfinit pas le mot de
  passe.** `POST /api/auth/activate` n'exige que `{email, code}` et conserve le
  mot de passe choisi à l'inscription ; aucune route ne permet de changer ou de
  réinitialiser un mot de passe (les seules mutations de `auth.php` sont
  register, activate, resend, login, logout, `PATCH /me` et l'avatar). Un tiers
  peut inscrire l'adresse d'une victime avec son propre mot de passe : si la
  victime active (lien du mail — qui annonce « il vous connecte sans ressaisir
  votre mot de passe » —, ou renvoi après un `409` à sa propre inscription), le
  compte devient vérifié et le tiers s'y connecte. Figé par UC-CPT-01-F21.
  Correctif attendu : exiger ou (re)saisir le mot de passe à l'activation.
- **AN2 — Empreintes non salées conservées sans limite.** Les seaux de quota
  `register:`, `activate:`, `resend:ip:` (sha256 de « v4:a.b.c.d » ou du /64) et
  `resend:acct:` (sha256 de l'email) ne sont pas salés : pour une IPv4 ou une
  adresse email connue, l'empreinte se renverse par énumération. `rate_limits`
  n'est purgé que lors d'un nouvel essai **du même seau** dans une fenêtre
  ultérieure (aucune purge globale dans `api/src` ni `scripts/`) et
  `DELETE /api/auth/account` n'y touche pas : l'empreinte de l'email survit à
  la suppression du compte (UC-CPT-06). La session ouverte à l'activation porte
  de même `ip_hash` = sha256(IP) non salé. Formule figée par UC-CPT-01-U16. Le
  registre RGPD (§1 bis) est à mettre à jour en conséquence (hors de ce lot).
- **AN3 — Comptes jamais activés conservés indéfiniment.** Aucune purge
  (seul `Admin/Monitoring` les compte) : email, nom affiché, empreinte du mot
  de passe et du code expiré restent en base. L'inscrivant n'obtient jamais de
  session (login `403`) et ne peut donc pas supprimer le compte (UC-CPT-06 →
  `401`) ; l'adresse reste bloquée (`409`) pour une nouvelle inscription. Seul
  le titulaire de la boîte peut s'en défaire (renvoi → activation → UC-CPT-06).
  Figé par UC-CPT-01-F22.
- **AN4 — Bornes du code court non atomiques.** Le quota d'activation fait
  `isBlocked()` puis `hit()` en deux requêtes ; le verrou de 5 essais lit
  `verification_attempts`, exécute `password_verify` (Argon2id, plusieurs
  dizaines de ms) puis incrémente. Des requêtes parallèles lisent toutes
  l'ancien compteur : plus de 5 essais par code et plus de 20 activations par
  15 min sont possibles (même schéma pour le renvoi). `register`, lui, compte
  avant de comparer. Aucun test PHPUnit **séquentiel** ne peut le mettre en
  évidence : l'anomalie n'est pas figée par un test. Correctif attendu :
  compter avant de comparer (`hit()` puis test du compteur) et incrément
  conditionnel `UPDATE … WHERE verification_attempts < 5`.
- **AN5 — Blocage de l'activation par un tiers.** Le quota de renvoi par
  compte est indexé sur l'email seul, quel que soit le demandeur. Un tiers qui
  connaît l'adresse fait 3 renvois (chaque renvoi régénère le code et épuise le
  quota du compte) puis 5 codes faux (verrou) : le titulaire, qui a le bon code
  en main, est refusé (`401`) et ne peut pas en redemander (`429`) avant la
  fenêtre suivante (1 h), renouvelable. Figé par UC-CPT-01-F24.
- **AN6 — Longueur du mot de passe comptée différemment.** Le front compte
  `password.length` (unités UTF-16), le serveur `mb_strlen` (caractères) :
  5 émojis passent le contrôle local puis reçoivent un `422`. Figé par
  UC-CPT-01-U17.

## Limites

- Le code du lien reste dans l'historique du navigateur (`#/activer?…&code=`) ;
  il est à usage unique et effacé à l'activation, ce qui borne l'exposition.
- Le front n'applique que les contrôles de présence et de longueur minimale ;
  le format de l'email et les longueurs maximales ne sont vérifiés que par
  l'API (E2).
- L'email est envoyé **dans** la transaction d'inscription, avant le `commit`,
  et le booléen rendu par `Mailer::send()` est ignoré : un échec de `mail()`
  donne quand même `201` « code envoyé ». Le renvoi (A2) est alors le seul
  recours.
- Un lien `#/activer` sans email ramène au formulaire de connexion (A1,
  UC-CPT-01-U18) : l'utilisateur doit se connecter pour retrouver l'écran
  d'activation (A3).
