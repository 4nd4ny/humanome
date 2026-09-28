# UC-CPT-06 — Supprimer son compte (droit à l'effacement)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Tout utilisateur inscrit et connecté (son propre compte) |
| **Acteurs secondaires** | Employeur détenteur d'un lien de partage ; cartographe lié ; apprenant dont le compte supprimé était le cartographe |
| **Portée** | humanome.xyz — « Zone de danger » de `#/compte` ; `DELETE /api/auth/account` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §4.5 (« export/suppression de compte automatisée via l'interface »), §6.3 (suppression en un clic), §6.5 (trace minimale) ; `docs/rgpd-verification.md`, `docs/rgpd-registre.md` |
| **Statut** | Implémenté (P3.4 ; cascades complétées à chaque module, vérifiées en P12.2) |

## Objectif

Exercer son droit à l'effacement : supprimer immédiatement et définitivement
son compte et **toutes** ses données serveur, en ne laissant qu'une trace
d'audit anonyme et datée.

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
- En cascade : rôles, sessions (de **tous** ses navigateurs), cartographies et
  leurs liens de partage, annotations et garanties portées sur elles,
  progression de formation, clés API chiffrées, invitations, liens cartographe,
  adhésions et dépôts de cohorte, etc. (graphe complet :
  `docs/rgpd-verification.md`).
- Anonymisation (`SET NULL`) : les événements d'audit rattachés au compte
  (`account_created`, `login`, `login_failed`… et le nouvel `account_deleted`),
  les révisions qu'un cartographe supprimé avait faites sur la cartographie
  d'un apprenant.
- Le navigateur repasse en visiteur : jeton oublié, navigation rafraîchie,
  message de confirmation.
- L'adresse email est libérée (une nouvelle inscription redevient possible).

## Garanties minimales (en cas d'échec)

- Sans session valide ou sans jeton CSRF, rien n'est supprimé.
- Audit et purge sont dans une **même transaction** : une erreur annule tout
  (pas de compte à moitié purgé, pas d'événement `account_deleted` orphelin).

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
  nouveau compte, qui n'hérite de rien.

## Scénarios d'erreur

- **E1 — Pas de session** (étape 5) : `401 « Authentification requise »`. Un
  cookie périmé (après déconnexion) accompagné de l'ancien jeton est refusé
  plus tôt, `403`, par la garde CSRF (qui ne trouve pas de jeton dans la
  session neuve).
- **E2 — Jeton CSRF absent ou faux** (étape 4) : `403 « Jeton CSRF absent ou
  invalide »` — un tir cross-site ne peut pas supprimer un compte ; le compte
  et la session restent intacts.
- **E3 — Refus affiché** (étape 7) : le site affiche le message d'erreur
  (`role="alert"`) et reste sur le profil ; le jeton est conservé.

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
  sessions du compte disparaissent par cascade.

## Données et RGPD

| Donnée | Sort |
|---|---|
| Profil (email, nom, empreinte, avatar, code de vérification) | Supprimé (ligne `users`) |
| Rôles, sessions, progression, clés API, cartographies, liens de partage | CASCADE |
| Audit (création, connexions, suppression) | Conservé, `user_id` → `NULL` |
| Révisions faites par un cartographe supprimé | Conservées pour l'apprenant, `author_id` → `NULL` |
| Données du navigateur | Non concernées (A1) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/AccountView.jsx` — « Zone de danger », `handleDelete`, `becomeAnonymous` | Confirmation par l'email, message final, erreurs |
| Front | `web/src/api/client.js` — `deleteAccount` | DELETE + jeton, oubli du jeton, `humanome:auth` |
| Front | `web/src/App.jsx` | Navigation rafraîchie après la suppression |
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
| UC-CPT-06-U04 | `Session::destroy` | Contre-exemple : sans lui, session orpheline recréée ; avec lui, aucune (RG5) | idem |
| UC-CPT-06-U05 | `deleteAccount` | DELETE sans corps + jeton ; jeton oublié ; `humanome:auth` | `web/test/usecases/unit/uc-cpt-06-supprimer-compte.test.jsx` |
| UC-CPT-06-U06 | `deleteAccount` | 403 : erreur typée, jeton conservé, aucun événement (E3) | idem |
| UC-CPT-06-U07 | `AccountView` (Zone de danger) | Bouton actif pour l'email exact seulement, casse comprise, espaces tolérés (RG4) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-06-F01 | Nominal | API | Compte peuplé par les routes réelles → 204 ; 8 tables vides pour lui ; audit anonymisé ; lien de partage 404 ; avatar 404 ; ses deux sessions mortes ; login 401 ; Bob intact | `api/tests/UseCases/Functional/UcCpt06SupprimerCompteTest.php` |
| UC-CPT-06-F02 | A2 | API | Cartographe supprimé : lien de l'apprenant sans garantie, document de base ; révision anonymisée | idem |
| UC-CPT-06-F03 | A3 | API | Même email réinscrit : compte neuf, rien d'hérité | idem |
| UC-CPT-06-F04 | E1 | API | 401 sans session ; cookie périmé → 403 ; rien supprimé | idem |
| UC-CPT-06-F05 | E2 | API | 403 sans jeton / jeton faux ; compte et session intacts | idem |
| UC-CPT-06-F06 | Nominal | IHM | `<App/>` : bouton verrouillé, email erroné refusé, DELETE + CSRF, message RGPD, navigation visiteur | `web/test/usecases/functional/uc-cpt-06-supprimer-compte.test.jsx` |
| UC-CPT-06-F07 | A1 | IHM | `humanome-keys` et `humanome-training` locaux conservés | idem |
| UC-CPT-06-F08 | E1, E2, E3 | IHM | 403 puis 401 affichés, profil conservé | idem |

### Tests existants liés (non-régression)

- `api/tests/AuthAccountDeletionTest.php` — purge de chaque table, audit anonymisé, session requise, login impossible ensuite.
- `api/tests/CartographiesPurgeTest.php`, `api/tests/CartographePurgeTest.php`, `api/tests/MasseRgpdPurgeTest.php` — cascades par module.
- `api/tests/RgpdAuditTest.php` — aucune colonne utilisateur sans clé étrangère, graphe conforme au registre.
- `web/src/views/AccountView.test.jsx`, `web/src/api/client.test.js` — confirmation et appel isolés.
- `web/e2e/parcours-apprenant.e2e.js` — étapes « Suppression du compte » puis « lien de partage 404 ».

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCpt06
cd web && npx vitest run test/usecases --testNamePattern UC-CPT-06
```

## Limites

- Le cahier (§6.3) associe suppression et « transfert des données vers un
  fichier local » : l'écran de suppression ne propose pas d'export ; l'export
  est un geste séparé dans l'espace apprenant (UC-APP-06), dont la section
  renvoie vers `#/compte` pour la suppression.
- Les données du navigateur (dont une clé API mémorisée en `localStorage`)
  survivent à la suppression du compte (A1) ; aucune commande ne les efface
  depuis l'écran de suppression.
