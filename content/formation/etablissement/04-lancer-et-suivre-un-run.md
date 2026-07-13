---
parcours: etablissement
chapitre: 4
titre: "Lancer et suivre un run de masse"
statut: complet
---

# Lancer et suivre un run de masse

Un **run de masse** est le traitement qui transforme les portfolios déposés d'une
cohorte en cartographies. Concrètement, la plateforme découpe le travail en
**jobs** — un job par couple (membre, journée) — et les fait passer, un tick après
l'autre, dans une file côté serveur. Vous ne lancez pas un long processus opaque :
vous choisissez un paquet de prompts, vous vérifiez une estimation de coût, vous
confirmez, puis vous regardez l'avancement se remplir en direct, avec la faculté
d'arrêter à tout moment. Ce chapitre suit ce parcours du clic « Estimer le coût »
jusqu'au run terminé, en expliquant chaque statut de job et le comportement au
plafond de budget.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - sélectionner les membres et un paquet de prompts publié, puis estimer le coût ;
> - lancer un run et comprendre ce qu'est un job (membre, journée) ;
> - lire le tableau d'avancement et la signification des six statuts de jobs ;
> - reconnaître l'arrêt au plafond de budget et savoir le débloquer ;
> - annuler un run en cours.

## 1. Le principe : un job par (membre, journée)

Avant de lancer, retenez le modèle de travail. La plateforme ne cartographie pas
« une classe » en un seul appel : elle éclate le travail en jobs élémentaires, un
par journée de chaque membre. Une classe de 25 apprenants ayant chacun 20 journées
de portfolio, c'est 500 jobs. Chaque job est une extraction indépendante, ce qui
permet la reprise incrémentale : si un job échoue ou si le run est interrompu, les
autres ne sont pas perdus.

Seuls entrent dans la file les membres qui ont **consenti ET déposé** leur
portfolio. Un membre consenti mais sans dépôt ne génère aucun job. L'extraction
tourne côté serveur par ticks courts ; la **fusion** chronologique (le sunburst),
elle, n'est pas produite par le serveur : elle est recalculée dans le navigateur au
moment où vous consultez les documents d'un membre (voir chapitre 5).

## 2. Préparer le lancement

Ouvrez la page de la cohorte : **#/etablissement/cohorte/&lt;id&gt;**, section
**« Lancer un run de masse »**.

1. **Sélectionnez les membres.** Dans le tableau « Membres », la case à cocher de
   gauche indique qui sera inclus. Par défaut, tous les membres ayant déposé leur
   portfolio sont cochés. Décochez ceux que vous ne voulez pas traiter cette
   fois-ci. Les membres sans dépôt ont une case désactivée : ils ne peuvent pas
   être inclus.
2. **Choisissez un paquet de prompts.** Le menu déroulant **« Paquet de
   prompts »** liste les paquets **publiés** (préparés par les promptologues et
   stockés en base). Le paquet marqué « (défaut) » est présélectionné. Si aucun
   paquet publié n'est disponible, un message vous le signale : le run de masse
   exige un paquet en base, il ne peut pas utiliser le paquet embarqué d'un run
   local.

## 3. Estimer le coût

Cliquez sur **« Estimer le coût »**. La plateforme calcule et affiche un encadré
récapitulatif :

- le nombre de **membres sélectionnés** et de **journées** au total ;
- le nombre d'**appels LLM** que cela représente (huit par journée : les sept pôles
  et une synthèse) ;
- le **modèle** utilisé pour le calcul ;
- le **coût estimé** en dollars — ou « inconnu (modèle hors table de prix) » si le
  modèle configuré n'a pas de tarif connu (cas d'un endpoint local).

Si l'estimation **dépasse le budget restant**, un avertissement rouge apparaît :
les jobs excédentaires passeront en « budget dépassé ». Un rappel accompagne
toujours l'estimation pour souligner qu'il s'agit d'un ordre de grandeur, pas d'une
facture exacte. C'est le moment d'ajuster : réduire la sélection, ou remonter le
plafond dans la configuration (chapitre 3).

## 4. Confirmer et lancer

Sous l'estimation, cliquez sur **« Confirmer et lancer le run »**. La plateforme
enfile les jobs et bascule l'affichage sur la section **« Avancement »**. Le
lancement est un acte délibéré en deux temps — estimer, puis confirmer — pour que
vous ne déclenchiez jamais une dépense de masse par un clic isolé.

## 5. Suivre l'avancement en direct

La section **« Avancement »** s'actualise **automatiquement toutes les 5
secondes**. Elle affiche :

- une ligne de résumé : l'identifiant du run, son **statut**, le nombre de jobs
  terminés sur le total, et le **coût cumulé** en dollars ;
- un tableau de comptage par statut.

Les six statuts de jobs, avec leurs libellés à l'écran, sont :

- **En attente** (`queued`) — le job est dans la file, pas encore traité ;
- **En cours** (`running`) — le job est en train d'être extrait ;
- **Terminés** (`done`) — l'extraction a réussi ;
- **En erreur** (`failed`) — l'extraction a échoué pour ce job ;
- **Budget dépassé** (`budget_exceeded`) — le job est en attente faute de budget ;
- **Annulés** (`cancelled`) — le job a été annulé.

Si des jobs sont en erreur, un bloc **« Erreurs par membre »** liste, membre par
membre, le message technique correspondant — utile pour repérer un portfolio
problématique sans jamais exposer son contenu.

## 6. L'arrêt au plafond de budget

Si le run atteint votre plafond de dépense, les jobs restants ne sont pas payés :
ils passent en **« Budget dépassé »**, et un message rouge l'annonce : « Plafond de
budget atteint : N job(s) en attente de budget. Montez le plafond dans la
configuration puis relancez pour les réactiver. » C'est le garde-fou du chapitre 3
qui agit. Pour aller au bout :

1. retournez à la configuration (**#/etablissement**, « Configuration LLM et
   budget ») ;
2. **augmentez le plafond** de dépense et enregistrez ;
3. **relancez** un run pour la cohorte : les journées non encore traitées
   reprennent là où elles s'étaient arrêtées (reprise incrémentale).

## 7. Annuler un run en cours

Tant qu'un run est actif (des jobs en attente ou en cours), un bouton **« Annuler
le run »** est disponible sous le tableau d'avancement. Il stoppe le traitement :
les jobs non encore lancés passent en « Annulés ». Les journées déjà cartographiées
restent acquises — annuler n'efface pas ce qui a été produit.

Une fois le run terminé, les cartographies sont prêtes à être lues. Le dernier
chapitre explique comment les consulter membre par membre, et comment se partagent
les droits d'export et d'effacement — voir « 05-lire-exporter-effacer.md ».
