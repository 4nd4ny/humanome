# ADR-003 — Build du front en local/CI, artefacts statiques déployés tels quels

## Statut

Accepté — 2026-07 (décision pré-actée AD-3 du plan de construction).

## Contexte

Le frontend est construit avec Vite + React 18 (ADR-002), ce qui suppose une chaîne
de build Node (npm, bundling, minification). Or l'hébergement v1 est un **serveur
mutualisé OVH** (§5) :

- **aucun runtime Node n'y est disponible** — seul PHP est exécuté (cf. ADR-002,
  `.ovhconfig` en PHP 8.2) ;
- pas de pipeline de build côté hébergeur, pas de processus longs (§8, ADR-001).

Par ailleurs, la logique de « clone déployable » (§5) exige qu'un tiers puisse
monter sa propre instance sur un hébergement équivalent : la procédure de
déploiement doit donc fonctionner sans rien exiger du serveur au-delà de
PHP/MySQL/FTP (le mutualisé n'offre ni SSH ni SFTP, cf. ADR-008).

Enfin, la visualisation unifiée (§4.4) est « publiée en onglet principal du site »
comme démo publique : ce sont des fichiers statiques (HTML/CSS/JS) par nature, qui
n'ont aucune raison d'être générés à la volée.

## Décision

**Aucun outil Node n'est installé ni exécuté sur le serveur OVH.**

- Le build (`npm run build` dans `web/`) s'exécute **en local sur la machine du
  développeur ou en CI**, jamais sur l'hébergement.
- Le build produit des **artefacts statiques** (répertoire `dist/` : HTML, JS, CSS,
  assets) qui sont **déployés tels quels** vers OVH par FTPS via le script de
  déploiement (P13, modalités détaillées dans l'ADR-008).
- Le serveur sert ces fichiers statiquement (Apache mutualisé) ; seule l'API
  (`api/`, PHP) est exécutée côté serveur.
- `node_modules/` et `dist/` sont exclus du dépôt (`.gitignore`) ; le dépôt contient
  les sources, la CI ou le développeur produit les artefacts.
- Le moteur `engine/` (ADR-001) suit la même règle : il est bundlé dans les
  artefacts front, jamais exécuté par un Node serveur (le runner CLI Node de
  l'ADR-005 tourne chez l'établissement ou en local, pas sur OVH).

## Conséquences

Positives :

- Compatibilité totale avec le mutualisé OVH (§5) : le déploiement se réduit à un
  transfert de fichiers + migrations SQL.
- Le clone déployable (§5) reste accessible : un tiers sans chaîne Node sur son
  hébergeur peut déployer les artefacts pré-buildés ou builder localement.
- Surface d'attaque serveur réduite : pas de toolchain Node exposée en production.
- Reproductibilité : le build CI produit des artefacts identiques et versionnés
  (utile pour le rollback documenté en P13).

Négatives / à assumer :

- Le déploiement dépend d'une machine de build (poste local ou CI) : la procédure
  doit être documentée dans `INSTALL.md` et `scripts/deploy/` (P13, ADR-008) pour ne pas
  reposer sur la configuration d'une seule personne.
- Pas de rendu côté serveur (SSR) possible — acceptable : les pages publiques
  critiques (démo §3.1, référentiel §4.1) restent utilisables sans SSR, et le
  contenu sensible est de toute façon côté client (ADR-001).
- Il faut veiller à la synchronisation version front ↔ version API lors des
  déploiements (les artefacts embarquent un identifiant de version).

Réversibilité : si l'hébergement cible v2+ (§5) offre un pipeline de build, la CI
pourra y être déplacée sans changer le principe « le serveur ne builde pas ».
