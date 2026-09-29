# UC-ETA-04 — Consulter les documents produits pour un membre

| Champ | Valeur |
|---|---|
| **Acteur principal** | Établissement de formation (rôle `etablissement`) |
| **Acteurs secondaires** | Apprenant membre (a consenti — son adhésion active conditionne l'accès, UC-APP-08) ; exécutants de la file (ont produit les documents — UC-SYS-01) |
| **Portée** | humanome.xyz — page `#/etablissement/membre/<userId>` ; API `GET /api/etablissement/membres/{membreId}/documents` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.7 (« accès gratuit aux portfolios/cartographies de leurs propres élèves »), §4.4 (visualisation merge/journée), §6 (consentement), docs/plan-masse.md §0 (merge côté client) et §6, ADR-005 |
| **Statut** | Implémenté (P11 / M8) |

## Objectif

Permettre à l'établissement de lire, **en lecture seule**, les cartographies
journalières produites par ses runs de masse pour un membre qui a consenti,
et d'en voir la **fusion chronologique**, calculée dans son navigateur par le
moteur — sans que rien de plus ne soit stocké ni calculé côté serveur.

## Déclencheur

Depuis la page d'une cohorte, l'établissement clique « Documents » sur la
ligne d'un membre (lien `#/etablissement/membre/<userId>`).

## Préconditions

- Compte connecté portant le rôle `etablissement`.
- Le membre appartient **toujours** à au moins une cohorte de cet
  établissement (adhésion active = consentement en vigueur).
- Au moins une journée de ce membre a été extraite (`done`) par un run d'une
  de ces cohortes (UC-ETA-03, UC-SYS-01).

## Garanties en cas de succès

- L'établissement voit qui a consenti et quand, la cartographie fusionnée de
  la période et chaque journée, sans pouvoir rien modifier.
- La fusion est déterministe (moteur JS, parité oracle), recalculée à chaque
  ouverture, jamais renvoyée au serveur.

## Garanties minimales (en cas d'échec)

- Rien n'est révélé d'un membre inconnu, d'un autre établissement ou parti :
  la réponse est la même que pour un membre sans document.
- Une fusion impossible n'empêche pas la lecture des journées.

## Scénario nominal

1. L'établissement clique « Documents » ; le site ouvre
   `#/etablissement/membre/<userId>` (garde de rôle comme UC-ETA-01).
2. Le site appelle `GET /api/etablissement/membres/{membreId}/documents` et,
   en parallèle, charge le référentiel publié (fichiers statiques
   `data/referentiel/`, repli sur la copie embarquée RESPIRE v7).
3. Le serveur sélectionne les jobs `done` du membre dont le run appartient à
   une cohorte de CET établissement **et** dont le membre est encore adhérent,
   triés par journée puis par job, et répond `200 {membre: {userId,
   displayName, consentAt}, documents: [{jobId, runId, cohorteId, cohorte,
   date, promptPackage{id, version}, referentiel{id, version}, document}]}`.
4. Le site affiche « Documents de <nom> » et le rappel : « Ces cartographies
   sont visibles par votre établissement parce que ce membre a rejoint une de
   vos cohortes avec son consentement explicite (donné le jj/mm/aaaa) — … La
   fusion chronologique est calculée dans votre navigateur par le moteur
   (lecture seule). » — ce rappel est affiché quel que soit le résultat du
   chargement (voir Limites).
5. Le site dédoublonne les journées, fusionne les documents jour avec le moteur
   (`mergeDays` puis `buildMergeDocument` avec des narratifs **locaux**, sans
   appel LLM), valide le résultat au schéma `cartographie-merge` et affiche la
   vue fusionnée (`MergeView`, sunburst) ; la barre « Vues du membre » propose
   « Vue fusionnée (N journée(s)) » et un bouton « Journée jj/mm/aaaa » par
   journée (libellé calculé par `frDate`, décalé d'un jour en fuseau UTC− —
   voir Anomalies).

## Scénarios alternatifs

- **A1 — Consulter une journée** (étape 5) : « Journée … » affiche le document
  jour en `DayView` (lecture seule, sans nouvel appel réseau) ; « Vue
  fusionnée » revient à la fusion. Seule la barre « Vues du membre » reste
  dans l'espace : le calendrier de la vue fusionnée, les liens des narratifs
  et le lien « ← Retour à la cartographie » de la `DayView` mènent aux
  routes publiques de démonstration (voir Anomalies).
- **A2 — Run encore en cours** (étape 3) : seules les journées déjà `done`
  sont servies ; la fusion porte sur elles.
- **A3 — Même journée produite plusieurs fois** (étape 5) : deux runs (ou deux
  cohortes) ont extrait la même date ; l'API renvoie les deux entrées dans
  l'ordre des jobs, le site ne garde que la dernière reçue. `mergeDays`
  suppose des dates uniques sans le vérifier (un doublon fausserait
  silencieusement les présences cumulées) : le dédoublonnage du site est la
  seule protection.
- **A4 — Membre de plusieurs cohortes de l'établissement** (étape 3) : les
  documents de toutes ses cohortes sont servis (champ `cohorte`) ; s'il quitte
  l'une d'elles, les documents produits dans celle-ci sortent du champ, ceux
  de l'autre restent.
- **A5 — Fusion non constructible** (étape 5) : le format `cartographie-merge`
  exige au moins une compétence établie dans chacun des 7 pôles sur la
  période ; sinon le site affiche l'explication (« La cartographie fusionnée
  n'a pas pu être construite… Les documents journaliers restent consultables
  individuellement. Détail technique : … ») et les boutons de journée restent
  actifs. Le texte est le même quelle que soit la cause (référentiel invalide,
  exception du moteur) : seul le « détail technique » donne la cause réelle.

