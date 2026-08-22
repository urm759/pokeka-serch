$ErrorActionPreference = 'Stop'
$Runner = Join-Path $PSScriptRoot 'run_psa_scheduled_update.ps1'
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`""
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

$Tasks = @(
  @{ Name='Pokeka PSA Update 0000'; Trigger=(New-ScheduledTaskTrigger -Daily -At '00:00') },
  @{ Name='Pokeka PSA Update 0630'; Trigger=(New-ScheduledTaskTrigger -Daily -At '06:30') },
  @{ Name='Pokeka PSA Update Logon'; Trigger=(New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME") }
)

foreach ($Task in $Tasks) {
  Register-ScheduledTask -TaskName $Task.Name -Action $Action -Trigger $Task.Trigger -Settings $Settings -Principal $Principal -Description 'PSA公式Populationを取得し、ポケカ仕入れ判断サイトへ反映します。' -Force | Out-Null
  Write-Output "Registered: $($Task.Name)"
}
