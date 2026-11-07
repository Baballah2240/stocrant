# Island Desk now-playing helper.
# Reads Windows' system media session (the one shown in the volume flyout) and prints one JSON line
# whenever it changes. Accepts commands on stdin: toggle, next, previous.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

$stdin = [Console]::In
$pending = $stdin.ReadLineAsync()
$last = ""; $lastTrack = ""; $art = ""
while ($true) {
  try {
    $session = $manager.GetCurrentSession()
    if ($pending.IsCompleted) {
      $command = $pending.Result; if ($null -eq $command) { exit 0 }
      if ($session) {
        switch ($command.Trim()) {
          "toggle"   { Await ($session.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
          "next"     { Await ($session.TrySkipNextAsync()) ([bool]) | Out-Null }
          "previous" { Await ($session.TrySkipPreviousAsync()) ([bool]) | Out-Null }
        }
      }
      $pending = $stdin.ReadLineAsync()
    }
    if (-not $session) { $state = @{ active = $false } }
    else {
      $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $info = $session.GetPlaybackInfo(); $timeline = $session.GetTimelineProperties()
      $track = "$($session.SourceAppUserModelId)|$($props.Title)|$($props.Artist)"
      if ($track -ne $lastTrack) {
        $lastTrack = $track; $art = ""
        if ($props.Thumbnail) {
          try {
            $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            if ($stream.Size -gt 0 -and $stream.Size -lt 3MB) {
              $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
              Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32]) | Out-Null
              $bytes = New-Object byte[] ([int]$stream.Size); $reader.ReadBytes($bytes)
              $art = "data:$($stream.ContentType);base64," + [Convert]::ToBase64String($bytes)
            }
          } catch { $art = "" }
        }
      }
      $state = @{
        active = $true; app = "$($session.SourceAppUserModelId)"; title = "$($props.Title)"; artist = "$($props.Artist)"; album = "$($props.AlbumTitle)"
        playing = ($info.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing)
        canNext = $info.Controls.IsNextEnabled; canPrevious = $info.Controls.IsPreviousEnabled; canToggle = ($info.Controls.IsPlayPauseToggleEnabled -or $info.Controls.IsPauseEnabled -or $info.Controls.IsPlayEnabled)
        positionMs = [int64]$timeline.Position.TotalMilliseconds; durationMs = [int64]($timeline.EndTime - $timeline.StartTime).TotalMilliseconds
        updatedAt = [int64]([DateTimeOffset]$timeline.LastUpdatedTime).ToUnixTimeMilliseconds(); art = $art
      }
    }
    $json = $state | ConvertTo-Json -Compress
    if ($json -ne $last) { $last = $json; [Console]::Out.WriteLine($json); [Console]::Out.Flush() }
  } catch { [Console]::Out.WriteLine((@{ active = $false; error = "$($_.Exception.Message)" } | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
  Start-Sleep -Milliseconds 700
}
