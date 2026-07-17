# STATUS — journal de bord

## État : v1.1.0 — EN PRODUCTION

Les 14 prompts P0→P13 (v1.0) puis les 11 chantiers v1.1 (D1→D11) sont appliqués, intégrés,
déployés sur https://humanome.xyz (`health` → `v1.1.0`) et vérifiés en ligne. Code public :
https://github.com/4nd4ny/humanome (`main` + tags `v1.0.0`/`v1.1.0`). Voir « Actions restantes
(utilisateur) » en fin de fichier.

## Fait

- 2026-07-17 — **D14bis — Soleil V3 : look carto-phone + disposition ADDITIVE (décisions utilisateur).**
  Deux retouches demandées après livraison, la seconde étant un **écart assumé à la spec §11.1** :
  - **Look carto-phone** (`prototype cartographies/carto-phone.html`) : deux couronnes (familles
    colorées à l'intérieur, compétences à l'extérieur), cinq bandes grises graduées de référence
    (l'échelle du prototype, opacité 0,4 clair / 0,3 sombre), cercles pointillés concentriques,
    séparateurs clairs, **atténuation grisée** des secteurs non survolés, centre en dégradé doux
    cliquable (proportions 8 % / 48 % du prototype). Rayon inchangé = journées documentées (log2).
  - **Disposition additive** : seules les compétences DOCUMENTÉES à la tête de lecture occupent un
    angle — montrer les 61 emplacements exposait les manques, contre l'esprit ipsatif (« l'écart à la
    spec §11.1/§13.2 est un choix produit explicite », décision utilisateur du 2026-07-17). Les angles
    restent égaux entre secteurs visibles (familles contiguës) ; **l'animation depuis le passé AJOUTE
    les secteurs** (vérifié navigateur : 11 secteurs à la 1ʳᵉ journée → 40 après dix journées → 54 à
    l'état complet) ; une famille sans compétence documentée n'apparaît pas encore ; le filtre
    n'enlève pas un secteur, il l'atténue (la disposition ne dépend que de la tête de lecture) ;
    état vide expliqué (« les secteurs apparaîtront au fil de la lecture »).
  - Suites : web **798** ; l'arbre et le tableau accessible continuent de lister tout le référentiel
    (la navigation reste complète, seul le SOLEIL est additif).

- 2026-07-17 — **D14 (v1.2) — Interface de cartographie ipsative V3 (périmètre initial §25.1).**
  Implémente `prototype cartographies/specifications-fonctionnelles-interface-v3.md` et **remplace
  l'interface de consultation existante** : `#/cartographie` (nouvelle route, nav mise à jour) et
  `#/merge` (démo) rendent l'interface V3 ; l'ancienne MergeView ne subsiste que pour un document
  `cartographie-merge` chargé par l'utilisateur (la V3 exige un adaptateur par format, spec §7) et
  pour les vues embarquées (Twin6/Twin9/espace/partage). **Entièrement client-first (ADR-001) : le
  master privé ne quitte jamais le navigateur, zéro changement d'API.**
  - **Cœur logique** `web/src/v3/core/` (10 modules, 47 tests) : identifiants stables UUIDv5 dérivés
    des octets immuables (AC-DATA-03/09) ; adaptateurs historiques carto_Pn/kairos/document-jour avec
    rapport 4 gravités (référence pendante, numéro dupliqué, trace-par-pid : alerte, jamais de
    devinette — §6.4) ; import avec quarantaine (AC-DATA-01) et variantes concurrentes « à arbitrer »
    jamais additionnées (AC-DATA-02) ; admissibilité §10 (établie + non court-circuitée + ≥1 preuve
    résolue non contestée + variante active — la confiance du verdict n'entre jamais, AC-DATA-05) ;
    métriques versionnées documented-days/months/public-presence-v1 avec rayon log2 plafonné (§11) ;
    révisions immuables + droit de réponse confirmer/nuancer/contester (AC-EDIT-01→04) ; comparaison
    ipsative par préréglages + récit déterministe référencé (AC-REFL-01/02) ; calcul des panneaux
    availablePanels = format ∩ audience ∩ mode (AC-UI-04) ; projet de partage par LISTE POSITIVE avec
    cases 3 états, cascades §18.5, constructeur 8 étapes avec REMAPPAGE d'identifiants par projection
    (AC-SHARE-07), anti-fuite des verbatims exclus (AC-SHARE-12, mémoïsé), précision temporelle
    jour/mois/masquée avec métrique assortie (AC-SHARE-10/17/19), verrou de prévisualisation
    sourceDigest/policyDigest/outputDigest (AC-SHARE-15), confirmation d'irrévocabilité (AC-SHARE-13) ;
    JSON canonique trié + digest SHA-256 (§19.4) ; réimport avec contrôle d'intégrité bloquant
    (AC-SHARE-20) et duplication monotone sans lien au master (AC-SHARE-18) ; lecteur ZIP sans
    dépendance (chemins traversants rejetés) ; persistance IndexedDB séparée des préférences.
  - **UI** `web/src/v3/ui/` : arbre + soleil (angles FIXES par compétence, rayon = journées
    documentées, halo, contours fantômes du futur) + heatmap (grille clavier, jours multidomaines
    rayés, seuils fixes §11.3) + portfolio (provenance, revue, note privée, inclusion au partage) +
    lecteur temporel (avant/arrière/vitesse, inspection ≠ tête de lecture, AC-SYNC-03/04) ;
    « Pourquoi ce rayon ? » (unités exactes de la métrique courante, AC-SYNC-05) ; comparaison +
    « Ce qui a changé » ; modes simplifié/expert conservant l'état (AC-UI-01) ; panneaux masquables
    avec « Réafficher » toujours accessible (AC-UI-03) ; thèmes système/clair/sombre + distinctions
    renforcées (symboles/motifs par famille) + impression (tableau équivalent au soleil) ; éditeur
    JSON expert refusant l'invalide (AC-EDIT-02) ; constructeur de partage avec récapitulatif avant
    inclusion groupée (AC-SHARE-14) ; vue employeur = MÊME moteur que la prévisualisation (§18.8).
  - **Vérifié au navigateur sur le corpus RÉEL** (59 journées) : 61 emplacements, **54 secteurs
    documentés** (= les 54 compétences établies du corpus), 365 cellules ; le rapport d'import a
    attrapé une **vraie anomalie du corpus** (numéro de pièce dupliqué, 5.02 au 2026-02-14 — le cas
    §6.4) ; filtre soleil→arbre→heatmap synchronisés ; inspection sans déplacement de lecture ;
    parcours de partage complet → prévisualisation exacte (54 forces). Perf corpus entier : import
    210 ms, inclusion groupée 1795 liens 215 ms, instantané + anti-fuite 181 ms (§22.2).
  - Suites **toutes vertes : PHP 518 (inchangé), engine 938 (inchangé), web 798 (+47)**.
  - **Reste pour les itérations suivantes** (documenté, hors périmètre initial strict) : adaptateur
    cartographie-merge (§7 : à déclarer compatible avec tests), corpus multi-ZIP réel Christ300 à
    valider sur pièce, préférences persistées par appareil (§14.4 — store prêt), impression mensuelle
    dédiée, V3.1 (liens hébergés, fusion sélective, caviardage).

- 2026-07-17 — **D13 (v1.2) — Restauration des versions de gabarit Twin9 (retour arrière).**
  L'archivage automatique existait (chaque écrasement versionne l'ancien contenu) mais le « retour
  arrière » promis par ADR-010 §6 n'était pas implémenté : l'historique n'exposait que des métadonnées,
  sans lecture ni restauration. C'est fait — et **jamais destructif**.
  - **Repository** : `ProtocoleRepository::version(name, v)` (contenu d'une version archivée) et
    `restore(name, v, userId)` — la restauration passe par `put()` : le vivant est archivé D'ABORD,
    puis le contenu archivé redevient vivant. L'histoire reste complète (l'état pré-restauration est
    lui-même récupérable) ; restaurer un contenu identique au vivant = no-op annoncé.
  - **Routes** (garde conjonctive admin ∧ promptologue, comme le contenu vivant) :
    `GET /twin9/admin/protocole/{name}/versions/{version}` (lecture) et
    `POST /twin9/admin/protocole/{name}/restore {version}` (422 version manquante, 404 inconnue).
  - **Atelier** (`#/twin9-atelier`) : colonne Actions dans l'historique — « Voir » (aperçu texte brut
    de la version archivée, jamais de HTML) et « Restaurer » (recharge l'éditeur + l'historique).
  - **Tests** : PHP (restauration non destructive + no-op + validations + garde de rôles : un admin
    SEUL → 403 sur lecture ET restauration), web (parcours Voir/Restaurer complet). Suites **toutes
    vertes : PHP 518, engine 938, web 751**.
  - **Vérifié au navigateur** (compte atelier dédié, gabarit FICTIF créé pour l'occasion puis purgé) :
    v2 vivante → « Voir » montre la v1 archivée → « Restaurer » → le vivant redevient v1, message
    français, historique à 2 versions (v1 originale + v2 ex-vivante) — rien d'écrasé.

- 2026-07-17 — **D12 (v1.2) — Résultat Twin9 dans le sunburst évolutif + stockage opt-in RGPD.**
  Le résultat d'une analyse approfondie (carto_evolutive.json) n'était rendu que dans sa vue dédiée
  (jauges + narratifs) ; il alimente désormais **le même sunburst évolutif** que toute cartographie,
  et devient **conservable à long terme** sous le même contrat d'opt-in RGPD.
  - **Adaptateur moteur** `engine/src/twin9/mapper.js` (`twin9ToMergeDocument`) : reconstruit un
    document-jour par journée ATTESTÉE (attestation = présence établie avec ses scores du jour ;
    signal de renvoi daté = renvoi au cartographe ; `jour_index → date` résolu sur TOUTES les
    compétences — **jamais de date inventée**, un signal non datable est ignoré et documenté), puis
    réutilise `mergeDays` + `buildMergeDocument` (aucune logique d'agrégation/quintiles/archétypes/
    ipsatif dupliquée — même patron que l'adaptateur Twin6). Narratifs pris dans carto_evolutive
    (histoires, rapports de pôle, kairos). Fichier NOUVEAU, hors périmètre de parité CPython.
  - **Vue résultats** : section « Cartographie évolutive — sunburst » (MergeView + timeline) quand le
    référentiel est là ; dégradation silencieuse sans journée datée. Bouton **« Enregistrer dans mes
    cartographies »** : sauvegarde LOCALE du carto_evolutive NATIF (type `twin9`), masqué en démo ;
    la **copie serveur reste un choix explicite daté** via le panneau existant (POST /api/cartographies
    = la décision, `opt_in_at` horodaté). Migration `021` (ENUM + 'twin9'), route élargie,
    visionneuse de l'espace re-dérive la vue merge du document natif stocké, panneau étiqueté.
    `confidentialite.md` documente le stockage opt-in du RÉSULTAT (jamais le portfolio).
  - **Tests** : mapper moteur (11, dont vecteur figé réel + règles fines et « strictement valide au
    schéma » sur fixture 7 pôles), web (sunburst/save/démo-sans-save, visionneuse twin9, store),
    PHP (opt-in twin9). Suites **toutes vertes : PHP 516, engine 938, web 750**.
  - **Vérifié au navigateur** (démo Twin9 de bout en bout) : run mock → **sunburst réel** (15 secteurs,
    couleurs des pôles, timeline évolutive « Feuille 2 / 2 — 05/03/2026 · score du jour 2 »), bouton
    d'enregistrement correctement ABSENT en démo.

- 2026-07-17 — **D10 (plan v1.1) — Garde-fou de publication + structure GitBook (parties
  autonomes).** Le dépôt est déjà public (`4nd4ny/humanome`, historique purgé au jalon précédent) ;
  cette session en industrialise la publiabilité et prépare GitBook. Les actions restantes sont
  **côté utilisateur** (voir plus bas).
  - **Garde-fou automatisé** `scripts/check-publiable.mjs` : refuse, dans les fichiers **suivis**,
    (a) un répertoire de gabarit Twin9 (`golden-twin9/`, `twin9-oracles/`, `golden-prompt/`),
    (b) un `.env` réel ou un `.pyc`/`__pycache__`, (c) un secret en clair (forme de clé `sk-ant-`,
    `PAYPAL_SECRET`, `*_PASSWORD`), (d) un chemin local absolu (`/Users/…`), (e) un identifiant OVH
    réel (hôte/cluster). Placeholders et fixtures sur liste blanche (`EXEMPLE`, `change-me`, `_dev`,
    répertoires de test) ; la règle mot de passe s'assouplit dans les tests mais clé/OVH/chemin
    restent actifs partout. **Validé par un canari** (4 types détectés sur 4). Le garde-fou a d'ailleurs
    **débusqué un résidu réel** : les identifiants OVH nommés dans une vieille entrée `STATUS.md`
    (méta-référence à la purge) — neutralisés.
  - **Hook** `.githooks/pre-commit` (activé : `git config core.hooksPath .githooks`) + **CI**
    `.github/workflows/publiable.yml` (garde-fou + suite moteur). Le hook s'est déclenché et a
    bloqué/validé les commits de cette session (vérifié en direct). La suite **front** est
    volontairement hors CI : ses fixtures importent des données **générées** (`web/public/data/**`,
    gitignorées, chaîne convert/generate multi-étapes — vérifié en clean-room qu'elle échoue sur un
    checkout nu) ; elle tourne en local, comme la suite **PHP** (Docker). Pas de CI rouge au 1ᵉʳ push.
  - **GitBook** : `.gitbook.yaml` (root `./`, readme, summary) + `SUMMARY.md` **généré** par
    `scripts/build-gitbook-summary.mjs` depuis l'arbre de doc (9 parcours `content/formation/**` +
    docs `docs/**` + ADR), **83 entrées, 100 % des liens résolus**. La doc reste éditée en markdown
    dans le dépôt (source unique) ; GitBook n'en est qu'un rendu.
  - **README** : badges (site, licence AGPL-3.0, CI) + section « Documentation ».
  - **✅ PUBLIÉ** (autorisation utilisateur 2026-07-17) : `git push origin main` (26 commits) +
    **tag `v1.1.0`** sur **https://github.com/4nd4ny/humanome** (le push git passe par le trousseau
    macOS, valide, indépendamment du token `gh`). Delta re-scanné avant push : propre.
  - **⏳ RESTE À L'UTILISATEUR** : 1) créer/associer l'**espace GitBook** et activer le **Git Sync**
    (pas d'API d'upload) ; 2) renseigner l'URL GitBook dans le README. (Aucun changement de code
    applicatif : suites inchangées vs D9 — **PHP 515, engine 927, web 743**.)

