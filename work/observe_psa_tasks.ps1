param([switch]$Publish, [string]$RegisteredRepo)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$File = Join-Path $Repo 'data/psa-pc-observation.json'
$TaskRepo = if ($RegisteredRepo) { $RegisteredRepo } else { $Repo }
$StateFile = Join-Path $TaskRepo 'work/psa_update_state.json'
$Runner = Join-Path $TaskRepo 'work/run_psa_scheduled_update.ps1'
$Node = 'C:\Users\polar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$Git = 'C:\Program Files\Git\cmd\git.exe'
$env:PATH = (Split-Path $Git) + ';' + $env:PATH
$Observation = @{ observedAt = (Get-Date).ToString('o'); tasks = @(); error = $null }
try {
  $State = if (Test-Path $StateFile) { Get-Content $StateFile -Raw | ConvertFrom-Json } else { $null }
  $Observation.acquisitionState = $State
  $Observation.registeredRepo = $TaskRepo
  $Observation.fetchProgress = if (Test-Path (Join-Path $TaskRepo 'work/psa-fetch-progress.json')) { Get-Content (Join-Path $TaskRepo 'work/psa-fetch-progress.json') -Raw | ConvertFrom-Json } else { $null }
  $Observation.phases = @{
    startup = if ($State.lastAttemptAt) { '起動済み' } else { '観測なし' }
    acquisition = if ($State.status -eq 'failed') { '停止・認証または取得異常' } else { $State.sourceState }
    save = '過去正常値とチェックポイントを保持'
    publication = $State.publishStatus
    acquisitionStop = $State.lastError
    publicationStop = $State.publishError
    savedDataLastSuccessAt = $State.lastSuccessAt
    note = '最後の取得成功と最後の公開成功は別。登録先のデータと実行結果を読み取った観測'
  }
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
  try { & (Join-Path $PSScriptRoot 'publish_psa_update.ps1'); if ($LASTEXITCODE -ne 0) { throw '観測公開待ち。保存済みPSA受渡しを保持' } }
  finally { Pop-Location }
}
if ($Observation.error) { Write-Error $Observation.error; exit 1 }
