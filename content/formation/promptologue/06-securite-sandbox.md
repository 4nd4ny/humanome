---
parcours: promptologue
chapitre: 6
titre: "Sécurité : la sandbox et le modèle de menace"
statut: complet
---

# Sécurité : la sandbox et le modèle de menace

Un prompt-package contient du code JavaScript, et ce code s'exécute chez les
utilisateurs qui choisissent votre paquet : c'est, par construction, du code
arbitraire distribué à autrui. La plateforme encadre ce risque par une sandbox
stricte — le code d'orchestration tourne exclusivement dans un Web Worker sans
accès au DOM, avec une interface d'entrées/sorties contrôlée : le texte de la
feuille en entrée, un JSON validé en sortie, et les appels LLM uniquement à
travers l'abstraction providers. Seules les versions publiées sont exécutables
par autrui ; un brouillon ne tourne que chez son auteur. Cette architecture
vous protège aussi : elle borne ce qu'on peut vous reprocher. Ce chapitre
expose le modèle de menace et les obligations qui font de vous un auteur de
code digne de confiance.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - expliquer pourquoi un prompt-package est du code arbitraire exécuté chez les utilisateurs, et ce qui en découle ;
> - décrire les frontières de la sandbox : Web Worker sans DOM, entrées/sorties contrôlées, LLM via providers uniquement ;
> - distinguer les droits d'un brouillon de ceux d'une version publiée ;
> - appliquer la revue de sécurité avant publication et signaler une vulnérabilité de manière responsable.

## 1. Le risque, sans euphémisme

Le run de cartographie tourne dans le navigateur de l'utilisateur (ADR-001).
Sans isolation, le `code.orchestration` de votre paquet lirait le portfolio
complet de la personne, ses cookies de session, ses clés API stockées en
local — et pourrait tout exfiltrer. L'adversaire type n'est pas abstrait :
c'est un promptologue malveillant, ou au compte compromis, qui publie un
paquet piégé, ou qui incite une victime à essayer « sa super version ».

La confiance ne suffit donc pas. Un code hostile chercherait à : **exfiltrer**
un portfolio ou le référentiel, **voler** une clé API, **détourner** les
appels LLM vers un serveur choisi par lui. L'architecture répond par des
frontières que le navigateur fait respecter, indépendamment des intentions.

## 2. La sandbox Web Worker

Le code d'orchestration ne s'exécute jamais dans la page. Il est isolé en deux
couches :

- une **iframe** `sandbox="allow-scripts"` — **sans** `allow-same-origin` —
  dont le contenu (`srcdoc`) est une chaîne **figée**. Sans
  `allow-same-origin`, l'origine est **opaque** : ni cookies, ni
  `localStorage`/IndexedDB, ni accès au DOM de la page parente ;
- un **Web Worker** (créé depuis un blob) qui importe dynamiquement votre
  module ESM. Le Worker n'a de toute façon aucun DOM.

La pièce maîtresse est la **CSP** du document sandbox : `default-src 'none'`.
Elle coupe **tout réseau** — `fetch`, `XHR`, `WebSocket`, `EventSource`,
images traçantes, `navigator.sendBeacon` — pour l'iframe **et pour le worker
qu'elle crée** (le worker hérite de la politique). Ce que le code peut faire
est donc drastiquement borné : calculer, et communiquer avec la page parente
par le seul canal `postMessage`.

> **À retenir** — Ces limites ne sont pas des réglages négociables : ce sont
> les murs qui rendent acceptable l'exécution de code tiers chez un
> utilisateur. Un paquet qui aurait « besoin » de les franchir n'a pas sa
> place sur la plateforme.

## 3. L'interface d'entrées/sorties

Le seul pont entre votre code et le monde est la page parente
(`runPackageInSandbox`), via un protocole `postMessage` minimal :

- **entrée** : le texte du jour, la date, le référentiel ;
- **sorties** : des demandes d'appel LLM, un document résultat, ou une erreur.

Tout le reste est bloqué. En particulier, votre code **ne choisit pas** le
fournisseur LLM : il émet une demande « exécute ce prompt », et c'est la page
parente qui la route vers **le fournisseur choisi par l'utilisateur**. Ni URL,
ni modèle, ni clé venant du code sandboxé ne sont acceptés. La page applique
en plus des bornes strictes :

- un **quota de 16 appels LLM par run**, puis interruption ;
- un **timeout global de 5 minutes**, puis destruction de l'iframe (et du
  worker avec elle) ;
- une **validation du document final au schéma** avant de le rendre — un
  `kind` inattendu est refusé ;
- un **filtrage par source** des messages : seuls ceux de *notre* iframe sont
  écoutés.

Ces deux nombres — 16 appels, 5 minutes — sont aussi des contraintes de
conception : un protocole trop gourmand ne s'exécutera tout simplement pas
jusqu'au bout.

