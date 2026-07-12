---
parcours: promptologue
chapitre: 3
titre: "Versionner et publier un prompt-package"
statut: squelette
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
rétrospective des cartographies quand le référentiel évolue.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - décrire l'anatomie d'un prompt-package : textes, code d'orchestration, métadonnées, compatibilité référentiel ;
> - dérouler le cycle brouillon → publication immuable, avec semver et entrée de changelog ;
> - comparer deux versions d'un paquet (diff) et documenter un changement de manière exploitable ;
> - expliquer la régénération rétrospective et le circuit de la version par défaut proposée aux apprenants.

## Plan des sections

- **1. Anatomie d'un paquet** — id stable, version semver, auteur, description, `modeleCible`, `referentielCompatible` (id + version minimale), prompts, code, métadonnées.
- **2. Brouillon et publication** — l'éditeur en ligne ; pourquoi un brouillon ne s'exécute que chez son auteur ; l'immuabilité d'une version publiée et ce qu'elle garantit aux autres.
- **3. Semver et changelog** — choisir entre correctif, mineure et majeure pour un prompt ; écrire une entrée de changelog qui permettra, dans un an, de comprendre le pourquoi.
- **4. La compatibilité référentiel** — le paquet suppose une structure de pôles et de codes ; que faire quand le référentiel publie une nouvelle version.
- **5. Le diff entre versions** — lire un diff de textes de prompts et de code ; les modifications silencieusement dangereuses (consignes de format, seuils de confiance).
- **6. La version par défaut** — proposition du promptologue, validation de l'administrateur : le circuit qui décide de ce que les apprenants utilisent sans le savoir.
- **7. La régénération rétrospective** — relancer une cartographie existante avec un référentiel plus récent pour révéler les compétences nouvellement ajoutées ; précautions et lecture des écarts.
