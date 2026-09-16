# ============================================================
# 天积安全 WEB 靶场平台 — 一键启动脚本（便携版）
# 启动 MariaDB(3306) + Apache/PHP(8080)
# 用法：右键“使用 PowerShell 运行”，或双击同目录的 start-lab.cmd
# ============================================================
$ErrorActionPreference = 'Continue'
$Root       = Split-Path -Parent $MyInvocation.MyCommand.Path
$PhpDir     = Join-Path $Root 'php'
$ApacheConf = Join-Path $Root 'apache\conf\heasec-httpd.conf'
$HttpdExe   = Join-Path $Root 'apache\bin\httpd.exe'
$MySqlExe   = Join-Path $Root 'mariadb\bin\mysqld.exe'
$MySqlConf  = Join-Path $Root 'mariadb\my-heasec.ini'

function Test-Port([int]$Port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect('127.0.0.1', $Port)
        $client.Close()
        return $true
    } catch { return $false }
}

function Wait-Port([int]$Port, [int]$TimeoutSec, [string]$Name) {
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        if (Test-Port $Port) { Write-Host "[OK]   $Name 已就绪 (端口 $Port)"; return $true }
        Start-Sleep -Seconds 1
    }
    Write-Host "[FAIL] $Name 在 $TimeoutSec 秒内未就绪，请查看 $Root\logs\ 下的日志"
    return $false
}

Write-Host '=== 天积安全 WEB 靶场平台 启动中 ===' -ForegroundColor Cyan

# ---- 1. 数据库 MariaDB ----
if (Test-Port 3306) {
    Write-Host '[SKIP] MariaDB 已在运行 (端口 3306)'
} else {
    Write-Host '[..]   启动 MariaDB ...'
    Start-Process -FilePath $MySqlExe -ArgumentList "--defaults-file=`"$MySqlConf`"" `
        -WorkingDirectory $Root -WindowStyle Hidden
    Wait-Port 3306 60 'MariaDB' | Out-Null
}

# ---- 2. Web 服务 Apache + PHP ----
if (Test-Port 8080) {
    Write-Host '[SKIP] Apache 已在运行 (端口 8080)'
} else {
    Write-Host '[..]   启动 Apache + PHP (mod_php) ...'
    # 注意：PHP 的 extension_dir 为相对路径，必须让工作目录为 php 目录
    Start-Process -FilePath $HttpdExe -ArgumentList "-f `"$ApacheConf`"" `
        -WorkingDirectory $PhpDir -WindowStyle Hidden
    Wait-Port 8080 30 'Apache' | Out-Null
}

Write-Host ''
if ((Test-Port 3306) -and (Test-Port 8080)) {
    Write-Host '靶场已启动，请在浏览器访问：' -ForegroundColor Green
    Write-Host '    http://localhost:8080/' -ForegroundColor Green
    Write-Host ''
    Write-Host '数据库：MariaDB 10.6  127.0.0.1:3306  账号 root / 密码 root'
    Write-Host '停止服务：运行 stop-lab.cmd'
} else {
    Write-Host '启动未完成，请检查日志：' -ForegroundColor Red
    Write-Host "    $Root\logs\mariadb-error.log"
    Write-Host "    $Root\apache\logs\error.log"
}
