# UC-APP-11 — Gérer son crédit Twin9 (achat, factures, remboursement)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (tout compte connecté — un compte établissement suit le même parcours) |
| **Acteurs secondaires** | PayPal (paiement en redirection, capture, remboursement) ; administrateur (packs et supervision, UC-ADM-05) |
| **Portée** | humanome.xyz — vue `#/compte/credit`, routes `/api/twin9/credit*`, `/api/twin9/facture`, `/api/twin9/depenses`, offre `/api/twin9/meta` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §6.5 (journalisation minimale), §7 (modèle économique : usage payant, coût API + marge) ; ADR-010 §3 |
| **Statut** | Implémenté (recharges PayPal, factures récapitulatives, remboursement à la demande) |

## Objectif

Permettre à l'apprenant de **prépayer** l'usage des modèles de la plateforme
(Twin9, cartographie ouverte Twin6 sur crédits), de suivre son solde et ses
dépenses, d'éditer une **facture récapitulative mensuelle** imprimable et, s'il
le souhaite, de se faire **rembourser** le solde inutilisé — sans que la
plateforme ne voie ni ne stocke aucune donnée bancaire.

## Déclencheur

L'apprenant ouvre `#/compte/credit` (lien « Recharger mon crédit » du devis
Twin9, menu du compte) ou y revient depuis PayPal.

## Préconditions

- Compte actif et session (UC-CPT-01, UC-CPT-02).
- Pour recharger ou rembourser : identifiants PayPal REST configurés côté
  serveur (`PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_MODE`).

## Garanties en cas de succès

- Le solde est crédité du montant **capturé par PayPal**, une seule fois par
  ordre, et chaque mouvement laisse un événement au grand-livre.
- La facture d'un mois **clos** est un document **déterministe** (même numéro,
  même contenu à chaque édition), dérivé du grand-livre ; celle du mois en cours
  évolue à chaque mouvement.
- Un remboursement n'est débité qu'après confirmation de PayPal, capture par
  capture.

## Garanties minimales (en cas d'échec)

- Aucun crédit n'est accordé sans capture PayPal aboutie pour un ordre créé par
  le compte lui-même.
- Aucun remboursement ne dépasse le solde ni ce qui a été capturé — sauf en cas
  de dépense concurrente pendant le remboursement (anomalie 3).
- Aucune donnée bancaire n'est vue ni stockée ; le grand-livre ne porte que des
  compteurs et des identifiants PayPal.

## Scénario nominal

1. L'apprenant ouvre `#/compte/credit`. La vue sonde la session
   (`GET /api/auth/me`, qui sème le jeton CSRF), puis charge en parallèle l'offre
   (`GET /api/twin9/meta` : packs, `paypalConfigured`, clé privée), le crédit
   (`GET /api/twin9/credit` : solde et 50 derniers événements) et le suivi
   (`GET /api/twin9/depenses` : les 12 derniers mois **ayant de l'activité** —
   les mois vides sont sautés).
2. La vue affiche le **solde**, les **packs** de recharge, le **suivi des
   dépenses** (barres et tableau recharges / consommé / appels), le
   **grand-livre** (type, montant signé, libellé, modèle, tokens, date — aucun
   contenu) et le sélecteur de **factures** (mois depuis janvier 2026).
3. L'apprenant choisit un pack. La vue envoie `POST
   /api/twin9/credit/paypal/creer {pack_index}` avec le jeton CSRF (E10) ; le
   serveur vérifie la session, le rythme, la configuration PayPal et le pack,
   obtient un jeton OAuth, crée l'ordre (intention CAPTURE, montant à 2
   décimales, retours `https://humanome.xyz/#/compte/credit?paypal=retour` /
   `?paypal=annule` — domaine **codé en dur**, y compris en sandbox), **lie
   l'ordre au compte** (`twin9_paypal_orders`) et renvoie `{order_id,
   approve_url}`. La vue redirige vers PayPal.
4. L'apprenant approuve le paiement chez PayPal, qui le renvoie vers
   `#/compte/credit?paypal=retour&token=<order_id>`.
