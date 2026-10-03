param([int]$Retries = 3)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Git = 'C:\Program Files\Git\cmd\git.exe'
$Today = (Get-Date).ToString('yyyy-MM-dd HH:mm')
$paths = @(
  'data/psa-official-populations.json',
  'data/psa-official-populations.js',
  'data/psa-population-summary.json',
  'data/psa-history',
  'data/psa-pc-observation.json',
  'data/update-status.json',
  'data/update-history.json',
  'work/snkr_english_names.json',
  'work/psa_update_state.json',
  'work/psa_priority_queue.json',
  'work/psa_acquisition_result.json',
  'work/repo_sync_state.json'
  'work/psa-fetch-progress.json'
  'work/source-update-runs.json'
  'work/source-update-history.json'
  'work/acquisition-progress-last.json'
  'work/candidate-cohort-current.json'
  'work/candidate-daily-history.json'
  'work/candidate-availability-history.json'
  'data/acquisition-progress-audit.json'
  'data/psa-fetch-progress.json'
  'data/candidate-shop-refresh.json'
  'data/link-coverage.json'
  'data/candidate-daily-audit.json'
  'data/candidate-availability-audit.json'
  'data/purchase-limit-model-audit.json'
  'data/operational-limit-history.json'
  'data/card-catalog'
  'data/card-catalog-completion.json'
  'data/card-completion-status.json'
  'data/card-completion-queue.json'
  'data/pokemon-cards.json'
  'data/pokemon-cards.js'
  'data/pokemon-cards-meta.json'
)

$paths = @($paths | Where-Object { Test-Path (Join-Path $Repo $_) })

& $Git -C $Repo add -- $paths
if ($LASTEXITCODE -ne 0) { throw 'Git add failed while preparing PSA publication.' }
& $Git -C $Repo diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Output 'No PSA data changes to publish.'
  exit 0
}

Push-Location $Repo
try {
  node work/publish_data_checkpoint.js "Refresh PSA official population $Today"
  if ($LASTEXITCODE -ne 0) { throw 'PSA push failed. Local commit and work/publish-recovery.bundle preserve the acquisition; manual merge may be needed.' }
} finally { Pop-Location }
