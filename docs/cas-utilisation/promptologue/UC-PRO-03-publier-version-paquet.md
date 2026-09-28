# UC-PRO-03 — Publier une version de paquet

| Champ | Valeur |
|---|---|
| **Acteur principal** | Promptologue (auteur du brouillon) |
| **Acteurs secondaires** | Autres promptologues, lanceur de runs des apprenants, établissements (consommateurs de la version publiée, UC-PRO-01) |
| **Portée** | humanome.xyz — `POST /api/prompt-packages/drafts/{draftId}/publish` ; formulaire « Publication » de l'éditeur `#/promptologue/editeur/<draftId>` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.4 (éditer/versionner le système de prompts), §4.3 (chaque cartographie référence la version exacte du prompt — reproductibilité) ; plan P10 point 2 (« brouillon → publication : version immuable, semver, changelog ») et point 3 (« seules les versions publiées sont exécutables par autrui ») |
| **Statut** | Implémenté (P10) |

## Objectif

Transformer un brouillon en **version publiée** : immuable, exécutable et
dérivable par autrui, identifiée par un semver **strictement supérieur** à
toutes les versions déjà publiées du paquet et documentée par une entrée de
**changelog** — la condition de la reproductibilité des cartographies.

## Déclencheur

Dans l'éditeur de son brouillon, le promptologue clique « Publier… ».

## Préconditions

- Session portant le rôle `promptologue`.
- Un brouillon de l'auteur, enregistré et conforme au schéma (UC-PRO-02) ; sa
  version est fixée dans le brouillon.

## Garanties en cas de succès

- La version passe au statut `published`, horodatée (`published_at`,
  `metadata.publieLe`), avec l'entrée de changelog
  `{version, date, description}` ; le changelog est aussi conservé en colonne.
- Elle devient visible de tous (liste, document, diff — UC-PRO-01),
  dérivable par les autres promptologues (UC-PRO-02) et exécutable au banc
  d'essai (UC-PRO-05).
- Elle ne peut plus jamais être modifiée ni republiée.
- La description du paquet est celle de la version publiée.

## Garanties minimales (en cas d'échec)

- Le brouillon reste un brouillon, inchangé (transaction annulée).
- Aucune version publiée n'est modifiée.

## Scénario nominal

1. Dans l'éditeur, le promptologue clique « Publier… » : un formulaire
   rappelle *id@version*, que la version sera **immuable** et exécutable par
   les autres, et que le semver doit être strictement croissant.
2. Il saisit le « Changelog de la version (obligatoire) » : le bouton
   « Confirmer la publication » reste désactivé tant que le texte est vide ou
   blanc.
3. Il confirme : le navigateur envoie
   `POST /api/prompt-packages/drafts/{draftId}/publish` `{changelog}` avec
   l'en-tête `X-CSRF-Token`.
4. Le serveur vérifie le rôle, que le corps est un objet JSON et que
   `changelog` est une chaîne non blanche (elle est trimée).
5. Dans une transaction, le serveur verrouille la ligne de l'auteur, vérifie
   qu'elle est encore un brouillon, puis que sa version est strictement
   supérieure (précédence semver 2.0.0) à **chaque** version publiée du
   paquet.
6. Il retire du changelog du document toute entrée existante pour cette
   version, ajoute `{version, date du jour, description = changelog}`, pose
   `metadata.publieLe`, re-valide au schéma, passe la ligne en `published`
   (contenu, colonne `changelog`, `published_at`) et met à jour la
   description du paquet.
7. Réponse `200 {id, version, status: "published"}` ; l'IHM referme le
   formulaire et affiche « Version *id@version* publiée — elle est désormais
   immuable. ».
8. La version figure désormais dans « Paquets publiés » ; le brouillon a
   quitté « Mes brouillons ».

## Scénarios alternatifs

- **A1 — Effet sur le paquet par défaut** (étape 6) : sans défaut validé par
  l'administrateur, la version tout juste publiée devient le défaut servi aux
  apprenants (dernière publication, UC-PRO-01 RG3) ; avec un défaut validé,
  rien ne change (UC-ADM-03).
- **A2 — Première publication d'un fork renommé** (étape 5) : le paquet de la
  copie n'a encore aucune version publiée, toute version est acceptée ; la
  copie est listée non réservée.
