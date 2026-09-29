# UC-APP-10 — Lancer une analyse approfondie (Twin9)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (tout compte connecté) |
| **Acteurs secondaires** | Fournisseur LLM (Anthropic) ; plateforme (gabarits confidentiels en base, clé plateforme, crédit prépayé — UC-APP-11) ; administrateur (offre, contribution, promotion — UC-ADM-05) ; atelier (gabarits — UC-PRO-08) |
| **Portée** | humanome.xyz — vue `#/twin9`, moteur navigateur `engine/src/twin9/`, proxy `POST /api/twin9/appel`, offre `GET /api/twin9/meta` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2, §4.3 (découpage journalier + fusion), §4.4, §6 (RGPD), §7 (Golden Prompt payant) ; ADR-001, ADR-004, ADR-007, ADR-010 |
| **Statut** | Implémenté, **parcours réel bloqué** par une anomalie, et d'autres défauts latents derrière elle (voir « Anomalies constatées ») ; démonstration opérationnelle |

## Objectif

Permettre à un apprenant d'obtenir l'analyse **approfondie** de son portfolio
par Twin9, le Golden Prompt de la plateforme : collège de lecteurs, ancrage
verbatim des citations, consensus mécanique, instruction rapide, tribunal
adversarial à résolution calculée, fusion chronologique et relectures. Le
moteur tourne dans le navigateur mais chaque appel LLM passe par le serveur,
qui seul détient les **gabarits confidentiels**. L'usage est **prépayé**
(contribution +20 %) ou, pendant une promotion, gratuit avec la clé de
l'apprenant.

## Déclencheur

L'apprenant ouvre `#/twin9` (ou `#/twin9/demo` pour la démonstration).

## Préconditions

- Compte actif et session (UC-CPT-01, UC-CPT-02).
- Les gabarits, les fiches confidentielles et le référentiel ont été importés
  (`POST /api/admin/twin9/import`, UC-PRO-08 A4) : Twin9 est **activé**.
- Voie plateforme : la clé `ANTHROPIC_API_KEY` est configurée et le solde couvre
  la réserve de chaque appel (UC-APP-11). Voie clé privée : promotion ouverte
  (UC-ADM-05) et clé Anthropic enregistrée au profil (UC-CPT-04).

## Garanties en cas de succès

- Un `carto_evolutive.json` (sortie native Twin9) est produit dans le navigateur
  et rendu : sunburst évolutif commun au site, synthèse kairos, rapport du
  Rapporteur, profil ipsatif, renvois au cartographe, journées analysées ;
  exportable et enregistrable localement (type `twin9`).
- Le solde n'est débité que du **coût réel** des appels (réserve réconciliée).
- Aucun gabarit, aucune fiche confidentielle n'a atteint le navigateur.

## Garanties minimales (en cas d'échec)

- Un appel refusé n'atteint jamais le fournisseur ; un appel en échec est
  intégralement remboursé ; aucun découvert possible.
- Les messages d'erreur sont génériques : jamais un fragment de gabarit.
- Rien du portfolio n'est conservé côté serveur (compteurs seulement).

## Scénario nominal

1. L'apprenant ouvre `#/twin9`. La vue interroge `GET /api/auth/me`, puis
   `GET /api/twin9/meta` — **tout** ce que le client voit de Twin9 : noms des
   étapes, longueurs et variables des gabarits (jamais leur contenu), modèles et
   prix **déjà margés**, promotion, packs, réglages non secrets du pipeline,
   structure du référentiel, solde, disponibilité d'une clé privée. Elle cherche
   aussi un run interrompu dans IndexedDB (A3).
2. L'apprenant coche le **consentement** : le texte du portfolio transitera par
   le serveur et le fournisseur, sans être conservé.
3. Il colle son portfolio en journées datées (plus de 20 caractères, sinon
   l'estimation reste désactivée), choisit le modèle (présélection : le
   **premier** modèle de l'offre ; étages couverts affichés, voir l'anomalie 4)
   et garde « Crédit plateforme » (solde affiché).
4. « Estimer le coût » : le moteur tourne en **mode mock** (0 appel LLM, 0 appel
   réseau) avec le sel fixe `twin9-devis`, le même roster mono-famille (3 passes)
   et les mêmes réglages que le run réel. Le sel n'est repris qu'en
   **démonstration**, où le nombre d'appels annoncé est exact ; en réel, le run
   part sans sel et son graphe (escalades au tribunal, second ressort) dépend des
   réponses du modèle : le nombre d'appels est une **estimation**. Le devis
   affiche ce nombre et une fourchette de coût par étage (taggers, rapide,
   tribunal). Solde sous l'estimation basse : lancement bloqué (E4) ; sous
   l'estimation haute : avertissement « couvre l'estimation basse mais pas la
   haute », lancement permis.
