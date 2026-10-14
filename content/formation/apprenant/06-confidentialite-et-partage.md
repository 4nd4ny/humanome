---
parcours: apprenant
chapitre: 6
titre: "Confidentialité et partage"
statut: complet
---

# Confidentialité et partage

Votre portfolio raconte votre vie : la plateforme est conçue pour qu'il ne
quitte jamais votre navigateur sans votre décision explicite. Par défaut, tout
reste local ; le stockage sur le serveur Harmonia est une option (opt-in) que
vous activez cartographie par cartographie, et que vous pouvez révoquer. Le
partage suit la même logique : rien n'est jamais publié automatiquement, et
un employeur ne voit une version de votre cartographie que si vous lui en
donnez le lien (et, si vous en avez mis un, le mot de passe). Ce chapitre
vous donne les clés pour décider, en connaissance de cause, où vivent vos
données, qui y accède, et comment tout récupérer ou tout effacer en un
clic.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - expliquer où sont stockées vos données selon vos choix (navigateur seul ou serveur en opt-in) ;
> - régler la confidentialité de chaque cartographie : « Privée », « Partagée avec mon cartographe » ou « Partager » ;
> - partager une version choisie de votre cartographie depuis l'interface de cartographie, avec un lien limité dans le temps et révocable ;
> - exporter l'archive complète de votre compte, la réimporter, ou supprimer votre compte avec purge réelle.

## 1. Où vivent vos données

Le principe fondateur de humanome est **RGPD-by-design** : par défaut, vos
données ne quittent pas votre navigateur.

- **Vos portfolios** sont stockés localement (technologie IndexedDB, sous la clé
  « humanome-portfolios ») et **ne sont jamais envoyés au serveur**. La bannière
  du module `#/portfolio` le rappelle explicitement.
- **Vos cartographies** sont elles aussi conservées en local par défaut, en
  visibilité « privée », dès la fin d'un run.
- **Le serveur ne voit jamais votre portfolio**, en aucun cas. Il ne voit que ce
  que vous décidez explicitement de lui confier (une *copie serveur* de
  cartographie, voir §3), et jamais votre journal brut.

Deux exceptions, toutes deux explicites dans l'interface :

- **L'import Google Docs** (module portfolio) : pour cette source uniquement, le
  texte transite par le serveur humanome.xyz afin de contourner une limite
  technique de Google — mais il **n'y est jamais conservé**.
- **L'exécution d'un run en « Service humanome »** : le texte de la journée
  transite par le proxy de la plateforme vers le modèle, sans y être conservé
  (journalisation par compteurs, jamais de contenu). En mode « clé
  personnelle », le texte part directement chez votre fournisseur, sans passer
  par humanome.

## 2. Les trois niveaux de confidentialité

Chaque cartographie porte son propre réglage de **confidentialité**, dans « Mes
cartographies » (espace apprenant). Le menu déroulant offre trois niveaux :

- **Privée** — visible de vous seul. C'est la valeur par défaut de toute
  cartographie produite.
- **Partagée avec mon cartographe** — votre cartographe peut la relire,
  l'annoter, la corriger et la garantir (voir le chapitre 5).
- **Partager** — lisible aussi par votre cartographe ; ce réglage ne crée
  aucun lien : pour montrer votre cartographie à un employeur, partagez-la
  depuis l'interface de cartographie (section 4).

Ce réglage est **individuel** — un choix par cartographie, jamais global ni
implicite — et **réversible** à tout moment. Changer la confidentialité ne
publie rien en soi : c'est un préalable, pas une diffusion.

## 3. Le stockage serveur en option

Par défaut, une cartographie ne quitte pas votre navigateur. Pour la faire
relire par votre cartographe, ou la retrouver depuis un autre appareil, il faut
d'abord en déposer une **copie sur le serveur** — un choix explicite.

Dans « Mes cartographies », le bouton **« Copier sur le serveur »** ouvre un
encart qui rappelle l'engagement RGPD : seule *la cartographie* (jamais votre
portfolio) est copiée, uniquement pour permettre la relecture et l'accès
multi-appareils, et vous pouvez la retirer à tout moment. Vous confirmez avec
**« Je confirme la copie sur le serveur »**. La cartographie porte alors un
badge **« copie serveur »**.

Quand une copie serveur est utile :

- vous changez d'appareil et voulez retrouver vos cartographies ;
- vous travaillez avec un cartographe distant.

Pour l'annuler : **« Retirer du serveur »**. La copie serveur est supprimée
et les liens créés avant le 14 octobre 2026 vers cette cartographie sont
**purgés** du même geste.

## 4. Le partage avec un employeur

Le principe (cahier des charges §3.6, §6.4) : une décision explicite,
individuelle, révocable. Depuis le 14 octobre 2026, on partage une **version
partagée**, composée dans l'**interface de cartographie** (espace
« Partage », avec un compte, réservé aux adultes) — on ne crée plus de lien
vers une cartographie de « Mes cartographies ».

Pour partager une cartographie de votre espace :

1. Dans « Mes cartographies », cliquez **« Partager depuis l'interface »** :
   la cartographie s'ouvre dans l'interface, à l'espace Partage, dans un
   nouveau jeu qui porte son titre (elle ne quitte pas votre navigateur).
