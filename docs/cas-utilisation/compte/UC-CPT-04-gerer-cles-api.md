# UC-CPT-04 — Gérer ses clés API personnelles

| Champ | Valeur |
|---|---|
| **Acteur principal** | Tout utilisateur qui lance des cartographies avec sa propre clé de fournisseur LLM (apprenant le plus souvent) |
| **Acteurs secondaires** | Fournisseur LLM choisi (Anthropic, OpenAI, Google, OpenRouter, xAI, Ollama local) — appelé directement par le navigateur |
| **Portée** | humanome.xyz — section « Clés API personnelles » de `#/compte` ; étape « Fournisseur » de l'assistant `#/espace/nouveau-run` ; `PUT`/`GET /api/keys`, `GET`/`DELETE /api/keys/{provider}` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §4.5 (« clé API personnelle optionnelle »), §5, §6.2 (stockage serveur = opt-in) ; ADR-001 (exécution dans le navigateur), **ADR-004** (localStorage par défaut, opt-in serveur chiffré) |
| **Statut** | Implémenté (P8 : coffre sodium, assistant de run ; section de profil) |

## Objectif

Utiliser sa propre clé API pour cartographier sans la ressaisir, en gardant la
maîtrise de l'endroit où elle est conservée : **dans ce navigateur** par défaut,
ou **chiffrée sur le serveur** si l'utilisateur le demande explicitement, pour
la retrouver sur un autre appareil — et pouvoir la retirer à tout moment.

## Déclencheur

L'utilisateur ouvre la section « Clés API personnelles » de son profil, ou
arrive à l'étape « Fournisseur » de l'assistant de run en mode « Clé
personnelle ».

## Préconditions

- Stockage local : aucune (fonctionne sans compte).
- Stockage serveur : session ouverte (UC-CPT-02) et clé maîtresse
  `SODIUM_MASTER_KEY` configurée hors webroot.

## Garanties en cas de succès

- Local : la clé est dans `localStorage['humanome-keys']` (table fournisseur →
  clé) et ne quitte le navigateur que vers le fournisseur choisi.
- Serveur : la clé est stockée **chiffrée** (`nonce(24 o) ‖
  crypto_secretbox(clé)`, clé maîtresse de 32 octets hors webroot) dans
  `user_api_keys` ; la liste ne montre que `{provider, createdAt}` ; seul le
  propriétaire authentifié peut la relire, avec `Cache-Control: no-store`.
- Suppression : l'entrée serveur est réellement supprimée.

## Garanties minimales (en cas d'échec)

- Jamais de clé en clair en base, dans une liste, dans un journal ou dans un
  cache HTTP.
- Stockage non configuré : `503` explicite sur les routes des clés, le reste
  de l'API fonctionne.
- Un chiffré illisible (clé maîtresse changée, blob tronqué) donne `404`,
  jamais `500` ni fuite.

## Scénario nominal — enregistrer sa clé sur le serveur depuis le profil

1. L'utilisateur connecté ouvre `#/compte` ; la section « Clés API
   personnelles » appelle `GET /api/keys` et affiche la liste des fournisseurs
   enregistrés (« enregistrée le AAAA-MM-JJ ») ou « Aucune clé enregistrée. ».
2. Il choisit un fournisseur parmi six (Anthropic, OpenAI, Google,
   OpenRouter, xAI, Ollama) et saisit sa clé dans un champ masqué
   (`type="password"`, sans autocomplétion) ; le bouton « Enregistrer la clé »
   n'est actif qu'à partir de 8 caractères (espaces retirés).
3. Le site envoie `PUT /api/keys {provider, apiKey}` avec `X-CSRF-Token`.
4. Le serveur vérifie la clé maîtresse (`503` sinon), la session (`401`
   sinon), valide le fournisseur (liste du coffre) et la clé (8 à 4096
   octets, sans caractère de contrôle), chiffre avec un nonce aléatoire et enregistre
   (remplacement si le fournisseur existe déjà) → `204`.