5. « Lancer l'analyse » : le moteur est lancé en mode réel avec un état
   persistant **en mémoire** ; la progression (journées puis fusion) et le nombre
   d'appels s'affichent ; les paramètres du run sont sauvegardés localement.
6. Chaque appel LLM devient `POST /api/twin9/appel {etape, variables, modele,
   etage, facturation, max_tokens?}` avec le jeton CSRF : `etape` = chemin du
   gabarit (sans `.md`), `variables` = état de run **sans** les fiches
   confidentielles, `modele` = le modèle choisi à l'étape 3 pour **tous** les
   appels, `etage` déduit de l'étiquette d'appel ; `max_tokens` est facultatif et
   **jamais envoyé par le moteur actuel** (défaut serveur 4 096). Avant la route,
   `CsrfMiddleware` refuse une session sans jeton valide (403). Le serveur :
   vérifie l'activation (503) et la session
   (401), borne le corps (300 Ko, 413), valide le JSON (400) puis les champs
   (422), refuse la clé privée hors promotion (403), applique le rythme (429),
   **injecte les fiches** à partir des clés de lookup, **rend** le gabarit
   (404 / 422 « Variables non résolues » avec les seuls noms), **réserve** le
   pire-cas (402), appelle Anthropic sur l'URL verrouillée (remboursement en cas
   d'échec), **réconcilie** au coût réel, **expurge** toute récitation (A6) et
   renvoie `{sortie, tokens_in, tokens_out, cout_microusd, stop_reason}`.
7. En fin de run, le `carto_evolutive` est sérialisé (JSON à la Python), le run
   sauvegardé localement est effacé et les résultats s'affichent : sunburst
   (projection `twin9ToMergeDocument`), synthèse, rapport, profil ipsatif,
   renvois, journées reconstituées ; tout narratif du modèle est assaini
   (ADR-007).
8. L'apprenant exporte le JSON (`carto_evolutive_<journal>.json`, octets
   canoniques) ou clique « Enregistrer dans mes cartographies »
   (enregistrement **local** IndexedDB, type `twin9`, privé, titre daté) ; le
   bouton devient « Enregistrée dans mes cartographies ✓ ».

## Scénarios alternatifs

- **A1 — Démonstration** (étape 1) : via `#/twin9/demo` ou le bouton « Voir une
  démonstration (données fictives) », même sans compte : portfolio et
  référentiel fictifs, moteur mock en local ; devis, run et résultats complets,
  **aucun appel d'analyse ni débit** (seules les lectures de session et d'offre
  partent au montage de la vue) ; bandeau « données fictives », pas de bouton
  d'enregistrement. La démonstration écrit pourtant, puis efface, le « run
  courant » local de reprise (anomalie 6).
- **A2 — Clé privée pendant la promotion** (étape 3) : l'option « Ma clé privée
  Anthropic » n'apparaît que si la promotion est ouverte **et** qu'une clé est
  enregistrée ; le devis indique « aucun débit plateforme » et le lancement est
  permis quel que soit le solde. Côté serveur, la clé de l'apprenant est
  déchiffrée et utilisée sur le **même** chemin verrouillé ; `cout_microusd = 0`,
  aucun événement au grand-livre.
- **A3 — Reprise d'une analyse interrompue** (étape 1) : un run sauvegardé est
  proposé : « Restaurer les saisies » remet portfolio, modèle, facturation et
  **recoche le consentement** donné au run interrompu (exception à RG11) ;
  « Ignorer » l'efface. Seuls les **paramètres** sont conservés (jamais l'état
  du moteur).
- **A4 — Annulation** (étape 5) : « Annuler » lève un drapeau lu seulement à la
  fin de la journée ou de l'étape de fusion en cours (`onProgress`) : les appels
  déjà partis d'ici là sont facturés ; l'analyse passe alors en pause, et
  « Reprendre l'analyse » relance avec le **même** état en mémoire (journées
  déjà analysées non rejouées).
- **A5 — Copie serveur** (étape 8) : depuis « Mes cartographies », l'apprenant
  peut copier le résultat sur le serveur (`POST /api/cartographies`, type
  `twin9`, opt-in daté, UC-APP-04) ; la liste ne renvoie jamais le document, la
  suppression est une purge réelle.
