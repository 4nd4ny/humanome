---
parcours: epistemiarque
chapitre: 4
titre: "Versionner le référentiel"
statut: complet
---

# Versionner le référentiel

Un débat mûr aboutit à une décision ; une décision se grave dans une **version**. C'est l'acte le plus lourd de conséquences du rôle, parce qu'une version du référentiel n'est pas un document isolé : c'est le socle contre lequel des milliers de cartographies ont été produites, et contre lequel des milliers d'autres le seront. Ce chapitre explique la grammaire des versions (le versionnement sémantique appliqué à un référentiel), la règle d'immuabilité, ce que « rétro-compatible » veut dire ici, et la mécanique de la régénération rétrospective — comment retrouver, dans des cartographies anciennes, une compétence qu'on vient d'ajouter. Le fil conducteur : **on fait évoluer le socle sans jamais rendre illisible ce qui a déjà été mesuré.**

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - choisir le niveau d'une version (majeure, mineure, correctif) selon la nature de l'évolution ;
> - énoncer la règle d'immuabilité et expliquer le rôle du `contentHash` ;
> - distinguer une évolution rétro-compatible d'une évolution qui casse la compatibilité ;
> - décrire l'impact d'une version sur les cartographies existantes et le principe de la régénération rétrospective.

## 1. La grammaire des versions

Le référentiel porte une version sémantique — aujourd'hui `7.0.0`, sous la forme `MAJEURE.MINEURE.CORRECTIF`. Cette convention, empruntée au logiciel, prend un sens précis quand on l'applique à un référentiel de compétences. Reliez chaque niveau aux types d'évolution vus au chapitre « [Proposer et débattre](03-proposer-et-debattre.md) » :

- **Correctif** (`7.0.0` → `7.0.1`). Une correction qui ne change ni le périmètre ni le sens : coquille dans un nom, précision de formulation qui ne déplace aucune frontière, correction de couleur d'un pôle. Aucune cartographie existante n'est invalidée ; rien à régénérer.
- **Mineure** (`7.0.0` → `7.1.0`). Une évolution *additive et rétro-compatible* : on **ajoute** une compétence sans toucher aux codes existants. Toutes les compétences déjà cartographiées gardent leur code et leur sens ; la nouveauté n'existait pas avant, donc rien n'est contredit — mais elle ouvre la possibilité d'une régénération rétrospective (section 5).
- **Majeure** (`7.0.0` → `8.0.0`). Une évolution *qui casse la compatibilité* : retrait d'une compétence, scission d'une compétence en deux, fusion de deux compétences, ou tout changement qui modifie le sens d'un code existant. Après une majeure, une cartographie produite contre l'ancienne version ne peut plus être interprétée mot pour mot contre la nouvelle : un code a disparu, changé de sens, ou s'est dédoublé.

La règle pratique : **si un code existant change de sens, disparaît ou se dédouble, c'est une majeure ; si on n'ajoute que du nouveau, c'est une mineure ; si rien ne bouge dans le périmètre, c'est un correctif.**

## 2. L'immuabilité, garante de la mémoire

Le principe non négociable, rappelé jusque dans l'en-tête de `#/referentiel` : **aucune version publiée n'est jamais modifiée en place.** Une fois `7.0.0` publiée, elle est figée pour toujours. La moindre retouche produit une *nouvelle* version — pas une correction de l'ancienne.

Cette immuabilité est la condition de la traçabilité. Chaque cartographie mémorise le couple `(id, version)` du référentiel utilisée lors de son run — par exemple `(respire, 7.0.0)`. Si l'on pouvait réécrire `7.0.0`, cette référence ne voudrait plus rien dire : la cartographie prétendrait avoir été produite contre un socle qui, entre-temps, aurait changé sous ses pieds. Le champ `contentHash` verrouille cela techniquement : c'est une empreinte du contenu, qui permet de vérifier que le `7.0.0` d'aujourd'hui est bien, octet pour octet, celui contre lequel la cartographie a été produite. Un `contentHash` qui ne correspond plus est le signal d'une altération à refuser.

Concrètement, publier une version consiste à figer un nouveau document (nouveau `version`, nouveau `contentHash`, `source` documentée) et à en faire l'état servi par la vue publique — sans effacer les précédents, qui restent la référence des cartographies qui les citent.

## 3. Rétro-compatibilité : ce que ça veut dire ici

« Rétro-compatible » a un sens strict pour un référentiel : **une version B est rétro-compatible avec une version A si toute cartographie produite contre A garde exactement le même sens lue à travers B.** Cela tient tant que :

- aucun code présent dans A n'a disparu dans B ;
- aucun code présent dans A n'a changé de sens dans B ;
- les seules différences sont des ajouts (nouveaux codes) ou des corrections neutres.

C'est pourquoi un **ajout** est rétro-compatible (mineure) mais un **retrait**, une **fusion** ou une **scission** ne le sont pas (majeure). Prenons trois cas :

