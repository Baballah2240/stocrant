Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRes = Join-Path $projectRoot 'android\app\src\main\res'
$iosIcon = Join-Path $projectRoot 'ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png'

$brandGreen = [System.Drawing.ColorTranslator]::FromHtml('#164E3B')
$brandGreenLight = [System.Drawing.ColorTranslator]::FromHtml('#2B7057')
$paper = [System.Drawing.ColorTranslator]::FromHtml('#F5F7F4')

function New-RoundedRectanglePath {
    param(
        [System.Drawing.RectangleF] $Bounds,
        [single] $Radius
    )

    $diameter = $Radius * 2
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($Bounds.X, $Bounds.Y, $diameter, $diameter, 180, 90)
    $path.AddArc($Bounds.Right - $diameter, $Bounds.Y, $diameter, $diameter, 270, 90)
    $path.AddArc($Bounds.Right - $diameter, $Bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($Bounds.X, $Bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-IconCanvas {
    param([int] $Size)

    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Draw-LedgerMark {
    param(
        [System.Drawing.Graphics] $Graphics,
        [single] $CanvasSize,
        [bool] $WithBackground,
        [bool] $CircularBackground = $false
    )

    if ($WithBackground) {
        $inset = $CanvasSize * 0.035
        if ($CircularBackground) {
            $Graphics.FillEllipse([System.Drawing.SolidBrush]::new($brandGreen), $inset, $inset, $CanvasSize - ($inset * 2), $CanvasSize - ($inset * 2))
        } else {
            $backgroundPath = New-RoundedRectanglePath -Bounds ([System.Drawing.RectangleF]::new($inset, $inset, $CanvasSize - ($inset * 2), $CanvasSize - ($inset * 2))) -Radius ($CanvasSize * 0.19)
            $Graphics.FillPath([System.Drawing.SolidBrush]::new($brandGreen), $backgroundPath)
            $backgroundPath.Dispose()
        }

        $accentPath = New-RoundedRectanglePath -Bounds ([System.Drawing.RectangleF]::new($CanvasSize * 0.17, $CanvasSize * 0.17, $CanvasSize * 0.66, $CanvasSize * 0.66)) -Radius ($CanvasSize * 0.15)
        $Graphics.FillPath([System.Drawing.SolidBrush]::new($brandGreenLight), $accentPath)
        $accentPath.Dispose()
    }

    $tileSize = $CanvasSize * 0.48
    $tileX = ($CanvasSize - $tileSize) / 2
    $tileY = ($CanvasSize - $tileSize) / 2
    $tilePath = New-RoundedRectanglePath -Bounds ([System.Drawing.RectangleF]::new($tileX, $tileY, $tileSize, $tileSize)) -Radius ($CanvasSize * 0.13)
    $Graphics.FillPath([System.Drawing.SolidBrush]::new($paper), $tilePath)
    $tilePath.Dispose()

    $pen = [System.Drawing.Pen]::new($brandGreen, $CanvasSize * 0.038)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $left = $CanvasSize * 0.345
    $right = $CanvasSize * 0.655
    $shortRight = $CanvasSize * 0.565
    $Graphics.DrawLine($pen, $left, $CanvasSize * 0.40, $right, $CanvasSize * 0.40)
    $Graphics.DrawLine($pen, $left, $CanvasSize * 0.50, $shortRight, $CanvasSize * 0.50)
    $Graphics.DrawLine($pen, $left, $CanvasSize * 0.60, $right, $CanvasSize * 0.60)
    $pen.Dispose()
}

function Save-Png {
    param(
        [System.Drawing.Bitmap] $Bitmap,
        [string] $Path
    )

    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

$legacySizes = @{
    'mipmap-mdpi' = 48
    'mipmap-hdpi' = 72
    'mipmap-xhdpi' = 96
    'mipmap-xxhdpi' = 144
    'mipmap-xxxhdpi' = 192
}

foreach ($entry in $legacySizes.GetEnumerator()) {
    $directory = Join-Path $androidRes $entry.Key
    $icon = New-IconCanvas -Size $entry.Value
    Draw-LedgerMark -Graphics $icon.Graphics -CanvasSize $entry.Value -WithBackground $true
    Save-Png -Bitmap $icon.Bitmap -Path (Join-Path $directory 'ic_launcher.png')
    $icon.Graphics.Dispose()
    $icon.Bitmap.Dispose()

    $roundIcon = New-IconCanvas -Size $entry.Value
    Draw-LedgerMark -Graphics $roundIcon.Graphics -CanvasSize $entry.Value -WithBackground $true -CircularBackground $true
    Save-Png -Bitmap $roundIcon.Bitmap -Path (Join-Path $directory 'ic_launcher_round.png')
    $roundIcon.Graphics.Dispose()
    $roundIcon.Bitmap.Dispose()

    # Android adaptive-icon foregrounds are 108dp canvases at each density.
    $foreground = New-IconCanvas -Size ($entry.Value * 9 / 4)
    Draw-LedgerMark -Graphics $foreground.Graphics -CanvasSize $foreground.Bitmap.Width -WithBackground $false
    Save-Png -Bitmap $foreground.Bitmap -Path (Join-Path $directory 'ic_launcher_foreground.png')
    $foreground.Graphics.Dispose()
    $foreground.Bitmap.Dispose()
}

$ios = New-IconCanvas -Size 1024
$ios.Graphics.Clear($brandGreen)
$iosAccentPath = New-RoundedRectanglePath -Bounds ([System.Drawing.RectangleF]::new(150, 150, 724, 724)) -Radius 220
$ios.Graphics.FillPath([System.Drawing.SolidBrush]::new($brandGreenLight), $iosAccentPath)
$iosAccentPath.Dispose()
Draw-LedgerMark -Graphics $ios.Graphics -CanvasSize 1024 -WithBackground $false
Save-Png -Bitmap $ios.Bitmap -Path $iosIcon
$ios.Graphics.Dispose()
$ios.Bitmap.Dispose()

Write-Host 'Generated STOCRANT Android and iOS launcher icon assets.'