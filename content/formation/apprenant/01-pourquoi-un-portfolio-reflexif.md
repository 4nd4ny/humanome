---
parcours: apprenant
chapitre: 1
titre: "Pourquoi un portfolio réflexif"
statut: complet
---

# Pourquoi un portfolio réflexif

Votre cartographie ne mesure pas ce que vous êtes : elle rend visible ce que
votre portfolio donne à voir. Le moteur de cartographie lit vos feuilles de
journal une par une — une feuille par journée — et y cherche des traces de
chacune des 61 compétences du référentiel RESPIRE. Là où vous n'avez rien
écrit, il ne peut rien établir : la compétence est « court-circuitée », sans
examen. Le portfolio réflexif n'est donc ni un CV, ni un exercice imposé :
c'est la matière première de votre cartographie, et le premier lieu où vos
compétences humaines prennent forme, parce que les raconter précisément,
c'est déjà les comprendre.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - situer le portfolio dans la chaîne complète : feuilles → cartographie journalière → fusion (merge) → visualisation ;
> - expliquer pourquoi une compétence réelle mais non racontée reste invisible pour le moteur ;
> - distinguer un portfolio réflexif d'un CV ou d'un rapport d'activité ;
> - décrire ce que la cartographie mesure — et ce qu'elle ne mesure pas.

## 1. À quoi sert une cartographie de compétences

Une cartographie humanome est une **carte de vos compétences humaines** — celles
que le référentiel RESPIRE regroupe en 7 pôles : penser, relier, créer,
discerner, évoluer, gouverner, transmettre. Elle prend la forme d'un *sunburst*,
un diagramme circulaire où chaque secteur est une compétence, coloré selon son
pôle, plus ou moins « poussé » selon la force des traces que vous avez laissées.

Cette carte sert trois usages, dans cet ordre d'importance.

- **Une boussole personnelle d'abord.** La cartographie vous montre les
  territoires que vous habitez déjà et ceux que vous ne visitez presque jamais.
  Elle ne vous note pas : elle vous *rend lisible* à vous-même, avec le recul
  qu'on n'a jamais sur sa propre trajectoire.
- **Une reconnaissance des compétences humaines.** Beaucoup de ce que vous
  savez faire — apaiser un conflit, tenir bon dans l'incertitude, faire grandir
  quelqu'un — n'apparaît sur aucun bulletin. La cartographie donne un nom, un
  code et des preuves à ces compétences que le monde scolaire classique laisse
  dans l'angle mort.
- **Un document partageable, si vous le décidez.** Une cartographie que vous
  avez choisi de rendre partageable, et qu'un cartographe a relue et garantie,
  peut être transmise à un employeur par un lien protégé par mot de passe. Rien
  n'est jamais partagé automatiquement (voir le chapitre 6).

Vous pouvez voir à quoi ressemble une cartographie complète sans compte : la
**démonstration sur données réelles** est accessible depuis l'accueil, à la
route `#/merge`. Vous y retrouverez le sunburst, le panneau de détails, et une
*timeline* qui rejoue la construction de la carte feuille après feuille.

## 2. Ce que le moteur lit réellement

Comprendre la chaîne de traitement, c'est comprendre pourquoi l'écriture
compte autant. Voici ce qui se passe, dans l'ordre.

1. **Le découpage en journées (feuilles).** Votre texte est segmenté en
   *feuilles*, une par journée. Le module portfolio (`#/portfolio`) fait ce
   découpage automatiquement et vous laisse l'ajuster : renommer la date d'une
   journée, la fusionner avec la précédente, la scinder au curseur.
2. **La lecture d'une feuille par le Greffier.** Pour chaque journée, un premier
   passage — que l'on appelle le *Greffier* — relève les **passages saillants**
   de votre texte et en extrait des **pièces** : des unités factuelles qui
   pourront servir de preuve. Une feuille où rien n'est concret ne fournit
   aucune pièce.
