# UC-APP-01 — Constituer son portfolio local

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (la route est aussi utilisable sans compte) |
| **Acteurs secondaires** | Google Docs (source publique, lecture seule) ; serveur humanome (relais d'import, sans conservation) |
| **Portée** | humanome.xyz — module Portfolio `#/portfolio`, entièrement dans le navigateur |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (fournir son portfolio : URL Google Docs ou copier-coller), §4.2 (module Portfolio, v1 texte uniquement), §4.3 (découpage journalier), §6.1 (aucune donnée de portfolio côté serveur par défaut) ; principe RGPD n°5 de `CLAUDE.md` (journalisation minimale) |
| **Décisions** | ADR-001 (client-first), ADR-010-editeur-portfolio (textarea améliorée), ADR-006 (contrat `archive-export.segmentation`) |
| **Statut** | Implémenté (P7) |

## Objectif

Permettre à l'apprenant de rassembler son journal de bord réflexif — par
collage, fichier `.txt`/`.md` ou document Google Docs public — dans un
**portfolio conservé uniquement dans son navigateur**, découpé
automatiquement en **journées datées** ajustables, qui servira de matière
première aux cartographies (UC-APP-02) et à l'archive (UC-APP-06).

## Déclencheur

L'apprenant ouvre `#/portfolio` (menu « Ma cartographie → Mon portfolio »,
ou le lien « Créer un portfolio » du tableau de bord `#/espace`).

## Préconditions

- Aucune session n'est requise : la vue n'a pas de garde et n'appelle pas
  l'API à l'ouverture (le menu ne la propose qu'aux comptes `apprenant`).
- Pour conserver le travail : un navigateur offrant IndexedDB (base
  `humanome-portfolios`).
- Pour l'import Google Docs : le site en ligne (API joignable) et un document
  public ou partagé « en lecture » par lien.

## Garanties en cas de succès

- Le portfolio `{id, titre, source, texte, segments, createdAt, updatedAt}`
  est enregistré dans IndexedDB (base `humanome-portfolios`, magasin
  `portfolios`, clé `id`) et relu à la réouverture de la page.
- `segments` porte, pour chaque journée, `{date, titre?, texte, debut, fin}`
  avec des offsets exacts dans le texte **original** (contrat
  `archive-export.segmentation`).
- Aucun texte de portfolio n'a été envoyé au serveur (collage, fichier) ; pour
  un import Google Docs, le texte a transité par le relais sans y être
  conservé ni journalisé.

## Garanties minimales (en cas d'échec)

- Le texte déjà saisi n'est jamais écrasé par un import en échec.
- Un stockage local indisponible est signalé : l'apprenant sait que son
  travail ne sera pas conservé.
- L'application serveur ne garde aucune trace du contenu, ni de
  l'identifiant du document, ni de l'IP (seau de quota haché) : ni table, ni
  `error_log`. L'identifiant voyage toutefois dans l'URL d'un `GET` et peut
  figurer dans les journaux d'accès de l'hébergeur (voir Limites).

## Scénario nominal

1. L'apprenant ouvre `#/portfolio`. Le bandeau permanent annonce « Vos textes
   ne quittent pas ce navigateur. » ; la liste « Mes portfolios » est lue dans
   IndexedDB, du plus récemment modifié au plus ancien.
2. Il clique « Nouveau portfolio » : un enregistrement est créé et persisté
   (`titre` « Portfolio sans titre », `source` `colle`, texte vide, identifiant
   aléatoire).
3. Il saisit un titre et colle son journal dans l'éditeur (textarea
   améliorée : auto-agrandissement, compteurs mots/caractères, plein écran
   quitté par Échap).
4. À chaque modification du texte, le découpage est **recalculé** par
   `segmentText` : une journée commence à chaque entête de date (ISO
   `2026-01-05`, numérique `05/01/2026`, textuelle `5 janvier 2026`, avec
   jour de semaine, marques `#` ou titre court) ou séparateur (`---`, `===`…) ;
   le titre du document est rattaché à la première journée, mais un texte
   réel avant la première date (préambule) forme une journée non datée ;
   deux entêtes consécutives de même date fusionnent ; un texte sans aucune
   date forme un bloc unique daté du jour.
