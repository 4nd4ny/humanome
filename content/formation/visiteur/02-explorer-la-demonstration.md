---
parcours: visiteur
chapitre: 2
titre: "Explorer la démonstration"
statut: complet
---

# Explorer la démonstration

Le meilleur moyen de comprendre humanome.xyz est de manipuler la démonstration.
Elle repose sur un portfolio réel : **59 feuilles** écrites du **22/12/2025 au
29/03/2026**, fusionnées en une cartographie cumulée. Ce chapitre est une visite
guidée, pas à pas, de la vue `#/merge` : lire le sunburst, faire rejouer la
construction avec la timeline, parcourir le calendrier, ouvrir une journée, et
imprimer le résultat. Ouvrez la page dans un autre onglet et suivez les étapes ;
tout ce qui est décrit ici est visible à l'écran, sans compte.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - atteindre la vue `#/merge` et lire les trois badges d'en-tête ;
> - interpréter le sunburst : pôles, largeur des secteurs, longueur radiale, conventions visuelles ;
> - faire rejouer la construction feuille par feuille avec la timeline animée ;
> - parcourir la heatmap et ouvrir la cartographie d'une journée à `#/jour/<date>` ;
> - obtenir une version imprimable / PDF.

## Y accéder

Depuis la page d'accueil (`#/`), cliquez sur le bouton bleu **« Explorer la
cartographie de démonstration »**. Vous arrivez à la route `#/merge`. Vous pouvez
aussi taper cette adresse directement : le routage se fait par « hash » (le
`#/...` dans l'URL), il n'y a rien à installer.

## Les trois badges d'en-tête

Tout en haut de `#/merge`, trois indicateurs résument le portfolio :

- **Feuilles de portfolio** — le nombre de journées analysées : **59**.
- **Période** — les dates de la première et de la dernière feuille :
  **22/12/2025 → 29/03/2026**.
- **Compétences établies** — combien de compétences ont accumulé assez de traces
  pour être affirmées, sur les 61 du référentiel : **54 / 61**.

Ces trois chiffres disent déjà l'essentiel : un travail régulier, sur environ
trois mois, qui a rendu visibles 54 des 61 compétences RESPIRE.

## Lire le sunburst

Le diagramme circulaire occupe le centre de la page. Il se lit du centre vers
l'extérieur.

### Les trois anneaux

- **Le centre** (un disque clair) représente la personne. Cliquer dessus
  **réinitialise la sélection** — pratique après avoir exploré un secteur.
- **Le premier anneau** porte les **7 pôles**, chacun de sa couleur :
  *TETE — Penser & Comprendre* (bleu), *COEUR — Relier & Naviguer* (vert),
  *MAIN — Créer & Incarner* (rose), *AME — Discerner & Juger* (violet),
  *RACINES — Évoluer & Résister* (orange doré), *CITE — Gouverner & S'ouvrir*
  (cyan), *FLAMBEAU — Transmettre & Piloter* (orange). (À l'écran, les noms
  s'affichent sans accent ni ligature, tels quels.)
- **L'anneau extérieur** porte les **compétences**, dans la couleur de leur pôle.

### Ce que la géométrie raconte

Deux dimensions portent le sens :

- **La largeur d'un secteur** (son ouverture angulaire) traduit l'**importance**
  qu'a prise la compétence — les *points* qu'elle a accumulés au fil des 59
  feuilles. Une compétence souvent et fortement présente occupe une part plus
  large que celle qui n'affleure qu'une fois.
- **La longueur radiale** (à quelle distance le secteur s'étire vers
  l'extérieur) traduit le **niveau**, de **1 à 5**. Derrière chaque compétence,
  cinq bandes grises discrètes rappellent l'échelle complète des niveaux : le
  secteur coloré s'étire d'autant plus loin que le niveau est élevé.

### Les conventions de lecture

Le sunburst distingue visuellement plusieurs statuts. Dans ce portfolio de démo,
toutes les compétences visibles sont **établies** (secteur plein, bordé de
blanc), mais il est utile de connaître les autres conventions, que vous
rencontrerez sur d'autres cartographies :

- une compétence **en renvoi au cartographe** (le moteur a repéré un signal mais
  préfère laisser un humain trancher) apparaîtrait **hachurée**, avec une bordure
  en pointillés et un secteur volontairement raccourci ;
- une compétence **émergente** (une trace ténue, pas encore consolidée)
  apparaîtrait légèrement plus transparente et bordée de pointillés.

Sur la démo, l'indicateur « En renvoi (entretien) » affiche **0** : il n'y a donc
pas de secteur hachuré à l'écran — mais vous savez désormais ce qu'il signifierait.

### Sélectionner un secteur

Cliquez sur un secteur (un pôle ou une compétence) : le diagramme **atténue tous
les autres** pour isoler votre choix, et le **panneau de détails** (à droite sur
grand écran, sous un onglet **Détails** sur mobile) affiche le contenu associé :

- pour un **pôle**, le nombre de compétences qu'il contient et combien sont
  établies ;
- pour une **compétence**, son niveau (de 1 à 5, avec son libellé), ses points,
  et le cas échéant un archétype et le retour rédigé par le moteur.

Sans sélection, le panneau affiche par défaut la **synthèse kairos** — une
lecture transversale de l'ensemble du portfolio — suivie d'un petit récapitulatif
(compétences établies, en renvoi, émergentes, score total). Pour revenir à cet
état, cliquez le centre du diagramme ou une zone vide.

Au clavier, chaque secteur est atteignable par Tabulation et s'active avec Entrée
ou Espace : la cartographie est utilisable sans souris.

## Rejouer la construction : la timeline animée

Sous le diagramme se trouve un **lecteur de timeline**. C'est l'une des idées
fortes de la démonstration : au lieu de voir la cartographie figée, vous la voyez
**se construire feuille après feuille**.

- Le bouton **▶ (Lecture)** rejoue l'accumulation depuis la première feuille ; le
  diagramme se densifie sous vos yeux, secteur par secteur.
- Les boutons **⏮ ◀ ▶▶ ⏭** vont respectivement à la première feuille, à la
  précédente, à la suivante, à la dernière.
- Le **curseur** (la barre de défilement) vous laisse vous positionner à
  n'importe quelle feuille, de 1 à 59.
- Le menu **Vitesse** propose *Rapide* (150 ms/feuille), *Normale* (400 ms) et
  *Lente* (800 ms).

Sous les contrôles, une ligne d'état indique la position — par exemple
« Feuille 30 / 59 — 06/02/2026 » — et un compteur du type « N compétences sur la
carte » : vous voyez le nombre grimper à mesure que les feuilles s'ajoutent.

Deux comportements utiles à connaître : dès que vous **sélectionnez ou survolez**
un secteur, la lecture se met en pause (pour ne pas perdre le fil de votre
lecture) ; et si votre système est réglé sur « mouvement réduit », la lecture
automatique est désactivée — la navigation manuelle, elle, reste disponible.

## Parcourir le calendrier (heatmap)

Encore en dessous s'affiche un **calendrier façon « heatmap »**, dans l'esprit des
graphes de contributions que vous avez peut-être déjà croisés. Une case par jour,
une colonne par semaine (du lundi au dimanche). L'**intensité de bleu** d'une case
traduit le **score de la journée** : plus une feuille était riche, plus la case
est foncée ; les jours sans feuille restent en gris pâle. La légende annonce
« 59 feuilles de portfolio — cliquez sur un jour pour ouvrir sa cartographie ».

## Ouvrir une journée

Cliquez sur une case active du calendrier : vous ouvrez la **cartographie de ce
jour-là**, à la route `#/jour/<date>` (par exemple `#/jour/2026-02-06`). Vous
retrouvez un sunburst — mais celui d'**une seule feuille** cette fois — et la
lecture de cette journée. C'est le grain le plus fin de la chaîne
feuilles → jour → merge : la brique élémentaire à partir de laquelle tout le reste
s'accumule. Pour revenir à la vue cumulée, retournez à `#/merge`.

## Imprimer / exporter en PDF

Dans la barre au-dessus du diagramme (la même qui, sur mobile, propose de basculer
entre **Diagramme** et **Détails**) se trouve un bouton **« Imprimer »**. Il
ouvre la fenêtre d'impression de votre navigateur : la mise en page est adaptée
pour tenir sur papier, et vous pouvez y choisir « Enregistrer au format PDF »
plutôt qu'une imprimante physique. C'est le moyen le plus simple d'emporter la
cartographie hors de la plateforme.

## Récapitulatif de la visite

Vous savez maintenant lire une cartographie cumulée : les badges donnent le
cadre, le sunburst montre la structure (largeur = importance, longueur = niveau),
la timeline montre la construction dans le temps, la heatmap donne accès à chaque
journée, et l'impression permet d'en garder une trace. Reste une question de
fond : d'où viennent ces 7 pôles et ces 61 compétences, et qui en décide ? C'est
l'objet du chapitre suivant.

Chapitre précédent : `01-qu-est-ce-qu-une-cartographie.md` — chapitre suivant :
`03-le-referentiel-respire.md`.
