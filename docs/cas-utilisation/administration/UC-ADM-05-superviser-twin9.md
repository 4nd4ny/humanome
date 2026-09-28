# UC-ADM-05 — Superviser Twin9

| Champ | Valeur |
|---|---|
| **Acteur principal** | Administrateur (rôle `admin`) |
| **Acteurs secondaires** | Apprenants et établissements (offre, prix et promotion appliqués à leurs analyses, UC-APP-09/10/11) ; PayPal (montants des packs) |
| **Portée** | humanome.xyz — vue `#/admin/twin9` (section « Supervision Twin9 » de l'administration), routes `GET/PUT /api/twin9/admin/config`, `GET /api/twin9/admin/comptes` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.8 et §4.10 (administration), §7 (modèle économique : coût API + marge) ; ADR-010 §3 et §6 ; décision AD-D2 (`docs/autorisations.md`) |
| **Statut** | Implémenté (supervision commerciale séparée de l'atelier des gabarits, AD-D2) |

## Objectif

Permettre à l'administrateur de piloter l'offre commerciale de Twin9 et de la
cartographie ouverte Twin6 — contributions (marges), promotion « Twin9 gratuit
avec sa propre clé », packs de recharge, offre de modèles par étage — et de
suivre les soldes et cumuls de tous les comptes qui utilisent le crédit
prépayé, **sans jamais voir le contenu des gabarits** (réservé à l'atelier,
UC-PRO-08).

## Déclencheur

L'administrateur ouvre « Administrer » → « Supervision Twin9 » (`#/admin/twin9`).

## Préconditions

- Le compte porte le rôle `admin` (UC-ADM-01).

## Garanties en cas de succès

- La configuration enregistrée est complète et valide ; elle s'applique
  immédiatement à l'offre publique (`/api/twin9/meta`), à la facturation des
  appels et aux ordres PayPal.
- L'administrateur voit, pour chaque compte ayant une activité, le solde, les
  cumuls et la date de dernière activité.

## Garanties minimales (en cas d'échec)

- Une mise à jour refusée ne modifie rien.
- Les apprenants ne voient jamais les prix catalogue ni les marges.

## Scénario nominal

1. L'administrateur ouvre `#/admin/twin9` ; la vue d'administration vérifie la
   session et le rôle `admin`.
2. La section charge `GET /api/twin9/admin/config` (forme administrateur :
   contributions `marge` et `marge_twin6`, promotion, packs, modèles avec prix
   **catalogue** et étages, interrupteur, rythme, réglages du pipeline) et
   `GET /api/twin9/admin/comptes`.
3. Elle affiche le formulaire des réglages, la table des comptes et un renvoi
   vers l'atelier (`#/twin9-atelier`) pour les gabarits.
4. L'administrateur modifie la contribution Twin9 (par exemple 1,20 → 1,35) et
   clique « Enregistrer les réglages ». La vue calcule le **diff** (seules les
   clés de premier niveau modifiées), le vérifie sommairement et envoie
   `PUT /api/twin9/admin/config {marge: 1.35}` avec le jeton CSRF.
5. Le serveur refuse toute clé inconnue, fusionne le diff avec la configuration
   effective, **revalide l'ensemble**, l'enregistre (réglage `twin9_config`) et
   renvoie la nouvelle configuration ; la vue affiche « Réglages Twin9
   enregistrés. » et se resynchronise.
6. L'effet est immédiat : `/api/twin9/meta` publie les nouveaux prix margés ; les
   appels Twin9 (et Twin6 pour `marge_twin6`) sont facturés au nouveau taux.
7. La table des comptes liste les comptes ayant au moins un mouvement au
   grand-livre, du plus récemment actif au moins récent, avec solde, recharges
   cumulées, consommé cumulé et dernière activité.

## Scénarios alternatifs

- **A1 — Promotion « Twin9 gratuit avec sa propre clé »** (étape 4) : la case
  ouvre ou ferme la fenêtre promotionnelle ; ouverte, un apprenant ayant
  enregistré sa clé peut lancer Twin9 sans débit (UC-APP-10 A2) ; fermée, la voie
  clé privée est refusée (403). La voie plateforme reste facturée dans les deux
  cas.
- **A2 — Grille de packs** (étape 4) : ajout, modification ou suppression de
  packs (montant + libellé) ; l'offre publique et le montant des ordres PayPal
  suivent (UC-APP-11).
- **A3 — Offre de modèles** (étape 4) : ajout, suppression, prix catalogue
  [entrée, sortie] et étages couverts (taggers, rapide, tribunal) ; un modèle
  hors offre, ou proposé pour un autre étage, est refusé par `/api/twin9/appel`.
- **A4 — Réglages hors formulaire** (API seulement) : l'interrupteur `enabled`
  (Twin9 indisponible → `503` côté apprenant), le rythme `appels_par_minute` et
  les réglages du `pipeline` se modifient par le même `PUT` partiel.

## Scénarios d'erreur

- **E1 — Compte non administrateur** (étape 1) : la vue affiche « Cet espace est
  réservé à l'administration de la plateforme » sans rien charger ; l'API
  répond `401` sans session et `403` à tout autre rôle (apprenant, promptologue,
  établissement) ; un refus n'ouvre évidemment pas la promotion.
- **E2 — Mise à jour refusée par le serveur** (étape 5) : corps JSON non-objet →
  `400` ; clé inconnue ou valeur hors bornes → `422` avec un message précis
  (« Marge hors bornes (entre 1 et 5) », « Étages invalides … », « Rythme
  d'appels hors bornes … ») ; rien n'est modifié ; la vue affiche le message et
  garde la saisie.
- **E3 — Saisie invalide détectée dans le navigateur** (étape 4) : contribution
  non numérique, identifiant de modèle vide, prix ou montant non numérique →
  message, aucun envoi.
- **E4 — Chargement impossible** (étape 2) : erreur serveur → « Chargement
  impossible. » ; copie statique → message d'indisponibilité.

## Règles de gestion

- **RG1** — Supervision = `admin` seul (`RequireRole::any('admin')`) ; le contenu
  des gabarits exige `admin` ∧ `promptologue` et vit dans l'atelier (AD-D2).
- **RG2** — Contributions : `marge` (Twin9, 1,20 par défaut) et `marge_twin6`
  (1,10 par défaut), nombres entre 1 et 5. Les apprenants ne voient que les prix
  margés (arrondis à 4 décimales), jamais la marge ni le prix catalogue.
- **RG3** — Packs : liste non vide ; montant entre 1 et 500 USD ; libellé non
  vide ; par défaut 10, 20, 50, 100, 200 et 500 USD.
- **RG4** — Modèles : au moins un ; prix `[entrée, sortie]` strictement positifs
  (USD par million de tokens) ; étages ⊂ {taggers, rapide, tribunal}, non vide.
- **RG5** — Promotion : booléen, fermée par défaut ; elle n'ouvre que la voie
  clé privée.
- **RG6** — `enabled` booléen (faux tant que les gabarits ne sont pas importés) ;
  `appels_par_minute` entier de 1 à 600 (30 par défaut) ; `pipeline` objet.
- **RG7** — Mise à jour partielle : clés inconnues refusées, configuration
  complète revalidée avant écriture ; à la lecture, les défauts complètent et
  les clés stockées inconnues sont ignorées.
- **RG8** — Comptes : uniquement ceux qui ont au moins un événement au
  grand-livre ; compteurs et montants seulement.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Configuration Twin9 | Réglage `twin9_config` (table `settings`) ; aucune donnée personnelle |
| Table des comptes | Nom affiché et email des comptes actifs, solde, cumuls, dernière activité — visibles de l'administrateur seul, jamais de contenu |
| Prix catalogue et marges | Vue administrateur seulement |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` ; `web/src/nav.js` — `navGroups` | Route `#/admin/twin9`, entrée réservée à l'admin |
| Front | `web/src/views/AdminView.jsx` | Garde de session et de rôle, dépêche de la section |
| Front | `web/src/views/admin/Twin9Section.jsx` | Réglages (diff, validation cliente), table des comptes |
| Front | `web/src/api/twin9.js` — `fetchTwin9Config`, `saveTwin9Config`, `fetchComptes`, `formatUsd` | Client de supervision |
| API | `GET/PUT /api/twin9/admin/config`, `GET /api/twin9/admin/comptes` — `api/src/routes/twin9.php` | Routes de supervision (admin) |
| Domaine | `api/src/Twin9/Twin9Config.php` — `read`, `update`, `defaults`, `publicView` | Configuration effective, validation, vue publique |
| Domaine | `api/src/Twin9/FactureService.php` — `comptes` | Table de supervision |
| Domaine | `api/src/Packages/SettingsRepository.php` | Persistance |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ADM-05-U01 | `parseHash`, `navGroups` | `#/admin/twin9`, entrée réservée à l'admin (RG1) | `web/test/usecases/unit/uc-adm-05-superviser-twin9.test.jsx` |
| UC-ADM-05-U02 | client de supervision | GET config/comptes, PUT partiel avec CSRF | idem |
| UC-ADM-05-U03 | `Twin9Section` (diff) | Rien modifié → aucun PUT ; contribution seule | idem |
| UC-ADM-05-U04 | `Twin9Section` (diff) | Pack supprimé, étage ajouté en ordre canonique | idem |
| UC-ADM-05-U05 | `Twin9Section` (validation) | Contribution, identifiant, prix invalides → aucun PUT (E3) | idem |
| UC-ADM-05-U06 | `Twin9Section` (diff) | **Anomalie 1 figée** : config relue de MySQL → packs et modèles renvoyés | idem |
| UC-ADM-05-U07 | `Twin9Section` (comptes) | Montants en USD ; aucun compte → message | idem |
| UC-ADM-05-U08 | `Twin9Config::update` | Fusion partielle, persistance, clé inconnue refusée sans écriture (RG7) | `api/tests/UseCases/Unit/UcAdm05SuperviserTwin9Test.php` |
| UC-ADM-05-U09 | `Twin9Config::update` | Bornes de chaque réglage (RG2-RG6) | idem |
| UC-ADM-05-U10 | `Twin9Config::update` | **Anomalie 2 figée** : message « 1 et 100 USD » pour une borne à 500 | idem |
| UC-ADM-05-U11 | `Twin9Config::read`, `publicView` | Défauts, clés obsolètes ignorées, vue publique sans marge | idem |
| UC-ADM-05-U12 | `FactureService::comptes` | Comptes actifs, cumuls, ordre ; **anomalie 3 figée** | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ADM-05-F01 | Nominal | IHM | `<App/>` : réglages et comptes, contribution modifiée → PUT partiel avec CSRF, confirmation | `web/test/usecases/functional/uc-adm-05-superviser-twin9.test.jsx` |
| UC-ADM-05-F02 | A1 | IHM | Promotion ouverte → `{twin9_cle_perso_ouverte: true}` | idem |
| UC-ADM-05-F03 | A2 | IHM | Pack ajouté → liste complète envoyée ; **anomalie 2 figée** (borne affichée) | idem |
| UC-ADM-05-F04 | A3 | IHM | Étage retiré, prix modifié → `modeles` envoyé | idem |
| UC-ADM-05-F05 | E1 | IHM | Promptologue : espace réservé, rien chargé | idem |
| UC-ADM-05-F06 | E2 | IHM | 422 serveur : message affiché, saisie gardée | idem |
| UC-ADM-05-F07 | E3 | IHM | Identifiant vide : message, aucun PUT | idem |
| UC-ADM-05-F08 | E4 | IHM | Erreur de chargement : message, pas de formulaire | idem |
| UC-ADM-05-F09 | Nominal | API | Contribution changée → prix `/meta` et coût réel de `/appel` suivent | `api/tests/UseCases/Functional/UcAdm05SuperviserTwin9Test.php` |
| UC-ADM-05-F10 | A1 | API | Promotion ouverte puis fermée : voie clé privée 200 puis 403 | idem |
| UC-ADM-05-F11 | A2 | API | Packs → `/meta` et montant de l'ordre PayPal ; index hors grille 422 | idem |
| UC-ADM-05-F12 | A3, A4 | API | Offre par étage (422), interrupteur (503), rythme (429) | idem |
| UC-ADM-05-F13 | Nominal (étape 7) | API | Table des comptes : actifs seulement, ordre, montants | idem |
| UC-ADM-05-F14 | E1 | API | 401 visiteur ; 403 apprenant, promptologue, établissement | idem |
| UC-ADM-05-F15 | E2 | API | 400 corps non-objet ; 422 par cas, rien modifié | idem |
| UC-ADM-05-F16 | Anomalie 1 | API | Config relue : clés réordonnées par MySQL (cause) | idem |

### Tests existants liés (non-régression)

- `api/tests/Twin9ProtocoleTest.php` — défauts et bornes de la config, vue publique, garde admin de la supervision.
- `api/tests/Twin9FactureTest.php` — `testAdminComptesIsAdminOnlyAndAggregates`.
- `api/tests/Twin9PayPalTest.php` — packs 200 et 500 configurables.
- `web/src/views/admin/Twin9Section.test.jsx` — supervision sans contenu, diff, promotion, pack, comptes, garde d'`AdminView`.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcAdm05 --testdox
cd web && npx vitest run test/usecases/unit/uc-adm-05 test/usecases/functional/uc-adm-05
```

## Anomalies constatées

1. **Diff non minimal après le premier enregistrement.** La configuration est
   stockée dans une colonne JSON MySQL, qui réordonne les clés des objets
   (`{libelle, montant_usd}`, `{etages, prix_usd_mtok}`). `Twin9Section` compare
   ses packs et modèles au format `JSON.stringify` : dès que la configuration a
   été enregistrée une fois, **packs et modèles repartent à chaque
   enregistrement** même inchangés, « Aucune modification à enregistrer » ne
   s'affiche plus, et un enregistrement peut écraser la modification
   concurrente d'un autre administrateur sur ces clés. Figé par UC-ADM-05-U06
   (cause : UC-ADM-05-F16).
2. **Borne des packs annoncée à 100 USD.** Le serveur accepte jusqu'à 500 USD
   (et propose 200 et 500 par défaut), mais son message de refus dit « montant
   entre 1 et 100 USD » et le champ du formulaire affiche « 1 – 100 »
   (`max="100"`). Figé par UC-ADM-05-U10 et UC-ADM-05-F03.
3. **Consommé cumulé gonflé par les remboursements.** `FactureService::comptes`
   compte comme consommé tout ce qui n'est pas une recharge : un remboursement
   PayPal (UC-APP-11 A3) y apparaît comme une dépense. Figé par UC-ADM-05-U12
   (même cause que l'anomalie 1 de UC-APP-11).
