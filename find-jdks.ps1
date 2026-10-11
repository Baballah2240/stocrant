# Temporary helper: lists every java.exe found under common install roots.
$roots = @(
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)},
    $env:LOCALAPPDATA,
    "$env:LOCALAPPDATA\Programs",
    "C:\jdk",
    "C:\Java"
)

$found = foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem -Path $root -Directory -Depth 3 -Filter "bin" -ErrorAction SilentlyContinue |
        ForEach-Object {
            $java = Join-Path $_.FullName "java.exe"
            if (Test-Path $java) { $java }
        }
}

$found | Sort-Object -Unique
