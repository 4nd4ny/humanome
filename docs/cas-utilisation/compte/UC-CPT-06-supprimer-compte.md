# UC-CPT-06 — Supprimer son compte (droit à l'effacement)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Tout utilisateur inscrit et connecté (son propre compte) |
| **Acteurs secondaires** | Employeur détenteur d'un lien de partage ; cartographe lié ; apprenant dont le compte supprimé était le cartographe ; membres des cohortes d'un compte établissement supprimé (A4) ; bénéficiaires des rôles, accès Golden et contenus collectifs d'un contributeur supprimé (A5) |
| **Portée** | humanome.xyz — « Zone de danger » de `#/compte` ; `DELETE /api/auth/account` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §4.5 (« export/suppression de compte automatisée via l'interface »), §6.3 (suppression en un clic) ; journalisation minimale : `CLAUDE.md`, principe RGPD n° 5, et `docs/rgpd-registre.md` §10 ; graphe de suppression : `api/tests/RgpdAuditTest.php`, `docs/rgpd-verification.md` (migrations 001 à 010) |
| **Statut** | Implémenté (P3.4 ; cascades complétées à chaque module, vérifiées en P12.2) |

## Objectif

Exercer son droit à l'effacement : supprimer immédiatement et définitivement
son compte et **toutes** ses données serveur, en ne laissant qu'une trace
d'audit datée dont le lien au compte est rompu (`user_id` → `NULL`). Cette
trace n'est pas strictement anonyme : voir « Données et RGPD » et « Limites ».

## Déclencheur

L'utilisateur connecté ouvre `#/compte` (ou suit le lien « espace compte » de
la section Export de son espace) et utilise la « Zone de danger ».

## Préconditions

- Session ouverte (UC-CPT-02) ; le client détient le jeton CSRF.
- Recommandé : avoir exporté son archive locale (UC-APP-06) — la suppression
  ne propose pas d'export.

## Garanties en cas de succès

- La ligne `users` est **réellement supprimée** (pas de suppression logique),
  avec son avatar et ses colonnes de vérification.
- En cascade : rôles, sessions (de **tous** ses navigateurs, hors requête
  concurrente : AN1), cartographies et leurs liens de partage, annotations et
  garanties portées sur elles, progression de formation, clés API chiffrées,
  invitations, liens cartographe, adhésions et dépôts de cohorte, crédit
  Twin9 et son grand livre, commandes et captures PayPal, votes de
  gouvernance, etc. Pour un compte établissement, la cascade atteint **les
  données d'autres comptes** : ses cohortes, et avec elles les adhésions, les
  portfolios déposés et les cartographies de masse de ses membres (A4). Graphe
  exact : `api/tests/RgpdAuditTest.php` (`EXPECTED_USER_FK_RULES`, migrations
  001 à 021) ; détail table par table des migrations 001 à 010 :
  `docs/rgpd-verification.md`.
- Anonymisation (`SET NULL`) : les événements d'audit rattachés au compte
  (`account_created`, `login`, `login_failed`… et le nouvel `account_deleted`),
  les révisions qu'un cartographe supprimé avait faites sur la cartographie
  d'un apprenant, et les contenus collectifs d'un contributeur (versions de
  référentiel, de compétence et de prompt, accès Golden accordés, protocole
  Twin9 : A5).
- Le navigateur repasse en visiteur : jeton oublié, navigation rafraîchie,
  message de confirmation.
- L'adresse email est libérée (une nouvelle inscription redevient possible).

## Garanties minimales (en cas d'échec)

