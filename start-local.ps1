$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pgBin = Join-Path $root 'runtime\postgres\bin'
$pgData = Join-Path $root 'runtime\data'
$logDir = Join-Path $root 'runtime\logs'
$server = Join-Path $root 'Server\lib'
$pidFile = Join-Path $root 'runtime\server.pids'

function Stop-ProcessTree([int]$ProcessId) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) { Stop-ProcessTree ([int]$child.ProcessId) }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

# A previous window may have been closed without stopping cluster workers.
if (Test-Path $pidFile) {
    Get-Content $pidFile | ForEach-Object { if ($_ -match '^\d+$') { Stop-ProcessTree ([int]$_) } }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}

New-Item -ItemType Directory -Force $logDir | Out-Null

if (-not (Test-Path (Join-Path $server 'node_modules'))) {
    Write-Host 'Node.js dependencies are being installed...'
    & npm.cmd install --prefix $server
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
}

if (-not (Test-Path (Join-Path $pgData 'PG_VERSION'))) {
    Write-Host 'The local database is being initialized...'
    New-Item -ItemType Directory -Force $pgData | Out-Null
    & (Join-Path $pgBin 'initdb.exe') -D $pgData -U postgres -A trust -E UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed.' }
    Add-Content (Join-Path $pgData 'postgresql.conf') "`nport = 55432`nlisten_addresses = '127.0.0.1'"
}

$pgStatus = & (Join-Path $pgBin 'pg_ctl.exe') status -D $pgData 2>&1
if ($LASTEXITCODE -ne 0) {
    & (Join-Path $pgBin 'pg_ctl.exe') start -D $pgData -l (Join-Path $logDir 'postgres.log') -w
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL failed to start.' }
}

Write-Host 'The KKuTu word database is being checked...'
& node (Join-Path $root 'setup-local-db.js')
if ($LASTEXITCODE -ne 0) { throw 'Database import failed.' }

$env:KKUTU_WEB_PORT = '3000'
$env:KKUTU_LOCAL = '1'
$game = Start-Process node -ArgumentList 'Game/cluster.js','0','1' -WorkingDirectory $server -RedirectStandardOutput (Join-Path $logDir 'game.out.log') -RedirectStandardError (Join-Path $logDir 'game.err.log') -PassThru
$web = Start-Process node -ArgumentList 'Web/cluster.js','1' -WorkingDirectory $server -RedirectStandardOutput (Join-Path $logDir 'web.out.log') -RedirectStandardError (Join-Path $logDir 'web.err.log') -PassThru
@($game.Id, $web.Id) | Set-Content $pidFile

Start-Sleep -Seconds 3
if ($game.HasExited -or $web.HasExited) { throw "Server startup failed. Check runtime\logs." }
try {
    $health = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:3000/login?id=ADMIN'
    if ($health.StatusCode -ne 200) { throw "HTTP $($health.StatusCode)" }
} catch {
    throw "Server did not answer on port 3000. Check runtime\logs. $($_.Exception.Message)"
}
Start-Process 'http://127.0.0.1:3000/login?id=ADMIN'
Write-Host ''
Write-Host 'KKuTu is running at http://127.0.0.1:3000' -ForegroundColor Green
Write-Host 'Run stop-local.bat to stop it.'
