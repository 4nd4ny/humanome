<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

$app = \Humanome\Bootstrap::createApp();
$app->run();
