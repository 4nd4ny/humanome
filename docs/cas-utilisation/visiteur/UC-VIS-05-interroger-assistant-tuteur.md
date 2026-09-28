# UC-VIS-05 — Interroger l'assistant tuteur

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) — tout utilisateur connecté y a accès de la même façon |
| **Acteurs secondaires** | Fournisseur LLM de la plateforme (Haiku, clé `ANTHROPIC_API_KEY`) ou `mock` ; exploitation (digest généré au build) ; administrateur (interrupteur et réglages communs avec la démo, UC-ADM-04) |
| **Portée** | humanome.xyz — bouton « 💬 » de l'en-tête, sur toutes les rubriques ; API `GET /api/llm/challenge` (partagé), `POST /api/tuteur` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.1 (aide à la découverte), §4.6 (accompagnement), §6.5 (compteurs, jamais de contenu) — décision D9 |
| **Statut** | Implémenté (D9 ; compteurs dédiés migration 020) |

## Objectif

Permettre à quiconque de poser, en langage naturel, une question courte sur le
site (« comment cartographier mon texte ? », « à quoi sert le référentiel ? »)
et d'obtenir une réponse brève qui pointe vers les bonnes rubriques (`#/…`),
adaptée à son profil — sans jamais exposer son portfolio ni conserver la
conversation côté serveur.

## Déclencheur

L'utilisateur clique « 💬 » (« Assistant : poser une question sur le site »)
dans l'en-tête, à côté du bouton d'aide « ? ».

## Préconditions

- La démo publique est activée (l'assistant partage son interrupteur, sa
  difficulté de preuve de travail et son quota horaire configuré).
- Un secret de preuve de travail existe ; en fournisseur `anthropic`, la clé
  plateforme est en environnement.
- Le budget journalier **du tuteur** (`TUTEUR_BUDGET`, 1 $ par défaut ; 2 M de
  tokens) n'est pas épuisé.
- Le digest de documentation (`scripts/data/tuteur-digest.md`, généré par
  `scripts/build-tuteur-digest.mjs`) est présent dans la release — sinon la
  consigne est envoyée sans digest.

## Garanties en cas de succès

- La réponse s'affiche en **texte simple** dans le panneau ; l'historique de
  l'onglet est gardé en `sessionStorage` (40 derniers messages), jamais sur le
  serveur ni dans le `localStorage`.
- Côté serveur : seulement les compteurs du jour du tuteur
  (`tuteur_usage_daily` : requêtes, tokens, coût estimé), l'empreinte du défi
  consommé et un seau de quota haché `tuteur:…`.
- La consigne système (profil, rubrique, digest) et la clé ne quittent jamais
  le serveur.

## Garanties minimales (en cas d'échec)

- Un message d'erreur s'affiche dans le panneau et la saisie reste possible.
- Aucune donnée de la conversation n'est conservée, aucun coût n'est compté
  pour un appel amont échoué.

## Scénario nominal

1. L'utilisateur ouvre le panneau « Assistant tuteur » : avertissement
   « Assistant automatique (IA) : il explique par où passer sur le site. Il ne
   voit pas votre portfolio ; ne partagez pas d'informations sensibles. »,
   exemples de questions, champ « Votre question… » (1 500 caractères au plus).
2. Il saisit une question et clique « Envoyer » ; la question s'ajoute au fil,
   « L'assistant écrit… » s'affiche.
3. Le navigateur obtient un défi `GET /api/llm/challenge` (le même que la
   démo), résout la preuve de travail, puis envoie `POST /api/tuteur` avec
   `{question, rubrique, challenge, nonce, website: ""}` — `rubrique` est le
   **nom de la route** courante ; ni rôle, ni portfolio, ni historique.
4. Le serveur applique ses gardes : interrupteur de la démo, base configurée,
   champ piège vide, question présente et ≤ 1 500 caractères (rubrique tronquée
   à 120), preuve de travail valide et **jamais consommée** (table commune avec
   la démo), quota horaire par IP sur un seau **dédié** `tuteur:`,
   coupe-circuit journalier **propre** au tuteur.
