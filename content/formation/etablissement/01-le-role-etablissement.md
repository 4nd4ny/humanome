---
parcours: etablissement
chapitre: 1
titre: "Le rôle établissement : accès B2B et cadre RGPD"
statut: complet
---

# Le rôle établissement : accès B2B et cadre RGPD

Le compte **établissement** est l'accès professionnel (B2B) d'humanome. Là où un
apprenant cartographie ses propres compétences une journée à la fois dans son
navigateur, un établissement de formation cartographie **ses classes en masse** :
il regroupe des apprenants en cohortes, fait tourner l'extraction sur des
centaines de portfolios via une file de jobs côté serveur, sous un budget qu'il
plafonne, et relit les cartographies produites. Ce pouvoir de traitement de masse
n'a de sens que s'il reste tenu par un cadre strict : rien ne se fait sans le
consentement explicite de chaque apprenant, et l'établissement ne voit que ce qui
a été produit dans ce cadre — jamais le reste. Ce premier chapitre pose ce que le
rôle vous autorise à faire, ce qu'il vous interdit, et pourquoi cette frontière
est le cœur de la promesse d'humanome, pas une contrainte ajoutée après coup.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - situer le rôle établissement parmi les rôles d'humanome et savoir comment on l'obtient ;
> - décrire précisément ce que votre établissement peut voir — et ce qu'il ne peut pas voir ;
> - énoncer les cinq garde-fous RGPD qui encadrent la cartographie de masse (consentement, portfolio local par défaut, budget plafonné, journalisation minimale, droits de l'apprenant) ;
> - comprendre comment le cas des mineurs se traite dans le cadre du consentement explicite existant ;
> - repérer les trois écrans de votre espace et le rôle de chacun.

## 1. Un accès professionnel, obtenu auprès d'Harmonia Éducation

Le rôle établissement ne s'attribue pas en cochant une case à l'inscription : il
est accordé à un compte par Harmonia Éducation, dans le cadre d'une relation B2B.
Tant qu'un compte ne porte pas ce rôle, l'espace établissement lui reste fermé :
il affiche à la place un encadré « Cet espace est réservé aux établissements de
formation » qui rappelle en quoi consiste l'accès B2B et renvoie vers Harmonia
Éducation pour l'obtenir.

Concrètement, pour accéder à votre espace :

1. Connectez-vous à votre compte depuis **#/compte**.
2. Rendez-vous sur **#/etablissement**.
3. Si votre compte porte bien le rôle établissement, l'en-tête affiche
   « Connecté en tant que … » et l'accueil de l'espace se charge. Sinon, vous
   verrez l'explication du rôle réservé : contactez Harmonia Éducation pour
   l'activation.

L'espace établissement a besoin de l'API en ligne (session, cohortes, runs de
masse). Sur une copie statique du site, il affiche un message vous invitant à
rejoindre le site en ligne : c'est normal, la cartographie de masse ne peut pas
tourner sans serveur.

## 2. Ce que l'établissement peut voir — et ce qu'il ne voit pas

C'est la question la plus importante, alors répondons-y sans détour.

**Ce que votre établissement PEUT voir :**

- les **cartographies produites dans le cadre de vos cohortes**, c'est-à-dire les
  documents journaliers extraits par les runs de masse que vous avez lancés, pour
  les apprenants qui ont rejoint une de vos cohortes **et** déposé leur portfolio ;
- pour chaque membre, la liste de ses journées cartographiées, la vue fusionnée
  (le sunburst chronologique) et le détail d'une journée — toujours en
  **lecture seule** ;
- l'état d'avancement des runs, le coût cumulé, et les erreurs éventuelles par
  membre.

**Ce que votre établissement NE PEUT PAS voir :**

- le **portfolio brut** d'un apprenant tant qu'il ne l'a pas explicitement déposé
  dans une de vos cohortes — par défaut, les portfolios ne quittent jamais le
  navigateur de l'apprenant ;
- les cartographies qu'un apprenant a produites **hors de vos cohortes** (chez lui,
  dans un autre établissement, en démo) ;
- quoi que ce soit d'un apprenant qui **n'a pas consenti** — un membre listé
  « Sans consentement » n'a aucun document exploitable par vous.

Cette asymétrie n'est pas un réglage : elle est câblée dans la plateforme. La page
d'un membre le rappelle explicitement à l'écran : « Ces cartographies sont visibles
par votre établissement parce que ce membre a rejoint une de vos cohortes avec son
consentement explicite — seuls les documents produits dans ce cadre apparaissent
ici. »

