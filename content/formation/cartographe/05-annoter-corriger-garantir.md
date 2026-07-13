---
parcours: cartographe
chapitre: 5
titre: "Annoter, corriger, garantir"
statut: complet
---

# Annoter, corriger, garantir

L'espace cartographe met trois gestes à votre disposition, d'engagement
croissant. L'annotation attache un commentaire à une compétence — question à
l'apprenant, signalement d'hallucination ou d'oubli — sans rien modifier. La
correction propose une modification du document de cartographie lui-même,
contrôlée par le schéma de données et conservée dans un historique de
révisions : rien ne s'écrase, tout se trace. La garantie, enfin, fige une
version et y appose votre signature horodatée ; c'est elle que le lien de
partage employeur affichera avec la mention « garantie par ». Ce chapitre
apprend à doser ces trois gestes : annoter souvent, corriger avec retenue,
garantir en connaissance de cause.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - rédiger une annotation utile : adressée, située (compétence, pièce, verdict), actionnable ;
> - proposer une correction conforme au schéma et motivée, sans réécrire le travail du moteur au-delà du nécessaire ;
> - décider quand garantir, quand demander une nouvelle itération, et quand refuser ;
> - expliquer ce qui se passe si une erreur est découverte après garantie.

## 1. Annoter

L'annotation est le geste le plus léger : elle attache un commentaire à une
compétence, sans rien changer au document. C'est votre outil de premier recours.

**Par où passer.** Sur `#/cartographe/relecture/<id>`, section « Annoter et
corriger par compétence », choisissez une compétence dans la liste déroulante
*Compétence* (codes et noms du référentiel, par exemple `1.01 — Pensée
Critique & Anti-Hallucination`). Le panneau d'annotation s'ouvre. Choisissez un
*Type*, écrivez votre texte, puis cliquez sur **Annoter**.

Les trois types disponibles sont :

- **Commentaire** — une question à l'apprenant, une remarque, une demande de
  précision (par exemple la description textuelle d'un média, chapitre 3, §7).
- **Hallucination signalée** — la pièce citée dit plus que la source, ou n'y
  figure pas.
- **Oubli signalé** — une trace réelle du portfolio n'a pas été extraite (faux
  négatif, court-circuit abusif).

Deux points de sobriété. D'abord, une annotation est **horodatée et signée de
votre nom**, et son auteur peut la supprimer (bouton **Supprimer** en face de
ses propres annotations). Ensuite — et c'est important pour ne pas surpromettre
— **une annotation ne notifie personne et ne change aucun verdict** : c'est un
commentaire attaché, pas une action automatique. Une bonne annotation est donc
*adressée* (on sait à qui elle parle), *située* (elle vise une compétence, une
pièce, un verdict précis) et *actionnable* (elle dit quoi vérifier ou corriger).

## 2. Corriger

Quand un verdict est faux et que vous pouvez le rectifier, vous passez de
l'annotation à la correction. La correction modifie le document lui-même — mais
de façon encadrée.

**Limite structurante à connaître d'emblée : la correction par verdict ne
s'applique qu'aux cartographies de journée (`cartographie-jour`).** Sur une
cartographie de parcours (merge), l'éditeur de verdict ne s'affiche pas ;
l'interface vous indique alors d'annoter ici puis de corriger les journées
sources. C'est cohérent : un merge est une fusion de journées, on corrige à la
source, pas dans l'agrégat.

**Par où passer.** Compétence sélectionnée, sur une cartographie-jour, le bloc
« Corriger le verdict » apparaît avec quatre champs contrôlés :

- **Statut** — au choix parmi les trois seuls admis : « présence établie »,
  « présence non établie », « renvoi au cartographe ».
- **Confiance (0 à 1)** — votre degré de certitude.
- **Motif** — *obligatoire en pratique* : c'est l'argument qui rend votre
  décision relisable. Reprenez, quand c'est un renvoi instruit, l'attaque qui
  faisait hésiter et la raison qui la lève (chapitre 3, §4).
- **Prescription** — ce que l'apprenant peut faire pour renforcer ou documenter
  la compétence.

Cliquez sur **Enregistrer la correction pour \<code\>**. La correction se met
« en attente » ; vous pouvez en préparer plusieurs, sur plusieurs compétences,
avant de les envoyer ensemble.

