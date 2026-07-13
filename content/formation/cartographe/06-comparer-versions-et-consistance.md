---
parcours: cartographe
chapitre: 6
titre: "Comparer des versions, lire la consistance"
statut: complet
---

# Comparer des versions, lire la consistance

Deux outils prolongent votre jugement au-delà de la relecture d'une
cartographie isolée. La comparaison côte à côte confronte deux cartographies
d'un même portfolio produites par des versions de prompts différentes : elle
révèle ce qui tient au texte de l'apprenant et ce qui tient au prompt. Le
rapport de consistance multi-run exécute plusieurs fois la même version sur le
même portfolio et mesure ce qui varie : compétences stables, compétences
divergentes, distance structurelle entre les documents produits. Savoir lire
ces deux instruments vous permet de distinguer une compétence fragile (mal
documentée par l'apprenant) d'un prompt instable (à signaler au promptologue)
— deux situations qui appellent des réponses opposées.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - mener une comparaison côte à côte de deux cartographies d'un même portfolio et en tirer des conclusions prudentes ;
> - lire un rapport de consistance multi-run : compétences stables, divergentes, distance structurelle ;
> - distinguer une divergence imputable aux traces d'une divergence imputable au prompt ;
> - formuler un retour exploitable au promptologue ou à l'apprenant selon le diagnostic.

## 1. Pourquoi le même portfolio donne des cartographies différentes

Un même portfolio, cartographié deux fois, ne rend pas exactement le même
résultat. Trois causes se combinent.

- **Le non-déterminisme des modèles de langage.** À prompt identique, un LLM
  produit des sorties qui varient d'un run à l'autre. Une compétence peut
  passer de « présence établie » à « renvoi au cartographe » sans qu'une
  virgule du portfolio ait bougé.
- **La sensibilité au prompt.** Deux versions de prompt encodent deux façons de
  juger : l'une plus sévère sur une attaque, l'autre plus généreuse sur un
  pôle. La différence de verdicts reflète alors le prompt, pas l'apprenant.
- **Les effets de bord du découpage journalier.** Le moteur lit une feuille par
  journée ; une trace à cheval sur deux journées, ou ténue, peut apparaître ou
  disparaître selon la façon dont le découpage et la fusion l'ont traitée.

Distinguer ces causes est exactement ce que les deux outils de ce chapitre
permettent : la comparaison isole l'effet du *prompt*, la consistance isole
l'effet du *hasard de run*.

## 2. La comparaison côte à côte

**Par où passer.** Allez sur `#/cartographe/comparer`. Deux sélecteurs,
*Cartographie 1* et *Cartographie 2*, sont alimentés par votre file. Contrainte
métier : les deux doivent appartenir au **même apprenant** — une fois la
première choisie, la seconde ne propose que les cartographies du même apprenant.
Le cas d'usage type : deux versions de prompts sur le même portfolio.

Vous obtenez alors deux sunbursts côte à côte, puis une section « Divergences
par compétence » : un compteur (« N compétence(s) divergente(s) sur M
comparée(s) ») et un tableau. Chaque ligne est une compétence ; les colonnes
comparent quatre champs, affichés « valeur 1 / valeur 2 » :

- **Statut** — « présence établie », « présence non établie », « renvoi au
  cartographe » ;
- **Niveau** ;
- **Points** ;
- **Confiance** (en pourcentage).

Les lignes qui divergent sont surlignées, et à l'intérieur d'une ligne, le champ
précis qui diffère est mis en évidence. Lisez d'abord les **bascules de statut**
(établie ↔ non établie ↔ renvoi) : ce sont les divergences qui comptent pour un
employeur. Une différence de confiance de quelques points, à statut identique,
est anecdotique ; une bascule de statut ne l'est jamais.

Restez prudent dans l'interprétation : deux versions de prompts qui divergent ne
disent pas laquelle « a raison ». Elles disent *où* le jugement dépend du prompt
— et donc où votre relecture (chapitres 3 et 5) doit trancher au cas par cas.

## 3. Lire un rapport de consistance multi-run

La consistance répond à une autre question : à *prompt constant*, combien le
hasard de run fait-il varier le résultat ?

**Par où passer.** Allez sur `#/cartographe/consistance`. L'outil ne travaille
que sur des documents de **journée** (`cartographie-jour`), et il en faut au
moins deux. Vous les sélectionnez de deux manières, combinables :

- en **cochant** des cartographies de journée dans votre file ;
- en **ajoutant des fichiers JSON locaux** (bouton de fichier) : ils sont
  validés au schéma `cartographie-jour` et **rien n'est envoyé au serveur** —
  c'est le moyen d'analyser plusieurs runs d'un même prompt que vous auriez
  exécutés localement.

Cliquez sur **Analyser la consistance (N document(s))**. Le rapport comprend :

- **Accord global** — un pourcentage, accompagné de la **distance structurelle**
  (plus elle est basse, plus les runs se ressemblent).
- **Compétences stables** — établies dans *tous* les runs : le socle sûr, sur
  lequel vous pouvez vous appuyer les yeux fermés.
- **Compétences divergentes** — celles dont le statut change d'un run à l'autre,
  avec le détail des statuts et des runs concernés.
- **Détail par compétence** — un tableau run par run (statut + confiance), avec
  l'**écart-type de confiance** : une compétence à statut stable mais à
  écart-type élevé est une compétence sur laquelle le moteur est nerveux.

## 4. Poser le diagnostic

Les deux outils convergent vers une seule décision : à quoi tient une
divergence ? Trois profils, trois réponses.

- **Une compétence systématiquement divergente** (elle bascule à presque chaque
  run, ou entre les deux versions de prompt) alors que les autres sont stables :
  le problème est le plus souvent **du côté des traces**. La documentation de
  l'apprenant est limite — la compétence est réelle mais mal montrée. Réponse :
  travailler avec l'apprenant (annotation « Commentaire », prescription) pour
  qu'il documente mieux.
- **Des divergences diffuses** (beaucoup de compétences bougent un peu partout,
  distance structurelle élevée) : le problème est plutôt **du côté du prompt**,
  qui est instable. Réponse : signaler au promptologue.
- **Cas mixte** : un socle stable, plus deux ou trois compétences nerveuses.
  C'est le cas le plus fréquent. Traitez les compétences nerveuses une à une —
  certaines relèvent des traces, d'autres du prompt — et garantissez sur le
  socle stable en instruisant les nerveuses.

La règle simple : **une compétence isolée qui bouge = traces ; un bruit
généralisé = prompt.**

## 5. Dialoguer avec le promptologue

Quand le diagnostic pointe le prompt, votre signalement n'est utile que s'il est
précis. Le promptologue travaille sur un banc d'essai ; donnez-lui de quoi
reproduire, pas une impression. Transmettez :

- les **versions exactes** de prompt concernées (celles du quadruplet du
  chapitre 3, §1) ;
- les **compétences** qui divergent, par leur code ;
- des **exemples de bascule** concrets (« sur la journée du *date*, la
  compétence `4.03` passe de “présence établie” à “renvoi au cartographe” entre
  les runs 2 et 4 ») ;
- s'il y a lieu, l'**accord global** et la **distance structurelle** du rapport.

Ce niveau de détail transforme votre relecture en donnée exploitable pour
améliorer le prompt — c'est la boucle vertueuse entre cartographe et
promptologue.

## 6. Consigner dans la relecture

Comparaison et consistance ne sont pas des curiosités : ce sont des étapes de
relecture, à intégrer à votre registre (chapitre 3, §8). Concrètement, faites-en
un réflexe **avant de garantir** dès que vous en avez les moyens :

- lancez une **consistance** quand vous disposez de plusieurs runs du même
  portfolio, pour savoir sur quel socle stable vous garantissez et quelles
  compétences instruire de plus près ;
- lancez une **comparaison** quand une cartographie a été produite par une
  version de prompt dont vous vous méfiez, pour voir ce qui bouge par rapport à
  une version de référence.

Notez, dans votre registre, ce que ces outils ont montré et ce que vous en avez
conclu. Une garantie appuyée sur un socle stable identifié, et sur des
divergences instruites une à une, est une garantie que vous pourrez défendre —
et c'est tout le sens du métier de cartographe.
