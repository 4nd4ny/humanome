<?php

declare(strict_types=1);

/**
 * Configuration serveur versionnable de la plateforme (cahier §3.8/§4.10 :
 * « une interface d'administration simple — un fichier de configuration édité
 * à la main — suffit en v1 »). Ce fichier documente, en un seul endroit, les
 * variables d'environnement lues par l'application et leurs valeurs par défaut.
 *
 * PRINCIPE : ce fichier est versionné dans le dépôt ; il ne contient JAMAIS de
 * secret. Les secrets (mot de passe MySQL, ANTHROPIC_API_KEY, MIGRATE_TOKEN,
 * POW_SECRET, SODIUM_MASTER_KEY…) et le Golden Prompt restent HORS GIT, dans
 * ~/app/shared/.env (hors webroot, ADR-004/ADR-008). Pour ces entrées, le
 * fichier n'expose que le fait qu'une valeur est configurée (`configured`),
 * jamais la valeur elle-même — c'est ce que l'UI admin (section « Réglages
 * serveur ») affiche.
 *
 * Chaque valeur est surchargeable par variable d'environnement : la variable,
 * si non vide, gagne sur le défaut ci-dessous (voir api/src/Env.php). En prod
 * les env vivent dans ~/app/shared/.env ; en dev dans docker-compose.yml.
 *
 * Retour : une liste de groupes, chacun décrivant ses entrées. Une entrée
 * `secret` n'expose que `configured` (booléen) ; une entrée publique expose sa
 * `value` effective. L'UI et GET /api/admin/settings s'appuient sur cette
 * forme (api/src/Admin/PlatformStatus.php).
 */

use Humanome\Env;

/** Un secret : présent ou non, jamais sa valeur. */
$secret = static fn (string $env, string $description): array => [
    'env' => $env,
    'description' => $description,
    'secret' => true,
    'configured' => Env::get($env) !== '',
];

/** Une valeur publique versionnable : nom d'env, défaut, valeur effective. */
$value = static fn (string $env, string $default, string $description): array => [
    'env' => $env,
    'description' => $description,
    'secret' => false,
    'default' => $default,
    'value' => Env::get($env, $default),
];

return [
    'application' => [
        'APP_ENV' => $value('APP_ENV', 'production', 'Environnement : production (erreurs masquées) ou dev.'),
        'APP_VERSION' => $value('APP_VERSION', '', 'Version déployée ; à défaut, lue dans le fichier VERSION de la release (ADR-008).'),
    ],
    'database' => [
        'DB_HOST' => $value('DB_HOST', 'mysql', 'Hôte MySQL (OVH : example123.mysql.db).'),
        'DB_PORT' => $value('DB_PORT', '3306', 'Port MySQL.'),
        'DB_NAME' => $value('DB_NAME', '', 'Nom de la base.'),
        'DB_USER' => $value('DB_USER', '', 'Utilisateur MySQL (non secret ; le mot de passe l\'est).'),
        'DB_PASSWORD' => $secret('DB_PASSWORD', 'Mot de passe MySQL — hors git (~/app/shared/.env).'),
    ],
    'secrets' => [
        // Uniquement l'état « configuré ou non » — jamais la valeur.
        'MIGRATE_TOKEN' => $secret('MIGRATE_TOKEN', 'Jeton du script de déploiement (POST /api/admin/migrate, ADR-008).'),
        'ANTHROPIC_API_KEY' => $secret('ANTHROPIC_API_KEY', 'Clé plateforme du proxy LLM (démo + provider « humanome »). Jamais exposée.'),
        'POW_SECRET' => $secret('POW_SECRET', 'Secret HMAC de la preuve de travail anti-abus de la démo (P6).'),
        'SODIUM_MASTER_KEY' => $secret('SODIUM_MASTER_KEY', 'Clé maîtresse libsodium des clés API chiffrées au repos (AD-4).'),
    ],
    'llm' => [
        // La démo se règle finement dans api/config/demo.php (surchargée par
        // les DEMO_* de l'env) ; l'UI admin en affiche les valeurs effectives.
        'DEMO_ENABLED' => $value('DEMO_ENABLED', '', 'Interrupteur général de la démo publique (défaut : activée si vide). Détails dans config/demo.php.'),
    ],
];
