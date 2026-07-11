# ADR-001 — Exécution client-first du moteur de cartographie

## Statut

Accepté — 2026-07 (décision pré-actée AD-1 du plan de construction).

## Contexte

Le cœur du produit est le moteur de cartographie (§4.3) : découpage journalier d'un
portfolio réflexif, cartographie LLM jour par jour, puis fusion (« merge ») révélant
les compétences transversales. Deux contraintes fortes s'imposent à son lieu
d'exécution :

1. **Durée des runs.** Le cahier des charges (§8) identifie qu'« un run peut prendre
   plusieurs heures selon la taille du portfolio et le nombre de tokens ». Or
   l'hébergement v1 est un serveur **mutualisé OVH** (§5), qui interdit les processus
   PHP longs (timeout de quelques dizaines de secondes, pas de démon, pas de worker
   résident). Un run de plusieurs heures ne peut donc pas être une requête serveur.

2. **RGPD by design.** Le §6.1 impose qu'« aucune donnée de portfolio n'est stockée
   côté serveur par défaut », le §6.2 que le stockage serveur soit un opt-in
   explicite, et le §4.2 que le contenu du portfolio soit « non stocké par défaut »
   côté serveur. Le §8 rappelle que la RGPD est « à traiter comme contrainte de
   conception dès la v1, pas en couche ajoutée après coup ». Si le moteur tournait côté serveur, le
   portfolio devrait transiter et résider sur le serveur — en contradiction directe
   avec ces principes.

Par ailleurs, le §3.2 prévoit un stockage « uniquement en local (navigateur) » par
défaut, et le §5 prévoit que les utilisateurs avancés fournissent leur propre clé API
pour appeler directement un modèle frontière.

## Décision

**Le moteur de cartographie s'exécute dans le navigateur de l'utilisateur.**

- Le portage JavaScript des prompts Python (§5, §9) est un package `engine/` sans
  dépendance DOM, exécutable dans le navigateur (et en Node pour les tests et le
  runner de masse, cf. ADR-005).
- Le pipeline applique le **découpage journalier** puis le **merge** (§4.3)
  entièrement côté client.
- Chaque journée cartographiée produit un **checkpoint persisté dans IndexedDB** ;
  un run de plusieurs heures (§8) survit ainsi à un rechargement d'onglet, une
  fermeture du navigateur ou une coupure réseau, avec **reprise après interruption**
  au dernier checkpoint.
- Les appels LLM se font soit **directement depuis le navigateur** avec la clé API
  personnelle de l'utilisateur (§4.5, §5), soit via le proxy serveur.

**Le serveur est réduit à deux rôles :**

1. **Proxy LLM** (`POST /api/llm`) pour la démo visiteur (§3.1 : LLM peu coûteux,
   coûts masqués, garde-fous anti-abus) et les clés plateforme/établissement.
2. **Persistance opt-in** : stockage de cartographies ou de portfolios uniquement
   sur demande explicite de l'apprenant (§4.2, §6.2), plus les fonctions de compte
   (auth, rôles, partage, référentiel).

## Conséquences

Positives :

- Conformité structurelle au §6 : par défaut, le portfolio ne quitte jamais le
  navigateur ; il n'y a rien à « protéger » côté serveur puisque rien n'y transite.
- Compatible avec le mutualisé OVH (§5) : aucune requête serveur longue ; le serveur
  ne fait que des opérations courtes (proxy, CRUD).
- Coût serveur marginal quasi nul, aligné avec la contrainte de trésorerie (§7).
- L'objectif humaniste (§1 : accès depuis un simple smartphone) est servi : le
  moteur doit rester léger et fonctionner sur mobile.

Négatives / à assumer :

- La qualité de l'expérience dépend de l'appareil de l'utilisateur (onglet ouvert
  pendant le run) ; les checkpoints IndexedDB et la reprise sont donc **obligatoires**,
  pas optionnels.
- Les appels LLM directs depuis le navigateur exposent aux contraintes CORS des
  fournisseurs ; le transport « proxy » sert de repli.
- La cartographie de masse des établissements (§3.7) ne peut pas reposer sur un
  navigateur ouvert : elle est traitée séparément par l'ADR-005 (file de jobs +
  worker cron / runner CLI), qui réutilise le même moteur `engine/`.
- Le code du moteur étant livré au client, il est public de fait — cohérent avec
  l'open source (§5), mais le Golden Prompt (§7) ne doit jamais transiter par ce
  canal sans autorisation administrateur.

Réversibilité : si l'hébergement cible v2+ (§5) lève la contrainte des processus
longs, une exécution serveur pourra être ajoutée par un nouvel ADR, sans casser le
moteur (adaptateur de stockage injectable : IndexedDB, mémoire, disque).