5. Après une pause de saisie de 600 ms, le portfolio est enregistré
   localement (`updatedAt` mis à jour) et l'éditeur affiche « Enregistré
   localement à HH:MM:SS ».
6. Il ajuste le découpage : renommer la date d'une journée (`AAAA-MM-JJ`,
   validée ; vide = non datée), fusionner une journée avec la précédente,
   scinder une journée au curseur (la seconde partie est non datée). Chaque
   ajustement est sauvegardé de la même façon.
7. Le portfolio est désormais proposé par l'assistant de cartographie
   (UC-APP-02), le tableau de bord (UC-APP-03) et l'archive (UC-APP-06).

## Scénarios alternatifs

- **A1 — Import d'un fichier `.txt`/`.md`** (étape 3) : le fichier est lu par
  le navigateur (aucun transfert) ; le texte remplace celui du portfolio,
  `source` devient `fichier`, et si le titre est encore « Portfolio sans
  titre » il devient le nom du fichier sans extension. Message « Fichier « … »
  importé (N caractères), lu localement par votre navigateur. »
- **A2 — Import d'un Google Docs public** (étape 3) : l'apprenant colle l'URL
  (`…/document/d/<id>/…`, `…/document/u/<n>/d/<id>/…` ou `…/open?id=<id>`) ;
  le navigateur appelle `GET api/gdoc-text?docId=<id>`. Le serveur valide
  l'identifiant, compte la requête dans le quota horaire par IP, télécharge
  `https://docs.google.com/document/d/<id>/export?format=txt` (15 s, 1 Mo
  maximum, jusqu'à 3 redirections https vers `*.googleusercontent.com`) et
  répond `200 text/plain; charset=utf-8`, `Cache-Control: no-store`. Le texte
  remplace celui du portfolio, `source` devient `gdocs`, message « …le serveur
  n'en conserve aucune copie ».
- **A3 — Reprendre un autre portfolio** (étape 2) : un clic sur un titre de la
  liste ouvre ce portfolio ; une modification en attente du portfolio courant
  est d'abord sauvegardée **immédiatement** (sans attendre les 600 ms). Voir
  l'anomalie A-04 (minuteur non annulé, liste non mise à jour).
- **A4 — Supprimer un portfolio** (étape 1) : « Supprimer » puis « Confirmer la
  suppression » ; l'enregistrement est effacé d'IndexedDB (donnée locale
  uniquement).
- **A5 — Exporter le texte** (étape 7) : « Exporter (.md) » télécharge le texte
  à l'octet près (`text/markdown`), nommé d'après le titre (`journal-d-ete-2026.md`).

## Scénarios d'erreur

- **E1 — Stockage local indisponible** (étape 1) : IndexedDB absent ou refusé.
  Alerte « Stockage local indisponible (…) : vous pouvez travailler sur un
  texte, mais il ne sera pas conservé à la fermeture de l'onglet. » ; un
  portfolio de travail est créé en mémoire et chaque sauvegarde affiche « La
  sauvegarde locale a échoué : … ». Si IndexedDB est présent mais que la
  première ouverture a été refusée, l'alerte s'affiche aussi, mais l'ouverture
  est retentée à l'opération suivante : le travail est alors conservé.
- **E2 — URL Google Docs non reconnue** (A2) : message « URL non reconnue :
  collez le lien complet du document (…) », aucune requête.
- **E3 — Document inaccessible ou transfert impossible** (A2) : le serveur
  répond `403` (document privé : Google 401/403), `404` (introuvable), `413`
  (plus d'1 Mo), `502` (autre statut Google, redirection hors Google, en
  `http`, avec port explicite, ou plus de 3 redirections : « Trop de
  redirections depuis Google Docs. »), `504` (Google injoignable), ou `503`
  « Service indisponible » si la base n'est pas configurée (avant toute
  validation) ; le site affiche le message français du serveur, le texte en
  place est conservé.
- **E4 — Quota horaire atteint** (A2) : au-delà de `perIpPerHour` requêtes par
  heure et par IP (quota **partagé** avec le proxy LLM `POST /api/llm`, IPv6
  regroupées par /64), `429` + `Retry-After` ; aucun appel à Google. Le délai
  vaut 30 s au premier dépassement puis double à chaque requête refusée
  (plafonné à 3600 s) : les requêtes bloquées continuent d'incrémenter le
  compteur. Un identifiant invalide (`422`, E9) ne consomme pas de quota.
