# UC-APP-03 — Consulter ses cartographies

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (fonctionne aussi sans session) |
| **Acteurs secondaires** | — |
| **Portée** | humanome.xyz — tableau de bord `#/espace`, visionneuse en lecture seule ; API `GET /api/cartographies*` pour les copies serveur |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (visualiser sa cartographie sous forme de graphe évolutif), §4.4 (visualisation : vue journée, vue chronologique), §6.1 (stockage local par défaut) |
| **Décisions** | ADR-001 (client-first), ADR-009 (routage par hash) |
| **Statut** | Implémenté (P8 ; type Twin9 D12) |

## Objectif

Permettre à l'apprenant de retrouver, dans son navigateur, toutes les
cartographies qu'il a produites (journées, fusion chronologique, analyses
Twin9), d'en voir l'état (type, date, confidentialité, copie serveur) et de
les **visualiser** en sunburst, sans qu'aucun document ne quitte le
navigateur pour cela.

L'opt-in serveur, le réglage de confidentialité et la suppression sont
traités par UC-APP-04 ; le partage par UC-APP-05 ; l'archive par UC-APP-06.

## Déclencheur

L'apprenant ouvre `#/espace` (menu « Ma cartographie → Tableau de bord »,
famille réservée aux comptes ayant le rôle `apprenant`), ou y revient depuis
l'assistant de cartographie (« Retour à l'espace apprenant », UC-APP-02). Un
visiteur sans session atteint `#/espace` par URL directe ou par les liens de
la page Confidentialité.

## Préconditions

