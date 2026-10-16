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

## Des panneaux à la demande

Au départ, la page ne montre que deux panneaux, en pleine largeur : le
**soleil** et, dessous, le **détail**. Les autres attendent dans le menu
**« Panneaux »**, en haut à droite : Journées, Compétences, Heatmap et
lecture, Légende, Tableau équivalent, Importer, Étiquettes, Ensembles nommés,
Jeux de données, Réglages (dont la palette des couleurs). Cochez-en un : il
s'ajoute à la suite.
Chaque panneau se déplace (poignée ⠿, ou flèches ◀ ▶), se redimensionne (coin
◢, ou menu de taille) et se masque (✕) : à la souris, ces commandes paraissent
quand elle survole le panneau ; sur un écran tactile, elles restent affichées.
Votre disposition reste dans ce navigateur ; **« Réinitialiser l'affichage »**
revient à la vue de départ, sans sélection.

## Lire le soleil

Le soleil se lit du centre vers l'extérieur.

- **Le centre** indique le nombre de journées prises en compte.
- **L'anneau intérieur** porte les **7 pôles**, chacun de sa couleur (TETE,
  COEUR, MAIN, AME, RACINES, CITE, FLAMBEAU) : il range les compétences, il
  ne mesure rien.
- **L'anneau extérieur** porte les **compétences**, dans l'ordre du référentiel
  et dans la couleur de leur pôle.

Deux dimensions portent le sens :

- **L'angle** d'un secteur compte les **points** de la compétence : un point
  par preuve relevée dans le portfolio, un demi-point par indice. Plus une
  compétence a de traces, plus son secteur est large. Les angles sont des
  parts d'un tout : si une compétence gagne de la place, les autres en
  perdent.
- **La hauteur** (jusqu'où le secteur s'étire vers l'extérieur) est la
  **confiance moyenne du jury** dans ses verdicts : le pied du secteur vaut
  0,25, le bord extérieur 1 ; les cercles pointillés marquent 0,5, 0,75 et 1.
  Ce n'est ni un niveau de maîtrise ni une force.

Un secteur **hachuré** signale une compétence **en renvoi au cartographe** :
l'analyse a vu un signal mais laisse un humain trancher. Une compétence sans
secteur n'a simplement pas été observée dans ces journées : l'absence d'une
trace ne dit pas l'absence de la compétence.

Cliquez sur un secteur : le **détail**, sous le soleil, montre ses chiffres,
ses traces journée par journée, les verdicts et la réflexion du jury. Échap
désélectionne. Sous les verdicts, **« Seconde lecture »** : un autre jury —
six voix et un président — a lu tout le journal d'un coup ; dépliez sa ligne
pour lire la décision du président, puis ce qui y a conduit. Elle ne change
pas le soleil. Le panneau **« Légende »** rappelle ce que disent l'angle, la
hauteur et les hachures.
Au clavier, chaque secteur s'atteint par Tabulation et s'ouvre avec Entrée.

Le portfolio de la démonstration est consultable : sous chaque trace,
**« Ouvrir dans le portfolio »** ouvre le texte de la journée et surligne le
passage que le jury a retenu — en jaune s'il est retrouvé tel quel, en orange
si un seul bout l'est. Le texte garde la mise en forme du journal : titres,
listes, tableaux et encadrés. Les deux triangles autour de la date passent
d'une trace à la suivante ; si le passage n'est pas retrouvé tel quel,
l'extrait du jury est cité au-dessus du texte.

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

Le panneau **« Heatmap et lecture »** (menu « Panneaux ») porte la **tête de
lecture**, qui fixe la **date t** : le soleil montre l'état cumulé jusqu'à
cette date, et l'en-tête la rappelle, avec « revenir à l'état complet ».

- **Lecture : voir l'arbre croître** rejoue l'accumulation journée après
  journée ; **Lecture arrière** la rejoue à rebours ; **Pause** l'arrête.
- **Début**, **Journée précédente**, **Journée suivante** et **Fin : état
  complet** déplacent la date t pas à pas ; le curseur la place n'importe où.
- **Vitesse** : ×0,5, ×1 ou ×2.

La lecture se met en pause dès que vous sélectionnez ou survolez un secteur ;
si votre système demande des mouvements réduits, l'animation est désactivée et
la navigation pas à pas reste disponible.

## Parcourir la heatmap

Dans le même panneau, sous la tête de lecture, la **heatmap** montre toutes
les journées, du premier au dernier jour (« Tout voir ») ; « Année scolaire »
(août à juillet, flèches pour changer d'année) et « Période libre »
restreignent l'affichage. Une case par jour, les semaines en colonnes. La couleur d'un jour dit combien la personne
y a écrit dans son portfolio, en cinq niveaux propres à elle. Quelques jours
écrits n'ont pas été analysés : ils sont colorés, sans secteur au soleil. Un
jour sans texte reste une case vide, jamais un niveau bas.

- Un **clic** sur un jour place la date t sur ce jour.
- Un **double-clic** ouvre **la journée seule** : son propre soleil et ses
  compétences, avec des boutons vers la journée précédente et la suivante, et
  « Retour ».

## Choisir les journées

L'espace **Gestionnaire** (et le panneau « Journées », qui rappelle aussi la
période et le nombre de journées cochées) liste les journées avec une case à
cocher : décochez-en, et le soleil comme la heatmap ne
tiennent plus compte de ces journées. « Tout », « Aucune » et « Inverser »
agissent sur l'ensemble ; Maj+clic coche une plage.

## Les autres espaces

En haut de la cartographie :

- **Comparaison** met deux ensembles de journées côte à côte (d'emblée, la
  première moitié des journées face à la seconde), en huit vues, sans jamais
  classer ;
- **Tableau de bord** réunit des panneaux : au départ le profil et le
  rythme ; « Panneaux » ajoute les autres (constance, moments remarquables…)
  et dit ce qui manque à ceux qui n'ont pas de données ;
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
