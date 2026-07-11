# Cahier des charges — humanome.xyz

**Projet porté par :** Harmonia Éducation (Christian Blanvillain, Stéphane Bernardini)
**Écosystème :** RESPIRE
**Statut du document :** v0.1 — issu de la transcription d'un enregistrement vocal de cadrage, à valider et affiner

## 1. Vision et contexte

**humanome.xyz** (contraction de *human* + *genome*) est un des artifacts numériques de l'écosystème scolaire RESPIRE. C'est la plateforme sur laquelle :

- des **cartographes** et des **promptologues** trouvent la matière (référentiel, prompts, formation) pour exercer et développer leur métier ;
- des **apprenants** construisent une **cartographie de leurs compétences humaines** à partir de leur portfolio réflexif ;
- des **épistémiarques** font évoluer, avec la société civile, le **référentiel de compétences** sur lequel s'appuient les prompts de cartographie.

Le cœur du site est un **logiciel de cartographie de compétences**, aujourd'hui existant mais incomplet (interface de visualisation JSX déjà développée, prompts de cartographie déjà rédigés et testés depuis plusieurs mois, mais pas encore intégrés dans un produit web complet).

**Objectif humaniste sous-jacent :** permettre à quiconque, y compris une personne n'ayant accès qu'à un smartphone dans un pays en développement, de faire reconnaître et valoriser ses compétences humaines auprès d'employeurs — gratuitement ou à très bas coût — tout en finançant ce modèle par des revenus payants (établissements scolaires, employeurs, portefeuille de cartographies).

---

## 2. Glossaire des rôles (profils utilisateurs)

| Rôle | Définition |
|---|---|
| **Visiteur** | Utilisateur anonyme, sans compte. Accède au mode démo. |
| **Apprenant / Apprenti** | Élève des écoles RESPIRE. Construit sa cartographie à partir de son portfolio (Google Docs ou copier-coller). |
| **Cartographe** | Relit, commente, édite, valide et « garantit » la cartographie produite pour un apprenant. Rôle humain de contrôle qualité — justifie que le système ne soit pas 100% automatisé. |
| **Promptologue** | Conçoit, teste, versionne et enrichit les prompts (et le code JS associé) qui scannent les portfolios pour produire les cartographies. |
| **Épistémiarque** | Édite collectivement le référentiel de compétences, en s'appuyant sur les échanges avec la société civile (plateforme Decidim, espace « Harmonia Éducation »). |
| **Employeur potentiel** | Accès payant à la bibliothèque des cartographies partagées par les apprenants (logique type LinkedIn / matching poste-profil). Accès gratuit à une cartographie individuelle via lien public protégé par mot de passe. |
| **Établissement de formation** | Accès payant au « Golden Prompt » (voir §7) pour cartographier ses classes en masse ; accès gratuit au portfolio de ses propres élèves. |
| **Administrateur** | Rôle Harmonia Éducation. Gère le Golden Prompt privé, les décisions de mise à disposition publique, la configuration système (interface simple, potentiellement un fichier de config). |

*(Le rôle de « Promptagogue » est mentionné mais explicitement repoussé à plus tard — trop de rôles pour une v1.)*

---

## 3. Cas d'utilisation par profil

### 3.1 Visiteur
- Voir une **démo** de cartographie de compétences (sans compte).
- Copier-coller un texte libre dans l'interface → obtenir une cartographie JSON générée en direct, avec un LLM peu coûteux/gratuit (ex. Haiku), coûts masqués par la plateforme, avec garde-fous anti-abus.

