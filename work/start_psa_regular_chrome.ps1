param(
  [int]$Port = 9222,
  [switch]$Show
)

$ErrorActionPreference = 'Stop'
$Chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$Profile = Join-Path $env:LOCALAPPDATA 'PokekaPSAChromeRegularProfile'
$Endpoint = "http://127.0.0.1:$Port/json/version"
$PsaUrl = 'https://www.psacard.com/pop/tcg-cards/156940'

function Test-PsaChrome {
  try {
    $null = Invoke-RestMethod -Uri $Endpoint -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $Chrome)) {
  throw "Chrome was not found: $Chrome"
}

if (Test-PsaChrome) {
  if ($Show) {
    Start-Process -FilePath $Chrome -ArgumentList @("--user-data-dir=$Profile", $PsaUrl)
  }
} else {
  New-Item -ItemType Directory -Path $Profile -Force | Out-Null
  $Arguments = @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$Profile",
    '--no-first-run',
    '--no-default-browser-check',
    $(if ($Show) { '--new-window' } else { '--start-minimized' }),
    $PsaUrl
  )
  if ($Show) {
    Start-Process -FilePath $Chrome -ArgumentList $Arguments
  } else {
    Start-Process -FilePath $Chrome -ArgumentList $Arguments -WindowStyle Minimized
  }
}

$Deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $Deadline) {
  if (Test-PsaChrome) {
    Write-Output "PSA Chrome is ready at http://127.0.0.1:$Port"
    exit 0
  }
  Start-Sleep -Seconds 1
}

throw "PSA Chrome did not become ready on port $Port"