- 2026-07-17 — **D9 (plan v1.1) — Assistant tuteur interactif (Haiku).** Un panneau « 💬 »
  répond, pour n'importe quel visiteur, aux questions « par où passer sur le site ». Le prompt
  système est construit CÔTÉ SERVEUR à partir d'un digest de la doc et du rôle (déterminé par la
  SESSION, jamais par un champ client) ; **le portfolio n'est JAMAIS transmis** — seulement la
  question et la rubrique courante. **Aucune conversation stockée côté serveur** (compteurs
  anonymes) ; l'historique vit en `sessionStorage`, le temps de la session.
  - **Backend** : `api/src/routes/tuteur.php` — `POST /tuteur` protégé par la MÊME preuve de travail
    que la démo + honeypot + quota IP ; **budget propre** (circuit breaker quotidien sur une table
    dédiée `tuteur_usage_daily`, `TUTEUR_BUDGET` = **1 $/jour** par défaut, Q3), modèle Haiku
    (`TUTEUR_MODEL`). Migration `020_tuteur_usage.sql`. `UsageCounters` paramétré (table sur liste
    blanche) pour ne pas toucher au compteur de la démo. `CsrfMiddleware` exempte `/api/tuteur`.
  - **Digest** : `scripts/build-tuteur-digest.mjs` génère `scripts/data/tuteur-digest.md` depuis les
    familles de `nav.js` + les frontmatters `content/` (9 parcours, ~6,2 Ko) ; **régénéré à chaque
    `stage-api`** — comme les prompt-packages, seul le générateur est versionné (artefact gitignoré,
    évite la dérive).
  - **Front** : `web/src/components/TuteurPanel.jsx` + `web/src/lib/tuteur.js` (PoW puis POST, n'envoie
    que question + rubrique), branché dans `App` après l'aide ; styles `.tuteur`. RGPD :
    `content/legal/confidentialite.md` gagne un point « Assistant tuteur ».
  - **Deux bugs attrapés par la vérification au navigateur** (là où MockProvider diverge du vrai
    fournisseur) : (1) *nonce* — `solvePow` renvoie `{nonce, attempts}`, `tuteur.js` prenait l'objet
    entier ; corrigé + mock de test rendu fidèle. (2) **`[]` en prod** — `AnthropicProvider::complete()`
    **force l'usage d'outil** (JSON garanti pour la démo/Twin9) ; le tuteur héritait de ce mode et
    Haiku renvoyait un document vide « [] » au lieu de prose. Corrigé par un paramètre
    `forceJsonDocument` (défaut `true` = comportement démo/Twin9 inchangé ; `false` pour le tuteur =
    **texte libre**). Rendu : le modèle produit quand même du Markdown léger (**gras**) ; le panneau
    n'a **pas de parseur Markdown** (surface XSS réduite) → on retire les marqueurs inline
    (`stripLightMarkdown` : `**`, `__`, backticks) CÔTÉ CLIENT, garanti quel que soit le modèle.
  - **Tests** : `api/tests/TuteurTest.php` (8) — pas de fuite du prompt/clé, PoW requis, honeypot,
    budget dédié distinct de la démo, visiteur **et** connecté, **le vrai chemin `AnthropicProvider`
    renvoie de la prose ET la requête amont ne porte pas `tool_choice`** (le discriminant que le mock
    masquait), **tarification Haiku non nulle** (le plafond dollar peut effectivement se déclencher).
    Front : `tuteur.test.js` + `TuteurPanel.test.jsx` (dont le strip Markdown). Suites **toutes
    vertes** : **PHP 515, engine 927, web 743**.
  - **✅ DÉPLOYÉ EN PRODUCTION** (API `020` + static, puis 2 redéploiements API — correctifs prose et
    texte brut — et 1 redéploiement static — strip Markdown) — API `v1.0.0-54`. **Vérifié en ligne**
    depuis un état vidé : réponses en **prose française cohérente** citant les vraies routes du digest
    (`#/merge`, `#/essayer`, `#/referentiel`, `#/guides/cartographe`, « 7 pôles et 61 compétences
    RESPIRE ») ; le rendu ne montre **aucun marqueur Markdown** (vérifié : la sortie brute du modèle en
    contient, le panneau les retire). `migrate` HTTP 200 (`020` appliqué), `health` HTTP 200.

- 2026-07-16 — **D11 (plan v1.1) — Renommage Twin_v9 → Twin9 dans l'artefact moteur.**
  L'en-tête du rapport évolutif téléchargeable dit enfin « Twin9 » (dernier résidu du renommage global).
  - Source Python `../Twin_v9/aurora/merge3.py` (hors dépôt) : ligne d'en-tête `"*Twin_v9 — %s — %d
    journées …"` → `"*Twin9 — …"` (SEULE cette ligne ; le champ `version:"Twin_v9"` de
    carto_evolutive.json reste GELÉ, contrat de parité).
  - `engine/src/twin9/merge.js` : même chaîne → « Twin9 ».
  - Vecteur figé `merge.vec.json` **régénéré depuis le Python renommé**
    (`python3 engine/test/twin9-vectors/gen_merge_scan_vectors.py`) : seule la ligne d'en-tête de
    `rapport_evolutif_md` change, `scan.vec.json` **inchangé** (pas de hand-édition d'oracle). Régénération
    documentée dans `merge.test.js`.
  - `renommage.test.js` : `it.skip` « en-tête dit Twin9 » **réactivé** (passe), ligne d'en-tête **retirée**
    de la liste blanche du lint (ne reste que le champ version gelé).
  - **Parité CPython INTACTE** (`parite.test.js`, 6 oracles, `plant01` bit-à-bit) ; `merge.vec` à jour.
  - Suites : **engine 927 (plus de skip)**, PHP 507, web 737 ; build front OK (le bundle porte « Twin9 — »).
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static**, le moteur est bundlé côté client) : app 200.

- 2026-07-16 — **D8 (plan v1.1) — Audit adversarial des paiements et crédits.** Audit OFFENSIF du
  système de crédits prépayés Twin9/Twin6 (8 angles, un test par angle). **Verdict : aucune
  vulnérabilité** — les défenses posées au durcissement #29 tiennent. Rien à corriger, donc **rien à
  déployer** (test + doc seulement). Détail (sobre, sans exploitation) dans `docs/securite-checklist.md`
  § « Audit adversarial paiements & crédits (D8) ».
  - Nouveau `api/tests/Twin9SecurityAuditTest.php` (6 tests, 28 assertions) confirmant les variantes
    non encore explicitement couvertes : montant crédité = capture PayPal (jamais le pack ni un champ
    client, angle 3) ; débit atomique anti-découvert (4) ; remboursement d'autrui refusé, plafonné à la
    room, jamais négatif (5) ; grand-livre/factures cadrés par session, pas d'IDOR (8). Angles 1/2/5
    (déjà) `Twin9PayPalTest`, 6 `LlmPowTest`/`LlmProxyTest`, 7 `Twin9AppelTest`.
  - Suites **toutes vertes** : **PHP 507, engine 926 (+1 skip), web 737**. (Pas de déploiement : aucun
    changement de code de production.)

- 2026-07-16 — **D7 (plan v1.1) — Typographie iA Writer Quattro (auto-hébergée).**
  Toute la police du site passe à **iA Writer Quattro** (AD-D5), auto-hébergée.
  - **Fichiers** : 4 graisses woff2 (Regular/Italic/Bold/BoldItalic, ~172 Ko au total) + licence
    **SIL OFL 1.1** (`OFL.txt`) dans `web/public/fonts/quattro/` (récupérées de `iaolo/iA-Fonts`,
    copiées telles quelles dans le build). Seules les graisses utilisées sont chargées ; hors bundle JS.
  - **CSS** : `@font-face` (4, `font-display:swap` → FOUT accepté, pas de FOIT) + pile corps
    `'iA Writer Quattro', system-ui, …`. Pile **monospace inchangée** (système `ui-monospace`) :
    iA Writer Mono non embarquée en v1.1 (choix noté en commentaire).
  - **CSP** : ajout explicite de `font-src 'self'` dans `web/public/.htaccess` (les polices même-origine
    étaient déjà couvertes par `default-src 'self'` — explicite pour la clarté/défense) ;
    `docs/securite-checklist.md` mis à jour.
  - **Vérifié au navigateur** : `document.fonts.check()` = **true**, body en iA Writer Quattro, les 2
    woff2 (Regular/Bold) → **200** (aucun blocage CSP), rendu appliqué partout, 0 erreur console.
    L'impression hérite de la police (aucune surcharge `@media print`).
  - **Test** : `web/src/styles/fonts.test.js` (garde anti-régression : 4 @font-face + swap + pile corps
    + présence des woff2/licence + aucune origine tierce de police).
  - Suites **toutes vertes** : **PHP 501, engine 926 (+1 skip), web 737**, build web OK (fonts copiées
    dans `dist/fonts/quattro/`).
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static**) : `GET /fonts/quattro/iAWriterQuattroS-Regular.woff2`
    → **200**, header CSP prod contient bien `font-src 'self'`.

