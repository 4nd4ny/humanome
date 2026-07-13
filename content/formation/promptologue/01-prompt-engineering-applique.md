---
parcours: promptologue
chapitre: 1
titre: "Le prompt engineering appliqué à la cartographie"
statut: complet
---

# Le prompt engineering appliqué à la cartographie

Un prompt de cartographie n'est pas un prompt de conversation. Il doit
produire un document JSON strictement conforme à un schéma, sur des dizaines
de feuilles successives, à un coût maîtrisé, avec une consistance mesurable
d'un run à l'autre — et il travaille sur le matériau le plus délicat qui
soit : le journal réflexif d'une personne réelle. Les contraintes
structurantes découlent de là. Le portfolio complet ne tient pas dans une
fenêtre de contexte : d'où le découpage journalier puis la fusion. La sortie
doit être validée machinalement : d'où le JSON au schéma. Le penchant des LLM
à complaire doit être contré par construction : d'où le protocole adversarial
que vous découvrirez au chapitre suivant. Ce chapitre installe ce cadre — les
règles du jeu du métier — avant d'entrer dans la mécanique fine.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - énumérer les contraintes propres à la cartographie : sortie structurée, contexte limité, coût, consistance, matériau personnel ;
> - expliquer pourquoi le pipeline découpe le portfolio en feuilles journalières puis fusionne ;
> - situer le rôle du code d'orchestration JS autour des textes de prompts ;
> - utiliser l'abstraction providers pour rester agnostique au modèle LLM.

## 1. Ce qui change par rapport au prompt conversationnel

Quand vous discutez avec un assistant, l'échange est réparable : une réponse
imparfaite se corrige au tour suivant, vous reformulez, le modèle s'ajuste.
Un run de cartographie n'a pas cette élasticité. Pour chacune des feuilles du
portfolio, le système émet une requête, reçoit une sortie, et cette sortie
est soit exploitable, soit rejetée. Il n'y a pas de deuxième interlocuteur
humain dans la boucle au moment du run : le résultat est un artefact, pas une
conversation.

Trois conséquences pratiques en découlent, et elles gouvernent tout le reste
du parcours :

- **La sortie est un document, pas un message.** On ne juge pas sa
  « pertinence » à la lecture ; on la valide contre un schéma. Elle passe ou
  ne passe pas.
- **Le volume interdit la surveillance manuelle.** Un portfolio de deux mois
  peut représenter cinquante à soixante feuilles ; chaque feuille déclenche
  plusieurs appels au modèle. Vous ne relirez pas chaque réponse : vous
  concevez le protocole pour qu'il tienne sans vous.
- **La qualité se mesure, elle ne se ressent pas.** « J'ai l'impression que
  cette version est meilleure » n'est pas un résultat. Le chapitre 4 y
  reviendra : seul le banc d'essai tranche.

> **À retenir** — Vous n'écrivez pas un prompt qui répond bien. Vous écrivez
> un protocole qui produit, des dizaines de fois d'affilée, un document
> vérifiable et une décision assumée.

## 2. La sortie structurée : le schéma comme contrat

La cartographie d'une journée est un document `cartographie-jour`, décrit par
`schemas/cartographie-jour.schema.json`. Ce schéma est le contrat : il fixe
la forme (les pôles, les compétences examinées, les verdicts, les traces
retenues, la synthèse) et il est vérifié par le moteur avant que quoi que ce
soit ne soit affiché. Un document qui n'est pas conforme est refusé — pas
« affiché avec un avertissement », refusé.

Cela déplace votre travail d'écrivain. Vous ne demandez pas au modèle « dis-moi
ce que tu vois » ; vous lui imposez une structure de réponse et vous la
défendez. Concevez donc toujours pour l'échec de format autant que pour le
succès :

- **Rendre la structure inévitable.** Le gabarit décrit champ par champ ce
  qui est attendu, avec des exemples ; il ne laisse pas le modèle inventer sa
  propre organisation.
- **Prévoir la reprise.** Un modèle produit parfois du JSON presque valide
  (une virgule en trop, un champ manquant). Le code d'orchestration doit
  détecter l'échec de parsing et décider : réparer, redemander, ou signaler.
- **Fermer les portes.** Moins vous laissez de latitude au modèle sur la
  forme, moins vous aurez de sorties invalides à traiter.

Vous verrez au chapitre 3 que la validation existe aussi côté atelier :
l'éditeur de brouillon propose un bouton **Valider** qui exécute la validation
de schéma du paquet lui-même (le `prompt-package`) dans votre navigateur,
avant toute exécution.

## 3. La fenêtre de contexte et le découpage journalier

Un portfolio entier — plusieurs semaines d'écriture — dépasse ce qu'un modèle
peut lire d'un seul tenant avec l'attention nécessaire. Le pipeline résout
cela par un découpage : **une feuille par journée**. Le moteur segmente le
texte par dates, puis cartographie chaque journée indépendamment, et enfin
**fusionne** (merge) les journées en une cartographie d'ensemble.

Ce découpage a un coût qu'il faut connaître pour bien écrire vos prompts :

- **Ce qu'il fait perdre.** Une compétence qui ne se manifeste jamais fortement
  un jour donné, mais qui affleure régulièrement, risque d'échouer à chaque
  examen journalier pris isolément. La feuille du mardi ne « voit » pas celle
  du jeudi. La *Résilience & Antifragilité* (`5.01`) se lit mal dans une seule
  journée ; elle se lit dans la traversée d'une mauvaise semaine.
- **Ce que la fusion récupère.** Le merge additionne les traces : une
  compétence ténue mais récurrente peut s'établir à l'échelle du portfolio là
  où elle restait « non établie » chaque jour. C'est pourquoi la vue Merge et
  la vue Journée racontent deux histoires complémentaires.

