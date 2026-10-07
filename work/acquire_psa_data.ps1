param([int]$Retries = 1)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Node = 'C:\Users\polar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$PsaDataPath = Join-Path $Repo 'data\psa-official-populations.json'
$ResultPath = Join-Path $PSScriptRoot 'psa_acquisition_result.json'
$StartedAt = Get-Date
$BeforeRows = @{}

if (Test-Path $PsaDataPath) {
  $beforePayload = Get-Content $PsaDataPath -Raw | ConvertFrom-Json
  foreach ($row in $beforePayload.rows) {
    $BeforeRows["$($row.setCode)|$($row.cardNo)|$($row.cardName)"] = "$($row.psa10Count)|$($row.psaTotal)"
  }
}

function Invoke-Step {
  param([string]$Name, [scriptblock]$Operation, [int]$MaxAttempts = 1)
  $lastOutput = ''
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt += 1) {
    $output = & $Operation 2>&1
    $exitCode = $LASTEXITCODE
    $lastOutput = ($output | Out-String).Trim()
    if ($lastOutput) { Write-Output $lastOutput }
    if ($exitCode -eq 0) { return @{ Name = $Name; Attempts = $attempt; Success = $true } }
    if ($attempt -lt $MaxAttempts) { Start-Sleep -Seconds ([Math]::Min(20, 5 * $attempt)) }
  }
  throw "$Name failed after $MaxAttempts attempt(s). $lastOutput"
}

try {
  $HoldPath = Join-Path $PSScriptRoot 'psa-fetch-progress.json'
  $Hold = if (Test-Path $HoldPath) { Get-Content $HoldPath -Raw | ConvertFrom-Json } else { $null }
  # The collector verifies a normal population page before clearing an authentication hold.
  Invoke-Step -Name 'PSA regular Chrome startup' -MaxAttempts 2 -Operation { & (Join-Path $PSScriptRoot 'start_psa_regular_chrome.ps1') } | Out-Null
  $env:PSA_CDP_ENDPOINT = 'http://127.0.0.1:9222'
  $env:PSA_MIN_TOTAL_POPULATION = '0'
  & $Node (Join-Path $PSScriptRoot 'psa_handoff.js') --inputs
  if ($LASTEXITCODE -eq 0) {
    $inputs = Get-Content (Join-Path $PSScriptRoot 'psa-acquisition-inputs/audit.json') -Raw | ConvertFrom-Json
    $env:PSA_MANIFEST_PATH = $inputs.manifestPath
    $env:PSA_PRIORITY_QUEUE_PATH = $inputs.priorityPath
  } else {
    Write-Warning 'Latest PSA inputs unavailable. Keep local known inputs and user data.'
    Remove-Item Env:PSA_MANIFEST_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:PSA_PRIORITY_QUEUE_PATH -ErrorAction SilentlyContinue
    Invoke-Step -Name 'PSA priority queue build' -Operation { & $Node (Join-Path $PSScriptRoot 'build_psa_priority_queue.js') } | Out-Null
  }
  Invoke-Step -Name 'PSA official population update' -MaxAttempts $Retries -Operation { & $Node (Join-Path $PSScriptRoot 'update_psa_official_populations.js') } | Out-Null
  $fetchAudit = Get-Content $HoldPath -Raw | ConvertFrom-Json
  if ($fetchAudit.refreshedCount -le 0) { throw 'No newly verified PSA values; preserved rows are not new acquisition.' }
  if ($env:PSA_REFRESH_ENGLISH_NAMES -eq '1') {
    Invoke-Step -Name 'Snkr English name update' -MaxAttempts 1 -Operation { & $Node (Join-Path $PSScriptRoot 'update_snkr_english_names.js') } | Out-Null
  }
  Invoke-Step -Name 'PSA history build' -Operation { & $Node (Join-Path $PSScriptRoot 'build_psa_history.js') } | Out-Null

  $afterPayload = Get-Content $PsaDataPath -Raw | ConvertFrom-Json
  $updatedCount = 0
  foreach ($row in $afterPayload.rows) {
    $key = "$($row.setCode)|$($row.cardNo)|$($row.cardName)"
    $value = "$($row.psa10Count)|$($row.psaTotal)"
    if (-not $BeforeRows.ContainsKey($key) -or $BeforeRows[$key] -ne $value) { $updatedCount += 1 }
  }
  $EndedAt = Get-Date
  $result = @{
    startedAt = $StartedAt.ToString('o')
    endedAt = $EndedAt.ToString('o')
    durationMs = [Math]::Round(($EndedAt - $StartedAt).TotalMilliseconds)
    status = if ($fetchAudit.status -eq 'success') { 'success' } else { 'partial' }
    acquiredCount = $fetchAudit.refreshedCount
    savedTotalCount = @($afterPayload.rows).Count
    updatedCount = $updatedCount
    newAcquiredCount = @($afterPayload.rows | Where-Object { -not $BeforeRows.ContainsKey("$($_.setCode)|$($_.cardNo)|$($_.cardName)") }).Count
    fetchFailureCount = @($fetchAudit.records | Where-Object { $_.error }).Count
    sourceState = if ($fetchAudit.status -ne 'success') { '部分取得・未巡回または停止対象あり' } elseif ($updatedCount -gt 0) { '取得成功・データ更新あり' } else { '取得成功・データ元更新なし' }
    error = $null
  }
  $result | ConvertTo-Json | Set-Content -Path $ResultPath -Encoding utf8
  Write-Output ("PSA acquisition completed: acquired={0} updated={1}" -f $result.acquiredCount, $updatedCount)
} catch {
  $EndedAt = Get-Date
  $fetchAuditPath = Join-Path $PSScriptRoot 'psa-fetch-progress.json'
  $fetchAudit = if (Test-Path $fetchAuditPath) { Get-Content $fetchAuditPath -Raw | ConvertFrom-Json } else { $null }
  @{
    startedAt = $StartedAt.ToString('o')
    endedAt = $EndedAt.ToString('o')
    durationMs = [Math]::Round(($EndedAt - $StartedAt).TotalMilliseconds)
    status = 'failed'
    acquiredCount = 0
    savedTotalCount = if (Test-Path $PsaDataPath) { @((Get-Content $PsaDataPath -Raw | ConvertFrom-Json).rows).Count } else { 0 }
    updatedCount = 0
    fetchFailureCount = 1
    sourceState = if ($fetchAudit.status -eq 'manual-wait') { '手動対応待ち・過去正常データ保持' } else { 'PSA取得処理失敗' }
    error = if ($fetchAudit.stopReason) { $fetchAudit.stopReason } else { $_.Exception.Message }
  } | ConvertTo-Json | Set-Content -Path $ResultPath -Encoding utf8
  throw
}