### 3.2 Apprenant
- Créer un compte.
- Fournir son portfolio : soit par **URL Google Docs**, soit par **copier-coller direct** (mode anonyme possible).
- Déclencher une cartographie générée sur la base des prompts des promptologues.
- Visualiser sa cartographie (fichier JSON) sous forme de graphe évolutif dans le temps (interface JSX déjà développée).
- Choisir la **confidentialité** : cartographie privée, partagée uniquement avec son cartographe, ou rendue publique/partageable.
- **Partager** sa cartographie validée avec un employeur potentiel via un lien public protégé par mot de passe.
- Choisir le **stockage** : données conservées uniquement en local (navigateur) ou également sur le serveur Harmonia (RGPD, opt-in).
- Exporter/importer son compte complet (portfolio, cartographies, prompts utilisés, référentiel associé) en local.
- Suivre son propre parcours de formation (« mode expert ») expliquant comment mieux rédiger son portfolio.

### 3.3 Cartographe
- Accéder à la **section formation** dédiée : rôle du cartographe, pourquoi l'IA seule ne suffit pas, fonctionnement des micro-classes RESPIRE (5-6 élèves qui se cartographient mutuellement).
- Relire, commenter, corriger une cartographie générée automatiquement (détection d'hallucinations, d'oublis).
- Valider/garantir une cartographie avant partage à un employeur.
- Comparer les résultats entre différentes **versions de prompts** de cartographie.
- Accéder aux outils statistiques de consistance (cohérence des JSON produits sur plusieurs runs).