- Des cartographies ont été enregistrées localement (run UC-APP-02, import
  d'archive UC-APP-06, analyse Twin9 UC-APP-10) — sinon le tableau de bord
  invite à en produire.
- Aucune session n'est exigée.

## Garanties en cas de succès

- La liste reflète exactement le carto-store local (IndexedDB
  `humanome-cartographies`), de la plus récemment modifiée à la plus ancienne.
- La visualisation est en **lecture seule** ; le document affiché est celui
  du stockage local, sans appel réseau pour le document. Sont demandés : la
  session, la progression de formation si l'apprenant est connecté
  (`GET api/training/progress`, et `PUT` pour migrer une progression
  locale) et le référentiel publié — tant que l'on reste dans la
  visionneuse (voir l'anomalie A-02).

## Garanties minimales (en cas d'échec)

- Un stockage local illisible est signalé ; rien n'est effacé.
- Une entrée sans document ne peut être ni ouverte ni téléchargée.

## Scénario nominal

1. L'apprenant ouvre `#/espace`. La vue vérifie la session
   (`GET api/auth/me`) et affiche « Connecté en tant que <nom>. ».
2. Le tableau de bord présente quatre blocs : « Mes portfolios » (portfolios
   locaux avec nombre de journées, date de modification et lien
   « Cartographier ces écrits »), « Mes cartographies » (panneau chargé à la
   demande), « Mes cohortes » et « Ma formation » (progression).
3. Le panneau lit le carto-store local et liste chaque cartographie : titre,
   type (« Journée », « Parcours (merge) », « Analyse Twin9 »), date de
   dernière modification (JJ/MM/AAAA), badge « copie serveur » si un
   `serverId` est enregistré localement (RG1 ; non revérifié côté serveur),
   confidentialité courante (« Privée », « Partagée avec mon cartographe »,
   « Publique (partageable) »).
4. Il clique « Voir » sur la fusion : la visionneuse remplace le tableau de
   bord, charge le référentiel publié (repli sur la copie embarquée) et rend
   la **vue chronologique** (sunburst cumulé, frise, calendrier) sous le
   titre de la cartographie.
5. « ← Retour au tableau de bord » restaure les quatre blocs.

## Scénarios alternatifs

- **A1 — Sans session ou copie statique** (étape 1) : bandeau « Vous n'êtes
  pas connecté : tout fonctionne en local… » (401) ou « Copie statique du
  site… » (API injoignable) ; la liste et la visionneuse fonctionnent à
  l'identique (référentiel embarqué si nécessaire).
- **A2 — Voir une journée** (étape 4) : vue de la journée (sunburst du jour,
  « Journée du JJ/MM/AAAA »).
- **A3 — Voir une analyse Twin9** (étape 4) : le document Twin9 natif est
  projeté vers la vue chronologique par l'adaptateur du moteur ; sans journée
  datée, un message l'explique.
- **A4 — Télécharger le JSON** (étape 3) : télécharge le document seul,
  indenté, nommé `cartographie-<type>-<date>.json` (date du jour, sinon
  dernière date de la période, sinon date de modification).
- **A5 — Consulter ses copies serveur par l'API** (hors espace apprenant :
  API, ou Rétrospective de l'atelier promptologue pour un compte qui cumule
  les deux rôles, UC-PRO-06) :
  `GET /api/cartographies` renvoie les métadonnées de ses copies
  (`id, type, titre, visibility, createdAt, updatedAt, hasDocument, shares`),
  jamais les documents ; `GET /api/cartographies/{id}` renvoie la copie
  complète (document, versions liées, `runMeta`, `optInAt`, nombre de liens
  actifs). Aucune copie → liste vide.

## Scénarios d'erreur

- **E1 — Stockage local indisponible** (étape 3) : « Stockage local
  indisponible (…) : la liste des cartographies ne peut pas être lue. » et
  message équivalent dans « Mes portfolios ».
- **E2 — Rien encore** (étape 3) : « Aucune cartographie pour l'instant.
  Lancez une cartographie depuis votre portfolio pour la retrouver ici. » ;
  « Mes portfolios » propose « Créer un portfolio » (`#/portfolio`) et
  « Cartographier mes écrits » (`#/espace/nouveau-run`).
- **E3 — Entrée sans document** (étape 3) : « Voir » et « Télécharger le
  JSON » sont inactifs.
- **E4 — Accès API refusé** (A5) : sans session `401` ; compte sans rôle
  `apprenant` `403` ; copie d'un autre compte ou inexistante : **même** `404`
  (aucun oracle d'existence).
- **E5 — Section inconnue** (étape 1) : `#/espace/<autre>`, dont le segment,
  décodé par `parseHash`, n'est ni `formation[/<chapitre>]`, ni `nouveau-run`,
  ni `cohortes` (comparaison exacte : `#/espace/cohortes/3` → « cohortes/3 »).
  `EspaceView` affiche l'alerte « Section inconnue de l'espace apprenant :
  « cohortes/3 ». » et le lien « Retour à l'accueil de l'espace »
  (`#/espace`). Aucun bloc du tableau de bord n'est monté : aucune base
  IndexedDB ouverte, aucune requête hors de la sonde de session
  (`GET api/auth/me`). L'espace n'ayant pas de garde de rôle, le même repli
  s'affiche sous le bandeau de session, que l'apprenant soit connecté ou non
  (A1). Un segment au pourcentage mal formé (`#/espace/100%`) n'atteint pas ce
  repli : `parseHash` lève une `URIError` avant tout rendu (anomalie AN1 de
  UC-VIS-02, commune aux routes à section).

## Règles de gestion

- **RG1** — Consultation 100 % locale : le tableau de bord ne lit jamais les
  copies serveur ; l'état « copie serveur » vient du `serverId` enregistré
  localement lors de l'opt-in (UC-APP-04).
- **RG2** — Tri par date de modification décroissante (`updatedAt`) ; la date
  affichée est celle de la dernière modification locale.
- **RG3** — Type inconnu normalisé en `jour`, visibilité inconnue en
  `privee` (valeurs sûres) ; visibilités admises : `privee`, `cartographe`,
  `publique`.
- **RG4** — API : rôle `apprenant`, propriétaire uniquement ; la liste ne
  porte **jamais** le document ; `shares` ne compte que les liens actifs (ni
  révoqués ni expirés).
- **RG5** — La visionneuse choisit la vue par type : `merge` → vue
  chronologique, `twin9` → projection puis vue chronologique, sinon vue du
  jour.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Cartographies | IndexedDB `humanome-cartographies` ; affichées sans transfert réseau |
| Copies serveur | Lues par l'API seulement par leur propriétaire ; liste sans document |
| Référentiel | Fichier statique publié (`data/referentiel/`) ou copie embarquée |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/espace` et ses sections (segment décodé par `decodeURIComponent`, E5) |
| Front | `web/src/api/client.js` — `fetchMe`, `ApiUnavailableError` | Session : utilisateur, 401 anonyme, API absente (bandeaux A1) |
| Front | `web/src/views/EspaceView.jsx` | Session, bandeaux, dispatch, repli « section inconnue » (E5) |
| Front | `web/src/views/espace/DashboardSection.jsx` | Quatre blocs, ouverture de la visionneuse |
| Front | `web/src/lib/portfolio-store.js`, `web/src/lib/training-store.js` | Bloc « Mes portfolios » (message E1) ; bloc « Ma formation » (`GET api/training/progress` si connecté) |
| Front | `web/src/views/espace/cartographies-panel-bridge.js`, `carto-store-bridge.js` | Chargement paresseux du panneau et du carto-store |
| Front | `web/src/views/espace/CartographiesPanel.jsx` | Liste, libellés, badge, « Voir », « Télécharger le JSON » |
| Front | `web/src/lib/carto-store.js` — `createCartoStore`, `createIndexedDbAdapter`, singleton | Lecture locale, base `humanome-cartographies` |
| Front | `web/src/lib/archive.js` — `downloadJson` | Téléchargement d'un document |
| Front | `web/src/views/espace/CartographyViewer.jsx`, `web/src/views/DayView.jsx`, `MergeView.jsx` ; `web/src/data/referentiel.js` | Visualisation en lecture seule, référentiel publié ou embarqué |
| Moteur | `engine/src/twin9/mapper.js` — `twin9ToMergeDocument` | Projection d'une analyse Twin9 vers la vue chronologique (A3, RG5 ; couvert aussi par les tests UC-APP-10) |
| API | `GET /api/cartographies`, `GET /api/cartographies/{id}` — `api/src/routes/cartographies.php` | Consultation des copies serveur |
| API | `api/src/Middleware/RequireRole.php` — `any('apprenant')` | 401 sans session, 403 sans rôle `apprenant` (E4) |
| Domaine | `api/src/Cartographies/CartographyRepository.php` — `listForUser`, `findForUser` | Projection sans document, portée propriétaire |
| Domaine | `CartographyRepository` — `ownedBy`, `resolvePromptVersion` | Utilisés par UC-APP-04 et UC-APP-05, non par la consultation ; testés ici en appoint par U09 |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-03-U01 | `parseHash` | `#/espace` → section nulle ; sous-sections | `web/test/usecases/unit/uc-app-03-consulter-ses-cartographies.test.jsx` |
| UC-APP-03-U02 | Ponts `carto-store-bridge`, `cartographies-panel-bridge` | Modules présents, chargés à la demande, contrat de fonctions | idem |
| UC-APP-03-U03 | `createIndexedDbAdapter`, `createCartoStore` | Base `humanome-cartographies`, tri, relecture après rechargement ; type et visibilité inconnus normalisés (RG3) | idem |
| UC-APP-03-U04 | Singleton du carto-store | Singleton (assistant RunWizard, résultats Twin9) : même base IndexedDB que l'instance propre du panneau | idem |
| UC-APP-03-U05 | `createCartoStore` | IndexedDB absent → message français (E1) | idem |
| UC-APP-03-U06 | `downloadJson` | Document seul, JSON indenté, nom fourni (A4) | idem |
| UC-APP-03-U07 | `CartographyViewer` | Chargement du référentiel, fusion → vue chronologique, journée → vue du jour, retour | idem |
| UC-APP-03-U08 | `CartographyRepository::listForUser` | Métadonnées seules, tri par `updated_at` (discriminant face à l'ordre des id), liens actifs comptés (RG4) | `api/tests/UseCases/Unit/UcApp03ConsulterSesCartographiesTest.php` |
| UC-APP-03-U09 | `findForUser`, `ownedBy`, `resolvePromptVersion` | Propriétaire seul, versions résolues, `runMeta`, `optInAt` ; `shares` = liens actifs seulement (un actif, un révoqué, un expiré → 1) | idem |
| UC-APP-03-U10 | `CartographiesPanel` (store mémoire) | Libellés de type et de confidentialité, badge, noms de fichier : date du document, dernière date de période, date de modification (A4) | `web/test/usecases/unit/uc-app-03-consulter-ses-cartographies.test.jsx` |
| UC-APP-03-U11 | `EspaceView` (`deps.fetchMeFn`) | Utilisateur → connecté ; `{user: null}` → anonyme ; `ApiUnavailableError` → copie statique ; autre erreur → anonyme (A1) | idem |
| UC-APP-03-U12 | `loadPublishedReferentiel` | Fichier statique publié (`origin: published`), cache de module, repli embarqué hors ligne | idem |
| UC-APP-03-U13 | `parseHash`, `EspaceView` (vue isolée, `deps`) | Segment décodé, sous-chemin compris ; hors des sections, comparaison exacte (`cohortes/3`, `formations`, `nouveau-run/`, casse) → alerte « Section inconnue de l'espace apprenant : « … ». », lien `#/espace`, aucun bloc ; stores, panneau, référentiel et `fetchFn` jamais sollicités, IndexedDB jamais ouvert ; même repli connecté ou non (A1, E5) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-03-F01 | Nominal | IHM | `<App/>` : blocs, liste triée, libellés, badge, « Voir » la fusion (feuilles de merge3 au calendrier, secteurs), référentiel publié chargé, retour, aucune requête `cartographies` | `web/test/usecases/functional/uc-app-03-consulter-ses-cartographies.test.jsx` |
| UC-APP-03-F02 | A1 | IHM | Sans session : bandeau, liste et visionneuse identiques | idem |
| UC-APP-03-F03 | A1 | IHM | Hors ligne : bandeau copie statique, référentiel publié tenté puis embarqué | idem |
| UC-APP-03-F04 | A2 (anomalie A-02) | IHM | Vue du jour « Journée du 05/01/2026 » ; **comportement actuel** : lien « ← Retour à la cartographie » vers `#/merge` | idem |
| UC-APP-03-F05 | A3 | IHM | Twin9 : libellé « Analyse Twin9 », projection (feuille datée de l'attestation, secteurs de compétence) | idem |
| UC-APP-03-F06 | A4 | IHM | Téléchargement `cartographie-merge-2026-01-07.json`, contenu = document | idem |
| UC-APP-03-F07 | E1 | IHM | IndexedDB absent : deux alertes (portfolios, cartographies) | idem |
| UC-APP-03-F08 | E2 | IHM | État vide : invitations et liens | idem |
| UC-APP-03-F09 | E3 | IHM | Entrée sans document : boutons inactifs | idem |
| UC-APP-03-F10 | A5 | API | Liste sans document, tri par date de modification (discriminant), `shares` ; lecture complète | `api/tests/UseCases/Functional/UcApp03ConsulterSesCartographiesTest.php` |
| UC-APP-03-F11 | A5 | API | Aucune copie → liste vide | idem |
| UC-APP-03-F12 | E4 | API | 401 / 403 (liste et copie) / même 404 pour autrui et inexistant | idem |
| UC-APP-03-F13 | A-02 | IHM | **Comportement actuel** : clic sur un jour du calendrier de la visionneuse → `#/jour/2026-01-06`, `data/demo/jours/2026-01-06.json` demandé | `web/test/usecases/functional/uc-app-03-consulter-ses-cartographies.test.jsx` |
| UC-APP-03-F14 | A3 | IHM | Twin9 sans journée datée : message explicatif, JSON téléchargeable | idem |
| UC-APP-03-F15 | E5 | IHM | `<App/>` sur `#/espace/cohortes/3` : alerte « Section inconnue de l'espace apprenant : « cohortes/3 ». », lien de retour, aucun bloc, aucune ouverture IndexedDB, seul `api/auth/me` demandé ; le retour rouvre le tableau de bord (qui lit IndexedDB) ; visiteur : même alerte sous le bandeau « pas connecté » ; `<App/>` sur `#/espace/100%` : le rendu lève une `URIError`, rien n'est affiché, ni sonde de session ni requête (comportement actuel, UC-VIS-02 AN1) | idem |

### Tests existants liés (non-régression)

- `web/src/views/EspaceView.test.jsx` — blocs, bandeaux, « Voir » (panneau factice), section inconnue (« section inconnue : message et lien de retour », vue isolée, E5).
- `web/src/views/espace/CartographiesPanel.test.jsx` — liste, badge, « Voir », téléchargement (store mémoire).
- `web/src/views/espace/CartographyViewer.test.jsx` — type Twin9.
- `web/src/lib/carto-store.test.js` — CRUD sur l'adaptateur mémoire.
- `web/src/data/referentiel.test.js` — référentiel publié, cache, repli embarqué.
- `api/tests/CartographiesTest.php` — routes cartographies (création, liste, lecture, portée).
- `web/e2e/parcours-apprenant.e2e.js` — étapes « tableau de bord » et « visualisation ».

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcApp03 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-APP-03
```

## Anomalies constatées

- **A-01 — Copies serveur introuvables depuis un autre appareil.** Le texte
  d'opt-in (UC-APP-04) annonce que la copie serveur permet de « le retrouver
  depuis un autre appareil », mais aucune vue de l'**espace apprenant**
  n'appelle `GET /api/cartographies` : sur un nouveau navigateur, le tableau
  de bord est vide et l'archive (UC-APP-06), construite depuis le stockage
  local, n'embarque pas non plus ces copies. Hors API (A5), seule la
  Rétrospective de l'atelier promptologue (UC-PRO-06) les liste et les
  ouvre, et seulement pour un compte qui cumule les rôles apprenant et
  promptologue.
- **A-02 — La visionneuse renvoie vers la démonstration.** La visionneuse
  réutilise `MergeView` et `DayView` sans neutraliser leurs liens internes :
  (1) le calendrier de la vue chronologique (fusion ou Twin9 projetée) est
  rendu sans `onPickDay`, donc un clic sur un jour (« cliquez sur un jour
  pour ouvrir sa cartographie ») exécute `navigate('#/jour/<iso>')` ; les
  liens narratifs `#/jour/…` réécrits dans le panneau de détails font de
  même. `App` affiche alors `DayView` avec `loadDay(iso)`, qui télécharge
  `data/demo/jours/<iso>.json` : la journée du **journal de démonstration**
  (les 06 et 07/01/2026 existent) à la place de celle de l'apprenant ;
  (2) dans la vue du jour (A2), le lien « ← Retour à la cartographie »
  (`href="#/merge"`) ouvre l'interface de démonstration (`App` sans
  `userMerge`). L'apprenant sort de l'espace sans que rien ne le signale.
  Figé par F13 (calendrier) et F04 (lien de retour). Correctif suggéré :
  passer un `onPickDay` local à `HeatmapCalendar`, désactiver ou réécrire
  les liens de navigation des vues quand elles sont rendues par la
  visionneuse.

## Limites

- La date affichée est celle de la dernière modification locale (`updatedAt`)
  — un changement de confidentialité la modifie — et non la date du run.
- Le badge « copie serveur » suit seulement le `serverId` enregistré
  localement, jamais revérifié : une copie supprimée depuis un autre
  appareil (ou par la suppression du compte) garde son badge.
