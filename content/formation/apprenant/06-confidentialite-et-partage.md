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
un employeur ne voit une cartographie que si vous lui en donnez le lien et le
mot de passe. Ce chapitre vous donne les clés pour décider, en connaissance de
cause, où vivent vos données, qui y accède, et comment tout récupérer ou tout
effacer en un clic.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - expliquer où sont stockées vos données selon vos choix (navigateur seul ou serveur en opt-in) ;
> - régler la confidentialité de chaque cartographie : privée, partagée avec votre cartographe, ou publique-partageable ;
> - créer, limiter dans le temps et révoquer un lien de partage employeur protégé par mot de passe ;
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
- **Publique (partageable)** — l'état requis pour créer un lien de partage
  employeur.

Ce réglage est **individuel** — un choix par cartographie, jamais global ni
implicite — et **réversible** à tout moment. Changer la confidentialité ne
publie rien en soi : c'est un préalable, pas une diffusion.

## 3. Le stockage serveur en option

Par défaut, une cartographie ne quitte pas votre navigateur. Pour la partager
par lien, ou la retrouver depuis un autre appareil, il faut d'abord en déposer
une **copie sur le serveur** — un choix explicite.

Dans « Mes cartographies », le bouton **« Copier sur le serveur »** ouvre un
encart qui rappelle l'engagement RGPD : seule *la cartographie* (jamais votre
portfolio) est copiée, uniquement pour permettre le partage et l'accès
multi-appareils, et vous pouvez la retirer à tout moment. Vous confirmez avec
**« Je confirme la copie sur le serveur »**. La cartographie porte alors un
badge **« copie serveur »**.

Quand une copie serveur est utile :

- vous changez d'appareil et voulez retrouver vos cartographies ;
- vous travaillez avec un cartographe distant ;
- vous voulez partager la carte avec un employeur (le partage exige la copie
  serveur).

Pour l'annuler : **« Retirer du serveur »**. La copie serveur est supprimée
et **tous les liens de partage associés sont purgés** du même geste.

## 4. Le partage avec un employeur

Une fois une cartographie **copiée sur le serveur**, le bouton **« Partager »**
ouvre le dialogue de partage. Le principe (cahier des charges §3.6, §6.4) : une
décision explicite, individuelle, révocable.

Pour créer un lien :

1. Choisissez un **mot de passe** pour le lien — **8 caractères minimum**.
2. Fixez une **expiration** en jours (par défaut 90 ; entre 1 et 365).
3. Cliquez **« Créer le lien de partage »**.

Le lien complet (de la forme `…#/partage/<jeton>`) n'est **affiché qu'une seule
fois**, à la création : copiez-le immédiatement (bouton « Copier le lien »). Le
jeton est stocké *haché* côté serveur ; ni le serveur ni la liste des liens ne
peuvent le réafficher ensuite. **Transmettez le mot de passe par un autre canal
que le lien** (ne les envoyez pas dans le même message).

Le lien ouvre la cartographie **en lecture seule**, protégée par ce mot de
passe. La section « Liens actifs » récapitule vos liens (date de création, date
d'expiration) et permet de **« Révoquer »** l'un d'eux à tout moment : le lien
cesse alors de fonctionner, immédiatement.

Enfin, si votre cartographe a relu et validé la version partagée, celle-ci porte
une **mention de garantie** : l'employeur voit qu'un humain répond de la carte,
et pas seulement un moteur.

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
référentiel et les prompts utilisés, et reste lisible hors ligne. C'est votre
format de **portabilité** — vous emportez tout, dans un format ouvert.

**Importer.** **« Importer une archive »** restaure vos portfolios et
cartographies dans les stores locaux (les doublons sont ignorés). L'import ne
crée **jamais** de copie serveur implicite : ce qui était local le reste.

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
