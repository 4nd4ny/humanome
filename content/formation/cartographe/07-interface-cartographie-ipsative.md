---
parcours: cartographe
chapitre: 7
titre: "Relire dans l'interface de cartographie"
statut: complet
---

# Relire dans l'interface de cartographie

La relecture qui engage votre signature se fait dans votre espace cartographe
(`#/cartographe/relecture/<id>`, chapitres 3 et 5). L'interface de
[cartographie](#/cartographie) est l'outil de l'entretien et de l'enquête :
l'apprenant y ouvre sa cartographie sur son appareil, ou vous remet lui-même
ses fichiers, que vous ouvrez dans **votre** navigateur sans rien envoyer au
serveur. On y remonte de chaque secteur aux traces, aux verdicts et au texte
du portfolio. La démonstration (59 journées publiques) permet de s'y exercer.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - ouvrir les fichiers d'un apprenant sans qu'ils quittent votre navigateur, puis les effacer ;
> - lire le rapport d'import et arbitrer des analyses concurrentes ;
> - remonter d'un secteur à ses traces, à ses verdicts et au texte du portfolio ;
> - comparer deux analyses d'un même portfolio ;
> - lire les réponses de l'apprenant comme des points d'entretien.

## Ce dont vous avez besoin, en tant que cartographe

1. **La provenance de chaque observation** : quelle journée, quelle analyse,
   quel verdict, avec quelle confiance — qui n'est jamais un niveau de
   maîtrise.
2. **Les anomalies d'import**, signalées et jamais résolues en silence.
3. **L'arbitrage des analyses concurrentes** : deux analyses d'une même
   journée ne s'additionnent jamais.
4. **La vérification contre la source** : l'extrait retenu figure-t-il dans
   le portfolio, et à la bonne date ?
5. **La réponse de l'apprenant** à chaque observation, pour préparer
   l'entretien.

## Ouvrir les fichiers d'un apprenant, puis les effacer

Sur `#/cartographie`, déposez les fichiers que l'apprenant vous a remis (ou
« Choisir des fichiers », « Choisir un dossier ») : son archive exportée
(JSON), ses analyses Aurora ou AuroraCore, ses cartographies fusionnées, son
portfolio (`.md`). Ils sont lus dans votre navigateur et rangés dans un jeu de
données à part ; rien n'est envoyé. Son archive complète contient aussi ses
réponses, ses notes privées et son carnet de dialogue : c'est à lui de choisir
ce qu'il vous remet.

À la fin de l'entretien, effacez ce jeu : espace **Gestionnaire**, section
« Jeux de données », bouton **« Supprimer « … » de ce navigateur »**, puis
« Confirmer : tout supprimer ».

## Le rapport d'import

