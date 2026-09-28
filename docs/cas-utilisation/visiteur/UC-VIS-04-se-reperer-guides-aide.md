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

- Le visiteur voit la navigation « Découvrir » + « Compte » ; un compte voit en
  plus **une famille par rôle** (navigation additive), jamais l'inverse.
- L'aide, les guides et la page confidentialité se lisent sans requête réseau ;
  la progression d'un visiteur dans les guides reste dans son navigateur.
- Le thème choisi est mémorisé ; sans choix, le site suit le système.

## Garanties minimales (en cas d'échec)

- Toute adresse inconnue mène à « Page introuvable » avec un retour à
  l'accueil ; un guide ou un chapitre inconnu est signalé.
- Si la session ne peut pas être lue (API absente, 401, erreur), la
  navigation est celle d'un visiteur ; les vues gardent leur propre garde.

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
  familles, l'identité (avatar ou initiales) et « Se déconnecter ». Un rôle
  attribué par l'administration apparaît au prochain chargement de
  l'application (ou rafraîchissement de session, événement `humanome:auth`),
  sans reconnexion : le serveur relit les rôles à chaque appel. L'aide de l'accueil
  rappelle au cartographe ou à l'établissement où est son espace.
- **A2 — Explorer les profils** (étape 2) : « Voir les profils d'utilisateurs »
  révèle une barre de 8 profils (Visiteur, Apprenant, Employeur, Cartographe,
  Promptologue, Épistémiarque, Établissement, Administrateur) ; chacun montre
  les espaces qu'il verrait une fois connecté (« Aperçu du profil… ») ;
  l'employeur n'a pas de compte : une carte explique le lien de partage et
  présente l'offre de recherche de profils **à venir**.
- **A3 — Aide contextuelle** (étape 5) : le contenu dépend de la route (une
  entrée par rubrique du menu ; repli « Aide » sinon) et du rôle.
- **A4 — Guides publics** : `#/guides` présente une carte par parcours (9),
  groupées par famille ; `#/guides/<parcours>` liste ses chapitres ; un
  chapitre est rendu depuis le Markdown embarqué (md.js puis DOMPurify), avec
  chapitre précédent/suivant et la case « Chapitre terminé ». Pour un
  visiteur, la progression est enregistrée **dans ce navigateur**
  (`localStorage` `humanome-training`) et sera migrée vers le compte à la
  connexion (UC-CPT-05).
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
  (session détruite) ou API injoignable → navigation de visiteur.

## Règles de gestion

- **RG1** — Le plan du site est une source unique (`nav.js`) : menu, tuiles et
  aide la lisent ; le niveau 1 nomme des **buts**, pas des rôles.
- **RG2** — Navigation additive : une famille apparaît si **au moins un** rôle
  de la famille est détenu ; un item `allRoles` exige **tous** ses rôles
  (Atelier Twin9 : admin ∧ promptologue).
