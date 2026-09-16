# ============================================================
# 天积安全 WEB 靶场平台 — 停止脚本（便携版）
# 停止 Apache(8080) 与 MariaDB(3306)
# ============================================================
$ErrorActionPreference = 'Continue'
$Root       = Split-Path -Parent $MyInvocation.MyCommand.Path
$ApacheConf = Join-Path $Root 'apache\conf\heasec-httpd.conf'
$HttpdExe   = Join-Path $Root 'apache\bin\httpd.exe'
$MySqlAdmin = Join-Path $Root 'mariadb\bin\mysqladmin.exe'

Write-Host '=== 停止天积安全 WEB 靶场平台 ===' -ForegroundColor Cyan

# ---- Apache ----
$httpd = Get-Process httpd -ErrorAction SilentlyContinue
if ($httpd) {
    & $HttpdExe -f "$ApacheConf" -k stop 2>$null
    Start-Sleep -Seconds 2
    Get-Process httpd -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force }
    Write-Host '[OK]   Apache 已停止'
} else {
    Write-Host '[SKIP] Apache 未在运行'
}

# ---- MariaDB ----
$mysqld = Get-Process mysqld -ErrorAction SilentlyContinue
if ($mysqld) {
    & $MySqlAdmin '--user=root' '--password=root' '--host=127.0.0.1' '--port=3306' shutdown 2>$null
    Start-Sleep -Seconds 3
    Get-Process mysqld -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force }
    Write-Host '[OK]   MariaDB 已停止'
} else {
    Write-Host '[SKIP] MariaDB 未在运行'
}

Write-Host '完成。'
