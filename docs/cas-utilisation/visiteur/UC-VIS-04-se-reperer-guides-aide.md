# UC-VIS-04 — Se repérer : accueil, navigation, guides, aide, confidentialité

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) — le même parcours vaut pour tout utilisateur connecté |
| **Acteurs secondaires** | Administration (attribution des rôles, UC-ADM-01) ; tout rôle connecté (navigation additive) |
| **Portée** | humanome.xyz — `#/` (accueil), menu de navigation, bouton d'aide « ? », `#/guides[/<parcours>[/<chapitre>]]`, `#/confidentialite`, page introuvable ; API `GET /api/auth/me` (rôles de la session) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.1, §4.6 (formation publique en lecture, progression rattachée au compte), §6 (page confidentialité), §2 (rôles) |
| **Statut** | Implémenté (refonte navigation 2026-07, `docs/ergonomie-navigation.md` ; hub des guides ; P12 confidentialité) |

## Objectif

Permettre à quiconque arrive sur humanome.xyz de comprendre ce que fait le
site, de trouver l'entrée qui correspond à son **intention** (découvrir,
cartographier, encadrer, piloter, faire évoluer, administrer), d'obtenir
l'aide de la rubrique ouverte, de lire les guides de prise en main de chaque
profil et la politique de confidentialité — sans compte.

## Déclencheur

Le visiteur ouvre `https://humanome.xyz/` (ou toute adresse du site).

## Préconditions

Aucune. Le contenu des guides et de la page confidentialité est **embarqué au
build** (fichiers Markdown de `content/`) : il s'affiche aussi sur une copie
statique, sans API.

## Garanties en cas de succès

- Le visiteur voit la navigation « Découvrir » + « Compte » ; chaque rôle de
  travail d'un compte **ajoute** sa famille (navigation additive, jamais
  l'inverse ; promptologue et épistémiarque partagent « Faire évoluer »).
- Le **contenu** de l'aide, des guides et de la page confidentialité est
  embarqué au build et se lit sans API ; seule la session est sondée
  (`GET /api/auth/me` par le shell, puis une seconde fois par la vue Guides
  pour choisir progression locale ou progression du compte), et l'échec de
  cette sonde n'empêche pas la lecture. La progression d'un visiteur dans les
  guides reste dans son navigateur.
- Le thème choisi est mémorisé ; sans choix, le site suit le système.

## Garanties minimales (en cas d'échec)

- Toute adresse inconnue mène à « Page introuvable » avec un retour à
  l'accueil ; un guide ou un chapitre inconnu est signalé.
- Si la session ne peut pas être lue (API absente, 401, erreur), la
  navigation est celle d'un visiteur ; l'accès réel est garanti côté serveur
  et la plupart des vues relisent aussi la session (RG3).

## Scénario nominal

1. Le visiteur ouvre `#/`. L'application demande la session
   (`GET /api/auth/me`) ; sans session, la réponse `401` donne `roles = []`.
2. L'accueil présente le site (61 compétences en 7 pôles, prompts versionnés,
   garantie humaine), trois actions (« Explorer la cartographie de
   démonstration » → `#/merge`, « Essayer avec votre propre texte » →
   `#/essayer`, « Charger ma cartographie (JSON) », UC-VIS-01) et le **plan du
   site** « Explorer le site » : tuiles des familles « Découvrir » et « Compte ».
3. Le bouton « Menu de navigation » (ou le survol du bouton, ou le bord gauche
   de l'écran) ouvre le tiroir : famille « Découvrir » (Accueil, Cartographie
   (démonstration), Essayer — badge « gratuit », Référentiel, Guides) et
   « Compte » (Se connecter, Confidentialité). La rubrique courante porte
   `aria-current="page"`. Un clic sur un lien referme le tiroir (sauf s'il est
   épinglé par la punaise).
4. Le visiteur survole une entrée du plan du site : l'encart affiche l'aide de
   la rubrique (même contenu que « ? ») ; un premier clic la sélectionne
   (« Cliquez à nouveau… »), un second l'ouvre.
