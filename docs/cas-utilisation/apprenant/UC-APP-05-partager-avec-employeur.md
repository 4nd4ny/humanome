# UC-APP-05 — Partager une cartographie avec un employeur

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (compte actif, rôle `apprenant`) |
| **Acteurs secondaires** | Employeur potentiel (destinataire du lien et du mot de passe, UC-EMP-01) |
| **Portée** | humanome.xyz — espace apprenant `#/espace`, « Mes cartographies » → dialogue « Partager » ; API `/api/cartographies/{id}/share`, `/api/cartographies/{id}/shares`, `/api/shares/{shareId}` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (partager sa cartographie validée), §3.6, §4.8, §6.4 (partage = décision explicite et individuelle, lien + mot de passe) ; journalisation minimale : principe RGPD 5 de `CLAUDE.md` (le §6.5 du cahier traite de l'open data) |
| **Statut** | Implémenté (P8 / contrat M6) |

## Objectif

Permettre à l'apprenant de donner accès, **à un destinataire précis et pour
une durée choisie**, à une cartographie dont il a une copie serveur : il crée
un **lien** protégé par un **mot de passe**, suit ses liens (dates de
création, d'expiration, de révocation) et peut en **révoquer** un à tout
moment. La consultation du lien par l'employeur est l'objet de UC-EMP-01.

## Déclencheur

Dans « Mes cartographies », l'apprenant clique **« Partager »** sur une
cartographie portant le badge « copie serveur ».

## Préconditions

- La cartographie a une copie serveur (opt-in, UC-APP-04) : le bouton
  « Partager » n'existe qu'avec un `serverId`.
- Compte activé, session ouverte, rôle `apprenant` (UC-CPT-01, UC-CPT-02).

## Garanties en cas de succès

- Un lien `share_links` est créé : **seules** l'empreinte `sha256` du jeton et
  l'empreinte Argon2id du mot de passe sont stockées ; `expires_at = NOW() + N
  jours`.
- L'URL complète `<origine><chemin>#/partage/<jeton>` est affichée **une
  seule fois** ; le champ mot de passe est vidé ; la liste des liens est
  rafraîchie (dates seulement).
- L'événement `share_created` est journalisé avec des identifiants et la
  durée (`cartographieId`, `shareId`, `expiresInDays`) — ni jeton, ni mot de
  passe, ni contenu.
- Une révocation date `revoked_at`, journalise `share_revoked` et rend le lien
  inopérant **immédiatement** (même `404` que « lien inconnu » pour
  l'employeur, UC-EMP-01 E3).

## Garanties minimales (en cas d'échec)

- Aucun lien n'est créé ni révoqué ; aucun secret n'est journalisé.
- Aucune réponse ne révèle l'existence d'une cartographie ou d'un lien d'un
  autre compte (`404`).
- Le jeton en clair n'est jamais réaffiché (ni liste, ni réouverture du
  dialogue).

## Scénario nominal

1. L'apprenant clique « Partager » : le dialogue « Partager « *titre* » »
   s'ouvre et charge ses liens (`GET /api/cartographies/{serverId}/shares` →
   `[{shareId, createdAt, expiresAt, revokedAt}]`). Il rappelle que le lien
   ouvre la cartographie en lecture seule et qu'il faut **transmettre le mot
   de passe par un autre canal que le lien**.
2. Il saisit un mot de passe d'au moins 8 caractères ; l'expiration est
   pré-remplie à **90** jours.
3. Il clique « Créer le lien de partage » : le navigateur contrôle localement
   le mot de passe (≥ 8 unités UTF-16, `length`) puis l'expiration (convertie
   par `Number.parseInt`, puis 1..365 — voir anomalie 2) et envoie `POST
   /api/cartographies/{serverId}/share` `{password, expiresInDays}` avec
   `X-CSRF-Token`.
