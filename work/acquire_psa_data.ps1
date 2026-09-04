param([int]$Retries = 3)

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
  throw "$Name failed after $MaxAttempts attempt(s)."
}

try {
  Invoke-Step -Name 'PSA regular Chrome startup' -MaxAttempts 2 -Operation { & (Join-Path $PSScriptRoot 'start_psa_regular_chrome.ps1') } | Out-Null
  $env:PSA_CDP_ENDPOINT = 'http://127.0.0.1:9222'
  $env:PSA_MIN_TOTAL_POPULATION = '500'
  Invoke-Step -Name 'PSA priority queue build' -Operation { & $Node (Join-Path $PSScriptRoot 'build_psa_priority_queue.js') } | Out-Null
  Invoke-Step -Name 'PSA official population update' -MaxAttempts $Retries -Operation { & $Node (Join-Path $PSScriptRoot 'update_psa_official_populations.js') } | Out-Null
  Invoke-Step -Name 'Snkr English name update' -MaxAttempts 2 -Operation { & $Node (Join-Path $PSScriptRoot 'update_snkr_english_names.js') } | Out-Null
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
    status = 'success'
    acquiredCount = @($afterPayload.rows).Count
    updatedCount = $updatedCount
    fetchFailureCount = 0
    sourceState = if ($updatedCount -gt 0) { '取得成功・データ更新あり' } else { '取得成功・データ元更新なし' }
    error = $null
  }
  $result | ConvertTo-Json | Set-Content -Path $ResultPath -Encoding utf8
  Write-Output ("PSA acquisition completed: acquired={0} updated={1}" -f $result.acquiredCount, $updatedCount)
} catch {
  $EndedAt = Get-Date
  @{
    startedAt = $StartedAt.ToString('o')
    endedAt = $EndedAt.ToString('o')
    durationMs = [Math]::Round(($EndedAt - $StartedAt).TotalMilliseconds)
    status = 'failed'
    acquiredCount = if (Test-Path $PsaDataPath) { @((Get-Content $PsaDataPath -Raw | ConvertFrom-Json).rows).Count } else { 0 }
    updatedCount = 0
    fetchFailureCount = 1
    sourceState = 'PSA取得処理失敗'
    error = $_.Exception.Message
  } | ConvertTo-Json | Set-Content -Path $ResultPath -Encoding utf8
  throw
}
