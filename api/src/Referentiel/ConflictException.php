<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use RuntimeException;

/** Business conflict (immutability, non-increasing semver, duplicate version) — HTTP 409. */
final class ConflictException extends RuntimeException
{
}