La frontière à tenir : **corriger n'est pas réécrire.** Vous rectifiez ce qui
est faux ou incomplet, en motivant chaque geste. Vous ne refaites pas la
cartographie du moteur à votre goût. Un cartographe qui corrige la moitié des
verdicts d'une feuille ne relit plus — il regénère à la main, et perd la trace
de ce que le moteur avait produit.

## 3. Proposer une révision et lire l'historique

Les corrections en attente composent une **révision** : une nouvelle version
complète du document, validée au schéma avant tout envoi.

**Par où passer.** Section « Proposer une révision », vos corrections en attente
sont listées (`<code> → statut (confiance N %)`, avec un bouton **Retirer** par
ligne). Renseignez la *Note de révision* — une phrase disant ce que corrige
cette révision et pourquoi — puis cliquez sur **Proposer la révision**.

Avant l'envoi, le document révisé est **validé par le moteur contre le schéma
`cartographie-jour`**. S'il ne passe pas, la révision n'est pas envoyée et les
erreurs de schéma s'affichent : c'est une garantie d'intégrité, pas une brimade.
Une fois envoyée, la révision apparaît dans la section « Historique des
révisions ».

Ce mécanisme repose sur un principe : **rien ne s'écrase, tout se trace.** Le
document d'origine du moteur est conservé ; chaque révision est datée, signée,
accompagnée de sa note. Vous pouvez revoir n'importe quelle révision (bouton
**Voir**) et revenir au document d'origine (« Revenir au document d'origine »).
L'apprenant, de son côté, voit le cheminement de sa cartographie corrigée : la
transparence est le prix, et la vertu, de la correction.

## 4. Décider de garantir

La garantie ne se décide qu'au bout d'une liste de contrôle. Avant de cliquer,
vérifiez que :

- **tous les renvois au cartographe ont été instruits** et tranchés avec motif ;
- **les verdicts à faible confiance ont été revus** ;
- **un sondage des présences établies** a été fait, extraits vérifiés contre la
  source (chapitre 3) ;
- **les corrections nécessaires ont été proposées et motivées.**

Si un seul de ces points reste ouvert, **ne garantissez pas.** Trois issues
alors : annoter et **demander une précision** à l'apprenant (média à décrire,
contexte à éclairer) ; attendre une **nouvelle itération** (feuille enrichie,
re-cartographiée) ; ou, si un doute de fond subsiste, **refuser** et laisser la
cartographie « À relire ». Refuser de garantir n'est pas un échec : c'est le
sens même du rôle. Formulez ce refus à l'apprenant simplement, en pointant le
point précis qui bloque.

## 5. La portée de la signature

**Par où passer.** Section « Garantie », cliquez sur **Valider et garantir**.
Un encadré de confirmation rappelle que vous garantissez *en votre nom*, avec
signature horodatée, et précise quelle version sera figée (« La révision *N*
sera figée : c'est elle que verra l'employeur via le lien de partage », ou le
document d'origine s'il n'y a pas de révision). Cliquez sur **Confirmer et
garantir** (ou **Annuler**).

Ce que vous attestez exactement : la **relecture**, pas la personne. La
signature dit « un humain identifié a relu cette version à cette date », et
c'est cette version-là — figée — que l'employeur consultera, avec la mention
« Cartographie garantie par *votre nom* le *date* (révision *N* figée) ». Elle
ne dit pas que l'apprenant « vaut » un score, ni que sa cartographie est
exhaustive (chapitre 1, §4).

## 6. Après la garantie

Une garantie n'est pas gravée dans le marbre. Plusieurs situations appellent une
nouvelle version garantie :

- **Une erreur est découverte après coup.** Cliquez sur **Retirer ma garantie**,
  corrigez (nouvelle révision), puis re-garantissez la version corrigée. Il vaut
  toujours mieux retirer et re-signer que laisser courir une erreur signée.
- **De nouvelles feuilles arrivent.** L'apprenant a enrichi son portfolio ; la
  cartographie évolue. Relisez le delta et garantissez la nouvelle version si
  elle le mérite.
- **La version de référentiel change.** L'épistémiarque a fait évoluer le
  référentiel des 61 compétences ; une cartographie garantie contre l'ancienne
  version peut demander une nouvelle relecture contre la nouvelle.

Dans tous les cas, l'historique conserve la trace de l'ancienne version : rien
ne se perd, et la chaîne des garanties reste relisable. C'est cette traçabilité
qui rend la garantie crédible. Le chapitre suivant vous donne deux outils —
comparaison et consistance — pour armer votre jugement avant de garantir.