### 3.4 Promptologue
- Accéder à un **parcours de formation expert** : prompt engineering, historique et logique du prompt de base, techniques d'écriture.
- Éditer/versionner le **système de prompts** (texte + code JavaScript associé) via une interface en ligne.
- Sélectionner quelle version de prompt utiliser pour une cartographie donnée.
- Comparer une version de prompt à une autre, et une version à elle-même sur plusieurs runs (tests de consistance).
- Comparer ses prompts au **Golden Prompt** de référence (état de l'art interne).
- Faire évoluer les scripts d'analyse pour retrouver rétrospectivement des compétences nouvellement ajoutées au référentiel (régénération de cartographies).

### 3.5 Épistémiarque
- Éditer collectivement le **référentiel de compétences**, public en lecture, modifiable uniquement par ce rôle.
- Piloter les échanges avec la société civile via **Decidim** (https://participer.harmonia.education) pour identifier les compétences utiles par métier — discussion qui nourrit et critique le référentiel sans le remplacer automatiquement.

### 3.6 Employeur potentiel
- Consulter gratuitement une cartographie individuelle reçue via lien public + mot de passe.
- Accès payant à la **bibliothèque/portefeuille** des cartographies mises à disposition par les apprenants consentants (logique de matching profil de poste ↔ profil de compétences, type réseau social professionnel).

### 3.7 Établissement de formation
- Accès payant au Golden Prompt et à une clé API de meilleure qualité (ou connexion à leur propre infrastructure LLM locale).
- Cartographie en masse de leurs classes (centaines à dizaines de milliers d'élèves).
- Accès gratuit aux portfolios/cartographies de leurs propres élèves.
- Définir un **budget maximal** de dépense API via l'interface.

### 3.8 Administrateur
- Gérer le Golden Prompt (privé) et décider des mises à disposition publiques.
- Interface d'administration simple (peut être un fichier de configuration édité à la main en v1).

---

## 4. Modules fonctionnels

### 4.1 Module Référentiel de compétences
- Référentiel existant en version prototype (issu du travail RESPIRE, condensé pour Aurora).
- Public en lecture, modifiable uniquement par les épistémiarques.
- Historisé (versionné), car les prompts de cartographie référencent la version du référentiel utilisée au moment du run.
- Alimenté par les débats Decidim / espace participatif Harmonia Éducation.

### 4.2 Module Portfolio
- **v1 : texte uniquement.** Pas de traitement direct d'image, audio, vidéo, PDF ou URL (limites des LLM open source utilisés).
- Sources possibles : Google Docs (via URL) ou copier-coller direct dans l'interface.
- Si le portfolio contient des références multimédias, le **cartographe** doit explicitement demander/rédiger une description textuelle de ce contenu (workflow à documenter dans le parcours de formation cartographe).
- Contenu du portfolio **non stocké par défaut** côté serveur : exporté avec la cartographie pour constituer une archive cohérente (portfolio + prompt utilisé + référentiel + JSON résultat). Stockage serveur uniquement en option, à la demande explicite de l'apprenant (RGPD).
- Édition du portfolio : en v1, éditeur texte basique réutilisant un projet open source existant plutôt qu'un développement propriétaire (https://github.com/4nd4ny/Sqilium).

### 4.3 Module Cartographie (cœur du produit)
- Génère un fichier **JSON** de cartographie de compétences à partir d'un portfolio, en scannant les traces de chaque compétence du référentiel.
- **Gestion des limites de contexte :** un portfolio réflexif de plusieurs mois ne tient pas dans une fenêtre de contexte LLM.
  - Stratégie retenue : **découpage journalier**, une cartographie par journée de journal de bord.
  - Limite identifiée : des compétences infimes mais récurrentes sur plusieurs journées peuvent passer inaperçues jour par jour.
  - **Fonction de fusion (« merge ») obligatoire** après cartographie journalière individuelle : agrège les cartographies journalières pour révéler les compétences transversales et ténues, et produit une **vision chronologique/évolutive** (graphe cumulatif, croissant, « qui bourgeonne ») navigable dans l'interface JSX existante.
- Chaque cartographie produite est liée en base de données à : la version du prompt utilisé, la version du référentiel utilisé, le code JS d'exécution.
- Plusieurs **versions de prompts** cohabitent, sélectionnables, comparables entre elles et testables en consistance (multi-run).
- Comparaison possible face au **Golden Prompt** (30 prompts de référence — état de l'art interne).

### 4.4 Module Visualisation
- Interface JSX déjà développée pour naviguer dans l'historique des événements (une compétence identifiée à l'instant *t* = un événement).
- Travail restant : **fusion** entre cet artifact JSX (vue chronologique/merge) et la page HTML/JavaScript existante de cartographie d'une journée, pour obtenir un logiciel de visualisation unifié.
- Publié en onglet principal du site (c'est la démonstration centrale pour un visiteur).
- Doit fonctionner sur smartphone et proposer une version imprimable (déjà le cas, semble-t-il, pour les interfaces frontend existantes).

### 4.5 Module Comptes & Base de données
- Base **SQL (PHP/MySQL)** — prototype sur serveur mutualisé (OVH) en phase de développement, avant montage sur infrastructure scalable.
- Création de compte apprenant, cartographe, promptologue, épistémiarque, employeur, établissement.
- Profil utilisateur stocke : progression dans le parcours de formation, cartographies liées, préférences de confidentialité, clé API personnelle optionnelle (pour utiliser un modèle frontière au choix : GPT, Gemini, Claude, Grok, etc.).
- Gestion RGPD : opt-in explicite pour tout stockage serveur (portfolio, cartographies) ; sinon stockage exclusivement local navigateur, avec export/suppression de compte automatisée via l'interface.

### 4.6 Module Formation / Parcours pédagogique
- Public en lecture (le suivi de progression est, lui, rattaché au compte utilisateur).
- Contenu pour le **cartographe** : rôle, méthode, pourquoi un humain reste nécessaire face à une cartographie 100% IA, fonctionnement des micro-classes RESPIRE (cartographie mutuelle en groupes de 5-6).
- Contenu pour le **promptologue** : prompt engineering, historique/genèse du prompt de base, comment l'améliorer.
- Contenu pour l'**apprenant** (mode expert) : comment bien rédiger son portfolio/prompt pour obtenir une bonne cartographie.

### 4.7 Module Statistiques & Recherche
- Outils de mesure de consistance/cohérence des JSON produits sur plusieurs runs d'un même prompt.
- Données de recherche (corpus de portfolios/cartographies/runs) publiées en **open data**, dans le respect strict de la RGPD : uniquement les données numériques/statistiques, jamais le contenu textuel du portfolio ou de la cartographie individuelle, sauf accord explicite du participant.
- Objectif : constituer une communauté scientifique d'analyse des compétences humaines à partir de la plateforme.

### 4.8 Module Employeur / Portefeuille (marketplace)
- Accès gratuit à une cartographie individuelle partagée (lien + mot de passe).
- Accès payant à la bibliothèque complète des cartographies mises à disposition volontairement par les apprenants → logique de matching poste/profil façon LinkedIn.
- Revenus destinés à financer : les coûts d'API, la Fondation Harmonia Éducation, et à terme la gratuité d'accès pour les publics les plus démunis.

### 4.9 Module Établissement (accès B2B)
- Connexion soit à une clé API « qualité établissement » gérée par Harmonia, soit à une infrastructure LLM propre à l'établissement (serveur local).
- Budget maximal configurable.
- Cartographie de masse (classes entières).

### 4.10 Module Administration
- Gestion du Golden Prompt (privé par défaut, publication décidée au cas par cas par l'administrateur).
- Interface minimale acceptable en v1 (fichier de configuration).

---

## 5. Architecture technique

- **Backend :** PHP + MySQL.
- **Hébergement v1 :** serveur mutualisé loué (OVH), suffisant tant que Harmonia Éducation est seul utilisateur/pilote du projet.
- **Hébergement cible (v2+) :** provider permettant un déploiement à grande échelle (base de données + PHP), avec accès à des LLM via serveur loué.
- **LLM :**
  - Démos et usage gratuit : LLM open source peu coûteux (ex. Llama) ou modèle très bon marché (ex. Claude Haiku).
  - Utilisateurs avancés : possibilité d'enregistrer sa **propre clé API** (rattachée à son profil, non publique) pour utiliser un modèle frontière au choix (GPT, Gemini, Claude, Grok...).
  - Cible v1 : les 4 principaux LLM frontière du marché + une API type OpenRouter ou Ollama pour l'accès aux modèles open source.
  - Vision long terme : serveur local avec 8 GPU NVIDIA reliés en NVLink (ex. cartes de la classe H200), budget estimé 500k–1M CHF, pour exécuter des modèles frontière open source en interne et réduire les coûts marginaux vers zéro pour l'utilisateur final.
- **Frontend :** interfaces JSX/HTML/JS déjà développées pour la visualisation individuelle et la navigation chronologique (fusion à réaliser, cf. §4.4). Responsive mobile + version imprimable.
- **Éditeur de portfolio collaboratif :** réutilisation d'un projet open source existant plutôt que développement natif (v1 : éditeur texte simple).
- **Système de prompts :** actuellement en Python, à convertir en JavaScript pour intégration web ; éditable en ligne par les promptologues (texte + code).
- **Code source :** l'ensemble (hors Golden Prompt et cartographies privées) publié en open source sur GitHub, avec logique de « clone déployable » : n'importe qui doit pouvoir réimporter référentiel, profil, portfolios et cartographies pour redémarrer sa propre instance de la plateforme.

---

## 6. RGPD et confidentialité — principes directeurs

1. Aucune donnée de portfolio n'est stockée côté serveur par défaut ; export local systématique (JSON cartographie + portfolio + prompt utilisé + référentiel).
2. Stockage serveur = option explicite (opt-in) de l'apprenant.
3. Export/suppression de compte en un clic, avec transfert des données vers un fichier local.
4. Partage à un employeur = décision explicite et individuelle de l'apprenant (lien + mot de passe), jamais automatique.
5. Open data de recherche = uniquement données statistiques agrégées, jamais de contenu individuel identifiable, sauf consentement explicite.

---

## 7. Modèle économique

| Flux de revenu | Description |
|---|---|
| Accès établissements | Facturation du Golden Prompt / clé API qualité à l'usage (ex. coût API + marge), pour cartographier des cohortes entières. |
| Portefeuille de cartographies | Accès payant employeur à la bibliothèque de profils consentants (type LinkedIn), gratuit pour une cartographie individuelle partagée par lien. |
| Vente d'accès aux ressources de formation | Via la future Fondation Harmonia Éducation. |
| Coûts couverts | Clés API (Haiku pour démos gratuites/peu chères, modèles frontière en option payante utilisateur), infrastructure serveur. |

**Contrainte de trésorerie actuelle :** développement porté sur des ressources personnelles limitées (fin de droits chômage dans ~12 mois). Objectif : atteindre l'autofinancement via le portefeuille de cartographies et les accès établissements, avant de pouvoir proposer un accès gratuit/quasi gratuit à l'échelle mondiale.

**Golden Prompt :** version « haut de gamme » du prompt de cartographie, longuement travaillée, gardée **privée/payante** jusqu'à constitution du capital de la Fondation (~50 000 CHF) et l'atteinte d'un revenu récurrent suffisant. Coût d'exécution estimé entre 200 et 2000 $ par étudiant en frais d'API selon la profondeur d'analyse — argument de prospection auprès d'universités, HES, gymnases.

---

## 8. Contraintes et points de vigilance identifiés

- **Limites de contexte LLM** sur portfolios longs → nécessite le découpage journalier + fusion (§4.3).
- **Coût et temps d'exécution** : un run peut prendre plusieurs heures selon la taille du portfolio et le nombre de tokens ; peut être coûteux avec des modèles frontière.
- **Qualité/hallucinations** : justifie le rôle humain du cartographe comme garde-fou obligatoire, jamais une cartographie 100% automatisée.
- **Référentiel évolutif** : les prompts de cartographie doivent pouvoir être réappliqués rétrospectivement quand le référentiel change, pour ne pas perdre de compétences nouvellement identifiées.
- **RGPD** : à traiter comme contrainte de conception dès la v1, pas en couche ajoutée après coup.
- **Multilinguisme des profils/rôles** : beaucoup de rôles définis (visiteur, apprenant, cartographe, promptologue, épistémiarque, employeur, établissement, admin) — risque de complexité excessive pour une v1 ; le rôle « promptagogue » est explicitement repoussé.

---

## 9. Éléments déjà existants (à intégrer, pas à recréer)

- Interface JSX de navigation chronologique dans l'historique des cartographies (« merge »).
- Page HTML/JavaScript de cartographie d'une journée de portfolio.
- Prompts de cartographie (plusieurs versions, travaillées depuis plusieurs mois), actuellement en Python.
- Référentiel de compétences RESPIRE v7 en version prototype.
- Espace Decidim participatif « Harmonia Éducation ».

**Travail principal restant identifié par Christian :** la **fusion** entre l'artifact JSX (vue chronologique) et la page HTML/JS existante (cartographie d'une journée), pour produire le logiciel de visualisation unifié — pièce maîtresse de l'onglet public/démo du site.

---

## 10. Démarche de développement proposée

1. Mettre ce cahier des charges « au propre » (ce document) et le valider/amender.
2. Lister les **cas d'utilisation détaillés** par profil (base pour spécifier interfaces + back-end, fonctionnalité par fonctionnalité) — ébauche fournie en §3, à approfondir.
3. Prioriser un **MVP réaliste** : référentiel + interface publique de démo + interface privée (compte, portfolio Google Docs ou copier-coller, cartographie individuelle) + système de comptes/BDD minimal. (Cf. reformulation finale de Christian en fin d'enregistrement : « il y a un référentiel, une interface publique, une interface privée, un système de comptes » — la version simple du besoin.)
4. Réaliser la fusion JSX/HTML-JS de visualisation (bloc technique prioritaire, cf. §9).
5. Développer en méthode agile, avec une intention de « one-shot » exploratoire intensif pour produire rapidement plusieurs maquettes fonctionnelles à partir de ce cahier des charges.
6. Reporter à des itérations ultérieures : multimédia dans le portfolio, marketplace employeur complète, infrastructure GPU locale, rôle promptagogue, module open data recherche.


---

*Document généré à partir d'un enregistrement vocal de cadrage transcrit automatiquement ; structuré et reformulé pour lisibilité, sans ajout de contenu non exprimé dans l'enregistrement d'origine.*
