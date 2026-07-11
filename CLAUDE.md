# humanome.xyz

## Résumé du projet

humanome.xyz (human + genome) est la plateforme de cartographie de compétences humaines
de l'écosystème scolaire RESPIRE (Harmonia Éducation). Des apprenants construisent une
cartographie de leurs compétences à partir de leur portfolio réflexif, analysé par des
prompts LLM versionnés (promptologues), relu et garanti par des humains (cartographes),
sur la base d'un référentiel de 61 compétences en 7 pôles, édité collectivement
(épistémiarques). La visualisation centrale est un sunburst évolutif dans le temps
(vue merge chronologique + vue journée). Les cartographies validées peuvent être
partagées avec des employeurs (lien + mot de passe). Le tout est RGPD-by-design :
le portfolio ne quitte jamais le navigateur par défaut, tout stockage serveur est opt-in.
Spécification complète : `docs/cahier-des-charges.md` ; plan de construction : `docs/plan-prompts.md`.

## Stack (ADR-002)

- **Backend** : PHP 8.2 + Slim 4 + PDO + MySQL 8 (utf8mb4). Pas d'ORM, pas de framework lourd.
- **Frontend** : Vite + React 18. Routing par hash (ADR-009). DOMPurify pour le HTML narratif (ADR-007).
- **Moteur** : `engine/` — package ESM sans dépendance DOM, s'exécute dans le navigateur (ADR-001).
- **Tests** : PHPUnit (via Docker php:8.2), Vitest, Playwright (e2e, local uniquement).

## Contraintes d'hébergement (OVH mutualisé — docs/hebergement.md)

- Pas de Node serveur : build front en local, artefacts statiques déployés (ADR-003).
- Pas de processus longs : les runs LLM tournent côté client (ADR-001) ; la masse passe
  par une file de jobs MySQL + cron à ticks courts < 50 s (ADR-005).
- Pas de SSH : déploiement FTP par releases + pointeur `current.txt` + endpoint migrate (ADR-008).
- Secrets dans `~/app/shared/.env` (hors webroot), jamais dans le dépôt ni dans `www/`.
- PHP local = 8.5 ≠ cible 8.2 : **tout PHP (composer, tests) s'exécute via Docker php:8.2**.

## Principes RGPD non négociables (cahier §6)

1. Aucune donnée de portfolio stockée côté serveur par défaut ; export local systématique.
2. Stockage serveur = opt-in explicite de l'apprenant, chiffré quand il s'agit de clés API (ADR-004).
3. Export/suppression de compte en un clic, purge réelle + événement d'audit.
4. Partage employeur = décision explicite individuelle (lien + mot de passe), jamais automatique.
5. Journalisation minimale : compteurs, jamais de contenu.

## Conventions

- Documentation et UI en **français** ; code, commits et identifiants en **anglais**.
- Un commit par lot cohérent ; tests verts avant commit ; `STATUS.md` mis à jour en fin de session.
- `assets-existants/` est en **lecture seule absolue** (données réelles + prototypes de référence).
- Les schémas JSON (`schemas/`) sont le contrat entre modules : toute friction de format
  se documente dans `docs/contrats.md`, on ne renomme pas un champ pour contourner.
- Répertoires de build (`node_modules/`, `vendor/`, `dist/`) marqués `com.dropbox.ignored`
  (le dépôt vit dans Dropbox) — refaire `xattr -w com.dropbox.ignored 1 <dir>` s'ils sont recréés.
- Sauvegarde hebdomadaire tant que GitHub est reporté : `git bundle create ../humanome-backup.bundle --all`.

## Commandes

- API : `docker compose up -d` puis http://localhost:8080/api/health ;
  tests : `docker compose run --rm php composer test`.
- Composer : `docker compose run --rm php composer <cmd>` (jamais le composer local).
- Front : `cd web && npm run dev` (proxy /api → docker) ; `npm test` ; `npm run build`.
- Moteur : `cd engine && npm test`.
- Déploiement : `node scripts/deploy/deploy.mjs` (credentials dans `.env.deploy`, gitignoré).