Chaque import produit un rapport en quatre gravités : **bloquant** (fichier
écarté), **à arbitrer** (par exemple deux analyses d'une même journée),
**avertissement**, **information**. Le filtre « À traiter » réunit les deux
premières ; une pastille sur l'onglet **Gestionnaire** signale ce qui reste à
traiter, et « Voir le rapport du dernier import » le rouvre.

## Arbitrer les analyses concurrentes

Quand plusieurs analyses existent pour une même journée, le Gestionnaire les
présente sous « journées à arbitrer », chacune avec sa provenance (source,
run, modèle, prompt, date d'analyse, nombre de verdicts). Choisissez celle qui
contribue, ou « À examiner » : la journée ne contribue alors à rien. Dans votre
navigateur, ce choix ne sert qu'à l'enquête ; celui qui compte est celui de
l'apprenant, dans le sien.

## Remonter d'un secteur au texte

Choisissez un secteur : le panneau de détail donne sa part du soleil, sa
confiance moyenne, ses preuves et ses indices, puis, **journée par journée**,
le verdict (statut, confiance, motif, prescription), l'examen adversarial du
Pédagogue et les pièces du Greffier — pour une analyse AuroraCore, les six
éclairages, le président de séance et la délibération complète. La touche
**w** (« Pourquoi cette surface ? ») détaille les points de chaque trace et
les formules. La case **mode expert** affiche les réglages de l'encodage
(poids d'un indice, épaisseur minimale d'un secteur).

Pour examiner un pôle seul, double-cliquez sur son arc dans l'anneau intérieur
(au clavier : « o ») : ses compétences occupent tout le cercle, chacune selon
sa part des points du pôle, codes écrits, hauteurs inchangées ; « Pourquoi
cette surface ? » donne alors aussi cette part. Le centre (↩) ou Échap
ramène à tous les pôles.

Pour vérifier contre la source, **« Ouvrir dans le portfolio »** :

- **surligné en jaune** : retrouvé tel quel, du début à la fin ;
- **surligné en orange** : un seul bout retrouvé ;
- **« retrouvé tel quel dans la feuille du … »** : la trace est datée d'un
  autre jour que son passage, un décalage de date dans l'analyse ;
- **encadré en pointillés, « Passage approché »** : l'analyse a reformulé
  l'extrait, et les phrases d'où viennent au moins trois quarts de ses mots
  sont encadrées. Une reformulation peut glisser vers ce que le texte ne dit
  pas : c'est précisément à vous de le vérifier ;
- **non retrouvé** : le lecteur le dit et cite l'extrait du jury. C'est un
  point à instruire (chapitre 3, « Vérifier contre la source »).

## Comparer deux analyses d'un même portfolio

Dans l'espace **Comparaison**, chaque côté peut être une sélection, un ensemble
nommé, une période ou une **analyse** : deux analyses du même portfolio (deux
prompts, deux modèles) se lisent côte à côte en huit vues — deux soleils,
superposition, radar des pôles, tableau, communes / seulement A / B, journées
par pôle, concentration, ce qui a changé. Rien n'y est classé, et un
avertissement signale deux côtés de tailles différentes. Pour la consistance
sur plusieurs runs, gardez l'outil dédié (chapitre 6).

## Les réponses de l'apprenant

Si l'apprenant vous a remis son archive, ses réponses y sont : sous chaque
observation, « Confirmée », « Nuancée » ou « Contestée », avec sa note s'il en
a laissé une. Elles ne changent pas le soleil : ce sont des points
d'entretien, pas des corrections. Corriger et proposer une révision restent
les gestes de votre espace cartographe (chapitre 5) ; garantir une version
partagée se fait ici, à la demande de l'apprenant (ci-dessous).

## Publier une version garantie, à la demande de l'apprenant

Quand l'apprenant vous le demande, c'est vous qui publiez sa version
partagée, et vous vous en portez garant. Il crée pour cela un **code de
demande** dans son espace Partage et vous le remet (il sert une seule fois,
pendant 30 jours).

1. Ouvrez sa cartographie dans votre interface : le jeu de données que vous
   avez relu avec lui. Si vous l'avez relue (et corrigée) dans votre espace
   cartographe, le bouton **« Ouvrir dans l'interface de cartographie »**, en
   tête de la page de relecture, l'y ouvre directement, à l'espace Partage :
   la cartographie d'origine, ou la révision que vous consultez.
2. Espace **Partage**, « Publier pour une personne, avec votre garantie » :
   saisissez le code. Vérifiez le nom de la personne et le jeu de données
   ouvert.
3. Composez la version comme il le ferait : compétences, précision des
   dates, extraits. Ne gardez que ce que vous avez vérifié ; relisez noms et
   confidences de tiers.
4. Dans l'aperçu — exactement ce que verra le destinataire — figure votre
   garantie. Cochez-la : vous attestez avoir vérifié ce que la personne a
   fait, ce que l'analyse par IA a détecté et ce qu'en a vu le groupe classe
   qui travaille avec elle sur un projet commun. Puis publiez.

La version arrive dans son compte, privée et sans lien : c'est elle qui
décide de la partager, et vous n'y avez plus accès. Votre nom et la date y
figurent. Le jeu de données que vous avez ouvert reste, lui, une copie de sa
cartographie dans **votre** navigateur : l'interface vous propose aussitôt de
l'effacer (« Effacer « … » de ce navigateur ») — faites-le, sauf si vous en
avez encore besoin pour la relecture. Si elle la remplace un jour par une version qu'elle publie
elle-même, votre garantie en est retirée : elle ne couvre que ce que vous
avez publié. Supprimer votre compte la retire aussi.

## Méthode suggérée

1. Ouvrez le **rapport d'import** : les « à arbitrer » d'abord, puis les
   avertissements.
2. Parcourez les secteurs **hachurés** (renvois au cartographe) : chacun
   attend une instruction en entretien.
3. Sur chaque observation douteuse : secteur → trace → « Ouvrir dans le
   portfolio » → lire → noter la question à poser. Puis consignez votre
   décision dans votre espace cartographe.

Rien de ce que vous faites ici n'est visible par d'autres : ni l'apprenant, ni
un employeur ne voient votre navigateur — sauf la version que vous publiez, à
sa demande, dans le compte de l'apprenant.