2. Attestez avoir 18 ans ou plus (une fois), puis composez la version : son
   titre, les compétences gardées, la précision des dates, les extraits que
   vous choisissez — relus avant la publication.
3. Publiez-la : c'est elle, et elle seule, qui part sur le serveur — jamais
   votre portfolio.
4. Créez un **lien** : expiration en jours (90 par défaut, de 1 à 365), et
   un **mot de passe** si vous le souhaitez (8 caractères minimum). Le lien
   complet n'est **affiché qu'une seule fois** : copiez-le aussitôt. Si vous
   mettez un mot de passe, **transmettez-le par un autre canal que le lien**.

Le lien ouvre la version **en lecture seule**. Vous voyez quand il a été
consulté, vous pouvez le **révoquer** à tout moment, et publier une nouvelle
version **à la place** de l'ancienne : le même lien montre alors la nouvelle.
Le chapitre 7 détaille chaque étape.

Votre cartographe peut aussi **publier lui-même** une version, avec sa
**garantie** : créez un code de demande dans l'espace Partage et
remettez-le-lui. Il publie dans votre compte la version qu'il a vérifiée avec
vous ; l'employeur lit « Relue et garantie par … ». C'est toujours vous qui
décidez de la partager.

Les liens que vous aviez créés **avant** le 14 octobre 2026 restent valables
jusqu'à leur expiration : le bouton **« Liens déjà créés »** de « Mes
cartographies » les liste (un lien échu y apparaît « expiré ») et permet de
les **révoquer**.

## 5. Votre clé API personnelle

Si vous lancez vos runs avec **votre propre clé LLM** (mode « clé personnelle »
de l'assistant de run, chapitre 5) :

- par défaut, la clé peut être **mémorisée dans ce navigateur** (localStorage) —
  case « Mémoriser la clé dans ce navigateur » ;
- elle peut, en option et si vous êtes connecté, être **synchronisée sur le
  serveur de façon chiffrée** — case « Synchroniser sur le serveur (chiffrée) —
  opt-in explicite » ; utile pour la retrouver sur un autre appareil, via
  « Récupérer la clé depuis le serveur » ;
- en mode « clé personnelle », **la clé ne transite jamais par humanome** lors
  des appels : votre navigateur appelle directement le fournisseur.

Bonnes pratiques : n'activez la synchronisation serveur que si vous en avez
besoin ; sur un ordinateur partagé, évitez de mémoriser la clé.

## 6. Exporter, importer, supprimer

**Exporter.** Dans « Mes cartographies », la section **« Mes données »** propose
**« Exporter toutes mes données »**. L'archive produite (un fichier JSON) est
**autoporteuse** : elle contient vos portfolios, vos cartographies, le
référentiel et les prompts utilisés, ainsi que vos jeux de données de
l'interface de cartographie (analyses, réponses au jury, carnet du dialogue ;
la démonstration publique n'y est pas tant que vous n'y avez rien ajouté,
elle se recharge depuis le site), et reste lisible hors ligne. C'est votre format de **portabilité** — vous
emportez tout, dans un format ouvert.

**Importer.** **« Importer une archive »** restaure vos portfolios,
cartographies et jeux de l'interface de cartographie dans les stockages de
votre navigateur (les doublons sont ignorés ; un jeu déjà présent est
complété, sans que l'archive écrase ce que vous y avez changé depuis).
L'import ne crée **jamais** de copie serveur implicite : ce qui était local le
reste.

**Supprimer votre compte.** La suppression se fait depuis votre **espace compte**
(`#/compte`), dans la **« Zone de danger »**. Elle est **immédiate et
définitive** : purge réelle de toutes vos données serveur (profil, rôles,
progression, clés API, partages), consignée par un événement d'audit anonyme
conforme au RGPD. Pour l'éviter par accident, vous devez **ressaisir votre
adresse email** avant que le bouton ne s'active. Vos fichiers locaux déjà
exportés, eux, ne sont pas concernés — pensez à exporter votre archive avant, si
vous voulez en garder une trace.

## 7. Recherche et open data

La plateforme s'inscrit dans une démarche de recherche et d'ouverture, mais dans
un cadre strict :

- ce qui peut être publié se limite à des **statistiques agrégées** (des
  compteurs, des tendances d'ensemble) ;
- **aucun contenu de portfolio, aucune cartographie individuelle** n'est publié
  sans votre **consentement explicite** ;
- la journalisation serveur est minimale par principe : des compteurs, jamais du
  contenu.

Autrement dit, la contribution de vos données à la connaissance collective
reste, comme tout le reste, **votre décision** — jamais un défaut du système.

---

Vous avez parcouru l'ensemble du parcours : de la matière première (votre
portfolio) à la maîtrise de vos données. Le fil conducteur est constant — **le
moteur ne voit que ce que vous écrivez, et vous ne partagez que ce que vous
décidez**. Pour revoir un point, retournez au
[premier chapitre](01-pourquoi-un-portfolio-reflexif.md) ou naviguez dans la
liste des chapitres depuis votre espace apprenant.