- **A3 — Pré-version** (étape 5) : `1.1.0-rc.1` se publie après `1.0.0`, puis
  `1.1.0` la dépasse (une version sans pré-version l'emporte).
- **A4 — Abandon** (étape 2) : « Annuler » referme le formulaire, aucune
  requête.

## Scénarios d'erreur

- **E1 — Garde** (étapes 3-4) : visiteur `401`, sans rôle `promptologue`
  `403`, jeton CSRF absent ou invalide `403`.
- **E2 — Changelog manquant** (étapes 2 et 4) : absent, blanc ou non textuel
  → `422 {error: "Champ requis : changelog (résumé des changements)"}` ;
  corps JSON non objet → `400 {error: "Corps JSON invalide"}`. L'IHM empêche
  déjà la confirmation d'un changelog blanc.
- **E3 — Brouillon d'autrui ou inconnu** (étape 5) : `404 {error:
  "Brouillon introuvable"}`.
- **E4 — Semver non strictement croissant** (étape 5) : `409 {error:
  "Semver must be strictly increasing: x is not greater than published y"}` ;
  l'IHM affiche ce message (en anglais, UC-PRO-02 AN-2), le brouillon reste
  éditable : on corrige sa version (UC-PRO-02 A3) puis on republie.
- **E5 — Version déjà publiée** (étape 5) : republier → `409 {error: "This
  version is already published (published versions are immutable)"}` ;
  réenregistrer → `409` (UC-PRO-02 E9) ; le contenu publié est inchangé.
- **E6 — Brouillon marqué réservé** (étape 6) : un document portant
  `metadata.reserved = true` (posé à la main dans l'éditeur) est refusé,
  défense en profondeur : `409 {error: "Ce paquet est réservé au pipeline
  source-unique : forkez-le sous un nouveau nom."}`.

## Règles de gestion

- **RG1** — Une version publiée est **immuable** : ni réécriture, ni
  republication, ni retour au brouillon ; toute évolution passe par un
  nouveau brouillon (UC-PRO-02).
- **RG2** — Semver **strictement croissant par paquet** : la version doit
  dépasser *chaque* version publiée du paquet selon la précédence semver
  2.0.0 (pré-version < version finale ; identifiants numériques comparés en
  nombres et inférieurs aux alphanumériques ; métadonnées de build ignorées —
  `1.0.0+build` n'est pas supérieur à `1.0.0`). Les brouillons n'entrent pas
  dans la comparaison.
- **RG3** — Changelog **obligatoire**, trimé ; entrée déterministe (une seule
  entrée par version, datée du jour de publication).
- **RG4** — Seules les versions publiées sont exécutables par autrui ; seul
  l'auteur publie son brouillon (portée auteur, `404` homogène).
- **RG5** — Publication atomique (transaction avec verrou `FOR UPDATE` sur le
  brouillon et les versions publiées du paquet).
- **RG6** — Un paquet réservé n'est jamais publié par l'atelier (seul le
  chemin d'import du pipeline source-unique y écrit, UC-SYS-02).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Version publiée | Contenu collectif, public en lecture, sans donnée d'apprenant ; l'auteur (`created_by`) passe à `NULL` à la suppression de son compte, la version survit anonymisée (`docs/rgpd-registre.md`) |
| Publication | Pas d'événement d'audit (le changelog et `published_at` tracent la publication) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/promptologue/EditeurSection.jsx` — `publish`, formulaire « Publication » | Confirmation, changelog obligatoire, messages |
| Front | `web/src/views/promptologue/api.js` — `publishDraft` | Appel HTTP |
| Front | `web/src/api/client.js` — `apiFetch`, `ApiError` | Jeton CSRF, erreurs typées |
| API | `POST /api/prompt-packages/drafts/{draftId}/publish` — `api/src/routes/packages.php` | Corps, changelog, codes HTTP |
| API | `api/src/Referentiel/RoleGuard.php`, `api/src/Middleware/CsrfMiddleware.php` | Rôle, CSRF |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `publishDraft` | Transaction, semver, changelog, immuabilité |
| Domaine | `api/src/Referentiel/Semver.php` — `compare`, `greaterThan` | Précédence semver |
| Domaine | `api/src/Packages/PackageConflictException.php`, `api/src/Validation.php` | 409, re-validation |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-PRO-03-U01 | `publishDraft` | Statut, date, entrée de changelog, `publieLe`, description du paquet (étape 6) | `api/tests/UseCases/Unit/UcPro03PublierVersionPaquetTest.php` |
| UC-PRO-03-U02 | `publishDraft` | Entrée préexistante pour la version remplacée (RG3) | idem |
| UC-PRO-03-U03 | `publishDraft` | Inférieure, égale+build refusées ; pré-version puis finale (RG2, A3, E4) | idem |
| UC-PRO-03-U04 | `Semver` | Précédence semver 2.0.0 (RG2) | idem |
| UC-PRO-03-U05 | `publishDraft` | Inconnu/autrui → `null` ; déjà publiée → conflit (E3, E5) | idem |
| UC-PRO-03-U06 | `publishDraft` | Brouillon `reserved` refusé, transaction annulée (E6, RG5) | idem |
| UC-PRO-03-U07 | `publishDraft` | Première publication d'un fork renommé (A2) | idem |
| UC-PRO-03-U08 | `createPromptologueApi.publishDraft` | `POST …/publish {changelog}` | `web/test/usecases/unit/uc-pro-03-publier-version-paquet.test.js` |
| UC-PRO-03-U09 | `apiFetch`, `ApiError` | Jeton CSRF joint ; 409 → message serveur | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-PRO-03-F01 | Nominal | API | 200, liste et document publics, changelog trimé, `publieLe`, plus de brouillon, dérivable par autrui | `api/tests/UseCases/Functional/UcPro03PublierVersionPaquetTest.php` |
| UC-PRO-03-F02 | A1 | API | Défaut effectif déplacé sans défaut validé, inchangé sinon | idem |
| UC-PRO-03-F03 | A2 | API | Fork renommé publié, non réservé | idem |
| UC-PRO-03-F04 | A3 | API | Pré-version puis finale | idem |
| UC-PRO-03-F05 | E1 | API | 401, 403 rôle, 403 CSRF ; brouillon intact | idem |
| UC-PRO-03-F06 | E2 | API | 422 changelog absent/blanc/non textuel ; 400 JSON invalide | idem |
| UC-PRO-03-F07 | E3 | API | Brouillon d'autrui ou inconnu → 404 | idem |
| UC-PRO-03-F08 | E4 | API | 409 semver, puis correction et publication | idem |
| UC-PRO-03-F09 | E5 | API | Republier / réenregistrer → 409, contenu inchangé | idem |
| UC-PRO-03-F10 | E6 | API | Brouillon `reserved` → 409, jamais publié | idem |
| UC-PRO-03-F11 | Nominal + A1 | IHM | `<App/>` : formulaire, confirmation désactivée puis active, POST + CSRF, message, version « par défaut » sur l'accueil | `web/test/usecases/functional/uc-pro-03-publier-version-paquet.test.jsx` |
| UC-PRO-03-F12 | E2 + A4 | IHM | Changelog blanc : confirmation impossible ; « Annuler » sans requête | idem |
| UC-PRO-03-F13 | E4 | IHM | Message serveur, formulaire toujours ouvert | idem |
| UC-PRO-03-F14 | E5 | IHM | « Enregistrer » après publication → 409 affiché | idem |

### Tests existants liés (non-régression)

- `api/tests/PackagesDraftsTest.php` — `testDraftLifecycleCreateEditPublish`,
  `testPublishRequiresStrictlyIncreasingSemver`, `testWritingToAPublishedVersionIs409`.
- `api/tests/PackagesTwin6Test.php` — `testRenamedForkLandsInAFreshOwnedPackageAndCanBePublished`.
- `api/tests/ReferentielUnitTest.php` — `Semver` (partagé avec le référentiel).
- `web/src/views/promptologue/EditeurSection.test.jsx` — « Enregistrer et Publier ».
- `web/e2e/parcours-promptologue.e2e.js` — étape « Publication » (navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcPro03 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-PRO-03
```

## Anomalies constatées

- Messages de refus `409` en anglais affichés tels quels (UC-PRO-02, AN-2) —
  figé ici par UC-PRO-03-F13 et UC-PRO-03-F14.

## Limites

- Pas d'événement d'audit à la publication (seuls `published_at`, la colonne
  `changelog` et l'entrée du document en gardent trace).
- Sans défaut validé, publier une version change le paquet proposé aux
  apprenants (A1) : c'est la validation administrateur (UC-ADM-03) qui fige
  ce choix.
