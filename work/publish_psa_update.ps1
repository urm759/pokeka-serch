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
  'data/update-status.json',
  'data/update-history.json',
  'work/snkr_english_names.json',
  'work/psa_update_state.json',
  'work/psa_priority_queue.json',
  'work/psa_acquisition_result.json',
  'work/repo_sync_state.json'
)

& $Git -C $Repo add -- $paths
if ($LASTEXITCODE -ne 0) { throw 'Git add failed while preparing PSA publication.' }
& $Git -C $Repo diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Output 'No PSA data changes to publish.'
  exit 0
}

& $Git -C $Repo commit -m "Refresh PSA official population $Today"
if ($LASTEXITCODE -ne 0) { throw 'Git commit failed after PSA acquisition.' }

$lastOutput = ''
for ($attempt = 1; $attempt -le $Retries; $attempt += 1) {
  $output = & $Git -C $Repo push origin HEAD:main 2>&1
  $exitCode = $LASTEXITCODE
  $lastOutput = ($output | Out-String).Trim()
  if ($lastOutput) { Write-Output $lastOutput }
  if ($exitCode -eq 0) {
    Write-Output "PSA publication completed on attempt $attempt."
    exit 0
  }
  if ($attempt -lt $Retries) { Start-Sleep -Seconds ([Math]::Min(20, 5 * $attempt)) }
}

throw "Git push failed after $Retries attempts. The acquisition commit remains locally: $lastOutput"
