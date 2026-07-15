# ADR-010 — Twin9 : Golden Prompt opérationnel, secret des gabarits, prépaiement

Date : 2026-07-13 · Statut : accepté

## Contexte

Le propriétaire fournit **Twin9** (dossier local `Twin9/`, hors dépôt) : le
véritable Golden Prompt de la plateforme. Ce n'est pas un « paquet de prompts »
au sens P10 mais un **système multi-agents complet** en Python : collège de
modèles taggeurs (N modèles × 7 pôles), ancrage verbatim des citations,
heat map/consensus mécanique, greffier stigmergique, juge léger ×N +
contre-lecture, tribunal adversarial à jury calculé (socle 4+1, second tour,
2 gardiens, résolution SANS vote), second ressort par faisceaux inter-journées,
relectures évolutives (kairos, pôles, histoires, rapporteur), état persistant
additif à empreintes. ~4 400 lignes Python + 29 gabarits de prompts + banc de
mesure. Un run de 10 journées ≈ **3 100 appels LLM**.

Exigences du propriétaire :
1. Opérationnel sur https://humanome.xyz (OVH mutualisé : PHP seul, pas de
   Node serveur, pas de processus longs — ADR-003/ADR-005), réécrit en JS.
2. Les gabarits (prompts) sont **réservés aux administrateurs** — pas aux
   promptologues. Éditeur en ligne sommaire souhaité (gabarits + réglages).
3. Utilisable par tout le monde **moyennant finance** : prépaiement de l'usage
   de la clé API plateforme, choix du modèle. **PayPal**, aucune donnée
   bancaire stockée chez nous.
4. Clé API privée de l'utilisateur possible, **à condition qu'il soit
   impossible de « sniffer » nos prompts** via les échanges.

## Décision

### 1. Partage client/serveur : « l'algorithme voyage, les gabarits jamais »

- **Moteur JS côté client** (`engine/src/twin9/`, ESM sans DOM, ADR-001) :
  portage fidèle de toute la logique déterministe (découpage, ancrage,
  heat map, consensus, routage, résolution calculée, fusion, second ressort
  mécanique, état persistant, sorties). L'algorithme est public par nature
  (il s'exécute dans le navigateur) ; le SECRET industriel réside dans les
  gabarits de prompts, pas dans le graphe d'orchestration.
- **Chaque appel LLM passe par `POST /api/twin9/appel`** : le client envoie
  `{etape, payload}` (étiquette d'étape + variables du gabarit — texte de la
  journée, pièces, positions…) ; le serveur charge le gabarit **depuis la
  base**, le rend, appelle le modèle, et renvoie **uniquement** la sortie du
  modèle + l'usage (tokens réels). Le gabarit ne transite jamais vers le
  navigateur. Un run = le navigateur séquence ~3 000 appels (pool de
  concurrence ~6, reprise par IndexedDB) — même famille d'architecture que
  les runs individuels existants (P8), latence unitaire dans les limites
  OVH prouvées par la démo P6.

### 2. Secret des gabarits — modèle de menace et parades

| Menace | Parade |
|---|---|
| Lire le gabarit dans le trafic client | Impossible : rendu serveur, la réponse ne contient que la sortie du modèle |
| Le faire réciter par le modèle (injection via le portfolio) | Consignes anti-injection déjà présentes dans les gabarits (v8) + **filtre anti-fuite serveur** : toute sous-chaîne longue (≥ 12 mots consécutifs) commune entre gabarit rendu et sortie est expurgée avant renvoi, événement d'audit compté |
| Clé privée pointée vers un serveur attaquant (base_url) | **base_url verrouillée** : `api.anthropic.com` uniquement, non configurable par l'utilisateur ; la clé privée est stockée chiffrée (libsodium, ADR-004) et utilisée **côté serveur** — jamais d'appel LLM depuis le navigateur pour Twin9 |
| Lire les gabarits dans le dépôt | Le dossier source `golden-twin9/` est **gitignoré** (comme `golden-prompt/`) ; en production les gabarits vivent en base (`twin9_protocole`), importés par `POST /api/admin/twin9/import` (X-Migrate-Token) |
| Promptologue via l'atelier P10 | Les routes twin9 admin exigent le rôle **admin** ; l'atelier promptologue n'expose rien de twin9 |
| Fuite par messages d'erreur | Les erreurs de rendu/appel renvoient des messages génériques, jamais le gabarit |

Résidu assumé : les NOMS d'étapes, les variables d'entrée et la FORME des
sorties sont visibles du client (nécessaires à l'orchestration) — ils ne
révèlent pas le contenu des gabarits, qui porte la valeur.

### 3. Facturation : crédit prépayé, PayPal en flux redirect

- Tables `twin9_credits` (solde en **micro-USD** par compte) et
  `twin9_credit_events` (recharges et débits, avec tokens réels et modèle —
  compteurs uniquement, jamais de contenu).
- **Débit par appel** : réservation ATOMIQUE du pire-cas avant l'appel
  (revue de sécurité, finding A), réconciliée ensuite aux tokens réels
  renvoyés par l'API Anthropic × tarif du modèle × **marge** (configurable
  admin ; **défaut ×1,10 — décision du propriétaire, 2026-07-13** : les +10 %
  couvrent les frais PayPal et participent à l'hébergement OVH, au nom de
  domaine et au budget Haiku de la démo gratuite ; les packs démarrent à
  10 USD car le frais FIXE PayPal pèserait ~9 % d'un pack de 5 USD à lui
  seul). Refus d'appel si solde insuffisant (le client s'arrête proprement
  et reprend après recharge).
