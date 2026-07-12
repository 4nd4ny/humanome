<?php

declare(strict_types=1);

namespace Humanome\Packages;

/** Published prompt-package versions are immutable — re-import with a different content is refused. */
final class PackageConflictException extends \RuntimeException
{
}