- 2026-07-16 — **D6 (plan v1.1) — Profil : avatar et édition (dépend de D5).**
  Ajout d'une photo/avatar + modification de l'identifiant dans le profil (AD-D4).
  - **Migration 019** : `users.avatar` (MEDIUMBLOB NULL) + `users.avatar_mime` — avatar EN BASE (pas de
    FTP), purge RGPD gratuite par la ligne `users`.
  - **API** : `PATCH /auth/me {displayName}` (édition du nom) ; `PUT /auth/me/avatar {avatar (base64),
    mime}` — le serveur **valide mime (JPEG/PNG/WebP) + magic number + taille ≤ 200 Ko** (jamais confiance
    au client, `Media\AvatarValidator`) ; `DELETE /auth/me/avatar` (retrait indépendant) ;
    `GET /users/{id}/avatar` (cache privé, 404 si absent). `/auth/me` expose `hasAvatar`. CSRF/session.
  - **Front** : section « Profil » éditable (nom via Modifier/Enregistrer ; avatar : redimensionnement
    canvas client ~256 px → ≤ 200 Ko WebP/JPEG `lib/resize-image.js`, aperçu, ajout/retrait). Composant
    `Avatar` (image ou **initiales en repli**), affiché aussi dans le panneau de nav près de
    « Se déconnecter ». **Vérifié au navigateur** bout-en-bout (repli initiales → upload PNG réel via
    canvas → servi comme avatar → retrait → retour aux initiales), 0 erreur console.
  - **RGPD** : `docs/rgpd-registre.md` §1 (photo = donnée personnelle, retrait indépendant + cascade).
  - **Tests** : PHP (`AuthAvatarTest` : PATCH nom, PUT valide JPEG/PNG/WebP, refus mime/magic/taille/
    base64, DELETE, GET 200/404, purge avec le compte, session requise, pas d'IDOR) ; web
    (`Avatar` initiales/img, `resize-image` recadrage/encodage/plafond, `AccountView` édition nom +
    upload + retrait).
  - Suites **toutes vertes** : **PHP 501, engine 926 (+1 skip), web 733**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-46-g4b5cb3d`) : migration 019 appliquée, health ok,
    front redéployé. Smoke prod : `GET /users/{id}/avatar` → **404** (route vivante, colonne avatar OK) ;
    `PATCH /auth/me` non authentifié → **401**.

- 2026-07-16 — **D5 (plan v1.1) — Inscription durcie : double email, activation par code à 4 chiffres.**
  Un compte n'est ACTIVÉ qu'après confirmation d'un code envoyé par email (AD-D3).
  - **Migration 018** : `users.email_verified_at` (NULL = non activé), `verification_code_hash`,
    `verification_expires_at`, `verification_attempts` (+ index). **Backfill** : les comptes existants
    (dont la prod) sont réputés vérifiés (`email_verified_at = created_at`).
  - **Service Mailer** (`api/src/Mail/`) : interface + `PhpMailMailer` (`mail()` OVH, expéditeur
    `MAIL_FROM` défaut **no-reply@humanome.xyz** — pas de modif de `~/app/shared/.env`) + `MemoryMailer`
    (fake de test) + `MailerFactory` (couture d'injection). Mail français : lien
    `#/activer?email=…&code=XXXX` + code en clair, expiration 30 min.
  - **API** : `register` = double saisie email (insensible casse), crée le compte **NON activé**, envoie
    le code, **n'ouvre pas de session** (201 `pending_activation`). `POST /auth/activate {email, code}`
    active + ouvre la session (« premier login qui confirme »). `login` d'un compte non activé → **403**
    `email_not_verified`. `POST /auth/resend` régénère le code. **Sécurité du code court** : 5 essais
    max/compte, expiration, rate-limit IP sur activate ; le VRAI garde-fou = **renvoi strictement
    limité** (3/h/compte + 10/h/IP). **Anti-énumération** : réponses génériques (compte inconnu / déjà
    activé / code faux → même 401 ; resend → « ok » générique).
  - **Front** : formulaire d'inscription avec email ×2 + identifiant + mot de passe ; écran d'activation
    (saisie du code, renvoi, retour) ; route `#/activer` qui pré-remplit email + code depuis le lien.
    **Vérifié au navigateur** bout-en-bout (inscription → écran d'activation → code → connecté).
  - **RGPD** : `docs/rgpd-registre.md` §1 bis (nouveau traitement, purge par cascade `users`).
  - **Tests** : PHP (`AuthActivationTest` : login bloqué, code faux ×5 + verrou, expiration, renvoi +
    rate-limit, anti-énumération, backfill ; `AuthRoutesTest` : pending + activate + double-email) ;
    web (`AccountView` : double-saisie bloquée, parcours activation, login-403→activation, lien #/activer).
    Rayon d'impact des tests géré : `register()` (helper) = inscription+activation via `MemoryMailer`.
  - Suites **toutes vertes** : **PHP 495, engine 926 (+1 skip), web 723**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-44-g05580cd`) : **migration 018 appliquée**
    (`{"applied":["018_email_verification.sql"]}` — backfill des comptes prod existants), health ok,
    référentiel/fiches/paquets « unchanged », front redéployé. **Smoke prod** (compte jetable) :
    `register` → **201 `pending_activation`** (pas de session) ; `login` du compte non activé → **403**
    (garde `email_not_verified` vivante) ; `activate` code faux → **401** générique (anti-énumération) ;
    app 200. L'`mail()` n'a pas erré (register 201).
  - ⚠️ **ACTION UTILISATEUR RESTANTE (Q1)** : vérifier **SPF/DKIM** et l'expéditeur
    `no-reply@humanome.xyz` au **panel OVH** — je ne peux pas lire la boîte d'un compte jetable, donc
    la RÉCEPTION réelle de l'email reste à confirmer côté toi. (`MAIL_FROM` prend le défaut :
    `~/app/shared/.env` prod NON modifié.) Un compte de smoke non activé (@example.org) subsiste en base
    (inoffensif, inutilisable) — purge possible plus tard.

- 2026-07-16 — **D4 (plan v1.1) — Visualisation : thème sombre, synchro heatmap, responsive, export JSON.**
  Quatre défauts corrigés, **vérifiés au navigateur** (#/merge, démo 59 feuilles).
  1. **Thème sombre** : `.timeline-controls button` et `.timeline-speed` avaient `background:#fff`
     SANS `color` → glyphe clair (color-scheme:dark) invisible. Corrigé avec tokens sémantiques
     (`--viz-surface`/`--viz-ink`, explicites sur les deux). Vérifié : glyphes ⏮◀▶▶▶⏭ nets en sombre.
  2. **Synchro** : `HeatmapCalendar` gagne une prop `currentDate` (date de la trame courante, fournie
     par `MergeView`) : les feuilles postérieures passent « à venir » (inertes), celle du jour courant
     surlignée. Vérifié : feuille 1/59 → 1 posée + 58 à venir ; dernière trame → tout posé.
  3. **Responsive** : le SVG passe en `viewBox` + `width:100%` + `preserveAspectRatio:xMidYMid meet`
     (max-width = taille naturelle, conteneur `overflow-x:auto`). Vérifié à 360 px : heatmap 238 px,
     ne déborde pas.
  4. **Export JSON** : util UNIQUE `web/src/lib/download-json.js` (factorisé depuis Twin9) ; bouton
     « Exporter le JSON » ajouté à `EssayerView` (cartographie-jour) et `Twin6OuverteView` (run.doc) ;
     `ResultatsTwin9` réutilise l'util (fin de la triplication).
  - **Tests** : `HeatmapCalendar` (currentDate, à venir, fluidité SVG), `download-json` (objet/chaîne,
     no-op SSR), `EssayerView`/`Twin6OuverteView` (bouton + nom + type du blob), `TimelinePlayer`
     non-régression. Vérif navigateur documentée (sombre + 360 px + heatmap qui se remplit), 0 erreur console.
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip), web 719**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static** seul) : app 200. Comportement visuel vérifié au
    navigateur en local (le prod sert le même bundle).

- 2026-07-16 — **D3 (plan v1.1) — Présenter l'offre employeur (moteur de recherche de compétences).**
  Présentation SEULE (AD-D6 : le moteur reste au backlog marketplace) : les tuiles employeur parlent
  enfin de l'offre payante à venir.
  - **FamilyTiles** : la carte persona employeur gagne un second volet « Rechercher des profils
    (à venir) » — abonnement payant qui finance l'accès gratuit à l'API pour les pays émergents, tarif
    **1 USD/cartographie remontée dégressif à partir de 10/100/1000**, facturation forfaitaire avant les
    recherches ajustée le mois suivant (crédits restants reportés), appel à manifestation d'intérêt
    (`mailto:contact@humanome.xyz`, constante `CONTACT_EMPLOYEUR`). Badge « à venir », aucune promesse
    de disponibilité immédiate.
  - **Aide** : entrée `employeur` dédiée (modèle tarifaire en clair + financement pays émergents).
  - **Formation** : nouveau chapitre `content/formation/employeur/05-offre-recherche-de-profils.md`
    (auto-globbé, statut complet, ordre 5).
  - **Doc source de vérité** : `docs/offre-employeur.md` (pricing versionné ; taux dégressifs marqués
    INDICATIFS — le plan ne fixe que base 1 USD + seuils 10/100/1000, pas les taux exacts, pas d'invention).
  - **Tests web** : volet + tarif + contact + « à venir » sans promesse immédiate (`FamilyTiles`),
    chapitre présent et complet (`formation-content`), traçabilité aide (`registry`).
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip), web 712**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (front **static** seul, pas de changement API/moteur) : app 200.
    Le volet employeur est rendu côté client (accueil → « Voir les profils » → « Employeur ») —
    vérifié par le test composant `FamilyTiles`.

- 2026-07-16 — **D2 (plan v1.1) — Édition du Twin9 réservée aux administrateurs-promptologues.**
  Décision AD-D2 : garde en **conjonction** admin ∧ promptologue, côté serveur ET front.
  - **Serveur** : nouveau `RequireRole::all(...)` (les DEUX rôles requis). Toutes les routes de
    CONTENU des gabarits Twin9 (`/twin9/admin/protocole**` en lecture/écriture/versions +
    `/twin9/admin/tester`) passent en `all('admin','promptologue')` : un admin non-promptologue ne
    voit plus le contenu (**403**), et le gabarit ne fuite jamais dans un refus. La SUPERVISION
    (config, contribution, promo « Twin9 gratuit », comptes) reste `admin` seul.
  - **Front** : l'éditeur des gabarits quitte l'admin pour une vue dédiée **`#/twin9-atelier`**
    (`Twin9AtelierView`) sous la famille « Faire évoluer », visible seulement si la session porte
    les deux rôles (nouvel attribut de nav `allRoles`, conjonction dans `navGroups`).
    `#/admin/twin9` (`Twin9Section`) garde la supervision (réglages + comptes) et pointe vers
    l'atelier. Le slider promo reste dans la supervision admin.
  - **Sécurité inchangée** : le contenu reste du texte brut (jamais de HTML/markdown) ;
    `/twin9/meta` et le filtre anti-fuite ne bougent pas.
  - **Tests** : matrice de rôles PHP complète (aucun rôle / admin seul / promptologue seul / les deux)
    sur chaque route de gabarits + garde supervision (`Twin9ProtocoleTest`) ; web
    (`Twin9AtelierView.test.jsx` garde 2 rôles + édition/banc d'essai, `Twin9Section.test.jsx`
    supervision seule, `nav.test.js` conjonction, aide `twin9atelier`). Doc : `docs/autorisations.md`.
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip), web 711**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-38-gce6cea9`) : migrate skipped 17,
    référentiel/seed/fiches « unchanged », paquets « unchanged », health ok, front redéployé. Smoke
    prod : routes de contenu gabarits (`GET /twin9/admin/protocole`, `POST /twin9/admin/tester`) →
    **401** non authentifié (garde `RequireRole::all` vivante) ; app 200. La distinction admin-seul
    (403) vs admin ∧ promptologue (200) est couverte par la matrice PHP.

- 2026-07-16 — **D1 (plan v1.1) — Twin6 forkable dans l'atelier promptologue.** Le protocole open
  source Twin6 est désormais un **paquet publié forkable** au même titre qu'`aurora-v3-reconstruit`,
  sans changer la page publique `#/twin6-ouverte` (qui sert toujours le JSON statique).
  - **Import** : `scripts/build-twin6-prompt-package.mjs` construit un document `prompt-package`
    (scan-pole + kairos + méga-prompt + 7 fiches en `prompts[]` éditables, `code.orchestration` avec
    marqueur `engine://…(twin6)`) depuis le **même corpus** que le paquet statique. `stage-api.sh`
    régénère les deux paquets (aurora + twin6) avant chaque `deploy.mjs api` (import idempotent par hash).
  - **Byte-identité prouvée** : `twin6-prompt-package.test.js` — scan-pole/kairos/fiches du paquet
    importé === paquet statique (source unique, aucune dérive).
  - **Réservation + fork-with-rename** : `metadata.reserved: true` marque le paquet comme propriété du
    pipeline source-unique ; `POST /prompt-packages/drafts` d'un paquet réservé **exige** un `toId`
    (nouveau nom, slug frais) → le fork est SA copie, publiable sous son propre nom. Le fork mémorise son
    origine (`metadata.forkedFrom`). Garde-fou aussi dans `publishDraft`. `GET /prompt-packages` expose
    le drapeau `reserved` (via `JSON_EXTRACT`, sans migration).
  - **Diff fork ↔ original** : la route de diff existante ne compare que des versions **publiées du même
    id** ; nouvelle route `GET /prompt-packages/drafts/{id}/diff-origin` compare le brouillon (fork) à son
    original (`forkedFrom`) même sous des ids différents — owner-scopé. Bouton dédié dans l'éditeur.
  - **Banc d'essai** : branche Twin6 (`usesTwin6Engine`/`extractTwin6Templates`) → `executerTwin6` sur le
    **portfolio entier** (7 scan-pôle + kairos → `cartographie-merge`), jamais l'extraction aurora par
    jour ; modes multi-run/A-B réservés aux paquets par jour. Accueil de l'atelier : encart
    « Partir du Twin6 ».
  - **Doc** : `docs/contrats.md` §8 (sémantique de version immuable, réservation, exécution déléguée).
  - Suites **toutes vertes** : **PHP 487, engine 926 (+1 skip = D11), web 709**, build web OK.
  - **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-36-gd52fcd0`) : `migrate` skipped 17,
    référentiel/seed/fiches **« unchanged »** (garde-fou confirme : aucun contenu confidentiel bougé),
    `import-prompt-package twin6-ouverte` → **`imported`** (aurora `unchanged`), health ok. Smoke prod :
    `GET /api/prompt-packages` → `twin6-ouverte reserved:true` ; le doc publié est `kind:prompt-package`
    (10 prompts, marqueur `(twin6)`) ; la page statique `data/twin6/twin6-ouverte-1.0.0.json` répond
    **200 inchangée** ; app 200. Vérif UI interactive du fork couverte par les tests composant (une
    session promptologue en prod donnerait la confirmation live).

- 2026-07-16 — **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-33`, `/api/health` ok, `migrate` skipped 17,
  seed/référentiel/fiches tous « unchanged » — le garde-fou fiches confirme qu'aucun contenu confidentiel
  n'a bougé ; front `index-DEyhdUY0.js` servi). **Historique git PURGÉ** avant publication
  (`git filter-repo`) : le `.pyc` fuyant un chemin local et les identifiants OVH réels (hôte/cluster)
  retirés de **tout** l'historique (vérifié : 0 occurrence sur `git rev-list --all`) ; tag `v1.0.0` conservé,
  69 commits réécrits, sauvegarde `../humanome-backup.bundle` rafraîchie. **✅ PUBLIÉ OPEN SOURCE**
  sur **https://github.com/4nd4ny/humanome** (public, AGPL-3.0, `main` + tag `v1.0.0`) : 1463 fichiers,
  vérifié sans aucun fichier confidentiel (golden/twin9-oracles/gabarits/.pyc/.env absents),
  `.env.example` en placeholders seulement. Détail des correctifs ci-dessous.
  Vérification multi-agents (13 domaines, lecture seule) de tout ce qui avait été demandé dans les
  sessions précédentes ; la plupart est **réellement implémenté et désormais couvert par des tests
  dédiés** (~40 fichiers de tests écrits/étendus). Défauts détectés **corrigés** (pas seulement
  journalisés) :
  - **Packs de recharge** `Twin9Config` : la grille demandée 10/20/50/**100/200/500** USD (`PACK_MAX_USD`
    100 → 500). Tests préexistants alignés (`Twin9AppelTest`, `Twin9ProtocoleTest` : borne « trop gros »
    150 → 750).
  - **Réécriture d'historique au re-seed** (bug source-unique) : `CompetenceRepository::reconcileSeed`
    ne backfille plus une version de seed **dépassée par une édition gouvernée** (garde `Semver::greaterThan`)
    — la diff 1.0.0 → 1.1.0 reste visible (`FicheParityTest`).
  - **Éditeur de fiche épistémiarque** : `EditeurSection` expose enfin le champ `content.fiche`
    (source unique) — la chaîne « édition d'une fiche dans l'atelier → Twin6/Twin9 » est bouclée côté UI.
  - **Garde-fou crédits Twin6** : `Twin6OuverteView` bloque un run sur NOTRE clé si le solde ne couvre
    pas le poids du portfolio (heuristique utilisateur ~1 ko = 1 USD) ; `fetchTwin6Offer` propage
    `solde_microusd`.
  - **Promo Twin9 côté front** : `Twin9View` consulte `meta.twin9_cle_perso_ouverte` (le backend
    l'implémentait déjà : refus 403 hors promo) — bandeau promo + option « clé privée » proposée
    seulement quand la promo est ouverte.
  - **Aide contextuelle** `epistemiarque` (rubrique sans entrée dédiée) ; **libellé** grand-livre
    `refund` → « Remboursement » (`CreditView`).
  - **Pré-publication** : suppression d'un `.pyc` versionné (fuite de chemin local) + `__pycache__/`/`*.pyc`
    gitignorés ; `api/.env.example` re-placeholderisé (identifiants OVH réels retirés du template public).
  - **Reporté au plan v1.1 (D11)** : renommage `Twin_v9 → Twin9` dans l'en-tête de `rapport_evolutif.md`
    (moteur) — impose de régénérer le vecteur figé `merge.vec.json` depuis le Python renommé, pas de
    hand-éditer le vecteur (la parité CPython réelle ne compare pas cet en-tête). Test `renommage.test.js`
    en `it.skip` documenté + ligne d'en-tête en liste blanche du lint. **Reportés aussi** (feature/plan) :
    assistant tuteur Haiku (D9), GitBook (D10) — voir `cahier des charges/plan-prompts-v1.1-developpement.md`.
  - Suites **toutes vertes** : **PHP 481, engine 926 (+1 skip = D11), web 696**, build web OK.

- 2026-07-16 — **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-29-g625a4ad`, commits `131326b` clé API profil
  + `625a4ad` source unique fiches). `migrate` → **017** (skipped 16). Seed : **61 compétences backfillées**
  avec fiche + 7 en-têtes, gate structurel OK (`b246101c`). **`generate-fiches` → `"unchanged"` (garde-fou) :
  le `twin9_fiches` généré depuis la base est BYTE-IDENTIQUE au golden prompt live — la prod CONFIRME la parité.**
  Front redéployé (prebuild régénère P*.md + paquet Twin6 byte-identique). Smoke prod : `/api/keys`→401 (live),
  `/api/competences/1.01` porte sa **fiche**, paquet Twin6 servi (7 fiches), app 200, référentiel 7.1.0. `deploy.mjs`
  n'a pas touché `~/app/shared/.env` ; `vendor/autoload.php` vérifié. Édition d'une fiche → `dump-fiches` (BDD→corpus)
  pour Twin6, `generate-fiches` (endpoint) pour Twin9 ; FUTURE-ONLY.

- 2026-07-16 — **SOURCE UNIQUE du référentiel : la compétence en base génère les fiches Twin6 + Twin9.** Fin du triple-maintien des fiches de scan (Twin6 P*.md publics +
  setting `twin9_fiches` + gabarits tagger, tous byte-identiques, `cmp` confirmé). Désormais **une seule
  source** : `competence.content.fiche`. Tests : **PHP 432, engine 911 (parité INTACTE), web 569**, parité
  octet prouvée à chaque niveau.
  - **Découverte clé (analyse multi-agents)** : la prose des fiches N'EST PAS confidentielle (déjà publique
    via Twin6, octet-identique au tagger Twin9) et **AUCUN oracle ne fige ses octets** (les vecteurs ne
    portent que [num,code,nom] ; le moteur teste la logique d'assemblage avec des fiches factices). La
    parité octet est donc une **cible auto-imposée** → gate dédié, pas un invariant existant.
  - **Extraction + preuve** : `scripts/extract-fiches.mjs` découpe les P*.md via le VRAI `parsePole` du
    moteur → `scripts/data/fiches-v7.json` (61 fiches + 7 en-têtes) et **prouve la régénération byte-exacte**
    (règle b : `header + Σ fiche.join("\n\n") + "\n"`, ≠ ficheComplete runtime qui double le `---`).
  - **Base = source** : schéma `competence.fiche` (hors hash structurel → `b246101c` intact) ; migration 017
    `referentiel_poles.header` ; `CompetenceSeeder` injecte fiche + en-tête et **backfille** les 1.0.0
    publiées sans fiche (`reconcileSeed` — sûr : aucune carto n'épingle une compétence).
  - **Générateurs déterministes** : `FicheGenerator` (PHP) reconstruit les P*.md (règle b) + la structure
    `twin9_fiches` depuis la base — `FicheParityTest` prouve **P*.md régénérés === fichiers d'or, octet pour
    octet**. `scripts/generate-fiches.mjs` (JS) régénère les P*.md depuis le corpus.
  - **Twin6 dérive du corpus** : `web` prebuild = `generate-fiches` + `build-twin6-package` → paquet
    byte-identique. Les P*.md (gitignorés) redeviennent des ARTEFACTS ; le corpus committé est la source.
  - **Twin9 dérive de la base** : endpoint `POST /api/admin/generate-fiches` (MIGRATE_TOKEN) régénère le
    setting confidentiel `twin9_fiches` via FicheGenerator→FicheStore. Le réassemblage runtime POLE_FICHES
    (avec `---` doublé) et COMPETENCE_FICHE restent **byte-identiques** (mêmes octets de fiche_md).
  - **Confidentiel PRÉSERVÉ** (non touché) : les 29 gabarits d'enrobage (`twin9_protocole`, tagger/lourd/
    merge) restent importés séparément par `import-protocole.mjs` (ils ne dérivent pas du référentiel) ;
    `twin9_fiches` jamais exposé par `/meta` ; permutation anti-gaming intacte.
  - **GARDE-FOU déploiement (revue advisor)** : `POST /admin/generate-fiches` COMPARE le `twin9_fiches`
    courant au généré et **refuse un écrasement silencieux** (409) sans `{"force":true}` — au 1er déploiement
    il DOIT rapporter « unchanged » (vérifié en dev) ; un diff = la prod contredit le corpus, on STOPPE.
    `deploy.mjs` sans force par défaut ; `FICHES_FORCE=1` pour une évolution assumée. Round-trip testé sur la
    règle RUNTIME (`FicheStore` → `poleFiches`, `---` doublé) que Twin9 envoie au LLM, pas seulement la règle P*.md.
  - **Boucle FERMÉE (source unique vraie)** : `GET /admin/dump-fiches` + `scripts/dump-fiches.mjs` re-synchronisent
    le corpus DEPUIS la base (byte-stable : dump === extract). Éditer `competence.fiche` dans l'atelier →
    `dump-fiches` (BDD→corpus) → Twin6 au build ; `generate-fiches` (endpoint) → Twin9. Les deux dérivent de la
    base. **FUTURE-ONLY** (cartos passées épinglent leur paquet). `stage-api.sh` embarque `scripts/data/`.
    **À COMMITER/DÉPLOYER sur demande** (tenir le déploiement jusqu'à ce que le garde-fou rapporte « unchanged »).

- 2026-07-15 — **Clé API privée dans le profil → Twin6 sur sa propre clé. FRONT-ONLY, NON COMMITÉ,
  NON DÉPLOYÉ.** Le backend `/api/keys` (KeyVault sodium, migration 005, providers anthropic/openai/
  google/openrouter/xai/ollama) existait déjà et est en prod — il manquait l'UI et le câblage.
  - `web/src/api/keys.js` (list/store/reveal/delete + `KEY_PROVIDERS`).
  - `web/src/views/account/ApiKeysSection.jsx` : section « Clés API personnelles » dans le profil
    (`#/compte`) — lister (provider + date, JAMAIS la clé), ajouter (select fournisseur + champ password,
    chiffrée serveur opt-in RGPD, jamais réaffichée), supprimer. Câblée dans `AccountView`.
  - `Twin6OuverteView` : voie « clé perso » — si une clé du fournisseur (anthropic) est enregistrée au
    profil, propose « Utiliser ma clé enregistrée » (révélée à la demande via `revealKey`, no-store) sans
    ressaisie ; sinon saisie manuelle + lien vers le profil.
  - Vérifié au navigateur (dev) : clé stockée **chiffrée** (blob sodium, pas le clair), listée sans le
    matériel, Twin6 propose la clé enregistrée, bouton « Lancer » actif sans ressaisie. Tests web 569 verts.
  - **Note** : « Option B » de notre échange = déverrouillage Twin9 (protocole→moteur + oracles) ; cette
    tâche est la clé-perso-Twin6, distincte. À committer/déployer sur demande.

- 2026-07-15 — **✅ DÉPLOYÉ EN PRODUCTION** (release `v1.0.0-26-g5ae20eb`, commit `5ae20eb`) —
  éditeur épistémiarque (gouvernance 015) + référentiel v7.1 enrichi + **modèle compétence ATOMIQUE
  (016)**, en un seul déploiement. `migrate` a appliqué **015 + 016** (skipped 14). Import référentiel :
  7.0.0 unchanged, **7.1.0 imported** (hash `b246101c`). **seed-competences** : 61 importées, 7 pôles,
  **gate de parité OK (`b246101c` === publié)**, lockfile 122. Smoke prod : `/api/competences` → **61**,
  `/api/referentiel` → 7.1.0 + définitions, `/api/competences/1.01` → protocole passe_1/2/3, health db:ok ;
  front statique déployé, `#/referentiel` affiche **RESPIRE v7.1 (61 compétences + définitions)**, 0 erreur
  console. `deploy.mjs` N'A PAS touché `~/app/shared/.env`. `vendor/autoload.php` vérifié avant push (483
  classmap). Reste (Option B, scopeLater) : brancher protocole→moteur + empreinteJournee (touche le golden
  prompt Twin9 verrouillé) pour rendre l'enrichissement agissant en prod.

- 2026-07-15 — **RÉARCHITECTURE : référentiel au grain COMPÉTENCE ATOMIQUE (migration 016).** Correction
  d'architecture demandée par l'utilisateur : les 61 compétences sont
  des ENTITÉS ATOMIQUES éditées / versionnées / gouvernées / concurrentes INDÉPENDAMMENT (modèle des
  YAML fournis : chaque compétence porte identité + protocole passe_1/2/3 + enrichissements). Décision
  utilisateur : **Option A « éditorial d'abord »** — modèle atomique complet, moteur Twin9 FIGÉ.
  Tests avant déploiement : **PHP 430, engine 911 (parité oracles INTACTE), web 562**, vérifié bout-en-bout
  au navigateur (proposer→éditer→CAS→voter→entériner ; 1.01 passée à v1.1.0 pendant que les 60 autres
  restent à v1.0.0 — indépendance prouvée). 0 erreur console.
  - **Migration 016 (additive)** : `competence_versions` (append-only par (code,semver), contenu riche
    JSON, nom/pôle STRUCTURELS porteurs du hash, `content_hash` = jeton CAS interne), `competence_votes`
    (miroir 015), `referentiel_snapshot_competences` (lockfile release↔version de compétence),
    `referentiel_poles`. `referentiel_versions` (003) CONSERVÉ comme couche de COMPOSITION (snapshot que
    le moteur consomme / que les cartographies épinglent — INCHANGÉ). Gouvernance document (015) conservée
    mais supersédée. Registre RGPD étendu (`competence_versions.created_by/submitted_by` SET NULL,
    `competence_votes.user_id` CASCADE).
  - **Deux hashes qui ne se mélangent jamais** : hash STRUCTUREL du snapshot = `ContentHash::compute`
    INCHANGÉ (`SnapshotAssembler` réassemble {poles,competences:{code,nom,pole}} et **appelle**
    ContentHash, aucune ré-implémentation) → **corps assemblé === publié `b246101c…` PROUVÉ** (gate de
    parité, aucun oracle/vecteur Twin9 ne bouge). `content_hash` par compétence = hash du contenu riche,
    PHP-interne (aucune parité Node).
  - **Concurrence PAR COMPÉTENCE (résout le lost update)** : `CompetenceRepository::updateDraft` fait un
    compare-and-swap ATOMIQUE dans le WHERE (`content_hash = :expectedHash AND status='draft'`) — en-tête
    `If-Match` côté API (428 si absent, 409 si périmé), gestion du no-op idempotent via re-findById.
    Deux épistémiarques sur deux compétences différentes = ZÉRO conflit.
  - **Gouvernance PAR COMPÉTENCE** : helpers purs `Electorate` + `MajorityTally` extraits (ReferentielGovernance
    délègue, non-régression verte) ; `CompetenceGovernance` (submit/withdraw/castVote/tally par
    competence_version_id) ; une compétence entérinée à la majorité pendant qu'une autre reste en débat.
  - **Coupe de release** : `ReferentielRepository::cutReleaseFromDocument` (assemble → gate complétude
    61/7 + semver strict, SANS second vote — déjà entériné par compétence) + lockfile.
  - **Schéma** `competence.schema.json` (identité/protocole/enrichissements, permissif) ajouté à
    Validation (PHP seul ; le moteur JS ne valide pas les compétences).
  - **Seed reproductible** : 61 YAML → `scripts/data/competences-v7.json` (converti PyYAML, committé) →
    `CompetenceSeeder` (partagé CLI `scripts/seed-competences.php` + endpoint `POST /api/admin/seed-competences`,
    MIGRATE_TOKEN, FTP-only). Lockfile WRITE-ONCE (INSERT IGNORE : un re-seed ne réécrit pas l'historique).
    `stage-api.sh` copie `scripts/data/` ; `deploy.mjs` applique 016 + importe référentiel + seed compétences.
  - **Routes** `api/src/routes/competences.php` (lectures publiques + cycle par compétence, mutations sous
    RoleGuard, vote membre-only). **Front** `EpistemiarqueView` réécrit au grain compétence : 61 par pôle,
    éditeur RICHE (identité + marqueurs + signaux passe_1 + enrichissements) avec CAS/If-Match, page de vote
    par compétence (diff, décompte, entérinement), coupe de release.
  - **scopeLater (Option B, non fait, touche le prompt verrouillé prod)** : brancher le protocole des
    compétences sur le moteur (générer les fiches `P{num}.md`) + `empreinteJournee` pour qu'un enrichissement
    déclenche un re-scan en PROD → impose de régénérer TOUS les oracles/vecteurs Twin9 + bump `VERSION_PROTOCOLE`.
    Tant que non fait : l'enrichissement d'un protocole est GOUVERNÉ et VERSIONNÉ mais n'AGIT PAS encore sur
    les cartographies de production. Export statique par compétence (ressource riche) non fait non plus.
  - **⚠️ À DÉPLOYER par l'utilisateur** : `deploy.mjs` (migration 016 + seed compétences via endpoint). Idem
    caveat précédent sur la page publique statique (déployer depuis ce working tree ou régénérer).

- 2026-07-15 — **Éditeur collaboratif des épistémiarques + gouvernance par vote (cahier §3.5)
  + référentiel enrichi des définitions (RESPIRE v7.1). PAS ENCORE DÉPLOYÉ.** Tests avant
  déploiement : PHP 401, engine 911, web 563 (verts).
  - **Gouvernance (migration 015)** : une édition du référentiel est un BROUILLON ; sa soumission
    ouvre un VOTE (statut `review`, déjà dans l'enum 003) ; elle n'est ENTÉRINÉE (publiée) qu'à la
    **majorité des membres épistémiarques** (`floor(N/2)+1` de l'électorat courant — abstentions et
    non-votants rendent le passage plus dur). Table `referentiel_votes` (1 bulletin/membre, upsert,
    purge RGPD en cascade), colonnes `submitted_at/by` + `decidim_url` sur `referentiel_versions`.
    Classe `ReferentielGovernance` (submit/withdraw/castVote/tally/électorat). `updateDraft` refuse
    d'éditer une proposition en vote (gel — sinon les votes seraient invalidés) ; `publish` gate sur
    `review` + majorité ; N=0 → publication bloquée (message clair) ; majorité `contre` → `rejected`.
    Vote réservé au rôle `epistemiarque` (un admin facilite mais n'est pas de l'électorat). Registre
    RGPD (`RgpdAuditTest`) mis à jour : `referentiel_votes.user_id` CASCADE, `submitted_by` SET NULL.
  - **Routes** : `GET/POST` drafts+`{id}`, `…/submit`, `…/withdraw`, `GET proposals[/{id}]` (diff+tally+votes),
    `POST proposals/{id}/votes`. Toutes les mutations derrière `RoleGuard` (`ReferentielAuthzTest` étendu).
  - **Vue `EpistemiarqueView`** (`#/epistemiarque[/editer|proposition/<id>]`) : atelier (version en
    vigueur, brouillons, propositions au vote), éditeur (noms/couleurs pôles, noms+**définitions**
    compétences), page de vote (diff, décompte + barre de progression, boutons pour/contre/abstention +
    commentaire, lien Decidim, bouton « Entériner » actif à la majorité, retrait). Nav « Édition du
    référentiel » repointée `#/referentiel`→`#/epistemiarque`. Vérifié au navigateur bout-en-bout :
    créer → éditer → soumettre → voter (1 membre, seuil 1) → entériner → 7.1.0 en vigueur, 0 erreur console.
  - **Référentiel enrichi (RESPIRE v7.1, E1)** : les 61 définitions fournies par les épistémiarques
    (`../referentiel/referentiel_liste.txt`) commitées in-repo (`scripts/data/referentiel-v7-definitions.json`),
    `scripts/enrich-referentiel.mjs` produit `respire-v7.1.0.json` (champ `description` facultatif).
    **Invariant clé** : `description` N'ENTRE PAS dans le hash (ContentHash inchangé sur le corps
    structurel) → 7.1.0 porte le **même contentHash que 7.0.0**, fixture et oracles engine intacts
    (911 verts = preuve de parité). Schéma étendu (description optionnelle) ; `ContentHash::normalize`
    préserve les clés extra en ordre canonique. `deploy.mjs` importe désormais 7.0.0 **et** 7.1.0.
    Vue publique `#/referentiel` affiche les définitions (cherchables). Limite notée : le diff est
    aveugle aux changements de définition seule (hors hash) — acceptable en v1.
  - **⚠️ À DÉPLOYER par l'utilisateur** — `deploy.mjs` importe 7.1.0 en BASE (atelier connecté) mais
    la page PUBLIQUE `#/referentiel` lit les fichiers STATIQUES `web/public/data/referentiel/` (gitignorés,
    générés). Déployer depuis CE working tree (les fichiers 7.1.0 y sont déjà présents) OU, sur un clone
    frais, régénérer d'abord dans l'ordre :
    `node scripts/extract-referentiel.mjs` → `node scripts/enrich-referentiel.mjs` →
    (import DB via `deploy.mjs api`) → `docker compose run --rm -w /var/www/html php php scripts/export-referentiel-static.php`
    → `cd web && npm run build` → `node scripts/deploy/deploy.mjs static`. Sinon l'atelier montre v7.1
    mais la page publique reste v7.0 (sans définitions). Un compte au moins doit porter le rôle
    `epistemiarque` pour entériner de futures éditions (électorat = comptes portant ce rôle).

- 2026-07-15 — **Déployé en production : thème sombre + Twin6 (front + API).** Commit `0a4933b`
  (feat twin6 + refinements Twin9 + renommage), release API `v1.0.0-24-g0a4933b`. `migrate`
  n'a rien appliqué (`{"applied":[],"skipped":14}` — schéma prod déjà à jour). Vérifié en ligne :
  `/api/health` `db:ok`, `POST /api/twin6/appel` sans session → **401** (route live + gardée),
  paquet public `data/twin6/…` → 200, page `#/twin6-ouverte` rendue (gratuit clé perso / crédits),
  thème sombre actif, 0 erreur console. Tests avant déploiement : PHP 382, engine 911, web 549.

- 2026-07-15 — **Thème sombre + épingle du menu persistante.** (1) **Thème sombre** complet :
  tout `global.css` passe par des tokens sémantiques (`:root` = clair) ; deux blocs redéfinissent
  ces valeurs en sombre — `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])`
  (suit le système) et `:root[data-theme='dark']` (choix explicite qui prime). ~50 couleurs
  codées en dur tokenisées (statuts ok/warn/danger/info, badges, ombres, voile) via script
  protégeant les lignes de définition. La **visualisation** (sunburst + heatmap + timeline) reste
  sur une surface CLAIRE `--viz-surface` dans les deux thèmes (panneau graphique encadré : la
  géométrie du moteur — secteurs gris jusqu'au noir, dégradé central pâle — n'a pas à être
  réécrite) ; ses textes/liserés utilisent `--viz-ink*` (sombres partout). Bouton **bascule
  soleil/lune** dans la grappe d'actions ; script **anti-FOUC** dans `index.html` (pose
  `data-theme` avant le paint si un choix est stocké) ; util `src/lib/theme.js` (localStorage,
  `matchMedia` gardé, abonnement au système tant qu'aucun choix). (2) **Épingle du menu** :
  l'épinglage (punaise du panneau) est désormais **persisté** (`localStorage`) et, sur grand écran
  (≥ 921 px), **docke** le tiroir en décalant `.app-main` pour ne pas masquer le contenu.
  Vérifié au navigateur en clair ET sombre (accueil, merge/viz encadrée, journée, menu, badges,
  toggle, persistance) ; revue adversariale contraste ; tests web 549+.

- 2026-07-14 — **En-tête épuré : grappe d'actions flottante + tiroir de nav depuis la
  gauche + épinglage + déconnexion rapide.** `.app-header` perd la marque et son fond
  (coquille invisible, juste une réserve de hauteur) ; `.app-header-actions` (aide + burger)
  passe en `position: fixed` (un `sticky` classique serait resté borné par la boîte quasi
  vide de `.app-header`, qui n'a plus assez de hauteur propre pour offrir une plage
  d'accroche — piège découvert et corrigé en vérifiant au navigateur, pas juste supposé).
  Le panneau de nav (`.app-nav-panel`) passe d'un dropdown ancré sous le bouton à un tiroir
  `position: fixed` pleine hauteur qui glisse depuis le **bord gauche de l'écran** (pas du
  bouton, resté à droite) via `transform: translateX(-100%/0)`, toujours dans le DOM (pas de
  `display:none`, a11y). Ajout d'une **icône punaise** dans l'en-tête du panneau
  (`.app-nav-panel-head`) : épingle l'ouverture (`is-pinned`), qui résiste au survol perdu,
  au clic extérieur et même à un changement de route (seule Échap ou la punaise referment) —
  état `pinned` lu via ref dans l'effet de route pour ne pas le reprogrammer à chaque
  épinglage. Ajout d'un bouton **« Se déconnecter »** (icône porte + flèche) en bas de
  `app-nav`, visible seulement connecté, appelant le vrai `logout()` d'`api/client.js` avec
  dégradation gracieuse (comme `AccountView`). `html { overflow-x: hidden }` pour clipper le
  tiroir hors-écran sans élargir le scroll (attention : jamais sur `body` seul, bascule
  implicite d'`overflow-y` en `auto` qui casse les contextes de scroll imbriqués). Vérifié au
  navigateur : desktop (survol révèle, clic épingle, épinglage survit à une vraie navigation
  intra-app, Échap referme + rend le focus), mobile (tap ouvre/ferme au tap extérieur),
  actions flottantes visibles au défilement sans chevaucher le contenu. Tests web 537 verts.

- 2026-07-14 — **Refonte de la navigation : 7 familles d'intention + landing « palais mental ».**
  Étude d'ergonomie complète (`docs/ergonomie-navigation.md` : mindmaps par persona, frictions
  confirmées + découvertes via 8 lentilles-persona multi-agents, 3 philosophies candidates,
  synthèse) puis câblage validé par l'utilisateur. **(1) Burger accessible** : la nav quitte la
  barre pour un panneau déroulant (survol desktop avec délai de grâce, clic épinglant web+mobile,
  focus clavier via `:focus-within`, Échap/clic-extérieur ferment ; liens toujours dans le DOM,
  masquage visuel seulement). **(2) `nav.js` réécrit** = source unique des 7 familles nommées par
  le BUT (Découvrir · Ma cartographie · Encadrer et garantir · Piloter mon organisation · Faire
  évoluer · Administrer · Mon compte), role-additives, items filtrés par rôle (l'épistémiarque a
  enfin un domicile : « Édition du référentiel ») ; badges d'échelle de valeur
  gratuit/standard/premium sur Essayer / Cartographier mes écrits / Analyse approfondie
  (friction n°1) ; `isCurrentItem` route+section. **(3) Landing de profil**
  (`components/FamilyTiles.jsx`) : tuiles des familles de la session teintées par famille
  (`--fam-*`) ; visiteur = bouton « Voir les profils d'utilisateurs » révélant la persona-bar
  (8 profils ; Employeur = carte explicative du lien de partage) ; **callout d'aide** : le
  survol/focus d'un lien de tuile affiche le contenu du bouton « ? » (`help/registry.js` via
  `parseHash`), le **1er clic sélectionne** (aria-live, Échap désarme, clics modifiés natifs),
  le **2e clic ouvre** — la « table des matières interactive » en actes. Prototype TOC conservé
  dans l'état (`docs/prototypes/plan-du-site-toc.html`). **Revue adversariale multi-agents du
  diff avant commit : 17 findings confirmés, tous corrigés** — dont le survol qui reprend la
  main sur un lien armé, l'armement par item (alias #/espace), la purge du callout au
  changement de profil, `role=group` sur les familles du burger, contrastes AA (teal 700),
  consignes clavier, et `help/registry.js` + tableau de bord alignés sur les nouveaux libellés
  (fin de « Lancer un run »). Vérifié en navigateur (visiteur, aperçu Cartographe, survol,
  deux-clics, navigation réelle, armé+survol post-correctif). Tests web 535. Non déployé
  (front seulement, `npm run build` OK + deploy à la prochaine fenêtre).

- 2026-07-13 — **Twin9 (le vrai Golden Prompt) porté et intégré (ADR-010).** Système
  multi-agents Python (~4400 l., 29 gabarits, ~3000 appels/run) rendu opérationnel sur le
  site. (T1) specs de portage bit-à-bit ; (T2) **portage JS `engine/src/twin9/` avec parité
  OCTET-À-OCTET** contre 6 oracles mock Python (0 écart) ; (T3) serveur : gabarits secrets en
  base, `POST /api/twin9/appel` (rendu serveur, base_url verrouillée, filtre anti-fuite),
  crédits prépayés micro-USD + **PayPal en flux redirect**, **factures récapitulatives
  mensuelles** + suivi dépenses (particuliers ET établissements), **marge +10 %** (couvre
  PayPal/OVH/domaine/démo Haiku) ; (T4) front : run (consentement RGPD, **devis via run mock
  navigateur avant paiement**, progression + reprise IndexedDB, résultats), crédit+factures
  imprimables, éditeur admin des gabarits + table des comptes ; (T5) déployé (désactivé).
  **Revue de sécurité adversariale** → 2 failles corrigées (course de solde/découvert ;
  contournement du filtre anti-fuite). **Correctif majeur du raccord réel** (le portage rendait
  les prompts côté client ; sur le site les gabarits + fiches confidentielles doivent rester
  serveur) : le moteur envoie chemin+variables d'état, le serveur **injecte les fiches secrètes**
  (`FicheStore`, jamais dans `/meta`) — bug invisible aux 903 tests mock, attrapé par un **test
  de contrat hors-ligne** et **prouvé par un vrai appel Anthropic** (greffier réel, fiche injectée,
  réserve→réconciliation = coût réel). Suites : PHP 373, engine 903, web 520. **Reste avant mise
  en service (utilisateur)** : identifiants PayPal REST (fournis plus tard) ; import des gabarits
  en prod (`scripts/twin9/import-protocole.mjs`, X-Migrate-Token) qui active la fonctionnalité —
  décision délibérée de l'utilisateur. Source `Twin9/` + gabarits = confidentiels, gitignorés.

- 2026-07-13 — **Phase UX post-v1 (demande utilisateur, 6 points) : trois chantiers livrés.**
  **(B) Navigation adaptée au rôle + aide contextuelle.** `web/src/nav.js` = source unique
  rôle → sections, groupées par famille (« Découvrir » pour tous ; « Mon travail » selon les
  rôles de la session, rafraîchie sans rechargement via l'événement `humanome:auth`). Bouton
  « ? » dans l'en-tête : aide par rubrique et par rôle (`web/src/help/`). En-tête restylé
  (rubrique courante marquée, cibles 44px).
  **(A) Réglages démo éditables depuis l'admin (smartphone).** Couche d'overrides en base
  (`settings.demo_overrides`) prioritaire dans `DemoConfig::load()` (base > env > fichier >
  défaut, fail-safe DB) ; API session admin `GET/PUT/DELETE /api/admin/demo-config` (validation
  bornée 422, audit sans valeurs, clé API jamais exposée — env uniquement ; provider non
  éditable). UI Réglages : grand interrupteur activer/désactiver (un clic, effet immédiat sur
  POST /api/llm — vérifié en dev : OFF → challenge refusé → ON → reset), modèle (menu +
  champ libre), 7 champs bornés avec badge d'origine (base/env/fichier/défaut). Nav admin
  refondue (accueil en cartes, onglets pastilles, mobile-friendly).
  **(C) Timeline animée de la cartographie.** `web/src/lib/sunburst/as-of.js` reconstruit la
  carte cumulée à toute date (règles verbatim du moteur, seuils de quintile FIXES calculés sur
  le doc final → la dernière trame == merge.json publié, 0 écart, parité 331 intacte) ;
  `TimelinePlayer` (lecture/pause/vitesse/scrubber accessible, arrêt en fin de plage, pause
  auto à la sélection d'un secteur, prefers-reduced-motion) câblé dans MergeView à côté de la
  heatmap ; compteur cumulé « N compétences sur la carte » + score du jour. Vérifié en
  navigateur : la démo se construit de 11 → 54 compétences sur les 59 feuilles. Idées reprises
  des prototypes `temporal-progression`/`cartography-viewer` (lecteur, scrubber, pivot).
  Tests : PHP 320, web 480, engine 214. Déployé (static + api).

- 2026-07-12 — **Post-v1.0.0 : deux défauts détectés puis corrigés (au lieu de simplement journalisés).**
  (1) **Crash de la vue diff du promptologue** : `DiffView` attendait une forme française fictive
  (`ajoutes/retires/modifies`, `from/to` en chaînes) que le serveur n'émet jamais — `PackageDiff.php`
  renvoie des clés anglaises, `from/to` en objets `{version}`, lignes `{op,line,text}` ; rendre
  `{diff.from}` (objet) plantait React et vidait l'atelier. Vue réécrite pour consommer la forme
  RÉELLE ; le test unitaire nourrit désormais cette forme (il propait la fiction et masquait le bug),
  l'e2e clique le vrai bouton « Diff contre X » et vérifie le rendu. (2) **Portabilité RGPD des
  cartographies de masse** (art. 15/20) : un apprenant ne pouvait pas récupérer les documents produits
  pour lui par un établissement (accès réservé au rôle établissement). Ajout de
  `GET /api/mes-documents-masse` (rôle apprenant, accès survivant au départ de la cohorte) + intégration
  à l'export « un clic ». Déployé (v1.0.0-2). Tests : PHP 311, web 440, engine 214, e2e vert.

- 2026-07-12 — **P13 finalisé : v1.0.0 déployée et taguée.** Le chantier D du workflow M9
  (déploiement/clone/status) ayant échoué en cours de flux, complété à la main : `GET /api/status`
  (santé publique version/db/démo/worker, cacheable 30 s, sans secret, testé) ; commandes
  `deploy.mjs releases` et `rollback` (repointage de `current.txt`, exercées en prod) ;
  `scripts/backup/backup-db.mjs` + restauration **testée en round-trip sur Docker** (dump → base
  neuve → 29 tables) ; `INSTALL.md` (clone déployable), `README.md` (vitrine AGPL-3.0),
  `api/.env.example`, `docs/deploiement.md`, `docs/backup-restore.md`. Historique git scanné :
  aucun secret réel (seuls des placeholders EXEMPLE). Déploiement final : migration 010 en prod
  (10/10), `/api/status` sain, en-têtes API stricts (CSP `default-src 'none'`, X-Frame DENY),
  CSP front avec jetons sandbox, page /confidentialite rendue. **Contrainte OVH consignée**
  (vérifiée au panel) : offre gratuite → PAS de cron ; masse/maintenance par endpoints externes,
  rien ne casse sans cron. Suites finales : PHP 308/308, web 439/439, engine 214/214, e2e 5/5.

- 2026-07-12 — **M9 terminé (P12+P13) : admin, RGPD transverse, durcissement — v1.0.0 INTÉGRÉE.**
  Clôture qualité : les 4 chantiers M9 (A administration, B RGPD transverse, C durcissement,
  D déploiement) fusionnés sans friction. **Suites toutes vertes ENSEMBLE** : PHP **307/307**
  (2470 assertions), web **439/439** (54 fichiers), engine **214/214**, runner **25/25**,
  e2e **5/5**, `npm run build` OK. **Parcours clone déployable rejoué sur instance vierge**
  (`docker compose down -v` → `up -d`) : migration DEPUIS ZÉRO par l'endpoint de prod
  `POST /api/admin/migrate` → **10/10 migrations appliquées dans l'ordre, 0 collision**
  (010 se pose proprement sur 009) ; imports idempotents (référentiel 7.0.0 + prompt-package
  `aurora-v3-reconstruit@1.0.0`) ; `GET /api/health` → `status ok, db ok, version` ; parcours
  minimal register→me→logout→login→logout OK (compte id 1 rôle `apprenant`, logout gardé CSRF —
  403 sans jeton, 401 après logout). **Checklist sécurité re-vérifiée** (`docs/securite-checklist.md`),
  5 items à risque sondés et CONFIRMÉS : (1) **IDOR** — `CartographyRepository` scope
  `AND user_id = ?` sur toute lecture/écriture (404, pas la ressource) ; (2) **CSRF** —
  middleware global `$app->add(new CsrfMiddleware())` (auth.php), double-submit `hash_equals`,
  exemptions exactes (migrate/login/register/llm), les routes admin SESSION en héritent
  (403 empirique) ; (3) **CSP-sandbox** — le vrai bloqueur était le **hash du `<script>` inline
  du srcdoc** (pas `frame-src`) ; garde anti-dérive `csp-hash.test.js` (recalcul depuis
  `buildSrcdoc()`) + e2e `sandbox-isolation` jouant la **CSP de prod réelle** lue dans
  `.htaccess` (bénin→result ET hostile contenu) — les deux verts ; (4) **secrets historique** —
  `git log --all` propre, seul `.env.deploy.example` versionné, toute occurrence `sk-ant-*`
  est un EXEMPLE/fixture, `.env.deploy` gitignoré ; (5) **purge RGPD complète** — `purge()` =
  `DELETE FROM users` s'appuyant sur les cascades FK (pas de liste de tables en dur qui
  dériverait) ; **`golden_grants` (ajoutée en A après le code de suppression) couverte** —
  preuve empirique : grant présent → `DELETE` user → grant cascade-supprimé, paquet conservé.
  Cohérence multi-agents de `system.php` vérifiée : `/api/status` n'existe pas (santé =
  `/api/health`) ; `/admin/maintenance` inline == `scripts/maintenance.php Maintenance::run()`
  (mêmes 3 DELETE, testés) ; **aucune collision de route** admin session (`/admin/users`,
  `/admin/golden`, `/admin/settings/*`) vs outillage jeton (`/admin/grant-role`,
  `/admin/default-package`, `/admin/maintenance`). `SecurityHeaders` câblé en dernier
  (le plus externe → décore 401/403/404). Chantier A : API admin session
  (`RequireRole::any('admin')` + CSRF), Golden = `is_private=1` + `golden_grants` (invisible
  aux 5 chemins de lecture de `PromptPackageRepository`). Chantier B : `content/legal/`,
  `docs/rgpd-registre.md` (10 traitements), `scripts/rgpd-audit.php`. Chantier C : CSP front
  corrigée (`script-src` + hash srcdoc + `blob:` + `worker-src blob:`), `SecurityHeaders`,
  audits deps (composer 0 advisory, `npm audit --omit=dev` 0).

- 2026-07-12 — **M8 terminé (P11) : établissements B2B et cartographie de masse, EN PRODUCTION.**
  Déployé (migration 009 en prod, worker-tick opérationnel). Audit : 1 SSRF medium corrigé
  (réassertion du fournisseur après réservation du job). Cron OVH worker à configurer en M9
  (POST /api/admin/worker-tick ou php scripts/worker.php).
  API (chantier A) : cohortes + codes d'invitation, consentement explicite à deux étages
  (rejoindre `{"consentement": true}` 422 sinon, dépôt de portfolio = opt-in serveur),
  config LLM/budget (clé endpoint sodium, jeton worker sha256), runs de masse (versions
  figées), file `mass_jobs` (checkpoint PAR PÔLE, bail 5 min, GET_LOCK, écritures
  conditionnelles), tick borné < 50 s (`php scripts/worker.php` + POST /api/admin/worker-tick),
  coupe-circuit budget AVANT chaque appel, purge RGPD par FK. Front (chantier B) :
  #/etablissement (cohortes, config, lancement en 2 temps avec estimation, avancement
  poll 5 s, vue membre = MERGE CÔTÉ CLIENT par le moteur) ; #/espace/cohortes (consentement,
  dépôt, quitter). Runner Node (chantier C) : même file via /api/worker/*, zéro dépendance.
  **Intégration : DoD P11 rejouée HORS PHPUnit** (scripts/dev/dod-p11.sh, preuves) :
  20 apprenants × 3 journées → run de 60 jobs par ticks CLI mock (5 appels/tick),
  interruption à 24/60 (39 ticks/195 appels), reprise 58 ticks/285 appels → 60 done,
  **480 appels exactement (0 double-appel)**, coût cohérent (spent_usd = Σ jobs = tableau
  = 12.808770 $), 120/120 documents valides (ajv moteur) ; plafond abaissé en cours de
  2e run → budget_exceeded propre, réactivation par hausse ; runner Node --once (mock
  injecté) draine 60 jobs via l'API. **Frictions d'intégration corrigées** : contrat
  /api/worker/jobs (référentiel COMPLET partagé au niveau réponse + referentielVersion
  + provider, le runner tel que livré ne pouvait PAS fonctionner contre l'API) ;
  page cohorte établissement (crash React : avancement objet rendu tel quel ; membres
  sans détail de dépôt → run inlançable ; statuts pending/error ≠ queued/failed ;
  run 'running' ≠ 'active') ; GET /api/cohortes manquant (liste apprenant) ; enveloppe
  {membre, documents} ; tarifs famille claude-* moteur alignés sur Pricing.php ;
  WORKER_TICK_MAX_CALLS (tick CLI bornable). Vérifié en navigateur : avancement en
  direct pendant une boucle de ticks (28/60 → 60/60 done), merge client (10/61
  compétences, vues jour), parcours apprenant 21e (inscription → consentement coché →
  dépôt « Journal de Maya »). Suites : PHP 274/274 (2213 assertions), web 422/422,
  engine 214/214, runner 25/25, e2e 4/4, build OK.

- 2026-07-12 — **M7 terminé (P9+P10) : espaces cartographe et promptologue EN PRODUCTION.**
  P9 : invitations à usage unique, file de relecture, annotations par compétence, révisions
  validées au schéma avec historique, GARANTIE humaine (révision figée servie par le lien de
  partage public, retirée automatiquement à toute nouvelle révision — §8), comparaison côte à
  côte, rapport de consistance multi-run lisible, purge RGPD asymétrique (révisions anonymisées).
  P10 : éditeur brouillon→publication immuable (semver strict, diff structurel ligne à ligne),
  proposition/validation de version par défaut, régénération rétrospective, banc d'essai
  (multi-run, A/B avec rapport téléchargeable), SANDBOX iframe origine opaque + worker blob +
  pont postMessage (quota 16 appels, timeout) avec **isolation réseau DÉMONTRÉE en vrai Chromium**
  (spec e2e dédiée), docs/securite-prompts.md, outillage admin grant-role (audité).
  E2E 4/4, PHP 234/234, web 395/395. Rôles en prod : à attribuer via POST /api/admin/grant-role
  (X-Migrate-Token) en attendant l'UI admin P12.

- 2026-07-12 — **M6 terminé (P8) : espace apprenant complet, EN PRODUCTION.** API : cartographies
  (stockage opt-in daté, liste sans document), liens de partage (token 128 bits haché, Argon2id,
  404 homogène anti-énumération, révocation, rate-limit), formation trackée, clés API personnelles
  chiffrées sodium (AD-4), prompt-packages publiés + paquet par défaut aurora-v3-reconstruit@1.0.0
  généré depuis les gabarits RÉELS du moteur (import idempotent par hash, endpoint admin).
  Front : dashboard (#/espace, fonctionne aussi anonyme/local), formation Markdown embarquée
  (parseur maison + DOMPurify, progression locale→serveur), assistant de run 5 étapes (paquet,
  fournisseur clé perso/service humanome, estimation, exécution avec checkpoints IndexedDB et
  REPRISE réelle), panneau cartographies (confidentialité, opt-in serveur RGPD explicite,
  partage+révocation, visionneuse), ShareView lecture seule, export/import archive validée au
  schéma. **E2E Playwright DoD vert** (compte→portfolio→run mock 24 appels→partage en contexte
  privé→export validé→suppression→404). Audit : 1 faible corrigée (no-store sur révélation de
  clé). PHP 182/182, web 299/299. Smoke prod : parcours complet vérifié en ligne.
  Backlog : titre « Mes cartographies » dupliqué (cosmétique) ; récits narratifs du merge en P10.

- 2026-07-12 — **M5 terminé (P6+P7) : démo LLM publique VALIDÉE EN PRODUCTION** (run complet
  réel : collage → PoW → 7 pôles Sonnet → visualisation Journée interactive sur humanome.xyz/#/essayer).
  P6 : proxy /api/llm (provider/model/plafonds imposés serveur, clé jamais exposée), garde-fous
  tous VÉRIFIÉS EN LIGNE (honeypot, PoW HMAC one-time — rejeu 429, quota IP/h — 429 vécu,
  coupe-circuit budget quotidien — 503 vécu, plafond d'entrée), gdoc-text anti-SSRF, page
  Essayer (progression par pôle, annulation, zéro persistance). P7 : portfolio client-first
  (coller/.txt/.md/Google Docs, segmentation en journées testée ×30, IndexedDB, ADR-010
  repli éditeur — Sqilium est une app Rails non intégrable). Audit abuseur : faille ÉLEVÉE
  corrigée (rotation IPv6 /64 → buckets par préfixe, aussi appliqué à l'auth).
  **Fiabilisation LLM apprise en prod** (~20 runs de debug, chaque échec = un correctif) :
  thinking par défaut du modèle mange le budget (→ thinking disabled) ; JSON indenté double
  le coût (→ compact monoligne exigé) ; malformations stochastiques (→ tool_use forcé =
  JSON garanti par l'API + retry unique par appel) ; glissements sémantiques (→ normalisation
  déterministe des invariants du corpus + dégradation ciblée pilotée par les chemins d'erreur
  ajv + validation par pôle) ; kairos volumineux (→ bornes de longueur + kairosOptional :
  dégradation gracieuse à null avec note UI) ; timeouts (→ curl 150 s, le LB OVH suit ;
  8192 tokens de budget). Config prod (env ~/app/shared/.env) : Sonnet 5, 8192 tokens,
  40 req/h/IP, PoW 16 bits, budget **8 $/jour**.
  **DÉCISION DE COÛT à trancher par l'utilisateur** (écart au cahier §3.1/§5 qui visait Haiku
  bon marché) : un run démo = 8 appels Sonnet ≈ 1 $+, donc le plafond 8 $/jour coupe après
  ~6-8 visiteurs/jour. Testé le 2026-07-12 : **Haiku + tool_use forcé ne suffit PAS** (JSON
  valide mais structure incomplète — `competences` absent ; Haiku ne suit pas la structure
  adverse profonde). Options : (a) garder Sonnet + plafond bas (actuel) ; (b) monter le budget ;
  (c) **piste non testée prometteuse** : mettre le SCHÉMA COMPLET du pôle dans `input_schema`
  du tool (décodage contraint) pour forcer la structure → pourrait rendre Haiku (bien moins cher)
  viable. Backlog M5 : (c) ci-dessus ; panneau pôle sans rapport (dégradé) affiche l'état vide
  — afficher audit + passages à la place.

- 2026-07-12 — **M4 terminé (P5) : moteur complet, gate de parité franchie** (rapport :
  docs/rapport-parite-moteur.md). Étage A (merge numérique) : PARITÉ 100 % — 132 618 valeurs
  comparées à l'oracle, formules retrouvées jusqu'à l'arrondi demi-pair Python (pythonRound).
  Étage B1 : 69/69 prompts narratifs identiques au byte près. Étage B2 : 100 % — quintiles
  exclusifs Python retrouvés, **archétype déterministe retrouvé (arbre à médiane par pôle,
  54/54)**, feedback HTML octet à octet. Étage C (extraction) recréé sans oracle (typologie
  d'attaques a..h retrouvée dans le corpus) = v1 du prompt-package par défaut (P10).
  Providers ×6 (2 transports, retry, estimate/coûts), runs/checkpoints/reprise (IndexedDB
  injectable), consistance multi-run, bout-en-bout mock 3 jours avec interruption/reprise.
  Revue adversariale : 3 bugs réels corrigés (dont corruption silencieuse du parseur JSON).
  Tests engine 182/182 ; squelettes de formation ×3 parcours livrés (§4.6).

- 2026-07-12 — **M3 terminé (P3+P4) : API en production.** 5 migrations MySQL (users/roles/
  sessions PDO/rate_limits/referentiel_versions/prompt_*/cartographies opt-in datée/share_links/
  training_progress/user_api_keys/audit_events, purge RGPD par FK), auth complète (ARGON2ID,
  anti-énumération, CSRF double-submit, rate-limit progressif, RequireRole), module référentiel
  versionné (import v7 idempotent hash-vérifié, brouillon→publication immuable, diff, export
  statique), front #/referentiel (arbre+recherche+permaliens+Decidim) et #/compte (RGPD),
  audit sécurité adversarial passé (1 défaut latent corrigé + 9 tests). Déploiement par releases
  ADR-008 opérationnel : 3 off-by-one de layout corrigés (migrations/schemas/VERSION),
  route POST /api/admin/import-referentiel ajoutée (pas de SSH). Prod vérifiée : migrations
  idempotentes, referentiel v7.0.0 servi par l'API, parcours register→me→purge RGPD→401,
  health db:ok versionné. Tests : PHP 89/89, web 147/147, corpus 68/68.