- **Factures récapitulatives et suivi** (demande du propriétaire) :
  agrégation déterministe du grand-livre par mois — numéro stable
  `HUM-TW9-{AAAAMM}-{compte}`, consommation nette par modèle, recharges
  PayPal, ajustements — pour les particuliers ET les comptes établissement
  (même grand-livre). `GET /api/twin9/facture`, `GET /api/twin9/depenses`
  (tableau de bord quotas/dépenses), `GET /api/twin9/admin/comptes`
  (surveillance admin). Rendu imprimable côté front.
- **PayPal Orders v2 en redirection** (pas de SDK JS → pas d'assouplissement
  CSP ; pas de webhook nécessaire au MVP) : `POST /api/twin9/credit/paypal/creer`
  (montant d'un pack) → URL d'approbation PayPal → retour sur
  `#/compte/credit` → `POST …/capturer` (serveur-à-serveur avec
  client_id/secret en env `PAYPAL_*`, hors webroot). Nous ne voyons ni ne
  stockons **aucune** donnée bancaire — seulement l'id d'ordre PayPal, le
  montant et l'état. Mode `sandbox`/`live` par env ; tant que les credentials
  ne sont pas configurés, l'UI affiche « recharge indisponible » proprement.
- **Estimation avant paiement** : le moteur JS exécute le pipeline en mode
  **mock** (déterministe, 0 LLM, < 1 s) sur le portfolio réel → compte
  d'appels/tokens exact par étape × grille tarifaire → devis affiché avant
  tout débit. (Le mock ne dépend que des métadonnées, pas des gabarits.)

### 4. Clé privée : mêmes canaux, zéro débit

L'utilisateur peut enregistrer sa clé Anthropic (chiffrée ADR-004). Les appels
suivent EXACTEMENT le même chemin serveur (gabarits en base, filtre anti-fuite,
base_url verrouillée) — seule la facturation change (aucun débit). Le mode
« roster multi-fournisseurs » de Twin9 (OpenAI, Ollama…) n'est PAS exposé en
v1 : Anthropic uniquement (passes multiples pour la stabilité mono-famille,
mécanisme prévu par Twin9). Ollama/local n'a pas de sens sur ce site.

### 5. RGPD/nLPD

Twin9 sur le site implique que le texte du portfolio **transite** par notre
serveur et par Anthropic (contrairement aux runs P8 côté client). Parades :
consentement explicite par run (écran dédié), aucun stockage serveur du texte
(l'endpoint est sans état ; état persistant et artefacts restent en IndexedDB
côté client), journalisation compteurs-seulement, page confidentialité mise à
jour. Le mode `--donnees-reelles` (tout local) du Python n'a pas d'équivalent
site : pour des journaux d'élèves réels soumis à la nLPD, la réponse reste
l'outil local — le site l'indique dans l'écran de consentement.

### 6. Éditeur admin

`#/admin/twin9` (rôle admin exclusivement) : liste des gabarits (DB), éditeur
texte avec versions (historique conservé, retour arrière), éditeur de la
config (JSON validé par schéma : seuils, jury, offres de modèles, marge,
packs), et **banc d'essai** : rendre un gabarit avec un payload d'exemple et,
au choix, l'exécuter réellement (débité sur la clé plateforme, admin informé).
L'admin voit les gabarits — c'est son rôle ; personne d'autre.

## Conséquences

- Deux « golden » coexistent : l'import P12 existant (paquet aurora-v3, façon
  P10) reste pour l'atelier promptologue ; Twin9 est un système à part,
  admin-only, avec son propre stockage et ses propres routes.
- Le portage JS est validé par **parité mock** : `python3 twin9.py --mock
  --salt X --sans-etat` est l'oracle ; le moteur JS en mode mock doit
  reproduire `carto_evolutive.json` à l'identique (hors horodatages). Les
  tests de parité lisent les gabarits dans le dossier local gitignoré et se
  SAUTENT proprement s'il est absent (le CI public n'a pas les secrets).
- ~3 000 appels HTTP par run : latence maîtrisée par pool client, reprise
  IndexedDB, et affichage de progression par étape. Les coûts réels rendent
  le prépaiement indispensable — c'est le modèle économique demandé.