- **RG3** — La navigation n'est qu'un confort : chaque vue garde sa propre
  garde d'accès (défense en profondeur).
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
| Front | `web/src/App.jsx`, `web/src/main.jsx` | Shell : session, menu (tiroir, épinglage), aide, thème, page introuvable |
| Front | `web/src/nav.js` — `FAMILIES`, `navGroups`, `isCurrentItem` | Plan du site par familles (RG1, RG2) |
| Front | `web/src/views/HomeView.jsx`, `web/src/components/FamilyTiles.jsx` — `PERSONAS` | Accueil, tuiles, profils, encart d'aide |
| Front | `web/src/help/Help.jsx`, `web/src/help/registry.js` — `helpFor` | Aide contextuelle |
| Front | `web/src/lib/theme.js` — `storedTheme`, `resolvedTheme`, `applyTheme`, `subscribeSystemTheme` | Thème (RG5) |
| Front | `web/src/views/GuidesView.jsx`, `web/src/views/espace/FormationSection.jsx`, `web/src/views/espace/formation-content.js` — `listChapters`, `getChapter`, `rewriteChapterLink`, `guidesBaseHash` | Guides publics |
| Front | `web/src/lib/training-store.js` — `createTrainingStore` | Progression locale |
| Front | `web/src/views/ConfidentialiteView.jsx`, `web/src/lib/md.js` — `renderMarkdown` | Page confidentialité (RG4) |
| API | `GET /api/auth/me` — `api/src/routes/auth.php` | Rôles de la session |
| Domaine | `api/src/Auth/Users.php` — `rolesOf`, `assignRole` | Rôles d'un compte |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-VIS-04-U01 | `Users::rolesOf` | Rôles triés, source de la navigation | `api/tests/UseCases/Unit/UcVis04SeRepererTest.php` |
| UC-VIS-04-U02 | `Users::rolesOf`, `assignRole` | Aucun rôle → navigation visiteur ; rôle inconnu refusé | idem |
| UC-VIS-04-U03 | `parseHash`, `guidesHash` | Routes de repérage, introuvable | `web/test/usecases/unit/uc-vis-04-se-reperer-guides-aide.test.js` |
| UC-VIS-04-U04 | `navGroups`, `isCurrentItem`, `FAMILIES` | Familles du visiteur, additivité, conjonction, page courante (RG2) | idem |
| UC-VIS-04-U05 | `helpFor` | Entrées par rubrique, repli, astuce par rôle | idem |
| UC-VIS-04-U06 | `PERSONAS` | Profils explorables, employeur sans compte | idem |
| UC-VIS-04-U07 | `theme.js` | Suivi du système, choix explicite persistant qui prime (RG5) | idem |
| UC-VIS-04-U08 | `formation-content.js` | Parcours, chapitres ordonnés et titrés, liens réécrits, parcours inconnu | idem |
| UC-VIS-04-U09 | `createTrainingStore` | Progression locale du visiteur, sans appel serveur | idem |
| UC-VIS-04-U10 | `createTrainingStore` | **Comportement actuel figé** — anomalie A1 | idem |
| UC-VIS-04-U11 | `renderMarkdown` | Page légale : titres, liens de l'app, rien d'exécutable (RG4) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-04-F01 | Nominal (1) | API | Sans session : `401`, aucune session créée | `api/tests/UseCases/Functional/UcVis04SeRepererTest.php` |
| UC-VIS-04-F02 | A1 | API | Compte multi-rôles : rôles triés, identité minimale, jeton CSRF | idem |
| UC-VIS-04-F03 | A1 | API | Rôle attribué → visible au rafraîchissement suivant | idem |
| UC-VIS-04-F04 | E3 | API | Compte purgé → `401`, session détruite | idem |
| UC-VIS-04-F05 | Nominal (2-3) | IHM | Accueil, actions, tuiles, menu visiteur, `aria-current`, pied de page, aucune requête | `web/test/usecases/functional/uc-vis-04-se-reperer-guides-aide.test.jsx` |
| UC-VIS-04-F06 | A1, A3 | IHM | « Vos espaces », familles des rôles, déconnexion, astuce de l'aide | idem |
| UC-VIS-04-F07 | Nominal (4), A2 | IHM | Profils, aide au survol, 1er clic sélectionne / 2e ouvre, carte employeur | idem |
| UC-VIS-04-F08 | Nominal (5), A3 | IHM | Dialogue d'aide, focus, Échap, fermeture au changement de rubrique | idem |
| UC-VIS-04-F09 | A4 | IHM | Hub → parcours → chapitre, navigation, progression locale | idem |
| UC-VIS-04-F10 | E2 | IHM | Guide / chapitre inconnus | idem |
| UC-VIS-04-F11 | Anomalie A1 | IHM | **Comportement actuel figé** — progression d'un guide perdue | idem |
| UC-VIS-04-F12 | A5 | IHM | Suivi du système puis choix explicite qui prime | idem |
| UC-VIS-04-F13 | A6 | IHM | Page confidentialité sans requête | idem |
| UC-VIS-04-F14 | E1 | IHM | Page introuvable, aide de repli | idem |

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

- **A1 — Progression locale des guides écrasée d'un parcours à l'autre.**
  `createTrainingStore` (`web/src/lib/training-store.js`, `writeLocal`)
  réécrit la clé `humanome-training` avec **le seul parcours courant**
  (`{[parcours]: {chapitresTermines}}`). Un visiteur qui coche un chapitre du
  guide « employeur » perd les chapitres cochés du guide « visiteur » (et
  inversement) ; la migration vers le compte à la connexion ne récupère donc
  que le dernier parcours touché. Comportement actuel figé par UC-VIS-04-U10
  et F11.
