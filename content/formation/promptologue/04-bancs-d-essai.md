---
parcours: promptologue
chapitre: 4
titre: "Les bancs d'essai : A/B et consistance multi-run"
statut: complet
---

# Les bancs d'essai : A/B et consistance multi-run

En prompt engineering, l'impression de mieux ne vaut rien : seule la mesure
tranche. Le banc d'essai de l'atelier offre deux protocoles complémentaires.
Le test de consistance exécute N fois la même version sur le même portfolio et
mesure la stabilité des sorties. Le test A/B confronte deux versions sur le
même portfolio et objective ce que votre modification change réellement —
verdicts qui basculent, compétences qui apparaissent ou disparaissent, coût
qui dérive. Ce chapitre apprend à construire ces expériences sur des
portfolios de test, à lire leurs métriques sans se raconter d'histoires, et à
consigner les résultats là où ils serviront : dans le changelog du paquet.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - monter un test de consistance multi-run et interpréter ses métriques ;
> - conduire une comparaison A/B entre deux versions d'un paquet sur un portfolio de test ;
> - reconnaître les pièges classiques : surapprentissage du portfolio de test, échantillon trop petit, variation de modèle non contrôlée ;
> - consigner un résultat de banc d'essai de manière reproductible.

## 0. Ouvrir le banc d'essai

Le banc d'essai est la section **Banc d'essai** de l'atelier, à la route
`#/promptologue/banc-essai`. Vous y composez une expérience en quatre choix :
un **Mode**, une ou deux **versions** à tester, un **Portfolio de test**, et
un **Fournisseur LLM**. Le bouton **Lancer** exécute ; pendant le run, un
bouton **Interrompre** apparaît et l'atelier affiche la progression (« Jour
x/y — n appel(s) LLM »).

Le sélecteur de version propose trois familles d'entrées :

- le **moteur embarqué** : `aurora-v3-reconstruit@1.0.0 (moteur embarqué)`,
  toujours disponible, qui sert d'étalon de référence commun ;
- les versions **publiées** sur le serveur ;
- vos **brouillons** (« mon brouillon ») — et uniquement les vôtres, car un
  brouillon ne s'exécute que chez son auteur.

## 1. Les portfolios de test

On ne teste jamais un prompt sur les données réelles d'un apprenant sans son
consentement explicite. Le banc d'essai fournit pour cela une **fixture
embarquée**, fictive : « Fixture embarquée : Maya, 3 journées ». Elle est
suffisante pour la plupart des comparaisons rapides et n'expose personne.

Vous pouvez aussi sélectionner un **portfolio local** (chargé dans votre
navigateur) si vous en avez un et que son usage est légitime. Deux principes :

- **Le fictif d'abord.** Pour itérer, la fixture suffit et évite tout risque.
- **Le consentement toujours.** Un portfolio réel n'entre au banc que si la
  personne concernée a explicitement accepté cet usage.

## 2. Le test de consistance multi-run

**Protocole.** Choisissez le mode **Multi-run (consistance)**, une version, un
portfolio, un nombre de runs (de 2 à 5), puis **Lancer**. Le banc exécute N
fois la même version sur les mêmes entrées et compare les sorties.

**Métriques.** Le résultat affiche d'abord une **distance structurelle
moyenne**, où *0 = runs identiques* et *1 = désaccord maximal*. Puis, journée
par journée, un **taux d'accord** en pourcentage, la liste des compétences
**stables** (même statut à tous les runs) et des compétences **divergentes**
(statut variable selon les runs), avec les statuts observés et les numéros de
runs concernés.

**Lecture.** Une compétence stable est fiable : le protocole la tranche de la
même façon à chaque fois. Une compétence divergente signale une zone de
fragilité — souvent une pièce « à la frontière », que le pédagogue affaiblit
un coup sur deux. Un niveau de variabilité acceptable dépend de l'usage : sur
les compétences que l'on partagera à un employeur, on vise une grande
stabilité ; une divergence persistante est un argument pour renforcer une
consigne ou pour laisser le statut « renvoi au cartographe » faire son office.

> **À retenir** — La consistance n'est pas un détail esthétique. Une version
> qui « voit plus de compétences » mais les voit de façon instable est moins
> utile qu'une version plus sobre mais reproductible.

