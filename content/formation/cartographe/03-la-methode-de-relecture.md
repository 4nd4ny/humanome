---
parcours: cartographe
chapitre: 3
titre: "La méthode de relecture"
statut: complet
---

# La méthode de relecture

Relire une cartographie ne consiste pas à tout relire : une feuille de journée
contient jusqu'à sept pôles, des dizaines de pièces et soixante et un verdicts.
La méthode proposée ici ordonne l'effort : d'abord les « renvois au
cartographe » (le moteur vous les adresse), puis les verdicts à faible
confiance, puis un contrôle par sondage des présences établies — chaque fois
en vérifiant les extraits contre le portfolio source, seule parade sûre contre
l'hallucination. Les courts-circuits méritent un œil distinct : « aucune pièce
extraite par le Greffier » ne signifie pas « rien à voir ». Ce chapitre détaille
cet ordre de lecture et le geste de vérification, y compris le cas particulier
des contenus multimédias que l'apprenant doit décrire en texte pour qu'ils
existent aux yeux du moteur.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - dérouler l'ordre de relecture : renvois au cartographe, verdicts à faible confiance, sondage des présences établies, courts-circuits ;
> - vérifier une pièce contre le portfolio source et reconnaître une citation altérée ou inventée ;
> - lire les compteurs d'audit d'un pôle pour repérer une feuille anormale ;
> - conduire le workflow multimédia : demander et intégrer une description textuelle.

## 1. Avant de relire

Une cartographie ne se relit jamais seule. Réunissez d'abord un quadruplet
indissociable :

- la **feuille source** — la journée de portfolio que le moteur a lue ;
- la **cartographie** produite, que vous ouvrez depuis la file ;
- la **version du prompt** qui l'a générée ;
- la **version du référentiel** contre laquelle les compétences ont été
  jugées.

Pourquoi ce quadruplet ? Parce qu'un verdict n'a de sens que rapporté au texte
qu'il juge, au prompt qui l'a rendu et au référentiel qui le définit. Corriger
un verdict sans la feuille sous les yeux, c'est deviner ; comparer deux
cartographies sans connaître leurs prompts, c'est comparer des pommes et des
poires (chapitre 6).

**Par où passer.** Depuis `#/cartographe`, section « Cartographies à relire »,
cliquez sur **Relire** en face de la cartographie voulue. Vous arrivez sur
`#/cartographe/relecture/<id>`. L'en-tête rappelle l'apprenant, le titre, le
type (journée ou parcours/merge) et la date de dépôt. La visualisation —
sunburst en lecture seule — occupe le haut de la page ; le panneau
« Annoter et corriger par compétence » vient dessous.

## 2. L'ordre de lecture

Vous ne pouvez pas relire soixante et un verdicts avec la même intensité.
Ordonnez l'effort, du plus au moins urgent :

1. **Les renvois au cartographe d'abord.** Ce sont les cas où le moteur s'est
   explicitement abstenu (chapitre 2). Ils vous sont adressés ; ils sont peu
   nombreux ; c'est là que votre jugement compte le plus. Sélectionnez chaque
   compétence concernée dans la liste déroulante *Compétence* et lisez son
   verdict.
2. **Les verdicts à faible confiance ensuite.** Le champ *Confiance* (de 0 à 1)
   accompagne chaque verdict. Un verdict à 0,55, quel que soit son statut, est
   un verdict que le moteur a rendu sans conviction : traitez-le comme un
   quasi-renvoi.
3. **Un sondage des présences établies.** Vous ne re-vérifiez pas les 61
   verdicts, mais vous en contrôlez un échantillon — surtout les « présence
   établie » à forte confiance, car ce sont elles qui pèseront devant un
   employeur. Un sondage régulier suffit à détecter une hallucination
   systématique.
4. **Les courts-circuits en balayage.** Voir la section 5.

Sur une cartographie qui couvre plusieurs semaines (un parcours/merge), dosez :
concentrez-vous sur les compétences qui basculent dans le temps plutôt que sur
celles qui sont stables. Rappel important : la **correction par verdict ne
s'applique qu'aux cartographies de journée** ; sur un merge, vous annotez ici
et vous corrigez les journées sources (voir section 4 et chapitre 5).

## 3. Vérifier contre la source

C'est le geste central de la relecture, et le seul rempart sûr contre
l'hallucination. Pour toute pièce ou tout extrait cité dans un verdict, vous
devez le **retrouver dans la feuille source** — au mot près, ou presque.

Ouvrez la feuille de la journée à côté de la relecture. Pour un verdict que
vous instruisez, prenez la citation ou le passage saillant sur lequel il
s'appuie et cherchez-le dans le texte de l'apprenant. Trois issues :

- **Vous le retrouvez tel quel** : la pièce est authentique ; il reste à juger
  si elle porte vraiment la compétence (section 4).
- **Vous retrouvez un passage proche mais déformé** : citation tronquée,
  reformulée en plus favorable, sortie de son contexte. Signalez une
  *hallucination* (chapitre 5) : la pièce dit plus que ce que la source
  autorise.
