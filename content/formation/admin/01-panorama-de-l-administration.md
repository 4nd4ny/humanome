---
parcours: admin
chapitre: 1
titre: "Panorama de l'administration"
statut: complet
---

# Panorama de l'administration

L'administration de humanome.xyz tient dans un seul espace : `#/admin`. C'est un
poste de pilotage volontairement étroit — quatre sections, pas une de plus — parce
que l'essentiel de la plateforme n'a pas besoin d'un administrateur pour tourner.
Le rôle `admin` ne gère ni les portfolios, ni les cartographies, ni le référentiel :
ces objets appartiennent respectivement aux apprenants, aux cartographes et aux
épistémiarques, et l'administrateur n'a aucun droit de regard dessus. Ce que
l'administrateur gère, c'est le **cadre** : qui porte quel rôle, quel prompt fait
autorité, ce que la démonstration publique coûte, et quelles variables serveur sont
en vigueur. Ce chapitre parcourt les quatre sections de `#/admin` une à une, en
indiquant pour chacune le vrai chemin, les vrais libellés de boutons et les garde-fous
qui vous empêchent de vous tirer une balle dans le pied.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - accéder à l'espace `#/admin` et reconnaître ce qu'il fait — et ne fait pas ;
> - attribuer et retirer des rôles en connaissant l'anti-verrouillage qui protège votre propre accès ;
> - comprendre ce qu'est le Golden Prompt, pourquoi il est privé, et comment autoriser un promptologue à le consulter ;
> - piloter la démo publique depuis un smartphone (interrupteur, modèle, plafonds) avec effet immédiat ;
> - lire la configuration serveur versionnable sans jamais exposer un secret.

## 1. Entrer dans l'espace d'administration

Le rôle `admin` s'obtient auprès d'Harmonia Éducation : il n'est pas attribuable
depuis un formulaire d'inscription. Une fois connecté avec un compte qui le porte,
rendez-vous à l'adresse `#/admin`. La page vérifie votre session au montage (elle
interroge `GET api/auth/me`), puis affiche l'accueil : quatre grandes cartes
cliquables, une par section.

Si vous ouvrez `#/admin` sans le rôle, vous ne verrez pas les sections mais un
message : « Cet espace est réservé à l'administration de la plateforme. » C'est
volontaire — la garde de rôle est faite côté serveur à **chaque** requête, jamais
seulement dans l'affichage.

Deux situations particulières à connaître :

- **Copie statique du site.** L'administration a besoin de l'API vivante (session,
  comptes, réglages). Sur une copie statique — par exemple une sauvegarde ouverte
  hors ligne — la page affiche « Copie statique du site : l'administration a besoin
  de l'API » et vous renvoie vers le site en ligne. Rien n'est cassé : il n'y a
  simplement pas de serveur à piloter.
- **Les rôles sont relus en base à chaque requête.** Si un autre administrateur
  vous accorde ou vous retire le rôle `admin`, l'effet est immédiat : aucune
  reconnexion n'est nécessaire.

Les quatre sections sont accessibles soit depuis les cartes d'accueil, soit
directement par leur route : `#/admin/roles`, `#/admin/golden`, `#/admin/reglages`,
`#/admin/config`. Une barre d'onglets (repliable sur écran étroit, cibles tactiles
généreuses) reste visible en haut de chaque section, avec un lien « Accueil » pour
revenir en un geste.

## 2. Rôles — comptes et attribution

Chemin : `#/admin/roles`, ou la carte « Rôles » depuis l'accueil.

Cette section liste les comptes de la plateforme et laisse attribuer ou retirer les
rôles du référentiel humanome. Les rôles attribuables sont : `apprenant`,
`cartographe`, `promptologue`, `epistemiarque`, `employeur`, `etablissement` et
`admin`. Le « visiteur » n'est pas un rôle : c'est simplement l'absence de session,
il n'apparaît donc jamais dans la liste.

### Par où passer

1. Dans le champ **« Rechercher un compte (e-mail ou nom) »**, tapez une partie
   du nom ou de l'adresse (par exemple `dupond` ou `@example.org`) et validez avec
   le bouton **« Rechercher »**. La liste se recharge, paginée par vingt comptes.
   Le compteur en tête vous rappelle combien de comptes correspondent.
2. Chaque ligne montre le compte, ses rôles actuels (sous forme de puces), un menu
   d'attribution et la date de création.
