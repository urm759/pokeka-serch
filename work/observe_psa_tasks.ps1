param([switch]$Publish)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$File = Join-Path $Repo 'data/psa-pc-observation.json'
$StateFile = Join-Path $PSScriptRoot 'psa_update_state.json'
$Runner = Join-Path $PSScriptRoot 'run_psa_scheduled_update.ps1'
$Observation = @{ observedAt = (Get-Date).ToString('o'); tasks = @(); error = $null }
try {
  $State = if (Test-Path $StateFile) { Get-Content $StateFile -Raw | ConvertFrom-Json } else { $null }
  $Observation.independentObserverRegistered = @(Get-ScheduledTask | Where-Object { $_.TaskName -eq 'Pokeka PSA Independent Observation' }).Count -eq 1
  $Observation.tasks = @(Get-ScheduledTask | Where-Object { $_.TaskName -like 'Pokeka PSA Update*' } | ForEach-Object {
    $Info = $_ | Get-ScheduledTaskInfo
    $Valid = @($_.Actions | Where-Object { (Test-Path -LiteralPath $_.Execute) -and $_.Arguments.Contains($Runner) }).Count -gt 0
    $PreStart = $Info.LastTaskResult -notin @(0, 267009) -and (!$State -or $Info.LastRunTime -gt ([datetime]$State.lastAttemptAt).AddMinutes(2))
    @{ name = $_.TaskName; registrationValid = $Valid; target = if ($Valid) { 'site/work/run_psa_scheduled_update.ps1' } else { '登録先不一致・実行ファイルなし' }
       state = $_.State.ToString(); lastRun = $Info.LastRunTime.ToString('o'); result = $Info.LastTaskResult
       nextRun = if ($Info.NextRunTime.Year -gt 2000) { $Info.NextRunTime.ToString('o') } else { $null }
       preStartFailure = $PreStart; reason = if (!$Valid) { '登録先確認が必要' } elseif ($PreStart) { 'PSA処理の最終試行より新しいタスク起動失敗' } else { $null } }
  })
  if ($Observation.tasks.Count -ne 3) { $Observation.error = 'PSA更新タスクの登録数が3件ではありません' }
} catch { $Observation.error = $_.Exception.Message }
$Observation | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $File -Encoding utf8
if ($Publish) {
  Push-Location $Repo
  try { node work/finalize_update_status.js; if ($LASTEXITCODE -ne 0) { throw '監視表示生成失敗' }; git add -- data/psa-pc-observation.json data/update-status.json data/update-history.json work/psa_update_state.json; node work/publish_data_checkpoint.js 'Record independent PSA PC task observation'; if ($LASTEXITCODE -ne 0) { throw '観測公開失敗。ローカル保存・復旧bundleを確認' } }
  finally { Pop-Location }
}
if ($Observation.error) { Write-Error $Observation.error; exit 1 }