- **A6 — Sortie qui récite le gabarit ou une fiche** (étape 6) : le filtre
  anti-fuite remplace toute séquence commune d'au moins 48 caractères normalisés
  par `[expurgé]` ; la citation du portfolio de l'apprenant reste intacte ;
  l'audit `twin9_fuite_expurgee` n'enregistre que `{etape, fuites}` ; le nombre
  de fuites n'est jamais renvoyé au client.

## Scénarios d'erreur

- **E1 — Visiteur sans session** (étape 1) : garde « L'analyse Twin9 nécessite un
  compte » et démonstration proposée ; l'API répond `401` sur `/appel` et `/meta`.
- **E2 — Twin9 non activé** (étape 1) : « L'analyse Twin9 est momentanément
  indisponible » ; `/appel` répond `503 Twin9 non disponible`.
- **E3 — Copie statique** (étape 1) : garde de session et démonstration ; si
  seule la méta manque, « Les fonctions serveur sont indisponibles sur cette
  copie du site ».
- **E4 — Solde insuffisant** (étape 4) : alerte « Solde insuffisant pour lancer
  l'analyse » avec lien `#/compte/credit`, bouton désactivé ; côté serveur, une
  réserve non couverte donne `402 {solde_microusd, requis_estime_microusd}`.
- **E5 — Solde épuisé en cours d'analyse** (étape 6) : le serveur répond `402`.
  La vue prévoit une pause « Rechargez votre crédit, puis reprenez : les journées
  déjà analysées ne seront pas refacturées » si le moteur lui **rejette** une
  `ApiError 402` (UC-APP-10-U35). Cette pause n'est aujourd'hui **pas
  atteignable** : le moteur avale l'erreur et termine le run sur une analyse
  dégradée, dont les journées sont mémorisées comme faites (anomalie 3,
  UC-APP-10-F11, UC-APP-10-U34).
- **E6 — Clé privée refusée** (étape 6) : hors promotion `403` (« Twin9 s'utilise
  avec nos crédits… ») ; promotion ouverte sans clé enregistrée `409`.