## 3. Les cinq garde-fous RGPD

Le cadre RGPD d'humanome tient en cinq principes non négociables. Comme
établissement, vous êtes le premier responsable de leur respect vis-à-vis de vos
apprenants.

### Consentement explicite, toujours en amont

Un apprenant ne devient membre traitable d'une cohorte qu'après avoir, dans son
propre espace, lu le texte de consentement **et** coché la case. Le texte est
affiché avant le bouton, jamais en petits caractères après. Sans cette case, la
plateforme refuse la jointure. Dans l'espace établissement, chaque membre porte
donc un badge : « Consenti le … » ou « Sans consentement ». Vous ne pouvez pas
consentir à la place d'un apprenant.

### Le portfolio reste local par défaut

Le principe fondateur d'humanome est que le portfolio réflexif ne quitte jamais le
navigateur de l'apprenant — sauf décision explicite de sa part. Rejoindre une
cohorte **ne dépose pas** automatiquement le portfolio : c'est un second geste,
distinct, que l'apprenant fait sciemment (« Déposer dans la cohorte »). Un membre
consenti mais qui n'a pas déposé son portfolio ne génère donc aucun job : il n'y a
rien à traiter.

### Budget plafonné

La cartographie de masse consomme des appels LLM facturés. Vous fixez un **plafond
de dépense en dollars** dans la configuration de l'espace. Au plafond, les
traitements s'arrêtent d'eux-mêmes : les jobs restants passent en « budget
dépassé » plutôt que de continuer à dépenser. C'est un frein matériel, pas une
alerte que l'on peut ignorer. Le chapitre 3 y est entièrement consacré.

### Journalisation minimale

La plateforme journalise des compteurs (nombre de jobs, coût cumulé, statuts),
jamais le contenu des portfolios ni des cartographies dans ses journaux d'audit.
Le suivi d'un run vous donne des nombres et des messages d'erreur techniques, pas
une copie du travail des apprenants circulant dans des logs.

### Droits de l'apprenant préservés

L'apprenant garde la main : il peut quitter une cohorte à tout moment (ce qui
retire son consentement pour la suite), et les cartographies déjà produites dans
ce cadre lui restent acquises. La suppression de son compte purge ses dépôts. Le
chapitre 5 détaille ce partage des droits.

## 4. Le cas des mineurs

Beaucoup de cohortes d'établissement concernent des apprenants mineurs. Il n'existe
pas dans humanome de mécanisme d'âge distinct : le cas des mineurs se traite
**dans** le cadre du consentement explicite décrit ci-dessus. Cela signifie deux
choses très concrètes pour vous.

D'une part, le consentement recueilli par la plateforme (la case cochée par
l'apprenant) ne dispense pas votre établissement de ses propres obligations légales
lorsqu'il s'agit de mineurs : recueil de l'accord des représentants légaux,
information des familles, base légale du traitement. Ces démarches vous incombent,
en dehors de la plateforme, avant même de distribuer un code d'invitation.

D'autre part, tout ce qu'humanome garantit techniquement — portfolio local par
défaut, visibilité limitée au cadre de la cohorte, réversibilité — protège d'autant
plus des publics vulnérables. Utilisez ces garanties comme socle, pas comme
substitut à votre cadre institutionnel.

## 5. Les trois écrans de votre espace

Votre espace établissement s'organise en trois vues, que les chapitres suivants
prennent une par une :

- **L'accueil** (**#/etablissement**) — la liste de vos cohortes avec leur code
  d'invitation, le formulaire de création, et la configuration LLM et budget.
  Chapitres 2 et 3.
- **Le détail d'une cohorte** (**#/etablissement/cohorte/&lt;id&gt;**) — les
  membres avec leur consentement et leur dépôt, le lancement d'un run de masse et
  le suivi de l'avancement en direct. Chapitre 4.
- **Les documents d'un membre** (**#/etablissement/membre/&lt;userId&gt;**) — la
  lecture, en lecture seule, des cartographies d'un apprenant (vue fusionnée et vue
  journée). Chapitre 5.

Vous connaissez maintenant le cadre. Passons au premier geste concret : créer une
cohorte et y inviter vos apprenants — voir « 02-creer-une-cohorte-inviter.md ».
