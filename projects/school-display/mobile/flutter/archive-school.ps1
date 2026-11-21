[CmdletBinding()]
param(
    [switch] $IncludeAndroid,
    [switch] $IncludeWeb,
    [switch] $IncludeWindows,
    [string] $WindowsDirectory,
    [string] $Destination
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (!$Destination) { $Destination = Join-Path $root 'archives' }
$destinationPath = (New-Item -ItemType Directory -Force -Path $Destination).FullName
$timestamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmssZ')
$archive = Join-Path $destinationPath "School-Display-$timestamp.zip"
$partial = "$archive.partial"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$paths = @(git -C $root -c core.quotepath=false ls-files --cached --others --exclude-standard -- .)
if ($LASTEXITCODE -ne 0 -or !$paths.Count) { throw 'Could not enumerate school project source.' }
$entries = [ordered]@{}
foreach ($path in ($paths | Sort-Object -Unique)) {
    # Keep tracked project build scripts, but leave local runtime and generated artifacts out.
    if ($path -match '(^|/)(runtime|archives|releases|node_modules|\.qa)/' -or
        $path -match '(\.sqlite($|\.)|\.(apk|p12|pfx|pem|key)$|google-services\.json$)' -or
        ($path -match '(^|/)\.env($|\.)' -and $path -notmatch '\.env\.example$')) { continue }
    $file = Join-Path $root $path
    if (Test-Path -LiteralPath $file -PathType Leaf) { $entries["school-display/$path"] = $file }
}
if ($IncludeAndroid) {
    foreach ($edition in @('parent','teacher')) {
        $source = Join-Path $PSScriptRoot "build/app/outputs/flutter-apk/app-$edition-debug.apk"
        if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing $edition Android build." }
        $entries["android-debug/Faslii-$edition.apk"] = $source
    }
}
if ($IncludeWeb) {
    foreach ($edition in @('teacher','parent')) {
        $web = Join-Path $PSScriptRoot "build/web-$edition"
        if (!(Test-Path -LiteralPath (Join-Path $web 'index.html') -PathType Leaf)) { throw "Missing $edition web build." }
        foreach ($file in (Get-ChildItem -LiteralPath $web -File -Recurse)) {
            $relative = $file.FullName.Substring($web.Length + 1).Replace('\','/')
            $entries["school-display/mobile/flutter/build/web-$edition/$relative"] = $file.FullName
        }
    }
}
if ($IncludeWindows) {
    if (!$WindowsDirectory) { $WindowsDirectory = Join-Path $root 'releases' }
    $version = (Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json).version
    foreach ($variant in @('Setup','Portable')) {
        $name = "Qatar-School-Time-Table-$variant-$version-x64.exe"
        $source = Join-Path $WindowsDirectory $name
        if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing Windows package: $name." }
        $entries["windows/$name"] = $source
    }
}
$payload = @()
foreach ($entry in $entries.GetEnumerator()) {
    $payload += [ordered]@{
        path = $entry.Key
        size = (Get-Item -LiteralPath $entry.Value).Length
        sha256 = (Get-FileHash -LiteralPath $entry.Value -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
$checkpoint = [ordered]@{
    project = 'school-display'
    createdUtc = [DateTimeOffset]::UtcNow.ToString('o')
    baseCommit = (git -C $root rev-parse HEAD)
    includesUncommittedProjectFiles = $true
    files = $payload
}
$zip = [IO.Compression.ZipFile]::Open($partial,[IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($entry in $entries.GetEnumerator()) {
        $mode = if ([IO.Path]::GetExtension($entry.Key) -in @('.apk','.exe')) { [IO.Compression.CompressionLevel]::NoCompression }
                else { [IO.Compression.CompressionLevel]::Optimal }
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$entry.Value,$entry.Key,$mode) | Out-Null
    }
    $writer = [IO.StreamWriter]::new($zip.CreateEntry('ARCHIVE-MANIFEST.json').Open())
    try { $writer.Write(($checkpoint | ConvertTo-Json -Depth 6)) } finally { $writer.Dispose() }
} finally { $zip.Dispose() }

$zip = [IO.Compression.ZipFile]::OpenRead($partial)
try {
    if ($zip.Entries.Count -ne ($payload.Count + 1)) { throw 'Archive entry count mismatch.' }
    foreach ($record in $payload) {
        $file = $zip.GetEntry($record.path)
        if (!$file -or $file.Length -ne $record.size) { throw "Archive size mismatch for $($record.path)." }
        $stream = $file.Open()
        try { $digest = (Get-FileHash -InputStream $stream -Algorithm SHA256).Hash.ToLowerInvariant() }
        finally { $stream.Dispose() }
        if ($digest -ne $record.sha256) { throw "Archive checksum mismatch for $($record.path)." }
    }
} finally { $zip.Dispose() }
Move-Item -LiteralPath $partial -Destination $archive
$digest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
"$digest  $([IO.Path]::GetFileName($archive))" | Set-Content -Encoding ascii -LiteralPath "$archive.sha256"
Write-Output "Verified $($payload.Count) files: $archive"