- **Vous ne retrouvez rien** : la pièce est inventée. C'est l'hallucination
  franche ; le verdict qui s'y appuie doit être corrigé.

Une citation qui « sonne trop bien » est un signal, pas une preuve : c'est
souvent le symptôme d'une reformulation flatteuse. Retournez toujours au texte.

## 4. Instruire un renvoi au cartographe

Instruire un renvoi, c'est reprendre le raisonnement là où le Pédagogue l'a
laissé. La démarche :

1. **Relire le raisonnement du moteur.** Le verdict de renvoi s'accompagne d'un
   motif : la présomption d'absence, les attaques a–h qui ont été portées, la
   conclusion adversariale. Repérez *quelle* attaque a fait hésiter le moteur
   (par exemple *a — insuffisance probatoire*, ou *g — mouvement-vers*).
2. **Chercher le contexte manquant.** Souvent, le renvoi tient à ce que le
   moteur ne pouvait pas savoir : une trace qui paraît mince prend son sens
   dans le contexte de la journée, ou une intention (« mouvement-vers ») s'est
   en réalité concrétisée plus loin dans la feuille.
3. **Trancher, puis motiver.** Décidez entre « présence établie » et « présence
   non établie », et corrigez le verdict (chapitre 5) en écrivant un *Motif*
   qui reprend l'argument. Ne laissez jamais un renvoi tranché sans motif : la
   motivation est ce qui rend votre décision relisable.

## 5. Contrôler les courts-circuits

Un court-circuit porte toujours la même raison : « aucune pièce extraite par le
Greffier ». Il faut le lire comme une *question*, pas comme un verdict d'absence.
Rappelez-vous les trois interprétations possibles (chapitre 2) :

- **Rien vécu** — la compétence n'a pas été mobilisée ce jour-là. Le
  court-circuit est justifié ; ne faites rien.
- **Rien écrit** — la compétence a été vécue mais pas racontée. Ce n'est pas au
  moteur d'y remédier ; c'est éventuellement une remarque à passer à l'apprenant
  pour ses prochaines feuilles.
- **Mal extrait** — la compétence est bel et bien racontée, mais le Greffier ne
  l'a pas relevée. C'est un *oubli* (faux négatif) : signalez-le en annotation
  de type « Oubli signalé », et, sur une cartographie-jour, corrigez le verdict
  si la trace est nette.

Le tri se fait toujours en relisant la feuille source. Quand vous hésitez entre
« rien écrit » et « mal extrait », transformez le doute en question à
l'apprenant plutôt qu'en verdict silencieux.

## 6. Les compteurs d'audit du pôle

Chaque pôle d'une cartographie-jour porte des compteurs d'audit : nombre de
présences établies, de présences non établies et de renvois au cartographe.
Ces proportions dessinent le profil d'une feuille et vous alertent d'un coup
d'œil.

- Un pôle **presque tout en court-circuit / non établi** sur une feuille par
  ailleurs riche : soit la journée n'a pas mobilisé ce pôle, soit le Greffier a
  mal extrait — à vérifier.
- Un pôle **presque tout en présence établie à forte confiance** : sondez-le
  plus qu'un autre, car c'est là qu'une sycophantie se logerait.
- Un **taux de renvoi anormalement élevé** sur un seul pôle : souvent le signe
  que le prompt bute sur ce pôle précis — à noter pour le promptologue
  (chapitre 6).

Ces compteurs sont recalculés automatiquement quand vous corrigez un verdict :
ils restent donc cohérents avec vos corrections, ce qui vous permet de suivre
l'effet de votre relecture.

## 7. Le workflow multimédia

Le portfolio, dans sa première version, est **texte uniquement**. Le moteur ne
« voit » ni les images, ni les audios, ni les vidéos : il ne lit que ce qui est
écrit. Un contenu multimédia référencé mais non décrit n'existe pas à ses yeux
— et ne peut donc porter aucune compétence.

Quand une compétence semble reposer sur un média (une photo d'une réalisation,
un enregistrement d'une prise de parole) que le texte ne décrit pas, la trace
est structurellement invisible. La réponse n'est pas de deviner à la place de
l'apprenant, mais de lui **demander une description textuelle** du contenu, via
une annotation de type « Commentaire » sur la compétence concernée. Une fois la
feuille enrichie de cette description et re-cartographiée, la trace devient
lisible. Tracez cette demande : elle explique pourquoi un verdict a bougé entre
deux versions.

## 8. Tenir un registre de relecture

Une relecture qui ne laisse pas de trace ne se garantit pas sereinement. Tenez,
pour chaque cartographie, un registre de ce que vous avez fait : quels renvois
instruits, quels extraits vérifiés contre la source, quels sondages effectués,
quelles corrections motivées. Ce registre a deux usages : il alimente vos
annotations et vos motifs de correction (chapitre 5), et il constitue la liste
de contrôle que vous passerez en revue *avant* de cliquer sur « Valider et
garantir ». Relire, c'est aussi savoir ce qu'on a relu.