- **E7 — Requête invalide** (étape 6) : jeton CSRF absent ou invalide avec une
  session `403` (« Jeton CSRF absent ou invalide », avant la route) ; corps non
  JSON `400`, corps > 300 Ko `413`, champ manquant ou invalide `422` (étape,
  variables : objets ou listes **imbriqués** refusés — un objet **plat** de
  scalaires est accepté et rendu en JSON, voir l'anomalie 5 —, étage inconnu,
  modèle non proposé pour l'étage, `max_tokens` non entier, facturation),
  gabarit inconnu `404` générique ; rien n'est débité ni appelé.
- **E8 — Échec du fournisseur** (étape 6) : `502` (ou `504` délai, `429`
  saturation) au message générique ; la réserve est rendue (étiquette
  « … (remboursement échec) », modèle conservé pour la facture).
- **E9 — Échec du run** (étapes 5-7) : une erreur levée par le moteur lui-même
  est affichée telle quelle avec « Réessayer » (voir l'anomalie 1 : c'est
  aujourd'hui le cas de tout lancement réel). Les erreurs des appels serveur
  (E5-E8, E10-E11) n'y arrivent **pas** : le moteur les avale (anomalie 3).
- **E10 — Rythme dépassé** (étape 6) : au-delà de `appels_par_minute` (30 par
  défaut) → `429` + `Retry-After`.
- **E11 — Service non configuré** (étape 6) : clé plateforme absente → `503
  Service indisponible` ; clé maître absente en voie clé privée → `503
  Stockage de clés non configuré`.

## Règles de gestion

- **RG1 — Secret des gabarits** : le client n'envoie que `{etape, variables}` et
  ne reçoit que la sortie filtrée ; `/meta` n'expose que noms, longueurs et
  variables ; aucun message d'erreur ne cite un gabarit.
- **RG2 — Fiches confidentielles** : `COMPETENCE_FICHE` et `POLE_FICHES` ne sont
  jamais envoyées par le moteur (`varsClient`) ; le serveur les injecte depuis
  `CODE` et `POLE_NUM` + `POLE_FICHES_ORDRE` (ordre anti-gaming du moteur), et
  elles priment sur toute valeur cliente.
- **RG3 — Rendu** : substitution en une passe, non stricte ; toute variable non
  résolue bloque l'appel (`422`, noms seulement).
- **RG4 — Réserve pire-cas** : entrée = octets du prompt rendu, sortie =
  `max_tokens` ; débit conditionnel atomique (pas de découvert) ; réconciliation
  au coût réel ; remboursement intégral en cas d'échec.
- **RG5 — Tarif** : coût = ⌈tokens_in × prix_in × marge⌉ + ⌈tokens_out ×
  prix_out × marge⌉ µUSD, marge Twin9 ×1,20 par défaut ; l'apprenant ne voit que
  les prix margés.
- **RG6 — Offre par étage** : un modèle n'est accepté que pour les étages qu'il
  couvre (par défaut : Haiku taggers/rapide, Sonnet les trois, Opus tribunal).
- **RG7 — Clé privée** : seulement pendant la promotion ; même chemin serveur
  (URL verrouillée, rendu, filtre) ; aucun débit.
- **RG8 — Anti-fuite** : index = gabarit rendu avec les variables de l'apprenant
  **vides** et les fiches **injectées** ; séquences ≥ 48 caractères normalisés
  (NFKC, casse, lettres et chiffres) expurgées ; compteur jamais renvoyé.
- **RG9 — Bornes** : corps ≤ 300 Ko ; `max_tokens` entier ramené dans
  [256, 16 000] (4 096 par défaut) ; variables scalaires ou tableaux de
  scalaires — objets et listes imbriqués refusés, mais un objet **plat** de
  scalaires passe (tableau associatif PHP) et est rendu en JSON.
- **RG10 — Devis** : exécution mock déterministe (même roster et mêmes réglages
  que le run ; le sel `twin9-devis` n'est repris qu'en démonstration, où le
  nombre d'appels annoncé est exact ; en réel, c'est une estimation) ;
  fourchettes de tokens par étage × prix margé ; indicatif.
- **RG11 — Consentement** : explicite avant tout devis ou lancement — sauf
  après « Restaurer les saisies » (A3), qui recoche le consentement donné au run
  interrompu.
- **RG12 — Reprise** : IndexedDB ne garde que les paramètres ; la reprise fidèle
  (pause, 402) réutilise l'état vivant en mémoire.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte du portfolio | Transite par le serveur et le fournisseur le temps de chaque appel ; jamais stocké (endpoint sans état) ; consentement explicite par run (recoché automatiquement par la restauration d'une reprise, A3) |
| Gabarits et fiches | En base (`twin9_protocole`, réglage `twin9_fiches`), jamais transmis au navigateur |
| Clé privée | Chiffrée (ADR-004), utilisée côté serveur uniquement |
| Grand-livre | Montants, modèle, tokens, libellé d'étape — jamais de contenu |
| Audit anti-fuite | `{etape, fuites}` seulement |
| Run en cours | Paramètres dans IndexedDB (navigateur) ; état du moteur en mémoire ; la démonstration y écrit aussi (anomalie 6) |
| Résultat | Local par défaut ; copie serveur = opt-in explicite (A5) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Routes `#/twin9`, `#/twin9/demo` |
| Front | `web/src/views/Twin9View.jsx` — vue, `makeServerFactory`, `etageDeLabel` | Garde, consentement, devis, lancement, pause/reprise, adaptation au moteur |
| Front | `web/src/api/twin9.js` — `fetchTwin9Meta`, `makeServerBackend`, `referentielPourMoteur`, `formatUsd` | Offre, appels serveur |
| Front | `web/src/views/twin9/run-helpers.js` — `calculerDevis`, `rosterFromModele`, `etapeToEtage`, `journeesDepuisCarto` | Logique pure du parcours |
| Front | `web/src/views/twin9/twin9-store.js` | Reprise locale (paramètres) |
| Front | `web/src/views/twin9/ResultatsTwin9.jsx`, `web/src/lib/carto-store.js` | Résultats, export, enregistrement local `twin9` |
| Front | `web/src/views/twin9/demo-fixture.js` | Démonstration fictive |
| Moteur | `engine/src/twin9/index.js` — `executerTwin9` | Orchestration (devis mock, run, état persistant) |
| Moteur | `engine/src/twin9/templates.js` — `varsClient` | Variables transmises sans fiches |
| Moteur | `engine/src/twin9/heatmap.js` (`ancrer`), `journee.js` (`empreinteJournee`), `tribunal.js` (`resoudre`, `calculerConfiance`), `merge.js` (`statutTemporel`, `trajectoire`), `scan.js` (`resoudreJournees`, `cleObs`) | Briques déterministes du protocole (journée, tribunal, fusion, scan global) |
| Moteur | `engine/src/twin9/mapper.js` — `twin9ToMergeDocument` | Projection sunburst |
| API | `POST /api/twin9/appel`, `GET /api/twin9/meta` — `api/src/routes/twin9.php` | Proxy confidentiel, offre |
| API | `api/src/Middleware/CsrfMiddleware.php` | Jeton CSRF des mutations (E7) — logique unitaire couverte par UC-CPT-02-U07 |
| API | `POST/GET/DELETE /api/cartographies` — `api/src/routes/cartographies.php` | Copie serveur opt-in (type `twin9`) |
| Domaine | `api/src/Twin9/ProtocoleRepository.php` — `render`, `list`, `get` | Gabarits confidentiels |
| Domaine | `api/src/Twin9/FicheStore.php` — `injecter` | Fiches confidentielles |
| Domaine | `api/src/Twin9/LeakFilter.php` — `redact` | Filtre anti-fuite |
| Domaine | `api/src/Twin9/Twin9Config.php` — `isEnabled`, `modeles`, `reserveMicrousd`, `coutMicrousd`, `clePersoOuverte`, `publicView`, `referentiel` | Offre, tarif, interrupteurs |
| Domaine | `api/src/Twin9/CreditService.php`, `AnthropicCaller.php`, `api/src/Keys/KeyVault.php`, `api/src/Auth/Audit.php` | Débit, amont, clé privée, audit |
| Domaine | `api/src/Cartographies/CartographyRepository.php` | Stockage opt-in (migration 021) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-10-U01 | `executerTwin9` (mock) | Devis reproductible : même graphe d'appels et même carto ; métriques | `engine/test/usecases/unit/uc-app-10-analyse-approfondie-twin9.test.js` |
| UC-APP-10-U02 | `executerTwin9` + `protocole-contrat.json` | Contrat des appels : gabarit + variables, jamais de fiche, tout `{$VAR}` fourni ou injectable (RG1-RG2) ; variables sérialisées scalaires ou listes plates, **anomalie 5 figée** (RG9) | idem |
| UC-APP-10-U03 | `executerTwin9` (réel) | Tous les backends passent par la fabrique injectée | idem |
| UC-APP-10-U04 | `executerTwin9` (réel) | **Cause de l'anomalie 1** : sans fabrique → « Backend inconnu » | idem |
| UC-APP-10-U05 | `executerTwin9` (état) | Journées déjà analysées non rejouées (A4, RG12) | idem |
| UC-APP-10-U06 | `varsClient` | Fiches jamais transmises, clés de lookup ajoutées | idem |
| UC-APP-10-U07 | `ancrer` | Citation introuvable rejetée, jamais inventée | idem |
| UC-APP-10-U08 | `resoudre`, `calculerConfiance` | Résolution calculée sans vote, confiance mécanique | idem |
| UC-APP-10-U09 | `statutTemporel`, `trajectoire` | Persistance et trajectoire | idem |
| UC-APP-10-U10 | `empreinteJournee` | Clé de reprise stable / sensible au texte et au collège | idem |
| UC-APP-10-U11 | `twin9ToMergeDocument` | Feuilles = journées attestées, points = attestations | idem |
| UC-APP-10-U30 | `resoudreJournees`, `cleObs` | Scan global : références résolues par id ou date, clé d'observation | idem |
| UC-APP-10-U34 | `executerTwin9` (réel) | **Anomalie 3 figée** : erreurs 402 de la fabrique avalées, run résolu et vidé, journées dégradées mémorisées puis reprises sans relecture | idem |
| UC-APP-10-U12 | `parseHash` | `#/twin9`, `#/twin9/demo` | `web/test/usecases/unit/uc-app-10-analyse-approfondie-twin9.test.jsx` |
| UC-APP-10-U13 | `makeServerBackend` | Corps de l'appel, replis, tokens réels enregistrés | idem |
| UC-APP-10-U14 | `makeServerBackend` | 402 → `ApiError`, rien d'enregistré | idem |
| UC-APP-10-U15 | `makeServerFactory` | Gabarit sans `.md`, variables, étage ; jamais le prompt ni les méta | idem |
| UC-APP-10-U36 | `makeServerFactory` | **Anomalie 4 figée** : le même modèle (Haiku) part sur tous les étages, tribunal compris | idem |
| UC-APP-10-U16 | `etageDeLabel` | Étiquette → étage de facturation | idem |
| UC-APP-10-U17 | `calculerDevis` | Fourchettes par étage, étape inconnue = rapide (RG10) | idem |
| UC-APP-10-U18 | `rosterFromModele`, `SALT_DEVIS` | Roster mono-famille 3 passes, sel fixe | idem |
| UC-APP-10-U19 | `journeesDepuisCarto` | Établies / renvois par journée | idem |
| UC-APP-10-U20 | `createMemoryTwin9Store` | Un seul run courant, paramètres seulement | idem |
| UC-APP-10-U21 | `createCartoStore` | Enregistrement local type `twin9`, natif conservé | idem |
| UC-APP-10-U22 | `ResultatsTwin9` | Narratif assaini (ADR-007) ; échec d'enregistrement signalé | idem |
| UC-APP-10-U37 | `ResultatsTwin9` | Étape 8 : export (octets canoniques, nom de fichier) ; enregistrement {type `twin9`, privé, titre daté, document natif}, confirmation, bouton désactivé | idem |
| UC-APP-10-U35 | `Twin9View` (moteur injecté) | Branche 402 de la vue : pause « Rechargez… » et reprise sur le même état (inatteignable avec le vrai moteur, anomalie 3) | idem |
| UC-APP-10-U31 | `fetchTwin9Meta` | GET de l'offre ; copie statique → `ApiUnavailableError` (E3) ; 401 → `ApiError` (E1) | idem |
| UC-APP-10-U38 | `formatUsd`, `referentielPourMoteur` | Virgule, 4 décimales sous le centime ; pôles et compétences aplaties portant leur pôle | idem |
| UC-APP-10-U23 | `ProtocoleRepository::render` | Une passe, typage, non résolues ; 404 ; **anomalie 2 figée** | `api/tests/UseCases/Unit/UcApp10AnalyseApprofondieTwin9Test.php` |
| UC-APP-10-U39 | `ProtocoleRepository::list` | Métadonnées seulement (nom, longueur en caractères, variables), triées par nom, jamais le contenu | idem |
| UC-APP-10-U24 | `FicheStore::injecter` | Injection depuis les clés de lookup, ordre du client (RG2) | idem |
| UC-APP-10-U25 | `LeakFilter::redact` | Sur un index de même forme que celui de la route : gabarit et fiche expurgés, charge utile intacte (RG8) — la construction de l'index par la route est vérifiée par F20 | idem |
| UC-APP-10-U26 | `Twin9Config` | Offre par étage, coûts par modèle, réserve ≥ coût (RG4-RG6) | idem |
| UC-APP-10-U27 | `Twin9Config` | Interrupteurs par défaut, référentiel sans texte de fiche, vue publique | idem |
| UC-APP-10-U28 | `AnthropicCaller::appeler` | Sans système, arrêt `max_tokens` relayé, compteurs absents → 0 | idem |
| UC-APP-10-U29 | `CartographyRepository::create` | Type `twin9` (migration 021), document natif, opt-in daté | idem |
| UC-APP-10-U32 | `KeyVault` | Clé privée chiffrée, relue par son seul propriétaire ; clé maître invalide → null (A2, E11) | idem |
| UC-APP-10-U33 | `CreditService::debit`/`adjust`, `Audit::record` | Remboursement d'échec portant le modèle (E8) ; `Audit::record` persiste les détails tels quels (le contenu `{etape, fuites}` relève de la route, F20) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-10-F01 | Nominal (étapes 1-5) | IHM | `<App/>` : portfolio ≤ 20 caractères ou consentement absent → estimation impossible ; devis = appels exacts du mock, aucun réseau | `web/test/usecases/functional/uc-app-10-analyse-approfondie-twin9.test.jsx` |
| UC-APP-10-F02 | Nominal (étape 6), E9 | IHM | **Anomalie 1 figée** : « Backend inconnu », « Réessayer », aucun appel serveur | idem |
| UC-APP-10-F03 | A1 | IHM | Démonstration sans compte : devis, run mock, sunburst, aucun appel ni enregistrement | idem |
| UC-APP-10-F04 | E1 | IHM | Garde de session, bascule en démonstration | idem |
| UC-APP-10-F05 | E2 | IHM | « momentanément indisponible » | idem |
| UC-APP-10-F06 | E3 | IHM | Copie statique complète / méta seule absente | idem |
| UC-APP-10-F07 | E4, étape 4 | IHM | Solde < estimation basse : alerte, lien de recharge, bouton désactivé ; solde entre basse et haute : avertissement, lancement permis | idem |
| UC-APP-10-F08 | A2 | IHM | Promotion + clé : option visible, devis sans débit, lancement permis à solde nul ; promo fermée ou sans clé : option absente | idem |
| UC-APP-10-F09 | A3 | IHM | Reprise détectée ; « Restaurer » remet portfolio, modèle, facturation et recoche le consentement ; « Ignorer » efface la reprise | idem |
| UC-APP-10-F10 | A4, étape 8 | IHM | Annulation → pause → reprise avec le même état ; « Enregistrer » range le résultat (type `twin9`, privé) dans IndexedDB (simulé) | idem |
| UC-APP-10-F11 | E5 | IHM | **Anomalie 3 figée**, vrai moteur branché sur la fabrique serveur : 402 en cours avalé, ni pause ni « Réessayer », résultats affichés, reprise locale effacée | idem |
| UC-APP-10-F25 | A1, A4 | IHM | Démonstration sur le vrai moteur : annulation puis reprise sur le même état (journées reprises) ; **anomalie 6 figée** (la démo écrase puis efface le run courant local) | idem |
| UC-APP-10-F26 | Étape 3, RG6 | IHM | **Anomalie 4 figée** : Haiku (taggers, rapide) présélectionné, devis avec tribunal, lancement permis sans avertissement | idem |
| UC-APP-10-F12 | Nominal | API | `/meta` sans contenu ; appel greffier : fiches injectées, sortie seule, coût réel, grand-livre | `api/tests/UseCases/Functional/UcApp10AnalyseApprofondieTwin9Test.php` |
| UC-APP-10-F13 | Nominal | API | Trois étages, trois modèles, débit = somme des coûts — scénario d'API seulement : l'IHM envoie un seul modèle (anomalie 4) | idem |
| UC-APP-10-F14 | A2, E6 | API | 403 hors promo ; 409 sans clé ; 200 sans débit avec la clé de l'apprenant | idem |
| UC-APP-10-F15 | E1 | API | 401 sur `/appel` et `/meta` | idem |
| UC-APP-10-F16 | E2 | API | 503 « Twin9 non disponible », `enabled=false` | idem |
| UC-APP-10-F17 | E7 | API | 400/413/422/404, 403 sans jeton CSRF, sans fragment de gabarit ni débit | idem |
| UC-APP-10-F18 | E4, E5 | API | 402 avec montants, solde intact (côté serveur ; côté client, voir F11) | idem |
| UC-APP-10-F19 | E8 | API | 502/504/429 génériques, réserves rendues avec le modèle | idem |
| UC-APP-10-F20 | A6 | API | Récitation expurgée, audit en compteurs, citation de l'apprenant intacte | idem |
| UC-APP-10-F21 | E10 | API | 429 + `Retry-After: 30` | idem |
| UC-APP-10-F22 | A5 | API | Copie serveur `twin9` : création, liste sans document, relecture, purge réelle (ligne absente de la base) | idem |
| UC-APP-10-F23 | E11 | API | 503 (statut et message) clé plateforme / clé maître absentes | idem |
| UC-APP-10-F24 | Anomalie 2 | API | Journal contenant « {$PRENOM} » → 422, aucun appel | idem |

### Tests existants liés (non-régression)

- `api/tests/Twin9AppelTest.php` — garde, validation, 402, réserve, clé privée, promo, filtre, fiches, rythme, `/meta`.
- `api/tests/Twin9LeakFilterTest.php`, `api/tests/Twin9SecurityAuditTest.php` — contournements du filtre, découvert, IDOR.
- `api/tests/Twin9ProtocoleTest.php` — référentiel servi par `/meta`.
- `api/tests/CartographiesTest.php` — stockage du type `twin9`.
- `web/src/views/Twin9View.test.jsx` — garde, devis, 402, garde-fou de solde, promotion, `ResultatsTwin9`.
- `web/src/views/twin9/run-helpers.test.js`, `web/src/views/espace/CartographyViewer.test.jsx` (type `twin9`).
- `engine/src/twin9/*.test.js` — parité octet avec le Python (vecteurs versionnés) ; `contrat-appels.test.js` se saute sans les oracles (UC-APP-10-U02 le rejoue sur données fictives versionnées).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcApp10 --testdox
cd web && npx vitest run test/usecases/unit/uc-app-10 test/usecases/functional/uc-app-10
cd engine && npx vitest run test/usecases/unit/uc-app-10
```

## Anomalies constatées

1. **Le lancement réel est impossible.** `Twin9View.lancer()` construit la
   fabrique de backends serveur (`makeServerFactory`) mais ne la transmet pas à
   `executerTwin9` (paramètre `backends`). Hors démonstration (`mock: false`), le
   moteur instancie donc ses backends par défaut, dont seul `mock` existe, et
   lève « Backend inconnu : anthropic (choix : mock) » avant le moindre appel :
   aucun `POST /api/twin9/appel` n'est émis, rien n'est débité, la vue affiche
   l'erreur avec « Réessayer ». Les tests historiques injectent le moteur
   (`deps.runEngine`) et ne voient pas le défaut. Avec la fabrique injectée, tout
   le run passe bien par elle (UC-APP-10-U03, fabrique qui ne lève jamais) ; mais
   corriger ce seul défaut exposerait les anomalies 3 et 4. Figé par
   UC-APP-10-F02 et UC-APP-10-U04.
2. **Un motif `{$X}` dans le texte de l'apprenant bloque l'appel.**
   `ProtocoleRepository::render` recherche les variables non résolues dans le
   **rendu** : un journal qui contient littéralement « {$PRENOM} » (atelier de
   prompts, par exemple) est pris pour une variable manquante et `/appel`
   répond `422 Variables non résolues`. Figé par UC-APP-10-U23 et UC-APP-10-F24.
3. **Les erreurs de `/api/twin9/appel` sont avalées par le moteur.** Chaque appel
   du moteur Twin9 est entouré d'une capture qui traite toute exception comme
   une « panne technique » (`journee.js` : tagging → « 0 tag pour ce passage »,
   première impression, greffier, juge léger, contre-lecture ; `tribunal.js` :
   « panne technique → renvoi » ; `merge.js` : relectures ; `scan.js`). Un `402`,
   `403`, `409`, `422` (dont l'anomalie 2 et l'anomalie 4), `429`, `502`/`504` ou
   `503` n'atteint donc jamais la vue : la pause de E5 et le message de E9 sont
   inatteignables, le run se termine en « terminé » et affiche comme une vraie
   analyse une cartographie **dégradée** (0 tag, verdicts « renvoi »), déjà
   facturée pour les appels réussis. Pire : les journées dégradées sont
   mémorisées dans l'état avec leur empreinte ; une reprise ne les rejoue pas,
   contrairement à la promesse « les journées déjà analysées ne seront pas
   refacturées ». Latent tant que l'anomalie 1 bloque tout lancement réel. Figé
   par UC-APP-10-U34 et UC-APP-10-F11.
4. **Un seul modèle pour tous les étages.** `makeServerFactory` envoie le modèle
   choisi à l'étape 3 pour **chaque** appel, alors que `etage` varie selon
   l'étiquette et que le serveur refuse (`422 Modèle non proposé pour cet étage`)
   tout modèle hors de ses étages (RG6). Dans l'offre par défaut, seul Sonnet
   couvre les trois étages ; or la vue présélectionne le **premier** modèle de
   l'offre (Haiku, taggers et rapide seulement, dans les défauts — ou ce que
   donne l'ordre des clés relues de la colonne JSON), sans blocage ni
   avertissement au devis. Avec Haiku, tout le tribunal partirait en 422 ; avec
   Opus, tout le tagging — erreurs ensuite avalées (anomalie 3). UC-APP-10-F13
   (trois modèles sur trois étages) ne correspond à aucun parcours de l'IHM.
   Latent derrière l'anomalie 1. Figé par UC-APP-10-U36 et UC-APP-10-F26.
5. **Deux variables partent en objets.** Pour `merge/03-competence-evolution`,
   le moteur transmet `CONFIANCE_MOY` et `SCORE_CUMULE` comme objets `PyFloat`,
   que `JSON.stringify` sérialise en `{"value": 0.75}`. Le serveur accepte ce
   tableau associatif « plat » (RG9) et le rend par `json_encode` : le prompt
   contient `{"value":0.75}` au lieu de `0.75`. Figé par UC-APP-10-U02.
6. **La démonstration écrit dans la reprise locale.** En démonstration,
   `onProgress` sauvegarde quand même le « run courant » (portfolio **fictif**)
   dans IndexedDB, et la fin du run l'efface. Une démo annulée laisse donc une
   reprise fictive (sur `#/twin9`, « Restaurer les saisies » injecte le
   portfolio de démonstration et coche le consentement) ; une démo menée à terme
   efface les paramètres d'une vraie analyse interrompue. Figé par
   UC-APP-10-F25.

## Limites

- Copie statique complète : la garde affiche « nécessite un compte » (session
  indéterminable) plutôt qu'un message d'indisponibilité (UC-APP-10-F06).
- Le filtre anti-fuite est un filet de sécurité : une transformation du texte
  (encodage, traduction) ou des homoglyphes inter-écritures y échappent ; la
  protection première reste dans les gabarits (ADR-010 §2).
- Le devis est indicatif (fourchettes de tokens) ; seule la réserve serveur fait
  foi.