- **E5 — API absente** (A2) : copie statique du site (`file://`, page HTML au
  lieu de la réponse JSON/texte, réseau coupé) : « L'import Google Docs passe
  par le serveur humanome.xyz, qui est injoignable depuis cette copie du site.
  Utilisez le copier-coller ou un fichier .txt/.md. »
- **E6 — Date de journée invalide** (étape 6) : « Date invalide : utilisez le
  format AAAA-MM-JJ (…) » ; la date d'origine est conservée.
- **E7 — Scission sans curseur à l'intérieur de la journée** (étape 6) :
  message « Pour scinder, placez le curseur à l'intérieur du texte de la
  journée (ni tout début, ni toute fin). »
- **E8 — Fichier illisible** (A1) : « Lecture du fichier impossible : … » ;
  portfolio inchangé.
- **E9 — Identifiant reconnu mais invalide** (A2) : l'URL a une forme
  reconnue (`…/document/d/abc/…`) mais l'identifiant extrait ne respecte pas
  la règle du serveur (RG6) : la requête part, le serveur répond `422`
  « Identifiant de document Google Docs invalide. » sans appel à Google ; le
  message est affiché, le texte en place est conservé.
- **E10 — Opération locale impossible** (A3, A4, A5) : lecture, effacement
  IndexedDB ou création du fichier refusés par le navigateur : « Impossible
  d'ouvrir ce portfolio : … », « Suppression impossible : … », « Export
  impossible : … » ; le portfolio courant et la base restent inchangés.

## Règles de gestion

- **RG1** — Le module Portfolio (`portfolio-store`, `PortfolioView`)
  n'envoie jamais le texte au serveur ; seule exception, annoncée dans
  l'IHM : l'import Google Docs, relayé sans conservation (`no-store`, aucun
  journal de contenu ni d'identifiant). D'autres cas font transiter
  explicitement le texte, sans le stocker : cartographie en mode humanome
  (UC-APP-02, `POST /api/llm`), Twin6 en crédits (UC-APP-09,
  `POST /api/twin6/appel`), Twin9 (UC-APP-10, `POST /api/twin9/appel`). La
  seule route de **stockage** d'un portfolio est le dépôt explicite en
  cohorte (UC-APP-08, `POST /api/cohortes/{id}/portfolio`).
- **RG2** — `source` ∈ {`colle`, `gdocs`, `fichier`} (énumération du schéma
  `archive-export`).
- **RG3** — Toute modification du **texte** relance la segmentation
  automatique et **réinitialise** les ajustements manuels (annoncé à
  l'écran) ; les ajustements (date, fusion, scission) ne touchent pas au texte.
- **RG4** — Sauvegarde continue différée de 600 ms ; sauvegarde immédiate
  avant d'ouvrir ou de créer un autre portfolio. Aucune sauvegarde au
  démontage de la vue (changement de page) ni à la fermeture de l'onglet :
  les modifications des 600 dernières ms sont alors perdues (anomalie A-05).
- **RG5** — Une date textuelle sans année (« Lundi 22 décembre ») ne coupe que
  si elle est ancrée (jour de semaine ou marque `#`) et donne une journée non
  datée, à nommer ; une date au milieu d'une phrase ne coupe jamais.
- **RG6** — Identifiant Google Docs. Côté navigateur, un identifiant collé
  seul doit faire 20 à 80 caractères `[A-Za-z0-9_-]` ; un identifiant extrait
  d'une URL (`/document/d/`, `/document/u/<n>/d/`, `?id=` sur **n'importe
  quel hôte**) n'est pas borné. Le serveur applique `[A-Za-z0-9_-]{20,80}` et
  répond `422` sinon, sans appel à Google ni consommation de quota (E9).
- **RG7** — Relais anti-SSRF : origine codée en dur (`docs.google.com`),
  redirections suivies uniquement en `https`, vers `*.googleusercontent.com`,
  sans port explicite, au plus 3 ; réponse bornée à 1 Mo.
- **RG8** — Quota du relais : `perIpPerHour` de la configuration de la démo
  (priorité base > variable `DEMO_PER_IP_PER_HOUR` > `api/config/demo.php`,
  20 par défaut), seau `llm:` + sha256 de l'identité (IPv4 complète, ou
  préfixe /64 pour une IPv6) ; le relais n'est **pas** soumis à
  l'interrupteur de la démo (`DEMO_ENABLED`).
