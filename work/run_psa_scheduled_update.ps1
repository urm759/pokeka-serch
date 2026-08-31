param([switch]$Force)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Node = 'C:\Users\polar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$Git = 'C:\Program Files\Git\cmd\git.exe'
$Today = (Get-Date).ToString('yyyy-MM-dd')
$Slot = if ((Get-Date).Hour -lt 12) { 'morning' } else { 'evening' }
$SuccessSlot = "$Today-$Slot"
$StatePath = Join-Path $PSScriptRoot 'psa_update_state.json'
$State = if (Test-Path $StatePath) { Get-Content $StatePath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
if (-not $Force -and $State.lastSuccessSlot -eq $SuccessSlot) { Write-Output "PSA update already completed for $SuccessSlot"; exit 0 }

& $Git -C $Repo pull --rebase origin main
if ($LASTEXITCODE -ne 0) { throw 'Git pull failed before the PSA update.' }
& (Join-Path $PSScriptRoot 'start_psa_regular_chrome.ps1')
if ($LASTEXITCODE -ne 0) { throw 'PSA regular Chrome startup failed.' }
$env:PSA_CDP_ENDPOINT = 'http://127.0.0.1:9222'
$env:PSA_MIN_TOTAL_POPULATION = '500'
& $Node (Join-Path $PSScriptRoot 'update_psa_official_populations.js')
if ($LASTEXITCODE -ne 0) { throw 'PSA official population update failed.' }
& $Node (Join-Path $PSScriptRoot 'update_snkr_english_names.js')
if ($LASTEXITCODE -ne 0) { throw 'Snkr English name update failed.' }
& $Node (Join-Path $PSScriptRoot 'build_psa_history.js')
if ($LASTEXITCODE -ne 0) { throw 'PSA history build failed.' }
& $Node (Join-Path $PSScriptRoot 'finalize_update_status.js')
if ($LASTEXITCODE -ne 0) { throw 'Update status finalization failed.' }

@{ lastSuccessDate=$Today; lastSuccessSlot=$SuccessSlot; lastSuccessAt=(Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -Path $StatePath -Encoding utf8
& $Git -C $Repo add data/psa-official-populations.json data/psa-official-populations.js data/psa-population-summary.json data/psa-history data/update-status.json work/snkr_english_names.json work/psa_update_state.json
& $Git -C $Repo diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  & $Git -C $Repo commit -m "Refresh PSA official population $SuccessSlot"
  if ($LASTEXITCODE -ne 0) { throw 'Git commit failed after the PSA update.' }
  & $Git -C $Repo pull --rebase origin main
  if ($LASTEXITCODE -ne 0) { throw 'Git pull failed after the PSA update.' }
  & $Git -C $Repo push origin HEAD:main
  if ($LASTEXITCODE -ne 0) { throw 'Git push failed after the PSA update.' }
}