5. Après la sonde de session, la vue capture **une seule fois** : `POST
   /api/twin9/credit/paypal/capturer {order_id}`. Le serveur vérifie le format,
   la **propriété** de l'ordre, capture chez PayPal, n'accepte qu'un statut
   `COMPLETED` et un montant capturé positif, crédite ce montant (idempotent par
   ordre), mémorise la capture (pour un remboursement futur) et renvoie
   `{solde_microusd}`. La vue affiche « Recharge confirmée. Nouveau solde : … » et
   retire les paramètres du lien (pas de nouvelle capture au rechargement).
6. Le crédit est consommé par les analyses (UC-APP-09, UC-APP-10) : réserve puis
   réconciliation au grand-livre.
7. L'apprenant choisit un mois : `GET /api/twin9/facture?annee=&mois=` rend la
   facture récapitulative (numéro `HUM-TW9-AAAAMM-<compte>`, émetteur, client,
   consommation nette par modèle, recharges avec référence PayPal, ajustements,
   totaux, solde de fin de période, mentions), imprimable ou exportable en PDF.

## Scénarios alternatifs

- **A1 — Paiement abandonné** (étape 4) : retour sur `?paypal=annule` →
  « Recharge annulée. Aucun montant n'a été débité. » ; aucune capture.
- **A2 — Retour rejoué** (étape 5) : double clic ou lien rechargé : PayPal répond
  « déjà capturé », le serveur relit l'ordre et converge ; le solde et le
  grand-livre ne changent pas (une seule recharge).
- **A3 — Remboursement à la demande** (étape 2) : « Se faire rembourser le solde
  restant », puis « Confirmer le remboursement » → `POST
  /api/twin9/credit/rembourser {montant_microusd?}` (sans montant : tout le
  remboursable). Le serveur répartit sur les captures, **les plus récentes
  d'abord** (date de capture), en **centimes entiers** (la fraction de centime
  reste au solde), chaque portion avec une clé d'idempotence PayPal décalée du
  montant déjà remboursé sur la capture ; il ne débite qu'après confirmation
  (`COMPLETED` ou `PENDING`) et renvoie `{rembourse_microusd, solde_microusd}`.
  La vue affiche « Remboursement de X envoyé vers PayPal. » Cas limites : moins
  d'un centime remboursable, ou montant demandé inférieur à un centime, nul ou
  négatif → `200 {rembourse_microusd: 0}` sans appel PayPal, et la vue annonce
  « Remboursement de 0,00 $ envoyé vers PayPal. » ; la confirmation annonce le
  **solde total** (« Rembourser votre solde restant (X) ») même quand une partie
  n'est pas remboursable (crédit offert).
- **A4 — Segment de route autre que « credit »** (étape 1) : `#/compte/<segment>`
  transmet le segment décodé ; seul `credit` **exact** ouvre l'espace crédit
  (`#/compte/%63redit` aussi, une fois décodé). Tout autre segment — section
  inconnue, `CREDIT`, `credit/` (barre finale) — affiche la page **Compte**
  (profil, UC-CPT-03) sans aucune lecture du crédit ni de l'offre, et sans
  message. Un `?` encodé (`credit%3Fpaypal%3Dretour`) reste dans le segment : ce
  n'est plus une query. `#/compte/` (barre finale sans segment) affiche « Page
  introuvable : #/compte/ » ; un pourcentage mal formé (`#/compte/%`) fait lever
  une `URIError` au routeur (anomalie AN1 de UC-VIS-02).

## Scénarios d'erreur

- **E1 — Sans session** (étape 1) : « Connectez-vous » ; copie statique : message
  dédié ; l'API répond `401` sur toutes les routes du crédit.
