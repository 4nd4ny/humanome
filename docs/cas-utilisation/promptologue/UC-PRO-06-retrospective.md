# UC-PRO-06 — Régénérer rétrospectivement des cartographies

| Champ | Valeur |
|---|---|
| **Acteur principal** | Promptologue (rôle `promptologue` ; ses cartographies serveur exigent aussi le rôle `apprenant`) |
| **Acteurs secondaires** | Fournisseur LLM choisi (« Service humanome » ou clé personnelle) ; épistémiarques (auteurs de la version plus récente du référentiel, UC-EPI-03/04) |
| **Portée** | humanome.xyz — atelier promptologue, section `#/promptologue/retro` (régénération 100 % navigateur) |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.4 (« retrouver rétrospectivement des compétences nouvellement ajoutées au référentiel »), §8 (référentiel évolutif), §6.1 (texte du portfolio côté client) |
| **Statut** | Implémenté à l'unité (P10.6) — **bloqué contre l'API réelle**, voir « Anomalies constatées » (AN-1) ; régénération de masse au backlog post-v1 |

## Objectif

Relancer la cartographie d'une **journée** déjà cartographiée avec une version
**plus récente** du référentiel, puis comparer au document d'origine : quelles
compétences sont **nouvellement détectées**, lesquelles **disparaissent**,
lesquelles restent **stables** — pour ne pas perdre les compétences que
l'évolution du référentiel permet désormais d'identifier.

## Déclencheur

Le promptologue ouvre **Rétrospective** dans la navigation de l'atelier
(`#/promptologue/retro`).

## Préconditions

