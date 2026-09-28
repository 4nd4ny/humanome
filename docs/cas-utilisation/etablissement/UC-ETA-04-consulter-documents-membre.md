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
   (lecture seule). »
5. Le site dédoublonne les journées, fusionne les documents jour avec le moteur
   (`mergeDays` puis `buildMergeDocument` avec des narratifs **locaux**, sans
   appel LLM), valide le résultat au schéma `cartographie-merge` et affiche la
   vue fusionnée (`MergeView`, sunburst) ; la barre « Vues du membre » propose
   « Vue fusionnée (N journée(s)) » et un bouton « Journée jj/mm/aaaa » par
   journée.

## Scénarios alternatifs

- **A1 — Consulter une journée** (étape 5) : « Journée … » affiche le document
  jour en `DayView` (lecture seule, sans nouvel appel réseau) ; « Vue
  fusionnée » revient à la fusion.
- **A2 — Run encore en cours** (étape 3) : seules les journées déjà `done`
  sont servies ; la fusion porte sur elles.
- **A3 — Même journée produite plusieurs fois** (étape 5) : deux runs (ou deux
  cohortes) ont extrait la même date ; l'API renvoie les deux entrées dans
  l'ordre des jobs, le site ne garde que la dernière reçue (une journée par
  date, exigence de `mergeDays`).
- **A4 — Membre de plusieurs cohortes de l'établissement** (étape 3) : les
  documents de toutes ses cohortes sont servis (champ `cohorte`) ; s'il quitte
  l'une d'elles, les documents produits dans celle-ci sortent du champ, ceux
  de l'autre restent.
- **A5 — Fusion non constructible** (étape 5) : le format `cartographie-merge`
  exige au moins une compétence établie dans chacun des 7 pôles sur la
  période ; sinon le site affiche l'explication (« La cartographie fusionnée
  n'a pas pu être construite… Les documents journaliers restent consultables
  individuellement. Détail technique : … ») et les boutons de journée restent
  actifs.

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
  réservé sans demander les documents.

## Règles de gestion

- **RG1** — Accès borné par établissement ET par adhésion active : la
  jointure exige `cohortes.etablissement_id` = session et une ligne
  `cohorte_membres` pour (cohorte du run, membre).
- **RG2** — Seuls les jobs `done` (documents validés au schéma) sont servis.
- **RG3** — 404 homogène : aucun oracle d'appartenance ni d'existence.
- **RG4** — La fusion est un calcul client déterministe, jamais stocké ni
  envoyé ; aucune exportation n'est proposée à l'établissement (l'export est un
  droit de l'apprenant — guide établissement, chapitre 5).
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
| Front | `web/src/router.js` — `parseHash` | Route `#/etablissement/membre/<id>` |
| Front | `web/src/views/etablissement/CohorteSection.jsx` | Lien « Documents » par membre |
| Front | `web/src/views/etablissement/MembreSection.jsx` | Chargement, rappel du consentement, navigation fusion/journée, messages |
| Front | `web/src/views/etablissement/etablissement-api.js` — `fetchMembreDocuments`, `frDate` | Appel et normalisation de l'enveloppe |
| Front | `web/src/views/etablissement/membre-merge.js` — `uniqueDayDocuments`, `buildMemberMerge` | Dédoublonnage, fusion moteur, validation, message d'échec |
| Front | `web/src/data/referentiel.js` — `loadPublishedReferentiel` | Référentiel publié (repli embarqué) |
| Front | `web/src/views/MergeView.jsx`, `web/src/views/DayView.jsx` | Rendu lecture seule |
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
| UC-ETA-04-U05 | `buildMemberMerge` | Document valide, provenance `membre-<id>`, horodatage à la seconde ; échec expliqué ; liste vide (RG4) | idem |

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
| UC-ETA-04-F07 | Nominal | IHM | `<App/>` : lien « Documents », consentement daté, fusion calculée localement, aucune écriture | `web/test/usecases/functional/uc-eta-04-consulter-documents-membre.test.jsx` |
| UC-ETA-04-F08 | A1 | IHM | Bascule `DayView` ↔ `MergeView` sans nouvel appel | idem |
| UC-ETA-04-F09 | A5 | IHM | Fusion impossible expliquée, journées consultables | idem |
| UC-ETA-04-F10 | A3 | IHM | Journée en double → 3 journées affichées | idem |
| UC-ETA-04-F11 | E1 | IHM | `404` → messages, aucune vue | idem |
| UC-ETA-04-F12 | E2 | IHM | Apprenant → espace réservé, documents jamais demandés | idem |

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
