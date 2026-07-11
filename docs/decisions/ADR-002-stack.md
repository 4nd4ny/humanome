# ADR-002 — Stack technique : PHP 8.2 + Slim 4 + MySQL 8, front Vite + React 18

## Statut

Accepté — 2026-07 (décision pré-actée AD-2 du plan de construction).

## Contexte

Le cahier des charges fixe le backend : « PHP + MySQL » avec « prototype sur serveur
mutualisé (OVH) en phase de développement » (§4.5, §5). Il impose aussi :

- une logique de **« clone déployable »** (§5) : « n'importe qui doit pouvoir
  réimporter référentiel, profil, portfolios et cartographies pour redémarrer sa
  propre instance de la plateforme » — donc une stack simple à installer sur un
  hébergement bas de gamme, sans orchestration lourde ;
- un **frontend JSX déjà développé** (§4.4, §9) : l'interface de navigation
  chronologique et la page HTML/JS de cartographie-jour existent et doivent être
  fusionnées, pas recréées ;
- des contraintes d'hébergement mutualisé : pas de Node serveur, pas de processus
  longs (cf. ADR-001, ADR-003, ADR-005).

Note vérifiée : le serveur mutualisé OVH est configuré en **PHP 8.2** (`.ovhconfig`),
ce qui répond à la question ouverte Q4 du plan et fixe la version cible.

## Décision

**Backend :**

- **PHP 8.2** — version effective du mutualisé OVH ; on cible exactement ce que
  l'hébergeur exécute.
- **Slim 4** — micro-framework de routage/middleware : suffisant pour une API REST
  (proxy LLM, comptes, référentiel, partage), sans imposer la structure ni les
  dépendances d'un framework lourd (Symfony, Laravel), incompatibles avec l'objectif
  de portabilité « clone déployable » (§5) et surdimensionnées pour un serveur qui
  n'est « que proxy LLM + persistance opt-in » (ADR-001).
- **PDO** en accès direct, **pas d'ORM** : le schéma est petit, maîtrisé, et le
  non-stockage par défaut du portfolio (§6.1) rend la couche de persistance mince.
- **MySQL 8, charset `utf8mb4`** : disponible sur le mutualisé (§4.5) ; `utf8mb4`
  obligatoire pour les portfolios multilingues et les émojis éventuels.

**Frontend :**

- **Vite + React 18** : le JSX existant (§9) s'y intègre nativement ; Vite produit
  des artefacts statiques déployables tels quels sur le mutualisé (ADR-003).
  Responsive mobile + version imprimable requis (§4.4, §5).

**Tests :**

- **PHPUnit** (API PHP), **Vitest** (moteur `engine/` et front), **Playwright**
  (parcours e2e, notamment le parcours apprenant §3.2 et le partage employeur §3.6).

## Conséquences

Positives :

- Déployable sur n'importe quel mutualisé PHP/MySQL : le clone déployable (§5) reste
  une réalité, pas une promesse.
- Peu de dépendances = surface d'audit réduite (important pour la crédibilité RGPD
  §6) et maintenance possible avec des ressources limitées (§7).
- Le JSX existant est réutilisé, conformément au §9 (« à intégrer, pas à recréer »).
- Trois niveaux de tests couvrent les trois couches réelles du système (API, moteur,
  parcours utilisateur).

Négatives / à assumer :

- Slim 4 + PDO impliquent d'écrire soi-même migrations, validation et autorisation
  (prévus en P3) ; c'est un coût assumé en échange de la portabilité.
- MySQL mutualisé limite les options (pas de réplication pilotable, quotas) ;
  acceptable en v1, à revoir pour l'hébergement cible v2+ (§5).
- React 18 fige une version majeure ; toute montée de version fera l'objet d'une
  mise à jour de cet ADR.

Réversibilité : la cible v2+ (§5, « provider permettant un déploiement à grande
échelle ») pourra faire évoluer l'hébergement sans changer la stack ; un changement
de framework ou de SGBD exigerait un nouvel ADR.
