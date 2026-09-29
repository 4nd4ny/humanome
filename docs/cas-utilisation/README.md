# Cas d'utilisation — catalogue et traçabilité des tests

Ce dossier décrit **chaque cas d'utilisation (UC)** de humanome.xyz, tel qu'il
est réellement implémenté, et relie chacun à ses **jeux de tests** :

- **tests unitaires** — le code sollicité par le cas (classe PHP du domaine,
  module ou composant JS) est appelé directement, sans couche HTTP ;
- **tests fonctionnels** — le scénario documenté (nominal, alternatifs,
  erreurs) est rejoué par l'interface publique : l'API HTTP (application Slim
  en processus, vraie base MySQL) et/ou l'IHM (application React rendue en
  jsdom, réseau simulé).

La documentation vit ici ; les tests vivent **à part**, à côté du code qu'ils
exercent (voir « Organisation des tests »).

## Organisation

### Fiches

Une fiche par cas, rangée par acteur principal :

| Dossier | Acteur | Préfixe |
|---|---|---|
| [`visiteur/`](visiteur/) | Visiteur (sans compte) | `UC-VIS` |
| [`compte/`](compte/) | Tout utilisateur inscrit | `UC-CPT` |
| [`apprenant/`](apprenant/) | Apprenant | `UC-APP` |
| [`cartographe/`](cartographe/) | Cartographe | `UC-CAR` |
| [`employeur/`](employeur/) | Employeur potentiel | `UC-EMP` |
| [`promptologue/`](promptologue/) | Promptologue | `UC-PRO` |
| [`epistemiarque/`](epistemiarque/) | Épistémiarque | `UC-EPI` |
| [`etablissement/`](etablissement/) | Établissement de formation | `UC-ETA` |
| [`administration/`](administration/) | Administrateur | `UC-ADM` |
| [`systeme/`](systeme/) | Système et exploitation (runner, déploiement, maintenance) | `UC-SYS` |

Chaque fiche suit le même plan (modèle :
[UC-EMP-01](employeur/UC-EMP-01-consulter-cartographie-partagee.md)) :
en-tête (acteurs, portée, niveau, références au cahier des charges, statut),
objectif, déclencheur, préconditions, garanties de succès et minimales,
**scénario nominal** (étapes numérotées), **scénarios alternatifs** `Ax` et
**d'erreur** `Ex` (avec l'étape de branchement), règles de gestion `RGn`,
données et RGPD, **code sollicité**, puis **jeux de tests**.

### Identifiants de tests

- `UC-XXX-NN-Unn` : test unitaire ; `UC-XXX-NN-Fnn` : test fonctionnel.
- En PHP, l'identifiant est porté par l'attribut `#[TestDox('UC-… — …')]`
  (lisible avec `--testdox`) ; en JS, par le libellé du `it(…)`.
- Chaque fiche liste ses tests (identifiant, cible ou scénario, niveau, ce qui
  est vérifié, fichier) ; chaque fichier de test cite en tête sa fiche.
- Règle de couverture : chaque scénario de la fiche (nominal, `Ax`, `Ex`) a au
  moins un test fonctionnel ; chaque élément de logique du « code sollicité »
  a au moins un test unitaire.

### Organisation des tests

| Couche | Unitaires | Fonctionnels |
|---|---|---|
| API PHP (PHPUnit) | `api/tests/UseCases/Unit/Uc<Xxx><NN>…Test.php` | `api/tests/UseCases/Functional/Uc<Xxx><NN>…Test.php` |
| Front React (Vitest, jsdom) | `web/test/usecases/unit/uc-xxx-nn-….test.js(x)` | `web/test/usecases/functional/uc-xxx-nn-….test.jsx` |
| Moteur ESM (Vitest) | `engine/test/usecases/unit/uc-xxx-nn-….test.js` | — (le moteur est exercé fonctionnellement via l'IHM) |

Les suites historiques (`api/tests/*.php`, `web/src/**/*.test.*`,
`engine/src/**/*.test.js`, `web/e2e/*.e2e.js`) restent en place : chaque fiche
les cite dans « Tests existants liés ».

### Exécuter

```sh
# API — suites « cas d'utilisation » (PHP 8.2 + MySQL via Docker)
docker compose up -d
docker compose run --rm php composer test:usecases
docker compose run --rm php vendor/bin/phpunit --filter UcEmp01 --testdox   # un seul UC

# Front et moteur
cd web && npm run test:usecases
cd engine && npm run test:usecases
```

`DB_TEST_NAME` (défaut `humanome_test`) choisit la base de test : plusieurs
processus PHPUnit peuvent tourner en parallèle sur le même serveur MySQL,
chacun dans sa base (`docker compose run --rm -e DB_TEST_NAME=humanome_test_b php …`).

Les tests moteur (`engine/test/usecases/`) tournent aussi dans la CI GitHub
(job « Tests moteur ») : ils ne lisent que des fichiers versionnés. Les tests
front et PHP, comme les suites historiques, s'exécutent en local (données
dérivées de `web/public/data/` générées, voir [UC-SYS-04](systeme/UC-SYS-04-construire-artefacts-derives.md)).

Les utilitaires partagés par les tests d'un même lot vivent dans
`api/tests/UseCases/Support/` et `web/test/usecases/support/` (faux serveurs
en mémoire aux formes réelles de l'API, faux IndexedDB, faux fournisseurs LLM
rejouant les fixtures : aucun appel réseau réel).

