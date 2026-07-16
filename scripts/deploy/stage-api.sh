#!/usr/bin/env bash
# Stages a PHP release for deployment (ADR-008): copies api/ sources, installs
# production dependencies with the php:8.2 Docker image, stamps VERSION.
# Output: build/api-release/ (flat, ready to upload as app/releases/<ts>/).
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
stage="$repo/build/api-release"

rm -rf "$stage"
mkdir -p "$stage"

cp -R "$repo/api/src" "$stage/src"
cp -R "$repo/api/public" "$stage/public"
cp "$repo/api/composer.json" "$repo/api/composer.lock" "$stage/"

# JSON Schemas: the dual-runtime validation contract (P1) ships with the release
mkdir -p "$stage/schemas"
cp "$repo/schemas/"*.schema.json "$stage/schemas/"
if [ -d "$repo/api/config" ]; then cp -R "$repo/api/config" "$stage/config"; fi
if [ -d "$repo/scripts/migrations" ]; then
  mkdir -p "$stage/scripts"
  cp -R "$repo/scripts/migrations" "$stage/scripts/migrations"
  cp "$repo/scripts/migrate.php" "$stage/scripts/migrate.php" 2>/dev/null || true
fi

# Digest de doc de l'assistant tuteur (D9) — régénéré avant la copie de data.
node "$repo/scripts/build-tuteur-digest.mjs"

# Corpus du seed des compétences atomiques (POST /api/admin/seed-competences)
# + digest tuteur (tuteur-digest.md).
if [ -d "$repo/scripts/data" ]; then
  mkdir -p "$stage/scripts/data"
  cp -R "$repo/scripts/data/." "$stage/scripts/data/"
fi

# Regenerate the PUBLISHED prompt packages imported by `deploy.mjs api`
# (build/prompt-packages/*.json, hash-idempotent server-side): the default
# aurora package (P8) and the forkable Twin6 package (D1/AD-D1). Both derive
# deterministically from committed sources — re-running is a no-op on the server.
node "$repo/scripts/build-default-prompt-package.mjs"
node "$repo/scripts/build-twin6-prompt-package.mjs"

git -C "$repo" describe --always --dirty 2>/dev/null > "$stage/VERSION" || echo "unknown" > "$stage/VERSION"

# Production vendor/ via the same PHP image as the dev stack (no local composer)
docker run --rm -v "$stage":/app -w /app humanome-php \
  composer install --no-dev --optimize-autoloader --no-interaction --quiet

echo "staged release $(cat "$stage/VERSION") in $stage ($(find "$stage" -type f | wc -l | tr -d ' ') files)"