4. Le serveur contrôle, dans cet ordre : le jeton CSRF (middleware global,
   seulement si un cookie de session est présent), la session et le rôle
   (`RequireRole`, rôle relu en base), la **propriété** de la cartographie
   (`404` sinon), puis le corps (RG2, RG3) ; il crée le lien (jeton aléatoire
   de 16 octets → 32 hex), journalise `share_created` et répond `201
   {shareId, token, url: "/#/partage/<token>"}`.
5. Le navigateur affiche l'URL **absolue** (« Lien créé — copiez-le
   maintenant, il ne sera plus jamais affiché en entier »), vide le champ mot
   de passe et recharge la liste (« Créé le JJ/MM/AAAA — expire le
   JJ/MM/AAAA » + « Révoquer »).
6. Il clique « Copier le lien » : l'URL part dans le presse-papiers, le bouton
   devient « Lien copié ».
7. Il transmet le lien et, séparément, le mot de passe à l'employeur, qui
   consulte selon UC-EMP-01.

## Scénarios alternatifs

- **A1 — Expiration choisie ou par défaut** (étape 2) : l'apprenant saisit une
  durée de 1 à 365 jours ; côté API, une durée absente **ou `null`** vaut 90
  jours.
- **A2 — Révoquer un lien** (après l'étape 5) : « Révoquer » envoie `DELETE
  /api/shares/{shareId}` → `204` ; `revoked_at` est posé (la ligne reste
  30 jours, fait daté, puis la maintenance quotidienne la supprime —
  UC-SYS-03), `share_revoked` est journalisé, la liste affiche « révoqué le
  JJ/MM/AAAA » sans bouton. Une nouvelle révocation répond `204` et conserve
  la date d'origine.
- **A3 — Plusieurs liens** (étape 3) : un lien par destinataire, chacun avec
  son jeton, son mot de passe et son expiration ; ils se révoquent
  indépendamment et sont listés dans l'ordre de création.
- **A4 — Lien expiré** (étape 1) : il reste listé (`revokedAt` nul, date
  d'expiration passée) pendant 30 jours après l'expiration — la maintenance
  quotidienne le supprime ensuite (UC-SYS-03) —, ne compte plus dans le
  compteur `shares` de la cartographie et répond `404` à l'employeur ; l'IHM
  l'affiche encore avec « Révoquer » (voir Limites).
- **A5 — Cartographie sans copie serveur** (déclencheur) : pas de bouton
  « Partager », seulement « Copier sur le serveur » (UC-APP-04).
- **A6 — Fermer puis rouvrir le dialogue** (après l'étape 5) : l'URL n'est plus
  affichée ; seules les dates des liens restent.

## Scénarios d'erreur

- **E1 — Mot de passe invalide** (étape 3) : moins de 8 unités UTF-16 →
  refus local « Le mot de passe du lien doit compter au moins 8
  caractères. », sans requête. Côté API : absent, non chaîne ou de moins de 8
  caractères (comptés en points de code, `mb_strlen`) → `422
  fields.password` ; plus de 1024 octets → `422 "Mot de passe trop long"`
  (1024 octets sont acceptés). Le contrôle local ne borne pas la longueur et
  compte en UTF-16 : un mot de passe de plus de 1024 octets, ou de moins de 8
  points de code faits de caractères astraux (« 😀😀😀😀 » : 8 unités UTF-16,
  4 points de code), part au serveur, qui répond `422` ; l'IHM n'affiche que
  « Validation échouée », sans le détail `fields`.
- **E2 — Expiration invalide** (étape 3) : hors 1..365, le champ numérique
  (`min=1`, `max=365`) bloque la soumission par la validation native du
  navigateur ; le garde JavaScript refuse aussi une valeur vide ou hors bornes
  (« L’expiration doit être comprise entre 1 et 365 jours. »). Côté API :
  non entier (chaîne, décimal, booléen) ou hors bornes → `422
  fields.expiresInDays`.
- **E3 — Session, CSRF, rôle** (étape 4) : sans session `401 "Authentification
  requise"` sur les trois routes — l'IHM ne le traduit qu'à la **création**
  (« Session expirée : reconnectez-vous puis réessayez. ») ; au chargement de
  la liste et à la révocation, elle affiche le message brut « Authentification
  requise » ; sans jeton CSRF `403 "Jeton CSRF absent ou invalide"` ; sans
  rôle `apprenant` `403 "Rôle insuffisant"` sur les trois routes (rôle relu à
  chaque requête). Le CSRF global passe avant `RequireRole` : un compte sans
  rôle qui n'envoie pas de jeton reçoit le `403` CSRF.
- **E4 — Cartographie ou lien d'autrui, ou inconnu** (étapes 1, 4, A2) :
  `404 "Cartographie introuvable"` (création, liste) ou `404 "Lien de partage
  introuvable"` (révocation) ; rien n'est créé ni révoqué. Vu de l'IHM (copie
  retirée depuis un autre appareil) : le message s'affiche dans le dialogue.
- **E5 — Échec de la révocation** (A2) : le message du serveur s'affiche, le
  lien reste présenté actif.
- **E6 — Presse-papiers indisponible** (étape 6) : le bouton reste « Copier le
  lien » ; l'URL reste affichée et sélectionnable à la main.

## Règles de gestion

- **RG1** — Le partage est une décision **individuelle et explicite** : un
  lien par geste, jamais automatique (§6.4).
- **RG2** — Mot de passe : chaîne d'au moins 8 caractères (`mb_strlen`) et
  d'au plus 1024 octets ; stocké en `password_hash` Argon2id, jamais en clair.
- **RG3** — Expiration : entier de 1 à 365 jours, 90 par défaut
  (`SHARE_DEFAULT_EXPIRES_DAYS` côté front, défaut de l'API).
- **RG4** — Jeton : 16 octets aléatoires (32 hex), rendu **une seule fois**
  (réponse de création) ; la base ne garde que `sha256(jeton)`.
- **RG5** — La liste des liens ne porte que `shareId`, `createdAt`,
  `expiresAt`, `revokedAt` ; le compteur `shares` de UC-APP-04 ne compte que
  les liens ni révoqués ni expirés.
- **RG6** — Propriété : création et liste exigent la propriété de la
  cartographie ; la révocation exige la propriété de la cartographie du lien ;
  sinon `404` (pas d'oracle).
- **RG7** — La révocation est idempotente et conserve la première date. La
  ligne disparaît avec sa cartographie (UC-APP-04 A4), avec le compte
  (UC-CPT-06), ou par la maintenance quotidienne 30 jours après son
  expiration ou sa révocation (`Maintenance::SHARE_LINK_GRACE_DAYS`,
  UC-SYS-03).
- **RG8** — Journal : `share_created {cartographieId, shareId,
  expiresInDays}`, `share_revoked {cartographieId, shareId}`, anonymisés
  (`user_id` NULL) à la purge du compte.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Jeton du lien | Clair une seule fois dans la réponse `201` ; `sha256` en base |
| Mot de passe du lien | Argon2id ; jamais journalisé, vidé du formulaire après création |
| Dates du lien | `created_at`, `expires_at`, `revoked_at` (fait daté conservé jusqu'à 30 jours après l'expiration ou la révocation, puis purgé par la maintenance) |
| Journal | `share_created`, `share_revoked` : identifiants et durée seulement |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/espace/CartographiesPanel.jsx` | Bouton « Partager » (si `serverId`), ouverture/fermeture du dialogue |
| Front | `web/src/views/espace/ShareDialog.jsx` — `handleCreate`, `handleRevoke`, `handleCopy`, `reloadLinks`, `absoluteShareUrl`, `SHARE_PASSWORD_MIN_LENGTH`, `SHARE_DEFAULT_EXPIRES_DAYS` | Formulaire, contrôles locaux, URL unique, liste, révocation |
| Front | `web/src/router.js` — `parseHash` | Le fragment produit est la route publique `share` (UC-EMP-01) |
| Front | `web/src/api/client.js` — `apiFetch`, `ApiError` | Jeton CSRF, erreurs typées |
| API | `api/src/routes/share.php` — `POST /api/cartographies/{id}/share`, `GET /api/cartographies/{id}/shares`, `DELETE /api/shares/{shareId}` | Validation, propriété, audit |
| API | `api/src/Middleware/CsrfMiddleware.php` (global, avant les gardes de route), `api/src/Middleware/RequireRole.php` | 403 CSRF ; 401/403, rôle relu en base (E3) — logique unitaire couverte par UC-CPT-02-U07 et UC-ADM-01-U10 |
| Domaine | `api/src/Share/ShareLinks.php` — `create`, `listForCartography`, `revokeForUser` | Jeton haché, liste sans secret, révocation datée |
| Domaine | `api/src/Cartographies/CartographyRepository.php` — `ownedBy`, compteur `shares` | Garde de propriété, liens actifs |
| Domaine | `api/src/Auth/Audit.php` — `record` | `share_created`, `share_revoked` |
| Système | `scripts/maintenance.php` — `Maintenance::run` | Purge des liens expirés ou révoqués depuis plus de 30 jours (UC-SYS-03, testé par UC-SYS-03-U01) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-05-U01 | `ShareLinks::create` | 32 hex, `sha256` et Argon2id seuls stockés, expiration à N jours (RG2, RG4) | `api/tests/UseCases/Unit/UcApp05PartagerEmployeurTest.php` |
| UC-APP-05-U02 | `ShareLinks::create` | Jeton et sel distincts par lien (A3) | idem |
| UC-APP-05-U03 | `ShareLinks::listForCartography` | Clés de dates seulement, ordre de création, révoqués/expirés inclus (RG5) | idem |
| UC-APP-05-U04 | `ShareLinks::revokeForUser` | Propriété, idempotence, première date conservée (RG6, RG7) | idem |
| UC-APP-05-U05 | `CartographyRepository::ownedBy`, compteur `shares` | Garde de propriété ; ni révoqués ni expirés comptés, dans la liste comme dans le détail (RG5) | idem |
| UC-APP-05-U06 | `Audit::record` | Stocke les détails fournis tels quels (JSON), anonymisation à la purge (RG8) — la garantie « identifiants seulement » est portée par UC-APP-05-F01 | idem |
| UC-APP-05-U07 | `SHARE_PASSWORD_MIN_LENGTH`, `SHARE_DEFAULT_EXPIRES_DAYS` | 8 et 90, alignés sur l'API | `web/test/usecases/unit/uc-app-05-partager-avec-employeur.test.jsx` |
| UC-APP-05-U08 | `absoluteShareUrl` | Origine + chemin de déploiement + `#/partage/`, repli relatif | idem |
| UC-APP-05-U09 | `parseHash` | Le fragment produit ouvre la route `share` au même jeton | idem |
| UC-APP-05-U10 | `ShareDialog` (isolé) — `handleCreate` | Expiration vide / 0 / 366 / négative refusée sans requête | idem |
| UC-APP-05-U11 | `ShareDialog` (isolé) — `handleCreate` | Mot de passe contrôlé d'abord, puis envoi d'un entier | idem |
| UC-APP-05-U12 | `ShareDialog` (isolé) — liste | Dates françaises, « Révoquer » ou « révoqué le » ; un jeton ou une URL parasites dans la réponse ne sont jamais rendus | idem |
| UC-APP-05-U13 | `ShareDialog` (isolé) — `handleCreate` | Anomalie 2 : « 1e2 » (valide pour la validation native) part comme `expiresInDays: 1`, « 3.65e2 » comme 3 — comportement actuel figé | idem |
| UC-APP-05-U14 | `ShareDialog` (isolé) — `handleRevoke` | `DELETE shares/{id}` puis rechargement ; échec (`401` compris) → message brut, lien toujours révocable | idem |
| UC-APP-05-U15 | `ShareDialog` (isolé) — `handleCopy` | Refus du presse-papiers → libellé inchangé ; succès → « Lien copié » avec l'URL affichée | idem |
| UC-APP-05-U16 | `ShareDialog` (isolé) — `handleCreate` | `401` → « Session expirée… » ; `422` → « Validation échouée » seul, mot de passe conservé | idem |
| UC-APP-05-U17 | `apiFetch` | Jeton CSRF sur `POST …/share` et `DELETE shares/{id}`, jamais sur `GET …/shares` | idem |
| UC-APP-05-U18 | `CartographiesPanel` (isolé) | « Partager » seulement si `serverId` ; le bouton ouvre puis referme le dialogue | idem |

`RequireRole` et `CsrfMiddleware` : logique unitaire couverte par
UC-ADM-01-U10 et UC-CPT-02-U07.

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-05-F01 | Nominal | API | `201 {shareId, token, url}`, empreintes en base, audit sans secret, liste sans jeton, lien opérant | `api/tests/UseCases/Functional/UcApp05PartagerEmployeurTest.php` |
| UC-APP-05-F02 | A1 | API | Défaut 90 (absent ou `null`), bornes 1 et 365 | idem |
| UC-APP-05-F03 | A2 | API | `204`, `revokedAt`, audit, `404` employeur, idempotence (date d'origine, reculée, conservée) | idem |
| UC-APP-05-F04 | A3 | API | Deux liens indépendants | idem |
| UC-APP-05-F05 | A4 | API | Lien expiré listé, non compté, `404` employeur | idem |
| UC-APP-05-F06 | E1 | API | Mot de passe absent / non chaîne / < 8 points de code (y compris astraux) / > 1024 octets → `422` ; 1024 octets → `201` | idem |
| UC-APP-05-F07 | E2 | API | Expiration 0, 366, négative, chaîne, décimale, booléen → `422` | idem |
| UC-APP-05-F08 | E4 | API | Cartographie ou lien d'autrui / inconnu → `404`, rien ne change | idem |
| UC-APP-05-F09 | E3 | API | `401` sans session, `403` sans CSRF, `403 "Rôle insuffisant"` sans rôle sur POST, GET et DELETE ; sans rôle ni jeton → `403` CSRF (ordre des gardes) | idem |
| UC-APP-05-F10 | Anomalie 1 | API | Cartographie `privee` partagée (`201`) et consultable — comportement actuel figé | idem |
| UC-APP-05-F11 | Nominal | IHM | Dialogue, 90 j par défaut, POST avec CSRF, URL absolue unique, liste, copie | `web/test/usecases/functional/uc-app-05-partager-avec-employeur.test.jsx` |
| UC-APP-05-F12 | A1 | IHM | 30 jours transmis et affichés | idem |
| UC-APP-05-F13 | A2, A3 | IHM | DELETE avec CSRF, « révoqué le », l'autre lien reste révocable | idem |
| UC-APP-05-F14 | A5 (+ anomalie 1) | IHM | Pas de « Partager » sans copie serveur ; offert pour une copie privée | idem |
| UC-APP-05-F15 | A6 | IHM | Réouverture : plus d'URL, dates seules | idem |
| UC-APP-05-F16 | E1 | IHM | Refus local, aucune requête | idem |
| UC-APP-05-F17 | E2 | IHM | 0 / 400 jours bloqués par la validation native (pas d'alerte du garde JavaScript), aucune requête | idem |
| UC-APP-05-F18 | E3 | IHM | 401 : création → « Session expirée : reconnectez-vous puis réessayez. » ; liste → « Authentification requise » brut | idem |
| UC-APP-05-F19 | E4 | IHM | Copie retirée ailleurs → « Cartographie introuvable » | idem |
| UC-APP-05-F20 | E5 | IHM | Révocation en échec : message, lien toujours actif | idem |
| UC-APP-05-F21 | E6 | IHM | Presse-papiers refusé : bouton inchangé, URL visible | idem |
| UC-APP-05-F22 | A4 (limite) | IHM | Lien expiré listé avec « Révoquer », sans mention « expiré » | idem |
| UC-APP-05-F23 | E1 | IHM | Mot de passe admis localement mais refusé par l'API (caractères astraux, > 1024 octets) → requête partie, « Validation échouée » seul, aucun lien | idem |

### Tests existants liés (non-régression)

- `api/tests/ShareTest.php` — hachage, validation, liste, révocation, consultation publique.
- `api/tests/CartographiesCsrfTest.php` — CSRF sur `POST …/share` et `DELETE /api/shares/{id}`.
- `api/tests/CartographiesPurgeTest.php` — la purge du compte tue les liens (et anonymise `share_created`).
- `api/tests/MaintenanceTest.php` et UC-SYS-03-U01 — purge des liens expirés ou révoqués après 30 jours.
- `web/src/views/espace/CartographiesPanel.test.jsx` — bloc « partage par lien + mot de passe ».
- `web/e2e/parcours-apprenant.e2e.js` — étape « Partage : lien + mot de passe, expiration par défaut (90 jours) ».
- Consultation par l'employeur : voir [UC-EMP-01](../employeur/UC-EMP-01-consulter-cartographie-partagee.md).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcApp05 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-APP-05
```

## Anomalies constatées

1. **La visibilité « publique » n'est pas une condition du partage.** Le
   chapitre 6 de la formation apprenant (« Confidentialité et partage »)
   présente « Publique (partageable) » comme « l'état requis pour créer un
   lien de partage employeur », et le menu la libelle « (partageable) ». Or ni
   l'API (`POST /api/cartographies/{id}/share` ne lit pas `visibility`) ni
   l'IHM (« Partager » offert dès qu'il y a une copie serveur) ne l'exigent :
   une cartographie **privée** se partage et s'ouvre chez l'employeur (le
   parcours e2e partage d'ailleurs une cartographie restée privée). Soit la
   règle est à implémenter, soit la documentation est à corriger. Figé par
   UC-APP-05-F10 et UC-APP-05-F14.
2. **Expiration en notation scientifique tronquée sans avertissement.** Le
   champ « Expiration (jours) » est un `input type=number` : la validation
   native accepte « 1e2 » (100) ou « 3.65e2 » (365), mais `handleCreate`
   convertit par `Number.parseInt(days, 10)`, qui s'arrête au « e » : le lien
   part avec `expiresInDays: 1` (ou 3) et expire bien plus tôt que la durée
   saisie, sans aucun message. Figé par UC-APP-05-U13.

## Limites

- L'IHM ne distingue pas un lien **expiré** d'un lien actif : il reste listé
  sous « Liens actifs » avec « Révoquer » (le serveur, lui, le traite comme
  mort). Figé par UC-APP-05-F22.
- Une re-révocation (idempotente) journalise un second `share_revoked`.
- Un refus `422` du serveur (mot de passe trop long, caractères astraux) n'est
  affiché que « Validation échouée » : le détail `fields` n'est pas montré.
- Seule la création traduit le `401` ; la liste et la révocation affichent
  « Authentification requise » tel quel.
- Le mot de passe d'un lien ne peut pas être changé ni l'expiration prolongée :
  il faut révoquer et recréer.
- Le cahier (§3.2) parle de partager une cartographie **validée** : aucune
  garantie cartographe n'est exigée pour créer un lien ; si elle existe, elle
  est montrée à l'employeur (UC-EMP-01 A1).
