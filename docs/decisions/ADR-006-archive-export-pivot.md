# ADR-006 — L'archive d'export comme format pivot de portabilité

## Statut

Accepté — 2026-07-12

## Contexte

Trois besoins distincts du cahier des charges exigent de sérialiser l'intégralité des
données d'un compte ou d'un run de cartographie :

1. **RGPD** (§6.1) : « Aucune donnée de portfolio n'est stockée côté serveur par
   défaut ; export local systématique (JSON cartographie + portfolio + prompt utilisé
   + référentiel) ». Le §6.3 impose de plus « export/suppression de compte en un clic,
   avec transfert des données vers un fichier local ».
2. **Import de compte** (§3.2) : l'apprenant doit pouvoir « exporter/importer son
   compte complet (portfolio, cartographies, prompts utilisés, référentiel associé)
   en local ».
3. **Clone déployable** (§5) : « n'importe qui doit pouvoir réimporter référentiel,
   profil, portfolios et cartographies pour redémarrer sa propre instance de la
   plateforme ».

Par ailleurs, le §4.3 exige que chaque cartographie soit liée à « la version du prompt
utilisé, la version du référentiel utilisé, le code JS d'exécution » : une archive qui
omettrait ces versions produirait des cartographies orphelines, non reproductibles et
non ré-analysables lors d'une évolution du référentiel (§8, régénération rétrospective).

Sans décision, le risque est de voir émerger trois formats divergents (un export RGPD,
un format d'import, un format de seed d'instance) qu'il faudrait maintenir et faire
converger après coup.

## Décision

**Un seul schéma d'archive, `schemas/archive-export.schema.json`, sert de format pivot
pour tous les flux de portabilité.** Cette décision reprend l'AD-6 pré-actée du plan
de construction.

L'archive contient, de façon autoporteuse :

- le(s) **portfolio(s)** en texte intégral (segmentation journalière incluse) ;
- le(s) **prompt-package(s)** utilisé(s) — texte des prompts + code JS d'orchestration
  + métadonnées de version (conformes à `prompt-package.schema.json`) ;
- la **version exacte du référentiel** référencée par chaque run (contenu complet,
  semver + hash, conforme à `referentiel.schema.json`) ;
- les **cartographies** produites (journalières et mergées, conformes aux schémas
  `cartographie-jour` et `cartographie-merge`) ;
- les **métadonnées** : identité du compte, préférences de confidentialité,
  progression de formation, journaux de runs (modèle, tokens, horodatages),
  annotations et garanties du cartographe le cas échéant.

Les trois flux consomment et produisent ce même schéma :

| Flux | Usage de l'archive |
|---|---|
| Export / suppression RGPD (§6.1, §6.3) | Génération de l'archive puis purge réelle côté serveur |
| Import de compte (§3.2) | Restauration complète d'un compte depuis l'archive |
| Clone déployable (§5) | Seed d'une instance vierge (référentiel + comptes + cartographies) |

Le schéma est validé en double runtime (ajv côté client, validateur JSON Schema côté
PHP) comme tous les contrats de données du projet. Toute évolution du schéma est
versionnée et rétro-compatible en lecture : une instance doit toujours pouvoir importer
une archive produite par une version antérieure.

## Conséquences

**Positives**

- La conformité RGPD n'est pas une fonctionnalité ajoutée mais une propriété
  structurelle : l'export « en un clic » (§6.3) et l'export local systématique (§6.1)
  utilisent le chemin de code le plus testé du système, puisque c'est le même que
  l'import et le clonage.
- Chaque archive est **autoporteuse et reproductible** : elle embarque prompt-package
  et version de référentiel, satisfaisant la traçabilité du §4.3 et permettant la
  régénération rétrospective (§8) même hors ligne ou sur une autre instance.
- Le « clone déployable » (§5) devient trivial à tester : monter une instance vierge
  et importer des archives est exactement le parcours validé en P13 (INSTALL.md).
- Un seul schéma à documenter, valider et faire évoluer — moins de surface de bugs.

**Négatives / points de vigilance**

- Les archives peuvent devenir volumineuses (portfolio complet + référentiel complet
  dupliqué dans chaque archive) ; acceptable en v1, une déduplication par hash du
  référentiel pourra être introduite sans casser le schéma.
- La rétro-compatibilité en lecture impose une discipline de versionnage du schéma
  dès la première publication.
- Le Golden Prompt et les prompt-packages privés ne doivent **jamais** être inclus
  dans une archive exportée par un utilisateur non autorisé (§7) : le générateur
  d'archive doit filtrer selon les droits, point à couvrir explicitement par des tests.

**Décisions liées** : ADR-001 (exécution client-first — l'archive est produite côté
navigateur par défaut), ADR-004 (les clés API personnelles ne figurent jamais dans
l'archive en clair).
