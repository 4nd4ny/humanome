---
parcours: cartographe
chapitre: 1
titre: "Le rôle du cartographe"
statut: complet
---

# Le rôle du cartographe

Une cartographie sort du moteur comme un dossier d'instruction sort d'un
greffe : structuré, argumenté, mais non jugé. Le cartographe est celui qui
juge en dernier ressort — il relit les verdicts, tranche les « renvois au
cartographe » que le moteur lui adresse explicitement, corrige ce qui doit
l'être et, s'il l'estime juste, garantit la cartographie de sa signature.
Cette garantie est ce qu'un employeur lira : « garantie par » un humain
identifié, à une date donnée, sur une version figée. Ce chapitre décrit le
périmètre du rôle, la relation avec l'apprenant qui vous confie ses feuilles,
et la déontologie qui va avec l'accès à un matériau aussi personnel qu'un
journal de bord.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - situer le cartographe parmi les rôles de la plateforme (apprenant, promptologue, épistémiarque, employeur) ;
> - décrire le cycle de vie d'une cartographie, de la génération à la garantie ;
> - énoncer ce que votre signature engage — et ce qu'elle n'engage pas ;
> - appliquer les règles de confidentialité propres à la lecture d'un portfolio réflexif.

## 1. La place du cartographe dans l'écosystème

humanome.xyz répartit le travail entre plusieurs rôles, chacun responsable
d'un maillon de la chaîne qui va d'un journal de bord à une cartographie
partageable. Il est utile de les situer, parce que votre travail commence là
où celui des autres s'arrête.

- L'**apprenant** écrit son portfolio réflexif — une feuille par journée — et
  lance la cartographie. C'est lui qui possède ses données, qui décide de les
  partager, et qui vous invite.
- Le **promptologue** conçoit, teste et versionne les prompts (et le code JS
  associé) qui scannent les portfolios. Quand un prompt se comporte mal, c'est
  à lui que vous ferez remonter le problème (chapitre 6).
- L'**épistémiarque** édite collectivement le référentiel des 61 compétences
  en 7 pôles (TÊTE, CŒUR, MAIN, ÂME, RACINES, CITÉ, FLAMBEAU). Vous relisez
  toujours *contre* une version précise de ce référentiel : c'est le cadre,
  vous ne le modifiez pas.
- L'**employeur potentiel** est le lecteur final d'une cartographie garantie,
  via un lien protégé par mot de passe. C'est pour lui, in fine, que votre
  garantie a une valeur.

Au milieu de cette chaîne, le **cartographe** est le rôle humain de contrôle
qualité. Le moteur produit ; vous relisez, commentez, corrigez, validez et
garantissez. C'est ce maillon humain qui justifie que le système ne soit
jamais présenté comme 100 % automatisé (cahier des charges, §8) : aucune
cartographie n'est affichée comme validée sans qu'une personne l'ait garantie.

## 2. Le rattachement apprenant–cartographe

Vous ne choisissez pas les cartographies que vous relisez : ce sont les
apprenants qui vous les confient, en deux temps.

D'abord, le **rôle** de cartographe s'obtient auprès d'Harmonia Éducation ; il
est porté par votre compte. Sans lui, l'espace de travail affiche « Cet espace
de travail est réservé aux cartographes » — mais la formation, elle, reste
ouverte à tous, puisqu'elle sert précisément à expliquer le rôle à ceux qui
s'y destinent.

Ensuite, un apprenant vous **rattache** à lui. Depuis son espace, il génère un
code d'invitation de dix caractères (lettres A-Z et chiffres 2 à 9, sans les
ambigus 0/O ni 1/I). Il vous le transmet ; vous l'acceptez.

**Par où passer.** Allez sur `#/cartographe`. La première section s'intitule
« Accepter une invitation ». Saisissez le code dans le champ *Code
d'invitation* (par exemple `K7TQZ2M9RC`) et cliquez sur **Accepter
l'invitation**. Si le code est valide, l'apprenant apparaît alors dans la
section « Mes apprentis », et les cartographies qu'il a partagées avec vous
tombent dans la section « Cartographies à relire ».

Un apprenant ne partage avec vous que ce qu'il choisit de partager :
confidentialité « partagée avec mon cartographe », ou « publique ». S'il n'a
encore rien partagé, votre file reste vide, même une fois le rattachement fait.
C'est normal et c'est voulu : le portfolio ne quitte jamais le navigateur de
l'apprenant sans une décision explicite de sa part.

## 3. Les cinq gestes du métier

Le rôle se résume à cinq gestes, d'engagement croissant. On les retrouve tels
quels dans l'interface.

1. **Relire** — ouvrir une cartographie et en parcourir les verdicts.
   Chaque ligne de la file « Cartographies à relire » porte un bouton
   **Relire** qui mène à `#/cartographe/relecture/<id>`.