3. **Attribuer un rôle** : dans la colonne « Attribuer », choisissez un rôle dans
   le menu déroulant (seuls les rôles que le compte n'a pas encore sont proposés),
   puis cliquez sur **« Attribuer »**. L'opération est idempotente : ré-attribuer un
   rôle déjà présent ne change rien.
4. **Retirer un rôle** : cliquez sur la petite croix (✕) accolée à la puce du rôle.
   Là aussi, retirer un rôle absent est sans effet.

### L'anti-verrouillage : le garde-fou à connaître

La règle capitale de cette section : **vous ne pouvez pas retirer votre propre rôle
`admin`**. Sur votre ligne, à la place de la croix de retrait du rôle `admin`, un
cadenas (🔒) s'affiche avec l'explication au survol. Le serveur applique la même
règle : une tentative de retrait renvoie une erreur (409). La plateforme garde ainsi
toujours au moins un administrateur — l'administrateur qui agit.

Ce que l'anti-verrouillage n'interdit **pas** :

- retirer le rôle `admin` d'un *autre* compte (à condition qu'il en reste au moins
  un, vous) ;
- retirer un de vos *autres* rôles (par exemple si vous portiez aussi `apprenant`).

### Ce qui est journalisé

Chaque attribution ou retrait laisse une trace d'audit minimale (`role_granted` /
`role_revoked`) : l'identifiant du compte cible et le nom du rôle — jamais l'e-mail,
jamais de contenu. Cette discipline de journalisation est détaillée au chapitre
[02-exploitation-et-rgpd.md](02-exploitation-et-rgpd.md).

## 3. Golden Prompt — privé par défaut

Chemin : `#/admin/golden`, ou la carte « Golden Prompt » depuis l'accueil.

Le **Golden Prompt** est la version « haut de gamme » du prompt de cartographie :
longuement travaillée, elle est gardée **privée** jusqu'à constitution du capital
de la Fondation (cahier §7). Concrètement, c'est un paquet de prompts comme les
autres, mais marqué privé — et cette confidentialité a des conséquences fortes.

### Importé hors du dépôt, invisible partout ailleurs

Le contenu d'un Golden Prompt ne vit **que** dans la base de données : il n'est
jamais écrit dans le dépôt Git. C'est pourquoi vous l'importez à la main, en collant
son document, plutôt que de le versionner comme un prompt ordinaire.

Un Golden Prompt est **structurellement invisible** aux chemins publics : il n'est
pas listé, jamais servi comme prompt par défaut, ne peut pas être dérivé par un
promptologue ni lancé en cartographie de masse. Ce n'est pas une case à cocher
qu'on pourrait oublier : c'est la conséquence du marquage « privé », appliquée
partout à la lecture.

### Par où passer

1. **Importer.** Dans le bloc **« Importer un Golden Prompt (privé) »**, collez le
   document prompt-package (au format JSON) dans la zone de texte, puis cliquez sur
   **« Importer »**. L'import est idempotent par contenu : réimporter le même
   document ne crée pas de doublon (« déjà présent, inchangé »). Une version publiée
   est immuable — réutiliser un couple identifiant/version avec un contenu différent
   est refusé.
2. **Consulter la liste.** Sous le formulaire, « Golden Prompts en base » liste
   chaque Golden importé avec ses versions et la liste des promptologues autorisés.
