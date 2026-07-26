[CmdletBinding()]
param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $env:LOCALAPPDATA "Skein\runtime"
$StateRoot = Join-Path $ProjectRoot ".skein"
$StateFile = Join-Path $StateRoot "processes.json"

if (Test-Path -LiteralPath $StateFile) {
    throw "Skein already has a local process file. Run .\scripts\stop-skein.ps1 first."
}

$uv = (Get-Command uv.exe -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $RuntimeRoot, $StateRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeRoot "app"), (Join-Path $RuntimeRoot "public") | Out-Null

Copy-Item -Path (Join-Path $ProjectRoot "app\*") -Destination (Join-Path $RuntimeRoot "app") -Recurse -Force
Copy-Item -Path (Join-Path $ProjectRoot "public\*") -Destination (Join-Path $RuntimeRoot "public") -Recurse -Force
foreach ($file in @(
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    "eslint.config.mjs"
)) {
    Copy-Item -LiteralPath (Join-Path $ProjectRoot $file) -Destination (Join-Path $RuntimeRoot $file) -Force
}
if (Test-Path -LiteralPath (Join-Path $ProjectRoot ".openai")) {
    Copy-Item -LiteralPath (Join-Path $ProjectRoot ".openai") -Destination $RuntimeRoot -Recurse -Force
}

$lockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $ProjectRoot "package-lock.json")).Hash
$lockMarker = Join-Path $RuntimeRoot ".skein-package-lock"
$installedHash = if (Test-Path -LiteralPath $lockMarker) {
    (Get-Content -Raw -LiteralPath $lockMarker).Trim()
} else {
    ""
}

if (-not $SkipInstall -and (
    -not (Test-Path -LiteralPath (Join-Path $RuntimeRoot "node_modules")) -or
    $installedHash -ne $lockHash
)) {
    Write-Host "Installing the locked web dependencies in the local runtime..."
    & $npm ci --ignore-scripts --no-audit --prefix $RuntimeRoot
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed."
    }
    [System.IO.File]::WriteAllText($lockMarker, $lockHash)
}

$ApiRoot = Join-Path $ProjectRoot "services\control-plane"
if (-not $SkipInstall) {
    Write-Host "Synchronizing the locked Python environment..."
    Push-Location $ApiRoot
    try {
        & $uv sync --locked --extra dev
        if ($LASTEXITCODE -ne 0) {
            throw "uv sync failed."
        }
    } finally {
        Pop-Location
    }
}

$apiOut = Join-Path $StateRoot "api.out.log"
$apiErr = Join-Path $StateRoot "api.err.log"
$webOut = Join-Path $StateRoot "web.out.log"
$webErr = Join-Path $StateRoot "web.err.log"

$apiProcess = Start-Process `
    -FilePath $uv `
    -ArgumentList @(
        "run", "--locked", "--extra", "dev", "uvicorn", "skein.main:app",
        "--host", "127.0.0.1", "--port", "8000"
    ) `
    -WorkingDirectory $ApiRoot `
    -RedirectStandardOutput $apiOut `
    -RedirectStandardError $apiErr `
    -WindowStyle Hidden `
    -PassThru

$webProcess = Start-Process `
    -FilePath $npm `
    -ArgumentList @("run", "dev") `
    -WorkingDirectory $RuntimeRoot `
    -RedirectStandardOutput $webOut `
    -RedirectStandardError $webErr `
    -WindowStyle Hidden `
    -PassThru

@{
    api_process_id = $apiProcess.Id
    web_process_id = $webProcess.Id
    started_at = (Get-Date).ToUniversalTime().ToString("o")
    runtime_root = $RuntimeRoot
} | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding utf8

function Wait-ForUrl {
    param(
        [Parameter(Mandatory)]
        [string]$Url,
        [Parameter(Mandatory)]
        [string]$Name
    )
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                return
            }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    throw "$Name did not become ready. Inspect the logs in $StateRoot."
}

try {
    Wait-ForUrl -Url "http://127.0.0.1:8000/healthz" -Name "Skein API"
    Wait-ForUrl -Url "http://localhost:3000/" -Name "Skein web console"
} catch {
    Write-Error $_
    Write-Host "Run .\scripts\stop-skein.ps1 before trying again."
    exit 1
}

Write-Host ""
Write-Host "Skein is ready."
Write-Host "Console: http://localhost:3000/"
Write-Host "API docs: http://127.0.0.1:8000/api/docs"
Write-Host "Stop: .\scripts\stop-skein.ps1"