- 2026-07-12 — **M2 terminé (P2) : humanome.xyz EN LIGNE.** Visualisation unifiée déployée
  (https://humanome.xyz) : vue Merge (sunburst porté à parité stricte 331/331 paths contre le
  rendu original — divergence d'1 ulp de Math.cos/sin V8 résolue par arrondi correct BigInt),
  vue Journée reconstruite depuis extracted/ (verdicts, blocs adversariaux, traces, exclus,
  ?focus=), heatmap chrono cliquable, réécriture des 1262 liens du corpus vers les routes hash,
  DOMPurify durci (aucune requête externe possible depuis le HTML narratif), drag & drop JSON
  validé ajv, responsive 360px (onglets une-main ; fix minmax(0,1fr)), CSS print, a11y clavier.
  Bundle IIFE file://-compatible. Déployé par manifeste SHA-256 (65 fichiers), HTTPS forcé,
  CSP/HSTS actifs, smoke en ligne OK (deep-link jour + data lazy + console propre).
  Tests : 112/112. Limitation vérifiée : le FTP OVH clusterNNN ne supporte pas AUTH TLS →
  transfert en FTP simple (documenté).

- 2026-07-12 — **M1 terminé (P0+P1)**. P0 : CLAUDE.md, ADR-001..009 (relus adversarialement),
  inventaire-assets, docker php8.2+mysql8, /api/health, web Vite+React, engine ESM, AGPL-3.0.
  P1 : 5 schémas draft 2020-12 dérivés du corpus réel (enums recensées sur 3590 compétences×59 jours),
  convertisseurs (carto-data→merge, extracted→jour, extract-referentiel), validation double runtime
  (ajv engine/src/validation.js + opis api/src/Validation.php), fixtures fictives « Maya » 3 journées,
  docs/contrats.md. Vérifié : validate-corpus 68/68 OK, engine 6/6, web 2/2, PHP 6/6.
  Bonus : deploy FTPS prêt (ADR-008), oracle de parité sunburst capturé (331 paths du rendu original),
  MySQL prod vérifiée (8.0.46 joignable depuis le cluster).

- 2026-07-12 — Repo initialisé (commit 1 = .gitignore seul), assets copiés en lecture seule
  (`assets-existants/merge-prototype/`, `assets-existants/prototypes-react/`), cahier des
  charges et plan-prompts dans `docs/`.
- 2026-07-12 — Décisions actées avec l'utilisateur : licence AGPL-3.0 ; clé API Anthropic
  fournie (hors repo) ; MySQL OVH à créer via panel (plugin Chrome) ; données réelles de
  démo publiées telles quelles (consentement explicite du 2026-07-11).
- 2026-07-12 — Vérifié serveur OVH : PHP 8.2 (.ovhconfig), www/ vide, FTP OK, pas de SSH.
- 2026-07-12 — MySQL : base OVH existante fournie par l'utilisateur (`example123.mysql.db`,
  hébergée sur un autre hébergement OVH — credentials hors repo, `cahier des charges/mysql.txt`).
  Plus de création via panel nécessaire. **Vérifié le jour même par sonde PDO éphémère
  depuis le cluster humanome.xyz : joignable, MySQL 8.0.46, utf8mb4, PHP webroot 8.2.29.**

