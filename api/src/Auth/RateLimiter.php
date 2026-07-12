<?php

declare(strict_types=1);

namespace Humanome\Auth;

use PDO;

/**
 * Fixed-window rate limiting over the `rate_limits` table (migration 002).
 *
 * Buckets never contain raw IPs or emails — callers hash them first
 * (journalisation minimale, cahier §6.5). Increments are atomic
 * (INSERT ... ON DUPLICATE KEY UPDATE), safe under concurrent requests.
 */
final class RateLimiter
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly int $limit,
        private readonly int $windowSeconds,
    ) {
    }

    /** Attempts already counted in the current window. */
    public function attempts(string $bucket, ?int $now = null): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT counter FROM rate_limits WHERE bucket = ? AND window_start = ?'
        );
        $stmt->execute([$bucket, $this->windowStart($now)]);
        $counter = $stmt->fetchColumn();

        return $counter === false ? 0 : (int) $counter;
    }

    public function isBlocked(string $bucket, ?int $now = null): bool
    {
        return $this->attempts($bucket, $now) >= $this->limit;
    }

    /** Count one attempt; returns the new counter for the current window. */
    public function hit(string $bucket, ?int $now = null): int
    {
        $window = $this->windowStart($now);
        $this->pdo->prepare(
            'INSERT INTO rate_limits (bucket, window_start, counter) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE counter = counter + 1'
        )->execute([$bucket, $window]);

        // Opportunistic prune: expired windows of this bucket are dead rows.
        $this->pdo->prepare(
            'DELETE FROM rate_limits WHERE bucket = ? AND window_start < ?'
        )->execute([$bucket, $window]);

        return $this->attempts($bucket, $now);
    }

    /** Forget a bucket (e.g. after a successful login). */
    public function reset(string $bucket): void
    {
        $this->pdo->prepare('DELETE FROM rate_limits WHERE bucket = ?')
            ->execute([$bucket]);
    }

    /**
     * Progressive backoff: 30 s at the first blocked attempt, doubling with
     * each further attempt, capped at the window length.
     */
    public function retryAfter(int $attempts): int
    {
        $excess = min(10, max(0, $attempts - $this->limit - 1));

        return (int) min($this->windowSeconds, 30 * (2 ** $excess));
    }

    private function windowStart(?int $now): int
    {
        $now ??= time();

        return intdiv($now, $this->windowSeconds) * $this->windowSeconds;
    }
}
