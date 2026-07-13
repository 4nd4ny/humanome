<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use RuntimeException;

/**
 * Thrown by CreditService::debit() when the atomic conditional UPDATE touches
 * zero rows: the balance cannot cover the requested amount (or the account
 * has no credit row at all). Maps to HTTP 402 at the route layer (T3b). The
 * client engine catches it to pause the run and offer a top-up (ADR-010 §3).
 */
final class SoldeInsuffisantException extends RuntimeException
{
    public function __construct(
        private readonly int $balanceMicrousd,
        private readonly int $requestedMicrousd,
    ) {
        parent::__construct('Solde insuffisant');
    }

    public function getBalanceMicrousd(): int
    {
        return $this->balanceMicrousd;
    }

    public function getRequestedMicrousd(): int
    {
        return $this->requestedMicrousd;
    }
}