- **E2 — PayPal non configuré** (étapes 2-3) : « La recharge par carte (PayPal)
  est indisponible pour le moment », clé privée suggérée, pas de remboursement ;
  l'API répond `503` (« Recharge PayPal non configurée » / « Remboursement PayPal
  non configuré »).
- **E3 — Requête invalide** (étapes 3, 5) : pack inconnu → `422 Pack inconnu` ;
  `order_id` absent ou hors `[A-Za-z0-9_-]{1,64}` → `422`.
- **E4 — Ordre d'un autre compte ou jamais créé** (étape 5) : `403` « Cet ordre de
  paiement ne vous appartient pas. » ; rien ne part chez PayPal ; bandeau
  « Recharge non confirmée ».
- **E5 — Paiement non abouti** (étape 5) : non approuvé → `422` (« validez d'abord
  le paiement sur PayPal ») ; statut autre que `COMPLETED` → `422` ; montant
  capturé nul → `502 Montant PayPal invalide`.
- **E6 — PayPal en erreur** (étapes 3, 5) : `502` au message générique
  (injoignable, erreur, identifiants refusés) ; aucun ordre lié, aucun crédit.
- **E7 — Remboursement impossible** (A3) : rien de remboursable (crédit non
  PayPal, déjà remboursé) → `422` ; PayPal refuse la première portion → `502`,
  solde intact. Échec au milieu de plusieurs captures : si PayPal répond `2xx`
  avec un statut non abouti → `502 « Le remboursement PayPal n'a pas abouti… »`
  **avec** `rembourse_microusd` partiel ; si PayPal répond en **erreur HTTP** →
  `502` générique **sans** montant, les portions déjà confirmées restant
  débitées (le client ignore ce qui a été remboursé ; la vue garde l'ancien
  solde affiché). Une nouvelle demande rejoue la portion échouée avec la même
  clé d'idempotence.