3. **L'examen adversarial, compétence par compétence.** Chaque pièce est
   ensuite confrontée aux compétences du référentiel par un *pédagogue
   adversarial*. Ce n'est pas un correcteur bienveillant : c'est un examinateur
   qui suppose d'abord la compétence absente, puis attaque chaque pièce comme
   une possible complaisance. Ce protocole exigeant fait l'objet du chapitre 2.
4. **Le verdict.** Pour chaque compétence examinée, le moteur produit un
   verdict : *présence établie*, *présence non établie*, ou *renvoi au
   cartographe* (quand il préfère l'arbitrage d'un humain). Le verdict
   s'accompagne d'un pourcentage de confiance, du nombre de preuves et
   d'indices, d'un motif et d'une prescription.
5. **La fusion (merge).** Les cartographies journalières sont enfin fusionnées
   en une **cartographie cumulée** dans le temps : c'est la vue Merge, qui
   raconte votre évolution sur des semaines.

Le point capital est à l'étape 2. **Une compétence que vous n'avez jamais
racontée ne fournit aucune pièce : elle est « court-circuitée », c'est-à-dire
écartée sans examen.** Le moteur ne la déclare pas « absente » — il constate
qu'il n'a rien à examiner. Dans la vue Journée, ces compétences apparaissent
d'ailleurs dans une section explicite, « Court-circuits (aucune pièce
extraite) ». Une compétence bien réelle dans votre vie mais absente de votre
écriture y tombe silencieusement.

> **À retenir.** Le moteur n'évalue pas votre vie : il évalue vos traces. Pas
> de trace, pas d'examen. C'est frustrant au premier abord, et c'est en réalité
> une garantie : il ne peut rien inventer sur vous.

## 3. Portfolio réflexif, CV, rapport d'activité : trois écritures différentes

On confond souvent ces trois écritures. Elles n'ont pourtant ni le même but ni
la même forme, et seul le portfolio réflexif nourrit correctement le moteur.

| | Ce qu'il fait | Ce qu'il produit pour le moteur |
|---|---|---|
| **CV** | Liste des qualités et des postes | Presque rien : des étiquettes sans situation |
| **Rapport d'activité** | Décrit *ce qui a été fait* | Des faits, mais souvent sans le « comment » ni le « moi » |
| **Portfolio réflexif** | Raconte *ce que vous avez vécu et ce que vous en avez tiré* | Des pièces concrètes, datées, contextualisées |

Le CV dit « je suis rigoureux, créatif, bon en équipe ». Ce sont des
**généralités** : elles ne fournissent aucune pièce et mènent tout droit au
court-circuit. Le portfolio réflexif dit au contraire : « le 14 mars, deux
membres du groupe ne se parlaient plus ; j'ai proposé qu'on écrive séparément
nos versions du désaccord avant d'en parler à trois ; à la fin de la séance ils
avaient un plan commun. » Ce récit-là fournit une pièce à la compétence *2.03
Gestion des Conflits* — parce qu'il montre au lieu d'affirmer.

Deux marqueurs distinguent le réflexif du simple rapport :

- **La place du « moi ».** Un rapport décrit un projet ; un portfolio décrit ce
  que *vous* y avez fait, décidé, ressenti, appris.
- **La place du doute et de l'échec.** Un portfolio honnête raconte aussi ce
  qui a raté, ce que vous feriez autrement. Loin d'affaiblir une compétence,
  l'auto-examen la renforce : il montre la *métacognition* (compétence *1.04
  Métacognition & Humilité Épistémique*) et désamorce le soupçon de
  complaisance que le moteur porte sur tout récit trop lisse.

## 4. Une feuille par journée, une vision dans le temps

Pourquoi une feuille par jour, et pourquoi la régularité compte-t-elle ?

Parce qu'une compétence rare se révèle rarement dans une seule journée. Une
trace isolée peut suffire pour une compétence forte ; mais beaucoup de
compétences n'émergent qu'à la **fusion** de plusieurs journées, quand le
moteur voit un motif se répéter. La *résilience* (*5.01 Résilience &
Antifragilité*) ne se lit pas dans une bonne journée : elle se lit dans la
manière dont vous traversez une mauvaise semaine, puis rebondissez.

