Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=Split-Path -Parent $PSScriptRoot
$target=Join-Path $root 'src\assets\branding'
New-Item -ItemType Directory -Path $target -Force | Out-Null
$cyan='#60D6EF'; $navy='#102532'; $white='#EDF7FC'
# One canonical pair of ribbons, traced from the supplied rounded S reference.
$top='M108 0H276C290 0 298 8 298 22V54C298 68 290 76 276 76H132C99 76 78 89 78 109C78 139 94 159 121 177C128 182 126 186 118 186H76C32 186 0 155 0 109C0 49 49 0 108 0Z'
$bottom='M142 104H226C270 104 304 137 304 181C304 244 262 292 204 292H22C8 292 0 284 0 270V238C0 224 8 216 22 216H188C211 216 222 203 222 181V176C222 166 216 160 206 160H142C128 160 118 150 118 136V128C118 114 128 104 142 104Z'
$mark='<path d="'+$top+'"/><path d="'+$bottom+'"/>'
$font=[System.Drawing.FontFamily]::new('Century Gothic')
$outline=[System.Drawing.Drawing2D.GraphicsPath]::new()
try {
  $outline.AddString('Stocrant',$font,[int][System.Drawing.FontStyle]::Bold,256,[System.Drawing.PointF]::new(0,0),[System.Drawing.StringFormat]::GenericTypographic)
  $bounds=$outline.GetBounds();$scale=234/$bounds.Height
  $matrix=[System.Drawing.Drawing2D.Matrix]::new($scale,0,0,$scale,360-$bounds.X*$scale,29-$bounds.Y*$scale)
  $outline.Transform($matrix);$matrix.Dispose()
  $points=$outline.PathPoints;$types=$outline.PathTypes;$ci=[System.Globalization.CultureInfo]::InvariantCulture
  function Point($p){return $p.X.ToString('0.###',$ci)+' '+$p.Y.ToString('0.###',$ci)}
  $path=[System.Text.StringBuilder]::new()
  for($i=0;$i -lt $points.Length;$i++) {
    $kind=$types[$i] -band 7
    if($kind -eq 0){[void]$path.Append('M'+(Point $points[$i]))}
    elseif($kind -eq 1){[void]$path.Append('L'+(Point $points[$i]))}
    elseif($kind -eq 3){[void]$path.Append('C'+(Point $points[$i])+' '+(Point $points[$i+1])+' '+(Point $points[$i+2]));$i+=2}
    if(($types[$i] -band 128) -ne 0){[void]$path.Append('Z')}
  }
  $width=[math]::Ceiling($outline.GetBounds().Right+2)
  foreach($variant in @(@{name='dark';ink=$white},@{name='light';ink=$navy})) {
    $svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+$width+' 292" role="img" aria-label="Stocrant"><g fill="'+$cyan+'">'+$mark+'</g><path fill="'+$variant.ink+'" d="'+$path.ToString()+'"/></svg>'
    [IO.File]::WriteAllText((Join-Path $target ('stocrant-logo-'+$variant.name+'.svg')),$svg,[Text.UTF8Encoding]::new($false))
  }
} finally {$outline.Dispose();$font.Dispose()}
$icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-28 -34 360 360" role="img" aria-label="Stocrant"><g fill="'+$cyan+'">'+$mark+'</g></svg>'
[IO.File]::WriteAllText((Join-Path $target 'stocrant-icon.svg'),$icon,[Text.UTF8Encoding]::new($false))
foreach($variant in @(@{name='stocrant-app-icon';scale=1.82;x=235.36;y=246.28;bg=$true},@{name='stocrant-adaptive-foreground';scale=1.42;x=296.16;y=304.68;bg=$false})) {
  $bg=if($variant.bg){'<path fill="'+$navy+'" d="M0 0H1024V1024H0Z"/>'}else{''}
  $svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'+$bg+'<g fill="'+$cyan+'" transform="translate('+$variant.x+' '+$variant.y+') scale('+$variant.scale+')">'+$mark+'</g></svg>'
  [IO.File]::WriteAllText((Join-Path $root ('mobile\branding\'+$variant.name+'.svg')),$svg,[Text.UTF8Encoding]::new($false))
}
Write-Output 'Generated flat SVG wordmarks, canonical S and native icon masters. Wordmarks contain paths only.'

$public=Join-Path $root 'public\branding'
New-Item -ItemType Directory -Path $public -Force | Out-Null
Get-ChildItem -LiteralPath $target -Filter '*.svg' | Copy-Item -Destination $public -Force