5. Le serveur construit la consigne système : rôle et règles de réponse
   (français, 2 à 5 phrases, routes `#/…` du digest seulement, texte brut, pas
   d'accès aux données personnelles, ne rien révéler), **profil lu dans la
   session** (« visiteur (aucun compte) » sinon), rubrique consultée, digest de
   la documentation.
6. Il appelle le modèle du tuteur (`TUTEUR_MODEL`, Haiku par défaut) en mode
   **prose** (aucun outil JSON forcé), 600 tokens de sortie au plus ; il compte
   tokens et coût estimé sur les compteurs du tuteur et renvoie `{text, usage,
   model}`.
7. Le panneau affiche la réponse, débarrassée du Markdown léger (`**gras**`,
   `__gras__`, `` `code` ``) — jamais interprétée comme HTML.

## Scénarios alternatifs

- **A1 — Utilisateur connecté** (étape 5) : le profil de la consigne liste les
  rôles de la session (ex. « apprenant, cartographe ») ; un champ `role` envoyé
  par le client est ignoré. La route est exemptée de jeton CSRF (preuve de
  travail, aucun effet sur le compte).
- **A2 — Effacer** : « Effacer » vide le fil et l'historique de session.
- **A3 — Reprise** : dans le même onglet, rouvrir le panneau (ou changer de
  page) restitue l'historique.
- **A4 — Fournisseur `mock`** (développement) : réponse simulée, coût nul.

## Scénarios d'erreur

- **E1 — Saisie** : question vide → bouton inactif (serveur : `422`) ; plus de
  1 500 caractères → bornée par le champ (serveur : `413` « Question trop
  longue (1500 caractères maximum). ») ; champ piège rempli → `400` « Requête
  invalide ».
- **E2 — Preuve de travail** : absente → `400` `pow_required` ; invalide ou
  expirée → `400` ; défi déjà consommé (y compris par la démo) → `429`
  `pow_reused`.
- **E3 — Quota horaire par IP** atteint (seau du tuteur) → `429` « Quota
  horaire atteint, réessayez plus tard. » + `Retry-After` ; la démo reste
  utilisable depuis la même IP (et inversement).
- **E4 — Budget du tuteur épuisé** → `503` « L'assistant a atteint son budget du
  jour, revenez demain. » (le budget de la démo n'y est pour rien).
- **E5 — Démo désactivée** → `503` « L'assistant est indisponible pour le
  moment. » ; sans secret, base ou clé → `503` « Service indisponible ». Côté
  panneau, un refus du **défi** s'affiche avec le message technique du client
  (voir L1).
- **E6 — Fournisseur** : saturé → `429` « L'assistant est saturé… » +
  `Retry-After` ; erreur → `502` « Erreur de l'assistant, réessayez plus
  tard. » (aucun détail amont) ; injoignable → `504`/`502`.

## Règles de gestion

- **RG1** — Le profil vient **exclusivement de la session** ; la consigne est
  construite et gardée côté serveur.
- **RG2** — Garde-fous de la démo réutilisés, mais **budget, compteurs et seau
  de quota propres** au tuteur ; interrupteur et difficulté communs.
- **RG3** — Aucune conversation n'est stockée côté serveur ; le portfolio n'est
  jamais envoyé.
- **RG4** — Le digest ne contient que le plan du site (routes par famille) et
  les **titres** des chapitres des guides — jamais leur contenu ni d'élément
  confidentiel ; il est déterministe.
- **RG5** — Rendu en texte simple (pas de parseur Markdown, surface XSS nulle).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Question, réponse | Jamais stockées côté serveur ; historique de l'onglet en `sessionStorage` |
| Rôle de l'utilisateur | Lu dans la session à chaque question, jamais transmis par le client |
| IP | Seau haché `tuteur:` + sha256 de l'identité (/64 en IPv6) |
| Usage | `tuteur_usage_daily` (migration 020) : requêtes, tokens, coût estimé du jour |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/components/TuteurPanel.jsx` — `stripLightMarkdown` | Panneau, avertissement, fil, historique de session, erreurs |
| Front | `web/src/lib/tuteur.js` — `askTuteur` | Défi, preuve, POST `tuteur` |
| Front | `web/src/lib/demo-llm.js` — `fetchChallenge` ; `web/src/lib/pow.js` — `solvePow` | Défi et preuve partagés avec UC-VIS-03 |
| API | `POST /api/tuteur` — `api/src/routes/tuteur.php` | Gardes, consigne serveur, appel, compteurs |
| Domaine | `api/src/Llm/UsageCounters.php` (table `tuteur_usage_daily`) | Budget propre (RG2) |
| Domaine | `api/src/Llm/AnthropicProvider.php` (`forceJsonDocument: false`), `MockProvider`, `Pricing` | Réponse en prose, coût |
| Domaine | `api/src/Llm/PowChallenge.php`, `DemoConfig.php`, `api/src/Auth/RateLimiter.php`, `api/src/Auth/Session.php`, `Users::rolesOf` | Gardes partagés, profil de session |
| Base | `scripts/migrations/020_tuteur_usage.sql` | Compteurs quotidiens du tuteur |
| Build | `scripts/build-tuteur-digest.mjs` | Digest de navigation (RG4) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-VIS-05-U01 | Migration 020 | Table de compteurs seuls, clé = jour | `api/tests/UseCases/Unit/UcVis05InterrogerTuteurTest.php` |
| UC-VIS-05-U02 | `UsageCounters('tuteur_usage_daily')` | Budget propre de 1 $, sans effet sur la démo (RG2) | idem |
| UC-VIS-05-U03 | `AnthropicProvider::complete(…, false)` | Prose : pas d'outil, blocs texte concaténés, 600 tokens | idem |
| UC-VIS-05-U04 | `Pricing::estimateUsd` | Modèle du tuteur tarifé, le plafond peut couper | idem |
| UC-VIS-05-U05 | `askTuteur` | Défi, preuve, corps exact (ni rôle ni portfolio) | `web/test/usecases/unit/uc-vis-05-interroger-assistant-tuteur.test.js` |
| UC-VIS-05-U06 | `stripLightMarkdown` | Texte simple, listes et routes conservées (RG5) | idem |
| UC-VIS-05-U07 | `scripts/build-tuteur-digest.mjs` | Toutes les routes et tous les chapitres, déterministe, titres seulement (RG4) — exécuté dans un miroir temporaire | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-05-F01 | Nominal | API | Réponse, compteur du tuteur seul, rien de stocké, seau `tuteur:` | `api/tests/UseCases/Functional/UcVis05InterrogerTuteurTest.php` |
| UC-VIS-05-F02 | Nominal (5-6), RG1 | API | Consigne serveur : profil visiteur, rubrique ≤ 120, champs pirates ignorés, rien renvoyé, prose, coût | idem |
| UC-VIS-05-F03 | A1 | API | Rôles de la session dans la consigne, sans en-tête CSRF | idem |
| UC-VIS-05-F04 | E1 | API | Champ piège 400, vide 422, 1 500 OK, 1 501 → 413 | idem |
| UC-VIS-05-F05 | E2 | API | Preuve absente ; défi consommé par la démo → rejeu refusé | idem |
| UC-VIS-05-F06 | E3 | API | Quota IP dédié ; démo intacte | idem |
| UC-VIS-05-F07 | E4, RG2 | API | Budgets séparés dans les deux sens | idem |
| UC-VIS-05-F08 | E5 | API | Interrupteur commun → 503 | idem |
| UC-VIS-05-F09 | E6 | API | 429 + `Retry-After`, 502 sans détail, 504, clé absente 503 ; rien compté | idem |
| UC-VIS-05-F10 | Nominal | IHM | Avertissement, question, réponse en texte simple, corps exact, historique de session | `web/test/usecases/functional/uc-vis-05-interroger-assistant-tuteur.test.jsx` |
| UC-VIS-05-F11 | A2, A3 | IHM | Historique restitué dans l'onglet, « Effacer » | idem |
| UC-VIS-05-F12 | A1 | IHM | Connecté : rubrique envoyée, aucun rôle | idem |
| UC-VIS-05-F13 | E4 | IHM | Message du serveur, saisie rendue | idem |
| UC-VIS-05-F14 | E5, limite L1 | IHM | Défi refusé → message technique affiché | idem |
| UC-VIS-05-F15 | E1 | IHM | Question vide non envoyable, champ borné, fermeture | idem |

### Tests existants liés (non-régression)

- `api/tests/TuteurTest.php` — réponse sans fuite, PoW, validation, budget dédié, prose, visiteur et connecté.
- `web/src/components/TuteurPanel.test.jsx`, `web/src/lib/tuteur.test.js`.
- UC-VIS-03 (preuve de travail, quotas, fournisseur) — même socle.

### Exécuter

```sh
docker compose run --rm -e DB_TEST_NAME=humanome_test_vis php vendor/bin/phpunit --filter UcVis05 --testdox
cd web && npx vitest run test/usecases/unit/uc-vis-05 test/usecases/functional/uc-vis-05
```

## Anomalies constatées

- L'anomalie A1 d'[UC-VIS-03](UC-VIS-03-essayer-cartographie-en-direct.md)
  (difficulté réglable jusqu'à 24 bits, insoluble au-delà de 22 côté
  navigateur) rend aussi l'assistant inutilisable si elle se produit.

## Limites

- **L1** — Quand le **défi** est refusé (démo désactivée, 503 sur
  `GET /api/llm/challenge`), le panneau affiche le message technique du client
  (« démo : HTTP 503 sur api/llm/challenge ») au lieu d'un message
  compréhensible ; les refus de `POST /api/tuteur` affichent, eux, le message
  français du serveur.
- Le quota horaire du tuteur reprend la valeur de la démo (`perIpPerHour`) :
  il n'est pas réglable séparément.