- Sans session valide ou sans jeton CSRF, rien n'est supprimé.
- Audit et purge sont dans une **même transaction** : une erreur annule tout
  (pas de compte à moitié purgé, pas d'événement `account_deleted` orphelin),
  la session n'est pas détruite (E4).

## Scénario nominal

1. L'utilisateur voit la « Zone de danger » : « La suppression de votre compte
   est immédiate et définitive : purge réelle de toutes vos données serveur
   (profil, rôles, progression, clés API, partages), consignée par un
   événement d'audit (RGPD). Vos fichiers locaux (cartographies exportées) ne
   sont pas concernés. »
2. Le bouton « Supprimer mon compte » est désactivé ; l'utilisateur saisit son
   email dans le champ de confirmation.
3. Le bouton ne s'active que si la saisie (espaces de bord retirés) est
   **exactement** l'email du compte.
4. Il clique ; le site envoie `DELETE /api/auth/account` avec `X-CSRF-Token`
   (sans corps).
5. Le serveur vérifie la session puis, dans une transaction, enregistre
   `account_deleted` (avec l'identifiant) et exécute `Users::purge`
   (`DELETE FROM users`) : les clés étrangères effacent ou anonymisent tout le
   reste, y compris la ligne d'audit qui vient d'être écrite (`user_id` →
   `NULL`).
6. Le serveur détruit la session PHP (sinon l'écriture de fin de requête
   recréerait une ligne de session orpheline) et répond `204`.
7. Le client oublie le jeton et émet `humanome:auth` ; le site affiche « Votre
   compte a été supprimé : toutes vos données serveur ont été réellement
   purgées (un événement d'audit anonyme en garde la trace, conformément au
   RGPD). » et le formulaire de connexion ; la navigation redevient celle d'un
   visiteur.

## Scénarios alternatifs

- **A1 — Données locales** (étape 5) : ce qui vit dans le navigateur
  (portfolios IndexedDB, cartographies locales, `humanome-keys`,
  `humanome-training`) n'est pas touché ; l'utilisateur les garde ou les efface
  lui-même.
- **A2 — Compte cartographe** (étape 5) : ses liens avec les apprenants, ses
  annotations et ses garanties disparaissent ; les révisions qu'il avait
  proposées restent aux apprenants, auteur anonymisé. Un lien de partage d'une
  cartographie qu'il avait garantie sert de nouveau le **document de base**,
  sans mention de garantie (UC-EMP-01 A2).
- **A3 — Réinscription** (après l'étape 7) : la même adresse peut créer un
  nouveau compte, qui n'hérite de rien (rôles, photo, clés, progression,
  cartographies).
- **A4 — Compte établissement** (étape 5) : ses cohortes sont supprimées en
  cascade, et avec elles les adhésions, les portfolios déposés et les jobs
  et cartographies de masse de **tous ses membres** ; les comptes des membres
  restent, sans la cohorte. Aucun avertissement particulier n'est affiché.
- **A5 — Compte contributeur** (administrateur, épistémiarque,
  promptologue ; étape 5) : ce qu'il a produit pour les autres survit —
  rôles qu'il a attribués, versions de référentiel, de compétence et de
  prompt, accès Golden accordés — avec un auteur `NULL` ; ses événements
  d'audit sont anonymisés mais gardent dans leurs détails l'identifiant
  numérique des comptes visés (voir « Limites »).

## Scénarios d'erreur

- **E1 — Pas de session** (étape 5) : `401 « Authentification requise »`. Un
  cookie périmé (après déconnexion) accompagné de l'ancien jeton est refusé
  plus tôt, `403`, par la garde CSRF (qui ne trouve pas de jeton dans la
  session neuve).
- **E2 — Jeton CSRF absent ou faux** (étape 4) : `403 « Jeton CSRF absent ou
  invalide »` — un tir cross-site ne peut pas supprimer un compte ; le compte
  et la session restent intacts.
- **E3 — Refus affiché** (étape 7) : le site affiche le message d'erreur
  (`role="alert"`) et reste sur le profil ; le jeton et la saisie de
  confirmation sont conservés.
- **E4 — Purge impossible** (étape 5) : une erreur SQL pendant la purge (ex.
  contrainte non prévue) → la transaction est annulée (ni suppression ni
  `account_deleted`), l'erreur remonte au middleware d'erreur → `500` sans
  détail en production ; la session reste ouverte.

## Règles de gestion

- **RG1** — Purge réelle : `DELETE` de la ligne `users`, jamais de
  `deleted_at` posé par ce cas.
- **RG2** — Toute colonne identifiant un utilisateur est régie par une clé
  étrangère `CASCADE` (effacement) ou `SET NULL` (anonymisation documentée) ;
  contrôle automatique : `scripts/rgpd-audit.php`, `RgpdAuditTest`.
- **RG3** — Trace minimale : `account_deleted` sans détail, anonymisé par la
  purge elle-même.
- **RG4** — La confirmation par saisie de l'email est une garde de l'interface ;
  l'API n'exige que la session et le jeton CSRF.
- **RG5** — La session courante est détruite (cookie expiré) ; les autres
  sessions du compte disparaissent par cascade — hors requête concurrente d'un
  autre navigateur, qui peut réécrire sa ligne de session après la purge
  (AN1).

## Données et RGPD

| Donnée | Sort |
|---|---|
| Profil (email, nom, empreinte, avatar, code de vérification) | Supprimé (ligne `users`) |
| Rôles, sessions, progression, clés API, cartographies, liens de partage | CASCADE |
| Crédit Twin9, grand livre, commandes et captures PayPal | CASCADE : le solde prépayé est perdu et les captures nécessaires à un remboursement disparaissent (aucun avertissement, voir « Limites ») |
| Cohortes d'un établissement (adhésions, dépôts, jobs de masse des membres) | CASCADE (A4) |
| Contenus collectifs d'un contributeur (versions, accès Golden accordés, protocole Twin9) | Conservés, auteur → `NULL` (A5) |
| Audit (création, connexions, suppression) | Conservé, `user_id` → `NULL` ; les événements `login` / `login_failed` gardent pays et réseau tronqué jusqu'à 365 jours ; les événements **d'autres acteurs** (rôle attribué, invitation acceptée, accès Golden…) gardent l'identifiant numérique du compte supprimé dans `details` (hors clé étrangère) |
| Empreinte de l'email (quota de renvoi de code) | `rate_limits` `resend:acct:` + sha256(email) : non touchée par la suppression (UC-CPT-01 AN2) |
| Révisions faites par un cartographe supprimé | Conservées pour l'apprenant, `author_id` → `NULL` |
| Données du navigateur | Non concernées (A1) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/AccountView.jsx` — « Zone de danger », `handleDelete`, `becomeAnonymous` | Confirmation par l'email, message final, erreurs |
| Front | `web/src/api/client.js` — `deleteAccount` | DELETE + jeton, oubli du jeton, `humanome:auth` |
| Front | `web/src/App.jsx` | Navigation rafraîchie après la suppression (écoute de `humanome:auth` testée unitairement en UC-CPT-02-U14) |
| API | `DELETE /api/auth/account` — `api/src/routes/auth.php` | Session, transaction audit + purge, destruction de session |
| Domaine | `api/src/Auth/Users.php` — `purge` | `DELETE` réel |
| Domaine | `api/src/Auth/Audit.php` — `ACCOUNT_DELETED` | Trace anonyme |
| Domaine | `api/src/Auth/Session.php` — `destroy` | Pas de session orpheline |
| Données | Clés étrangères des migrations `001` à `021` | Cascades et anonymisations |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CPT-06-U01 | `Users::purge` | Vrai DELETE ; rôles, session, cartographies + partages, progression, clés, avatar ; autre compte intact (RG1, RG2) | `api/tests/UseCases/Unit/UcCpt06SupprimerCompteTest.php` |
| UC-CPT-06-U02 | `Audit::record`, `Users::purge` | `account_deleted` et traces antérieures conservées, anonymisées, datées (RG3) | idem |
| UC-CPT-06-U03 | `Users::purge` (cartographe) | Liens, annotations, garantie effacés ; révision conservée, auteur `NULL` (A2) | idem |
| UC-CPT-06-U04 | `Session::destroy` | Contre-exemple : sans lui, session orpheline recréée à la fin de requête ; avec lui, aucune (fin de requête simulée dans les deux cas, RG5) | idem |
| UC-CPT-06-U05 | `deleteAccount` | DELETE sans corps + jeton ; jeton oublié ; `humanome:auth` | `web/test/usecases/unit/uc-cpt-06-supprimer-compte.test.jsx` |
| UC-CPT-06-U06 | `deleteAccount` | 403 : erreur typée, jeton conservé, aucun événement (E3) | idem |
| UC-CPT-06-U07 | `AccountView` (Zone de danger) | Bouton actif pour l'email exact seulement, casse comprise, espaces tolérés (RG4) | idem |
| UC-CPT-06-U08 | `Users::purge` (contributeur) | Version de prompt et accès Golden conservés, `created_by` / `granted_by` → `NULL` (A5) | `api/tests/UseCases/Unit/UcCpt06SupprimerCompteTest.php` |
| UC-CPT-06-U09 | `AccountView` — `handleDelete`, `becomeAnonymous` (seul) | Succès : notice RGPD, formulaire de connexion vierge ; échec : alerte, profil et saisie conservés (E3) | `web/test/usecases/unit/uc-cpt-06-supprimer-compte.test.jsx` |
| UC-CPT-06-U10 | `Session`, `DbSessionHandler`, `Users::purge` | **Anomalie AN1 figée** : requête en vol d'un autre navigateur → ligne de session réécrite, `user_id` NULL mais données nommant le compte supprimé | `api/tests/UseCases/Unit/UcCpt06SupprimerCompteTest.php` |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-06-F01 | Nominal | API | Compte peuplé par les routes réelles → 204 ; **aucune ligne de session sous ses deux identifiants juste après la réponse (étape 6, RG5)** ; 8 tables vides pour lui ; audit anonymisé ; lien de partage 404 ; avatar 404 ; ses deux sessions mortes ; login 401 ; Bob intact | `api/tests/UseCases/Functional/UcCpt06SupprimerCompteTest.php` |
| UC-CPT-06-F02 | A2 | API | Cartographe supprimé : lien de l'apprenant sans garantie, document de base ; révision anonymisée, toujours listée et lisible par l'apprenante via l'API (`author` null) | idem |
| UC-CPT-06-F03 | A3 | API | Compte peuplé supprimé, même email réinscrit : compte neuf sans rôle hérité, photo, clé, progression ni cartographie | idem |
| UC-CPT-06-F04 | E1 | API | 401 « Authentification requise » sans session ; cookie périmé → 403 ; rien supprimé | idem |
| UC-CPT-06-F05 | E2 | API | 403 sans jeton / jeton faux ; compte et session intacts | idem |
| UC-CPT-06-F06 | Nominal | IHM | `<App/>` : bouton verrouillé, email erroné refusé, DELETE + CSRF, message RGPD, navigation visiteur | `web/test/usecases/functional/uc-cpt-06-supprimer-compte.test.jsx` |
| UC-CPT-06-F07 | A1 | IHM | `humanome-keys`, `humanome-training`, portfolio et cartographie IndexedDB (faux IndexedDB en mémoire) conservés | idem |
| UC-CPT-06-F08 | E1, E2, E3 | IHM | 403 puis 401 affichés, profil conservé et compte intact après chacun | idem |
| UC-CPT-06-F09 | E4 | API | Contrainte RESTRICT posée pour le test : 500 sans détail SQL (production), compte, rôles et session intacts, aucun `account_deleted` | `api/tests/UseCases/Functional/UcCpt06SupprimerCompteTest.php` |
| UC-CPT-06-F10 | A4 | API | Établissement supprimé : cohorte, adhésion et dépôt du membre effacés ; le membre ne voit plus la cohorte, son compte reste | idem |
| UC-CPT-06-F11 | A5 | API | Administrateur supprimé : le rôle attribué reste, audit `role_granted` anonymisé ; l'identifiant du compte visé reste dans `details`, même après sa propre suppression | idem |

### Tests existants liés (non-régression)

- `api/tests/AuthAccountDeletionTest.php` — purge de chaque table, audit anonymisé, session requise, login impossible ensuite.
- `api/tests/CartographiesPurgeTest.php`, `api/tests/CartographePurgeTest.php`, `api/tests/MasseRgpdPurgeTest.php` — cascades par module.
- `api/tests/RgpdAuditTest.php` — aucune colonne utilisateur sans clé étrangère, graphe conforme au registre.
- `web/src/views/AccountView.test.jsx`, `web/src/api/client.test.js` — confirmation et appel isolés.
- `web/e2e/parcours-apprenant.e2e.js` — étapes « Suppression du compte » puis « lien de partage 404 » :
  **inatteignables** tant que l'étape « Création de compte » du même parcours, périmée depuis D5,
  n'est pas réécrite (UC-CPT-01, « Tests existants liés »).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCpt06
cd web && npx vitest run test/usecases --testNamePattern UC-CPT-06
```

## Anomalies constatées

- **AN1 — Session ressuscitée par une requête concurrente.** RG5 (« les autres
  sessions disparaissent par cascade ») ne vaut qu'en l'absence de requête en
  vol : une requête d'un autre navigateur du même compte, qui a chargé sa
  session avant la purge, la réécrit à sa fin (`DbSessionHandler::write` fait
  `INSERT … ON DUPLICATE KEY UPDATE`, sans verrou). La ligne recréée a
  `user_id` NULL mais ses données contiennent encore `user_id` et le jeton
  CSRF : `Session::userId()` rend alors l'identifiant d'un compte qui n'existe
  plus aux routes qui ne revérifient pas son existence (seul `GET /auth/me`
  le fait). Elle ne donne accès à aucune donnée (les requêtes par
  identifiant ne trouvent rien, les écritures échouent sur la clé étrangère)
  et expire avec le ramasse-miettes des sessions. Figé par UC-CPT-06-U10.

## Limites

- Le cahier (§6.3) associe suppression et « transfert des données vers un
  fichier local » : l'écran de suppression ne propose pas d'export ; l'export
  est un geste séparé dans l'espace apprenant (UC-APP-06), dont la section
  renvoie vers `#/compte` pour la suppression.
- Les données du navigateur (dont une clé API mémorisée en `localStorage`)
  survivent à la suppression du compte (A1) ; aucune commande ne les efface
  depuis l'écran de suppression.
- La « Zone de danger » n'avertit ni de la perte du **crédit Twin9 prépayé**
  (solde, grand livre et captures PayPal nécessaires à un remboursement sont
  purgés en cascade), ni, pour un compte établissement, de l'effacement des
  cohortes et des données déposées par ses membres (A4).
- La trace d'audit n'est pas strictement anonyme : les événements
  `login` / `login_failed` anonymisés gardent pays et réseau tronqué jusqu'à
  365 jours ; les événements d'autres acteurs (`role_granted`,
  `role_revoked`, `invitation_accepted`, `golden_access_granted`…) gardent
  l'identifiant numérique du compte supprimé dans `details`, hors clé
  étrangère (pseudonyme orphelin, UC-CPT-06-F11).
