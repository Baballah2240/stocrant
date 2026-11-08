# Island Desk hardware helper: prints one JSON line per second with GPU load and network throughput.
# Uses Windows performance counters; any counter that is missing on this PC is reported as null.
$ErrorActionPreference = "SilentlyContinue"
while ($true) {
  $gpu = $null; $up = $null; $down = $null
  try {
    $samples = (Get-Counter -Counter "\GPU Engine(*engtype_3D)\Utilization Percentage" -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop).CounterSamples
    $gpu = [math]::Min(100, [math]::Round((($samples | Measure-Object -Property CookedValue -Sum).Sum), 0))
  } catch { $gpu = $null }
  try {
    $net = (Get-Counter -Counter "\Network Interface(*)\Bytes Sent/sec", "\Network Interface(*)\Bytes Received/sec" -MaxSamples 1 -ErrorAction Stop).CounterSamples
    $up = [math]::Round((($net | Where-Object { $_.Path -like "*bytes sent/sec" } | Measure-Object -Property CookedValue -Sum).Sum), 0)
    $down = [math]::Round((($net | Where-Object { $_.Path -like "*bytes received/sec" } | Measure-Object -Property CookedValue -Sum).Sum), 0)
  } catch { $up = $null; $down = $null }
  [Console]::Out.WriteLine((@{ gpu = $gpu; up = $up; down = $down } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