5. Sur n'importe quelle rubrique, « Aide sur cette rubrique » (« ? ») ouvre un
   dialogue modal (titre, introduction, points clés, lien vers les guides),
   fermé par ✕, Échap, un clic hors du panneau ou un changement de rubrique.

## Scénarios alternatifs

- **A1 — Compte connecté** (étape 1) : `GET /api/auth/me` renvoie
  `{user: {id, email, displayName, roles, hasAvatar}, csrfToken}` ; le plan du
  site devient « Vos espaces » (familles des rôles), le menu ajoute ces
  familles, l'identité (avatar ou initiales, lien « Mon profil ») et « Se
  déconnecter ». Un compte **sans aucun rôle** est en revanche traité en
  visiteur (anomalie AN2). Un rôle
  attribué par l'administration apparaît au prochain chargement de
  l'application (ou rafraîchissement de session, événement `humanome:auth`),
  sans reconnexion : le serveur relit les rôles à chaque appel. L'aide de l'accueil
  rappelle au cartographe ou à l'établissement où est son espace.
- **A2 — Explorer les profils** (étape 2) : « Voir les profils d'utilisateurs »
  révèle une barre de 8 profils (Visiteur, Apprenant, Employeur, Cartographe,
  Promptologue, Épistémiarque, Établissement, Administrateur) ; chacun des
  profils à compte montre les espaces qu'il verrait une fois connecté
  (« Aperçu du profil… ») ; l'employeur n'a pas de compte : une carte explique
  le lien de partage et présente l'offre de recherche de profils **à venir** —
  mais la note d'aperçu, identique aux autres profils, annonce ses espaces
  « une fois connecté » (anomalie AN3).
- **A3 — Aide contextuelle** (étape 5) : le contenu dépend de la route (une
  entrée par rubrique du menu ; repli « Aide » sinon) et du rôle.
- **A4 — Guides publics** : `#/guides` présente une carte par parcours (9),
  groupées par famille ; `#/guides/<parcours>` liste ses chapitres ; un
  chapitre est rendu depuis le Markdown embarqué (md.js puis DOMPurify), avec
  chapitre précédent/suivant et la case « Chapitre terminé ». Pour un
  visiteur, la progression est enregistrée **dans ce navigateur**
  (`localStorage` `humanome-training`, voir anomalie AN1) ; elle est migrée
  vers le compte quand, connecté, il rouvre la formation ou le guide de **ce**
  parcours (ou le tableau de bord, pour le parcours apprenant seulement —
  UC-CPT-05). `#/guides/noesiologie` affiche l'introduction du parcours
  apprenant (anomalie UC-CPT-05 AN4).
- **A5 — Thème** : le bouton soleil/lune bascule clair/sombre, pose
  `data-theme` sur `<html>` et mémorise le choix (`humanome-theme`) ; tant
  qu'aucun choix n'est fait, le site suit `prefers-color-scheme` et ses
  changements.
- **A6 — Confidentialité** : le lien du pied de page (ou « Compte →
  Confidentialité ») affiche `content/legal/confidentialite.md` rendu et
  assaini, sans requête.

## Scénarios d'erreur

- **E1 — Adresse inconnue** : « Page introuvable : #<fragment> » et « Retour à
  l'accueil » ; l'aide affiche l'entrée de repli.
- **E2 — Guide ou chapitre inconnu** : « Guide inconnu : « x ». » avec
  « Retour à tous les guides » ; « Chapitre introuvable : « x ». » avec
  « Retour à la liste des chapitres ».
- **E3 — Session illisible** (étape 1) : réponse `401`, compte purgé entre-temps
  ou API injoignable → navigation de visiteur. La purge d'un compte supprime
  ses sessions par la clé étrangère `ON DELETE CASCADE` (migration 002) ; une
  session **résiduelle** réécrite ensuite (requête concurrente, `user_id`
  NULL) est détruite par la route (`Session::destroy`).

## Règles de gestion