## Actions manuelles restantes (chef d'orchestre — clôture v1.0.0)

1. **Déploiement final** : `cd web && npm run build` (fait, à refaire si diff), puis
   `node scripts/deploy/deploy.mjs static` (www/) ; `scripts/deploy/stage-api.sh` puis
   `node scripts/deploy/deploy.mjs api` (releases + `current.txt` + `POST /api/admin/migrate`
   + imports + smoke `/api/health`). Credentials dans `.env.deploy` (gitignoré).
2. **Tag `v1.0.0`** : `git tag -a v1.0.0 -m "humanome.xyz v1.0.0"` (+ `git push --tags` après
   publication GitHub). La version affichée par `/api/health` est estampillée au déploiement
   depuis `git describe` (via `stage-api.sh` → fichier `VERSION`) : **tagger AVANT de stager l'API**.
3. **Cron OVH** (ADR-005/008, aucun script shell déployé — endpoints à jeton) :
   - worker de masse — `POST /api/admin/worker-tick` (X-Migrate-Token), ticks courts, ~toutes
     les 1–5 min tant qu'il y a des jobs (voir `docs/plan-masse.md`) ;
   - maintenance RGPD — `POST /api/admin/maintenance` (X-Migrate-Token), **quotidien**
     (purge liens de partage > 30 j, reset compteurs démo, PoW expirés).