- **RG9** — Offsets `debut` (inclus) / `fin` (exclu) exacts dans le texte
  original. La projection vers `archive-export.segmentation` utilisée par le
  produit est faite par `web/src/lib/archive.js` (UC-APP-06) ; le moteur
  exporte aussi `toArchiveSegmentation` (journées datées seulement, en
  `{date, debut, fin}`), qu'aucune partie de l'IHM n'appelle.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte du portfolio | IndexedDB du navigateur uniquement (§6.1) pour ce cas ; transit sans conservation dans d'autres cas explicites (UC-APP-02 mode humanome, UC-APP-09, UC-APP-10) ; stockage serveur seulement par dépôt en cohorte (UC-APP-08) |
| Découpage en journées | IndexedDB, avec le portfolio |
| Document Google Docs importé | Transite par le relais, jamais stocké ni journalisé (`no-store`) |
| Identifiant du document | Jamais journalisé par l'application (ni table, ni `error_log`) ; paramètre d'URL d'un `GET`, il peut figurer dans les journaux d'accès de l'hébergeur |
| IP de l'appelant (import) | Jamais stockée : seau haché `llm:` + sha256(IPv4 complète ou préfixe /64 IPv6) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash`, `isValidIsoDate` ; `web/src/nav.js` — `FAMILIES` | Route `#/portfolio`, entrée de menu, validation des dates |
| Front | `web/src/views/PortfolioView.jsx` | Orchestration : liste, sources, découpage, sauvegarde, export |
| Front | `web/src/components/PortfolioEditor.jsx` | Éditeur (compteurs, statut, plein écran) — ADR-010 |
| Front | `web/src/lib/portfolio-store.js` — `createPortfolioStore`, `createIndexedDbAdapter` | CRUD local, base `humanome-portfolios` |
| Front | `web/src/lib/gdoc.js` — `extractGdocId`, `fetchGdocText` | Reconnaissance de l'URL, appel du relais, messages d'erreur |
| Moteur | `engine/src/portfolio/segment.js` — `segmentText`, `mergeSegments`, `splitSegment` | Découpage journalier et ajustements |
| Moteur | `engine/src/portfolio/segment.js` — `toArchiveSegmentation` | API moteur exportée, **non utilisée par l'IHM** (l'archive projette via `web/src/lib/archive.js`, UC-APP-06) |
| API | `GET /api/gdoc-text` — `api/src/routes/llm.php` | Relais d'export texte Google Docs |
| Domaine | `api/src/Llm/DemoConfig.php` (`perIpPerHour`), `api/src/Auth/RateLimiter.php`, `api/src/ClientIp.php` | Quota horaire par IP, seau haché |
| Domaine | `api/src/Llm/LlmRuntime.php` | Client HTTP sortant (cURL, remplacé en test) |
| Domaine | `api/src/Llm/CurlHttpClient.php` | Transport sortant : plafond d'octets appliqué pendant le transfert, `https` seul, aucune redirection suivie par le transport |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-01-U01 | `segmentText` | Fixture 3 jours : dates, titres, offsets contigus et couvrants (RG9) | `engine/test/usecases/unit/uc-app-01-constituer-portfolio.test.js` |
| UC-APP-01-U02 | `toArchiveSegmentation` | Contrat moteur (API non appelée par l'IHM) : projection acceptée par le schéma `archive-export` | idem |
| UC-APP-01-U03 | `mergeSegments`, `splitSegment` | Fusion puis scission au même point = découpage d'origine ; seconde partie non datée | idem |
| UC-APP-01-U04 | `segmentText` | Texte sans date → bloc daté du jour ; texte vide → aucune journée | idem |
| UC-APP-01-U05 | `segmentText` | Export Google Docs avec BOM : même découpage | idem |
| UC-APP-01-U06 | `segmentText` | **Comportement actuel** : CRLF → entêtes `##` ignorées (anomalie A-01) | idem |
| UC-APP-01-U21 | `segmentText` | Séparateur `---` → journée non datée ; entêtes de même date fusionnées ; « ## Lundi 22 décembre » → date `null` (RG5) ; date en milieu de phrase sans coupure ; préambule non daté | idem |
| UC-APP-01-U07 | `parseHash`, `FAMILIES` | `#/portfolio` → route `portfolio` ; entrée « Mon portfolio » de « Ma cartographie » | `web/test/usecases/unit/uc-app-01-constituer-portfolio.test.jsx` |
| UC-APP-01-U08 | `createIndexedDbAdapter` | Ouverture paresseuse, `open('humanome-portfolios', 1)`, magasin `portfolios` à clé `id`, CRUD | idem |
| UC-APP-01-U09 | `createIndexedDbAdapter` | Ouverture refusée → échec puis nouvelle tentative | idem |
| UC-APP-01-U10 | `createPortfolioStore` | IndexedDB absent → message français (E1) | idem |
| UC-APP-01-U11 | `createPortfolioStore` | Défauts de création, sauvegarde, relecture par un nouveau store (rechargement) | idem |
| UC-APP-01-U12 | `extractGdocId` | Formes d'URL, identifiant brut borné 20–80 (RG6) | idem |
| UC-APP-01-U13 | `fetchGdocText` | GET relatif, `Accept`, `same-origin`, texte renvoyé tel quel | idem |
| UC-APP-01-U14 | `fetchGdocText` | Replis français par statut (403, 404, 422, 429, 5xx) | idem |
| UC-APP-01-U15 | `fetchGdocText` | Erreur HTML (hébergement statique) → API absente (E5) | idem |
| UC-APP-01-U16 | `isValidIsoDate` | Date stricte AAAA-MM-JJ, calendrier réel (E6) | idem |
| UC-APP-01-U17 | `PortfolioEditor` | Compteurs, statut, `onChange`, plein écran / Échap | idem |
| UC-APP-01-U18 | `DemoConfig::load` | `perIpPerHour` : base > env > fichier (20) (RG8) | `api/tests/UseCases/Unit/UcApp01ConstituerPortfolioTest.php` |
| UC-APP-01-U19 | `ClientIp` + `RateLimiter` | Identité IPv4 complète / préfixe /64 IPv6 ; compteur partagé par une /64 ; `Retry-After` 30 s puis doublé, plafonné (le seau haché `llm:` de la route est vérifié par F18) | idem |
| UC-APP-01-U20 | `LlmRuntime` | Client HTTP injectable, `null` restaure cURL | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-01-F01 | Nominal | IHM | `<App/>` : collage, 3 journées, sauvegarde IndexedDB, rechargement ; aucune requête (fetch, XMLHttpRequest, beacon) | `web/test/usecases/functional/uc-app-01-constituer-portfolio.test.jsx` |
| UC-APP-01-F02 | A1 | IHM | Fichier `.md` lu localement, titre dérivé (titre déjà choisi conservé), `source` `fichier`, aucune requête | idem |
| UC-APP-01-F03 | A2 | IHM | `GET api/gdoc-text`, texte existant remplacé, stocké localement, `source` `gdocs` | idem |
| UC-APP-01-F04 | Nominal (étape 6), RG3 | IHM | Date renommée, fusion, scission, date vidée (`null`) : état ajusté persisté, texte intact ; modification du texte → découpage automatique rétabli | idem |
| UC-APP-01-F05 | A3 | IHM | Changement de portfolio : sauvegarde du courant en moins de 300 ms (avant l'échéance des 600 ms) | idem |
| UC-APP-01-F06 | A4 | IHM | Suppression en deux temps, base vidée | idem |
| UC-APP-01-F07 | A5 | IHM | Export `.md` à l'octet près, nom dérivé du titre | idem |
| UC-APP-01-F08 | E1 | IHM | IndexedDB absent : alerte, travail en mémoire, échec de sauvegarde signalé ; ouverture refusée : alerte, puis ouverture retentée | idem |
| UC-APP-01-F09 | E2 | IHM | URL non reconnue : message, aucune requête | idem |
| UC-APP-01-F10 | E3 | IHM | 403 : message du serveur, texte conservé | idem |
| UC-APP-01-F11 | E4 | IHM | 429 : message de quota | idem |
| UC-APP-01-F12 | E5 | IHM | API absente (404 HTML, réseau coupé) : renvoi vers collage ou fichier | idem |
| UC-APP-01-F13 | E6 | IHM | Date invalide refusée, date d'origine persistée | idem |
| UC-APP-01-F14 | E7 | IHM | Scission sans curseur : message d'aide | idem |
| UC-APP-01-F15 | E8 | IHM | Fichier illisible : message, texte conservé | idem |
| UC-APP-01-F16 | A1 (anomalie A-01) | IHM | **Comportement actuel** : `.md` Windows → une seule journée | idem |
| UC-APP-01-F17 | A2 (anomalie A-02) | IHM | **Comportement actuel** : identifiant brut bloqué par le champ `type="url"` | idem |
| UC-APP-01-F18 | A2 | API | 200 `text/plain`, `no-store`, octets relayés, appel Google borné, aucune trace en base | `api/tests/UseCases/Functional/UcApp01ConstituerPortfolioTest.php` |
| UC-APP-01-F19 | A2 | API | Apprenant connecté ; démo désactivée : relais toujours disponible (RG8) | idem |
| UC-APP-01-F20 | A2, E3 | API | 3 redirections Google suivies ; une 4e → 502 « Trop de redirections » | idem |
| UC-APP-01-F21 | E9 (RG6) | API | Identifiant invalide → 422 sans appel à Google ni quota consommé | idem |
| UC-APP-01-F22 | E3 | API | Google 401/403 → 403, 404 → 404, 500/429 → 502, messages français | idem |
| UC-APP-01-F23 | E3, RG7 | API | 413 (1 Mo), 504 (injoignable), 502 (redirection vers une IP, en `http`, ou avec port explicite : jamais contactée) | idem |
| UC-APP-01-F24 | E4, RG8 | API | Quota partagé avec `POST /api/llm` ; 429 + `Retry-After: 30` puis 60, plus d'appel à Google ; autre IP non pénalisée | idem |
| UC-APP-01-F25 | RG1 | API | Table de routage : seule route d'écriture « portfolio » = dépôt en cohorte ; chemins plausibles en 404, rien en base | idem |
| UC-APP-01-F26 | A3 (anomalie A-04) | IHM | **Comportement actuel** : le portfolio rouvert est réenregistré sans modification, la liste garde « Portfolio sans titre » | `web/test/usecases/functional/uc-app-01-constituer-portfolio.test.jsx` |
| UC-APP-01-F27 | RG4 (anomalie A-05) | IHM | **Comportement actuel** : navigation vers `#/espace` pendant la pause → dernière modification perdue | idem |
| UC-APP-01-F28 | E9 | IHM | URL reconnue, identifiant invalide : 422 du serveur affiché, un seul appel, texte conservé | idem |
| UC-APP-01-F29 | E10 | IHM | Lecture, effacement IndexedDB et création du fichier refusés : messages, base intacte | idem |

### Tests existants liés (non-régression)

- `engine/src/portfolio/segment.test.js` — heuristiques de détection, fusion, scission, projection.
- `web/src/lib/portfolio-store.test.js` — CRUD sur l'adaptateur mémoire.
- `web/src/lib/gdoc.test.js` — `extractGdocId`, `fetchGdocText` (cas nominaux et copie statique).
- `web/src/views/PortfolioView.test.jsx` — vue isolée (store mémoire), dont le panneau « Cartographier ».
- `api/tests/LlmGdocTextTest.php` — relais : validation, anti-SSRF, taille, quota partagé et /64.
- `web/e2e/parcours-apprenant.e2e.js` — étape « Création du portfolio » (navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcApp01 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-APP-01
cd engine && npx vitest run test/usecases --testNamePattern UC-APP-01
```

## Anomalies constatées

- **A-01 — Fins de ligne CRLF : les entêtes Markdown ne découpent pas.**
  Dans `engine/src/portfolio/segment.js`, `HEADING_RE`
  (`/^\s{0,3}(#{1,6})\s+(.*)$/`) n'a pas le drapeau `s` : `.` n'avale pas le
  `\r` final d'une ligne CRLF, donc « `## Lundi 5 janvier 2026\r` » n'est pas
  reconnue comme entête. Un fichier `.md` rédigé sous Windows (ou tout texte
  importé en CRLF, le relais Google Docs transmettant les octets tels quels)
  donne **un seul bloc daté du jour** au lieu des journées attendues. Les
  entêtes sans `#` (« Lundi 5 janvier 2026 », « 05/01/2026 ») et les
  séparateurs restent reconnus en CRLF. Comportement figé par U06 et F16.
  Correctif suggéré : normaliser `\r\n` → `\n` avant segmentation, ou
  tolérer `\r?` en fin de motif.
- **A-02 — Identifiant Google Docs brut inutilisable depuis le formulaire.**
  `extractGdocId` accepte un identifiant collé seul, mais le champ est de type
  `url` : la validation native du navigateur (`typeMismatch`) bloque la
  soumission avant le gestionnaire, sans requête ni message de l'application.
  Figé par F17.
- **A-03 — Bouton « Cartographier » obsolète.** Le panneau affiché annonce
  que le lancement « sera disponible dans l'espace apprenant (bientôt) » et
  renvoie vers la démo « Essayer », alors que l'assistant `#/espace/nouveau-run`
  existe (UC-APP-02) et que l'aide contextuelle (`web/src/help/registry.js`)
  indique « Depuis un portfolio, vous lancez « Cartographier mes écrits » ».
  Comportement couvert par `web/src/views/PortfolioView.test.jsx`.
- **A-04 — Changement de portfolio pendant la pause de 600 ms : le portfolio
  ouvert est réenregistré sans modification et la liste garde l'ancien titre
  du portfolio quitté.** Dans `web/src/views/PortfolioView.jsx`,
  `flushPendingSave` enregistre bien le portfolio quitté, mais le minuteur de
  la sauvegarde différée n'est pas annulé (ses dépendances `dirty`,
  `saveDelay`, `effectiveStore` ne changent pas) : à échéance, il enregistre
  `currentRef.current`, qui désigne alors le portfolio **nouvellement ouvert**
  (`updatedAt` modifié, remontée en tête de liste, statut « Enregistré
  localement à … »). De plus `flushPendingSave` n'appelle pas `upsertSummary` :
  la barre latérale affiche l'ancien titre (« Portfolio sans titre ») du
  portfolio quitté jusqu'au rechargement. Figé par F26. Correctif suggéré :
  annuler le minuteur au flush (ou tester `dirtyRef` dans le rappel) et mettre
  la liste à jour dans `flushPendingSave`.
- **A-05 — Quitter la vue pendant la pause de 600 ms perd la dernière
  modification.** Le nettoyage de l'effet de sauvegarde (`clearTimeout`)
  s'exécute au démontage de la vue (clic de menu, tout changement de hash,
  fermeture de l'onglet) et aucune sauvegarde n'est déclenchée au démontage
  ni sur `pagehide`/`beforeunload` : seuls `handleCreate` et `handleSelect`
  appellent `flushPendingSave`. Figé par F27. Correctif suggéré : flush au
  démontage et sur `pagehide`.

## Limites

- `web/src/lib/md.js` (mini-rendu Markdown) n'est **pas** sollicité par ce
  cas : le portfolio reste du texte brut (ADR-010) ; ce module sert aux
  contenus de formation, à la page de confidentialité et aux rapports Twin9.
- v1 texte uniquement (§4.2) : ni image, ni PDF, ni URL autre que Google Docs.
- L'application réelle du plafond de 1 Mo et du délai de 15 s par
  `CurlHttpClient` (cURL) n'est pas testée (aucun appel réseau en test) :
  seuls le passage des paramètres (F18) et la réaction à un dépassement
  simulé (F23) sont vérifiés.
- L'identifiant du document Google Docs est un paramètre d'URL d'un `GET`
  (`api/gdoc-text?docId=…`) : l'application ne le journalise pas, mais les
  journaux d'accès du serveur web de l'hébergeur (OVH mutualisé) peuvent le
  contenir.
