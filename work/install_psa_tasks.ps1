$ErrorActionPreference = 'Stop'
$Runner = Join-Path $PSScriptRoot 'run_psa_scheduled_update.ps1'
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`""
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

$Tasks = @(
  @{ Name='Pokeka PSA Update 0430'; Trigger=(New-ScheduledTaskTrigger -Daily -At '04:30') },
  @{ Name='Pokeka PSA Update 1700'; Trigger=(New-ScheduledTaskTrigger -Daily -At '17:00') },
  @{ Name='Pokeka PSA Update Logon'; Trigger=(New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME") }
)

@('Pokeka PSA Update 0000', 'Pokeka PSA Update 0630') | ForEach-Object {
  Unregister-ScheduledTask -TaskName $_ -Confirm:$false -ErrorAction SilentlyContinue
}

foreach ($Task in $Tasks) {
  Register-ScheduledTask -TaskName $Task.Name -Action $Action -Trigger $Task.Trigger -Settings $Settings -Principal $Principal -Description 'Refresh PSA population data for the Pokemon sourcing site.' -Force | Out-Null
  Write-Output "Registered: $($Task.Name)"
}