## 3. La comparaison A/B

**Protocole.** Choisissez le mode **A/B (deux versions)**, réglez **Version A**
et **Version B**, le même portfolio et le même fournisseur, puis **Lancer**.
Le banc exécute successivement A puis B et aligne leurs résultats.

**Ce que le rapport montre.** Un tableau de synthèse compare A et B sur :
*Compétences établies (total)*, *Appels LLM*, *Durée mesurée* et une
*Estimation (coût / durée)*. Puis, journée par journée, un tableau indique les
compétences **Communes**, **Seulement A** et **Seulement B**. Un lien
**Télécharger le rapport JSON** vous permet d'archiver l'expérience.

**Variables à contrôler.** Pour qu'un A/B mesure votre modification et rien
d'autre, tenez fixes : le **modèle** (même fournisseur, même modèle),
le **référentiel**, et le **portfolio**. Changer le prompt *et* le modèle en
même temps, c'est ne plus savoir ce qui a produit l'écart.

**Distinguer amélioration et déplacement.** « B établit trois compétences de
plus que A » n'est pas en soi un progrès. Ces trois compétences sont-elles
justifiées, ou B est-il simplement redevenu complaisant ? Regardez *lesquelles*
apparaissent, et croisez avec la consistance : un gain qui s'accompagne d'une
divergence accrue est suspect.

## 4. Interpréter sans complaisance

La sycophantie que le protocole combat chez le LLM existe aussi chez le
promptologue envers son propre prompt. Vous *voulez* que votre version soit
meilleure ; ce désir biaise la lecture. Trois garde-fous :

- **La contre-hypothèse systématique.** Pour chaque « B est meilleur »,
  formulez « B est seulement plus laxiste » et cherchez à la réfuter avec les
  données, pas avec l'intuition.
- **Le regard tiers.** Le cartographe est votre allié : il relit des
  cartographies réelles et repère les hallucinations et les oublis que vos
  métriques agrègent. Une divergence que vous trouvez « acceptable » peut lui
  sauter aux yeux.
- **Le statut « renvoi » comme signal.** Une version qui transforme des
  « renvoi au cartographe » en « présence établie » n'a pas forcément gagné en
  justesse : elle a peut-être simplement cessé de douter.

## 5. Les pièges classiques

| Piège | Symptôme | Détection |
|---|---|---|
| **Surapprentissage** d'un portfolio unique | B brille sur Maya, régresse ailleurs | Tester sur plusieurs portfolios de test, pas un seul |
| **Échantillon trop petit** | Conclusion tirée de 2–3 runs | Augmenter le nombre de runs ; méfiance sous 3 |
| **Modèle non contrôlé** | Écart de coût ou de qualité inexpliqué | Vérifier que A et B tournent sur le même fournisseur / modèle |
| **Coûts comparés sans modèles comparés** | « B est moins cher » alors que B tourne sur un modèle différent | Aligner le modèle avant de comparer l'estimation |

## 6. Consigner et publier

Un résultat de banc d'essai qui reste dans votre tête n'existe pas. Au moment
de publier la version (chapitre 3, bouton **Publier…**), **reportez dans le
changelog** l'essentiel de l'expérience : le portfolio de test utilisé, le
mode (A/B ou multi-run) et ses paramètres, le fournisseur et le modèle, et le
constat chiffré. Pour un A/B, le **rapport JSON téléchargé** est la pièce
justificative : un autre promptologue doit pouvoir, à partir de votre compte
rendu, **rejouer** l'expérience et retomber sur des conclusions comparables.

> **À retenir** — Le banc d'essai ne « prouve » pas qu'une version est bonne ;
> il documente *ce que vous avez mesuré, dans quelles conditions*. C'est cette
> traçabilité, pas la conviction, qui fait avancer l'état de l'art commun.

Le chapitre suivant — [05-se-mesurer-au-golden-prompt.md](05-se-mesurer-au-golden-prompt.md) —
situe ces mesures par rapport à l'étalon interne de la plateforme, le Golden
Prompt, et explique honnêtement ce à quoi vous avez — et n'avez pas — accès.