- **E8 — Période de facture invalide** (étape 7) : année hors [2026, 2100] ou
  mois hors [1, 12] → `422`. Une période **future** (jusqu'en 2100) n'est pas
  refusée : facture numérotée, vide, dont le solde de fin est le solde courant.
- **E9 — Trop de tentatives** (étapes 3, 5, A3) : plus de 20 appels par minute et
  par compte sur une route PayPal (un seau par route : créer, capturer,
  rembourser) → `429` + `Retry-After: 30`.
- **E10 — Jeton CSRF absent ou invalide** (étapes 3, 5, A3) : avec un cookie de
  session mais sans `X-CSRF-Token` valide → `403 {error: "Jeton CSRF absent ou
  invalide"}` (`CsrfMiddleware`, avant la route) ; rien ne part chez PayPal.

## Règles de gestion

- **RG1** — Tous les montants sont des **micro-USD entiers** (1 $ = 1 000 000) ;
  l'affichage arrondit au centime (4 décimales sous le centime).
- **RG2** — Le crédit accordé est le montant **capturé** renvoyé par PayPal,
  jamais un montant fourni par le client ; une recharge est idempotente par
  identifiant d'ordre (clé unique au grand-livre) et par capture.
- **RG3** — Un ordre est lié au compte qui l'a créé ; seul ce compte peut le
  capturer.
- **RG4** — Packs par défaut : 10, 20, 50, 100, 200, 500 USD (réglables par
  l'administrateur, 1 à 500 USD, UC-ADM-05).
- **RG5** — Le remboursement n'est **jamais automatique** ; remboursable =
  min(solde, reste des captures) ; un crédit offert (ajustement) n'est pas
  remboursable ; les fractions de centime restent au solde ; le débit de chaque
  portion est conditionnel (jamais de solde négatif).
- **RG6** — La facture est **calculée** à la demande depuis le grand-livre (aucun
  stockage) : consommation = débits nets de leurs réconciliations et
  remboursements d'échec, par modèle ; ajustements administratifs listés à part ;
  remboursements PayPal visibles seulement dans le solde de fin.
- **RG7** — Grand-livre, suivi et facture ne portent que sur le compte de la
  session (aucun identifiant de compte accepté en paramètre) ; compteurs
  seulement (§6.5).
- **RG8** — PayPal en **redirection** (Orders v2, pas de SDK navigateur, pas de
  webhook) ; mode `sandbox` ou `live` par l'environnement.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Données bancaires | Jamais vues ni stockées (saisies chez PayPal) |
| Ordre PayPal | Identifiant + compte créateur (`twin9_paypal_orders`) |
| Capture PayPal | Identifiant, ordre, montant, déjà remboursé (`twin9_paypal_captures`) |
| Grand-livre | Type, montant, libellé d'étape, modèle, tokens, identifiant d'ordre — jamais de contenu |
| Facture | Nom affiché et email du compte, compteurs et montants ; recalculée à chaque demande |
| Suppression du compte | Solde, grand-livre, ordres et captures supprimés en cascade (UC-CPT-06) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/compte/credit` (paramètres PayPal dans le fragment) ; tout autre segment `#/compte/<section>` transmis tel quel, décodé (A4) |
| Front | `web/src/App.jsx` — aiguillage de la route `account` | `section === 'credit'` → `CreditView`, sinon `AccountView` (A4) — couvert fonctionnellement seulement (UC-APP-11-F29) : l'aiguillage est interne au composant `App`, non isolable |
| Front | `web/src/views/CreditView.jsx` | Solde, packs, redirection, capture unique au retour, suivi, grand-livre, factures, remboursement |
| Front | `web/src/views/twin9/FactureTwin9.jsx` | Facture imprimable |
| Front | `web/src/api/twin9.js` — `fetchTwin9Meta`, `fetchCredit`, `fetchDepenses`, `fetchFacture`, `creerRecharge`, `capturerRecharge`, `rembourserSolde`, `formatUsd` | Client API du crédit (offre et packs via `fetchTwin9Meta`, unitaire en UC-APP-10-U31) |
| API | `GET /api/twin9/meta`, `GET /api/twin9/credit`, `GET /api/twin9/depenses`, `GET /api/twin9/facture`, `POST /api/twin9/credit/paypal/creer`, `POST /api/twin9/credit/paypal/capturer`, `POST /api/twin9/credit/rembourser` — `api/src/routes/twin9.php` | Offre, orchestration (répartition des remboursements, bornes) |
| API | `api/src/Middleware/CsrfMiddleware.php` | Jeton CSRF des mutations (E10) — logique unitaire couverte par UC-CPT-02-U07 |
| Domaine | `api/src/Twin9/PayPalClient.php` — `fromEnv`, `createOrder`, `captureOrder`, `getOrder`, `refundCapture` | Dialogue serveur-à-serveur avec PayPal |
| Domaine | `api/src/Twin9/CreditService.php` — `balance`, `topup`, `events`, `recordPaypalOrder`, `paypalOrderOwner`, `recordCapture`, `refundableCaptures`, `soldeRemboursable`, `appliquerRemboursement` ; `SoldeInsuffisantException` | Grand-livre, propriété, remboursement |
| Domaine | `api/src/Twin9/FactureService.php` — `facture`, `depensesParMois` | Facture et suivi |
| Domaine | `api/src/Twin9/Twin9Config.php` — `packs`, `publicView` | Offre de packs, disponibilité PayPal |
| Domaine | `api/src/Auth/RateLimiter.php` | 20 appels PayPal par minute et par compte |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-11-U01 | `parseHash` | `#/compte/credit` avec ou sans paramètres PayPal | `web/test/usecases/unit/uc-app-11-gerer-credit-twin9.test.jsx` |
| UC-APP-11-U02 | `fetchCredit` … `rembourserSolde` | Méthodes, URL, corps, jeton CSRF sur les mutations | idem |
| UC-APP-11-U03 | client API | Refus serveur → `ApiError` (statut + message) | idem |
| UC-APP-11-U04 | `FactureTwin9` | Document complet, montants signés, impression hors document | idem |
| UC-APP-11-U05 | `FactureTwin9` | Mois vide, sections absentes, rien sans données | idem |
| UC-APP-11-U16 | `formatUsd` | Virgule, 4 décimales sous le centime, signe (RG1) | idem |
| UC-APP-11-U17 | `parseHash` | A4 : segment décodé transmis tel quel (casse, barre finale, `?` encodé) ; `#/compte/` introuvable ; pourcentage mal formé → `URIError` (AN1 de UC-VIS-02) | idem |
| UC-APP-11-U06 | `PayPalClient::fromEnv` | Identifiant ou secret absent → null ; sandbox / live | `api/tests/UseCases/Unit/UcApp11GererCreditTwin9Test.php` |
| UC-APP-11-U07 | `PayPalClient::createOrder` | OAuth, CAPTURE, 2 décimales, URLs de retour et d'annulation ; lien absent → 502 | idem |
| UC-APP-11-U08 | `PayPalClient::captureOrder` | Capture, relecture « déjà capturé », 422 / 502, ni identifiant client, ni secret, ni en-tête Basic dans le message | idem |
| UC-APP-11-U09 | `PayPalClient::refundCapture` | Capture ciblée, montant, `PayPal-Request-Id` ; refus → 502 | idem |
| UC-APP-11-U10 | `CreditService::topup`, `recordPaypalOrder`, `paypalOrderOwner` | Idempotence, premier propriétaire conservé (RG2-RG3) | idem |
| UC-APP-11-U11 | `CreditService` (captures, remboursement) | Remboursable = min(solde, captures), ordre, débit conditionnel (RG5) | idem |
| UC-APP-11-U12 | `FactureService::facture` | Numéro, consommation nette, ajustements, solde de fin, bornes de décembre (RG6) | idem |
| UC-APP-11-U13 | `FactureService::depensesParMois` | Mois récents d'abord, recharges / consommé / appels ; **anomalie 1 figée** (ajustement administratif en consommation négative) | idem |
| UC-APP-11-U14 | `Twin9Config::packs`, `publicView` | Packs 10 à 500 USD ; disponibilité PayPal annoncée (RG4, E2) | idem |
| UC-APP-11-U15 | `RateLimiter` | Fenêtre fixe d'une minute, un seau par clé, blocage au-delà du plafond, 30 s ensuite (E9) — la limite réelle des routes relève de F22 | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-11-F01 | Nominal (étapes 1-2) | IHM | `<App/>` : solde, suivi mensuel, grand-livre signé, packs | `web/test/usecases/functional/uc-app-11-gerer-credit-twin9.test.jsx` |
| UC-APP-11-F02 | Nominal (étape 3) | IHM | Pack → `creer` avec CSRF → redirection vers PayPal | idem |
| UC-APP-11-F03 | Nominal (étape 5) | IHM | Retour : capture unique après la session, sous `StrictMode` (effets doublés) et après un rendu supplémentaire, nouveau solde, lien nettoyé | idem |
| UC-APP-11-F04 | Nominal (étape 7) | IHM | Choix du mois → facture rendue, impression | idem |
| UC-APP-11-F05 | A1 | IHM | `?paypal=annule` : message neutre, aucune capture | idem |
| UC-APP-11-F06 | A3 | IHM | Remboursement en deux temps, nouveau solde | idem |
| UC-APP-11-F07 | E4 | IHM | Capture refusée 403 : bandeau, aucun crédit affiché | idem |
| UC-APP-11-F08 | E2 | IHM | PayPal non configuré : indisponible, clé privée suggérée | idem |
| UC-APP-11-F09 | E1 | IHM | Anonyme : invitation ; copie statique : message | idem |
| UC-APP-11-F10 | E6, E7 | IHM | Création d'ordre en `502` (PayPal en erreur), remboursement refusé : messages serveur | idem |
| UC-APP-11-F29 | A4 | IHM | `<App/>` : section inconnue, `CREDIT`, `credit/`, retour PayPal à barre finale (`credit/?paypal=retour&token=…`) → page Compte (« Profil »), aucun appel `twin9/…` (ni lecture du crédit, ni capture) ; `%63redit` → espace crédit ; `#/compte/` → page introuvable | idem |
| UC-APP-11-F11 | Nominal | API | Crédit vide → ordre 20 $ (URLs de retour envoyées par la route) → capture → dépense réelle → grand-livre → suivi → facture | `api/tests/UseCases/Functional/UcApp11GererCreditTwin9Test.php` |
| UC-APP-11-F12 | A2, RG2 | API | Capture rejouée : même solde, une seule recharge ; pack de 20 $ mais capture de 12,34 $ → 12,34 $ crédités | idem |
| UC-APP-11-F13 | A3 | API | Remboursement partiel puis total, deux clés d'idempotence (décalage), facture ; **anomalie 1 figée** | idem |
| UC-APP-11-F14 | E1 | API | 401 sur les six routes | idem |
| UC-APP-11-F15 | E2 | API | 503 (statut et message) ; **anomalie 2 figée** (identifiant sans secret) | idem |
| UC-APP-11-F16 | E3 | API | 422 (statut et message) pack / `order_id`, rien chez PayPal | idem |
| UC-APP-11-F17 | E4 | API | 403 ordre d'autrui ou inconnu | idem |
| UC-APP-11-F18 | E5 | API | 422 non approuvé / non finalisé, 502 montant nul | idem |
| UC-APP-11-F19 | E6 | API | 502 générique à la création (aucun ordre lié) et à la capture (aucun crédit) | idem |
| UC-APP-11-F20 | E7 | API | 422 rien de remboursable, 502 refus PayPal, solde intact | idem |
| UC-APP-11-F21 | E8 | API | 422 période invalide ; période future acceptée (comportement figé) | idem |
| UC-APP-11-F22 | E9 | API | 429 + `Retry-After: 30` sur créer, capturer et rembourser ; la 20e tentative passe | idem |
| UC-APP-11-F23 | RGPD, RG7 | API | Réponse de capture PayPal portant des données d'acheteur : rien de celles-ci n'est stocké ; données de la session seulement | idem |
| UC-APP-11-F24 | A3 | API | Plusieurs captures : la plus récente d'abord (par date), centimes entiers, fraction de centime au solde, clés d'idempotence par portion | idem |
| UC-APP-11-F25 | E7 | API | Échec en cours de boucle : 2xx non abouti → 502 avec montant partiel ; erreur HTTP → 502 sans montant, portion confirmée débitée ; rejeu de la même clé ; tout remboursé → 422 | idem |
| UC-APP-11-F26 | E10 | API | Sans jeton CSRF ou jeton faux → 403 sur les trois routes d'argent, rien chez PayPal | idem |
| UC-APP-11-F27 | Anomalie 3 | API | Dépense concurrente pendant le remboursement : PayPal rembourse, la route répond 402, grand-livre et capture intacts | idem |
| UC-APP-11-F28 | A3 (limite) | API | Moins d'un centime remboursable ou demandé (nul, négatif) → 200 avec 0, aucun appel PayPal | idem |

### Tests existants liés (non-régression)

- `api/tests/Twin9CreditTest.php` — grand-livre (débit atomique, idempotence, ajustements, captures).
- `api/tests/Twin9PayPalTest.php` — création, capture, propriété, remboursements (partiels, multi-captures, poussière, échec en boucle), rythme, packs.
- `api/tests/Twin9FactureTest.php` — agrégation, période, établissement, remboursement, comptes admin.
- `api/tests/Twin9SecurityAuditTest.php` — crédit = montant capturé, pas de découvert, pas d'IDOR.
- `web/src/views/CreditView.test.jsx` — vue isolée (solde, remboursement, recharge, retour PayPal, factures, sessions).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcApp11 --testdox
cd web && npx vitest run test/usecases/unit/uc-app-11 test/usecases/functional/uc-app-11
```

## Anomalies constatées

1. **Les remboursements comptent comme consommation dans le suivi.**
   `FactureService::depensesParMois` (et `comptes()` côté administration)
   calcule le consommé comme « tout ce qui n'est pas une recharge » : un
   remboursement PayPal y apparaît comme une dépense (10 $ remboursés = 10 $
   « consommés », 0 appel), alors que la facture du même mois l'exclut
   correctement de la consommation. Il en va de même des **ajustements
   administratifs** (crédit offert, correction) : un « Geste commercial » de
   +4 $ y apparaît comme une consommation **négative** de −4 $, alors que la
   facture le range à part (« Ajustements »). Figé par UC-APP-11-F13 et
   UC-APP-11-U13.
2. **Disponibilité PayPal annoncée à tort.** `Twin9Config::publicView` déclare
   `paypalConfigured` dès que `PAYPAL_CLIENT_ID` est défini, sans vérifier
   `PAYPAL_SECRET` ; avec un secret manquant, la vue propose les packs mais
   chaque recharge échoue en `503`. Figé par UC-APP-11-F15.
3. **Remboursement confirmé par PayPal mais non débité en cas de dépense
   concurrente.** La route calcule le solde remboursable une fois, fait
   **réellement** rembourser la portion par PayPal, puis débite le solde de façon
   conditionnelle (`appliquerRemboursement`). Si une réserve concurrente
   (`/api/twin9/appel` ou `/api/twin6/appel`, analyse dans un autre onglet) a
   fait baisser le solde entre-temps, le débit lève `SoldeInsuffisantException`
   et la route répond `402 Solde insuffisant` alors que l'argent est déjà parti :
   le grand-livre n'est pas débité et la capture garde toute sa marge.
   L'apprenant conserve un solde dépensable **et** le remboursement (perte pour
   la plateforme, contraire à la garantie « aucun remboursement ne dépasse le
   solde »). Figé par UC-APP-11-F27.

## Limites

- Pas de webhook PayPal : la capture n'est déclenchée que par le retour du
  navigateur sur le lien PayPal ; un paiement approuvé sans retour n'est pas
  crédité automatiquement. Un ordre non capturé expire chez PayPal ; seule la
  liaison identifiant d'ordre → compte (`twin9_paypal_orders`, écrite dès
  `/creer`) est conservée, sans purge des ordres abandonnés (supprimée avec le
  compte). Le commentaire de la route (« NO intermediate state stored ») est
  antérieur à cette liaison.
- Après un `502` partiel (E7), la vue garde le solde affiché avant la demande,
  alors que des portions ont pu être débitées ; la confirmation annonce le solde
  total, remboursable ou non ; un remboursement de moins d'un centime est
  annoncé « 0,00 $ envoyé vers PayPal » (UC-APP-11-F28).
- Les petites fonctions de la vue (`moisFacturables`, `libelleKind`) ne sont
  pas exportées : elles ne sont couvertes que fonctionnellement (F01, F04).
  De même, l'aiguillage de la route `account` (`web/src/App.jsx` :
  `section === 'credit'` → `CreditView`) est interne au composant `App`, non
  isolable : il n'est couvert que fonctionnellement (UC-APP-11-F29) ;
  UC-APP-11-U01 et U17 ne vérifient que la section produite par `parseHash`.
- La liste des factures proposées commence en janvier 2026 (lancement) ; le
  serveur refuse toute période antérieure.
- Un lien vers l'espace crédit légèrement altéré (`#/compte/credit/`,
  `#/compte/CREDIT`) ouvre la page Compte sans signaler l'erreur ; un retour
  PayPal ainsi altéré ne capture rien (UC-APP-11-F29).
