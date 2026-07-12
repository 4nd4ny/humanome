<?php

declare(strict_types=1);

namespace Humanome;

use Humanome\Middleware\SecurityHeaders;
use Slim\App;
use Slim\Factory\AppFactory;

/**
 * Application factory. Routes are modular: each file in src/routes/<module>.php
 * returns a closure `function (Slim\App $app): void` and is loaded here by
 * sorted glob(). New modules (auth.php, referentiel.php, ...) plug in by
 * dropping a file — Bootstrap itself never changes.
 */
final class Bootstrap
{
    public static function createApp(): App
    {
        $envDir = self::envDir();
        if ($envDir !== null && is_file($envDir . '/.env')) {
            \Dotenv\Dotenv::createImmutable($envDir)->safeLoad();
        }

        $app = AppFactory::create();
        $app->setBasePath('/api');
        $app->addRoutingMiddleware();
        $app->addErrorMiddleware(Env::get('APP_ENV', 'production') === 'dev', true, true);

        foreach (self::routeFiles() as $file) {
            /** @var callable(App): void $register */
            $register = require $file;
            $register($app);
        }

        // Added LAST on purpose: in Slim the last-added middleware runs first
        // (outermost), so SecurityHeaders decorates EVERY response on the way
        // out — including the 401/403 short-circuited by inner guards and the
        // 404/500 synthesised by the error middleware (P12.3).
        $app->add(new SecurityHeaders());

        return $app;
    }

    /**
     * Application version: APP_VERSION env, else the VERSION file at the
     * release root (releases/<ts>/VERSION, ADR-008), else "dev".
     */
    public static function version(): string
    {
        $version = Env::get('APP_VERSION');
        if ($version !== '') {
            return $version;
        }

        // Release layout: <release>/VERSION next to src/ (ADR-008); repo has none.
        foreach ([dirname(__DIR__) . '/VERSION', dirname(__DIR__, 2) . '/VERSION'] as $versionFile) {
            if (is_file($versionFile)) {
                $content = trim((string) file_get_contents($versionFile));
                if ($content !== '') {
                    return $content;
                }
            }
        }

        return 'dev';
    }

    /** @return list<string> */
    private static function routeFiles(): array
    {
        $files = glob(__DIR__ . '/routes/*.php') ?: [];
        sort($files, SORT_STRING);

        return $files;
    }

    /**
     * Secrets directory: ~/app/shared on OVH (outside webroot), the api/ dir in dev.
     */
    private static function envDir(): ?string
    {
        $candidates = [
            Env::get('HUMANOME_SHARED_DIR'), // set by the www/api front controller (ADR-008)
            dirname(__DIR__, 3) . '/shared', // OVH: ~/app/releases/<ts>/src -> ~/app/shared
            dirname(__DIR__),                // dev: api/.env
        ];
        foreach ($candidates as $dir) {
            if ($dir !== '' && is_file($dir . '/.env')) {
                return $dir;
            }
        }

        return null;
    }
}
