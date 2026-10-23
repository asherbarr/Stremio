# Windows equivalent of installing contrib/stremio-rpc.service: starts the RPC service at
# logon, hidden (no console window). Uses a shortcut in the user's Startup folder rather
# than a Scheduled Task, since registering a task requires admin rights this installer
# shouldn't assume it has; Startup-folder shortcuts need none.
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$entry = Join-Path $repoRoot "src\index.js"
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "StremioDiscordRPC.lnk"

$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($shortcutPath)
$s.TargetPath = "powershell.exe"
$s.Arguments = "-NoProfile -WindowStyle Hidden -Command `"& '$((Get-Command node.exe).Source)' --no-warnings '$entry'`""
$s.WorkingDirectory = $repoRoot
$s.Description = "Discord Rich Presence for Stremio"
$s.Save()

Write-Host "Installed startup shortcut: $shortcutPath"
Write-Host "Starting it now..."
Start-Process powershell.exe -ArgumentList "-NoProfile -WindowStyle Hidden -Command `"& '$((Get-Command node.exe).Source)' --no-warnings '$entry'`""
Write-Host "Logs: run 'node src\index.js' manually in a terminal to see console output."
