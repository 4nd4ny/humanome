<?php

// Front controller deployed at ~/www/api/index.php (ADR-008).
// Reads the release pointer (~/app/current.txt) and hands the request to the
// pointed release. Rollback = rewrite current.txt to a previous release.

declare(strict_types=1);

$appDir = dirname(__DIR__, 2) . '/app';
$pointer = @file_get_contents($appDir . '/current.txt');
$release = $pointer === false ? '' : trim($pointer);

// The pointer must be a simple relative path like "releases/20260712-153000".
if ($release === '' || preg_match('#^releases/[A-Za-z0-9._-]+$#', $release) !== 1) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'No release deployed']);
    exit;
}

$entry = $appDir . '/' . $release . '/public/index.php';
if (!is_file($entry)) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'Release entry point missing']);
    exit;
}

putenv('HUMANOME_SHARED_DIR=' . $appDir . '/shared');
require $entry;
