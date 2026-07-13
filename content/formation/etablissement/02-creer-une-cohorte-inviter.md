---
parcours: etablissement
chapitre: 2
titre: "Créer une cohorte et inviter les apprenants"
statut: complet
---

# Créer une cohorte et inviter les apprenants

Une cohorte est le contenant qui regroupe les apprenants d'une même classe ou d'un
même groupe pour les cartographier ensemble. La créer prend quelques secondes ;
mais la suite — l'arrivée des apprenants — repose sur un enchaînement précis que
vous devez comprendre pour l'accompagner : chaque apprenant **rejoint** la cohorte
avec un code, **consent** explicitement, puis **dépose** son portfolio. Ces trois
gestes se font dans l'espace de l'apprenant, pas dans le vôtre. Votre rôle est de
créer le contenant, de transmettre le bon code, et de savoir lire, sur votre écran,
où en est chaque membre. Ce chapitre parcourt ce cheminement de bout en bout, côté
établissement puis côté apprenant.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - créer une cohorte et récupérer son code d'invitation ;
> - expliquer à vos apprenants le parcours exact pour rejoindre, consentir et déposer ;
> - lire l'état de chaque membre (consentement, portfolio déposé) dans la page de la cohorte ;
> - supprimer une cohorte en connaissant la confirmation en deux temps.

## 1. Créer une cohorte

Depuis l'accueil de votre espace (**#/etablissement**), la première section
s'intitule **« Mes cohortes »**.

1. Dans le champ **« Nom de la cohorte »**, saisissez un nom parlant : le champ
   suggère par exemple « BTS SIO 2026 ». Choisissez un intitulé qui vous
   permettra de retrouver la classe sans hésitation dans un an.
2. Cliquez sur **« Créer la cohorte »**.
3. Un message de confirmation apparaît : « Cohorte « … » créée », suivi du
   **code d'invitation** à transmettre aux apprenants.

La cohorte apparaît alors dans le tableau de la même section, avec cinq colonnes :
son nom (cliquable, qui mène à sa page de détail), son **code d'invitation**, le
nombre de **membres**, la date de création, et des actions (« Ouvrir »,
« Supprimer »).

## 2. Le code d'invitation

Le code d'invitation est la clé que vous distribuez à vos apprenants. C'est lui,
et lui seul, qui rattache un apprenant à votre cohorte. Vous le retrouvez à tout
moment :

- dans le tableau « Mes cohortes » de l'accueil, colonne **« Code d'invitation »** ;
- en haut de la **page de détail de la cohorte** (**#/etablissement/cohorte/&lt;id&gt;**),
  où il est rappelé avec la marche à suivre pour l'apprenant.

Transmettez-le par votre canal habituel (espace numérique de travail, e-mail de
classe, projection en salle). Le code n'est pas un secret sensible en soi — il ne
donne accès à rien sans un compte et un consentement — mais réservez-le au groupe
concerné pour garder vos cohortes propres.

## 3. Ce que fait l'apprenant, pas à pas

C'est le point à bien expliquer à votre classe, car les trois gestes sont
volontairement séparés (c'est le cœur du cadre RGPD). Voici le parcours réel côté
apprenant, dans son espace **« Mes cohortes »** (**#/espace/cohortes**).

**Étape A — rejoindre.** L'apprenant, une fois connecté, ouvre « Mes cohortes »,
section **« Rejoindre une cohorte »**. Il saisit le **code d'invitation** que vous
lui avez transmis. Sous le champ, la plateforme affiche le **texte de
consentement** en toutes lettres : il y lit que l'établissement verra les
cartographies produites dans ce cadre, que ses portfolios restent dans son
navigateur tant qu'il ne les dépose pas, et qu'il peut quitter la cohorte à tout
moment.

**Étape B — consentir.** Sous ce texte, une case à cocher : « Je donne mon
consentement explicite : l'établissement verra les cartographies produites dans ce
cadre. » Tant qu'elle n'est pas cochée, le bouton **« Rejoindre la cohorte »**
reste inactif. C'est un verrou volontaire : sans consentement, pas de jointure.

**Étape C — déposer.** Rejoindre ne suffit pas à être cartographié. Une fois la
cohorte rejointe, elle apparaît dans « Cohortes rejointes » avec un badge
« Portfolio non déposé ». L'apprenant choisit alors un de ses portfolios locaux et
clique sur **« Déposer dans la cohorte »**. La plateforme le prévient clairement :
ce dépôt **envoie ce portfolio au serveur** pour le traitement de masse — c'est
l'exception explicite au principe « le portfolio ne quitte jamais votre
navigateur ». Le portfolio déposé sera supprimé avec le compte de l'apprenant.

Si un apprenant n'a pas encore de portfolio, il doit d'abord en créer un depuis
**#/portfolio** ; le parcours apprenant l'explique en détail.

Retenez la règle : **un membre n'est traitable que s'il a consenti ET déposé.**
Tant que le portfolio n'est pas déposé, il n'y a rien à cartographier, et le run
n'aura aucun job pour lui.

## 4. Lire l'état de vos membres

Ouvrez la page de la cohorte (colonne nom, ou bouton « Ouvrir ») :
**#/etablissement/cohorte/&lt;id&gt;**. La section **« Membres »** dresse le
tableau de bord de votre classe :

- colonne **« Consentement »** : un badge « Consenti le … » (vert) ou « Sans
  consentement » ;
- colonne **« Portfolio déposé »** : le titre du portfolio, le nombre de journées
  et la date de dépôt, ou « Non déposé » ;
- colonne **« Avancement »** : le nombre de journées déjà cartographiées sur le
  total, une fois qu'un run a tourné ;
- colonne de gauche : une **case à cocher** qui sert à sélectionner le membre pour
  le prochain run — elle est désactivée tant que le portfolio n'est pas déposé,
  puisqu'il n'y aurait rien à traiter.

Ce tableau est votre outil de relance : si, à l'approche d'un run, des apprenants
sont encore « Sans consentement » ou « Non déposé », c'est là que vous le voyez, et
c'est à eux d'agir dans leur propre espace — vous ne pouvez pas le faire à leur
place.

## 5. Supprimer une cohorte

Depuis l'accueil, la colonne d'actions du tableau « Mes cohortes » propose un
bouton **« Supprimer »**. La suppression se fait en **deux temps** : un premier
clic arme l'action et le bouton devient **« Confirmer la suppression » ** ; un
second clic seulement l'exécute. Ce double geste évite les suppressions
accidentelles. Ne supprimez une cohorte que lorsque vous êtes certain de ne plus
en avoir besoin.

Vous savez créer un contenant et y faire entrer vos apprenants dans les règles.
Avant de lancer quoi que ce soit, il faut décider **avec quel moteur LLM** et
**sous quel budget** vos cartographies seront produites : c'est l'objet du
chapitre suivant — voir « 03-configurer-llm-et-budget.md ».