## Scénarios d'erreur

- **E1 — Aucun document accessible** (étape 3) : membre inconnu, membre d'un
  autre établissement, membre parti (consentement retiré), rien encore
  produit ou seulement des journées en échec → **même**
  `404 {error: "Aucun document pour ce membre"}` ; le site affiche ce message
  et « Aucun document produit pour ce membre dans vos cohortes pour
  l'instant : lancez un run de masse depuis la page de la cohorte. »
- **E2 — Pas le rôle** (étape 1) : sans session `401`, compte sans rôle
  `etablissement` `403` (un apprenant passe par sa propre route
  `GET /api/mes-documents-masse`, UC-APP-08) ; le site affiche l'espace
  réservé sans demander les documents (et, pour le visiteur, « Vous n'êtes
  pas connecté… »).
- **E3 — Erreur technique** (étape 3) : base non configurée → `503 {error:
  "Service indisponible"}`, exception SQL → `500 {error: "Erreur interne"}`,
  session expirée → `401` ; le site affiche le message du serveur **suivi du
  texte de E1** (« … lancez un run de masse depuis la page de la cohorte »),
  sans distinguer la panne de l'absence de document.

## Règles de gestion

- **RG1** — Accès borné par établissement ET par adhésion active : la
  jointure exige `cohortes.etablissement_id` = session et une ligne
  `cohorte_membres` pour (cohorte du run, membre).
- **RG2** — Seuls les jobs `done` (documents validés au schéma) sont servis.
- **RG3** — 404 homogène : aucun oracle d'appartenance ni d'existence.
- **RG4** — La fusion est un calcul client déterministe, jamais stocké ni
  envoyé ; aucun bouton d'export ni de téléchargement n'est proposé à
  l'établissement (l'export est un droit de l'apprenant — guide établissement,
  chapitre 5) ; l'impression navigateur (« Imprimer », donc « Enregistrer en
  PDF ») reste offerte par `MergeView` et `DayView`.
- **RG5** — Le paramètre de route s'appelle `membreId` : Slim copie les
  arguments de route dans les attributs de requête, un `{userId}` écraserait
  l'identifiant authentifié posé par `RequireRole`.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Documents `cartographie-jour` | Lus dans `mass_jobs.document` ; propriété de l'apprenant (restent accessibles à lui après son départ) |