- Session ouverte avec le rôle `promptologue` (garde de l'atelier) **et** le
  rôle `apprenant` (garde de `GET /api/cartographies`).
- Une cartographie **de journée** stockée sur le serveur par ce compte
  (opt-in, UC-APP-04), idéalement avec la version du référentiel qui l'a
  produite.
- Une version plus récente du référentiel publiée (UC-EPI-03/04).
- Le texte de la journée disponible dans un portfolio local du navigateur
  (UC-APP-01), ou à portée de main pour être collé.

## Garanties en cas de succès

- Un tableau « Original vs référentiel *X* » liste les compétences
  nouvellement détectées et les disparues (avec leur nouveau statut), puis le
  nombre et la liste des compétences stables.
- Le texte de la journée n'a quitté le navigateur que vers le fournisseur LLM
  choisi ; rien n'est écrit sur le serveur.

## Garanties minimales (en cas d'échec)

- Aucun appel LLM tant que la version du référentiel et le texte ne sont pas
  fournis.
- La cartographie d'origine n'est jamais modifiée.

## Scénario nominal

1. Le promptologue ouvre `#/promptologue/retro` ; l'atelier vérifie la session
   (`GET api/auth/me`) et le rôle `promptologue`.
2. La section charge **ses** cartographies serveur (`GET api/cartographies` :
   métadonnées seulement, jamais les documents) et les versions publiées du
   référentiel (`GET api/referentiel/versions`).
3. Il choisit une cartographie d'origine : `GET api/cartographies/{id}` renvoie
   le document (et la version du référentiel qui l'a produit). Le document est
   une `cartographie-jour` ; la section cherche le texte de **cette date** dans
   les portfolios locaux (`findLocalDayText`, segments de la date concaténés)
   et l'affiche : « Journée du *AAAA-MM-JJ* — texte retrouvé dans « *titre* »
   (local). »
4. Il choisit le « Référentiel plus récent » et le fournisseur (« Service
   humanome » par défaut), puis clique **Régénérer et comparer**.
5. La section vérifie qu'une version est choisie et que le texte n'est pas
   vide, charge le référentiel (`GET api/referentiel/versions/{semver}`),
   construit le fournisseur (`createProviderBundle`, `prime()` en mode
   service) et relance `extractDay` sur le texte, à la date de l'original,
   avec le référentiel choisi (`kairosOptional` : un kairos en échec dégrade
   le document au lieu de perdre la régénération).
6. `compareRetroDocs` compare les statuts « présence établie » avant/après et
   la section affiche le tableau (nouvelles, disparues, stables).

## Scénarios alternatifs

- **A1 — Texte introuvable localement** (étape 3) : « texte local introuvable,
  collez-le : » ; le promptologue colle le texte dans le champ (jamais envoyé
  au stockage serveur) et poursuit.
- **A2 — Clé personnelle** (étape 4) : fournisseur direct (Anthropic, OpenAI,
  Google, xAI, OpenRouter, Ollama) avec sa clé ; modèle par défaut du
  fournisseur.
- **A3 — Aucune évolution** (étape 6) : « Aucun changement : mêmes compétences
  établies. »
- **A4 — Compétence disparue** (étape 6) : une compétence établie à l'origine
  ne l'est plus : « disparue (désormais : *statut*) ».

## Scénarios d'erreur

- **E1 — Pas de session ou pas le rôle promptologue** (étape 1) : section
  refusée, aucune cartographie chargée.
- **E2 — Cartographies serveur inaccessibles** (étape 2) : `401`/`403` (par
  exemple un promptologue **sans** rôle `apprenant`) → « Les cartographies
  serveur nécessitent une session avec des cartographies stockées (opt-in
  apprenant). » ; autre échec → message de l'API.
- **E3 — Cartographie non journalière** (étape 3) : une fusion (`merge`) →
  « … la régénération rétrospective (v1) opère à l'unité, jour par jour. »
- **E4 — Aucune version choisie** (étape 5) : « Choisissez une version du
  référentiel (plus récente que celle du run d'origine). »
- **E5 — Texte vide** (étape 5) : rappel que le texte n'est jamais stocké sur
  le serveur (RGPD §6.1), à coller.
- **E6 — Échec de la régénération** (étape 5) : fournisseur en erreur, clé
  manquante, document invalide → message d'erreur.
- **E7 — Cartographie d'autrui** (étape 3) : l'API répond le même `404`
  qu'un identifiant inconnu (la liste ne la propose d'ailleurs jamais).

## Règles de gestion

- **RG1** — Le texte de la journée ne vient **jamais** du serveur : il est
  retrouvé dans les portfolios locaux ou collé (client-first §6.1). Le serveur
  ne détient que le document (extraits, verdicts).
- **RG2** — Seules **mes** cartographies sont accessibles (portée
  propriétaire, `404` sinon).
- **RG3** — v1 : régénération **à l'unité**, une `cartographie-jour` à la
  fois, avec le protocole du moteur embarqué (`extractDay`).
- **RG4** — La comparaison porte sur l'ensemble des compétences au statut
  « présence établie » avant / après.
- **RG5** — Le référentiel compte toujours 61 compétences (schéma) : une
  « compétence nouvellement ajoutée » est, en pratique, une compétence
  **redéfinie** dans une version plus récente (ou une version majeure qui
  révise aussi le schéma).
- **RG6** — La régénération n'est ni enregistrée ni substituée à l'original.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte de la journée | Portfolio local (IndexedDB) ou collé ; envoyé au seul fournisseur LLM choisi ; jamais au stockage serveur |
| Cartographie d'origine | Lue par son propriétaire (`GET api/cartographies/{id}`) ; non modifiée |
| Résultat de la régénération | Affiché seulement, non persisté |
| Clé API personnelle | Mémoire du composant, transport direct vers le fournisseur |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/PromptologueView.jsx` | Garde de rôle, section `retro` |
| Front | `web/src/views/promptologue/RetroSection.jsx` | Sélection, texte local, lancement, tableau |
| Front | `web/src/views/promptologue/retro.js` — `compareRetroDocs`, `findLocalDayText`, `newerReferentielVersions` | Logique pure |
| Front | `web/src/views/promptologue/api.js` — `listCartographies`, `getCartography`, `listReferentielVersions`, `getReferentielVersion` | Appels API |
| Front | `web/src/lib/run-launcher.js` — `createProviderBundle` ; `web/src/lib/portfolio-store.js` | Fournisseur ; portfolios locaux |
| Moteur | `engine/src/pipeline/extract.js` — `extractDay`, `buildExtractionPrompt` | Régénération avec le référentiel choisi |
| API | `GET /api/cartographies`, `GET /api/cartographies/{id}` — `api/src/routes/cartographies.php` (rôle `apprenant`) | Cartographies du propriétaire |
| API | `GET /api/referentiel/versions[/{semver}]` — `api/src/routes/referentiel.php` | Versions du référentiel |
| Domaine | `api/src/Cartographies/CartographyRepository.php` — `listForUser`, `findForUser`, `resolveReferentielVersion` | Métadonnées, document + base de référentiel |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `publishedVersions`, `findPublished` | Référentiel plus récent |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-PRO-06-U01 | `CartographyRepository::listForUser` | Mes cartographies, métadonnées, clé `type` (pas `kind`) | `api/tests/UseCases/Unit/UcPro06RetrospectiveTest.php` |
| UC-PRO-06-U02 | `CartographyRepository::findForUser` | Document jour + `referentiel {id, version}` ; `null` pour autrui (RG2) | idem |
| UC-PRO-06-U03 | `CartographyRepository::resolveReferentielVersion` | Seule une version publiée sert de base | idem |
| UC-PRO-06-U04 | `ReferentielRepository::publishedVersions`, `findPublished` | Version 7.1.0 : 61 compétences, 1.03 redéfinie (RG5) | idem |
| UC-PRO-06-U05 | `compareRetroDocs` | Nouvelle, disparue avec nouveau statut, stables (RG4) | `web/test/usecases/unit/uc-pro-06-retrospective.test.js` |
| UC-PRO-06-U06 | `compareRetroDocs` | Compétence absente → disparue (`null`) ; identiques → aucun changement | idem |
| UC-PRO-06-U07 | `findLocalDayText` | Premier portfolio portant la date, concaténation, titre par défaut (RG1) | idem |
| UC-PRO-06-U08 | `newerReferentielVersions` | Strictement plus récentes (tri numérique) ; base `null` (AN-2) ; forme `{semver}` écartée (AN-1) | idem |
| UC-PRO-06-U09 | `createPromptologueApi` | Routes cartographies et référentiel | idem |
| UC-PRO-06-U10 | `extractDay` → `compareRetroDocs` | Référentiel 7.1.0 : 1.03 nouvellement détectée ; ancien référentiel : rien | idem |
| UC-PRO-06-U11 | `buildExtractionPrompt` | La définition révisée atteint le LLM | `engine/test/usecases/unit/uc-pro-06-retrospective.test.js` |
| UC-PRO-06-U12 | `extractDay` (`kairosOptional`) | Kairos inexploitable → `kairos: null`, sinon échec | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-PRO-06-F01 | Nominal (étapes 2, 3, 5) | API | Liste, original avec base 7.0.0, versions (`semver`), référentiel 7.1.0 | `api/tests/UseCases/Functional/UcPro06RetrospectiveTest.php` |
| UC-PRO-06-F02 | E2 | API | 401 sans session ; 403 pour un promptologue sans rôle `apprenant` | idem |
| UC-PRO-06-F03 | E7 | API | Cartographie d'autrui : même 404 qu'inconnue | idem |
| UC-PRO-06-F04 | RG1 | API | Le document stocké ne contient pas le texte de la journée | idem |
| UC-PRO-06-F05 | Nominal | IHM | Texte local retrouvé, 8 appels sur ce texte, 1.03 nouvellement détectée, rien écrit côté serveur | `web/test/usecases/functional/uc-pro-06-retrospective.test.jsx` |
| UC-PRO-06-F06 | A1 + A2 | IHM | `<App/>` : texte collé, clé Anthropic, modèle par défaut | idem |
| UC-PRO-06-F07 | A3 | IHM | « Aucun changement » | idem |
| UC-PRO-06-F08 | A4 | IHM | « disparue (désormais : renvoi au cartographe) » | idem |
| UC-PRO-06-F09 | E1 | IHM | Sans rôle : section refusée, aucune cartographie chargée | idem |
| UC-PRO-06-F10 | E2 | IHM | 403 → message explicatif | idem |
| UC-PRO-06-F11 | E3 | IHM | Fusion refusée | idem |
| UC-PRO-06-F12 | E4 | IHM | Aucune version choisie, 0 appel | idem |
| UC-PRO-06-F13 | E5 | IHM | Texte vide, rappel RGPD, 0 appel | idem |
| UC-PRO-06-F14 | E6 | IHM | 429 du fournisseur → message, pas de résultat | idem |
| UC-PRO-06-F15 | Anomalie AN-1 | IHM | Forme réelle `{semver}` : aucune version proposée, cas bloqué (comportement actuel figé) | idem |
| UC-PRO-06-F16 | Anomalie AN-2 | IHM | Base 7.1.0 ignorée : 7.0.0 encore proposée (comportement actuel figé) | idem |

Les tests IHM F05 à F16 (sauf F15) fournissent les versions du référentiel
sous la forme **attendue par le front** (`{version}`) afin d'exercer la
section ; F15 et les tests API figent la forme **réelle** (`{semver}`).

### Tests existants liés (non-régression)

- `web/src/views/promptologue/RetroSection.test.jsx` — logique `retro.js` et composant isolé (coutures `extractDayFn`, `createBundleFn`).
- `api/tests/CartographiesTest.php` — liste sans documents, lecture propriétaire, résolution des versions.
- `api/tests/ReferentielApiTest.php` — `GET /referentiel/versions` (clé `semver`) et `/versions/{semver}`.
- `engine/src/pipeline/extract.test.js` — `extractDay`, `kairosOptional`.
- `web/src/lib/portfolio-store.test.js` — portfolios locaux (IndexedDB / mémoire) ; `web/src/lib/run-launcher.test.js` — `createProviderBundle` (aussi couvert par UC-PRO-05-U11).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcPro06 --testdox
cd web && npx vitest run test/usecases/unit/uc-pro-06 test/usecases/functional/uc-pro-06
cd engine && npx vitest run test/usecases/unit/uc-pro-06
```

## Anomalies constatées

- **AN-1 — Aucune version du référentiel n'est jamais proposée (cas bloqué
  en production).** `GET /api/referentiel/versions` renvoie
  `{id, referentielId, semver, label, …}` ; `newerReferentielVersions` ne
  retient que les entrées dont `version` est un semver. Contre l'API réelle,
  la liste « Référentiel plus récent » est vide et toute tentative aboutit à
  E4 : le cas d'utilisation ne peut pas aboutir. Figé par U08 (forme
  `{semver}` écartée), F01 (forme réelle de l'API) et F15 (IHM). Même cause
  que UC-PRO-05 AN-1.
- **AN-2 — « Plus récent » n'est pas filtré.** `GET api/cartographies/{id}`
  renvoie la version du référentiel d'origine (`referentiel.version`), mais
  `RetroSection` appelle `newerReferentielVersions(refVersions, null)` : toutes
  les versions publiées sont proposées, y compris la version d'origine et les
  antérieures, alors que le libellé et le message d'erreur annoncent « plus
  récent ». Figé par U08 et F16.

## Limites

- La liste des cartographies n'affiche pas leur type (la section lit `kind`,
  l'API renvoie `type`) : une fusion est proposée puis refusée (E3).
- La régénération utilise toujours le protocole du moteur embarqué : ni le
  paquet de prompts d'origine ni une autre version de paquet ne sont
  sélectionnables (« faire évoluer les scripts d'analyse » passe par le banc
  d'essai, UC-PRO-05).
- Régénération à l'unité seulement ; la régénération de masse (cohorte
  entière) est au backlog post-v1 (STATUS). Le résultat n'est pas enregistré.
- Seules les cartographies **du compte connecté** sont régénérables : celles
  d'un apprenant restent hors de portée du promptologue (RGPD).
