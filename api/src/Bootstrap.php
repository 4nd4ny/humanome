<?php

declare(strict_types=1);

namespace Humanome;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use Slim\Factory\AppFactory;

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
        $app->addErrorMiddleware(self::env('APP_ENV', 'production') === 'dev', true, true);

        $app->get('/health', function (Request $request, Response $response): Response {
            $payload = [
                'status' => 'ok',
                'version' => self::env('APP_VERSION', 'dev'),
            ];
            $response->getBody()->write(json_encode($payload, JSON_THROW_ON_ERROR));

            return $response->withHeader('Content-Type', 'application/json');
        });

        return $app;
    }

    /**
     * Secrets directory: ~/app/shared on OVH (outside webroot), the api/ dir in dev.
     */
    private static function envDir(): ?string
    {
        $candidates = [
            dirname(__DIR__, 3) . '/app/shared', // OVH: releases/<ts>/api/src -> ~/app/shared
            dirname(__DIR__),                    // dev: api/.env
        ];
        foreach ($candidates as $dir) {
            if (is_file($dir . '/.env')) {
                return $dir;
            }
        }

        return null;
    }

    private static function env(string $key, string $default): string
    {
        $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);

        return is_string($value) && $value !== '' ? $value : $default;
    }
}
