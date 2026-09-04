param([switch]$Force)
$ErrorActionPreference = 'Stop'
$StartedAt = Get-Date
$Repo = Split-Path -Parent $PSScriptRoot
$PsaDataPath = Join-Path $Repo 'data\psa-official-populations.json'
$BeforeRows = @{}
if (Test-Path $PsaDataPath) {
  $BeforePayload = Get-Content $PsaDataPath -Raw | ConvertFrom-Json
  foreach ($Row in $BeforePayload.rows) {
    $BeforeRows["$($Row.setCode)|$($Row.cardNo)|$($Row.cardName)"] = "$($Row.psa10Count)|$($Row.psaTotal)"
  }
}
$Node = 'C:\Users\polar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$Git = 'C:\Program Files\Git\cmd\git.exe'
$LogDir = Join-Path $PSScriptRoot 'logs'
$null = New-Item -ItemType Directory -Path $LogDir -Force
$LogPath = Join-Path $LogDir ("psa-update-{0}.log" -f (Get-Date).ToString('yyyyMMdd-HHmmss'))
$TranscriptStarted = $false
try {
  Start-Transcript -Path $LogPath -Append | Out-Null
  $TranscriptStarted = $true
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
& $Node (Join-Path $PSScriptRoot 'build_psa_priority_queue.js')
if ($LASTEXITCODE -ne 0) { throw 'PSA priority queue build failed.' }
& $Node (Join-Path $PSScriptRoot 'update_psa_official_populations.js')
if ($LASTEXITCODE -ne 0) { throw 'PSA official population update failed.' }
& $Node (Join-Path $PSScriptRoot 'update_snkr_english_names.js')
if ($LASTEXITCODE -ne 0) { throw 'Snkr English name update failed.' }
& $Node (Join-Path $PSScriptRoot 'build_psa_history.js')
if ($LASTEXITCODE -ne 0) { throw 'PSA history build failed.' }
$CompletedAt = Get-Date
$AfterPayload = Get-Content $PsaDataPath -Raw | ConvertFrom-Json
$UpdatedCount = 0
foreach ($Row in $AfterPayload.rows) {
  $Key = "$($Row.setCode)|$($Row.cardNo)|$($Row.cardName)"
  $Value = "$($Row.psa10Count)|$($Row.psaTotal)"
  if (-not $BeforeRows.ContainsKey($Key) -or $BeforeRows[$Key] -ne $Value) { $UpdatedCount += 1 }
}
$SourceState = if ($UpdatedCount -gt 0) { '取得成功・データ更新あり' } else { '取得成功・データ元更新なし' }
@{ lastSuccessDate=$Today; lastSuccessSlot=$SuccessSlot; lastSuccessAt=$CompletedAt.ToString('o'); lastAttemptAt=$StartedAt.ToString('o'); startedAt=$StartedAt.ToString('o'); endedAt=$CompletedAt.ToString('o'); durationMs=[math]::Round(($CompletedAt - $StartedAt).TotalMilliseconds); status='success'; acquiredCount=@($AfterPayload.rows).Count; updatedCount=$UpdatedCount; sourceState=$SourceState; fetchFailureCount=0; lastError=$null } | ConvertTo-Json | Set-Content -Path $StatePath -Encoding utf8
& $Node (Join-Path $PSScriptRoot 'finalize_update_status.js')
if ($LASTEXITCODE -ne 0) { throw 'Update status finalization failed.' }
& $Git -C $Repo add data/psa-official-populations.json data/psa-official-populations.js data/psa-population-summary.json data/psa-history data/update-status.json data/update-history.json work/snkr_english_names.json work/psa_update_state.json work/psa_priority_queue.json
& $Git -C $Repo diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  & $Git -C $Repo commit -m "Refresh PSA official population $SuccessSlot"
  if ($LASTEXITCODE -ne 0) { throw 'Git commit failed after the PSA update.' }
  & $Git -C $Repo pull --rebase origin main
  if ($LASTEXITCODE -ne 0) { throw 'Git pull failed after the PSA update.' }
  & $Git -C $Repo push origin HEAD:main
  if ($LASTEXITCODE -ne 0) { throw 'Git push failed after the PSA update.' }
}
  Write-Output "PSA scheduled update completed: $SuccessSlot"
} catch {
  $FailurePath = Join-Path $LogDir 'psa-update-last-failure.json'
  @{ failedAt=(Get-Date).ToString('o'); message=$_.Exception.Message; log=$LogPath } | ConvertTo-Json | Set-Content -Path $FailurePath -Encoding utf8
  $PreviousState = if (Test-Path $StatePath) { Get-Content $StatePath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
  $FailedAt = Get-Date
  @{ lastSuccessDate=$PreviousState.lastSuccessDate; lastSuccessSlot=$PreviousState.lastSuccessSlot; lastSuccessAt=$PreviousState.lastSuccessAt; lastAttemptAt=$StartedAt.ToString('o'); startedAt=$StartedAt.ToString('o'); endedAt=$FailedAt.ToString('o'); durationMs=[math]::Round(($FailedAt - $StartedAt).TotalMilliseconds); status='failed'; acquiredCount=$PreviousState.acquiredCount; updatedCount=0; sourceState='取得処理失敗'; fetchFailureCount=1; lastError=$_.Exception.Message } | ConvertTo-Json | Set-Content -Path $StatePath -Encoding utf8
  Write-Error "PSA scheduled update failed. Log: $LogPath`n$($_.Exception.Message)"
  exit 1
} finally {
  if ($TranscriptStarted) { Stop-Transcript | Out-Null }
}
