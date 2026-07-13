---
parcours: epistemiarque
chapitre: 2
titre: "L'anatomie du référentiel"
statut: complet
---

# L'anatomie du référentiel

On ne gouverne bien que ce qu'on connaît par cœur. Avant de proposer la moindre évolution, l'épistémiarque doit tenir dans sa main la carte complète du socle : sept pôles, soixante et une compétences, une structure de données précise, un numéro de version qui obéit à des règles. Ce chapitre est votre carte de référence. Il énumère l'intégralité du référentiel RESPIRE v7 avec les **noms et codes exacts**, décrit la structure d'une compétence telle qu'elle est réellement stockée, et explique la grammaire des versions. Gardez-le ouvert quand vous instruisez une proposition : la plupart des « idées de nouvelle compétence » sont, en réalité, des compétences déjà présentes sous un autre nom.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - nommer les 7 pôles et situer les 61 compétences dans chacun ;
> - décrire la structure de données d'une compétence (code, nom, pôle) et d'un pôle (numéro, nom, couleur) ;
> - lire l'en-tête d'une version : `id`, `version`, `label`, `contentHash`, `source` ;
> - repérer les recouvrements entre compétences voisines, prérequis à toute proposition d'évolution.

## 1. Les 7 pôles

Le référentiel organise les compétences en sept pôles, chacun identifié par un numéro (qui donne le premier chiffre du code d'une compétence) et une couleur (celle qui teinte le pôle dans la vue `#/referentiel` et dans le sunburst de visualisation). Les noms exacts sont :

- **Pôle 1 — TETE — Penser & Comprendre** (bleu, `#2563eb`)
- **Pôle 2 — COEUR — Relier & Naviguer** (vert, `#10b981`)
- **Pôle 3 — MAIN — Créer & Incarner** (rose, `#ec4899`)
- **Pôle 4 — AME — Discerner & Juger** (violet, `#8b5cf6`)
- **Pôle 5 — RACINES — Évoluer & Résister** (ambre, `#f59e0b`)
- **Pôle 6 — CITE — Gouverner & S'ouvrir** (cyan, `#06b6d4`)
- **Pôle 7 — FLAMBEAU — Transmettre & Piloter** (orange, `#f97316`)

Les pôles ne sont pas décoratifs. Ils portent une anthropologie : de la pensée intérieure (TETE) au lien aux autres (COEUR), à l'incarnation matérielle et sensible (MAIN), au jugement de valeur (AME), à la trajectoire personnelle dans le temps (RACINES), à l'inscription dans la cité et le vivant (CITE), jusqu'à la transmission et le pilotage collectif (FLAMBEAU). Quand une proposition d'évolution arrive, la première question est toujours : *dans quel pôle vit-elle ?* Si la réponse est « un peu partout », c'est souvent que la compétence proposée est mal découpée.

## 2. Les 61 compétences, pôle par pôle

Voici l'inventaire complet, avec les codes et noms exacts de la version 7.0.0. Le code d'une compétence est stable : il ne change jamais tant que la compétence existe, même si son nom est reformulé.

### TETE — Penser & Comprendre (10 compétences)

- `1.01` Pensée Critique & Anti-Hallucination
- `1.02` Cadrage de l'Intention
- `1.03` Synthèse Intégrative
- `1.04` Métacognition & Humilité Épistémique
- `1.05` Pensée Systémique
- `1.06` Littératie IA & Data Literacy
- `1.07` Architecture de Systèmes IA
- `1.08` Dialogue IA Avancé & Orchestration Multi-Agents
- `1.09` Pensée Computationnelle
- `1.10` Synergie & Coordination Hybride

### COEUR — Relier & Naviguer (9 compétences)

- `2.01` Intelligence Émotionnelle & Sollicitude Active
- `2.02` Communication Authentique
- `2.03` Gestion des Conflits
- `2.04` Influence & Diplomatie
- `2.05` Collaboration Divergente
- `2.06` Intelligence Culturelle & Contextuelle
- `2.07` Sens Politique & Lecture Organisationnelle
- `2.08` Traduction entre Mondes
- `2.09` Construction de Communautés

### MAIN — Créer & Incarner (7 compétences)

- `3.01` Créativité Itérative & Radicale
- `3.02` Singularité & Signature
- `3.03` Design de Problèmes
- `3.04` Jugement Esthétique & Curation
- `3.05` Intelligence Manuelle & Artisanale
- `3.06` Ancrage Sensoriel & Pleine Présence
- `3.07` Présence & Performance Live

### AME — Discerner & Juger (9 compétences)

- `4.01` Raisonnement Éthique Appliqué
- `4.02` Alignement & Refus Éthique
- `4.03` Conscience Écologique & Long-terme
- `4.04` Valorisation de la Neurodiversité
- `4.05` Décision & Tolérance à l'Incertitude
- `4.06` Responsabilité, Courage & Intégrité
- `4.07` Validation Contextuelle
- `4.08` Création de Valeur Non-Automatisable
- `4.09` Patience Stratégique & Sens du Timing

### RACINES — Évoluer & Résister (8 compétences)

- `5.01` Résilience & Antifragilité
- `5.02` Plasticité & Désapprentissage
- `5.03` Narration Réflexive
- `5.04` Acceptation de l'Intelligence Supérieure
- `5.05` Sens & Motivation Intrinsèque
- `5.06` Autonomie, Mode Dégradé & Débrouillardise
- `5.07` Souveraineté Attentionnelle
- `5.08` Vérification Terrain

### CITE — Gouverner & S'ouvrir (10 compétences)

- `6.01` Red-Teaming & Sécurité IA
- `6.02` Audit, Explicabilité & Hygiène des Données
- `6.03` Gouvernance Algorithmique des Services Publics
- `6.04` Souveraineté Numérique & Gouvernance des Communs
- `6.05` Participation Citoyenne & Démocratie Technologique
- `6.06` Veille Réglementaire & Anticipation Normative
- `6.07` Facilitation & Gouvernance Collective
- `6.08` Décentrement Anthropocentrique
- `6.09` Cohabitation avec les Intelligences Non-Humaines
- `6.10` Conscience Biosystémique & Interdépendance

### FLAMBEAU — Transmettre & Piloter (8 compétences)

- `7.01` Maïeutique & Facilitation d'Apprentissage
- `7.02` Évaluation Transformative
- `7.03` Documentation Vivante
- `7.04` Leadership Situationnel & Orchestration
- `7.05` Vision Stratégique & Prospective
- `7.06` Efficacité Personnelle
- `7.07` Agilité & Conduite du Changement
- `7.08` Gestion de Crise en Temps Réel

Soit 10 + 9 + 7 + 9 + 8 + 10 + 8 = **61 compétences**. Ce total, et la répartition entre pôles, ne sont pas symétriques par hasard : ils reflètent l'état actuel du débat, où certains pôles (TETE, CITE) sont plus densément peuplés parce que l'irruption de l'IA y multiplie les compétences à nommer, tandis que d'autres (MAIN) restent plus resserrés.

## 3. La structure d'une compétence

Le référentiel est un document de données, servi à la vue publique et embarqué dans le moteur. Sa structure est volontairement minimale et stable. Un **pôle** est un objet à trois champs :

- `num` — le numéro (1 à 7), qui préfixe les codes des compétences du pôle ;
- `nom` — le nom complet, forme « FAMILLE — Verbe & Verbe » ;
- `couleur` — le code hexadécimal de la teinte du pôle.

Une **compétence** est un objet à trois champs :

- `code` — identifiant de la forme `P.NN` (pôle, puis numéro d'ordre sur deux chiffres), *stable et unique* ;
- `nom` — le libellé affiché ;
- `pole` — le numéro du pôle de rattachement.

Cette parcimonie est un choix. Le référentiel dit *ce qu'est* le paysage des compétences (leurs noms, leur organisation, leur identité), mais il ne contient volontairement ni descriptif long, ni grille de niveaux, ni indicateurs observables. Ces éléments — comment reconnaître la compétence dans un texte, comment la graduer — relèvent du **prompt** du promptologue et du jugement du **cartographe**, pas du référentiel. Séparer ces responsabilités évite qu'un changement de méthode d'évaluation soit confondu avec un changement de définition du socle.

## 4. L'en-tête de version

Chaque version publiée du référentiel porte un en-tête d'identité. Sur la version courante, il vaut :

- `schemaVersion` : `1.0.0` — la version du *format* de fichier lui-même (à distinguer de la version du *contenu*) ;
- `kind` : `referentiel` ;
- `id` : `respire` — l'identifiant stable de ce référentiel, référencé par les prompts ;
- `version` : `7.0.0` — la version sémantique du contenu (voir « [Versionner le référentiel](04-versionner-le-referentiel.md) ») ;
- `label` : `RESPIRE v7` — le nom lisible affiché en tête de `#/referentiel` ;
- `contentHash` : une empreinte du contenu, qui permet de vérifier qu'une version n'a pas été altérée ;
- `source` : la provenance documentée de cette version.

Le couple `(id, version)` est ce qu'une cartographie mémorise. C'est lui qui rend une cartographie reproductible et comparable : on saura toujours qu'elle a été produite contre `respire` en `7.0.0`, et le `contentHash` garantit que ce `7.0.0`-là est bien celui d'aujourd'hui, non retouché.

## 5. Lire les recouvrements

Le geste professionnel le plus utile qu'offre cette carte est la **détection des recouvrements**. Beaucoup de propositions d'évolution naissent d'un besoin réel mais déjà couvert. Entraînez-vous à repérer les voisinages :

- une idée de « esprit critique face aux fausses informations » est déjà `1.01 Pensée Critique & Anti-Hallucination` ;
- « savoir se remettre en question » recoupe `1.04 Métacognition & Humilité Épistémique` et `5.02 Plasticité & Désapprentissage` — deux compétences distinctes, l'une tournée vers le doute sur son propre savoir, l'autre vers l'abandon actif de ce qui ne marche plus ;
- « écologie » se répartit entre `4.03 Conscience Écologique & Long-terme` (le jugement de valeur), `6.10 Conscience Biosystémique & Interdépendance` (l'inscription dans le vivant) et `5.08 Vérification Terrain` (le rapport au réel) ;
- « transmettre » n'est pas un point mais tout le pôle FLAMBEAU, avec `7.01 Maïeutique & Facilitation d'Apprentissage` en cœur.

Pour instruire proprement, servez-vous des permaliens : dans la vue `#/referentiel`, cliquez le code d'une compétence pour obtenir son lien `#/referentiel/<code>`, et rassemblez les liens des compétences voisines dans votre note d'instruction. C'est cette cartographie fine des voisinages qui vous permettra, au chapitre suivant, de dire à un contributeur : « ce que vous décrivez existe déjà ici — voulez-vous plutôt en préciser la définition ? »

Vous connaissez maintenant le terrain. Le chapitre « [Proposer et débattre](03-proposer-et-debattre.md) » explique comment une évolution se propose, s'argumente et se décide.