5. Le site vide le champ (la clé n'est **jamais réaffichée**), affiche « Clé
   <fournisseur> enregistrée (chiffrée). » et recharge la liste.

## Scénarios alternatifs

- **A1 — Clé locale par défaut** (assistant de run, étape « Fournisseur ») :
  le champ « Clé API » est pré-rempli depuis `localStorage['humanome-keys']`
  pour le fournisseur choisi ; « Mémoriser la clé dans ce navigateur » est
  coché par défaut ; au lancement, la clé est mémorisée localement puis
  transmise au seul fournisseur (appel direct depuis le navigateur). Aucun
  appel à `/api/keys`. Sans compte, « Synchroniser sur le serveur » est grisé
  avec un lien « connectez-vous ».
- **A2 — Synchronisation opt-in depuis l'assistant** : connecté, l'utilisateur
  coche « Synchroniser sur le serveur (chiffrée) » ; au lancement, le site
  envoie `PUT /api/keys` **avant** de démarrer le run.
- **A3 — Récupérer sa clé sur un autre navigateur** : connecté, « Récupérer la
  clé depuis le serveur » → `GET /api/keys/{provider}` → `200 {apiKey}`
  (no-store) ; le champ est rempli, « Clé récupérée depuis le serveur. ».
- **A4 — Remplacer une clé** (étape 3) : un nouveau `PUT` pour le même
  fournisseur remplace l'entrée (nouveau nonce, date de dernière écriture).
- **A5 — Supprimer la clé serveur** (révocation de l'opt-in) : « Supprimer »
  dans la liste → `DELETE /api/keys/{provider}` → `204` ; « Clé <fournisseur>
  supprimée. », liste rechargée. La clé locale éventuelle n'est pas touchée.

## Scénarios d'erreur

- **E1 — Stockage serveur non configuré** (étapes 1, 4, A2, A3, A5) :
  `SODIUM_MASTER_KEY` absente ou malformée → `503 « Stockage de clés non
  configuré »` sur toutes les routes, **avant** le contrôle de session. La
  section l'affiche ; dans l'assistant, le run ne démarre pas et le message est
  affiché.
- **E2 — Pas de session** : `401` sur les quatre routes ; dans l'assistant, la
  synchronisation est grisée et la récupération masquée.
- **E3 — Validation** (étape 4) : `422 {error: "Validation échouée", fields}`
  pour un fournisseur inconnu, une clé de moins de 8 ou plus de 4096
  octets, avec un caractère de contrôle, ou absente (le message serveur dit
  « 8 à 4096 caractères imprimables »). La section affiche
  « Validation échouée ».
- **E4 — Aucune clé pour ce fournisseur** (A3, A5) : `404 « Aucune clé
  enregistrée pour ce fournisseur »`, affiché par l'assistant.
- **E5 — Clé maîtresse changée** (A3) : le chiffré ne s'authentifie plus →
  `404` (échec fermé) ; l'entrée reste listée et peut être supprimée ou
  remplacée.
- **E6 — Jeton CSRF absent** (étapes 3, A5) : `403`, rien n'est écrit ni
  effacé.

## Règles de gestion

- **RG1** — Défaut local (ADR-004) : sans action explicite, la clé ne quitte
  pas le navigateur (sauf vers le fournisseur choisi).
- **RG2** — Le stockage serveur est un opt-in explicite, révocable (A5), et
  purgé avec le compte (UC-CPT-06).
- **RG3** — Chiffrement authentifié `crypto_secretbox` (XSalsa20-Poly1305),
  nonce aléatoire par écriture, clé maîtresse hors webroot.
- **RG4** — La liste ne porte jamais de matériau de clé ; la révélation est
  réservée au propriétaire authentifié et marquée `no-store`.
- **RG5** — Chaque route n'agit que sur les clés du compte de la session.
- **RG6** — Fournisseurs : l'interface en propose six ; le coffre accepte en
  plus `mock` (tests). Ollama n'exige pas de clé dans l'assistant.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Clé locale | `localStorage['humanome-keys']` du navigateur, jamais transmise à humanome |
| Clé serveur (opt-in) | `user_api_keys.encrypted_key` (chiffré), `created_at` = dernière écriture ; CASCADE à la purge ; non réexportée (secret) |
| Journaux | Aucune clé journalisée |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/account/ApiKeysSection.jsx` | Liste, formulaire, suppression, messages |
| Front | `web/src/api/keys.js` — `listKeys`, `storeKey`, `revealKey`, `deleteKey`, `KEY_PROVIDERS`, `providerLabel` | Client `/api/keys` |
| Front | `web/src/lib/run-launcher.js` — `readLocalKeys`, `getLocalKey`, `setLocalKey`, `syncKeyToServer`, `fetchKeyFromServer`, `PROVIDERS`, `KEYS_STORAGE_KEY` | Clé locale, synchronisation opt-in |
| Front | `web/src/components/RunWizard.jsx` — étape « Fournisseur », `launch`, `recoverServerKey` | Pré-remplissage, mémorisation, synchronisation, récupération |
| API | `api/src/routes/keys.php` — `PUT`/`GET /api/keys`, `GET`/`DELETE /api/keys/{provider}` | Garde 503/401, validation, orchestration |
| Domaine | `api/src/Keys/KeyVault.php` — `masterKeyFromEnv`, `store`, `listForUser`, `reveal`, `delete`, `PROVIDERS` | Chiffrement et persistance |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-CPT-04-U01 | `KeyVault::masterKeyFromEnv` | 64 hex → 32 octets ; vide, court, non hex, trop long → `null` | `api/tests/UseCases/Unit/UcCpt04GererClesApiTest.php` |
| UC-CPT-04-U02 | `KeyVault::store` | Format nonce ‖ secretbox, déchiffrable, jamais en clair (RG3) | idem |
| UC-CPT-04-U03 | `KeyVault::store` | Remplacement : une entrée, nouveau nonce (A4) | idem |
| UC-CPT-04-U04 | `KeyVault::listForUser` | Propriétaire seul, tri, date ISO, pas de clé (RG4) | idem |
| UC-CPT-04-U05 | `KeyVault::reveal` | Autre compte, fournisseur absent, rotation, blob tronqué → `null` (E5) | idem |
| UC-CPT-04-U06 | `KeyVault::delete` | Suppression réelle, bornée au compte | idem |
| UC-CPT-04-U07 | `KeyVault::PROVIDERS` | Six fournisseurs + `mock` (RG6) | idem |
| UC-CPT-04-U08 | `setLocalKey`, `getLocalKey`, `readLocalKeys` | Table `humanome-keys`, effacement (RG1) | `web/test/usecases/unit/uc-cpt-04-gerer-cles-api.test.jsx` |
| UC-CPT-04-U09 | idem | Stockage corrompu ou plein toléré | idem |
| UC-CPT-04-U10 | `syncKeyToServer`, `fetchKeyFromServer` | PUT `keys`, GET `keys/<encodé>` | idem |
| UC-CPT-04-U11 | `fetchKeyFromServer` | Réponse vide → message français ; erreur API propagée | idem |
| UC-CPT-04-U12 | `KEY_PROVIDERS`, `PROVIDERS`, `providerLabel` | Mêmes six fournisseurs, acceptés par le coffre ; Ollama sans clé | idem |
| UC-CPT-04-U13 | `ApiKeysSection` (seul, coutures `deps`) | Message serveur ou repli générique, clé envoyée sans espaces, pas de rechargement après échec, liste datée | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-CPT-04-F01 | Nominal | API | Liste vide → 204 → `{provider, createdAt}` ; chiffré en base | `api/tests/UseCases/Functional/UcCpt04GererClesApiTest.php` |
| UC-CPT-04-F02 | A3 | API | Nouveau navigateur : clé en clair, `no-store` | idem |
| UC-CPT-04-F03 | A4 | API | Remplacement : une entrée, nouvelle clé, date mise à jour | idem |
| UC-CPT-04-F04 | A5 | API | DELETE 204 réel ; GET/DELETE ensuite 404 | idem |
| UC-CPT-04-F05 | E1 | API | 503 sur les quatre routes (même en visiteur) ; rien effacé ; reste de l'API OK | idem |
| UC-CPT-04-F06 | E2 | API | 401 sur les quatre routes | idem |
| UC-CPT-04-F07 | E3 | API | 422 par champ ; bornes 8 et 4096 acceptées | idem |
| UC-CPT-04-F08 | E5 | API | Rotation → 404 sans fuite, entrée toujours listée | idem |
| UC-CPT-04-F09 | E6 | API | PUT/DELETE sans jeton → 403, rien ne change | idem |
| UC-CPT-04-F10 | RG5 | API | Un autre compte ne voit ni ne supprime la clé | idem |
| UC-CPT-04-F11 | Nominal | IHM | `<App/>` : champ masqué, bouton < 8 inactif, PUT + CSRF, confirmation, liste datée, clé jamais réaffichée | `web/test/usecases/functional/uc-cpt-04-gerer-cles-api.test.jsx` |
| UC-CPT-04-F12 | A5 | IHM | Suppression depuis la liste | idem |
| UC-CPT-04-F13 | E1 | IHM | 503 affiché dans la section | idem |
| UC-CPT-04-F14 | E3 | IHM | 422 affiché, rien listé | idem |
| UC-CPT-04-F15 | A1 | IHM | Assistant sans compte : clé locale pré-remplie, synchro grisée, run avec la clé, aucun appel `/api/keys` | idem |
| UC-CPT-04-F16 | A2 | IHM | Synchro cochée : PUT + CSRF avant le run ; clé aussi locale | idem |
| UC-CPT-04-F17 | A3 | IHM | « Récupérer la clé depuis le serveur » remplit le champ | idem |
| UC-CPT-04-F18 | E4 | IHM | 404 affiché, champ inchangé | idem |
| UC-CPT-04-F19 | E1 | IHM | Synchro 503 : run non démarré, message | idem |

### Tests existants liés (non-régression)

- `api/tests/KeysTest.php` — aller-retour chiffré, nonce par entrée, liste sans clé, propriétaire seul, 503, rotation.
- `api/tests/AuthAccountDeletionTest.php`, `api/tests/CartographiesPurgeTest.php` — purge de `user_api_keys` avec le compte.
- `web/src/api/keys.test.js`, `web/src/views/account/ApiKeysSection.test.jsx` — client et composant isolés.
- `web/src/components/RunWizard.test.jsx` — la clé saisie est mémorisée localement au lancement.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcCpt04
cd web && npx vitest run test/usecases --testNamePattern UC-CPT-04
```

## Limites

- La section du profil n'affiche que « Validation échouée » pour un `422`
  (pas le détail par champ) ; les cas atteignables depuis l'interface sont
  une clé de plus de 4096 octets ou contenant un caractère de contrôle.
- La section du profil ne gère que le stockage **serveur**. Aucune commande
  de l'interface n'efface la clé **locale** (`humanome-keys`) : l'assistant
  refuse de continuer avec un champ vide, et décocher « Mémoriser » n'efface
  pas une clé déjà mémorisée. Il faut vider les données du site dans le
  navigateur ; la suppression du compte ne la touche pas non plus (UC-CPT-06).