| Consentement | `consentAt` affiché avant la visualisation |
| Fusion | Calculée dans le navigateur, jamais persistée |
| Portfolio déposé | Jamais servi par ce cas |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/etablissement/membre/<id>` (produit seulement la section `membre/<id>`) |
| Front | `web/src/views/EtablissementView.jsx` | Garde de rôle (espace réservé, E2), aiguillage `membre/<id>` vers `MembreSection` |
| Front | `web/src/api/client.js` — `apiFetch` | Message d'erreur serveur (`data.error`) affiché (E1, E3) |
| Front | `web/src/views/etablissement/CohorteSection.jsx` | Lien « Documents » par membre |
| Front | `web/src/views/etablissement/MembreSection.jsx` | Chargement, rappel du consentement, navigation fusion/journée, messages |
| Front | `web/src/views/etablissement/etablissement-api.js` — `fetchMembreDocuments`, `frDate` | Appel et normalisation de l'enveloppe |
| Front | `web/src/views/etablissement/membre-merge.js` — `uniqueDayDocuments`, `buildMemberMerge` | Dédoublonnage, fusion moteur, validation, message d'échec |
| Front | `web/src/lib/run-launcher.js` — `buildLocalNarratives` | Narratifs locaux de la fusion, sans LLM |
| Front | `web/src/data/referentiel.js` — `loadPublishedReferentiel` | Référentiel publié (repli embarqué) |
| Front | `web/src/views/MergeView.jsx`, `web/src/views/DayView.jsx`, `web/src/components/ViewToolbar.jsx` | Rendu lecture seule, bouton « Imprimer » |
| Front | `web/src/components/HeatmapCalendar.jsx` | Calendrier de la vue fusionnée — navigation par défaut vers `#/jour/<date>` (voir Anomalies) |
| Moteur | `engine/src/pipeline/merge.js` — `mergeDays` ; `merge-document.js` — `buildMergeDocument` ; `engine/src/validation.js` | Fusion déterministe, document, schéma |
| API | `api/src/routes/etablissement.php` — `GET /api/etablissement/membres/{membreId}/documents` | Requête bornée (établissement + adhésion + `done`), enveloppe, 404 homogène |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ETA-04-U01 | `parseHash` | `#/etablissement/membre/<id>` → section `membre/<id>` | `web/test/usecases/unit/uc-eta-04-consulter-documents-membre.test.js` |
| UC-ETA-04-U02 | `fetchMembreDocuments` | Normalisation de l'enveloppe réelle | idem |
| UC-ETA-04-U03 | `fetchMembreDocuments` | Replis (membre absent, date du document) et entrées inexploitables écartées | idem |
| UC-ETA-04-U04 | `uniqueDayDocuments` | Une journée par date (dernière reçue), ordre chronologique | idem |
| UC-ETA-04-U05 | `buildMemberMerge` | Document valide, provenance `membre-<id>`, horodatage à la seconde ; échec expliqué ; liste vide → message dédié « Aucun document jour à fusionner. » | idem |
| UC-ETA-04-U06 | `frDate` | Date-heure → `jj/mm/aaaa`, vide → `—`, illisible telle quelle ; date seule `2026-01-06` → `06/01/2026` à Paris mais `05/01/2026` aux Antilles et à Tahiti (anomalie figée) | idem |
| UC-ETA-04-U07 | `MembreSection` (isolée, `fetchFn`, `getReferentiel`) | `404` → message + texte E1 ; journée à un pôle → fusion expliquée ; référentiel nu accepté ; consentement daté ou absent | idem |
| UC-ETA-04-U08 | `loadPublishedReferentiel` | Index publié → version publiée (`origin: published`) ; index absent → copie embarquée (`bundled`, 7 pôles, 61 compétences) | idem |

