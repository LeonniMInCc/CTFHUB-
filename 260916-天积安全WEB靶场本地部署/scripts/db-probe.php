<?php
// HeaSec 部署自检：数据库连接与 PHP 环境
$results = [];

foreach (['localhost', '127.0.0.1'] as $host) {
    try {
        $pdo = new PDO("mysql:host=$host;port=3306;charset=utf8mb4", 'root', 'root', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $results[] = "PDO $host => OK, server=" . $pdo->query('SELECT VERSION()')->fetchColumn();
    } catch (Throwable $e) {
        $results[] = "PDO $host => FAIL: " . $e->getMessage();
    }
}

$results[] = 'PHP version = ' . PHP_VERSION;
$results[] = 'loaded ini = ' . php_ini_loaded_file();
$results[] = 'extensions = ' . implode(',', array_intersect(
    get_loaded_extensions(),
    ['mysqli', 'pdo_mysql', 'gd', 'curl', 'mbstring', 'openssl', 'soap', 'sockets', 'zip', 'session']
));
$results[] = 'short_open_tag = ' . ini_get('short_open_tag');
$results[] = 'upload_max_filesize = ' . ini_get('upload_max_filesize');
$results[] = 'doc_root = ' . ini_get('doc_root');
$results[] = 'cwd = ' . getcwd();

echo implode(PHP_EOL, $results) . PHP_EOL;
