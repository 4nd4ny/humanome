---
parcours: promptologue
chapitre: 3
titre: "Versionner et publier un prompt-package"
statut: complet
---

# Versionner et publier un prompt-package

L'unité de travail du promptologue est le prompt-package : l'ensemble des
textes de prompts et du code JavaScript d'orchestration qui, ensemble,
produisent une cartographie. Chaque paquet porte un identifiant stable, une
version semver, un changelog et une contrainte de compatibilité avec le
référentiel ; chaque cartographie référence le couple exact (id, version) qui
l'a produite — c'est la condition de la reproductibilité et de toute
comparaison honnête. Le cycle de vie est strict : un brouillon s'édite et ne
tourne que chez son auteur ; une version publiée est immuable et exécutable
par autrui ; toute modification ultérieure est une nouvelle version. Ce
chapitre parcourt ce cycle, de l'anatomie d'un paquet à la régénération
rétrospective des cartographies.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - décrire l'anatomie d'un prompt-package : textes, code d'orchestration, métadonnées, compatibilité référentiel ;
> - dérouler le cycle brouillon → publication immuable, avec semver et entrée de changelog ;
> - comparer deux versions d'un paquet (diff) et documenter un changement de manière exploitable ;
> - expliquer la régénération rétrospective et le circuit de la version par défaut proposée aux apprenants.

## 0. Où l'on travaille : l'atelier promptologue

Toutes les manipulations de ce chapitre se font dans l'**atelier
promptologue**, ouvert à la route `#/promptologue`. L'atelier exige une
session portant le rôle `promptologue` : sans session, un message vous invite
à vous connecter via `#/compte` ; avec une session dépourvue du rôle, un
message vous renvoie à l'administration Harmonia. Une fois entré, une barre de
navigation propose quatre sections : **Paquets**, **Banc d'essai**,
**Rétrospective** et **Formation**. Ce chapitre vit dans **Paquets** (la page
d'accueil de l'atelier) et dans l'éditeur qu'elle ouvre.

## 1. Anatomie d'un paquet

Un prompt-package est un document JSON conforme à
`schemas/prompt-package.schema.json`. Ses champs obligatoires sont :

| Champ | Rôle |
|---|---|
| `schemaVersion`, `kind` | version du schéma et type de document |
| `id` | identifiant **stable** du paquet (ne change jamais entre versions) |
| `version` | version **semver** (`MAJEUR.MINEUR.CORRECTIF`) |
| `auteur` | qui a publié cette version (attribution) |
| `description` | à quoi sert le paquet |
| `modeleCible` | modèle visé, ou vide (agnostique) |
| `referentielCompatible` | `{ id, versionMin }` : quel référentiel, à partir de quelle version |
| `changelog` | historique des versions, une entrée par version |
| `prompts` | les gabarits : chacun a un `role` (kebab-case), un `nom`, un `texte`, des `variables` |
| `code` | `{ orchestration, entrypoint }` : le module JS et la fonction exportée qui lance le run |
| `metadata` | métadonnées libres |

Deux champs demandent un mot d'attention. `referentielCompatible` dit que le
paquet **suppose** une certaine structure de pôles et de codes : il ne
fonctionnera correctement qu'avec le référentiel désigné, à partir de la
version minimale indiquée. `code.entrypoint` nomme la fonction que le moteur
appellera dans le module `code.orchestration` — c'est le point d'entrée du run.

## 2. Brouillon et publication

Le cycle de vie tient en une phrase : **on n'édite jamais une version publiée ;
on crée une nouvelle version à partir d'elle.**

Pas-à-pas pour démarrer un brouillon :

1. Ouvrez **Paquets** (`#/promptologue`). La section « Paquets publiés »
   liste les versions disponibles sur le serveur, avec leur `id`, leur
   `version`, leur description et — le cas échéant — la mention **par défaut**.
2. Sur la ligne du paquet à faire évoluer, cliquez **Nouvelle version**. Un
   petit formulaire apparaît, pré-rempli avec la prochaine version suggérée.
3. Ajustez la **Version** si besoin (elle doit être **strictement croissante**
   pour ce paquet), puis cliquez **Créer le brouillon**.
4. L'atelier vous amène dans l'éditeur, à la route
   `#/promptologue/editeur/<draftId>`.

Dans l'éditeur, vous retrouvez : la section **Métadonnées** (description,
« Modèle cible (vide = agnostique) », et le changelog en lecture), la section
**Prompts** (une liste d'onglets « rôle — nom », un éditeur de texte par
gabarit avec compteur de caractères, et les **Variables** de chaque gabarit :
nom, description, exemple), et la section **Code d'orchestration** (le module
ESM et son entrypoint). Les boutons d'action sont **Valider**, **Enregistrer**,
**Publier…** et, si une version d'origine est connue, **Diff contre &lt;version&gt;**.

- **Valider** exécute, dans votre navigateur, la validation du document au
  schéma `prompt-package` et affiche les erreurs éventuelles (chemin +
  message). C'est gratuit : faites-le souvent.
- **Enregistrer** envoie le brouillon au serveur, qui le **re-valide** avant
  de l'accepter.
- Un brouillon **ne s'exécute que chez son auteur** : le banc d'essai ne
  propose que vos propres brouillons. C'est une règle de sécurité, détaillée
  au chapitre 6.