## 4. Brouillons et versions publiées

La frontière de confiance passe par la **publication** :

- Un **brouillon ne s'exécute que chez son auteur.** Le banc d'essai ne
  propose que les brouillons de la session courante ; aucun autre chemin du
  front ne charge le brouillon d'autrui.
- Une **version publiée est exécutable par autrui** — et elle est **immuable**
  (semver strictement croissant, changelog, auteur attribué). Ce que la
  communauté a relu est exactement ce qui s'exécute.

La publication est donc le moment où vous engagez les autres, pas seulement
vous. C'est pourquoi elle est irréversible en contenu : on ne « corrige » pas
une version publiée, on en publie une nouvelle (chapitre 3).

## 5. Le modèle de menace du projet

Le document `docs/securite-prompts.md` détaille les menaces considérées et
leurs parades. En voici la lecture commentée, par familles :

- **Exfiltration (E).** Réseau direct depuis le code (`fetch`/XHR/WebSocket/
  beacon) → coupé par la CSP `default-src 'none'`. Cookies et session →
  inaccessibles (origine opaque). Clés API en local → hors de portée (le
  storage est inaccessible ; la clé reste dans la page parente). **Résidu
  assumé** : le canal LLM lui-même. Encoder du texte dans un prompt reste
  possible — mais c'est la fonction même du paquet, le fournisseur est choisi
  par l'utilisateur, et le quota de 16 appels le borne.
- **Déni de service (D).** Boucle infinie ou allocation massive → bornées par
  le timeout de 5 minutes ; boucle d'appels LLM → bornée par le quota. **Résidu
  assumé** : jusqu'à 5 minutes de CPU d'un cœur.
- **Escalade (P).** Accès au DOM parent, navigation, popups → interdits par le
  navigateur (origines différentes) et par l'absence des permissions
  correspondantes. Injection via `srcdoc` → impossible : le code ne transite
  jamais par le HTML (srcdoc figé, code passé par `postMessage` + Blob).
  Empoisonnement du résultat → validation au schéma avant remise.
- **Ingénierie sociale (S).** « Teste mon brouillon » → un brouillon ne quitte
  pas son auteur ; il faut **publier** pour être exécuté par autrui, en version
  immuable et attribuée.

## 6. Vos obligations d'auteur

La sandbox vous protège, mais elle ne vous dispense pas d'une éthique
d'auteur. Trois engagements :

- **Jamais de tentative d'échappement.** Ne cherchez pas à contourner la
  sandbox, même « pour tester ». Toute tentative documentée dans un paquet
  publié est un abus de confiance caractérisé.
- **Jamais de collecte détournée par le texte.** L'exfiltration par le canal
  LLM (encoder subrepticement le portfolio dans un prompt pour l'envoyer
  ailleurs) est le résidu le plus subtil. Vos gabarits ne doivent servir qu'à
  cartographier, pas à faire fuiter.
- **Sobriété des dépendances.** Moins de code, moins de surface. Un module
  d'orchestration compact et lisible est plus facile à relire — donc plus
  digne de confiance — qu'un empilement opaque.

## 7. Revue avant publication

Avant de cliquer **Publier…**, passez cette liste de contrôle :

1. **Validation** : le paquet passe **Valider** (schéma) sans erreur.
2. **Périmètre** : le code ne fait rien d'autre que cartographier — pas de
   tentative d'accès réseau, storage, DOM ; pas de fournisseur codé en dur.
3. **Canal LLM** : les gabarits n'encodent aucune donnée à des fins de
   sortie ; ils formulent des prompts d'analyse, rien de plus.
4. **Budget** : le protocole tient dans 16 appels LLM et 5 minutes.
5. **Changelog** : il dit *quoi*, *pourquoi*, et *ce que le banc a mesuré*.
6. **Relecture par un pair** quand c'est possible : un second regard de
   promptologue vaut mieux que la confiance en soi.

Enfin, si vous **découvrez une vulnérabilité** — dans la sandbox, dans un
paquet publié, dans la plateforme — pratiquez la **divulgation responsable** :
signalez-la à l'administration Harmonia plutôt que de l'exploiter ou de
l'ignorer. C'est le comportement qui protège les apprenants, et c'est celui
qu'on attend d'un auteur de code de confiance.

> **À retenir** — La sécurité n'est pas une contrainte imposée de l'extérieur :
> c'est la condition qui vous autorise à faire tourner votre code dans la vie
> numérique de quelqu'un d'autre. La respecter, c'est mériter cette confiance.

Vous avez parcouru le métier de promptologue, du cadre de la cartographie
([01-prompt-engineering-applique.md](01-prompt-engineering-applique.md)) à la
sécurité du code publié. La suite se joue à l'atelier, `#/promptologue` :
concevez, mesurez, publiez — honnêtement.
