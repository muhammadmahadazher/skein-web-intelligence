[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StateFile = Join-Path $ProjectRoot ".skein\processes.json"

if (-not (Test-Path -LiteralPath $StateFile)) {
    Write-Host "Skein is already stopped; no local process file exists."
    exit 0
}

$state = Get-Content -Raw -LiteralPath $StateFile | ConvertFrom-Json

function Stop-ProcessTree {
    param(
        [Parameter(Mandatory)]
        [int]$ProcessId
    )
    $children = Get-CimInstance Win32_Process |
        Where-Object { $_.ParentProcessId -eq $ProcessId } |
        Select-Object -ExpandProperty ProcessId
    foreach ($childId in $children) {
        Stop-ProcessTree -ProcessId $childId
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

foreach ($processId in @($state.web_process_id, $state.api_process_id)) {
    if ($processId -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
        Stop-ProcessTree -ProcessId ([int]$processId)
    }
}

Remove-Item -LiteralPath $StateFile -Force
Write-Host "Skein web and API processes are stopped."
