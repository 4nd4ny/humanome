---
parcours: promptologue
chapitre: 1
titre: "Le prompt engineering appliqué à la cartographie"
statut: squelette
---

# Le prompt engineering appliqué à la cartographie

Un prompt de cartographie n'est pas un prompt de conversation. Il doit
produire un document JSON strictement conforme à un schéma, sur des dizaines
de feuilles successives, à un coût maîtrisé, avec une consistance mesurable
d'un run à l'autre — et il travaille sur le matériau le plus délicat qui
soit : le journal intime professionnel d'une personne réelle. Les contraintes
structurantes découlent de là : le portfolio complet ne tient pas dans une
fenêtre de contexte, d'où le découpage journalier puis la fusion ; la sortie
doit être validée machinalement, d'où le JSON au schéma ; le penchant des LLM
à complaire doit être contré par construction, d'où le protocole adversarial.
Ce chapitre installe ce cadre avant d'entrer, au chapitre suivant, dans la
logique du prompt de base.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - énumérer les contraintes propres à la cartographie : sortie structurée, contexte limité, coût, consistance, matériau personnel ;
> - expliquer pourquoi le pipeline découpe le portfolio en feuilles journalières puis fusionne ;
> - situer le rôle du code d'orchestration JS autour des textes de prompts ;
> - utiliser l'abstraction providers pour rester agnostique au modèle LLM.

## Plan des sections

- **1. Ce qui change par rapport au prompt conversationnel** — pas de dialogue, pas de rattrapage : une sortie unique, structurée, validée ou rejetée.
- **2. La sortie structurée** — le schéma `cartographie-jour` comme contrat ; validation systématique ; concevoir le prompt pour l'échec de parsing (reprise, réparation).
- **3. La fenêtre de contexte et le découpage journalier** — pourquoi une feuille par journée ; ce que le découpage fait perdre (compétences ténues récurrentes) et ce que la fusion (merge) récupère.
- **4. L'orchestration** — un prompt-package = des textes + du code JS qui les instancie (injection du référentiel versionné, enchaînement des 7 pôles et du kairos, collecte des sorties).
- **5. Modèles et providers** — l'abstraction unique (Anthropic, OpenAI, Google, xAI, OpenRouter, Ollama), le champ `modeleCible` d'un paquet, écrire pour un modèle sans s'y enfermer.
- **6. Coût, durée, consistance** — estimer avant de lancer, mesurer après ; les trois grandeurs qui arbitrent toute amélioration de prompt.
- **7. L'éthique du matériau** — vous écrivez des instructions qui liront des vies ; sobriété des formulations, respect de l'apprenant dans les textes générés (prescriptions, rapports narratifs).
