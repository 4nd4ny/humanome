# Hébergement — OVH mutualisé (état vérifié le 2026-07-12)

## Réponses aux questions du plan-prompts (Q4)

| Question | Réponse vérifiée |
|---|---|
| Version PHP | **8.2** (`.ovhconfig` : `app.engine.version=8.2`, `container.image=stable64`) — conforme à la cible ADR-002 |
| Version MySQL | **8.0.46** (vérifié le 2026-07-12 par sonde PDO exécutée sur le cluster humanome.xyz). Base OVH mutualisée existante, hébergée sur un autre hébergement OVH (`example123.mysql.db`), **joignable depuis humanome.xyz**, charset serveur utf8mb4 — conforme ADR-002. PHP webroot vérifié : 8.2.29. Credentials hors repo (`cahier des charges/mysql.txt` côté poste de travail → `.env` local et `~/app/shared/.env` serveur) |
| Accès cron | À vérifier dans le panel OVH au moment de M3/M8 (les mutualisés OVH incluent des tâches planifiées) |
| Accès SSH/SFTP | **FTP uniquement** testé et fonctionnel (`ftp.clusterNNN.hosting.ovh.net`). SSH non fourni dans les accès. **FTPS non supporté par ce cluster** (AUTH TLS/SSL → « 500 This security scheme is not implemented », vérifié le 2026-07-12) → transferts en FTP simple, `FTP_SECURE=false` dans `.env.deploy` |
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
