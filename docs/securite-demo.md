# Sécurité de la démo publique — modèle de l'abuseur (P6)

**Périmètre :** le proxy LLM plateforme (`POST /api/llm`, `GET /api/llm/challenge`,
`GET /api/llm/status`) et le proxy texte Google Docs (`GET /api/gdoc-text`) —
`api/src/routes/llm.php`, `api/src/Llm/**`, `api/config/demo.php`. Ce sont les
seules surfaces exposées **sans compte** (le visiteur est l'absence de session,
`docs/autorisations.md`).

**Ce que veut l'abuseur :** vider le budget API de la plateforme, exfiltrer la
clé `ANTHROPIC_API_KEY`, contourner les quotas, ou faire tomber le service.

**Ce document** est organisé de son point de vue : pour chaque angle d'attaque,
la **défense** en place puis le **résidu accepté** (ce qui reste possible et
pourquoi on l'assume). Il rend compte de l'audit adversarial P6 : une faille
réelle trouvée et corrigée, cinq angles déjà couverts, résidus documentés.

## Pipeline de gardes (le moins cher d'abord)

`POST /api/llm` empile les gardes du moins coûteux au plus coûteux, pour rejeter
un abus avant de dépenser quoi que ce soit :

1. **Interrupteur** `DEMO_ENABLED` (503 immédiat).
2. **Honeypot** : champ caché `website` rempli → 400 banal, indistinguable d'une
   erreur de validation (aucun indice que c'est un piège).
3. **Taille d'entrée** : `system + prompt` ≤ `maxInputChars` (20 000 car.) → 413.
4. **Preuve de travail** (PoW) : défi signé HMAC, à usage unique, expirant.
5. **Quota par IP et par heure** (`perIpPerHour`, partagé avec gdoc-text).
6. **Coupe-circuit journalier global** : plafond de tokens ET de budget USD.
7. **Appel amont** avec fournisseur / modèle / plafond de tokens **imposés serveur**.
8. **Compteurs seulement** (RGPD §6) : tokens in/out + coût estimé, jamais le contenu.

---

## Faille réelle trouvée et corrigée — contournement du quota par rotation IPv6 /64

**Sévérité : élevée.** Le bucket du quota par IP hachait l'adresse **entière** :
`'llm:' . hash('sha256', $remoteAddr)`. En IPv6, une allocation de routine est un
**/64 complet** (2^64 adresses — souvent un /56 ou /48). L'abuseur faisait donc
varier l'identifiant d'interface (`2001:db8:0:1::1`, `::2`, …) pour obtenir un
**quota neuf à chaque requête**.

Impact le plus fort sur **`GET /api/gdoc-text`** : cet endpoint n'a **ni preuve
de travail ni coupe-circuit journalier** — le quota par IP est son **seul**
plafond. La rotation IPv6 le transformait en **proxy ouvert non borné** (1 Mo par
requête, débit uniquement limité par la bande passante). Sur `POST /api/llm`, le
coupe-circuit budgétaire ($5/jour) restait un garde-fou, mais le quota par IP
était neutralisé.

**Correctif :** `api/src/ClientIp.php` — `ClientIp::bucketIdentity()` réduit toute
adresse IPv6 à son **préfixe réseau /64** avant hachage ; l'IPv4 reste par
adresse ; l'IPv6 mappée-IPv4 (`::ffff:a.b.c.d`) est traitée comme l'IPv4 sous-
jacente (et **non** comme un /64 tout-zéro, ce qui aurait fusionné tous les
clients mappés dans un seul bucket — un déni de service sur les utilisateurs
légitimes). La propriété RGPD est préservée : on hache toujours l'identité, aucun
IP brut ne touche la base (§6.5).

Le même défaut existait sur le limiteur d'authentification (`routes/auth.php` :
`register:` et `login:` — spam d'inscription / force brute par email). Corrigé
au passage avec le même helper.

**Démonstration (rouge → vert) :**
`LlmProxyTest::testIpv6QuotaCannotBeBypassedByRotatingWithinA64` — épuise le quota
sur `2001:db8:0:1::1`, puis prouve qu'une adresse sœur du même /64 reste bloquée
(échouait avant le correctif : `200` au lieu de `429`) et qu'un /64 différent
obtient bien un bucket neuf. Idem côté gdoc-text :
`LlmGdocTextTest::testGdocQuotaIsNotBypassedByRotatingWithinAnIpv6_64`. Logique du
bucketing couverte par `ClientIpTest` (dont le garde anti-sur-fusion IPv4-mappée).

---

## Angle 1 — Contourner la preuve de travail

**Ce que tente l'abuseur :** pré-calculer des défis en masse ; réutiliser un nonce
entre IP ; rejouer un défi résolu ; profiter d'une difficulté trop basse.

**Défense** (`api/src/Llm/PowChallenge.php`, `routes/llm.php`) :
- **Défi signé** `v1.<expire>.<aléa>.<hmac>` : l'abuseur ne peut pas forger de
  défi ni prolonger l'expiration (HMAC-SHA256 sur `POW_SECRET`).
- **Usage unique** appliqué à la rédemption : insertion de `sha256(challenge)`
  dans `llm_pow_challenges` (clé primaire) — un rejeu (même en concurrence) tombe
  sur une violation `23000` → `429 pow_reused`. Atomique, pas de TOCTOU.
- **Expiration vérifiée serveur** : `verify()` refuse `expires < now` (EXPIRED).
  La fenêtre post-purge est fermée : un défi purgé est déjà expiré, donc rejeté
  par `verify()` avant même l'insertion.
- **Nonce lié au défi** : le nonce est vérifié sur `sha256(challenge . ':' . nonce)`.
  Un nonce valide pour un défi ne vaut pour aucun autre → pas de réutilisation
  entre IP, d'autant que le défi est à usage unique **global** (pas par IP).

**Résidu accepté :**
- **Difficulté faible pour un attaquant natif.** 20 bits ≈ 1 s dans un navigateur,
  mais ≈ quelques millisecondes en code natif / GPU. La PoW **n'est pas** le garde
  principal : elle décourage les bots navigateur naïfs. Les vrais plafonds de
  budget sont le **quota par IP (/64)** et le **coupe-circuit journalier**.
  Augmenter la difficulté pénaliserait les usagers légitimes (8 appels × 1 s déjà).
- **Émission de défis non limitée** (`GET /api/llm/challenge`). Choix délibéré :
  l'endpoint est **sans état** (aucune écriture en base à l'émission). Le
  pré-calcul en masse est borné par le TTL de 2 min (≈ 120 défis résolubles par
  navigateur dans la fenêtre) et **la rédemption reste soumise au quota**. Ajouter
  un limiteur y introduirait une **écriture par requête** — un vecteur
  d'amplification pire que le coût CPU actuel. On assume le statu quo.

---

## Angle 2 — Contourner le quota par IP

**Ce que tente l'abuseur :** forger `X-Forwarded-For` ; faire tourner un /64 IPv6.

**Défense :**
- **`REMOTE_ADDR` seul fait foi.** Les en-têtes de forwarding fournis par le
  client (`X-Forwarded-For`, `X-Real-IP`, …) sont **ignorés** (`routes/llm.php`,
  `routes/auth.php`). Sur OVH mutualisé, derrière l'IPLB OVH, `REMOTE_ADDR` porte
  déjà l'IP client réelle : c'est la source correcte. Forger un en-tête ne
  déplace pas le bucket.
- **Bucketing IPv6 /64** (voir la faille corrigée ci-dessus). La rotation
  d'interface au sein d'un /64 partage désormais un seul bucket.

**Résidu accepté :**
- **Un détenteur de /48 dispose encore de 65 536 buckets /64.** Pour `POST /api/llm`,
  le **coupe-circuit journalier** ($5, 2 M tokens) reste le plafond dur — un
  abuseur bien doté vide au pire le budget du jour, ce qui est précisément le rôle
  du coupe-circuit. Pour **gdoc-text** (pas de coupe-circuit journalier), il reste
  un **résidu de DoS de bande passante** proportionnel au nombre de /64 détenus ;
  bornage plus fin (par /48, ou plafond journalier gdoc) reporté à P12 si l'abus
  se matérialise.

---

## Angle 3 — Amplifier le coût par requête

**Ce que tente l'abuseur :** injecter un `provider` / `model` cher, un `maxTokens`
géant, un prompt système énorme, une entrée massive.

**Défense :**
- **Fournisseur, modèle et plafond de tokens imposés serveur.** `provider`,
  `model`, `maxTokens` envoyés par le client sont **acceptés puis ignorés** —
  `routes/llm.php` passe toujours `$config->provider/model/maxTokensPerRequest`
  à l'appel amont (`AnthropicProvider::complete`). Couvert par
  `LlmProxyTest::testServerImposesProviderModelAndMaxTokens` (le client demande
  `gpt-4o` / `maxTokens: 999999` → le payload amont reste haiku / 512).
- **Taille d'entrée plafonnée AVANT l'appel amont** : `mb_strlen(system . prompt)
  > maxInputChars` → 413, avant toute dépense
  (`LlmProxyTest::testOversizedInputAnswers413`).
- **Plafond de sortie** : `maxTokensPerRequest` (2048) imposé au fournisseur.

Coût par requête ainsi borné (≈ 5 500 tokens d'entrée + 2048 de sortie sur haiku
≈ 0,016 $), donc le budget journalier ≈ 300 requêtes.

**Résidu accepté :** l'entrée est mesurée en **caractères**, pas en tokens ; une
entrée dense peut friser un ratio légèrement supérieur. Borne néanmoins
déterministe et couverte par le coût maximal par requête.

---

## Angle 4 — Exfiltrer la clé API

**Ce que tente l'abuseur :** lire la clé dans une erreur amont relayée, dans les
logs, ou via une SSRF de gdoc-text (métadonnées cloud, hôte interne, redirections).

**Défense :**
- **La clé ne circule que dans l'en-tête `x-api-key`** de la requête amont —
  jamais dans une URL, un log, une réponse, ou un message d'exception
  (`AnthropicProvider`, `HttpClientException`, `UpstreamException`). Couvert par
  `LlmProxyTest::testApiKeyNeverAppearsInResponses` (succès ET erreur 500 amont).
- **Erreur amont relayée = `error.message` du fournisseur uniquement** (jamais un
  en-tête ni le corps de requête). Anthropic n'y renvoie pas la clé.
- **Middleware d'erreur Slim** : `displayErrorDetails` n'est vrai qu'en `dev`
  (`Bootstrap.php`) ; en production, une exception non capturée donne un 500
  générique — aucune fuite de détail.
- **Anti-SSRF gdoc-text** : origine **codée en dur** (`docs.google.com`), `docId`
  validé `^[A-Za-z0-9_-]{20,80}$`, **`CURLPROTO_HTTPS` seul**, redirections suivies
  **manuellement** (curl ne suit rien) au plus 3 fois et **uniquement** vers
  `*.googleusercontent.com` en https, sans IP littérale ni port non standard.
  Couvert par `LlmGdocTextTest::testRedirectTricksAreRefused` (http, IP,
  usurpation de suffixe, absence de frontière de point, port non standard).

**Résidu accepté :** on relaie le **texte d'erreur** du fournisseur amont dans un
502 (borné, sans secret). Divulgation d'info mineure (un abuseur apprend qu'une
erreur amont est survenue) — assumée pour l'utilité du message.

