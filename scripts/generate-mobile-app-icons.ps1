Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=Split-Path -Parent $PSScriptRoot
$branding=Join-Path $root 'mobile\branding'
$android=Join-Path $root 'android\app\src\main\res'
function Resize-Png([string]$source,[string]$destination,[int]$width,[int]$height,[bool]$splash=$false) {
 $image=[Drawing.Image]::FromFile($source);$bitmap=[Drawing.Bitmap]::new($width,$height);$g=[Drawing.Graphics]::FromImage($bitmap)
 try {
  $g.Clear($(if($splash){[Drawing.ColorTranslator]::FromHtml('#102532')}else{[Drawing.Color]::Transparent}))
  $g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$g.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if($splash){$w=[math]::Min($width*.66,$height*1.6);$h=$w*$image.Height/$image.Width;$g.DrawImage($image,[single](($width-$w)/2),[single](($height-$h)/2),[single]$w,[single]$h)}else{$g.DrawImage($image,0,0,$width,$height)}
  [IO.Directory]::CreateDirectory((Split-Path -Parent $destination))|Out-Null
  $bitmap.Save($destination,[Drawing.Imaging.ImageFormat]::Png)
 }finally{$g.Dispose();$bitmap.Dispose();$image.Dispose()}
}
$master=Join-Path $branding 'stocrant-app-icon.png';$foreground=Join-Path $branding 'stocrant-adaptive-foreground.png'
foreach($entry in @{'mdpi'=48;'hdpi'=72;'xhdpi'=96;'xxhdpi'=144;'xxxhdpi'=192}.GetEnumerator()){
 $folder=Join-Path $android ('mipmap-'+$entry.Key)
 foreach($name in @('ic_launcher','ic_launcher_round')){Resize-Png $master (Join-Path $folder ($name+'.png')) $entry.Value $entry.Value}
 $size=[int]($entry.Value*9/4);Resize-Png $foreground (Join-Path $folder 'ic_launcher_foreground.png') $size $size
}
Resize-Png $master (Join-Path $root 'ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png') 1024 1024
Resize-Png $master (Join-Path $branding 'stocrant-app-icon-preview.png') 512 512
Resize-Png $master (Join-Path $root 'public\branding\stocrant-app-icon.png') 180 180
$wordmark=Join-Path $branding 'stocrant-logo-dark.png'
$sizes=@{'mdpi'=@(480,320);'hdpi'=@(800,480);'xhdpi'=@(1280,720);'xxhdpi'=@(1600,960);'xxxhdpi'=@(1920,1280)}
foreach($file in Get-ChildItem -LiteralPath $android -Filter 'splash.png' -Recurse){$parts=$file.Directory.Name.Split('-');$pair=if($parts.Length -gt 2){$sizes[$parts[2]]}else{@(480,320)};$w=$pair[0];$h=$pair[1];if($parts -contains 'port'){$w=$pair[1];$h=$pair[0]};Resize-Png $wordmark $file.FullName $w $h $true}
foreach($file in Get-ChildItem -LiteralPath (Join-Path $root 'ios\App\App\Assets.xcassets\Splash.imageset') -Filter '*.png'){Resize-Png $wordmark $file.FullName 2732 2732 $true}
[IO.File]::WriteAllText((Join-Path $android 'values\ic_launcher_background.xml'),'<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#102532</color></resources>')
Write-Output 'Generated flat navy/cyan launcher, adaptive-safe foreground, iOS icon and full-wordmark splash images.'
