param([int]$Retries = 3)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$Git = 'C:\Program Files\Git\cmd\git.exe'
$StatePath = Join-Path $PSScriptRoot 'repo_sync_state.json'
$StartedAt = Get-Date

function Invoke-GitRetry {
  param([string[]]$Arguments)
  $lastOutput = ''
  for ($attempt = 1; $attempt -le $Retries; $attempt += 1) {
    $output = & $Git -C $Repo @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $lastOutput = ($output | Out-String).Trim()
    if ($exitCode -eq 0) {
      return @{ Success = $true; Attempt = $attempt; Output = $lastOutput }
    }
    if ($attempt -lt $Retries) { Start-Sleep -Seconds ([Math]::Min(15, 3 * $attempt)) }
  }
  return @{ Success = $false; Attempt = $Retries; Output = $lastOutput }
}

$fetch = Invoke-GitRetry -Arguments @('fetch', 'origin', 'main')
$merge = @{ Success = $false; Attempt = 0; Output = 'fetch failed' }
if ($fetch.Success) {
  $merge = Invoke-GitRetry -Arguments @('merge', '--ff-only', 'origin/main')
}
$EndedAt = Get-Date
$success = $fetch.Success -and $merge.Success
$message = if (-not $fetch.Success) { "git fetch failed: $($fetch.Output)" }
  elseif (-not $merge.Success) { "git ff-only merge skipped/failed: $($merge.Output)" }
  else { 'GitHub mainとの同期完了' }

@{
  startedAt = $StartedAt.ToString('o')
  endedAt = $EndedAt.ToString('o')
  durationMs = [Math]::Round(($EndedAt - $StartedAt).TotalMilliseconds)
  status = if ($success) { 'success' } else { 'warning' }
  fetchAttempts = $fetch.Attempt
  mergeAttempts = $merge.Attempt
  message = $message
} | ConvertTo-Json | Set-Content -Path $StatePath -Encoding utf8

Write-Output $message
if (-not $success) { exit 1 }
