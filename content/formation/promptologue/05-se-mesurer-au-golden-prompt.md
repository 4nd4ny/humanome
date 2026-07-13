---
parcours: promptologue
chapitre: 5
titre: "Se mesurer au Golden Prompt"
statut: complet
---

# Se mesurer au Golden Prompt

Le Golden Prompt est l'état de l'art interne de la plateforme : une version
haut de gamme du système de cartographie, longuement travaillée, maintenue
privée et réservée aux usages payants tant que le modèle économique de la
Fondation l'exige. Pour le promptologue, il joue un rôle d'horizon. Mais un
principe d'honnêteté gouverne ce chapitre : ce que vous pouvez *réellement*
piloter dans l'atelier, ce n'est pas une comparaison directe au Golden Prompt
— c'est une comparaison à l'étalon embarqué et aux versions publiques les plus
récentes. Ce chapitre distingue soigneusement ce qui est un outil à votre
main et ce qui relève d'une décision d'administration.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - situer le Golden Prompt dans l'écosystème : rôle d'étalon, statut privé, place dans le modèle économique ;
> - distinguer ce que vous comparez vous-même (étalon embarqué, versions publiées) de ce qui dépend d'une autorisation d'administration ;
> - lire un écart de résultats en le décomposant par étage du protocole ;
> - contribuer à l'amélioration commune sans accès au texte du Golden Prompt.

## 1. Qu'est-ce que le Golden Prompt

Le Golden Prompt est une version « haut de gamme » du prompt de cartographie,
décrite au §7 du cahier des charges comme un ensemble de prompts de référence
constituant l'état de l'art interne. Trois traits le définissent :

- **Privé par défaut.** Son contenu ne vit pas dans le dépôt Git : il est
  importé en base par l'administrateur, marqué privé, jamais listé
  publiquement ni servi par l'API publique.
- **Payant / stratégique.** Il fonde une part du modèle économique : les
  établissements paient l'accès pour cartographier leurs cohortes. Son coût
  d'exécution est estimé entre 200 et 2000 $ par étudiant selon la profondeur
  d'analyse.
- **Ouvrable au cas par cas, plus tard.** Il est maintenu fermé jusqu'à la
  constitution du capital de la Fondation Harmonia (de l'ordre de 50 000 CHF)
  et l'atteinte d'un revenu récurrent suffisant.

Un étalon interne plutôt qu'un classement public : ce choix protège à la fois
le modèle économique et les apprenants (pas de course au score sur des données
personnelles).

## 2. Ce que vous pilotez, et ce qui dépend de l'administration

C'est le point que le métier vous demande de comprendre exactement.

**Ce que vous pilotez vous-même, dans le banc d'essai :** la comparaison A/B
et le multi-run (chapitre 4) entre les versions que le sélecteur vous propose,
c'est-à-dire l'**étalon embarqué** `aurora-v3-reconstruit@1.0.0`, les versions
**publiées** sur le serveur, et vos **brouillons**. L'étalon embarqué joue le
rôle de repère commun : il est disponible pour tout promptologue, à tout
moment.

**Ce qui dépend de l'administration :** le Golden Prompt lui-même. Il est
importé et détenu par l'administrateur, qui peut **autoriser un promptologue
au cas par cas** (une décision d'accès enregistrée côté serveur). Il faut le
dire clairement pour ne pas vous induire en erreur : **l'atelier promptologue
n'expose aujourd'hui aucun bouton « comparer au Golden Prompt »** dans le banc
d'essai. Le Golden n'apparaît pas dans le sélecteur de versions. L'accès est
une autorisation administrative, pas une fonctionnalité self-service de la
section Banc d'essai.

> **À retenir** — Votre étalon de travail quotidien est
> `aurora-v3-reconstruit@1.0.0` et les dernières versions publiées. Le Golden
> Prompt est un horizon détenu par l'administration ; n'attendez pas de le
> sélectionner vous-même dans l'atelier.

## 3. Le protocole de comparaison (contre l'étalon accessible)

Faute d'accès direct au Golden, structurez votre progression contre l'étalon
que vous *avez* — c'est déjà un exercice exigeant et fécond. Reprenez la
rigueur du chapitre 4 :

1. Choisissez le mode **A/B (deux versions)** dans **Banc d'essai**.
2. Placez en **Version A** l'étalon embarqué `aurora-v3-reconstruit@1.0.0` (ou
   la dernière version publiée qui fait référence), et en **Version B** votre
   brouillon.
3. Fixez les variables : même **Portfolio de test** (la fixture « Maya, 3
   journées » convient), même **Fournisseur LLM**, même modèle.
4. **Lancez**, lisez le tableau de synthèse et le détail par journée,
   **téléchargez le rapport JSON**.

Quand les modèles cibles diffèrent (par exemple l'étalon réglé pour un modèle
frontière, votre brouillon pour un petit modèle), rappelez-vous la mise en
garde du chapitre 1 : un écart de résultats peut n'être qu'un écart de modèle.
Alignez avant de conclure.

## 4. Lire l'écart

Un écart de résultats n'apprend rien tant qu'on ne le **décompose pas par
étage** du protocole (chapitre 2). Localisez la différence :

- **Extraction (Greffier).** L'étalon extrait-il des pièces là où votre version
  court-circuite ? L'écart est en amont : votre Greffier rate des passages.
- **Présomptions et attaques.** Vos verdicts basculent-ils dans un sens
  systématique ? Une attaque trop mordante disqualifie des pièces valables ;
  trop tiède, elle laisse passer la complaisance.
- **Verdicts.** L'étalon renvoie-t-il au cartographe là où vous tranchez ?
  C'est peut-être lui qui a raison de douter.
- **Narratifs.** Motifs, prescriptions, kairos : l'écart de *ton* et de
  sobriété compte autant que l'écart de statut.

Distinguez les **écarts qui comptent** (une compétence importante
systématiquement traitée autrement) des **écarts qui n'apprennent rien** (une
divergence sur une compétence marginale, dans le bruit de la consistance).

## 5. Progresser sans copier

Vous n'avez pas le texte du Golden Prompt ; c'est une contrainte, pas un
handicap. L'écart mesuré est un **programme de travail**, pas une recette à
rétro-ingénierer. La bonne posture :

- **Formuler des hypothèses testables sur votre propre paquet.** « Si je
  renforce l'attaque (f) récit performatif, je réduis les faux positifs sur les
  compétences déclaratives » — puis vérifier au banc d'essai.
- **Ne pas rétro-ingénierer un étalon que vous ne voyez pas.** Chercher à
  deviner le Golden à partir de ses effets est une perte de temps ; améliorer
  votre protocole sur des bases mesurées est un gain durable.
- **Capitaliser publiquement.** Chaque version publiée que vous améliorez
  relève le niveau des étalons accessibles à tous. Vos progrès nourrissent
  l'état de l'art commun, même sans toucher au Golden.

## 6. Le jour où il s'ouvrira

La trajectoire prévue est explicite dans le cahier : le Golden reste privé
jusqu'à ce que la Fondation soit capitalisée et le revenu récurrent atteint ;
sa publication se fera **au cas par cas**, décidée par l'administrateur. Le
jour venu, l'accès élargi changera la donne pour la communauté des
promptologues — un étalon de très haut niveau deviendra un point de
comparaison, puis une base d'apprentissage. En attendant, la discipline reste
la même : mesurer contre ce qui est accessible, publier des versions honnêtes,
et documenter chaque pas.

Le dernier chapitre — [06-securite-sandbox.md](06-securite-sandbox.md) —
traite de ce qui n'est jamais négociable : la sécurité d'un code qui
s'exécute chez les autres.