4. **Rôles admin/privilégiés à créer** : aucun compte n'est admin par défaut (le 1er inscrit
   est `apprenant`, `admin` n'est pas un super-rôle implicite). Attribuer via
   `POST /api/admin/grant-role {email, role}` (X-Migrate-Token) — au moins un `admin`, puis
   les `cartographe`/`promptologue`/`epistemiarque` selon les personnes. L'UI admin
   (#/admin) prend le relais une fois un premier admin créé.
5. **Publication GitHub** (reportée depuis M1) : créer le dépôt, `git push` (+ tags).
   Sauvegarde intermédiaire : `git bundle create ../humanome-backup.bundle --all`.
6. **Smokes post-déploiement** (`docs/securite-checklist.md` §« après déploiement ») :
   `curl -sI https://humanome.xyz/api/health` → en-têtes API (CSP `default-src 'none'`,
   `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, `Permissions-Policy`) ; ouvrir
   #/promptologue et lancer le banc d'essai sur un paquet publié → **zéro violation CSP**
   en console (preuve que la correction sandbox tient en prod réelle) ; ramener le budget
   démo quotidien à 5–10 $ selon usage (compteurs de test consommés en M5).

## Backlog post-v1 (hors périmètre v1.0.0)

- **Marketplace employeur payante** (mise en relation apprenants↔employeurs monétisée).
- **Portfolio multimédia** (au-delà du texte : images, audio, vidéo).
- **Open-data recherche** (jeux de données anonymisés pour la recherche).
- **Promptagogue** (rôle/atelier pédagogique autour des prompts).
- **Régénération de masse** (rejeu rétrospectif d'une nouvelle version de prompt-package
  sur une cohorte entière).
- **GPU local** (inférence LLM auto-hébergée, hors API tierce).
- **OAuth Google Docs** (import portfolio authentifié, au-delà du `gdoc-text` public actuel).
- **i18n** (internationalisation de l'UI, aujourd'hui français uniquement).

## Dettes techniques / décisions en attente

- Golden Prompt : non fourni, hors git par design (`assets-existants/golden-prompt/` gitignoré).
- Pipeline Python amont absent : moteur rétro-conçu en M4 avec oracles
  (`intermediate/carto_merge.json`, `intermediate/prompts/`).
- Bundle front monolithique (~1,58 Mo / 331 Ko gzip) : avertissement de taille Vite
  informatif, non bloquant — code-splitting à envisager (backlog outillage).
- `npm audit` complet : 5 findings **outillage de dev uniquement** (vite/vitest/esbuild),
  non déployés, non exploitables en prod (cf. checklist A06) — bump majeur reporté au backlog.

## Jalons

| Jalon | Contenu | État |
|---|---|---|
| M1 | P0 fondations + P1 schémas/convertisseurs | ✅ terminé |
| M2 | P2 visualisation unifiée + 1er déploiement | ✅ en production |
| M3 | P3 BDD/comptes + P4 référentiel | ✅ en production |
| M4 | P5 moteur (parité oracle) | ✅ terminé |
| M5 | P6 démo LLM + P7 portfolio | ✅ en production |
| M6 | P8 espace apprenant | ✅ en production |
| M7 | P9 cartographe + P10 promptologue | ✅ en production |
| M8 | P11 masse B2B | ✅ en production |
| M9 | P12 durcissement + P13 prod v1.0.0 | ✅ intégré — déploiement + tag v1.0.0 par le chef d'orchestre |
