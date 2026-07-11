# Hébergement — OVH mutualisé (état vérifié le 2026-07-12)

## Réponses aux questions du plan-prompts (Q4)

| Question | Réponse vérifiée |
|---|---|
| Version PHP | **8.2** (`.ovhconfig` : `app.engine.version=8.2`, `container.image=stable64`) — conforme à la cible ADR-002 |
| Version MySQL | Base **non créée** à ce jour. Les mutualisés OVH actuels fournissent MySQL 8.0 (à confirmer à la création via le panel) |
| Accès cron | À vérifier dans le panel OVH au moment de M3/M8 (les mutualisés OVH incluent des tâches planifiées) |
| Accès SSH/SFTP | **FTP uniquement** testé et fonctionnel (`ftp.clusterNNN.hosting.ovh.net`). SSH non fourni dans les accès. FTPS explicite supporté |
| Domaine pointé | **Oui** : humanome.xyz → 51.91.236.255 (clusterNNN), Apache répond, webroot `www/` vide |

## Topologie serveur (ADR-008)

```
~/                      # home FTP, HORS webroot
  .ovhconfig            # config PHP OVH — ne pas écraser sans raison
  app/
    shared/.env         # secrets : MySQL, clé Anthropic, MIGRATE_TOKEN, clé libsodium
    releases/<ts>/      # code PHP par release (N conservées)
    current.txt         # chemin de la release active (pas de symlink en FTP)
  www/                  # webroot public
    index.html, assets/ # build Vite (noms hashés)
    data/               # JSON statiques (démo, référentiel publié)
    api/index.php       # front-controller : lit ../app/current.txt puis require la release
    .htaccess           # cache + en-têtes sécurité
```

## Accès

- Credentials FTP : fournis hors repo (`cahier des charges/ftp-humanome.xyz.txt` côté
  poste de travail ; repris dans `.env.deploy` local gitignoré).
- Panel OVH (création MySQL, cron) : session navigateur de l'utilisateur (plugin Chrome).

## Déploiement

`node scripts/deploy/deploy.mjs` — sync par manifeste SHA-256 (delta seul), puis
`POST /api/admin/migrate` (token) et smoke `GET /api/health`. Rollback : réécrire
`~/app/current.txt` vers la release précédente. Détails : ADR-008.
