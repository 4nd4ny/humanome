# UC-ADM-06 — Consulter le monitoring

| Champ | Valeur |
|---|---|
| **Acteur principal** | Administrateur (rôle `admin`, session ouverte) |
| **Acteurs secondaires** | Comptes dont l'activité est agrégée (connexions, cartographies, partages, crédits, votes) ; épistémiarques retardataires (destinataires d'une relance par e-mail) |
| **Portée** | humanome.xyz — section `#/admin/monitoring` ; API de session `GET /api/admin/monitoring`, `GET /api/admin/users?role=` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.8 et §4.10 (administration), §3.5 (gouvernance à la majorité), §6.5 (journalisation minimale : compteurs, jamais de contenu) ; `docs/administration.md`, `docs/rgpd-verification.md` |
| **Statut** | Implémenté (tableau de bord de monitoring, après P12) |

## Objectif

Donner à l'administrateur, en **lecture seule**, une vue d'ensemble chiffrée
de la plateforme sur une période choisie (7, 30, 90 ou 365 jours) :
utilisateurs, cartographies et partages, finances des crédits Twin9, tokens et
coûts LLM (détecteur d'anomalies : un pic signale une clé compromise ou un
abus), connexions (pays et réseau tronqué, jamais l'IP), votes de gouvernance
en attente avec les retardataires à relancer, et comptes par rôle.

## Déclencheur

L'administrateur ouvre `#/admin/monitoring` (première carte « Monitoring » de
l'accueil `#/admin`, ou onglet « Monitoring »).

## Préconditions

- Compte `admin` connecté ; API et base joignables.
- Les journaux alimentés au fil de l'eau par les autres cas : `audit_events`
  (`login`, `login_failed` via `LoginJournal`, `share_created`,
  `share_consulted`), `sessions`, `llm_usage_daily`, `tuteur_usage_daily`,
  `twin9_credit_events`, `twin9_credits`, `twin9_paypal_captures`,
  `competence_versions`/`referentiel_versions` et leurs votes.
- Facultatif : une base GeoIP MMDB désignée par `GEOIP_DB` ; absente, le pays
  vaut `null` (« Inconnu » / « — »).

## Garanties en cas de succès

- L'administrateur voit des **agrégats** calculés à la demande : aucune écriture,
  aucune donnée de contenu (portfolio, document de cartographie, prompt) n'est
  lue ni renvoyée.
- Les connexions ne révèlent que le **pays** (résolu localement) et le **réseau
  tronqué** (`/24` en IPv4, `/48` en IPv6), jamais l'adresse complète.

## Garanties minimales (en cas d'échec)

- Rien n'est modifié ; l'IHM affiche un message d'erreur.
- Un visiteur ou un compte non administrateur n'obtient aucun agrégat.

## Scénario nominal

1. L'administrateur ouvre `#/admin` puis la carte « Monitoring » (`#/admin/monitoring`).
   `AdminView` vérifie la session et le rôle `admin`, puis rend
   `MonitoringSection` avec la période par défaut « 30 j ».
2. L'IHM appelle `GET /api/admin/monitoring?days=30`. Le garde
   `RequireRole::any('admin')` laisse passer ; `Monitoring::overview(days)`
   borne la fenêtre à 1..365 et renvoie `200 {periode, utilisateurs,
   cartographies, finances, tokens, connexions, votes}`. La fenêtre de N jours
   part de minuit il y a N-1 jours (aujourd'hui inclus).
3. En parallèle, le bloc « Comptes par rôle » appelle
   `GET /api/admin/users?role=admin` (UC-ADM-01, A2).
4. L'IHM affiche sept tuiles : connectés maintenant (comptes distincts actifs
   depuis moins de 15 minutes, plus les sessions anonymes), comptes (+ nouveaux
   sur la période, non activés), cartographies (journée / merge), partages
   actifs (+ consultations), crédits en circulation, dépense LLM de la période
   (démo + tuteur + Twin9), connexions (+ échecs).
5. Elle affiche les blocs détaillés, chacun avec un graphique SVG accessible
   (`role="img"`, infobulle par jour, légende dès deux séries, table « Voir
   les données » des seuls jours non nuls, axe continu de N jours finissant
   aujourd'hui) :
   - **Connexions** : barres réussies / échouées par jour, table par pays,
     50 dernières connexions (quand, compte, pays, réseau, issue), rappel RGPD
     (rétention 365 jours) ;
   - **Tokens et coûts LLM** : barres par source (démo publique, tuteur,
     Twin9/Twin6), table requêtes / tokens / coût (période et tout temps),
     Twin9 par modèle ;
   - **Finances** : barres divergentes (recharges au-dessus, débits +
     remboursements en dessous), table par nature et captures PayPal ;
   - **Activité** : inscriptions et cartographies créées par jour, rappel des
     partages et des cartographies stockées (opt-in).
6. **Votes de gouvernance** : pour chaque proposition au statut `review`
   (compétences et référentiel), le décompte `MajorityTally` contre
   l'électorat courant (pour, contre, abstention, sans voix, seuil), le verdict
   (« Majorité atteinte — entérinable », « Rejetée », « En attente de voix »,
   « Électorat vide ») et les retardataires, avec un lien « écrire aux
   retardataires » (`mailto:` en copie cachée, sujet « [humanome] Vote en
   attente : <proposition> <version> »).

## Scénarios alternatifs

- **A1 — Changer de période** (étape 2) : les boutons « 7 j », « 30 j », « 90 j »,
  « 1 an » (`aria-pressed`) rechargent avec `days=7|30|90|365`. Côté API, un
  `days` absent vaut 30 ; nul, négatif ou non numérique est ramené à 1 ; au-delà
  de 365, à 365. Les totaux « tout temps » ignorent la période.
- **A2 — Comptes par rôle** (étape 3) : le menu « Rôle » (sept rôles §2)
  recharge `GET /api/admin/users?role=<rôle>` (paginé par 20).
- **A3 — Relancer les retardataires** (étape 6) : seuls comptent les votes des
  membres **courants** de l'électorat (porteurs du rôle `epistemiarque`, non
  supprimés) ; le vote d'un ancien membre est ignoré, les membres sans vote
  sont listés.
- **A4 — Base GeoIP présente** (étape 5) : le pays (code ISO) est résolu
  localement au moment de la connexion ; la table « par pays » ventile les
  connexions réussies.

## Scénarios d'erreur

- **E1 — Visiteur sans session** : `401 « Authentification requise »` ; IHM :
  espace réservé.
- **E2 — Compte sans rôle admin** : `403` (même épistémiarque, établissement,
  promptologue) ; IHM : espace réservé, aucun agrégat demandé.
- **E3 — Erreur serveur** (étape 2) : l'IHM affiche le message de l'API (ex.
  « Erreur interne ») en alerte, sans tableau de bord ; une erreur du bloc
  « Comptes par rôle » affiche « Chargement impossible. ».

## Règles de gestion

- **RG1** — Fenêtre : `since = DATE_SUB(CURDATE(), INTERVAL days-1 DAY)`,
  `days` borné à 1..365 par `overview` (l'entier est inliné, jamais une chaîne
  utilisateur).
- **RG2** — « Connecté maintenant » = session active depuis moins de
  `ACTIVE_WINDOW_SECONDS` (900 s) ; comptes distincts, sessions anonymes
  comptées à part. Les comptes supprimés sont exclus des totaux et de la
  répartition par rôle.
- **RG3** — Partage actif = non révoqué et non expiré ; consultations =
  événements `share_consulted` (période et total).
- **RG4** — Finances en micro-USD signés : recharge positive, débit et
  remboursement négatifs ; les tokens Twin9 viennent des seuls débits ; un
  modèle inconnu est affiché « ? ».
- **RG5** — Connexions : chaque ouverture de session (connexion **ou**
  activation) journalise `login`, chaque échec `login_failed` (rattaché au
  compte visé s'il existe, anonyme sinon), avec `{pays, reseau}` seulement ;
  purge des événements de plus de 365 jours (tirage d'une connexion sur 100).
- **RG6** — Votes : électorat recalculé à chaque lecture (`Electorate::ids`),
  seuil = majorité absolue de l'électorat (`MajorityTally`).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Adresse IP de connexion | Jamais stockée : pays (MMDB locale, aucun service tiers) + réseau tronqué `/24` / `/48` |
| E-mail des comptes | Affiché à l'administrateur (dernières connexions, retardataires, comptes par rôle) ; jamais écrit dans les journaux |
| Contenus (portfolio, cartographie, prompts) | Jamais lus par le monitoring : seulement des comptages |
| Journal des connexions | `audit_events` `login` / `login_failed`, rétention 365 jours |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/admin/MonitoringSection.jsx` | Périodes, tuiles, graphiques SVG + tables de secours, connexions, votes, comptes par rôle |
| Front | `web/src/views/admin/admin-api.js` — `fetchMonitoring`, `listUsers`, `usd`, `nb`, `frDate` | Appels et formats fr-FR |
| Front | `web/src/views/AdminView.jsx`, `web/src/router.js` | Carte et onglet « Monitoring », garde de rôle |
| API | `api/src/routes/admin.php` — `GET /admin/monitoring`, `GET /admin/users` | Garde `admin`, lecture de `days` |
| Domaine | `api/src/Admin/Monitoring.php` — `overview` | Sept blocs d'agrégats |
| Domaine | `api/src/Auth/LoginJournal.php` | Journal `login` / `login_failed`, purge |
| Domaine | `api/src/Geo/CountryResolver.php`, `api/src/Geo/IpAnonymizer.php` | Pays local (MMDB absente → `null`), réseau tronqué |
| Domaine | `api/src/Referentiel/Electorate.php`, `api/src/Referentiel/MajorityTally.php` | Électorat courant, décompte |
| API (source) | `api/src/routes/auth.php` (`/auth/login`, `/auth/activate`) | Alimentation du journal des connexions |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ADM-06-U01 | `Monitoring::overview` | Bornes 1..365, sept blocs ordonnés | `api/tests/UseCases/Unit/UcAdm06MonitoringTest.php` |
| UC-ADM-06-U02 | `overview` — utilisateurs | Supprimés exclus, non activés, connectés < 15 min distincts, anonymes, par rôle (RG2) | idem |
| UC-ADM-06-U03 | `overview` — fenêtre | `days=1` exclut hier, `days=2` l'inclut (RG1) | idem |
| UC-ADM-06-U04 | `overview` — cartographies | Par type, stockées, nouvelles, partages actifs, consultations période/total (RG3) | idem |
| UC-ADM-06-U05 | `overview` — finances | Soldes, natures signées, série quotidienne, PayPal (RG4) | idem |
| UC-ADM-06-U06 | `overview` — tokens | Fusion démo/tuteur/Twin9 par jour, `null` si muet, totaux, par modèle « ? » | idem |
| UC-ADM-06-U07 | `overview` — connexions | Réussies/échouées, pays `null`, 50 dernières, échec anonyme, réseau | idem |
| UC-ADM-06-U08 | `overview` — votes | `review` seulement, électorat courant, retardataires, deux grains (RG6) | idem |
| UC-ADM-06-U09 | `LoginJournal` | `{pays, reseau}` sans IP, IP invalide → réseau `null`, purge > 365 j (RG5) | idem |
| UC-ADM-06-U10 | `CountryResolver` | MMDB absente (vide, inexistante, relative) → `null` ; couture de test | idem |
| UC-ADM-06-U11 | `IpAnonymizer` | `/24`, `/48`, IPv4 mappée, entrées invalides | idem |
| UC-ADM-06-U12 | `fetchMonitoring` | URL `days` (défaut 30, encodé) | `web/test/usecases/unit/uc-adm-06-monitoring.test.jsx` |
| UC-ADM-06-U13 | `usd`, `nb` | Signes, non-numériques → 0, millions | idem |
| UC-ADM-06-U14 | `parseHash`, `AdminView` | Route et carte « Monitoring » en tête de l'accueil | idem |
| UC-ADM-06-U15 | `MonitoringSection` | Axe de N jours : hors fenêtre ignoré, jours nuls omis, graphique accessible | idem |
| UC-ADM-06-U16 | `MonitoringSection` | États vides (graphiques, pays, journal, votes) | idem |
| UC-ADM-06-U17 | `MonitoringSection` | Pays/compte inconnus, issue « Échec » | idem |
| UC-ADM-06-U18 | `MonitoringSection` | Barres divergentes `|débit + remboursement|`, tuile de dépense | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ADM-06-F01 | Nominal (2, 4-5) | API | Activité réelle (inscriptions, cartographie, partage consulté, échecs) → agrégats exacts, pays `null` sans MMDB | `api/tests/UseCases/Functional/UcAdm06MonitoringTest.php` |
| UC-ADM-06-F02 | Garanties RGPD | API | Ni IP, ni contenu, ni mot de passe dans la réponse ; journal en `/24` | idem |
| UC-ADM-06-F03 | A1 | API | 7 j vs 30 j, défaut 30, bornage `0`/`abc`/`-3`/`1000` | idem |
| UC-ADM-06-F04 | A2 | API | `users?role=` pour épistémiarque, apprenant, admin | idem |
| UC-ADM-06-F05 | A3 | API | Décompte (seuil 2 sur 3, en attente) et retardataires | idem |
| UC-ADM-06-F06 | A4 | API | GeoIP simulée : ventilation BE/FR, réseau tronqué | idem |
| UC-ADM-06-F07 | E1, E2 | API | `401` visiteur, `403` non-admin | idem |
| UC-ADM-06-F08 | Nominal (1-5) | IHM | `<App/>` : accueil → carte → tableau de bord 30 j, tuiles, graphiques | `web/test/usecases/functional/uc-adm-06-monitoring.test.jsx` |
| UC-ADM-06-F09 | A1 | IHM | « 7 j » → `days=7`, bouton pressé, tuile mise à jour | idem |
| UC-ADM-06-F10 | Nominal (5), A4 | IHM | Par pays (« Inconnu »), réseau tronqué, issue | idem |
| UC-ADM-06-F11 | Nominal (6), A3 | IHM | Vote en attente, retardataires, `mailto:` en copie cachée | idem |
| UC-ADM-06-F12 | A2 | IHM | Comptes par rôle : admin puis épistémiarques | idem |
| UC-ADM-06-F13 | E3 | IHM | Erreur serveur → alerte, pas de tableau de bord | idem |
| UC-ADM-06-F14 | E1, E2 | IHM | Non-admin : espace réservé, aucun agrégat demandé | idem |

### Tests existants liés (non-régression)

- `api/tests/AdminMonitoringTest.php` — journal des connexions, agrégats, votes, filtre par rôle.
- `api/tests/GeoIpAnonymizerTest.php` — troncature réseau.
- `web/src/views/admin/MonitoringSection.test.jsx` — tuiles, période, votes, comptes par rôle, formats.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcAdm06 --testdox
cd web && npx vitest run test/usecases/unit/uc-adm-06 test/usecases/functional/uc-adm-06
```

## Anomalies constatées

- **AN-1 — Historique de la démo effacé par la maintenance** (voir UC-SYS-03,
  AN-1) : la maintenance quotidienne supprime les lignes `llm_usage_daily` des
  jours passés ; après son passage, la série quotidienne « Démo publique » du
  graphique des tokens et son coût « tout temps » ne portent plus que le jour
  courant, ce qui neutralise le détecteur d'anomalies pour la démo. Figé par
  UC-SYS-03-F09.

## Limites

- **L1** — La famille de menu « Administrer » (`web/src/nav.js`) ne liste pas le
  monitoring : on l'atteint par l'accueil `#/admin` (première carte) ou les
  onglets d'administration.
- **L2** — L'axe du temps de l'IHM est construit en dates **UTC**
  (`toISOString`), alors que le serveur groupe par `DATE()` / `CURDATE()` dans
  le fuseau de la session MySQL : si ces fuseaux diffèrent, un point proche de
  minuit peut tomber hors de l'axe affiché (les totaux, eux, restent justes).
- **L3** — Sans base MMDB (`GEOIP_DB` vide ou fichier absent), toutes les
  connexions sont « Inconnu » ; l'indisponibilité est mémorisée pour la durée
  du processus PHP.
- **L4** — La purge du journal des connexions est opportuniste (une connexion
  sur 100, pas de cron sur l'offre OVH) : des événements de plus de 365 jours
  peuvent survivre tant que peu de connexions ont lieu.
- **L5** — Le cas « copie statique » (API absente) est commun à toute
  l'administration : voir UC-ADM-01, E7.