3. **Autoriser un promptologue.** Sous chaque Golden, le champ **« Autoriser un
   promptologue (identifiant de compte) »** attend l'identifiant numérique d'un
   compte, puis le bouton **« Autoriser »** enregistre l'accès. Le compte cible doit
   déjà porter le rôle `promptologue` (sinon l'opération est refusée). Vous trouvez
   l'identifiant d'un compte dans la section Rôles.

L'autorisation se fait donc **au cas par cas**, promptologue par promptologue. Les
faits sont audités (`golden_imported`, `golden_access_granted`), sans jamais
exposer le contenu du prompt.

## 4. Réglages — la démo publique et le prompt par défaut

Chemin : `#/admin/reglages`, ou la carte « Réglages » depuis l'accueil.

Cette section rassemble trois choses : le grand interrupteur de la démo publique et
ses plafonds, la validation du prompt par défaut, et un tableau de bord du worker
de cartographie de masse.

### La démo publique — un geste, effet immédiat

En tête de section, un **grand interrupteur** allume ou éteint la démonstration
publique. Il est pensé pour le geste du smartphone : allumer la démo juste avant une
présentation, l'éteindre en partant. Un seul clic suffit, et l'effet est
**immédiat** — sans redéploiement — sur les requêtes LLM publiques (`POST /api/llm`).
L'interrupteur indique clairement son état : « Démo publique : activée » ou
« désactivée ».

Sous l'interrupteur, un formulaire règle le **modèle** et les **plafonds** de la
démo. Chaque champ affiche sa valeur effective, ses bornes (comme repères), et un
petit badge d'**origine** qui dit d'où vient la valeur : « réglage base » (posé
ici, dans l'admin), « env », « fichier » ou « défaut ». Les champs éditables :

- **Modèle** : à choisir dans une liste blanche Anthropic, ou « autre… » pour saisir
  librement un identifiant de modèle (utile le jour de la sortie d'un nouveau modèle,
  sans redéploiement).
- **Tokens max par requête** (256 – 16000).
- **Budget quotidien (USD)** (0 – 1000) — le coupe-circuit budgétaire de la démo.
- **Requêtes / IP / heure** (1 – 1000).
- **Preuve de travail (bits)** (8 – 24), **Entrée max (caractères)**
  (1000 – 200000), **Délai amont (secondes)** (10 – 300), **Tokens globaux / jour**
  (10000 – 50000000).

Deux boutons en bas du formulaire :

- **« Enregistrer »** applique vos modifications (effet immédiat). C'est le serveur
  qui valide les bornes : une valeur hors limites revient avec un message d'erreur
  précis en français, rien n'est appliqué.
- **« Réinitialiser (revenir aux valeurs env/fichier) »** efface la couche que vous
  avez posée ici et rend la main aux valeurs d'environnement ou de fichier.

Deux points volontairement **non modifiables** depuis l'écran : le **fournisseur**
(la démo utilise la clé plateforme Anthropic) et la **clé API** elle-même. L'écran
n'affiche jamais la clé — seulement « configurée » ou « absente ». La clé vit dans
l'environnement serveur, jamais dans l'interface.

Un filet de sécurité important : si la base est absente ou injoignable, la démo
retombe silencieusement sur les valeurs d'environnement ou de fichier. Cette couche
d'administration ne peut donc jamais faire tomber la démo.

### Version de prompt par défaut

Le prompt de cartographie par défaut se décide à deux mains : un promptologue
**propose** un paquet publié, l'administrateur **valide**. Dans le bloc « Version de
prompt par défaut », choisissez un paquet dans le menu **« Valider un paquet publié
comme défaut »** puis cliquez sur **« Valider comme défaut »**. Une proposition en
attente d'un promptologue s'affiche le cas échéant. Un Golden Prompt (privé) ne peut
jamais devenir le défaut.

### État du worker de cartographie de masse

En bas de section, un tableau donne l'état du worker qui traite les cartographies
de masse (pour les établissements) : jobs en file, runs actifs, dernière activité,
terminés/échoués, et un rappel du budget quotidien de la démo. C'est un tableau de
lecture — le worker se déclenche par ailleurs (voir le chapitre
[02-exploitation-et-rgpd.md](02-exploitation-et-rgpd.md), section sur les
contraintes d'hébergement).

## 5. Configuration serveur — lire sans exposer

Chemin : `#/admin/config`, ou la carte « Configuration serveur » depuis l'accueil.

Cette section affiche, en lecture seule, la configuration serveur versionnable
(lue dans `api/config/app.php`) : les variables d'environnement que l'application
lit, groupées par thème (Application, Base de données, Secrets, LLM / démo). Pour
chaque variable non secrète, sa valeur effective (ou sa valeur par défaut) et une
description. Chaque valeur reste surchargeable par une variable d'environnement
posée hors webroot (`~/app/shared/.env`).

Le principe non négociable : **les secrets ne sont jamais affichés**. Mot de passe
MySQL, clé Anthropic, jetons — l'écran montre seulement leur état, « configuré » ou
« absent », jamais leur valeur. Le Golden Prompt, lui aussi, reste hors du dépôt.
Cette section sert donc surtout à *vérifier* qu'une variable est bien en place, pas
à la modifier : la modification passe par le fichier versionné et un déploiement,
traités au chapitre suivant.

## Ce que l'administration ne fait pas

Il est utile de refermer ce panorama par les limites du rôle, car elles disent
l'esprit de la plateforme :

- L'administrateur **ne lit pas** les portfolios ni les cartographies des apprenants
  (RGPD by design : ces données ne quittent pas le navigateur par défaut).
- Le rôle `admin` **n'est pas un super-rôle** ailleurs dans l'application : il ne
  donne aucun droit implicite dans les espaces cartographe, épistémiarque ou
  établissement. Les quatre sections de `#/admin` sont son unique surface.
- Toute l'exploitation « hors navigateur » — déployer, sauvegarder, restaurer,
  vérifier le RGPD — se pilote par des outils dédiés, pas depuis cet écran. C'est
  l'objet du chapitre [02-exploitation-et-rgpd.md](02-exploitation-et-rgpd.md).
