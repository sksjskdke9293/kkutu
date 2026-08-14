$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root 'runtime\server.pids'

function Stop-ProcessTree([int]$ProcessId) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) { Stop-ProcessTree ([int]$child.ProcessId) }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

if (Test-Path $pidFile) {
    Get-Content $pidFile | ForEach-Object { if ($_ -match '^\d+$') { Stop-ProcessTree ([int]$_) } }
    Remove-Item $pidFile -Force
}
& (Join-Path $root 'runtime\postgres\bin\pg_ctl.exe') stop -D (Join-Path $root 'runtime\data') -m fast 2>$null
Write-Host 'KKuTu has stopped.'
