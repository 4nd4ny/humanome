---
parcours: promptologue
chapitre: 6
titre: "Sécurité : la sandbox et le modèle de menace"
statut: squelette
---

# Sécurité : la sandbox et le modèle de menace

Un prompt-package contient du code JavaScript, et ce code s'exécute chez les
utilisateurs qui choisissent votre paquet : c'est, par construction, du code
arbitraire distribué à autrui. La plateforme encadre ce risque par une
sandbox stricte — le code d'orchestration tourne exclusivement dans un Web
Worker sans accès au DOM, avec une interface d'entrées/sorties contrôlée : le
texte de la feuille en entrée, un JSON validé en sortie, et les appels LLM
uniquement à travers l'abstraction providers. Seules les versions publiées
sont exécutables par autrui ; un brouillon ne tourne que chez son auteur.
Cette architecture vous protège aussi : elle borne ce qu'on peut vous
reprocher. Ce chapitre expose le modèle de menace et les obligations qui font
de vous un auteur de code digne de confiance.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - expliquer pourquoi un prompt-package est du code arbitraire exécuté chez les utilisateurs, et ce qui en découle ;
> - décrire les frontières de la sandbox : Web Worker sans DOM, entrées/sorties contrôlées, LLM via providers uniquement ;
> - distinguer les droits d'un brouillon de ceux d'une version publiée ;
> - appliquer la revue de sécurité avant publication et signaler une vulnérabilité de manière responsable.

## Plan des sections

- **1. Le risque, sans euphémisme** — ce qu'un code malveillant chercherait à faire : exfiltrer un portfolio, voler une clé API, détourner les appels LLM ; pourquoi la confiance ne suffit pas.
- **2. La sandbox Web Worker** — pas de DOM, pas de réseau direct, pas de stockage : ce que le Worker peut et ne peut pas faire, et pourquoi ces limites ne sont pas négociables.
- **3. L'interface d'entrées/sorties** — texte du jour en entrée, JSON validé au schéma en sortie, appels LLM exclusivement via l'abstraction providers ; tout le reste est bloqué.
- **4. Brouillons et versions publiées** — un brouillon ne s'exécute que chez son auteur ; la publication comme franchissement de frontière de confiance ; l'immuabilité comme protection.
- **5. Le modèle de menace du projet** — lecture commentée de `docs/securite-prompts.md` : attaquants considérés, surfaces, contre-mesures, limites assumées.
- **6. Vos obligations d'auteur** — jamais de tentative d'échappement de la sandbox, jamais de collecte détournée dans les prompts eux-mêmes (exfiltration par le texte), sobriété des dépendances.
- **7. Revue avant publication** — la liste de contrôle sécurité ; relecture par un pair ; signaler une vulnérabilité découverte (divulgation responsable) plutôt que l'exploiter ou l'ignorer.
