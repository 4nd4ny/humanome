---
parcours: etablissement
chapitre: 5
titre: "Lire les cartographies, exporter, effacer"
statut: complet
---

# Lire les cartographies, exporter, effacer

Une fois les runs terminés, vient le temps de la lecture : consulter, membre par
membre, les cartographies que la cohorte a produites. C'est ici que le cadre posé
au chapitre 1 se vérifie concrètement — vous lisez, en **lecture seule**, ce que le
consentement de chaque apprenant vous autorise à voir, et rien d'autre. Ce chapitre
explique comment ouvrir les documents d'un membre, comment la fusion chronologique
est reconstruite dans votre navigateur, puis clarifie un point important et
souvent mal compris : dans humanome, l'**export** et l'**effacement** des
cartographies sont, par conception, des droits de l'apprenant, pas des fonctions de
l'établissement. Nous décrivons donc précisément ce que vous pouvez faire, ce que
seul l'apprenant peut faire, et pourquoi ce partage protège tout le monde.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - ouvrir les documents d'un membre et naviguer entre vue fusionnée et vue journée ;
> - comprendre que la fusion est recalculée côté client, en lecture seule ;
> - situer où vit l'export dans humanome (côté apprenant) et pourquoi l'espace établissement n'en propose pas ;
> - distinguer les leviers d'effacement : quitter la cohorte, supprimer un compte, supprimer une cohorte.

## 1. Ouvrir les documents d'un membre

Depuis la page de la cohorte (**#/etablissement/cohorte/&lt;id&gt;**), le tableau
« Membres » propose pour chacun un bouton **« Documents »** qui mène à
**#/etablissement/membre/&lt;userId&gt;**. La page s'ouvre sur un rappel du cadre :
« Ces cartographies sont visibles par votre établissement parce que ce membre a
rejoint une de vos cohortes avec son consentement explicite — seuls les documents
produits dans ce cadre apparaissent ici. » Si aucun run n'a encore produit de
document pour ce membre, la page vous invite à en lancer un depuis la cohorte.

## 2. Vue fusionnée et vue journée

En haut de la page, une barre de navigation propose :

- **« Vue fusionnée (N journée(s)) »** — la cartographie chronologique de
  l'apprenant, le sunburst qui agrège toutes ses journées cartographiées. C'est la
  vue par défaut ;
- un bouton **« Journée … »** par jour cartographié — pour examiner une seule
  journée en détail.

Passez de l'une à l'autre librement : la vue fusionnée donne le portrait
d'ensemble, la vue journée montre ce qu'une date précise a apporté. Les deux sont
strictement en **lecture seule** : vous consultez, vous n'éditez ni ne validez
rien (la validation des cartographies relève du rôle cartographe, pas de
l'établissement).

## 3. La fusion est recalculée dans votre navigateur

Un point d'architecture qui a des conséquences pratiques : le serveur ne stocke que
les **documents journaliers** extraits par les runs. La **fusion** chronologique —
l'assemblage des journées en un seul sunburst évolutif — n'est pas produite ni
stockée côté serveur. Elle est **recalculée à la volée dans votre navigateur** par
le moteur d'humanome, chaque fois que vous ouvrez la page d'un membre, à partir des
documents journaliers et du référentiel.

Cela signifie deux choses. D'abord, la fusion que vous voyez est déterministe et
reproductible : elle ne dépend pas d'un calcul serveur figé. Ensuite, aucune
version « fusionnée » de la cartographie ne circule ni ne s'accumule sur le
serveur : c'est cohérent avec la journalisation minimale et la sobriété de
stockage du projet.

## 4. Exporter : un droit de l'apprenant, par conception

Vous remarquerez que l'espace établissement **ne propose pas de bouton
« Exporter »** sur la page d'un membre. Ce n'est pas un oubli : c'est une décision
de conception.

Dans humanome, l'export local systématique est pensé comme un **droit de la
personne cartographiée**. C'est l'apprenant qui, depuis son propre espace, exporte
ses portfolios et ses cartographies et garde la maîtrise de ses données. L'accès de
l'établissement, lui, est délibérément un accès de **consultation** : vous lisez
les cartographies produites dans le cadre consenti, vous ne constituez pas un
entrepôt exportable de données d'élèves.

Si votre établissement a besoin d'une trace d'une cartographie (dossier de suivi,
livret de compétences), la voie respectueuse du cadre est de la demander à
l'apprenant, qui dispose de l'export dans son espace, plutôt que d'attendre une
extraction de masse côté établissement. Cette orientation n'est pas un manque de
fonctionnalité : elle est la traduction concrète du principe « la donnée appartient
à la personne ».

## 5. Effacer : trois leviers, trois responsables

L'effacement se répartit lui aussi selon qui détient le droit. Décrivons chaque
levier tel qu'il existe réellement dans l'interface, sans sur-promettre sur ses
effets serveur.

### L'apprenant quitte la cohorte

Depuis son espace « Mes cohortes » (**#/espace/cohortes**), l'apprenant peut à tout
moment **« Quitter la cohorte »** (confirmation en deux temps). Cela **retire son
consentement pour la suite** : il ne sera plus inclus dans les prochains runs. Les
cartographies **déjà produites** dans ce cadre lui restent acquises. C'est le
levier de retrait volontaire, entre les mains de l'apprenant.

### L'apprenant supprime son compte

La suppression de compte est le levier RGPD le plus fort, et il appartient à
l'apprenant : elle purge ses données, y compris les portfolios qu'il avait déposés
dans des cohortes. Là encore, c'est la personne cartographiée qui décide.

### L'établissement supprime une cohorte

De votre côté, le levier disponible est la **suppression d'une cohorte** depuis
l'accueil (**#/etablissement**, tableau « Mes cohortes », bouton « Supprimer » avec
confirmation en deux temps). Utilisez-la quand une cohorte n'a plus lieu d'être.
Décrivons ce geste pour ce qu'il est — une action d'administration de votre espace —
sans vous promettre par écrit le détail exact de ce qu'elle purge côté serveur :
en cas de besoin précis (par exemple une demande d'effacement individuelle d'un
apprenant que vous relayez), appuyez-vous sur les leviers de l'apprenant lui-même,
qui sont les garants directs de ses droits.

## 6. Récapitulatif du partage des droits

- **Lire** les cartographies produites dans vos cohortes : établissement, en
  lecture seule.
- **Exporter** ses cartographies et portfolios : apprenant, depuis son espace.
- **Retirer son consentement** pour la suite : apprenant, en quittant la cohorte.
- **Purger ses données personnelles** : apprenant, en supprimant son compte.
- **Administrer les contenants** (créer, supprimer une cohorte) : établissement.

Ce partage n'est pas un partage de méfiance : c'est ce qui permet à un établissement
de cartographier des classes entières tout en pouvant dire, en toute honnêteté, à
ses apprenants et à leurs familles : vos données restent les vôtres. Vous avez
maintenant parcouru l'ensemble du rôle établissement, du cadre RGPD (chapitre 1) à
la lecture des résultats. Pour revenir sur un point, chaque chapitre reste
accessible depuis le hub des guides (**#/guides**).
