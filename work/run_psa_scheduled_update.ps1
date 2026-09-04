param([switch]$Force)

$ErrorActionPreference = 'Stop'
$StartedAt = Get-Date
$LogDir = Join-Path $PSScriptRoot 'logs'
$null = New-Item -ItemType Directory -Path $LogDir -Force
$LogPath = Join-Path $LogDir ("psa-update-{0}.log" -f $StartedAt.ToString('yyyyMMdd-HHmmss'))
$StatePath = Join-Path $PSScriptRoot 'psa_update_state.json'
$AcquisitionPath = Join-Path $PSScriptRoot 'psa_acquisition_result.json'
$SyncPath = Join-Path $PSScriptRoot 'repo_sync_state.json'
$Node = 'C:\Users\polar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$Today = $StartedAt.ToString('yyyy-MM-dd')
$Slot = if ($StartedAt.Hour -lt 12) { 'morning' } else { 'evening' }
$SuccessSlot = "$Today-$Slot"
$TranscriptStarted = $false

try {
  Start-Transcript -Path $LogPath -Append | Out-Null
  $TranscriptStarted = $true
  $previous = if (Test-Path $StatePath) { Get-Content $StatePath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
  if (-not $Force -and $previous.lastSuccessSlot -eq $SuccessSlot) {
    Write-Output "PSA update already completed for $SuccessSlot"
    exit 0
  }

  # Synchronization is advisory. User changes or a temporary Git failure must
  # never prevent the independent PSA acquisition phase.
  & (Join-Path $PSScriptRoot 'sync_repo_for_update.ps1')
  $syncExit = $LASTEXITCODE
  $sync = if (Test-Path $SyncPath) { Get-Content $SyncPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{ status = 'unknown'; message = '同期結果未記録' } }
  if ($syncExit -ne 0) { Write-Warning "Git sync warning; continuing acquisition: $($sync.message)" }

  & (Join-Path $PSScriptRoot 'acquire_psa_data.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'PSA acquisition phase failed.' }
  $acquisition = Get-Content $AcquisitionPath -Raw | ConvertFrom-Json
  $CompletedAt = Get-Date
  @{
    lastSuccessDate = $Today
    lastSuccessSlot = $SuccessSlot
    lastSuccessAt = $CompletedAt.ToString('o')
    lastAttemptAt = $StartedAt.ToString('o')
    startedAt = $StartedAt.ToString('o')
    endedAt = $CompletedAt.ToString('o')
    durationMs = [Math]::Round(($CompletedAt - $StartedAt).TotalMilliseconds)
    status = 'success'
    acquiredCount = $acquisition.acquiredCount
    updatedCount = $acquisition.updatedCount
    sourceState = $acquisition.sourceState
    fetchFailureCount = 0
    lastError = $null
    syncStatus = $sync.status
    syncError = if ($sync.status -eq 'success') { $null } else { $sync.message }
    publishStatus = 'success'
    publishError = $null
  } | ConvertTo-Json | Set-Content -Path $StatePath -Encoding utf8

  & $Node (Join-Path $PSScriptRoot 'finalize_update_status.js')
  if ($LASTEXITCODE -ne 0) { throw 'Update status finalization failed.' }

  try {
    & (Join-Path $PSScriptRoot 'publish_psa_update.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'PSA publication phase failed.' }
  } catch {
    $state = Get-Content $StatePath -Raw | ConvertFrom-Json
    $state.publishStatus = 'failed'
    $state.publishError = $_.Exception.Message
    $state | ConvertTo-Json | Set-Content -Path $StatePath -Encoding utf8
    & $Node (Join-Path $PSScriptRoot 'finalize_update_status.js')
    Write-Error "PSA data was acquired and saved, but publication failed: $($_.Exception.Message)"
    exit 2
  }
  Write-Output "PSA scheduled update completed: $SuccessSlot"
} catch {
  $FailedAt = Get-Date
  $acquisition = if (Test-Path $AcquisitionPath) { Get-Content $AcquisitionPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
  $sync = if (Test-Path $SyncPath) { Get-Content $SyncPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
  $previous = if (Test-Path $StatePath) { Get-Content $StatePath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
  $acquisitionError = if ($acquisition.error) { $acquisition.error } else { $_.Exception.Message }
  @{
    lastSuccessDate = $previous.lastSuccessDate
    lastSuccessSlot = $previous.lastSuccessSlot
    lastSuccessAt = $previous.lastSuccessAt
    lastAttemptAt = $StartedAt.ToString('o')
    startedAt = $StartedAt.ToString('o')
    endedAt = $FailedAt.ToString('o')
    durationMs = [Math]::Round(($FailedAt - $StartedAt).TotalMilliseconds)
    status = 'failed'
    acquiredCount = $acquisition.acquiredCount
    updatedCount = 0
    sourceState = 'PSA取得処理失敗'
    fetchFailureCount = 1
    lastError = $acquisitionError
    syncStatus = $sync.status
    syncError = if ($sync.status -eq 'success') { $null } else { $sync.message }
    publishStatus = 'not-run'
    publishError = $null
  } | ConvertTo-Json | Set-Content -Path $StatePath -Encoding utf8
  @{ failedAt = $FailedAt.ToString('o'); phase = 'acquisition'; message = $_.Exception.Message; log = $LogPath } | ConvertTo-Json | Set-Content -Path (Join-Path $LogDir 'psa-update-last-failure.json') -Encoding utf8
  Write-Error "PSA acquisition failed. Log: $LogPath`n$($_.Exception.Message)"
  exit 1
} finally {
  if ($TranscriptStarted) { Stop-Transcript | Out-Null }
}
