---
parcours: visiteur
chapitre: 2
titre: "Explorer la démonstration"
statut: complet
---

# Explorer la démonstration

Le meilleur moyen de comprendre humanome.xyz est de manipuler la démonstration.
Elle repose sur un portfolio réel : **59 journées** analysées, du **22/12/2025
au 29/03/2026**. Ce chapitre est une visite guidée de la cartographie
(`#/cartographie`) : lire le soleil, rejouer sa croissance, parcourir la
heatmap, ouvrir une journée, comprendre une surface, et emporter le résultat.
Ouvrez la page dans un autre onglet et suivez les étapes ; tout ce qui est
décrit ici est visible à l'écran, sans compte, et rien ne quitte votre
navigateur.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - ouvrir la démonstration dans la cartographie ;
> - lire le soleil : pôles, compétences, angle, hauteur, hachures ;
> - rejouer la croissance de la cartographie journée après journée ;
> - parcourir la heatmap et ouvrir une journée seule ;
> - demander « Pourquoi cette surface ? » et exporter ou imprimer.

## Y accéder

Depuis la page d'accueil (`#/`), cliquez sur le bouton bleu **« Explorer la
cartographie de démonstration »**. Vous arrivez sur la cartographie
(`#/cartographie`) ; cliquez sur **« Explorer la démonstration »** : les 59
journées publiques sont lues et rangées dans un jeu de données
« Démonstration », dans votre navigateur. (Les anciennes adresses `#/merge` et
`#/cartographie-v3` mènent au même endroit.)

## Lire le soleil

Le diagramme circulaire occupe le centre de la page. Il se lit du centre vers
l'extérieur.

- **Le centre** indique le nombre de journées prises en compte.
- **L'anneau intérieur** porte les **7 pôles**, chacun de sa couleur (TETE,
  COEUR, MAIN, AME, RACINES, CITE, FLAMBEAU).
- **L'anneau extérieur** porte les **compétences**, dans l'ordre du référentiel
  et dans la couleur de leur pôle.

Deux dimensions portent le sens :

- **L'angle** d'un secteur compte les **points** de la compétence : un point
  par preuve relevée dans le portfolio, un demi-point par indice. Plus une
  compétence a de traces, plus son secteur est large. Les angles sont des
  parts d'un tout : si une compétence gagne de la place, les autres en
  perdent.
- **La hauteur** (jusqu'où le secteur s'étire vers l'extérieur) est la
  **confiance moyenne du jury** dans ses verdicts, de 0 à 1 ; les cercles
  pointillés marquent 0,25, 0,5, 0,75 et 1. Ce n'est ni un niveau de maîtrise ni
  une force.

Un secteur **hachuré** signale une compétence **en renvoi au cartographe** :
l'analyse a vu un signal mais laisse un humain trancher. Une compétence sans
secteur n'a simplement pas été observée dans ces journées : l'absence d'une
trace ne dit pas l'absence de la compétence.

Cliquez sur un secteur : le **panneau de détail** (à droite sur grand écran,
sous l'onglet **Détails** sur écran étroit) montre ses chiffres, ses traces
journée par journée, les verdicts et la réflexion du jury. Échap désélectionne.
Au clavier, chaque secteur s'atteint par Tabulation et s'ouvre avec Entrée.

Pour regarder un pôle de près, **double-cliquez** sur son arc dans l'anneau
intérieur (au clavier : « o ») : il s'ouvre sur tout le cercle, à la place du
soleil complet. Ses compétences se partagent alors les 360°, chacune selon sa
part des points du pôle, et portent leur code ; leur hauteur ne change pas.
Le centre, marqué ↩, ramène à tous les pôles (Échap aussi).

## « Pourquoi cette surface ? »

Un secteur sélectionné, appuyez sur **w** : une fenêtre détaille ce qui fonde
sa surface — les traces et leurs points, la confiance de chaque verdict, les
formules. Si un secteur est si étroit qu'il serait invisible, il est dessiné à
une largeur minimale et la fenêtre le dit, avec l'angle exact.

## Rejouer la croissance : la tête de lecture

Sous le soleil, la **tête de lecture** fixe la **date t** : le soleil montre
l'état cumulé jusqu'à cette date.

- **Lecture : voir l'arbre croître** rejoue l'accumulation journée après
  journée ; **Lecture arrière** la rejoue à rebours ; **Pause** l'arrête.
- **Début**, **Journée précédente**, **Journée suivante** et **Fin : état
  complet** déplacent la date t pas à pas ; le curseur la place n'importe où.
- **Vitesse** : ×0,5, ×1 ou ×2.

La lecture se met en pause dès que vous sélectionnez ou survolez un secteur ;
si votre système demande des mouvements réduits, l'animation est désactivée et
la navigation pas à pas reste disponible.

## Parcourir la heatmap

Sous la tête de lecture, la **heatmap** montre l'année scolaire (août à
juillet ; flèches pour changer d'année, ou une période libre). Une case par
jour, les semaines en colonnes. La démonstration n'a pas de portfolio : la
couleur d'un jour est la somme des points de ses traces, en cinq niveaux
propres à cette personne. Un jour sans analyse reste une case vide, jamais un
niveau bas.

- Un **clic** sur un jour place la date t sur ce jour.
- Un **double-clic** ouvre **la journée seule** : son propre soleil et ses
  compétences, avec des boutons vers la journée précédente et la suivante, et
  « Retour ».

## Choisir les journées

L'espace **Gestionnaire** (et la colonne « Journées » à gauche) liste les 59
journées avec une case à cocher : décochez-en, et le soleil comme la heatmap ne
tiennent plus compte de ces journées. « Tout », « Aucune » et « Inverser »
agissent sur l'ensemble ; Maj+clic coche une plage.

## Les autres espaces

En haut de la cartographie :

- **Comparaison** met deux ensembles de journées côte à côte (deux périodes,
  par exemple), en huit vues, sans jamais classer ;
- **Tableau de bord** réunit des cartes (profil, rythme, constance, moments
  remarquables…) qui se masquent quand leurs données manquent ;
- **Dialogue** pose des questions tirées des traces, pour relire son parcours ;
- **Export** télécharge l'archive complète (JSON, réimportable), une copie
  autonome (une page HTML lisible hors ligne) ou un rapport imprimable.

Pour imprimer ou faire un PDF, ouvrez le **rapport imprimable** depuis
l'espace Export, puis choisissez « Enregistrer au format PDF » dans la fenêtre
d'impression de votre navigateur.

## Récapitulatif de la visite

Vous savez maintenant lire une cartographie : l'angle compte les traces, la
hauteur dit la confiance du jury, la tête de lecture et la heatmap montrent la
construction dans le temps, « Pourquoi cette surface ? » justifie chaque
secteur, et l'export permet d'en garder une trace. Reste une question de fond :
d'où viennent ces 7 pôles et ces 61 compétences, et qui en décide ? C'est
l'objet du chapitre suivant.

Chapitre précédent : `01-qu-est-ce-qu-une-cartographie.md` — chapitre suivant :
`03-le-referentiel-respire.md`.
