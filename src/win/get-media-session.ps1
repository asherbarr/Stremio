# Reads the current System Media Transport Controls (SMTC) session and prints it as JSON.
# This is the Windows equivalent of MPRIS on Linux: Windows exposes "now playing" info for
# apps that register a media session (Chromium/QtWebEngine-based apps using the HTML5
# Media Session API generally do). Stremio's desktop shell is Chromium-based, so playback
# inside it should surface here the same way a browser tab playing a video does.
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($asyncOp, $resultType) {
    $genericMethod = $asTaskGeneric.MakeGenericMethod($resultType)
    $task = $genericMethod.Invoke($null, @($asyncOp))
    $task.Wait() | Out-Null
    return $task.Result
}

try {
    [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
    $managerOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $manager = Await $managerOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

    $sessions = $manager.GetSessions()
    $target = $null
    foreach ($s in $sessions) {
        if ($s.SourceAppUserModelId -match "stremio") { $target = $s; break }
    }
    if (-not $target -and $sessions.Count -gt 0) { $target = $sessions[0] }

    if (-not $target) {
        Write-Output '{"status":"Stopped"}'
        exit 0
    }

    $playback = $target.GetPlaybackInfo()
    $statusMap = @{ 0 = "Closed"; 1 = "Opened"; 2 = "Changing"; 3 = "Stopped"; 4 = "Playing"; 5 = "Paused" }
    $status = $statusMap[[int]$playback.PlaybackStatus]
    if ($status -eq "Playing") { $mpris = "Playing" } elseif ($status -eq "Paused") { $mpris = "Paused" } else { $mpris = "Stopped" }

    $propsOp = $target.TryGetMediaPropertiesAsync()
    $props = Await $propsOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])

    $result = [PSCustomObject]@{
        status = $mpris
        title  = $props.Title
        appId  = $target.SourceAppUserModelId
    }
    $result | ConvertTo-Json -Compress
} catch {
    Write-Output '{"status":"Stopped"}'
}
