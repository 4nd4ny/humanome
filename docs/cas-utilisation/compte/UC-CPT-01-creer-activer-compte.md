# UC-CPT-01 — Créer un compte et l'activer par code email

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur qui devient utilisateur inscrit (rôle `apprenant` par défaut) |
| **Acteurs secondaires** | Transport email (`mail()` de l'hébergeur OVH) ; administrateur (attribue ensuite d'autres rôles, UC-ADM-01) |
| **Portée** | humanome.xyz — `#/compte` (onglet « Inscription »), `#/activer?email=…&code=…`, `POST /api/auth/register`, `/activate`, `/resend` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (« Créer un compte »), §4.5 (comptes), §6 (RGPD : journalisation minimale, pas d'énumération) ; décisions D5 / AD-D3 (`STATUS.md`) |
| **Statut** | Implémenté (P3, durci en D5 : double saisie de l'email, activation par code) |

## Objectif

Permettre à un visiteur de créer un compte humanome.xyz rattaché à une adresse
email **dont il prouve la possession** (code à 4 chiffres reçu par email), puis
d'arriver connecté avec le rôle `apprenant`.

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
- Aucune réponse ne permet de savoir si une adresse est inscrite, déjà activée
  ou verrouillée (activation et renvoi répondent de façon générique), hormis le
  `409` explicite de l'inscription.
- Le code n'est jamais stocké en clair ; une inscription refusée ne crée rien
  et n'envoie aucun email.

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
  serveur ignore la casse et les espaces autour de l'email et du code.
- **A2 — Renvoi du code** (étape 7) : « Renvoyer le code » →
  `POST /api/auth/resend {email}`. Pour un compte existant non activé, le
  serveur régénère le code (nouvelle empreinte, expiration repoussée, essais
  remis à 0) et renvoie un email. La réponse est **toujours** `200 {status:
  "ok", message: "Si un compte non activé existe…"}` (inconnu, déjà activé ou
  adresse invalide compris, sans envoi).
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
  sans email.

## Règles de gestion

- **RG1** — Rôle `apprenant` attribué par défaut (cahier §3.2) ; les autres
  rôles relèvent de l'administration (UC-ADM-01).
- **RG2** — Pas de session avant activation : l'activation est le « premier
  login qui confirme ».
- **RG3** — Code : 4 chiffres, haché (Argon2id), 30 minutes, 5 essais,
  usage unique ; un renvoi régénère le code et rouvre les 5 essais. Le vrai
  garde-fou du code court est le quota de renvoi (E8).
- **RG4** — Anti-énumération : `activate` et `resend` répondent de façon
  identique quel que soit l'état du compte.
- **RG5** — Quotas (`RateLimiter`, fenêtre fixe, seaux hachés, IPv6 par /64) :
  inscription 10/h/IP comptée avant validation ; activation 20/15 min/IP ;
  renvoi 3/h/compte + 10/h/IP.
- **RG6** — Email normalisé `trim` + minuscules (la collation
  `utf8mb4_unicode_ci` rend en outre la recherche et l'index unique
  insensibles à la casse) ; mot de passe compté en caractères (`mb_strlen`
  ≥ 10) et borné en octets (≤ 1024).
- **RG7** — `register`, `activate`, `resend` sont exemptés de CSRF (routes de
  visiteur, protégées par quotas).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Email, nom affiché | `users` ; purgés avec le compte (UC-CPT-06) |
| Mot de passe | Empreinte Argon2id uniquement |
| Code de confirmation | Empreinte Argon2id, expiration, compteur ; effacés à l'activation (registre RGPD §1 bis) |
| IP du visiteur | Jamais stockée : seaux de quota hachés ; journal `login` = pays + réseau tronqué (/24, /48) |
| Email transporté | `mail()` OVH (sous-traitant d'hébergement), aucun service tiers |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/activer?email=&code=` |
| Front | `web/src/App.jsx` | Route `activer` → `AccountView initialActivation` ; écoute `humanome:auth` |
| Front | `web/src/views/AccountView.jsx` | Formulaire d'inscription, contrôles locaux, écran d'activation, renvoi |
| Front | `web/src/api/client.js` — `register`, `activate`, `resendCode`, `apiFetch`, `ApiError`, `notifyAuthChanged` | Appels, jeton CSRF, erreurs par champ |
| API | `POST /api/auth/register`, `/activate`, `/resend` — `api/src/routes/auth.php` | Orchestration, `$sendVerification` |
| Domaine | `api/src/Auth/Users.php` — `create`, `assignRole`, `hashPassword`, `findByEmail`, `setVerificationCode`, `bumpVerificationAttempts`, `markVerified`, `isVerified` | Compte et code |
| Domaine | `api/src/Auth/Audit.php` | `account_created` |
| Domaine | `api/src/Auth/RateLimiter.php`, `api/src/ClientIp.php` | Quotas |
| Domaine | `api/src/Mail/MailerFactory.php`, `MemoryMailer.php`, `PhpMailMailer.php` | Envoi du code |
| Domaine | `api/src/Auth/Session.php`, `api/src/Auth/LoginJournal.php` | Session et journal à l'activation (détaillés en UC-CPT-02) |
| Domaine | `api/src/Middleware/CsrfMiddleware.php` | Exemptions des routes visiteur |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CPT-01-U01 | `Users::create`, `assignRole`, `rolesOf` | Rôle `apprenant` par défaut, compte non activé ; rôle inconnu refusé (RG1) | `api/tests/UseCases/Unit/UcCpt01CreerActiverCompteTest.php` |
| UC-CPT-01-U02 | `Users::hashPassword` | Argon2id, jamais en clair | idem |
| UC-CPT-01-U03 | `setVerificationCode`, `bumpVerificationAttempts` | Code haché + expiration, essais comptés, renvoi = 0 (RG3) | idem |
| UC-CPT-01-U04 | `markVerified`, `isVerified` | Activation, code effacé (usage unique) | idem |
| UC-CPT-01-U05 | `findByEmail` | Colonnes de vérification lues, casse indifférente (collation), ligne supprimée invisible | idem |
| UC-CPT-01-U06 | `MailerFactory`, `MemoryMailer` | Couture de test, extraction du code du lien | idem |
| UC-CPT-01-U07 | `Audit::record` | `account_created` sans détail | idem |
| UC-CPT-01-U08 | `RateLimiter` | Quotas 10/h, 20/15 min, 3/h ; 30 s au premier refus (RG5) | idem |
| UC-CPT-01-U09 | `CsrfMiddleware` | Exemption de register/activate/resend, aucune session ouverte (RG7) | idem |
| UC-CPT-01-U10 | `parseHash` | `#/activer?email=&code=` → route `activer` | `web/test/usecases/unit/uc-cpt-01-creer-activer-compte.test.jsx` |
| UC-CPT-01-U11 | `register` | Quatre champs POSTés, ni jeton ni événement de session | idem |
| UC-CPT-01-U12 | `activate` | Jeton CSRF mémorisé, `humanome:auth` émis | idem |
| UC-CPT-01-U13 | `resendCode` | POST `{email}`, réponse générique | idem |
| UC-CPT-01-U14 | `apiFetch`, `ApiError` | 422 → `fields` ; 409/429 → message serveur | idem |
| UC-CPT-01-U15 | `AccountView` (écran d'activation, seul) | Email seul pré-rempli, champ code (4, `one-time-code`), indice 30 min, « Retour à la connexion » | idem |

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
| UC-CPT-01-F20 | E8 | IHM | Renvoi refusé (429) affiché | idem |

Les tests IHM jouent `<App/>` contre un faux serveur en mémoire qui rejoue le
contrat HTTP des routes du compte (`web/test/usecases/support/cpt.js`).

### Tests existants liés (non-régression)

- `api/tests/AuthRoutesTest.php` — inscription en attente, activation, validation, doublon, double saisie.
- `api/tests/AuthActivationTest.php` — login bloqué, verrou, expiration, renvoi, anti-énumération, backfill 018.
- `api/tests/AuthRateLimitTest.php` — quota d'inscription par IP.
- `api/tests/AuthCsrfTest.php` — exemptions de `login`/`register`.
- `web/src/views/AccountView.test.jsx` — composant isolé (double saisie, activation, lien `#/activer`).
- `web/e2e/parcours-apprenant.e2e.js` — étape « Création de compte » (navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCpt01
cd web && npx vitest run test/usecases --testNamePattern UC-CPT-01
```

## Limites

- Le code du lien reste dans l'historique du navigateur (`#/activer?…&code=`) ;
  il est à usage unique et effacé à l'activation, ce qui borne l'exposition.
- Le front n'applique que les contrôles de présence et de longueur minimale ;
  le format de l'email et les longueurs maximales ne sont vérifiés que par
  l'API (E2).
