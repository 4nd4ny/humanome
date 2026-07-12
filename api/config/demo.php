<?php

declare(strict_types=1);

/**
 * Configuration administrateur de la démo publique (cahier §3.8 : « un
 * fichier de configuration édité à la main suffit en v1 »).
 *
 * Ce fichier gouverne le proxy LLM plateforme (POST /api/llm) utilisé par les
 * visiteurs SANS compte (cahier §3.1) : le serveur IMPOSE fournisseur, modèle
 * et plafond de tokens — les valeurs envoyées par le client sont ignorées
 * (protection du budget).
 *
 * Chaque clé est surchargeable par variable d'environnement (~/app/shared/.env
 * en production, docker-compose.yml en dev) — la variable, si non vide, gagne
 * sur la valeur ci-dessous :
 *
 *   enabled            DEMO_ENABLED              Interrupteur général de la démo.
 *                                                false -> POST /api/llm répond 503.
 *                                                Valeurs env : 1/0, true/false, on/off.
 *   provider           DEMO_PROVIDER             'anthropic' (clé plateforme lue dans
 *                                                ANTHROPIC_API_KEY, jamais exposée)
 *                                                ou 'mock' (réponses simulées depuis
 *                                                schemas/fixtures/, dev sans clé).
 *   model              DEMO_MODEL                Modèle imposé côté serveur.
 *   maxTokensPerRequest DEMO_MAX_TOKENS_PER_REQUEST
 *                                                Plafond de tokens de sortie par appel,
 *                                                imposé quel que soit le client.
 *   maxInputChars      DEMO_MAX_INPUT_CHARS      Taille maximale de l'entrée
 *                                                (system + prompt), en caractères.
 *   perIpPerHour       DEMO_PER_IP_PER_HOUR      Quota de requêtes par IP et par heure
 *                                                (fenêtre fixe, buckets hachés dans
 *                                                rate_limits — jamais d'IP brute, §6).
 *                                                Quota PARTAGÉ entre POST /api/llm et
 *                                                GET /api/gdoc-text.
 *   dailyGlobalTokens  DEMO_DAILY_GLOBAL_TOKENS  Plafond global journalier (UTC) de
 *                                                tokens entrée+sortie, toutes IP
 *                                                confondues. Dépassé -> 503
 *                                                « démo épuisée pour aujourd'hui ».
 *   dailyBudgetUsd     DEMO_DAILY_BUDGET_USD     Coupe-circuit budgétaire journalier
 *                                                (coût estimé, USD).
 *   powDifficultyBits  DEMO_POW_DIFFICULTY_BITS  Difficulté de la preuve de travail :
 *                                                nombre de bits à zéro en tête de
 *                                                sha256(challenge . ':' . nonce).
 *                                                ~2^N hachages côté client (20 bits
 *                                                ≈ 1 s sur un navigateur moderne).
 *   upstreamTimeoutSeconds DEMO_UPSTREAM_TIMEOUT Délai maximal (s) d'un appel au
 *                                                fournisseur amont (pas de streaming
 *                                                sur mutualisé : appel bufferisé).
 *
 * Secret de la preuve de travail : POW_SECRET (env). S'il est absent, un
 * secret est dérivé de MIGRATE_TOKEN (sha256) — voir Llm/PowChallenge. Si ni
 * l'un ni l'autre n'est défini, GET /api/llm/challenge répond 503.
 *
 * Tarifs par modèle (USD par million de tokens) pour l'estimation de coût du
 * coupe-circuit : voir Llm/Pricing (préfixe de modèle le plus long gagnant).
 */

return [
    'enabled' => true,
    'provider' => 'anthropic', // 'anthropic' | 'mock'
    'model' => 'claude-haiku-4-5-20251001',
    'maxTokensPerRequest' => 2048,
    'maxInputChars' => 20000,
    'perIpPerHour' => 20,
    'dailyGlobalTokens' => 2000000,
    'dailyBudgetUsd' => 5.0,
    'powDifficultyBits' => 20,
    'upstreamTimeoutSeconds' => 60,
];