## 3. Semver et changelog

La version d'un paquet suit le versionnage sémantique. Adaptée aux prompts, la
règle de choix est :

- **Correctif** (`x.y.Z`) : une retouche qui ne change pas le comportement
  attendu — une reformulation de consigne, une coquille, un exemple plus clair.
- **Mineure** (`x.Y.0`) : une amélioration compatible — une nouvelle attaque
  mieux ciblée, un gabarit affiné, sans bouleverser la forme des sorties.
- **Majeure** (`X.0.0`) : un changement de contrat — nouvelle structure de
  sortie, seuils de confiance déplacés, dépendance à une nouvelle version du
  référentiel.

La publication **exige un changelog** (le formulaire de publication refuse un
changelog vide). Écrivez-le pour votre vous-même dans un an, ou pour un autre
promptologue : indiquez *ce qui change*, *pourquoi*, et *ce que le banc
d'essai a mesuré* (chapitre 4). Un bon changelog est ce qui permet, plus tard,
de comprendre une régression sans rejouer toute l'histoire du paquet.

> **À retenir** — Le changelog n'est pas une formalité : c'est le seul endroit
> où survit le *pourquoi* d'un changement. Le diff montre le *quoi* ; le
> changelog explique le *pourquoi*.

## 4. La compatibilité référentiel

Le champ `referentielCompatible` (`{ id, versionMin }`) est votre garde-fou
face à un référentiel vivant. Le référentiel RESPIRE évolue (les épistémiarques
ajoutent, reformulent, réorganisent des compétences) ; sa version actuelle est
la `7.0.0`, avec 7 pôles et 61 compétences.

Quand une nouvelle version du référentiel est publiée, deux cas :

- **Changement compatible** (ajouts, précisions) : votre paquet continue de
  fonctionner ; vous pouvez relever `versionMin` pour signaler que vous avez
  vérifié la compatibilité, et envisager la régénération rétrospective (§7)
  pour révéler les compétences nouvelles.
- **Changement de structure** (codes de pôles modifiés, découpage revu) : le
  paquet suppose une structure qui n'existe plus. C'est un changement
  **majeur** : nouvelle version, gabarits adaptés, tests refaits.

## 5. Le diff entre versions

Le bouton **Diff contre &lt;version&gt;** de l'éditeur charge la comparaison
serveur entre votre brouillon et sa version d'origine. Le diff est structuré :
il affiche une section **Champs** (les champs de premier niveau modifiés,
`de → à`), une section **Prompts** (gabarits **ajoutés**, **retirés**,
**modifiés** — avec un diff ligne à ligne du texte et des variables), une
section **Code d'orchestration** (changement d'entrypoint et diff du module),
et une section **Métadonnées**.

Apprenez à repérer les **modifications silencieusement dangereuses** — celles
qui ne « cassent » rien au sens du schéma mais déplacent le comportement :

- un **seuil de confiance** modifié dans une consigne (« retiens si confiance
  &gt; 0,7 » → « &gt; 0,6 ») : la carte se remplit ou se vide sans qu'aucune
  erreur n'apparaisse ;
- une **consigne de format** relâchée : le taux de sorties invalides remonte ;
- une **variable** renommée : le code d'orchestration qui l'injecte ne la
  trouve plus.

Le diff les rend visibles ; c'est à vous de les interpréter.

## 6. La version par défaut

Parmi toutes les versions publiées, une seule est la **version par défaut** :
celle qu'utilisent les apprenants sans avoir à choisir. Le circuit de décision
est délibérément à deux mains :

1. Dans **Paquets**, sur une version publiée non par défaut, le bouton
   **Proposer par défaut** envoie une proposition. L'atelier confirme alors
   que « la validation admin requise » — vous *proposez*, vous ne décidez pas.
2. L'**administrateur** valide (ou non) la proposition. C'est lui qui engage
   la plateforme sur ce que verront les apprenants.

Cette séparation protège les apprenants : aucun promptologue ne peut, seul,
imposer son paquet à tous les utilisateurs.

## 7. La régénération rétrospective

Quand le référentiel gagne une compétence, les cartographies déjà produites ne
la connaissent pas — elles ont été calculées avec l'ancien référentiel. La
**régénération rétrospective** consiste à relancer une cartographie existante
avec un référentiel plus récent, pour révéler ce qui était invisible.

Cet outil vit dans la section **Rétrospective** (`#/promptologue/retro`). En
version 1, il opère **à l'unité** : une cartographie de type *journée* à la
fois. Le principe et les précautions (notamment le fait que le texte de la
journée n'est jamais stocké sur le serveur) font l'objet d'un traitement
détaillé — mais l'essentiel à retenir ici est le lien avec le versionnage :
c'est parce que chaque cartographie référence le couple exact (id, version) de
paquet et la version de référentiel utilisés que la comparaison
« avant / après » a un sens.

> **À retenir** — Reproductibilité et rétrospective sont deux faces d'une même
> discipline : nommer précisément ce qui a produit chaque résultat. Sans
> versions immuables et sans référence explicite, aucune comparaison honnête
> n'est possible.

Le chapitre suivant — [04-bancs-d-essai.md](04-bancs-d-essai.md) — vous
apprend à *mesurer* une amélioration avant de la publier, plutôt qu'à la
supposer.
