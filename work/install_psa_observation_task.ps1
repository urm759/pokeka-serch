$ErrorActionPreference = 'Stop'
$Base = Get-ScheduledTask -TaskName 'Pokeka PSA Update 1700'
$Observer = Join-Path $PSScriptRoot 'observe_psa_tasks.ps1'
$Action = New-ScheduledTaskAction -Execute $Base.Actions.Execute -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $Observer + '" -Publish')
$Triggers = @((New-ScheduledTaskTrigger -Daily -At '04:50'), (New-ScheduledTaskTrigger -Daily -At '17:20'), (New-ScheduledTaskTrigger -AtLogOn))
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Pokeka PSA Independent Observation' -Action $Action -Trigger $Triggers -Settings $Settings -Description 'Observe PSA registration and results independently; no authentication bypass.' -Force
& $Observer