---

## Angle 5 — Persistance / RGPD (faire écrire du contenu)

**Ce que tente l'abuseur :** faire atterrir du contenu utilisateur (prompt,
réponse, texte de document, IP brute) dans une table ou un log.

**Défense :** **compteurs seulement** (cahier §6.5). Sur tout le chemin LLM/gdoc,
les seules écritures sont :
- `llm_usage_daily` : compteurs de tokens + coût (aucun contenu) ;
- `llm_pow_challenges` : `sha256(challenge)` (aucune donnée client) ;
- `rate_limits` : bucket **haché** (jamais d'IP brute).

Aucun `error_log` n'existe sur le chemin LLM ni gdoc (grep vérifié : les seuls
`error_log` du dépôt sont dans `Middleware/CsrfMiddleware.php`, `routes/system.php`
(migrate), `routes/system.php`/`import-referentiel` et `routes/referentiel.php` —
tous hors chemin démo, et aucun ne journalise de contenu utilisateur). Couvert par
`LlmProxyTest::testSuccessfulCallIncrementsCountersOnly` (le prompt « confidentiel »
n'apparaît dans **aucune** table).

**Résidu accepté :** aucun identifié sur cet angle.

---

## Angle 6 — Déni de service

**Ce que tente l'abuseur :** des requêtes concurrentes qui contournent les
compteurs (atomicité) ; un fichier gdoc de 10 Go pour saturer la mémoire.

**Défense :**
- **Incréments atomiques** : quota (`RateLimiter`) et compteurs journaliers
  (`UsageCounters`) utilisent `INSERT … ON DUPLICATE KEY UPDATE compteur = … + 1`
  — sûr en concurrence, pas de perte d'incrément. La rédemption PoW est
  sérialisée par la clé primaire.
- **Téléchargement gdoc plafonné pendant le transfert** : `CurlHttpClient`
  interrompt le transfert (`CURLOPT_WRITEFUNCTION` renvoie 0) dès que le corps
  dépasse 1 Mo → mémoire bornée à ~1 Mo, jamais 10 Go. Timeout de 15 s. Couvert
  par `LlmGdocTextTest::testOversizedDocumentAnswers413`.

**Résidu accepté :**
- **Dépassement du coupe-circuit journalier sous concurrence.** Le plafond est
  lu **avant** l'appel amont et écrit **après** (`isExhausted` puis `record`) : N
  requêtes concurrentes peuvent toutes passer le contrôle avant que l'une n'écrive.
  Le dépassement est **borné par le nombre de requêtes en vol** (× coût max ≈
  0,016 $), lui-même limité par le quota par IP. Une réservation atomique de
  budget serait disproportionnée sur mutualisé — résidu assumé.
- **Rafale au changement de fenêtre horaire (fixed-window).** `RateLimiter` est à
  fenêtre fixe : un abuseur peut placer `perIpPerHour` requêtes à `10:59:59` puis
  `perIpPerHour` de plus à `11:00:00`, soit un pic de **2×** à la frontière. Résidu
  standard du fixed-window, borné et mineur pour le budget de la démo ; un
  sliding-window serait disproportionné sur mutualisé.

---

## Tableau des résidus acceptés

| # | Angle | Résidu accepté | Garde-fou de repli |
|---|-------|----------------|--------------------|
| 1 | PoW | Difficulté ~gratuite pour un attaquant natif | Quota /64 + coupe-circuit journalier |
| 1 | PoW | Émission de défis non limitée (sans état) | TTL 2 min + rédemption sous quota |
| 2 | Quota IP | Un /48 = 65 536 buckets /64 | LLM : coupe-circuit $5/jour ; gdoc : résidu bande passante |
| 3 | Coût | Entrée mesurée en caractères, pas en tokens | Coût max par requête borné |
| 4 | Clé | Texte d'erreur amont relayé (sans secret) | 502 générique, clé jamais dans le corps |
| 6 | DoS | Dépassement journalier sous concurrence | Borné par requêtes en vol × coût max |
| 6 | DoS | Rafale 2× à la frontière de fenêtre horaire (fixed-window) | Borné, coupe-circuit journalier au-dessus |

## Références

- **Code :** `api/src/routes/llm.php`, `api/src/routes/auth.php`,
  `api/src/ClientIp.php`, `api/src/Llm/{PowChallenge,UsageCounters,DemoConfig,`
  `AnthropicProvider,CurlHttpClient,Pricing}.php`, `api/config/demo.php`,
  `scripts/migrations/006_llm_usage.sql`.
- **Tests :** `api/tests/{ClientIpTest,LlmProxyTest,LlmPowTest,LlmGdocTextTest,`
  `LlmMockProviderTest,AuthRateLimitTest}.php`, `web/src/lib/pow.test.js`,
  `web/src/lib/gdoc.test.js`.
- **Config d'abus :** `perIpPerHour`, `dailyGlobalTokens`, `dailyBudgetUsd`,
  `powDifficultyBits`, `maxInputChars`, `maxTokensPerRequest` — tous
  surchargeables par variable d'environnement `DEMO_*` (`api/config/demo.php`).
