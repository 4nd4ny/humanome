---
parcours: visiteur
chapitre: 4
titre: "Essayer, puis aller plus loin"
statut: complet
---

# Essayer, puis aller plus loin

Vous avez lu une cartographie de démonstration et parcouru le référentiel. Reste
l'expérience la plus parlante : voir la plateforme cartographier **votre propre
texte**, en direct, sous vos yeux. C'est possible sans compte, sans installation,
et surtout **sans que rien ne soit conservé**. Ce dernier chapitre vous guide pas
à pas dans la page `#/essayer`, explique ce qui se passe pendant l'analyse et
pourquoi rien n'est stocké, puis montre ce qu'un compte apporterait si vous
souhaitiez aller plus loin.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - cartographier un texte en direct depuis `#/essayer` et lire la progression ;
> - comprendre ce que « aucune conservation » signifie concrètement et quelles bornes protègent la démo ;
> - imprimer ou relancer une analyse ;
> - décider si créer un compte à `#/compte` a du sens pour vous, et où continuer.

## Coller un texte et lancer l'analyse

Rendez-vous à la route `#/essayer` (bouton **« Essayer avec votre propre texte »**
sur la page d'accueil). La page explique en une phrase ce qu'elle fait : elle
cartographie votre texte **en direct**, sur le référentiel RESPIRE, avec **un
modèle de langage fourni par la plateforme**.

Le mode d'emploi est simple :

1. **Collez un texte** dans la grande zone de saisie. L'idéal est une page de
   journal de bord, un extrait de portfolio réflexif, ou tout récit personnel
   d'une situation vécue — le genre de texte que le moteur sait lire (voir le
   chapitre 1). Un compteur de caractères s'affiche sous la zone.
2. **Respectez les bornes de longueur.** Un texte trop court ne donne pas assez
   de matière : en dessous d'un certain seuil (de l'ordre de quelques dizaines de
   caractères), la page vous invite à ajouter quelques phrases. Un texte trop long
   est refusé pour la démo : au-delà de **12 000 caractères**, la page vous
   indique combien de caractères retirer.
3. **Cliquez sur « Cartographier ce texte »** (le bouton bleu). Il ne s'active que
   lorsque le texte est de longueur valable.

## Ce qui se passe pendant l'analyse

L'analyse n'est pas une boîte noire : la page vous montre son déroulé. Une ligne
d'état annonce « Cartographie en cours — appel X sur 8 », et une liste détaille
les **8 étapes** :

- **7 étapes**, une par pôle du référentiel (TETE, COEUR, MAIN, AME, RACINES,
  CITE, FLAMBEAU), chacune instruite **séparément** — le moteur examine votre
  texte pôle par pôle plutôt qu'en bloc ;
- **1 étape finale**, la **synthèse kairos**, une lecture transversale qui relie
  les pôles entre eux.

Chaque étape passe de « en attente » à « en cours » puis « terminé (✓) ». Vous
verrez aussi passer de brefs messages techniques (« défi anti-robot », « analyse
par le modèle de langage ») : ce sont les garde-fous décrits plus bas. Un bouton
**« Annuler l'analyse »** reste disponible à tout moment ; si vous quittez la
page, l'analyse s'interrompt d'elle-même.

Quand tout est terminé, le résultat s'affiche avec la **même vue journée** que
celle du chapitre 2 : un sunburst de votre texte, lu comme une journée unique, et
sa synthèse. Si la synthèse transversale n'a pas pu être produite, les 7 pôles
restent complets et un message vous le signale honnêtement.

## Aucune conservation : ce que cela veut dire

C'est le point le plus important, et la page le répète : **rien n'est conservé**.
Concrètement :

- votre texte et le résultat ne vivent **que dans l'onglet ouvert**. Ils ne sont
  écrits nulle part — ni sur les serveurs de la plateforme, ni même dans le
  stockage de votre navigateur ;
- si vous **rechargez ou quittez** la page, tout disparaît : il faudra recoller
  le texte pour recommencer ;
- côté serveur, seuls des **compteurs anti-abus** sont journalisés — jamais le
  contenu de votre texte.

Ce n'est pas un détail d'affichage : c'est un principe de conception de la
plateforme (RGPD *by design*). En mode démo, la confidentialité est totale parce
qu'il n'y a tout simplement rien à conserver.

## Les bornes anti-abus

Un service gratuit qui appelle un modèle de langage doit se protéger. La démo
s'appuie sur deux garde-fous, visibles pendant l'analyse :

- un **défi anti-robot** (une petite « preuve de travail » que votre navigateur
  résout avant le premier appel au modèle), pour éviter l'usage automatisé en
  masse ;
- les **bornes de longueur** évoquées plus haut (texte ni trop court, ni au-delà
  de 12 000 caractères), qui bornent le coût de chaque analyse.

Ces limites existent pour que la démo reste ouverte à tous, gratuitement, sans
être détournée.

## Imprimer ou recommencer

Une fois le résultat affiché, un bandeau vous rappelle qu'il n'est pas conservé et
vous propose deux actions :

- **« Imprimer »** ouvre la fenêtre d'impression de votre navigateur — d'où vous
  pouvez « Enregistrer au format PDF ». C'est le seul moyen de **garder une
  trace** de ce résultat, puisque rien n'est stocké côté plateforme ;
- **« Cartographier un autre texte »** vous ramène à la zone de saisie pour
  recommencer avec un nouveau texte.

## Aller plus loin : pourquoi créer un compte

La démo répond à la question « à quoi ressemble une cartographie de *mon* texte ».
Elle ne va pas plus loin, par construction : rien n'est gardé, il n'y a qu'une
journée à la fois, et aucune relecture humaine. Si vous êtes apprenant dans une
école RESPIRE (ou souhaitez le devenir), un **compte** — que vous créez à la route
`#/compte` — ouvre le parcours complet :

- **conserver** votre portfolio et vos cartographies dans le temps, feuille après
  feuille, pour voir vos compétences se construire comme dans la timeline de la
  démo (le stockage sur serveur reste **optionnel** et sous votre contrôle ; par
  défaut, tout reste local) ;
- **comparer** l'évolution de vos compétences au fil des semaines, et faire relire
  votre cartographie par un **cartographe** humain qui la corrige et la garantit ;
- **partager** une cartographie validée avec un employeur, de façon explicite et
  choisie (via un lien protégé par mot de passe), jamais automatiquement.

Ce sont là les usages de l'**apprenant**, décrits en détail dans le guide dédié.
Depuis le [hub des guides](#/guides), ouvrez le parcours *apprenant* pour la suite
— à commencer par « Pourquoi un portfolio réflexif ».

## Fin du parcours visiteur

Vous avez fait le tour de ce qu'humanome.xyz offre sans compte : comprendre la
promesse, lire une démonstration réelle, parcourir le référentiel commun, et
cartographier votre propre texte en toute confidentialité. La suite — construire
sa cartographie dans la durée, la faire garantir, la partager — appartient au
parcours apprenant. Bonne exploration.

Chapitre précédent : `03-le-referentiel-respire.md`.