2. **Commenter (annoter)** — attacher un commentaire à une compétence :
   un signalement, une question, un désaccord. L'annotation ne modifie rien.
3. **Corriger** — proposer une modification d'un verdict, contrôlée par le
   schéma de données et conservée dans un historique de révisions.
4. **Valider et garantir** — figer une version et y apposer votre signature
   horodatée.
5. **Comparer et vérifier la consistance** — deux outils d'appui
   (`#/cartographe/comparer` et `#/cartographe/consistance`) qui outillent
   votre jugement au-delà d'une cartographie isolée.

Les chapitres 3 à 6 détaillent chacun de ces gestes. Retenez pour l'instant
leur ordre : on relit et on annote beaucoup, on corrige avec retenue, on
garantit en connaissance de cause.

## 4. Ce que garantir engage

La garantie est l'acte central du métier, et le seul qui laisse une trace
publique. Concrètement, quand vous cliquez sur **Valider et garantir** puis
confirmez, la plateforme :

- **fige une version** de la cartographie (le document d'origine, ou la
  révision que vous consultez) : c'est cette version-là, et pas une autre, que
  l'employeur verra ;
- **appose votre signature horodatée** : l'employeur lit « Cartographie
  garantie par *votre nom* le *date* (révision *N* figée) ».

Ce que vous attestez, c'est d'avoir **relu**. Vous garantissez que les
verdicts ont été examinés par un humain, que les renvois ont été instruits,
que les hallucinations manifestes ont été retirées. Vous n'attestez pas que
l'apprenant « vaut » telle note, ni que sa cartographie est complète : une
cartographie ne mesure jamais une personne, seulement ce que son portfolio
donne à voir.

Vous devez donc **refuser de garantir** tant que subsiste un doute non levé :
un renvoi non tranché, une citation que vous n'avez pas retrouvée dans la
source, un verdict qui vous paraît faux sans que vous ayez pu le corriger. Dans
ces cas, annotez, demandez une précision à l'apprenant, et laissez la
cartographie « À relire ». La garantie n'est pas obligatoire ; une cartographie
non garantie n'est simplement pas présentée comme validée.

Enfin, la garantie est **réversible**. Si vous découvrez une erreur après coup,
le bouton **Retirer ma garantie** existe (chapitre 5). Mieux vaut retirer et
re-garantir une version corrigée que laisser courir une erreur signée.

## 5. Déontologie et confidentialité

Relire un portfolio réflexif, c'est lire un journal de bord — un matériau
personnel où l'apprenant a consigné des situations vécues, des doutes, parfois
des échecs. Ce rôle exige une déontologie explicite.

- **Discrétion.** Ce que vous lisez ne sort pas de votre relecture. Les
  principes RGPD de la plateforme (cahier §6) sont conçus pour que le contenu
  ne circule pas ; votre pratique doit être à la hauteur de cette architecture.
- **Non-jugement des contenus.** Vous relisez des *traces de compétences*, pas
  la valeur d'une vie. Une journée difficile racontée honnêtement est une bonne
  trace, pas un mauvais point.
- **Séparation stricte** entre relire des traces et évaluer la personne. Votre
  travail porte sur l'adéquation entre ce qui est écrit et le verdict rendu,
  jamais sur ce que « mérite » l'apprenant.
- **Sobriété.** Vos annotations sont horodatées et signées ; l'apprenant peut
  les voir. Écrivez comme si c'était le cas — parce que ça l'est.

## 6. Ce que le cartographe n'est pas

Poser les limites du rôle dès le premier échange évite bien des malentendus.

- Vous n'êtes pas un **correcteur de style**. Une trace maladroitement écrite
  mais exploitable reste exploitable ; ce n'est pas votre affaire de la
  réécrire.
- Vous n'êtes pas un **évaluateur scolaire**. Il n'y a ni note, ni classement,
  ni moyenne. Les trois seuls verdicts possibles sont « présence établie »,
  « présence non établie » et « renvoi au cartographe ».
- Vous n'êtes pas un **thérapeute**. Si un portfolio révèle une difficulté qui
  dépasse la documentation, ce n'est pas dans votre rôle de la traiter ;
  renvoyez l'apprenant vers les personnes compétentes de son école.
- Vous n'êtes pas le **moteur**. Vous ne réécrivez pas une cartographie de bout
  en bout ; vous corrigez ponctuellement ce qui doit l'être, en motivant chaque
  correction (chapitre 5).

Vous êtes le garde-fou : celui qui, en signant, transforme une production
probabiliste en un document dont un humain répond. Le chapitre suivant explique
pourquoi ce garde-fou reste indispensable, même face à un moteur conçu pour se
méfier de lui-même.
