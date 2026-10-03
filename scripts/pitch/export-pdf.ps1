param(
  [Parameter(Mandatory = $true)][string]$PresentationPath,
  [Parameter(Mandatory = $true)][string]$PdfPath,
  [Parameter(Mandatory = $true)][string]$RenderDirectory
)
$ErrorActionPreference = 'Stop'
$pptPath = (Resolve-Path -LiteralPath $PresentationPath).Path
$outputPdf = [IO.Path]::GetFullPath($PdfPath)
$outputRenders = [IO.Path]::GetFullPath($RenderDirectory)
New-Item -ItemType Directory -Path $outputRenders -Force | Out-Null
$existing = @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$powerPoint = New-Object -ComObject PowerPoint.Application
$deck = $null
try {
  $deck = $powerPoint.Presentations.Open($pptPath, -1, 0, 0)
  $deck.SaveAs($outputPdf, 32)
  $records = @()
  for ($index = 1; $index -le $deck.Slides.Count; $index++) {
    $slide = $deck.Slides.Item($index)
    $slide.Export((Join-Path $outputRenders ('slide-{0}.png' -f $index)), 'PNG', 1600, 900)
    $texts = @()
    $tables = 0
    $pictures = 0
    foreach ($shape in $slide.Shapes) {
      if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) { $texts += $shape.TextFrame.TextRange.Text }
      if ($shape.HasTable -eq -1) { $tables++ }
      if ($shape.Type -eq 13) { $pictures++ }
    }
    $notes = @()
    foreach ($shape in $slide.NotesPage.Shapes) {
      if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) { $notes += $shape.TextFrame.TextRange.Text }
    }
    $records += [pscustomobject]@{ slide = $index; editableTextShapes = $texts.Count; nativeTables = $tables; pictures = $pictures; text = $texts; notes = $notes }
  }
  $records | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputRenders 'powerpoint-inspection.json') -Encoding utf8
  [pscustomobject]@{ slides = $deck.Slides.Count; pdf = $outputPdf; renderDirectory = $outputRenders; pdfBytes = (Get-Item -LiteralPath $outputPdf).Length } | ConvertTo-Json
}
finally {
  if ($null -ne $deck) { $deck.Close(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($deck) }
  if (-not $existing) { $powerPoint.Quit() }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)
}
