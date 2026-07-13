---
parcours: promptologue
titre: "Formation promptologue"
description: "Prompt engineering appliqué à la cartographie : concevoir, versionner, tester et sécuriser des prompt-packages."
statut: complet
---

# Formation promptologue

Le promptologue conçoit, teste, versionne et enrichit les prompts — et le code
JavaScript d'orchestration associé — qui transforment un portfolio réflexif en
cartographie de compétences. C'est un métier d'écriture et de mesure : écrire
des protocoles qui résistent à la sycophantie et à l'hallucination des LLM,
puis prouver sur banc d'essai que la nouvelle version fait mieux que la
précédente. Ce parcours part de la logique du prompt de base (le protocole
adversarial Greffier / pédagogue), enseigne le cycle de vie d'un
prompt-package (brouillon, publication immuable, semver, changelog), les
bancs d'essai (A/B, consistance multi-run), le positionnement face à l'étalon
interne (le Golden Prompt), et se termine par ce qui n'est pas négociable : la
sécurité d'un code qui s'exécute chez les utilisateurs.

Le parcours est public en lecture ; votre progression par chapitre est
rattachée à votre compte (cahier des charges, §4.6).

## Chapitres

| # | Chapitre | En une phrase |
|---|---|---|
| 1 | [Le prompt engineering appliqué à la cartographie](01-prompt-engineering-applique.md) | Ce qui distingue un prompt de cartographie d'un prompt conversationnel. |
| 2 | [Genèse et logique du prompt de base](02-genese-du-prompt-de-base.md) | Le protocole adversarial : Greffier, double présomption, attaques a–h, verdicts à 3 statuts et court-circuit. |
| 3 | [Versionner et publier un prompt-package](03-versionner-publier-un-prompt-package.md) | Brouillon, publication immuable, semver, changelog, compatibilité référentiel. |
| 4 | [Les bancs d'essai : A/B et consistance multi-run](04-bancs-d-essai.md) | Mesurer avant d'affirmer : protocoles de test et lecture des métriques. |
| 5 | [Se mesurer au Golden Prompt](05-se-mesurer-au-golden-prompt.md) | L'état de l'art interne comme étalon, ses conditions d'accès, ce que l'écart enseigne. |
| 6 | [Sécurité : la sandbox et le modèle de menace](06-securite-sandbox.md) | Votre code s'exécute chez les autres : Web Worker, entrées/sorties contrôlées, revue avant publication. |

---

*Les six chapitres de ce parcours sont rédigés (contenu complet). Les
parcours, routes et libellés cités renvoient à l'atelier promptologue réel
(`#/promptologue`).*
