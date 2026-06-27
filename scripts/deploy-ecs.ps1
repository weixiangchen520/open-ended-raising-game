<#
.SYNOPSIS
Deploy Starharbor Diary to the configured ECS host.

.DESCRIPTION
Builds a release tarball from the current project, uploads it over SSH,
extracts it into /opt/starharbor/releases/<timestamp>, switches
/opt/starharbor/current, restarts starharbor.service, and verifies the public
HTTP and director endpoints.

No secrets are stored in this script. Runtime keys stay on the server in
/etc/starharbor.env.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\deploy-ecs.ps1

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\deploy-ecs.ps1 -SkipDirectorCheck
#>

[CmdletBinding()]
param(
  [string]$SshTarget = "starharbor-ecs",
  [string]$SshConfig = "$HOME\.ssh\config",
  [string]$RemoteRoot = "/opt/starharbor",
  [string]$ServiceName = "starharbor.service",
  [int]$Port = 7001,
  [string]$PublicUrl = "http://39.106.56.69:7001",
  [string]$LocalAccountsFile = "",
  [string]$RemoteAccountsFile = "/etc/starharbor/accounts.json",
  [string]$RemoteSaveDir = "/var/lib/starharbor/saves",
  [switch]$SkipTests,
  [switch]$SkipDirectorCheck,
  [switch]$AllowLocalDirector,
  [switch]$KeepPackage,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $LocalAccountsFile) {
  $LocalAccountsFile = Join-Path $ProjectRoot "config\accounts.local.json"
} elseif (-not [System.IO.Path]::IsPathRooted($LocalAccountsFile)) {
  $LocalAccountsFile = Join-Path $ProjectRoot $LocalAccountsFile
}
$Timestamp = Get-Date -Format "yyyyMMddHHmmss"
$PackageName = "starharbor-$Timestamp.tgz"
$PackagePath = Join-Path ([System.IO.Path]::GetTempPath()) $PackageName
$AccountsUploadName = "starharbor-accounts-$Timestamp.json"
$RemoteScriptName = "starharbor-deploy-$Timestamp.sh"
$RemoteScriptPath = Join-Path ([System.IO.Path]::GetTempPath()) $RemoteScriptName

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$InputText = ""
  )

  if ($InputText) {
    $InputText | & $FilePath @Arguments
  } else {
    & $FilePath @Arguments
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
}

function Get-SshArgs {
  $args = @()
  if ($SshConfig -and (Test-Path -LiteralPath $SshConfig)) {
    $args += @("-F", $SshConfig)
  }
  $args += @("-o", "BatchMode=yes", $SshTarget)
  return $args
}

function Get-ScpArgs {
  param([string]$Source, [string]$Destination)

  $args = @()
  if ($SshConfig -and (Test-Path -LiteralPath $SshConfig)) {
    $args += @("-F", $SshConfig)
  }
  $args += @($Source, $Destination)
  return $args
}

Write-Step "Project"
Write-Host "Root: $ProjectRoot"
Write-Host "Target: $SshTarget"
Write-Host "Public URL: $PublicUrl"
Write-Host "Accounts: $LocalAccountsFile -> $RemoteAccountsFile"

if (-not $SkipTests) {
  Write-Step "Run local checks"
  Invoke-Checked "node" @("--check", "server.js")
  Invoke-Checked "node" @("--check", "scripts/verify-director.mjs")
  Invoke-Checked "node" @("--check", "src/game/data.js")
  Invoke-Checked "node" @("--check", "src/game/engine.js")
  Invoke-Checked "npm" @("test")
}

Write-Step "Build React frontend"
Invoke-Checked "npm" @("run", "build")

Write-Step "Create release package"
if (Test-Path -LiteralPath $PackagePath) {
  Remove-Item -LiteralPath $PackagePath -Force
}

$tarArgs = @(
  "--exclude=./node_modules",
  "--exclude=./.git",
  "--exclude=./.env",
  "--exclude=./.env.*",
  "--exclude=./config/*.local.json",
  "--exclude=./data",
  "--exclude=./logs",
  "--exclude=./screenshots",
  "--exclude=./.chrome-profile*",
  "--exclude=./.edge-profile*",
  "-czf",
  $PackagePath,
  "-C",
  $ProjectRoot,
  "."
)
Invoke-Checked "tar" $tarArgs
$packageInfo = Get-Item -LiteralPath $PackagePath
Write-Host "Package: $($packageInfo.FullName) ($($packageInfo.Length) bytes)"