Deux vues rendent ce temps visible.

- **La vue Journée** (`#/jour/<date>`, ou « Voir » sur une cartographie de
  type *Journée*) : le détail d'une feuille, avec les verdicts, l'examen du
  pédagogue et les traces retenues.
- **La vue Merge** (`#/merge`, ou « Voir » sur une cartographie de type
  *Parcours*) : la carte cumulée, avec une *timeline* qui rejoue la
  construction feuille après feuille, une heatmap de vos journées et une
  synthèse par pôle.

Écrire régulièrement, même brièvement, vaut mieux qu'écrire beaucoup une fois
tous les deux mois : la régularité donne au moteur les répétitions dont il a
besoin pour établir les compétences ténues.

## 5. La synthèse kairos

À la fin de la lecture d'une journée, le moteur ne se contente pas d'aligner
des verdicts : il produit une **synthèse kairos** — une lecture d'ensemble qui
regarde *entre* les compétences. Le mot *kairos* désigne le moment opportun,
l'instant qui fait sens ; ici, c'est le regard qui relie.

Dans la vue Journée, quand aucun secteur n'est sélectionné, le panneau de
détails affiche cette synthèse : un **portrait** de votre journée et une
lecture de la *forme* de votre profil. Dans la vue Merge, le même esprit
préside à la synthèse cumulée affichée par défaut, et à chaque **rapport de
pôle** : portrait du pôle, territoires denses, territoires non visités,
émergences et pistes.

La synthèse kairos peut aussi repérer des **compétences émergentes** — des
compétences que vos traces manifestent mais qui ne figurent pas (encore) dans
le référentiel. La vue Merge les compte sous l'étiquette « Compétences
émergentes ». C'est l'une des façons dont le référentiel, vivant, se nourrit de
ce que les apprenants écrivent réellement (voir le chapitre 3).

## 6. Ce que la cartographie ne mesure pas

Il faut être honnête sur les limites, parce que c'est l'éthique même de la
plateforme.

- **Ce n'est pas une note, ni un classement.** Une compétence en « présence non
  établie » ne dit pas que vous en êtes dépourvu : elle dit que *vos feuilles*
  ne l'ont pas encore établie. C'est une information sur votre écriture, pas un
  jugement sur votre valeur.
- **Ce n'est pas la mesure d'une personne.** La carte lit des traces textuelles.
  Elle ne voit ni votre visage, ni votre histoire, ni ce que vous n'avez pas
  écrit. En v1, elle ne lit d'ailleurs que du **texte** : une photo ou une
  vidéo mentionnée sans description reste invisible (voir le chapitre 4).
- **Ce n'est pas infaillible, et ce n'est pas automatique jusqu'au bout.** Le
  moteur se trompe, et il le sait : c'est précisément pourquoi certains
  verdicts sont des « renvois au cartographe ». Le **cartographe** est l'humain
  qui relit, corrige et peut *garantir* votre cartographie avant tout partage.
  Aucune cartographie 100 % automatique n'est jamais présentée comme validée
  (voir le chapitre 5).

En somme, la cartographie est une **lecture de traces, faillible et relue par
un humain**. Ni un verdict sur vous, ni un oracle. Un miroir précis de ce que
vous avez su rendre visible — et c'est déjà beaucoup.

---

**Pour aller plus loin.** Le meilleur moyen de comprendre tout cela est
d'essayer : la page « Essayer » (`#/essayer`) cartographie en direct un texte
que vous collez, comme une journée unique, et affiche le résultat dans la vue
Journée. Aucune donnée n'y est conservée : un rechargement efface tout. Le
chapitre suivant, [Écrire des traces exploitables](02-ecrire-des-traces-exploitables.md),
vous apprend à écrire des feuilles que ce moteur — puis votre cartographe —
pourront réellement étayer.
