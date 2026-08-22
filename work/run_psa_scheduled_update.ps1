param([switch]$Force)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Node = 'C:\Users\polar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$Today = (Get-Date).ToString('yyyy-MM-dd')
$StatePath = Join-Path $PSScriptRoot 'psa_update_state.json'
$State = if (Test-Path $StatePath) { Get-Content $StatePath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
if (-not $Force -and $State.lastSuccessDate -eq $Today) { Write-Output "PSA update already completed for $Today"; exit 0 }

git -C $Repo pull --rebase origin main
& $Node (Join-Path $PSScriptRoot 'update_psa_official_populations.js')
if ($LASTEXITCODE -ne 0) { throw 'PSA official population update failed.' }
& $Node (Join-Path $PSScriptRoot 'update_snkr_english_names.js')
if ($LASTEXITCODE -ne 0) { throw 'Snkr English name update failed.' }
& $Node (Join-Path $PSScriptRoot 'build_psa_history.js')
if ($LASTEXITCODE -ne 0) { throw 'PSA history build failed.' }

@{ lastSuccessDate=$Today; lastSuccessAt=(Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -Path $StatePath -Encoding utf8
git -C $Repo add data/psa-official-populations.json data/psa-population-summary.json data/psa-history work/snkr_english_names.json work/psa_update_state.json
if (-not (git -C $Repo diff --cached --quiet)) {
  git -C $Repo commit -m "Refresh PSA official population $Today"
  git -C $Repo pull --rebase origin main
  git -C $Repo push origin main
}
