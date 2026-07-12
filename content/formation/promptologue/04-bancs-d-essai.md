---
parcours: promptologue
chapitre: 4
titre: "Les bancs d'essai : A/B et consistance multi-run"
statut: squelette
---

# Les bancs d'essai : A/B et consistance multi-run

En prompt engineering, l'impression de mieux ne vaut rien : seule la mesure
tranche. Le banc d'essai de l'atelier offre deux protocoles complémentaires.
Le test de consistance exécute N fois la même version sur le même portfolio
et mesure la stabilité des sorties : compétences communes, compétences
divergentes, distance structurelle entre les documents JSON. Le test A/B
confronte deux versions sur le même portfolio et objective ce que votre
modification change réellement — verdicts qui basculent, confiances qui se
déplacent, coût qui dérive. Ce chapitre apprend à construire ces expériences
sur des portfolios de test, à lire leurs métriques sans se raconter
d'histoires, et à consigner les résultats là où ils serviront : dans le
changelog du paquet.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - monter un test de consistance multi-run et interpréter ses métriques ;
> - conduire une comparaison A/B entre deux versions d'un paquet sur un portfolio de test ;
> - reconnaître les pièges classiques : surapprentissage du portfolio de test, échantillon trop petit, variation de modèle non contrôlée ;
> - consigner un résultat de banc d'essai de manière reproductible.

## Plan des sections

- **1. Les portfolios de test** — fixtures fictives et corpus de démonstration ; pourquoi on ne teste jamais sur les données réelles d'un apprenant sans son consentement explicite.
- **2. Le test de consistance multi-run** — protocole (N runs, mêmes entrées), métriques (compétences communes/divergentes, distance structurelle), niveaux de variabilité acceptables selon l'usage.
- **3. La comparaison A/B** — variables à contrôler (modèle, référentiel, portfolio), lecture alignée des verdicts, distinguer amélioration de déplacement du problème.
- **4. Interpréter sans complaisance** — la sycophantie du promptologue envers son propre prompt existe aussi ; contre-hypothèses systématiques et regard tiers (le cartographe comme allié).
- **5. Les pièges** — optimiser pour un portfolio unique, conclure sur trois runs, comparer des coûts sans comparer les modèles ; comment chaque piège se détecte.
- **6. Consigner et publier** — attacher les résultats au changelog de la version ; ce qu'un autre promptologue doit pouvoir rejouer à partir de votre compte rendu.
