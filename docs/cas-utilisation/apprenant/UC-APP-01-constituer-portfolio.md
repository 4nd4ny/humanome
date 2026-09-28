# UC-APP-01 — Constituer son portfolio local

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (la route est aussi utilisable sans compte) |
| **Acteurs secondaires** | Google Docs (source publique, lecture seule) ; serveur humanome (relais d'import, sans conservation) |
| **Portée** | humanome.xyz — module Portfolio `#/portfolio`, entièrement dans le navigateur |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (fournir son portfolio : URL Google Docs ou copier-coller), §4.2 (module Portfolio, v1 texte uniquement), §4.3 (découpage journalier), §6.1 (aucune donnée de portfolio côté serveur par défaut), §6.5 (journalisation minimale) |
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
- Le serveur ne garde aucune trace du contenu, ni de l'identifiant du
  document, ni de l'IP (seau de quota haché).

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
   le titre du document est rattaché à la première journée ; deux entêtes
   consécutives de même date fusionnent ; un texte sans aucune date forme un
   bloc unique daté du jour.
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
  est d'abord sauvegardée **immédiatement** (sans attendre les 600 ms).
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
  sauvegarde locale a échoué : … ».
- **E2 — URL Google Docs non reconnue** (A2) : message « URL non reconnue :
  collez le lien complet du document (…) », aucune requête.
- **E3 — Document inaccessible ou transfert impossible** (A2) : le serveur
  répond `403` (document privé : Google 401/403), `404` (introuvable), `413`
  (plus d'1 Mo), `502` (autre statut Google, redirection hors Google ou plus de
  3 redirections), `504` (Google injoignable) ; le site affiche le message
  français du serveur, le texte en place est conservé.
- **E4 — Quota horaire atteint** (A2) : au-delà de `perIpPerHour` requêtes par
  heure et par IP (quota **partagé** avec le proxy LLM `POST /api/llm`, IPv6
  regroupées par /64), `429` + `Retry-After` ; aucun appel à Google.
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

## Règles de gestion

- **RG1** — Le portfolio ne quitte jamais le navigateur : `portfolio-store`
  n'a aucune entrée/sortie réseau et **aucune route serveur** ne reçoit de
  portfolio (hors dépôt explicite dans une cohorte, UC-APP-08). Seule
  exception, annoncée dans l'IHM : l'import Google Docs, relayé sans
  conservation (`no-store`, aucun journal de contenu ni d'identifiant).
- **RG2** — `source` ∈ {`colle`, `gdocs`, `fichier`} (énumération du schéma
  `archive-export`).
- **RG3** — Toute modification du **texte** relance la segmentation
  automatique et **réinitialise** les ajustements manuels (annoncé à
  l'écran) ; les ajustements (date, fusion, scission) ne touchent pas au texte.
- **RG4** — Sauvegarde continue différée de 600 ms ; sauvegarde immédiate
  avant de quitter le portfolio courant.
- **RG5** — Une date textuelle sans année (« Lundi 22 décembre ») ne coupe que
  si elle est ancrée (jour de semaine ou marque `#`) et donne une journée non
  datée, à nommer ; une date au milieu d'une phrase ne coupe jamais.
- **RG6** — Identifiant Google Docs : `[A-Za-z0-9_-]{20,80}`, même règle côté
  navigateur et côté serveur (`422` sinon, sans appel à Google).
- **RG7** — Relais anti-SSRF : origine codée en dur (`docs.google.com`),
  redirections suivies uniquement en `https`, vers `*.googleusercontent.com`,
  sans port explicite, au plus 3 ; réponse bornée à 1 Mo.
- **RG8** — Quota du relais : `perIpPerHour` de la configuration de la démo
  (priorité base > variable `DEMO_PER_IP_PER_HOUR` > `api/config/demo.php`,
  20 par défaut), seau `llm:` + sha256 de l'identité /64 ; le relais n'est
  **pas** soumis à l'interrupteur de la démo (`DEMO_ENABLED`).
- **RG9** — Offsets `debut` (inclus) / `fin` (exclu) dans le texte original ;
  `toArchiveSegmentation` ne projette que les journées datées, en
  `{date, debut, fin}`.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte du portfolio | IndexedDB du navigateur uniquement (§6.1) |
| Découpage en journées | IndexedDB, avec le portfolio |
| Document Google Docs importé | Transite par le relais, jamais stocké ni journalisé (`no-store`) |
| Identifiant du document | Jamais journalisé |
| IP de l'appelant (import) | Jamais stockée : seau haché `llm:` + sha256(identité /64) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash`, `isValidIsoDate` ; `web/src/nav.js` — `FAMILIES` | Route `#/portfolio`, entrée de menu, validation des dates |
| Front | `web/src/views/PortfolioView.jsx` | Orchestration : liste, sources, découpage, sauvegarde, export |
| Front | `web/src/components/PortfolioEditor.jsx` | Éditeur (compteurs, statut, plein écran) — ADR-010 |
| Front | `web/src/lib/portfolio-store.js` — `createPortfolioStore`, `createIndexedDbAdapter` | CRUD local, base `humanome-portfolios` |
| Front | `web/src/lib/gdoc.js` — `extractGdocId`, `fetchGdocText` | Reconnaissance de l'URL, appel du relais, messages d'erreur |
| Moteur | `engine/src/portfolio/segment.js` — `segmentText`, `mergeSegments`, `splitSegment`, `toArchiveSegmentation` | Découpage journalier et ajustements |
| API | `GET /api/gdoc-text` — `api/src/routes/llm.php` | Relais d'export texte Google Docs |
| Domaine | `api/src/Llm/DemoConfig.php` (`perIpPerHour`), `api/src/Auth/RateLimiter.php`, `api/src/ClientIp.php` | Quota horaire par IP, seau haché |
| Domaine | `api/src/Llm/LlmRuntime.php` | Client HTTP sortant (cURL, remplacé en test) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-01-U01 | `segmentText` | Fixture 3 jours : dates, titres, offsets contigus et couvrants (RG9) | `engine/test/usecases/unit/uc-app-01-constituer-portfolio.test.js` |
| UC-APP-01-U02 | `toArchiveSegmentation` | Projection acceptée par le schéma `archive-export` | idem |
| UC-APP-01-U03 | `mergeSegments`, `splitSegment` | Fusion puis scission au même point = découpage d'origine ; seconde partie non datée | idem |
| UC-APP-01-U04 | `segmentText` | Texte sans date → bloc daté du jour ; texte vide → aucune journée | idem |
| UC-APP-01-U05 | `segmentText` | Export Google Docs avec BOM : même découpage | idem |
| UC-APP-01-U06 | `segmentText` | **Comportement actuel** : CRLF → entêtes `##` ignorées (anomalie A-01) | idem |
| UC-APP-01-U07 | `parseHash`, `FAMILIES` | `#/portfolio` → route `portfolio` ; entrée « Mon portfolio » de « Ma cartographie » | `web/test/usecases/unit/uc-app-01-constituer-portfolio.test.jsx` |
| UC-APP-01-U08 | `createIndexedDbAdapter` | Ouverture paresseuse, base v1, magasin `portfolios` à clé `id`, CRUD | idem |
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
| UC-APP-01-U19 | `ClientIp` + `RateLimiter` | Seau `llm:` haché, partagé par une /64, sans IP en clair | idem |
| UC-APP-01-U20 | `LlmRuntime` | Client HTTP injectable, `null` restaure cURL | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-01-F01 | Nominal | IHM | `<App/>` : collage, 3 journées, sauvegarde IndexedDB, rechargement, aucun texte sur le réseau | `web/test/usecases/functional/uc-app-01-constituer-portfolio.test.jsx` |
| UC-APP-01-F02 | A1 | IHM | Fichier `.md` lu localement, titre dérivé, `source` `fichier`, aucune requête | idem |
| UC-APP-01-F03 | A2 | IHM | `GET api/gdoc-text`, texte stocké localement, `source` `gdocs` | idem |
| UC-APP-01-F04 | Nominal (étape 6) | IHM | Date renommée, fusion, scission : état ajusté persisté | idem |
| UC-APP-01-F05 | A3 | IHM | Changement de portfolio : sauvegarde immédiate du courant | idem |
| UC-APP-01-F06 | A4 | IHM | Suppression en deux temps, base vidée | idem |
| UC-APP-01-F07 | A5 | IHM | Export `.md` à l'octet près, nom dérivé du titre | idem |
| UC-APP-01-F08 | E1 | IHM | IndexedDB absent : alerte, travail en mémoire, échec de sauvegarde signalé | idem |
| UC-APP-01-F09 | E2 | IHM | URL non reconnue : message, aucune requête | idem |
| UC-APP-01-F10 | E3 | IHM | 403 : message du serveur, texte conservé | idem |
| UC-APP-01-F11 | E4 | IHM | 429 : message de quota | idem |
| UC-APP-01-F12 | E5 | IHM | API absente : renvoi vers collage ou fichier | idem |
| UC-APP-01-F13 | E6 | IHM | Date invalide refusée, date d'origine persistée | idem |
| UC-APP-01-F14 | E7 | IHM | Scission sans curseur : message d'aide | idem |
| UC-APP-01-F15 | E8 | IHM | Fichier illisible : message, texte conservé | idem |
| UC-APP-01-F16 | A1 (anomalie A-01) | IHM | **Comportement actuel** : `.md` Windows → une seule journée | idem |
| UC-APP-01-F17 | A2 (anomalie A-02) | IHM | **Comportement actuel** : identifiant brut bloqué par le champ `type="url"` | idem |
| UC-APP-01-F18 | A2 | API | 200 `text/plain`, `no-store`, octets relayés, appel Google borné, aucune trace en base | `api/tests/UseCases/Functional/UcApp01ConstituerPortfolioTest.php` |
| UC-APP-01-F19 | A2 | API | Apprenant connecté ; démo désactivée : relais toujours disponible (RG8) | idem |
| UC-APP-01-F20 | A2 | API | 3 redirections Google suivies | idem |
| UC-APP-01-F21 | E3 (RG6) | API | Identifiant invalide → 422 sans appel à Google | idem |
| UC-APP-01-F22 | E3 | API | Google 401/403 → 403, 404 → 404, 500/429 → 502, messages français | idem |
| UC-APP-01-F23 | E3 | API | 413 (1 Mo), 504 (injoignable), 502 (redirection interdite, jamais contactée) | idem |
| UC-APP-01-F24 | E4 | API | 429 + `Retry-After: 30`, plus d'appel à Google ; autre IP non pénalisée | idem |
| UC-APP-01-F25 | RG1 | API | Aucune route ne reçoit de portfolio (404), rien en base | idem |

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

## Limites

- `web/src/lib/md.js` (mini-rendu Markdown) n'est **pas** sollicité par ce
  cas : le portfolio reste du texte brut (ADR-010) ; ce module sert aux
  contenus de formation, à la page de confidentialité et aux rapports Twin9.
- v1 texte uniquement (§4.2) : ni image, ni PDF, ni URL autre que Google Docs.