$remoteScript = @"
set -euo pipefail
trap 'rm -f "/tmp/$RemoteScriptName" "/tmp/$PackageName" "/tmp/$AccountsUploadName"' EXIT
release="$RemoteRoot/releases/$Timestamp"
package="/tmp/$PackageName"
accounts_tmp="/tmp/$AccountsUploadName"
mkdir -p "`$(dirname "`$release")"
mkdir -p "`$release"
mkdir -p "$RemoteSaveDir"
chmod 700 "$RemoteSaveDir"
if [ -f "`$accounts_tmp" ]; then
  mkdir -p "`$(dirname "$RemoteAccountsFile")"
  install -m 600 "`$accounts_tmp" "$RemoteAccountsFile"
fi
tar -xzf "`$package" -C "`$release"
ln -sfn "`$release" "$RemoteRoot/current"
systemctl restart "$ServiceName"
sleep 1
echo "release:`$release"
echo "service:`$(systemctl is-active "$ServiceName")"
ss -ltnp | grep ":$Port" || true
curl -sS -D - "http://127.0.0.1:$Port/" -o "/tmp/starharbor-index.html"
wc -c "/tmp/starharbor-index.html"
"@

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($RemoteScriptPath, ($remoteScript -replace "`r`n", "`n"), $utf8NoBom)

if ($DryRun) {
  Write-Step "Dry run"
  Write-Host "Would upload: $PackagePath -> ${SshTarget}:/tmp/$PackageName"
  if (Test-Path -LiteralPath $LocalAccountsFile) {
    Write-Host "Would upload: $LocalAccountsFile -> ${SshTarget}:/tmp/$AccountsUploadName"
  } else {
    Write-Host "Would skip accounts upload because file does not exist: $LocalAccountsFile"
  }
  Write-Host "Would upload: $RemoteScriptPath -> ${SshTarget}:/tmp/$RemoteScriptName"
  Write-Host "Would run remote script:"
  Write-Host $remoteScript
  if (-not $KeepPackage) {
    Remove-Item -LiteralPath $PackagePath -Force
  }
  Remove-Item -LiteralPath $RemoteScriptPath -Force
  exit 0
}

Write-Step "Upload package"
Invoke-Checked "scp" (Get-ScpArgs $PackagePath "${SshTarget}:/tmp/$PackageName")
if (Test-Path -LiteralPath $LocalAccountsFile) {
  Write-Step "Upload account config"
  Invoke-Checked "scp" (Get-ScpArgs $LocalAccountsFile "${SshTarget}:/tmp/$AccountsUploadName")
} else {
  Write-Host "Account config not found, remote login config will be left unchanged: $LocalAccountsFile" -ForegroundColor Yellow
}
Invoke-Checked "scp" (Get-ScpArgs $RemoteScriptPath "${SshTarget}:/tmp/$RemoteScriptName")

Write-Step "Switch remote release and restart service"
Invoke-Checked "ssh" ((Get-SshArgs) + @("bash", "/tmp/$RemoteScriptName"))

Write-Step "Verify public HTML"
$response = Invoke-WebRequest -Uri $PublicUrl -UseBasicParsing -TimeoutSec 20
if ($response.StatusCode -ne 200) {
  throw "Public HTML verification failed: HTTP $($response.StatusCode)"
}
if (-not ($response.Content.Contains('id="root"') -and $response.Content.Contains("/assets/index-"))) {
  throw "Public HTML verification failed: expected React/Vite HTML markers."
}
Write-Host "HTTP $($response.StatusCode), $($response.Content.Length) bytes"

if (-not $SkipDirectorCheck) {
  Write-Step "Verify public director endpoint"
  $verifyArgs = @("scripts/verify-director.mjs", $PublicUrl)
  if ($AllowLocalDirector) {
    $verifyArgs += "--allow-local"
  }
  Invoke-Checked "node" $verifyArgs
}

if (-not $KeepPackage) {
  Remove-Item -LiteralPath $PackagePath -Force
}
Remove-Item -LiteralPath $RemoteScriptPath -Force

Write-Step "Done"
Write-Host "Deployed release $Timestamp to $PublicUrl" -ForegroundColor Green
