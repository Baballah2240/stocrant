Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$branding = Join-Path $projectRoot 'mobile\branding'
$design = Get-Content -LiteralPath (Join-Path $branding 'icon-design.json') -Raw | ConvertFrom-Json
$androidRes = Join-Path $projectRoot 'android\app\src\main\res'
$iosIcon = Join-Path $projectRoot 'ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png'
function Color([string]$value) { return [System.Drawing.ColorTranslator]::FromHtml($value) }
function Rounded([single]$x,[single]$y,[single]$width,[single]$height,[single]$radius) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = $radius * 2
    $path.AddArc($x,$y,$d,$d,180,90)
    $path.AddArc($x+$width-$d,$y,$d,$d,270,90)
    $path.AddArc($x+$width-$d,$y+$height-$d,$d,$d,0,90)
    $path.AddArc($x,$y+$height-$d,$d,$d,90,90)
    $path.CloseFigure()
    return $path
}
function Render-Icon([int]$size,[string]$destination,[string]$kind='square') {
    $bitmap = [System.Drawing.Bitmap]::new($size,$size,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        if ($kind -ne 'foreground') {
            $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Rectangle]::new(0,0,$size,$size),(Color $design.backgroundStart),(Color $design.backgroundEnd),[single]45)
            try {
                if ($kind -eq 'round') { $g.FillEllipse($brush,[single]($size*.025),[single]($size*.025),[single]($size*.95),[single]($size*.95)) }
                elseif ($kind -eq 'legacy') { $background = Rounded ($size*.025) ($size*.025) ($size*.95) ($size*.95) ($size*.215); try { $g.FillPath($brush,$background) } finally { $background.Dispose() } }
                else { $g.FillRectangle($brush,0,0,$size,$size) }
            } finally { $brush.Dispose() }
        }
        # Keep the mark centered inside the adaptive icon's safe region.
        $scale = if ($kind -eq 'foreground') { .85 } else { 1.0 }
        $offset = $size * (1-$scale)/2
        $g.TranslateTransform([single]$offset,[single]$offset)
        $g.ScaleTransform([single]$scale,[single]$scale)
        $tile = Rounded ($size*$design.tile.x) ($size*$design.tile.y) ($size*$design.tile.width) ($size*$design.tile.height) ($size*$design.tile.radius)
        try {
            $paper = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.RectangleF]::new([single]($size*$design.tile.x),[single]($size*$design.tile.y),[single]($size*$design.tile.width),[single]($size*$design.tile.height)),(Color $design.paperStart),(Color $design.paperEnd),[single]65)
            try { $g.FillPath($paper,$tile) } finally { $paper.Dispose() }
            $rim = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(75,255,255,255),[single]($size*.004))
            try { $g.DrawPath($rim,$tile) } finally { $rim.Dispose() }
        } finally { $tile.Dispose() }
        $pen = [System.Drawing.Pen]::new((Color $design.ink),[single]($size*$design.line.width))
        try {
            $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
            $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
            for ($i=0;$i -lt $design.line.rows.Count;$i++) {
                $right = if ($i -eq 1) { $design.line.shortRight } else { $design.line.right }
                $g.DrawLine($pen,[single]($size*$design.line.left),[single]($size*$design.line.rows[$i]),[single]($size*$right),[single]($size*$design.line.rows[$i]))
            }
        } finally { $pen.Dispose() }
        [System.IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
        $bitmap.Save($destination,[System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $g.Dispose(); $bitmap.Dispose() }
}
$densities = @{'mdpi'=48;'hdpi'=72;'xhdpi'=96;'xxhdpi'=144;'xxxhdpi'=192}
foreach ($density in $densities.GetEnumerator()) {
    $directory = Join-Path $androidRes ('mipmap-'+$density.Key)
    Render-Icon $density.Value (Join-Path $directory 'ic_launcher.png') 'legacy'
    Render-Icon $density.Value (Join-Path $directory 'ic_launcher_round.png') 'round'
    Render-Icon ([int]($density.Value*9/4)) (Join-Path $directory 'ic_launcher_foreground.png') 'foreground'
}
Render-Icon 1024 $iosIcon 'square'
Render-Icon 1024 (Join-Path $branding 'stocrant-app-icon.png') 'square'
Render-Icon 512 (Join-Path $branding 'stocrant-app-icon-preview.png') 'legacy'
# Export the same geometry as an editable SVG master.
$ci = [System.Globalization.CultureInfo]::InvariantCulture
function N([double]$v) { return ($v*1024).ToString('0.###',$ci) }
$rows = for($i=0;$i -lt $design.line.rows.Count;$i++) {
    $right = if($i -eq 1){$design.line.shortRight}else{$design.line.right}
    '<path d="M '+(N $design.line.left)+' '+(N $design.line.rows[$i])+' H '+(N $right)+'" />'
}
$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Stocrant app icon"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="'+$design.backgroundStart+'"/><stop offset="1" stop-color="'+$design.backgroundEnd+'"/></linearGradient><linearGradient id="paper" x2=".45" y2="1"><stop stop-color="'+$design.paperStart+'"/><stop offset="1" stop-color="'+$design.paperEnd+'"/></linearGradient></defs><path fill="url(#bg)" d="M0 0h1024v1024H0z"/><rect x="'+(N $design.tile.x)+'" y="'+(N $design.tile.y)+'" width="'+(N $design.tile.width)+'" height="'+(N $design.tile.height)+'" rx="'+(N $design.tile.radius)+'" fill="url(#paper)" stroke="#ffffff" stroke-opacity=".29" stroke-width="4"/><g fill="none" stroke="'+$design.ink+'" stroke-width="'+(N $design.line.width)+'" stroke-linecap="round">'+($rows -join '')+'</g></svg>'
[System.IO.File]::WriteAllText((Join-Path $branding 'stocrant-app-icon.svg'),$svg,[System.Text.UTF8Encoding]::new($false))
$colors = '<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">'+$design.backgroundEnd+'</color></resources>'
[System.IO.File]::WriteAllText((Join-Path $androidRes 'values\ic_launcher_background.xml'),$colors,[System.Text.UTF8Encoding]::new($false))
Write-Output 'Generated Stocrant blue/mint master, Android launcher sizes and iOS app icon.'