- **RG1** — Le plan du site est une source unique (`nav.js`) : menu et tuiles
  la lisent ; l'aide (`help/registry.js`) est indexée par nom de route,
  indépendamment, et les tuiles combinent les deux. Le niveau 1 nomme des
  **buts**, pas des rôles.
- **RG2** — Navigation additive : une famille apparaît si **au moins un** rôle
  de la famille est détenu ; un item `allRoles` exige **tous** ses rôles
  (Atelier Twin9 : admin ∧ promptologue).
- **RG3** — La navigation n'est qu'un confort : l'accès est garanti côté
  serveur (garde de rôle des routes API) ; la plupart des vues relisent aussi
  la session (ex. `#/cartographe` : « Cet espace de travail est réservé aux
  cartographes. »), `#/twin9-atelier` réutilise les rôles du shell.
- **RG4** — Contenus embarqués au build, rendus via md.js + DOMPurify (ADR-007),
  sans requête réseau possible.
- **RG5** — Un choix de thème explicite prime sur le système.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Rôles de la session | Lus à chaque montage/changement de session, jamais stockés côté client |
| Progression des guides (visiteur) | `localStorage` du navigateur uniquement |
| Thème, épinglage du menu | `localStorage` (préférences d'affichage) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash`, `guidesHash` | Accueil, guides, confidentialité, introuvable |
| Front | `web/src/App.jsx` ; `web/src/main.jsx` (point d'entrée : rendu de `<App/>` seulement) | Shell : session, menu (tiroir, épinglage), aide, thème, page introuvable |
| Front | `web/src/api/client.js` — `fetchMe`, `apiFetch` | Sonde de session : `401` → visiteur, autre erreur → `ApiError`, réseau/`file://` → `ApiUnavailableError` (étape 1, E3) |
| Front | `web/index.html` (script anti-FOUC) | Thème mémorisé appliqué avant le premier affichage (A5, RG5) |
| Front | `web/src/nav.js` — `FAMILIES`, `navGroups`, `isCurrentItem` | Plan du site par familles (RG1, RG2) |
| Front | `web/src/views/HomeView.jsx`, `web/src/components/FamilyTiles.jsx` — `PERSONAS` | Accueil, tuiles, profils, encart d'aide |
| Front | `web/src/help/Help.jsx`, `web/src/help/registry.js` — `helpFor` | Aide contextuelle |
| Front | `web/src/lib/theme.js` — `storedTheme`, `resolvedTheme`, `applyTheme`, `subscribeSystemTheme` | Thème (RG5) |
| Front | `web/src/views/GuidesView.jsx`, `web/src/views/espace/FormationSection.jsx`, `web/src/views/espace/formation-content.js` — `listChapters`, `getChapter`, `rewriteChapterLink`, `guidesBaseHash` | Guides publics |
| Front | `web/src/lib/training-store.js` — `createTrainingStore` | Progression locale |
| Front | `web/src/views/ConfidentialiteView.jsx`, `web/src/lib/md.js` — `renderMarkdown` ; `web/src/lib/narrative.js` — `renderNarrativeHtml` | Page confidentialité, chapitres ; assainissement DOMPurify (RG4, ADR-007) |
| Front | `web/src/views/CartographeView.jsx` | Exemple de garde de vue pour un visiteur (RG3) |
| API | `GET /api/auth/me` — `api/src/routes/auth.php` | Rôles de la session |
| Domaine | `api/src/Auth/Session.php` — `exists`, `start`, `userId`, `destroy` | Session lue, session résiduelle détruite (E3) |
| Domaine | `api/src/Auth/Users.php` — `rolesOf`, `assignRole`, `purge` | Rôles d'un compte, purge |
| Base | `scripts/migrations/002_sessions_rate_limits.sql` | Cascade `sessions` → `users` (E3) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-VIS-04-U01 | `Users::rolesOf` | Rôles triés, source de la navigation | `api/tests/UseCases/Unit/UcVis04SeRepererTest.php` |
| UC-VIS-04-U02 | `Users::rolesOf`, `assignRole` | Aucun rôle → navigation visiteur ; rôle inconnu refusé | idem |
| UC-VIS-04-U03 | `parseHash`, `guidesHash` | Routes de repérage, introuvable | `web/test/usecases/unit/uc-vis-04-se-reperer-guides-aide.test.js` |
| UC-VIS-04-U04 | `navGroups`, `isCurrentItem`, `FAMILIES` | Familles du visiteur, additivité, conjonction, page courante (RG2) | idem |
| UC-VIS-04-U05 | `helpFor`, `navGroups` | Une entrée d'aide pour chaque rubrique du menu (tous rôles), repli, astuces cartographe / établissement et priorité cartographe | idem |
| UC-VIS-04-U06 | `PERSONAS` | Profils explorables, employeur sans compte | idem |
| UC-VIS-04-U07 | `theme.js` | Suivi du système, choix explicite persistant qui prime (RG5) | idem |
| UC-VIS-04-U08 | `formation-content.js` | Parcours, chapitres ordonnés et titrés, liens réécrits, parcours inconnu | idem |
| UC-VIS-04-U09 | `createTrainingStore` — `setChapter` | Visiteur : progression locale, aucun appel serveur ; connecté : `PUT` serveur | idem |
| UC-VIS-04-U10 | `createTrainingStore` | **Comportement actuel figé** — anomalie AN1 | idem |
| UC-VIS-04-U11 | `renderMarkdown` | Page légale : titres, liens de l'app, rien d'exécutable (RG4) | idem |
| UC-VIS-04-U12 | `fetchMe` | `401` → `{user: null}` ; `500` → `ApiError` ; réseau et `file://` → `ApiUnavailableError` (étape 1, E3) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-04-F01 | Nominal (1) | API | Sans session : `401`, aucune session créée | `api/tests/UseCases/Functional/UcVis04SeRepererTest.php` |
| UC-VIS-04-F02 | A1 | API | Compte multi-rôles : rôles triés, identité minimale, jeton CSRF | idem |
| UC-VIS-04-F03 | A1 | API | Rôle attribué → visible au rafraîchissement suivant | idem |
| UC-VIS-04-F04 | E3 | API | Compte purgé → sa ligne `sessions` supprimée par cascade, `401` | idem |
| UC-VIS-04-F05 | Nominal (2-3) | IHM | Accueil, trois actions, tuiles, menu visiteur, `aria-current`, fermeture du tiroir au clic, pied de page, aucune requête hors session (session injectée) | `web/test/usecases/functional/uc-vis-04-se-reperer-guides-aide.test.jsx` |
| UC-VIS-04-F06 | A1, A3 | IHM | « Vos espaces », familles des rôles, « Mon profil » (initiales), déconnexion, astuce de l'aide | idem |
| UC-VIS-04-F07 | Nominal (4), A2, anomalie AN3 | IHM | Profils, aide au survol, 1er clic sélectionne / 2e ouvre, carte employeur, offre « à venir » ; note d'aperçu de l'employeur (**comportement actuel figé**) | idem |
| UC-VIS-04-F08 | Nominal (5), A3 | IHM | Dialogue d'aide, focus, Échap, fermeture au changement de rubrique | idem |
| UC-VIS-04-F09 | A4 | IHM | Hub → parcours → chapitre, navigation, progression locale ; seule requête : la sonde de session propre à GuidesView | idem |
| UC-VIS-04-F10 | E2 | IHM | Guide / chapitre inconnus | idem |
| UC-VIS-04-F11 | Anomalie AN1 | IHM | **Comportement actuel figé** — progression d'un guide perdue | idem |
| UC-VIS-04-F12 | A5 | IHM | Suivi du système puis choix explicite qui prime | idem |
| UC-VIS-04-F13 | A6 | IHM | Page confidentialité sans requête, liens internes conservés | idem |
| UC-VIS-04-F14 | E1 | IHM | Page introuvable, aide de repli | idem |
| UC-VIS-04-F15 | E3 | API | Session résiduelle d'un compte purgé (`user_id` NULL, données encore liées) → `401` et session détruite par la route | `api/tests/UseCases/Functional/UcVis04SeRepererTest.php` |
| UC-VIS-04-F16 | Nominal (1), E3 | IHM | Shell réel : `GET api/auth/me` → `401` → navigation de visiteur ; API injoignable → idem (branche `catch`) | `web/test/usecases/functional/uc-vis-04-se-reperer-guides-aide.test.jsx` |
| UC-VIS-04-F17 | A1 | IHM | Rôle ajouté → famille « Faire évoluer » après l'événement `humanome:auth`, sans recharger | idem |
| UC-VIS-04-F18 | RG3 | IHM | Visiteur sur `#/cartographe` → « Cet espace de travail est réservé aux cartographes. », aucune donnée demandée | idem |
| UC-VIS-04-F19 | Anomalie AN2 | IHM | **Comportement actuel figé** — session d'un compte sans rôle → navigation de visiteur, pas de « Se déconnecter » | idem |

### Tests existants liés (non-régression)

- `web/src/App.test.jsx` — menu (survol, bord gauche, épinglage, Échap), thème, déconnexion, route introuvable.
- `web/src/nav.test.js`, `web/src/help/registry.test.js`, `web/src/help/Help.test.jsx`, `web/src/lib/theme.test.js`, `web/src/anti-fouc.test.js`.
- `web/src/components/FamilyTiles.test.jsx`, `web/src/views/HomeView.test.jsx`, `web/src/views/GuidesView.test.jsx`, `web/src/views/ConfidentialiteView.test.jsx`, `web/src/lib/training-store.test.js`, `web/src/lib/md.test.js`.
- `api/tests/AuthRoutesTest.php` (`/auth/me`), `web/e2e/guides-public.e2e.js`, `web/e2e/navigation-burger.e2e.js`.

### Exécuter

```sh
docker compose run --rm -e DB_TEST_NAME=humanome_test_vis php vendor/bin/phpunit --filter UcVis04 --testdox
cd web && npx vitest run test/usecases/unit/uc-vis-04 test/usecases/functional/uc-vis-04
```

## Anomalies constatées

- **AN1 — Progression locale des guides écrasée d'un parcours à l'autre.**
  Même défaut que [UC-CPT-05](../compte/UC-CPT-05-suivre-progression-formation.md)
  AN1. `createTrainingStore` (`web/src/lib/training-store.js`, `writeLocal`)
  réécrit la clé `humanome-training` avec **le seul parcours courant**
  (`{[parcours]: {chapitresTermines}}`). Un visiteur qui coche un chapitre du
  guide « employeur » perd les chapitres cochés du guide « visiteur » (et
  inversement). Seconde moitié du défaut : `migrateLocalToServer` ne migre que
  le parcours courant puis `clearLocal()` supprime la clé **entière** ; un
  correctif limité à `writeLocal` déplacerait donc la perte au moment de la
  migration. Correctif attendu : fusionner dans `writeLocal` **et** ne retirer
  que l'entrée migrée. Comportement actuel figé par UC-VIS-04-U10 et F11.
- **AN2 — Compte sans rôle traité en visiteur.** Le shell dérive
  `authenticated` de `roles.length > 0` (`web/src/App.jsx`) : une session
  valide d'un compte qui n'a plus aucun rôle (le retrait du dernier rôle par
  `DELETE /api/admin/users/{id}/roles/{role}` n'est pas refusé,
  `UserDirectory::revoke`) voit « Compte → Se connecter », sans identité ni
  « Se déconnecter », et l'accueil « Explorer le site » avec la barre des
  profils. Correctif attendu (hors lot) : dériver `authenticated` de la
  présence d'un utilisateur de session. Comportement actuel figé par
  UC-VIS-04-F19.
- **AN3 — Note d'aperçu trompeuse pour le profil Employeur.** Dans la barre
  des profils (`web/src/components/FamilyTiles.jsx`), la note
  « Aperçu du profil Employeur : voici les espaces que ce rôle voit une fois
  connecté… » s'affiche comme pour les autres profils, alors que la carte
  juste en dessous indique « Sans compte — sur invitation ». Comportement
  actuel figé par UC-VIS-04-F07.