## Catalogue

<!-- catalogue:start -->
### Visiteur

| ID | Cas d'utilisation | Tests unitaires | Tests fonctionnels | Anomalies |
|---|---|---:|---:|---:|
| [UC-VIS-01](visiteur/UC-VIS-01-explorer-cartographie-demonstration.md) | Explorer la cartographie de démonstration | 29 | 24 | 5 |
| [UC-VIS-02](visiteur/UC-VIS-02-consulter-referentiel-public.md) | Consulter le référentiel public de compétences | 11 | 17 | 1 |
| [UC-VIS-03](visiteur/UC-VIS-03-essayer-cartographie-en-direct.md) | Essayer la cartographie en direct, sans compte | 24 | 23 | 4 |
| [UC-VIS-04](visiteur/UC-VIS-04-se-reperer-guides-aide.md) | Se repérer : accueil, navigation, guides, aide, confidentialité | 13 | 20 | 3 |
| [UC-VIS-05](visiteur/UC-VIS-05-interroger-assistant-tuteur.md) | Interroger l'assistant tuteur | 7 | 19 | 1 |

### Compte (tout utilisateur inscrit)

| ID | Cas d'utilisation | Tests unitaires | Tests fonctionnels | Anomalies |
|---|---|---:|---:|---:|
| [UC-CPT-01](compte/UC-CPT-01-creer-activer-compte.md) | Créer un compte et l'activer par code email | 18 | 25 | 6 |
| [UC-CPT-02](compte/UC-CPT-02-se-connecter-deconnecter.md) | Se connecter et se déconnecter | 17 | 25 | 5 |
| [UC-CPT-03](compte/UC-CPT-03-gerer-profil.md) | Gérer son profil (nom affiché, avatar) | 18 | 19 | 3 |
| [UC-CPT-04](compte/UC-CPT-04-gerer-cles-api.md) | Gérer ses clés API personnelles | 14 | 21 | 1 |
| [UC-CPT-05](compte/UC-CPT-05-suivre-progression-formation.md) | Suivre sa progression de formation | 15 | 17 | 5 |
| [UC-CPT-06](compte/UC-CPT-06-supprimer-compte.md) | Supprimer son compte (droit à l'effacement) | 10 | 11 | 1 |

### Apprenant

| ID | Cas d'utilisation | Tests unitaires | Tests fonctionnels | Anomalies |
|---|---|---:|---:|---:|
| [UC-APP-01](apprenant/UC-APP-01-constituer-portfolio.md) | Constituer son portfolio local | 21 | 29 | 5 |
| [UC-APP-02](apprenant/UC-APP-02-lancer-cartographie-standard.md) | Lancer une cartographie standard | 40 | 25 | 6 |
| [UC-APP-03](apprenant/UC-APP-03-consulter-ses-cartographies.md) | Consulter ses cartographies | 13 | 15 | 2 |
| [UC-APP-04](apprenant/UC-APP-04-stocker-regler-confidentialite.md) | Stocker une cartographie sur le serveur et régler sa confidentialité | 21 | 27 | 4 |
| [UC-APP-05](apprenant/UC-APP-05-partager-avec-employeur.md) | Partager une cartographie avec un employeur | 18 | 23 | 2 |
| [UC-APP-06](apprenant/UC-APP-06-exporter-importer-archive.md) | Exporter et importer son archive complète | 16 | 16 | 6 |
| [UC-APP-07](apprenant/UC-APP-07-inviter-cartographe.md) | Inviter un cartographe | 9 | 10 | 1 |
| [UC-APP-08](apprenant/UC-APP-08-rejoindre-cohorte.md) | Rejoindre une cohorte, déposer son portfolio, quitter | 12 | 25 | 4 |
| [UC-APP-09](apprenant/UC-APP-09-cartographie-ouverte-twin6.md) | Lancer une cartographie ouverte (Twin6) | 30 | 20 | 3 |
| [UC-APP-10](apprenant/UC-APP-10-analyse-approfondie-twin9.md) | Lancer une analyse approfondie (Twin9) | 45 | 28 | 7 |
| [UC-APP-11](apprenant/UC-APP-11-gerer-credit-twin9.md) | Gérer son crédit Twin9 (achat, factures, remboursement) | 17 | 29 | 3 |
| [UC-APP-12](apprenant/UC-APP-12-interface-ipsative-v3.md) | Explorer sa cartographie dans l'interface ipsative V3 | 28 | 24 | 19 |

### Cartographe

| ID | Cas d'utilisation | Tests unitaires | Tests fonctionnels | Anomalies |
|---|---|---:|---:|---:|
| [UC-CAR-01](cartographe/UC-CAR-01-accepter-invitation.md) | Accepter l'invitation d'un apprenant | 17 | 14 | 1 |
| [UC-CAR-02](cartographe/UC-CAR-02-consulter-file-relecture.md) | Consulter sa file de relecture | 14 | 20 | 2 |
| [UC-CAR-03](cartographe/UC-CAR-03-annoter-cartographie.md) | Annoter une cartographie | 11 | 16 | 2 |
| [UC-CAR-04](cartographe/UC-CAR-04-corriger-cartographie.md) | Corriger une cartographie (révision) | 15 | 23 | 7 |
| [UC-CAR-05](cartographe/UC-CAR-05-garantir-cartographie.md) | Garantir une cartographie ou retirer sa garantie | 13 | 19 | 4 |
| [UC-CAR-06](cartographe/UC-CAR-06-comparer-versions.md) | Comparer des versions de cartographie | 10 | 12 | 2 |
| [UC-CAR-07](cartographe/UC-CAR-07-mesurer-consistance.md) | Mesurer la consistance multi-run | 13 | 15 | 3 |

### Employeur

| ID | Cas d'utilisation | Tests unitaires | Tests fonctionnels | Anomalies |
|---|---|---:|---:|---:|
| [UC-EMP-01](employeur/UC-EMP-01-consulter-cartographie-partagee.md) | Consulter une cartographie partagée | 17 | 25 | 3 |

### Promptologue

| ID | Cas d'utilisation | Tests unitaires | Tests fonctionnels | Anomalies |
|---|---|---:|---:|---:|
| [UC-PRO-01](promptologue/UC-PRO-01-consulter-paquets-publies.md) | Consulter les paquets de prompts publiés et leurs différences | 19 | 23 | 3 |
| [UC-PRO-02](promptologue/UC-PRO-02-editer-brouillon-paquet.md) | Créer et éditer un brouillon de paquet de prompts | 21 | 26 | 6 |
| [UC-PRO-03](promptologue/UC-PRO-03-publier-version-paquet.md) | Publier une version de paquet | 12 | 17 | 4 |
| [UC-PRO-04](promptologue/UC-PRO-04-proposer-version-defaut.md) | Proposer une version par défaut | 6 | 8 | — |
| [UC-PRO-05](promptologue/UC-PRO-05-banc-essai.md) | Évaluer un paquet au banc d'essai | 32 | 29 | 3 |
| [UC-PRO-06](promptologue/UC-PRO-06-retrospective.md) | Régénérer rétrospectivement des cartographies | 13 | 22 | 3 |
| [UC-PRO-07](promptologue/UC-PRO-07-sandbox.md) | Exécuter le code d'un paquet en sandbox | 16 | 13 | 2 |
| [UC-PRO-08](promptologue/UC-PRO-08-editer-gabarits-twin9.md) | Éditer les gabarits du Golden Prompt Twin9 | 11 | 22 | 5 |

### Épistémiarque

| ID | Cas d'utilisation | Tests unitaires | Tests fonctionnels | Anomalies |
|---|---|---:|---:|---:|
| [UC-EPI-01](epistemiarque/UC-EPI-01-proposer-modification-competence.md) | Proposer une modification de compétence | 22 | 21 | 5 |
| [UC-EPI-02](epistemiarque/UC-EPI-02-voter-proposition.md) | Voter sur une proposition | 16 | 21 | 2 |
| [UC-EPI-03](epistemiarque/UC-EPI-03-enteriner-publier.md) | Entériner et publier (compétence, release du référentiel) | 15 | 20 | 3 |
| [UC-EPI-04](epistemiarque/UC-EPI-04-editer-version-referentiel.md) | Éditer une version complète du référentiel | 12 | 17 | 2 |

### Établissement

| ID | Cas d'utilisation | Tests unitaires | Tests fonctionnels | Anomalies |
|---|---|---:|---:|---:|
| [UC-ETA-01](etablissement/UC-ETA-01-gerer-cohorte.md) | Créer et gérer une cohorte | 15 | 15 | 3 |
| [UC-ETA-02](etablissement/UC-ETA-02-configurer-llm-budget.md) | Configurer le moteur LLM, le budget et le jeton worker | 12 | 14 | 2 |
| [UC-ETA-03](etablissement/UC-ETA-03-piloter-run-masse.md) | Lancer, suivre et annuler un run de masse | 14 | 25 | 6 |
| [UC-ETA-04](etablissement/UC-ETA-04-consulter-documents-membre.md) | Consulter les documents produits pour un membre | 8 | 14 | 2 |

### Administration

| ID | Cas d'utilisation | Tests unitaires | Tests fonctionnels | Anomalies |
|---|---|---:|---:|---:|
| [UC-ADM-01](administration/UC-ADM-01-gerer-comptes-roles.md) | Gérer les comptes et les rôles | 27 | 25 | 2 |
| [UC-ADM-02](administration/UC-ADM-02-gerer-golden-prompt.md) | Gérer le Golden Prompt et ses accès | 12 | 22 | 2 |
| [UC-ADM-03](administration/UC-ADM-03-valider-paquet-defaut-reglages.md) | Valider le paquet par défaut et les réglages | 12 | 14 | 2 |
| [UC-ADM-04](administration/UC-ADM-04-configurer-demo.md) | Configurer la démo publique | 27 | 22 | 2 |
| [UC-ADM-05](administration/UC-ADM-05-superviser-twin9.md) | Superviser Twin9 | 13 | 17 | 4 |
| [UC-ADM-06](administration/UC-ADM-06-monitoring.md) | Consulter le monitoring | 21 | 17 | 3 |

### Système et exploitation

| ID | Cas d'utilisation | Tests unitaires | Tests fonctionnels | Anomalies |
|---|---|---:|---:|---:|
| [UC-SYS-01](systeme/UC-SYS-01-traiter-file-jobs.md) | Traiter la file de jobs de masse | 26 | 24 | 9 |
| [UC-SYS-02](systeme/UC-SYS-02-deployer-migrer.md) | Déployer, migrer et importer | 11 | 22 | 6 |
| [UC-SYS-03](systeme/UC-SYS-03-maintenance-supervision.md) | Maintenance et supervision technique | 8 | 10 | 2 |
| [UC-SYS-04](systeme/UC-SYS-04-construire-artefacts-derives.md) | Construire les données et artefacts dérivés | 6 | 16 | 4 |
| [UC-SYS-05](systeme/UC-SYS-05-sauvegarder-restaurer.md) | Sauvegarder et restaurer la base | 0 | 8 | 6 |

**Total : 58 cas d'utilisation, 963 tests unitaires et 1140 tests fonctionnels identifiés, 214 anomalies de production documentées.**

Les comptes portent sur les identifiants distincts (`UC-…-Unn`, `UC-…-Fnn`) présents dans les fichiers de tests ; un identifiant paramétré (`it.each`) compte pour un.
<!-- catalogue:end -->

## Index des anomalies de production

L'analyse des cas d'utilisation a mis au jour des écarts entre le code, sa
documentation et le comportement attendu. **Aucun n'a été corrigé dans le code
de production** (hors du périmètre de ce travail) : chacun est décrit dans la
section « Anomalies constatées » de sa fiche, avec sa cause, et son
comportement **actuel** est figé par un test vert commenté comme tel — le jour
où l'anomalie est corrigée, ce test échoue et désigne la fiche à mettre à jour.

<!-- anomalies:start -->
- **[UC-VIS-01](visiteur/UC-VIS-01-explorer-cartographie-demonstration.md#anomalies-constatées)** — Explorer la cartographie de démonstration
  - AN1 — Vue journée : la sélection d'un pôle n'affiche pas son rapport
  - AN2 — Test e2e obsolète
  - AN3 — Statut HTTP du corpus de démonstration ignoré
  - AN4 — Lecteur de construction : « mouvement réduit » activé pendant une lecture (mineure)
  - AN5 — Vue chronologique : accord au singulier absent (mineure)
- **[UC-VIS-02](visiteur/UC-VIS-02-consulter-referentiel-public.md#anomalies-constatées)** — Consulter le référentiel public de compétences
  - AN1 — Permalien mal encodé : l'application plante
- **[UC-VIS-03](visiteur/UC-VIS-03-essayer-cartographie-en-direct.md#anomalies-constatées)** — Essayer la cartographie en direct, sans compte
  - AN1 — Difficulté réglable par l'admin mais insoluble par le navigateur
  - AN2 — Le moteur réessaie contre le quota et le budget
  - AN3 — Borne de saisie incompatible avec le plafond serveur
  - AN4 — Phase « retry » sans libellé
- **[UC-VIS-04](visiteur/UC-VIS-04-se-reperer-guides-aide.md#anomalies-constatées)** — Se repérer : accueil, navigation, guides, aide, confidentialité
  - AN1 — Progression locale des guides écrasée d'un parcours à l'autre
  - AN2 — Compte sans rôle traité en visiteur
  - AN3 — Note d'aperçu trompeuse pour le profil Employeur
- **[UC-VIS-05](visiteur/UC-VIS-05-interroger-assistant-tuteur.md#anomalies-constatées)** — Interroger l'assistant tuteur
  - AN1 — Rubrique non validée, injectée dans la consigne système
- **[UC-CPT-01](compte/UC-CPT-01-creer-activer-compte.md#anomalies-constatées)** — Créer un compte et l'activer par code email
  - AN1 — Pré-détournement de compte : l'activation ne redéfinit pas le mot de passe
  - AN2 — Empreintes non salées conservées sans limite
  - AN3 — Comptes jamais activés conservés indéfiniment
  - AN4 — Bornes du code court non atomiques
  - AN5 — Blocage de l'activation par un tiers
  - AN6 — Longueur du mot de passe comptée différemment
- **[UC-CPT-02](compte/UC-CPT-02-se-connecter-deconnecter.md#anomalies-constatées)** — Se connecter et se déconnecter
  - AN1 — Se déconnecter d'une session expirée ou purgée : `403 CSRF`, affichage incohérent
  - AN2 — `session.use_strict_mode` inopérant
  - AN3 — Déconnexion refusée depuis le panneau : erreur avalée
  - AN4 — Compte connecté sans aucun rôle : navigation de visiteur
  - AN5 — `ip_hash` : empreinte non salée
- **[UC-CPT-03](compte/UC-CPT-03-gerer-profil.md#anomalies-constatées)** — Gérer son profil (nom affiché, avatar)
  - AN1 — Échec réseau présenté comme un format refusé
  - AN2 — Repli sur les initiales définitif jusqu'au remontage
  - AN3 — Nom fait d'espaces Unicode accepté par l'API
- **[UC-CPT-04](compte/UC-CPT-04-gerer-cles-api.md#anomalies-constatées)** — Gérer ses clés API personnelles
  - AN1 — Alerte de chargement persistante
- **[UC-CPT-05](compte/UC-CPT-05-suivre-progression-formation.md#anomalies-constatées)** — Suivre sa progression de formation
  - AN1 — Progression anonyme multi-parcours écrasée
  - AN2 — Saut de ligne final accepté par le motif d'identifiant
  - AN3 — L'annulation d'une bascule efface les bascules concurrentes
  - AN4 — Parcours `noesiologie` sans introduction
  - AN5 — Progression connectée absente de l'export RGPD
- **[UC-CPT-06](compte/UC-CPT-06-supprimer-compte.md#anomalies-constatées)** — Supprimer son compte (droit à l'effacement)
  - AN1 — Session ressuscitée par une requête concurrente
- **[UC-APP-01](apprenant/UC-APP-01-constituer-portfolio.md#anomalies-constatées)** — Constituer son portfolio local
  - A-01 — Fins de ligne CRLF : les entêtes Markdown ne découpent pas
  - A-02 — Identifiant Google Docs brut inutilisable depuis le formulaire
  - A-03 — Bouton « Cartographier » obsolète
  - A-04 — Changement de portfolio pendant la pause de 600 ms : le portfolio ouvert est réenregistré sans modification et la liste garde l'ancien titre du portfolio quitté
  - A-05 — Quitter la vue pendant la pause de 600 ms perd la dernière modification
- **[UC-APP-02](apprenant/UC-APP-02-lancer-cartographie-standard.md#anomalies-constatées)** — Lancer une cartographie standard
  - A-01 — Version par défaut du serveur ignorée par l'assistant
  - A-02 — Quota ou épuisement du service en cours de run
  - A-03 — Checkpoints jamais purgés : relance sans recalcul
  - A-04 — Indicateurs de progression faux après une journée en échec
  - A-05 — Quota par défaut incompatible avec un run standard, sans avertissement
  - A-06 — Troncature non signalée en mode clé personnelle
- **[UC-APP-03](apprenant/UC-APP-03-consulter-ses-cartographies.md#anomalies-constatées)** — Consulter ses cartographies
  - A-01 — Copies serveur introuvables depuis un autre appareil
  - A-02 — La visionneuse renvoie vers la démonstration
- **[UC-APP-04](apprenant/UC-APP-04-stocker-regler-confidentialite.md#anomalies-constatées)** — Stocker une cartographie sur le serveur et régler sa confidentialité
  - Document non validé au schéma lors de la copie serveur
  - « Retrouver depuis un autre appareil » : promesse non tenue par l'IHM
  - « Jamais votre portfolio » : des extraits du portfolio partent quand même
  - `serverId` périmé après un `404` sur le `PATCH`
- **[UC-APP-05](apprenant/UC-APP-05-partager-avec-employeur.md#anomalies-constatées)** — Partager une cartographie avec un employeur
  - La visibilité « publique » n'est pas une condition du partage
  - Expiration en notation scientifique tronquée sans avertissement
- **[UC-APP-06](apprenant/UC-APP-06-exporter-importer-archive.md#anomalies-constatées)** — Exporter et importer son archive complète
  - A-01 — Les « prompts utilisés » ne sont pas ceux des cartographies
  - A-02 — `runMeta` : contrats divergents entre l'assistant et l'archive
  - A-03 — Une analyse Twin9 locale bloque tout l'export
  - A-04 — « Mes portfolios » non rafraîchi après import
  - A-05 — Provenance du référentiel inventée à l'export
  - A-06 — Cohérence référentielle non vérifiée à l'import
- **[UC-APP-07](apprenant/UC-APP-07-inviter-cartographe.md#anomalies-constatées)** — Inviter un cartographe
  - Aucune IHM apprenant pour inviter un cartographe
- **[UC-APP-08](apprenant/UC-APP-08-rejoindre-cohorte.md#anomalies-constatées)** — Rejoindre une cohorte, déposer son portfolio, quitter
  - Code mal formé : message technique en anglais
  - Minimisation : le texte intégral du portfolio est déposé et conservé sans être traité
  - Suppression de la cohorte = perte des documents de l'apprenant
  - Invitation à se connecter pendant le chargement et sur la copie statique
- **[UC-APP-09](apprenant/UC-APP-09-cartographie-ouverte-twin6.md#anomalies-constatées)** — Lancer une cartographie ouverte (Twin6)
  - Voie clé perso : troncature non détectée explicitement
  - Pôle sans aucune présence établie → document non conforme au schéma
  - Dénominateur « Compétences établies » figé à 61
- **[UC-APP-10](apprenant/UC-APP-10-analyse-approfondie-twin9.md#anomalies-constatées)** — Lancer une analyse approfondie (Twin9)
  - Le lancement réel est impossible
  - Un motif `{$X}` dans le texte de l'apprenant bloque l'appel
  - Les erreurs de `/api/twin9/appel` sont avalées par le moteur
  - Un seul modèle pour tous les étages
  - Deux variables partent en objets
  - La démonstration écrit dans la reprise locale
  - Un portfolio d'une seule journée datée perd sa date
- **[UC-APP-11](apprenant/UC-APP-11-gerer-credit-twin9.md#anomalies-constatées)** — Gérer son crédit Twin9 (achat, factures, remboursement)
  - Les remboursements comptent comme consommation dans le suivi
  - Disponibilité PayPal annoncée à tort
  - Remboursement confirmé par PayPal mais non débité en cas de dépense concurrente
- **[UC-APP-12](apprenant/UC-APP-12-interface-ipsative-v3.md#anomalies-constatées)** — Explorer sa cartographie dans l'interface ipsative V3
  - AN1 — Date du nom d'un ZIP journalier ignorée
  - AN2 — Master importé sans validation
  - AN3 — Publication du partage employeur impossible depuis l'IHM
  - AN4 — Libellé mal accordé
  - AN5 — Import annulé = dossier effacé
  - AN6 — Contestation non réversible dans l'IHM
  - AN7 — Arbitrage sans révision
  - AN8 — ZIP sans contenu reconnu ignoré en silence
  - AN9 — Badge d'anomalies figé après arbitrage
  - AN10 — Projet de partage conservé à l'import d'un master
  - AN11 — Forme du master partiellement contrôlée
  - AN12 — Note privée partagée entre observations
  - AN13 — Panneaux des vues par persona non persistés
  - AN14 — Instantané employeur mal formé : l'application plante
  - AN15 — Variantes JSON indiscernables
  - AN16 — Branche révélée impossible à refermer
  - AN17 — « Arbre » proposé mais invisible en Simplifié
  - AN18 — Contraste insuffisant du badge d'anomalies en surface claire
  - AN19 — Cibles de la barre de tuile sous les 44 px promis
- **[UC-CAR-01](cartographe/UC-CAR-01-accepter-invitation.md#anomalies-constatées)** — Accepter l'invitation d'un apprenant
  - AN7 — Audit écrit hors de la transaction d'acceptation
- **[UC-CAR-02](cartographe/UC-CAR-02-consulter-file-relecture.md#anomalies-constatées)** — Consulter sa file de relecture
  - AN8 — Échec partiel de chargement : la liste reçue est perdue, avec un message faux
  - AN9 — Id non numérique : message d'erreur anglais
- **[UC-CAR-03](cartographe/UC-CAR-03-annoter-cartographie.md#anomalies-constatées)** — Annoter une cartographie
  - AN10 — Texte fait de blancs Unicode accepté par l'API
  - AN11 — Rechargement du fil en échec après un envoi réussi
- **[UC-CAR-04](cartographe/UC-CAR-04-corriger-cartographie.md#anomalies-constatées)** — Corriger une cartographie (révision)
  - AN1 — Révision d'une cartographie `twin9` : erreur 500
  - AN2 — Révision sans note impossible depuis l'IHM
  - AN3 — Révision d'un parcours (merge) réel refusée
  - AN4 — Mention de garantie périmée après une révision
  - AN12 — Historique non rechargé après un envoi réussi : doublon au nouvel essai
  - AN13 — « Voir » et « Revenir » traitent les corrections en attente de façon asymétrique
  - AN14 — Champ « Confiance » vidé enregistré à 0 %
- **[UC-CAR-05](cartographe/UC-CAR-05-garantir-cartographie.md#anomalies-constatées)** — Garantir une cartographie ou retirer sa garantie
  - AN5 — « Retirer ma garantie » proposé pour la garantie d'un autre
  - AN15 — Garantie impossible à retirer depuis le site après passage en privée, mais toujours servie à l'employeur
  - AN16 — Deux premières signatures simultanées : 500 au lieu de 409
  - Écart avec la formation
- **[UC-CAR-06](cartographe/UC-CAR-06-comparer-versions.md#anomalies-constatées)** — Comparer des versions de cartographie
  - AN17 — Documents arrivés avant le référentiel : plantage du rendu
  - AN18 — Message d'erreur périmé
- **[UC-CAR-07](cartographe/UC-CAR-07-mesurer-consistance.md#anomalies-constatées)** — Mesurer la consistance multi-run
  - AN6 — « Aucune divergence de statut » affiché à tort
  - AN19 — Runs numérotés dans l'ordre des clics, sans identification
  - AN20 — Rapport périmé si la sélection change pendant l'analyse
- **[UC-EMP-01](employeur/UC-EMP-01-consulter-cartographie-partagee.md#anomalies-constatées)** — Consulter une cartographie partagée
  - AN1 — Une analyse Twin9 partagée fait planter la page de l'employeur
  - AN2 — Cookie de session périmé : « Mot de passe incorrect. » avec le bon mot de passe
  - AN3 — Seau de limitation pseudonyme conservé sans purge planifiée
- **[UC-PRO-01](promptologue/UC-PRO-01-consulter-paquets-publies.md#anomalies-constatées)** — Consulter les paquets de prompts publiés et leurs différences
  - AN-1 — « Diff contre *version* » inopérant sur un brouillon non publié
  - AN-2 — Le repli du défaut peut désigner un paquet réservé
  - AN-3 — Marque « défaut » perdue quand le défaut est le paquet embarqué
- **[UC-PRO-02](promptologue/UC-PRO-02-editer-brouillon-paquet.md#anomalies-constatées)** — Créer et éditer un brouillon de paquet de prompts
  - AN-1 — « Mes brouillons » n'affiche pas `id@version`
  - AN-2 — Messages d'erreur en anglais dans l'IHM
  - AN-3 — Brouillons orphelins après suppression du compte de l'auteur
  - AN-4 — `toId` non trimé dans le document du fork
  - AN-5 — Version de plus de 32 caractères : `500` au lieu de `422`, et nom de fork squatté
  - AN-6 — Détails d'un `422` perdus dans l'IHM
- **[UC-PRO-03](promptologue/UC-PRO-03-publier-version-paquet.md#anomalies-constatées)** — Publier une version de paquet
  - AN-1 — Messages de refus en anglais
  - AN-2 — Publication sans enregistrement préalable : modifications locales perdues
  - AN-3 — Brouillon refusé pour semver irrécupérable dans l'atelier
  - AN-4 — Changelog non borné
- **[UC-PRO-05](promptologue/UC-PRO-05-banc-essai.md#anomalies-constatées)** — Évaluer un paquet au banc d'essai
  - AN-1 — Versions du référentiel jamais proposées avec l'API réelle
  - AN-2 — Progression masquée en mode « Service humanome »
  - AN-3 — Gabarits d'un paquet `engine://` ignorés au banc
- **[UC-PRO-06](promptologue/UC-PRO-06-retrospective.md#anomalies-constatées)** — Régénérer rétrospectivement des cartographies
  - AN-1 — Aucune version du référentiel n'est jamais proposée (cas bloqué en production)
  - AN-2 — « Plus récent » n'est pas filtré
  - AN-3 — Les définitions du référentiel n'entrent pas dans les prompts du moteur embarqué
- **[UC-PRO-07](promptologue/UC-PRO-07-sandbox.md#anomalies-constatées)** — Exécuter le code d'un paquet en sandbox
  - AN-1 — Un signal déjà annulé est ignoré par le pont
  - AN-2 — Sonde tolérante trop permissive en périmètre restreint
- **[UC-PRO-08](promptologue/UC-PRO-08-editer-gabarits-twin9.md#anomalies-constatées)** — Éditer les gabarits du Golden Prompt Twin9
  - Import non atomique
  - Variables « non résolues » calculées sur le rendu
  - Nom à saut de ligne final accepté
  - Clé d'import purement numérique refusée
  - Gabarit « …/versions » inaccessible
- **[UC-EPI-01](epistemiarque/UC-EPI-01-proposer-modification-competence.md#anomalies-constatées)** — Proposer une modification de compétence
  - AN1 — Fork et soumission non atomiques
  - AN2 — Messages serveur en anglais dans l'IHM
  - AN3 — Brouillon dépassé : compétence bloquée dans l'IHM
  - AN4 — `decidimUrl` non textuel ignoré en silence
  - AN5 — Panne de `auth/me` présentée comme une absence de session
- **[UC-EPI-02](epistemiarque/UC-EPI-02-voter-proposition.md#anomalies-constatées)** — Voter sur une proposition
  - AN1 — Commentaire de vote non borné
  - AN2 — Refus de la garde en anglais
- **[UC-EPI-03](epistemiarque/UC-EPI-03-enteriner-publier.md#anomalies-constatées)** — Entériner et publier (compétence, release du référentiel)
  - AN1
  - AN2 — Un renommage entériné casse le seed du déploiement suivant
  - AN3 — Texte trompeur de la carte « Publier une version du référentiel »
- **[UC-EPI-04](epistemiarque/UC-EPI-04-editer-version-referentiel.md#anomalies-constatées)** — Éditer une version complète du référentiel
  - AN1 — Deux sources de vérité divergentes
  - AN2 — Libellé ou semver trop longs : erreur serveur
- **[UC-ETA-01](etablissement/UC-ETA-01-gerer-cohorte.md#anomalies-constatées)** — Créer et gérer une cohorte
  - Incohérence de spécification (à arbitrer) : supprimer une cohorte efface les documents de l'apprenant
  - États vides trompeurs après une erreur de chargement
  - Pas de trace d'audit
- **[UC-ETA-02](etablissement/UC-ETA-02-configurer-llm-budget.md#anomalies-constatées)** — Configurer le moteur LLM, le budget et le jeton worker
  - Réactivation sur une hausse inférieure au demi-centime
  - `ConfigRepository::save` non atomique (latent)
- **[UC-ETA-03](etablissement/UC-ETA-03-piloter-run-masse.md#anomalies-constatées)** — Lancer, suivre et annuler un run de masse
  - `membres: []` vaut « tous les déposants »
  - Un run terminé peut être « annulé »
  - « Relancez » après un arrêt budgétaire
  - Un run arrêté au plafond ne peut pas être annulé depuis le site
  - Un run peut rester `active` indéfiniment
  - Extraits de réponse LLM (donc de portfolio) dans les erreurs du tableau
- **[UC-ETA-04](etablissement/UC-ETA-04-consulter-documents-membre.md#anomalies-constatées)** — Consulter les documents produits pour un membre
  - AN1 — Le calendrier et les liens de la fusion du membre ouvrent la démonstration
  - AN2 — Libellés de journée décalés d'un jour en fuseau UTC−
- **[UC-ADM-01](administration/UC-ADM-01-gerer-comptes-roles.md#anomalies-constatées)** — Gérer les comptes et les rôles
  - AN-1 — Nom de rôle comparé sous `utf8mb4_unicode_ci` (casse, accents et espaces finaux ignorés), anti-verrouillage comparé à la lettre
  - AN-2 — Page démesurée : débordement de l'OFFSET → `500`
- **[UC-ADM-02](administration/UC-ADM-02-gerer-golden-prompt.md#anomalies-constatées)** — Gérer le Golden Prompt et ses accès
  - AN-1 — L'import de déploiement ne protège pas les slugs Golden
  - AN-2 — Le nommage d'un fork révèle l'existence d'un slug Golden
- **[UC-ADM-03](administration/UC-ADM-03-valider-paquet-defaut-reglages.md#anomalies-constatées)** — Valider le paquet par défaut et les réglages
  - AN-1 — Écriture non transactionnelle
  - Désignation sans effet côté apprenant
- **[UC-ADM-04](administration/UC-ADM-04-configurer-demo.md#anomalies-constatées)** — Configurer la démo publique
  - AN-1 — Instantané des réglages obsolète
  - AN-2 — Basculer l'interrupteur efface les saisies non enregistrées
- **[UC-ADM-05](administration/UC-ADM-05-superviser-twin9.md#anomalies-constatées)** — Superviser Twin9
  - Diff non minimal après le premier enregistrement
  - Borne des packs annoncée à 100 USD
  - Consommé cumulé gonflé par les remboursements
  - Mises à jour concurrentes perdues côté serveur
- **[UC-ADM-06](administration/UC-ADM-06-monitoring.md#anomalies-constatées)** — Consulter le monitoring
  - AN-1 — Historique de la démo effacé par la maintenance
  - AN-2 — Cartographies Twin9 exclues du total
  - AN-3 — Changement de période : tableau de bord périmé
- **[UC-SYS-01](systeme/UC-SYS-01-traiter-file-jobs.md#anomalies-constatées)** — Traiter la file de jobs de masse
  - Compteurs de tokens du runner perdus
  - Erreur acceptée hors « running », coût refacturé
  - Coût des appels en échec non imputé (tick plateforme)
  - Tentatives consommées dans un même tick, sans espacement
  - CLI mal branché dans la disposition des releases
  - Extraits de réponse LLM dans `mass_jobs.erreur` (tick plateforme compris)
  - Interruption immédiate du runner mal classée
  - Documentation du runner
  - Branches mortes
- **[UC-SYS-02](systeme/UC-SYS-02-deployer-migrer.md#anomalies-constatées)** — Déployer, migrer et importer
  - AN-1 — Garde-fou des fiches partiel : écrasement silencieux de `twin9_fiches`
  - AN-2 — Messages d'exception renvoyés par `seed-competences` et `generate-fiches`
  - AN-3 — `splitStatements` prend tout « -- » pour un commentaire
  - AN-4 — Le motif du pointeur admet `releases/..` et `releases/.`
  - AN-5 — `rollback` vise l'avant-dernière release par nom, pas celle qui précède la release active
  - AN-6 — `fiches-v7.json` absent : le seed efface les fiches de la base
- **[UC-SYS-03](systeme/UC-SYS-03-maintenance-supervision.md#anomalies-constatées)** — Maintenance et supervision technique
  - AN-1 — La maintenance efface l'historique affiché par le monitoring
  - AN-2 — Listes codées en dur de `RgpdAudit` en dérive par rapport au schéma
- **[UC-SYS-04](systeme/UC-SYS-04-construire-artefacts-derives.md#anomalies-constatées)** — Construire les données et artefacts dérivés
  - AN-1 — Validateurs versionnés périmés : le moteur refuse le référentiel 7.1.0
  - AN-2 — La construction Twin6 n'est pas reproductible depuis le dépôt
  - AN-3 — `enrich-referentiel.mjs` écrit la 7.1.0 avant de contrôler le hash
  - AN-4 — Quatre scripts ne font rien, en silence et avec le code 0, quand on les lance par un chemin qui traverse un lien symbolique
- **[UC-SYS-05](systeme/UC-SYS-05-sauvegarder-restaurer.md#anomalies-constatées)** — Sauvegarder et restaurer la base
  - AN-1 — Mot de passe de la base en argument de ligne de commande
  - AN-2 — `DB_PORT` ignoré
  - AN-3 — `api/.env` lu autrement que par l'API
  - AN-4 — Dump partiel conservé sous un nom de sauvegarde valide
  - AN-5 — Copies hors OVH absentes du registre RGPD
  - AN-6 — La copie hors OVH est impossible pour la base mutualisée de production
<!-- anomalies:end -->

## Méthode de vérification

1. **Rédaction** — chaque fiche a été écrite à partir du code réel (routes,
   statuts HTTP, règles, messages), puis ses tests ont été écrits et rejoués
   au vert.
2. **Relecture adversariale** — un relecteur indépendant par cas a confronté
   chaque affirmation de la fiche au code, vérifié que chaque scénario est
   réellement exercé par un test (lecture du corps des tests, pas des seuls
   titres), traqué les tests non discriminants et contesté les anomalies
   annoncées ; un correcteur par lot a contre-vérifié chaque constat avant de
   l'appliquer ou de le rejeter avec une raison.
3. **Complétude** — un inventaire exhaustif du code (routes API et CLI, routes
   du front, vues, composants, modules, scripts) a été confronté aux fiches ;
   les éléments non rattachés ont été ajoutés aux cas existants ou ont donné
   lieu à de nouveaux cas (UC-SYS-04, UC-SYS-05), eux-mêmes relus.
4. **Checkout propre** — toutes les suites de cas d'utilisation sont rejouées
   sur un checkout neuf de la branche, pour garantir qu'aucun fichier
   nécessaire n'est resté hors du dépôt.

## Hors périmètre : outillage de développement

Ces scripts ne servent aucun cas d'utilisation d'un acteur ; ils outillent le
développement et ne sont pas documentés ici :

| Script | Rôle |
|---|---|
| `scripts/parity/parity-document.mjs`, `parity-merge.mjs`, `parity-prompts.mjs` | Contrôles de parité du portage du moteur (voir `docs/rapport-parite-moteur.md`) |
| `scripts/dev/runner-once-mock.mjs` | Exécution unique du runner de masse contre le fournisseur factice |
| `scripts/dev/validate-mass-documents.mjs` | Validation au schéma des documents produits par un run de masse |
| `scripts/dev/dod-p11.sh` | Script de « definition of done » du chantier P11 |
| `scripts/twin9/gen-oracles.sh`, `engine/test/twin9-vectors/*.py` | Génération des oracles et vecteurs de parité Twin9 (sources confidentielles hors dépôt) |
