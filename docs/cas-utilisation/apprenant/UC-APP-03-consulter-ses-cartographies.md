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

L'apprenant ouvre `#/espace` (menu « Ma cartographie → Tableau de bord »), ou
y revient depuis l'assistant de cartographie (« Retour à l'espace
apprenant », UC-APP-02).

## Préconditions

- Des cartographies ont été enregistrées localement (run UC-APP-02, import
  d'archive UC-APP-06, analyse Twin9 UC-APP-10) — sinon le tableau de bord
  invite à en produire.
- Aucune session n'est exigée.

## Garanties en cas de succès

- La liste reflète exactement le carto-store local (IndexedDB
  `humanome-cartographies`), de la plus récemment modifiée à la plus ancienne.
- La visualisation est en **lecture seule** ; le document affiché est celui
  du stockage local, sans appel réseau (seuls la session et le référentiel
  publié sont demandés).

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
   dernière modification (JJ/MM/AAAA), badge « copie serveur » si une copie
   serveur existe, confidentialité courante (« Privée », « Partagée avec mon
   cartographe », « Publique (partageable) »).
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
- **A5 — Consulter ses copies serveur par l'API** (hors IHM, autre appareil) :
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
| Front | `web/src/router.js` — `parseHash` | Route `#/espace` et ses sections |
| Front | `web/src/views/EspaceView.jsx` | Session, bandeaux, dispatch |
| Front | `web/src/views/espace/DashboardSection.jsx` | Quatre blocs, ouverture de la visionneuse |
| Front | `web/src/views/espace/cartographies-panel-bridge.js`, `carto-store-bridge.js` | Chargement paresseux du panneau et du carto-store |
| Front | `web/src/views/espace/CartographiesPanel.jsx` | Liste, libellés, badge, « Voir », « Télécharger le JSON » |
| Front | `web/src/lib/carto-store.js` — `createCartoStore`, `createIndexedDbAdapter`, singleton | Lecture locale, base `humanome-cartographies` |
| Front | `web/src/lib/archive.js` — `downloadJson` | Téléchargement d'un document |
| Front | `web/src/views/espace/CartographyViewer.jsx`, `web/src/views/DayView.jsx`, `MergeView.jsx` ; `web/src/data/referentiel.js` | Visualisation en lecture seule, référentiel publié ou embarqué |
| API | `GET /api/cartographies`, `GET /api/cartographies/{id}` — `api/src/routes/cartographies.php` | Consultation des copies serveur |
| Domaine | `api/src/Cartographies/CartographyRepository.php` — `listForUser`, `findForUser`, `ownedBy`, `resolvePromptVersion` | Projection sans document, portée propriétaire |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-03-U01 | `parseHash` | `#/espace` → section nulle ; sous-sections | `web/test/usecases/unit/uc-app-03-consulter-ses-cartographies.test.jsx` |
| UC-APP-03-U02 | Ponts `carto-store-bridge`, `cartographies-panel-bridge` | Modules présents, chargés à la demande, contrat de fonctions | idem |
| UC-APP-03-U03 | `createIndexedDbAdapter`, `createCartoStore` | Base `humanome-cartographies`, tri, relecture après rechargement | idem |
| UC-APP-03-U04 | Singleton du carto-store | Même base IndexedDB que l'assistant et le panneau | idem |
| UC-APP-03-U05 | `createCartoStore` | IndexedDB absent → message français (E1) | idem |
| UC-APP-03-U06 | `downloadJson` | Document seul, JSON indenté, nom fourni (A4) | idem |
| UC-APP-03-U07 | `CartographyViewer` | Chargement du référentiel, fusion → vue chronologique, journée → vue du jour, retour | idem |
| UC-APP-03-U08 | `CartographyRepository::listForUser` | Métadonnées seules, tri, liens actifs comptés (RG4) | `api/tests/UseCases/Unit/UcApp03ConsulterSesCartographiesTest.php` |
| UC-APP-03-U09 | `findForUser`, `ownedBy`, `resolvePromptVersion` | Propriétaire seul, versions résolues, `runMeta`, `optInAt` | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-03-F01 | Nominal | IHM | `<App/>` : blocs, liste triée, libellés, badge, « Voir » la fusion, retour, aucune requête `cartographies` | `web/test/usecases/functional/uc-app-03-consulter-ses-cartographies.test.jsx` |
| UC-APP-03-F02 | A1 | IHM | Sans session : bandeau, consultation identique | idem |
| UC-APP-03-F03 | A1 | IHM | Hors ligne : bandeau copie statique, visionneuse sur référentiel embarqué | idem |
| UC-APP-03-F04 | A2 | IHM | Vue du jour « Journée du 05/01/2026 » | idem |
| UC-APP-03-F05 | A3 | IHM | Twin9 : libellé « Analyse Twin9 », projection chronologique | idem |
| UC-APP-03-F06 | A4 | IHM | Téléchargement `cartographie-merge-2026-01-07.json`, contenu = document | idem |
| UC-APP-03-F07 | E1 | IHM | IndexedDB absent : deux alertes (portfolios, cartographies) | idem |
| UC-APP-03-F08 | E2 | IHM | État vide : invitations et liens | idem |
| UC-APP-03-F09 | E3 | IHM | Entrée sans document : boutons inactifs | idem |
| UC-APP-03-F10 | A5 | API | Liste sans document, tri, `shares` ; lecture complète | `api/tests/UseCases/Functional/UcApp03ConsulterSesCartographiesTest.php` |
| UC-APP-03-F11 | A5 | API | Aucune copie → liste vide | idem |
| UC-APP-03-F12 | E4 | API | 401 / 403 / même 404 pour autrui et inexistant | idem |

### Tests existants liés (non-régression)

- `web/src/views/EspaceView.test.jsx` — blocs, bandeaux, « Voir » (panneau factice).
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
  depuis un autre appareil », mais aucune vue de l'apprenant n'appelle
  `GET /api/cartographies` : sur un nouveau navigateur, le tableau de bord
  est vide et l'archive (UC-APP-06), construite depuis le stockage local,
  n'embarque pas non plus ces copies. Seule l'API (A5) y donne accès.

## Limites

- La date affichée est celle de la dernière modification locale (`updatedAt`)
  — un changement de confidentialité la modifie — et non la date du run.