La requête de la route (RG1-RG3) n'a pas de classe de domaine propre : elle est
couverte par les tests fonctionnels API ci-dessous.

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ETA-04-F01 | Nominal | API | Enveloppe, champs, tri par journée, documents valides, pas de texte déposé | `api/tests/UseCases/Functional/UcEta04ConsulterDocumentsMembreTest.php` |
| UC-ETA-04-F02 | A2 | API | Avant production : `404` ; en cours de run : seule la journée `done` | idem |
| UC-ETA-04-F03 | A3 | API | Même journée par deux runs : deux entrées dans l'ordre des jobs | idem |
| UC-ETA-04-F04 | A4 | API | Deux cohortes ; après départ de l'une, seule l'autre reste | idem |
| UC-ETA-04-F05 | E1 | API | Inconnu, étranger, parti, en attente, en échec → même `404` | idem |
| UC-ETA-04-F06 | E2 | API | `401` visiteur, `403` apprenant (qui garde sa propre route) | idem |
| UC-ETA-04-F07 | Nominal, RG4 | IHM | `<App/>` : lien « Documents », consentement daté, fusion calculée localement, aucune écriture ; pas d'export, « Imprimer » présent | `web/test/usecases/functional/uc-eta-04-consulter-documents-membre.test.jsx` |
| UC-ETA-04-F08 | A1 | IHM | Bascule `DayView` (journée du 06/01/2026 affichée, sans erreur) ↔ `MergeView`, aucun appel supplémentaire ; boutons repérés par position (indépendant du fuseau) | idem |
| UC-ETA-04-F09 | A5 | IHM | Fusion impossible expliquée ; la journée s'ouvre malgré tout | idem |
| UC-ETA-04-F10 | A3 | IHM | Journée en double → 3 journées ; c'est le second exemplaire reçu qui s'affiche | idem |
| UC-ETA-04-F11 | E1 | IHM | `404` → messages, aucune vue | idem |
| UC-ETA-04-F12 | E2 | IHM | Apprenant puis visiteur → espace réservé (« Vous n'êtes pas connecté » pour le visiteur), documents jamais demandés | idem |
| UC-ETA-04-F13 | A1, Anomalies | IHM | Clic sur le calendrier de la fusion du membre → `#/jour/2026-01-06`, `GET data/demo/jours/2026-01-06.json`, sortie de l'espace ; « ← Retour à la cartographie » → `#/merge` (comportement actuel) | idem |
| UC-ETA-04-F14 | E3 | IHM | `500` → « Erreur interne » suivi du texte de E1 et du rappel de consentement (comportement actuel) | idem |

### Tests existants liés (non-régression)

- `api/tests/EtablissementRunsTest.php` — `testAccesAuxDocumentsBorneParCohorteEtConsentement`.
- `api/tests/MasseRgpdPurgeTest.php` — départ du membre et cloisonnement par établissement.
- `api/tests/MasseLearnerAccessTest.php` — accès de l'apprenant à ses propres documents (y compris après départ).
- `api/tests/MasseDoDTest.php` — lecture des documents d'un membre après le run de 20 portfolios.
- `web/src/views/etablissement/membre-merge.test.js`, `web/src/views/EtablissementView.test.jsx` — fusion côté client, vue membre.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcEta04 --testdox
cd web && npx vitest run test/usecases/unit/uc-eta-04 test/usecases/functional/uc-eta-04
```

## Anomalies constatées

- **AN1 — Le calendrier et les liens de la fusion du membre ouvrent la
  démonstration.** `MergeView` rend `HeatmapCalendar` sans `onPickDay` : un
  clic sur un jour navigue vers `#/jour/<date>`, la `DayView` publique, qui
  charge `data/demo/jours/<date>.json` (corpus de DÉMONSTRATION, via
  `App.getDay` → `loadDay`) au lieu de la journée du membre, et quitte
  l'espace établissement ; les liens des narratifs (réécrits en
  `#/jour/…`) suivent le même chemin. En production, où les journées de
  démonstration du 06 et du 07/01/2026 existent, l'établissement verrait,
  sous « Journée du 06/01/2026 », la journée d'une autre personne, avec une
  navigation précédent/suivant dans le corpus de démonstration. Dans la
  `DayView` d'une journée du membre, « ← Retour à la cartographie » pointe
  vers `#/merge` (V3 de démonstration). Figé par UC-ETA-04-F13.
- **AN2 — Libellés de journée décalés d'un jour en fuseau UTC−.** `frDate`
  passe la date `AAAA-MM-JJ` à `new Date()`, qui la lit comme minuit UTC,
  puis l'affiche en heure locale : aux Antilles, en Guyane, en Polynésie ou
  aux Amériques, chaque bouton « Journée jj/mm/aaaa » affiche la veille
  (`frenchDate` de `data/load.js`, qui découpe la chaîne, n'a pas ce défaut ;
  la `DayView` affiche donc la bonne date dans son badge). Figé par
  UC-ETA-04-U06 ; les tests IHM repèrent les boutons par position pour rester
  indépendants du fuseau de la machine.

## Limites

- La fusion utilise le référentiel **actuellement publié** (ou la copie
  embarquée), pas la version figée du run pourtant portée par chaque document
  (`referentiel{id, version}`, ignoré par `fetchMembreDocuments`) : une
  évolution du référentiel peut désaligner fusion et extraction.
- Pour un membre de plusieurs cohortes, `consentAt` est celui de la cohorte du
  premier document servi (tri par journée), pas le plus récent ni le plus
  ancien consentement.
- Le lien « Documents » est proposé pour chaque membre, même sans document
  produit : la page affiche alors le message E1.
- Le rappel « ce membre a rejoint une de vos cohortes avec son consentement
  explicite » est affiché dans tous les cas, y compris sur un `404` pour un
  membre inconnu ou parti (E1) et sur une erreur technique (E3).
