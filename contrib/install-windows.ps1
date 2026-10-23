# Windows equivalent of installing contrib/stremio-rpc.service: registers a Scheduled Task
# that starts the RPC service at logon, hidden (no console window), restarting on logon only
# (Task Scheduler has no systemd-style "Restart=on-failure"; the service itself reconnects
# to Discord on its own, see discord-rpc.js).
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$entry = Join-Path $repoRoot "src\index.js"
$taskName = "StremioDiscordRPC"

$node = (Get-Command node.exe).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "--no-warnings `"$entry`"" -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Registered scheduled task '$taskName'. Starting it now..."
Start-ScheduledTask -TaskName $taskName
Write-Host "Logs: run 'node src\index.js' manually in a terminal to see console output."