Retenez la règle qui gouverne tout le protocole : **là où l'apprenant n'a rien
écrit, le moteur ne peut rien établir.** Une compétence sans trace est
« court-circuitée » — examinée sans instruction, verdict minimal. Vos prompts
ne créent pas de la matière ; ils lisent celle qui existe.

## 4. L'orchestration : des textes plus du code

L'unité de travail du promptologue n'est pas « un prompt » mais un
**prompt-package** : un ensemble de textes de gabarits *et* de code JavaScript
qui les instancie et enchaîne les appels. Le code d'orchestration :

1. injecte le **référentiel versionné** (les 7 pôles et leurs 61 compétences)
   dans les gabarits ;
2. enchaîne les appels — un tour par pôle, puis la synthèse transversale
   (le *kairos*) ;
3. collecte les sorties, les assemble en un document `cartographie-jour`
   unique ;
4. laisse le moteur valider ce document au schéma.

Vous éditerez ce couple textes + code dans l'atelier, à partir de la route
`#/promptologue`. Le chapitre 3 décrit l'anatomie complète d'un paquet
(champs `prompts`, `code.orchestration`, `code.entrypoint`, `modeleCible`,
`referentielCompatible`) et son cycle de vie. Retenez pour l'instant que le
texte seul ne suffit pas : c'est le code qui fait tourner le texte, et c'est
lui aussi qui devra vivre dans une sandbox stricte (chapitre 6).

## 5. Modèles et providers : écrire sans s'enfermer

Le moteur parle aux LLM à travers une **abstraction providers** unique. Votre
code d'orchestration ne connaît jamais d'URL, ni de clé, ni de format
propriétaire : il demande « exécute ce prompt », et le pont — situé côté page,
hors de la sandbox — route la demande vers le fournisseur choisi par
l'utilisateur.

Les fournisseurs proposés dans l'atelier, lorsque l'utilisateur emploie sa
propre clé, sont exactement :

| Fournisseur | Exemple de modèle par défaut | Clé requise |
|---|---|---|
| Anthropic (Claude) | `claude-sonnet-4-6` | oui |
| OpenAI (GPT) | `gpt-4o-mini` | oui |
| Google (Gemini) | `gemini-2.5-flash` | oui |
| xAI (Grok) | `grok-4` | oui |
| OpenRouter | `anthropic/claude-sonnet-4.6` | oui |
| Ollama (modèle local, sans clé) | `llama3.1` | non |

Un paquet porte un champ `modeleCible` : la cible pour laquelle il a été
réglé. Ce champ peut rester **vide (agnostique)**. Écrivez pour un modèle si
vous l'optimisez finement, mais sachez que la consigne « produis du JSON
conforme » ne se comporte pas de la même façon d'un modèle à l'autre : ce qui
tient avec un modèle frontière peut se déliter avec un petit modèle. Le
chapitre 4 vous apprendra à ne jamais comparer deux versions sans contrôler le
modèle utilisé.

## 6. Coût, durée, consistance : les trois grandeurs qui arbitrent

Toute amélioration de prompt se paie ou se gagne sur trois axes. Apprenez à
les estimer *avant* de lancer et à les mesurer *après*.

- **Coût.** Chaque appel consomme des tokens facturés. Un protocole plus
  fouillé (plus d'appels, prompts plus longs) coûte plus. Le banc d'essai
  affiche une estimation de coût et de durée pour une comparaison A/B.
- **Durée.** Un run peut prendre de quelques minutes à plusieurs heures selon
  la taille du portfolio et le modèle. La sandbox borne d'ailleurs chaque run
  à **cinq minutes** et à **seize appels LLM** (chapitre 6) : un protocole qui
  ne tient pas dans ces limites ne s'exécute pas.
- **Consistance.** Un même prompt, relancé sur le même texte, ne redonne pas
  exactement le même document (les LLM ne sont pas déterministes). Le test
  multi-run mesure cette stabilité. Une version « meilleure » qui devient
  erratique n'est pas meilleure.

> **À retenir** — Améliorer un prompt, c'est presque toujours arbitrer entre
> ces trois grandeurs. Gagner en finesse en explosant le coût, ou gagner en
> coût au prix de la consistance, n'est pas un progrès : c'est un déplacement
> du problème.

## 7. L'éthique du matériau

Vous n'écrivez pas des instructions qui traitent des données abstraites. Vous
écrivez des instructions qui liront des vies : des doutes, des échecs, des
fiertés consignés par des apprenants, parfois des adolescents. Cette
responsabilité imprègne le métier autant que la technique.

- **Sobriété des formulations.** Les textes que votre paquet fait générer —
  motifs de verdict, prescriptions, rapports narratifs — seront lus par
  l'apprenant. Bannissez le jugement de valeur, la flatterie et la sentence.
  Le moteur constate des traces ; il ne note pas des personnes.
- **Respect de la faillibilité.** La cartographie n'est jamais présentée comme
  une vérité définitive. Le troisième statut de verdict — « renvoi au
  cartographe » — existe précisément pour dire « je ne tranche pas, un humain
  décidera ». Ne concevez jamais un prompt qui supprimerait ce doute pour
  « faire plus propre ».
- **Le garde-fou humain.** Aucune cartographie n'est publiée sans qu'un
  cartographe l'ait relue et garantie (cahier §8). Votre prompt n'est pas le
  dernier mot ; il prépare le travail d'un humain. Écrire en le sachant change
  la manière de formuler chaque consigne.

Le prochain chapitre — [02-genese-du-prompt-de-base.md](02-genese-du-prompt-de-base.md) —
entre dans la mécanique du protocole de base : le Greffier, la double
présomption, les attaques a–h, les trois verdicts et le court-circuit.
