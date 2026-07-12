# humanome.xyz

**Cartographier les compétences humaines, à partir d'un portfolio réflexif.**

humanome.xyz (contraction de *human* + *genome*) est un artifact numérique de
l'écosystème scolaire **RESPIRE** (Harmonia Éducation). Il permet à quiconque —
y compris une personne n'ayant qu'un smartphone — de faire reconnaître et
valoriser ses compétences humaines : à partir d'un journal de bord, un moteur
adversarial analyse jour par jour les traces de 61 compétences réparties en
7 pôles, puis fusionne ces journées en une cartographie évolutive, relue et
**garantie par un cartographe humain** avant tout partage.

Site en ligne : **https://humanome.xyz** — démo publique sans compte :
[« Essayer »](https://humanome.xyz/#/essayer).

## Ce que fait la plateforme

- **Visualisation** — un sunburst évolutif (vue chronologique « merge » + vue
  d'une journée), responsive mobile et imprimable ; aucune donnée n'est envoyée
  au serveur pour l'explorer.
- **Démo publique** — coller un texte, obtenir une cartographie en direct via un
  LLM bon marché (garde-fous anti-abus : preuve de travail, quotas, budget).
- **Espace apprenant** — portfolio local (le texte ne quitte jamais le
  navigateur par défaut), lancement de cartographie avec sa propre clé API ou le
  service de la plateforme, confidentialité par cartographie, partage à un
  employeur par lien + mot de passe, export/suppression RGPD en un clic.
- **Cartographe** — relecture, annotation, correction contrôlée par schéma, et
  garantie humaine horodatée (jamais de cartographie 100 % automatisée présentée
  comme validée).
- **Promptologue** — édition et versionnage des paquets de prompts, banc d'essai
  A/B et consistance multi-run, exécution du code des prompts en **sandbox**
  (iframe origine opaque + Web Worker, isolation réseau démontrée).
- **Épistémiarque** — référentiel de compétences public en lecture, versionné,
  édité collectivement (nourri par l'espace participatif Decidim).
- **Établissement** — cartographie de masse de cohortes par file de jobs, budget
  plafonné, avec sa propre infrastructure LLM ou celle de la plateforme.

## Principes

- **RGPD par conception** (§6) : local par défaut, stockage serveur en opt-in
  explicite, purge et export réels.
- **Client-first** : le moteur de cartographie s'exécute dans le navigateur
  (checkpoints, reprise) ; le serveur n'est que proxy LLM et persistance opt-in.
- **Clone déployable** : n'importe qui peut remonter sa propre instance
  ([INSTALL.md](INSTALL.md)).

## Architecture

PHP 8.2 + Slim 4 + PDO + MySQL 8 · front Vite + React 18 · moteur ESM sans DOM ·
hébergement OVH mutualisé (déploiement FTP par releases, sans SSH). Détails et
justifications : [`docs/decisions/`](docs/decisions/) (ADR) et
[`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

## Développer / installer

Voir [INSTALL.md](INSTALL.md). En bref : `docker compose up -d`, migrations,
imports, `cd web && npm run build`. Tests : PHPUnit, Vitest, Playwright.

## Contribuer

Le code (hors Golden Prompt et données personnelles) est ouvert. Les échanges
sur le référentiel de compétences se tiennent sur l'espace participatif
[participer.harmonia.education](https://participer.harmonia.education). Écosystème
RESPIRE : [respire.school](https://respire.school).

## Licence

**AGPL-3.0-only** ([LICENSE](LICENSE)) — pour protéger le modèle « instance
clonable » contre la privatisation : toute version modifiée et déployée doit
elle aussi publier son code source. Les contenus pédagogiques suivent la logique
CC-BY-SA de l'écosystème RESPIRE.
