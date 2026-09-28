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

## Catalogue

### Visiteur

| ID | Cas d'utilisation |
|---|---|
| [UC-VIS-01](visiteur/UC-VIS-01-explorer-cartographie-demonstration.md) | Explorer la cartographie de démonstration |
| [UC-VIS-02](visiteur/UC-VIS-02-consulter-referentiel-public.md) | Consulter le référentiel public de compétences |
| [UC-VIS-03](visiteur/UC-VIS-03-essayer-cartographie-en-direct.md) | Essayer la cartographie en direct, sans compte |
| [UC-VIS-04](visiteur/UC-VIS-04-se-reperer-guides-aide.md) | Se repérer : accueil, navigation, guides, aide, confidentialité |
| [UC-VIS-05](visiteur/UC-VIS-05-interroger-assistant-tuteur.md) | Interroger l'assistant tuteur |

### Compte (tout utilisateur inscrit)

| ID | Cas d'utilisation |
|---|---|
| [UC-CPT-01](compte/UC-CPT-01-creer-activer-compte.md) | Créer un compte et l'activer par code email |
| [UC-CPT-02](compte/UC-CPT-02-se-connecter-deconnecter.md) | Se connecter et se déconnecter |
| [UC-CPT-03](compte/UC-CPT-03-gerer-profil.md) | Gérer son profil (nom affiché, avatar) |
| [UC-CPT-04](compte/UC-CPT-04-gerer-cles-api.md) | Gérer ses clés API personnelles |
| [UC-CPT-05](compte/UC-CPT-05-suivre-progression-formation.md) | Suivre sa progression de formation |
| [UC-CPT-06](compte/UC-CPT-06-supprimer-compte.md) | Supprimer son compte (droit à l'effacement) |

### Apprenant

| ID | Cas d'utilisation |
|---|---|
| [UC-APP-01](apprenant/UC-APP-01-constituer-portfolio.md) | Constituer son portfolio local |
| [UC-APP-02](apprenant/UC-APP-02-lancer-cartographie-standard.md) | Lancer une cartographie standard |
| [UC-APP-03](apprenant/UC-APP-03-consulter-ses-cartographies.md) | Consulter ses cartographies |
| [UC-APP-04](apprenant/UC-APP-04-stocker-regler-confidentialite.md) | Stocker une cartographie sur le serveur et régler sa confidentialité |
| [UC-APP-05](apprenant/UC-APP-05-partager-avec-employeur.md) | Partager une cartographie avec un employeur |
| [UC-APP-06](apprenant/UC-APP-06-exporter-importer-archive.md) | Exporter et importer son archive complète |
| [UC-APP-07](apprenant/UC-APP-07-inviter-cartographe.md) | Inviter un cartographe |
| [UC-APP-08](apprenant/UC-APP-08-rejoindre-cohorte.md) | Rejoindre une cohorte, déposer son portfolio, quitter |
| [UC-APP-09](apprenant/UC-APP-09-cartographie-ouverte-twin6.md) | Lancer une cartographie ouverte (Twin6) |
| [UC-APP-10](apprenant/UC-APP-10-analyse-approfondie-twin9.md) | Lancer une analyse approfondie (Twin9) |
| [UC-APP-11](apprenant/UC-APP-11-gerer-credit-twin9.md) | Gérer son crédit Twin9 (achat, factures, remboursement) |
| [UC-APP-12](apprenant/UC-APP-12-interface-ipsative-v3.md) | Explorer sa cartographie dans l'interface ipsative V3 |

### Cartographe

| ID | Cas d'utilisation |
|---|---|
| [UC-CAR-01](cartographe/UC-CAR-01-accepter-invitation.md) | Accepter l'invitation d'un apprenant |
| [UC-CAR-02](cartographe/UC-CAR-02-consulter-file-relecture.md) | Consulter sa file de relecture |
| [UC-CAR-03](cartographe/UC-CAR-03-annoter-cartographie.md) | Annoter une cartographie |
| [UC-CAR-04](cartographe/UC-CAR-04-corriger-cartographie.md) | Corriger une cartographie (révision) |
| [UC-CAR-05](cartographe/UC-CAR-05-garantir-cartographie.md) | Garantir une cartographie ou retirer sa garantie |
| [UC-CAR-06](cartographe/UC-CAR-06-comparer-versions.md) | Comparer des versions de cartographie |
| [UC-CAR-07](cartographe/UC-CAR-07-mesurer-consistance.md) | Mesurer la consistance multi-run |

### Employeur

| ID | Cas d'utilisation |
|---|---|
| [UC-EMP-01](employeur/UC-EMP-01-consulter-cartographie-partagee.md) | Consulter une cartographie partagée |

### Promptologue

| ID | Cas d'utilisation |
|---|---|
| [UC-PRO-01](promptologue/UC-PRO-01-consulter-paquets-publies.md) | Consulter les paquets de prompts publiés et leurs différences |
| [UC-PRO-02](promptologue/UC-PRO-02-editer-brouillon-paquet.md) | Créer et éditer un brouillon de paquet de prompts |
| [UC-PRO-03](promptologue/UC-PRO-03-publier-version-paquet.md) | Publier une version de paquet |
| [UC-PRO-04](promptologue/UC-PRO-04-proposer-version-defaut.md) | Proposer une version par défaut |
| [UC-PRO-05](promptologue/UC-PRO-05-banc-essai.md) | Évaluer un paquet au banc d'essai |
| [UC-PRO-06](promptologue/UC-PRO-06-retrospective.md) | Régénérer rétrospectivement des cartographies |
| [UC-PRO-07](promptologue/UC-PRO-07-sandbox.md) | Exécuter le code d'un paquet en sandbox |
| [UC-PRO-08](promptologue/UC-PRO-08-editer-gabarits-twin9.md) | Éditer les gabarits du Golden Prompt Twin9 |

### Épistémiarque

| ID | Cas d'utilisation |
|---|---|
| [UC-EPI-01](epistemiarque/UC-EPI-01-proposer-modification-competence.md) | Proposer une modification de compétence |
| [UC-EPI-02](epistemiarque/UC-EPI-02-voter-proposition.md) | Voter sur une proposition |
| [UC-EPI-03](epistemiarque/UC-EPI-03-enteriner-publier.md) | Entériner et publier (compétence, release du référentiel) |
| [UC-EPI-04](epistemiarque/UC-EPI-04-editer-version-referentiel.md) | Éditer une version complète du référentiel |

### Établissement

| ID | Cas d'utilisation |
|---|---|
| [UC-ETA-01](etablissement/UC-ETA-01-gerer-cohorte.md) | Créer et gérer une cohorte |
| [UC-ETA-02](etablissement/UC-ETA-02-configurer-llm-budget.md) | Configurer le moteur LLM, le budget et le jeton worker |
| [UC-ETA-03](etablissement/UC-ETA-03-piloter-run-masse.md) | Lancer, suivre et annuler un run de masse |
| [UC-ETA-04](etablissement/UC-ETA-04-consulter-documents-membre.md) | Consulter les documents produits pour un membre |

### Administration

| ID | Cas d'utilisation |
|---|---|
| [UC-ADM-01](administration/UC-ADM-01-gerer-comptes-roles.md) | Gérer les comptes et les rôles |
| [UC-ADM-02](administration/UC-ADM-02-gerer-golden-prompt.md) | Gérer le Golden Prompt et ses accès |
| [UC-ADM-03](administration/UC-ADM-03-valider-paquet-defaut-reglages.md) | Valider le paquet par défaut et les réglages |
| [UC-ADM-04](administration/UC-ADM-04-configurer-demo.md) | Configurer la démo publique |
| [UC-ADM-05](administration/UC-ADM-05-superviser-twin9.md) | Superviser Twin9 |
| [UC-ADM-06](administration/UC-ADM-06-monitoring.md) | Consulter le monitoring |

### Système et exploitation

| ID | Cas d'utilisation |
|---|---|
| [UC-SYS-01](systeme/UC-SYS-01-traiter-file-jobs.md) | Traiter la file de jobs de masse |
| [UC-SYS-02](systeme/UC-SYS-02-deployer-migrer.md) | Déployer, migrer et importer |
| [UC-SYS-03](systeme/UC-SYS-03-maintenance-supervision.md) | Maintenance et supervision technique |