- *Ajout.* On introduit une nouvelle compétence en fin de pôle 3, disons `3.08`. Les cartographies existantes ne la mentionnent pas — elles ne peuvent pas la contredire. Elles restent valides telles quelles ; on peut, si on le souhaite, aller rechercher rétrospectivement `3.08` dans les anciens portfolios.
- *Scission.* On sépare une compétence trop large en deux compétences plus précises. Les cartographies anciennes pointent vers l'ancien code, qui n'a plus le même périmètre : elles doivent être régénérées ou lues avec la version d'origine. Majeure.
- *Fusion.* Deux compétences jugées redondantes deviennent une seule. Les cartographies qui distinguaient les deux perdent cette distinction. Majeure.

Ne cédez jamais à la tentation de « recycler » un code libéré par un retrait pour y mettre autre chose : un code est un identifiant à vie, pas un emplacement réutilisable. Réutiliser un code trahirait toutes les cartographies qui le citent.

## 4. L'impact sur les cartographies existantes

Avant de publier, faites l'inventaire des conséquences. Une version n'est pas neutre pour l'écosystème :

- **Les cartographies déjà produites** ne changent pas d'elles-mêmes : elles restent attachées à la version qui les a produites et se relisent toujours correctement à travers elle. C'est le bénéfice direct de l'immuabilité.
- **Les prompts des promptologues** supposent une structure de pôles et de codes. Une majeure les oblige à réviser leur paquet et à déclarer leur compatibilité avec la nouvelle version ; une mineure peut leur demander d'apprendre à repérer la compétence ajoutée. Coordonnez la publication avec eux : une version de référentiel qu'aucun prompt ne sait exploiter reste lettre morte.
- **Les cartographes** verront apparaître, sur les nouvelles cartographies, des compétences qu'ils devront apprendre à reconnaître et à garantir.
- **Les apprenants** peuvent légitimement se demander pourquoi leur cartographie de l'an dernier « ne voit pas » une compétence introduite depuis. La réponse honnête est double : leur cartographie reste valide dans sa version d'origine, et une régénération rétrospective peut, s'ils le souhaitent, la rejouer contre le socle récent.

## 5. La régénération rétrospective

C'est le mécanisme qui réconcilie l'immuabilité (on ne touche pas au passé) et le progrès (on veut profiter des nouvelles compétences). L'idée, mise en œuvre côté promptologue : **relancer une cartographie existante en la rejouant contre une version plus récente du référentiel**, pour révéler les compétences nouvellement ajoutées qui étaient déjà présentes, en creux, dans le portfolio.

Le principe, du point de vue de l'épistémiarque :

- La régénération ne **modifie pas** la cartographie d'origine : elle en produit une nouvelle, attachée à la nouvelle version. On garde les deux, datées et versionnées.
- Elle n'a de sens que pour une évolution **additive** (mineure) : on cherche du nouveau dans du déjà-écrit. Après une majeure qui retire ou fusionne, la « régénération » est plutôt une reconstruction, à interpréter avec prudence.
- Elle est **facultative et opt-in** : conformément aux principes RGPD du projet, on ne rejoue pas d'office le portfolio d'un apprenant. La régénération suppose l'accès au portfolio d'origine, qui n'est pas conservé côté serveur par défaut. C'est donc une possibilité offerte, pas un traitement automatique.

Quand vous publiez une mineure, votre note de version devrait donc indiquer explicitement : voici la ou les compétences ajoutées, elles sont candidates à régénération rétrospective, voici comment lire les écarts. Le détail opérationnel de la régénération relève du parcours promptologue ; votre responsabilité est de **déclarer clairement l'intention** derrière la version.

## 6. La note de version, mémoire de la décision

Chaque version publiée doit s'accompagner d'une note — l'équivalent d'un changelog — qui permettra, dans un an, à quelqu'un qui n'était pas là de comprendre. Elle relie ce chapitre au précédent : elle synthétise le débat, elle nomme le type d'évolution, elle justifie le niveau de version. Elle devrait contenir, au minimum :

- le numéro de la nouvelle version et le niveau choisi (majeure / mineure / correctif) ;
- la liste précise des changements, avec les codes concernés ;
- le lien vers le fil de débat sur `participer.harmonia.education` qui l'a fondée ;
- l'impact déclaré : rétro-compatible ou non, régénération rétrospective recommandée ou non ;
- la `source` documentée qui alimente le champ homonyme de l'en-tête.

Une version bien notée est une décision qu'on peut défendre publiquement. Reste la question de fond, celle qui décide au fond de tous ces débats : *qu'est-ce qui fait qu'une capacité mérite d'entrer dans ce référentiel ?* C'est le sujet du dernier chapitre, « [Principes de noésiologie](05-principes-de-noesiologie.md) ».
