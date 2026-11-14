# Génère l'icône de Zuri (build/icon.png, build/icon.ico, resources/icon.png)
# sans dépendance externe, à partir d'un dessin vectoriel GDI+.
# Usage : pwsh -File scripts/make-icon.ps1
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Add-Type -AssemblyName System.Drawing

$Indigo = [System.Drawing.ColorTranslator]::FromHtml('#24325B')
$Terracotta = [System.Drawing.ColorTranslator]::FromHtml('#A8451F')
$Acacia = [System.Drawing.ColorTranslator]::FromHtml('#3F6B45')
$Sand = [System.Drawing.ColorTranslator]::FromHtml('#EFE6D6')
$Gold = [System.Drawing.ColorTranslator]::FromHtml('#D9A05B')

function New-RoundedPath([single]$size, [single]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $radius * 2
  $path.AddArc(0, 0, $d, $d, 180, 90)
  $path.AddArc($size - $d, 0, $d, $d, 270, 90)
  $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
  $path.AddArc(0, $size - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Render-Icon([int]$size) {
  $scale = 4
  $s = [single]($size * $scale)
  $canvas = [System.Drawing.Bitmap]::new($size * $scale, $size * $scale, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  # Fond : carré arrondi indigo.
  $path = New-RoundedPath $s (0.22 * $s)
  $bg = [System.Drawing.SolidBrush]::new($Indigo)
  $g.FillPath($bg, $path)

  $c = $s / 2
  $r0 = 0.315 * $s   # base des rayons
  $r1 = 0.428 * $s   # pointe des rayons
  $half = 5.5 * [Math]::PI / 180
  $rayBrush = [System.Drawing.SolidBrush]::new($Terracotta)

  # Rayons : huit triangles terracotta.
  for ($i = 0; $i -lt 8; $i++) {
    $a = ($i * 45) * [Math]::PI / 180
    $points = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new(
        [single]($c + $r0 * [Math]::Cos($a - $half)),
        [single]($c + $r0 * [Math]::Sin($a - $half))
      ),
      [System.Drawing.PointF]::new(
        [single]($c + $r0 * [Math]::Cos($a + $half)),
        [single]($c + $r0 * [Math]::Sin($a + $half))
      ),
      [System.Drawing.PointF]::new(
        [single]($c + $r1 * [Math]::Cos($a)),
        [single]($c + $r1 * [Math]::Sin($a))
      )
    )
    $g.FillPolygon($rayBrush, $points)
  }

  # Anneau acacia en quatre arcs.
  $ringPen = [System.Drawing.Pen]::new($Acacia, [single](0.030 * $s))
  $ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $ringRect = [System.Drawing.RectangleF]::new(
    [single]($c - 0.262 * $s),
    [single]($c - 0.262 * $s),
    [single](0.524 * $s),
    [single](0.524 * $s)
  )
  for ($i = 0; $i -lt 4; $i++) {
    $g.DrawArc($ringPen, $ringRect, [single]($i * 90 + 15), [single]60)
  }

  # Disque de sable puis cœur or.
  $sandBrush = [System.Drawing.SolidBrush]::new($Sand)
  $g.FillEllipse($sandBrush, [single]($c - 0.188 * $s), [single]($c - 0.188 * $s), [single](0.376 * $s), [single](0.376 * $s))
  $goldBrush = [System.Drawing.SolidBrush]::new($Gold)
  $g.FillEllipse($goldBrush, [single]($c - 0.150 * $s), [single]($c - 0.150 * $s), [single](0.300 * $s), [single](0.300 * $s))

  # Losanges tissés aux quatre diagonales.
  $diamondBrush = [System.Drawing.SolidBrush]::new($Sand)
  $diamondR = 0.335 * $s
  $diamondW = 0.018 * $s
  for ($i = 0; $i -lt 4; $i++) {
    $a = ($i * 90 + 45) * [Math]::PI / 180
    $dx = $c + $diamondR * [Math]::Cos($a)
    $dy = $c + $diamondR * [Math]::Sin($a)
    $g.FillPolygon($diamondBrush, [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new([single]($dx), [single]($dy - $diamondW)),
      [System.Drawing.PointF]::new([single]($dx + $diamondW), [single]($dy)),
      [System.Drawing.PointF]::new([single]($dx), [single]($dy + $diamondW)),
      [System.Drawing.PointF]::new([single]($dx - $diamondW), [single]($dy))
    ))
  }

  $result = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $rg = [System.Drawing.Graphics]::FromImage($result)
  $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $rg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $rg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $rg.DrawImage($canvas, 0, 0, $size, $size)

  foreach ($item in @($rg, $g, $canvas, $bg, $rayBrush, $ringPen, $sandBrush, $goldBrush, $diamondBrush, $path)) {
    $item.Dispose()
  }
  return $result
}

function Get-PngBytes([System.Drawing.Bitmap]$bitmap) {
  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $stream.ToArray()
  $stream.Dispose()
  return $bytes
}

$buildDir = Join-Path $Root 'build'
$resourceDir = Join-Path $Root 'resources'
[System.IO.Directory]::CreateDirectory($buildDir) | Out-Null
[System.IO.Directory]::CreateDirectory($resourceDir) | Out-Null

# PNG principal (1024 px) et PNG de fenêtre (256 px).
$large = Render-Icon 1024
[System.IO.File]::WriteAllBytes((Join-Path $buildDir 'icon.png'), (Get-PngBytes $large))
$large.Dispose()

$window = Render-Icon 256
[System.IO.File]::WriteAllBytes((Join-Path $resourceDir 'icon.png'), (Get-PngBytes $window))
$window.Dispose()

# ICO multi-résolutions (PNG compressé, supporté depuis Windows Vista).
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()
foreach ($size in $sizes) {
  $bitmap = Render-Icon $size
  $images += , (Get-PngBytes $bitmap)
  $bitmap.Dispose()
}

$icoPath = Join-Path $buildDir 'icon.ico'
$file = [System.IO.File]::Create($icoPath)
$writer = [System.IO.BinaryWriter]::new($file)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $size = $sizes[$i]
  $dim = if ($size -ge 256) { 0 } else { $size }
  $writer.Write([byte]$dim)
  $writer.Write([byte]$dim)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$images[$i].Length)
  $writer.Write([UInt32]$offset)
  $offset += $images[$i].Length
}
foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
$writer.Dispose()
$file.Dispose()

Write-Output "icône générée : $icoPath"
Write-Output "png 1024 : $(Join-Path $buildDir 'icon.png')"
Write-Output "png 256 : $(Join-Path $resourceDir 'icon.png')"
