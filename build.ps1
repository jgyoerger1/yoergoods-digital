# Yoergoods Digital - static site build
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1 [-SkipImages] [-SkipRender]
#   src\pages\**\*.html (front matter + body)  +  src\partials  +  src\data\site.json  ->  docs\ (deployable site)
#   source\shots\*.png (portfolio screenshots) and source\people\*.jpg are resized into docs\img with System.Drawing.
#   -SkipRender skips the Edge headless render of og-image.png and apple-touch-icon.png.
# ASCII only in this file (Windows PowerShell 5.1 reads BOM-less scripts as ANSI).
param([switch]$SkipImages, [switch]$SkipRender)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = $PSScriptRoot
$src = Join-Path $root 'src'
$docs = Join-Path $root 'docs'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$today = Get-Date -Format 'yyyy-MM-dd'
$sw = [Diagnostics.Stopwatch]::StartNew()

function Log($m) { Write-Host ("[{0,5:N1}s] {1}" -f $sw.Elapsed.TotalSeconds, $m) }
function Read-Text($p) { return [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) }
function Ensure-Dir($d) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force $d | Out-Null } }
function Write-Text($p, $t) { Ensure-Dir (Split-Path $p -Parent); [IO.File]::WriteAllText($p, $t, $utf8) }
function Attr($s) { return ([string]$s).Replace('&', '&amp;').Replace('"', '&quot;').Replace('<', '&lt;') }
function Money($n) { return '$' + ([int]$n).ToString('N0') }

# ---------------------------------------------------------------- config
$site = Get-Content (Join-Path $src 'data\site.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$base = [string]$site.basePath
$domain = ([string]$site.domain).TrimEnd('/')
$siteHost = $domain -replace '^https?://', ''
$prices = @{}
foreach ($t in $site.pricing.tiers) { $prices[[string]$t.id] = [int]$t.from }
$prices['care'] = [int]$site.pricing.care.from
$prices['careyear'] = [int]$site.pricing.care.annual
$locality = ([string]$site.location -split ',')[0].Trim()
$region = if (([string]$site.location -split ',').Count -gt 1) { ([string]$site.location -split ',')[1].Trim() } else { '' }

# the config the pages read as window.YG (pricing drives the quote builder)
$yg = [ordered]@{
  name = $site.name; domain = $domain; base = $base; email = $site.email; phone = $site.phone
  endpoint = $site.quoteEndpoint
  pricing = [ordered]@{ tiers = $site.pricing.tiers; care = $site.pricing.care; branding = $site.pricing.branding; estimate = $site.pricing.estimate }
}
$config = $yg | ConvertTo-Json -Compress -Depth 10

# Organization structured data, injected into every page head
$sameAs = @()
foreach ($p in $site.socials.PSObject.Properties) { if ([string]$p.Value) { $sameAs += [string]$p.Value } }
$offers = @()
foreach ($t in $site.pricing.tiers) {
  $offers += [ordered]@{ '@type' = 'Offer'; name = [string]$t.name; description = [string]$t.blurb; price = [string]$t.from; priceCurrency = 'USD'; url = "$domain$base/pricing/" }
}
if ($site.pricing.branding) {
  foreach ($bp in $site.pricing.branding.PSObject.Properties) {
    $b = $bp.Value
    $offers += [ordered]@{ '@type' = 'Offer'; name = [string]$b.name; description = [string]$b.blurb; price = [string]$b.price; priceCurrency = 'USD'; url = "$domain$base/branding/" }
  }
}
$org = [ordered]@{
  '@context' = 'https://schema.org'; '@type' = 'ProfessionalService'; '@id' = "$domain$base/#org"
  name = $site.name; url = "$domain$base/"; logo = "$domain$base/img/logo-mark.svg"; image = "$domain$base/og-image.png"
  slogan = $site.tagline
  description = 'Yoergoods Digital builds fast, Google-ready websites for small businesses, with fixed-price quotes and a professional project manager running every job.'
  email = $site.email; priceRange = '$$'
  address = [ordered]@{ '@type' = 'PostalAddress'; addressLocality = $locality; addressRegion = $region; addressCountry = 'US' }
  areaServed = @([ordered]@{ '@type' = 'Country'; name = 'United States' }, [ordered]@{ '@type' = 'State'; name = 'Ohio' })
  founder = [ordered]@{ '@type' = 'Person'; name = $site.owner; jobTitle = 'Founder and project manager'; sameAs = $sameAs }
  sameAs = $sameAs
  knowsAbout = @('Small business web design', 'Website redesign', 'Landing pages', 'Search engine optimization', 'Project management')
  makesOffer = $offers
}
$orgJson = $org | ConvertTo-Json -Compress -Depth 10

# ---------------------------------------------------------------- partials + token expansion
$partials = @{}
Get-ChildItem (Join-Path $src 'partials') -File | ForEach-Object { $partials[[IO.Path]::GetFileNameWithoutExtension($_.Name)] = Read-Text $_.FullName }

# {{include:name}} or {{include:name|KEY=value|OTHER=value}} (each KEY is replaced literally inside the partial)
function Expand-Includes([string]$text) {
  for ($i = 0; $i -lt 6; $i++) {
    if ($text -notmatch '\{\{include:') { break }
    $text = [regex]::Replace($text, '\{\{include:([a-zA-Z0-9_-]+)((?:\|[A-Za-z_]+=[^|}]+)*)\}\}', [System.Text.RegularExpressions.MatchEvaluator]{
      param($m) $n = $m.Groups[1].Value
      if (-not $partials.ContainsKey($n)) { throw "Unknown partial: $n" }
      $body = $partials[$n].TrimEnd()
      foreach ($kv in ($m.Groups[2].Value -split '\|')) { if ($kv -match '^([A-Za-z_]+)=(.+)$') { $body = $body.Replace($matches[1], $matches[2]) } }
      return $body
    })
  }
  return $text
}
function Get-SitePath([string]$path) {
  $cur = $site
  foreach ($part in $path.Split('.')) {
    if ($null -eq $cur) { return $null }
    if ($cur -is [array]) { $idx = 0; if ([int]::TryParse($part, [ref]$idx) -and $idx -lt $cur.Count) { $cur = $cur[$idx] } else { return $null } }
    else { $p = $cur.PSObject.Properties[$part]; if ($p) { $cur = $p.Value } else { return $null } }
  }
  return $cur
}
function Expand-Site([string]$text) {
  $text = [regex]::Replace($text, '\{\{price\.([a-z]+)(\.raw)?\}\}', [System.Text.RegularExpressions.MatchEvaluator]{
    param($m) $id = $m.Groups[1].Value
    if (-not $prices.ContainsKey($id)) { throw "Unknown price token: $id" }
    if ($m.Groups[2].Success) { return [string]$prices[$id] } else { return (Money $prices[$id]) }
  })
  # conditionals on site.json values: {{#site.path}}shown when non-empty{{/site.path}}  {{^site.path}}shown when empty{{/site.path}}
  $condRx = [regex]'(?s)\{\{([#^])site\.([a-zA-Z0-9_.\-]+)\}\}(.*?)\{\{/site\.\2\}\}'
  for ($i = 0; $i -lt 4; $i++) {
    if (-not $condRx.IsMatch($text)) { break }
    $text = $condRx.Replace($text, [System.Text.RegularExpressions.MatchEvaluator]{
      param($m)
      $v = Get-SitePath $m.Groups[2].Value
      $has = ($null -ne $v) -and ([string]$v -ne '') -and -not (($v -is [bool]) -and -not $v)
      if (($m.Groups[1].Value -eq '#') -eq $has) { return $m.Groups[3].Value } else { return '' }
    })
  }
  # values: {{site.path}} or {{site.path|money}}; dotted paths walk objects and arrays (socials fall back for short keys)
  $text = [regex]::Replace($text, '\{\{site\.([a-zA-Z0-9_.\-]+)(?:\|(money|raw))?\}\}', [System.Text.RegularExpressions.MatchEvaluator]{
    param($m) $k = $m.Groups[1].Value
    if ($k -eq 'domain') { return $domain }
    $v = Get-SitePath $k
    if ($null -eq $v -and $k -notmatch '\.') { $s = $site.socials.PSObject.Properties[$k]; if ($s) { $v = $s.Value } }
    if ($null -eq $v) { throw "Unknown site token: $k" }
    if ($m.Groups[2].Success -and $m.Groups[2].Value -eq 'money') { return (Money $v) }
    return [string]$v
  })
  $text = $text.Replace('{{base}}', $base).Replace('{{year}}', (Get-Date).Year.ToString()).Replace('{{host}}', $siteHost)
  return $text
}

# ---------------------------------------------------------------- output folder
Ensure-Dir $docs
Get-ChildItem $docs -Force | Where-Object { $_.Name -ne 'img' } | Remove-Item -Recurse -Force
Log 'Cleaned docs\'

# static assets
foreach ($d in @('css', 'js')) { Copy-Item (Join-Path $src $d) (Join-Path $docs $d) -Recurse -Force }
Ensure-Dir (Join-Path $docs 'img')
Copy-Item (Join-Path $src 'img\*') (Join-Path $docs 'img') -Recurse -Force
Copy-Item (Join-Path $src 'favicon.svg') $docs -Force
Write-Text (Join-Path $docs 'robots.txt') (Expand-Site (Read-Text (Join-Path $src 'robots.txt')))
Write-Text (Join-Path $docs 'site.webmanifest') (Expand-Site (Read-Text (Join-Path $src 'site.webmanifest')))
Write-Text (Join-Path $docs '.nojekyll') ''
if ($base -eq '' -and $siteHost) { Write-Text (Join-Path $docs 'CNAME') $siteHost }
Log 'Copied static assets'

# ---------------------------------------------------------------- images
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
function Save-Resized($inPath, $outPath, [int]$maxW, [int]$quality) {
  if ($SkipImages -and (Test-Path $outPath) -and ((Get-Item $outPath).LastWriteTime -ge (Get-Item $inPath).LastWriteTime)) { return }
  $img = [System.Drawing.Image]::FromFile($inPath)
  try {
    $scale = [math]::Min(1.0, $maxW / [double]$img.Width)
    $w = [int][math]::Round($img.Width * $scale); $h = [int][math]::Round($img.Height * $scale)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(255, 11, 20, 32))
    $g.DrawImage($img, 0, 0, $w, $h)
    $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$quality)
    Ensure-Dir (Split-Path $outPath -Parent)
    $bmp.Save($outPath, $jpegCodec, $ep)
    $g.Dispose(); $bmp.Dispose()
    Log ("  {0} -> {1}x{2}" -f (Split-Path $outPath -Leaf), $w, $h)
  } finally { $img.Dispose() }
}
$shots = Join-Path $root 'source\shots'
if (Test-Path $shots) {
  Get-ChildItem $shots -Filter *.png | ForEach-Object {
    $maxW = if ($_.BaseName -like '*-mobile') { 420 } else { 1200 }
    Save-Resized $_.FullName (Join-Path $docs ('img\work\' + $_.BaseName + '.jpg')) $maxW 84
  }
}
$head = Join-Path $root 'source\people\jordan-headshot.jpg'
if (Test-Path $head) { Save-Resized $head (Join-Path $docs 'img\jordan-yoerger.jpg') 640 86 }
Log 'Images done'

# ---------------------------------------------------------------- pages
$pagesDir = Join-Path $src 'pages'
$sitemap = New-Object System.Collections.ArrayList
Get-ChildItem $pagesDir -Recurse -Filter *.html | ForEach-Object {
  $raw = Read-Text $_.FullName
  $sep = $raw.IndexOf("`n---")
  if ($sep -lt 0) { throw "No front matter in $($_.FullName)" }
  $fm = @{}
  foreach ($line in ($raw.Substring(0, $sep) -split "`r?`n")) {
    if ($line -match '^\s*([a-zA-Z]+)\s*:\s*(.*)$') { $fm[$matches[1]] = $matches[2].Trim() }
  }
  $body = $raw.Substring($sep + 4).TrimStart("-").TrimStart("`r", "`n")
  $path = if ($fm['path']) { $fm['path'] } else { throw "No path in $($_.FullName)" }
  $canonical = if ($fm['canonical']) { "$domain$base" + $fm['canonical'] } else { "$domain$base$path" }
  $robots = if ($fm['robots']) { $fm['robots'] } else { 'index, follow, max-image-preview:large, max-snippet:-1' }
  $ogtitle = if ($fm['ogtitle']) { $fm['ogtitle'] } else { $fm['title'] }
  $scripts = ''
  if ($fm['scripts']) { foreach ($s in ($fm['scripts'] -split '\s*,\s*')) { $scripts += "<script src=`"{{base}}/js/$s.js`" defer></script>`n" } }

  $html = $partials['head'] + $partials['nav'] + $body.TrimEnd() + "`n" + $partials['footer']
  $html = Expand-Includes $html
  $html = $html.Replace('{{title}}', (Attr $fm['title'])).Replace('{{description}}', (Attr (Expand-Site $fm['description']))).Replace('{{canonical}}', $canonical)
  $html = $html.Replace('{{ogtitle}}', (Attr $ogtitle)).Replace('{{bodyclass}}', [string]$fm['bodyclass']).Replace('{{pagescripts}}', $scripts)
  $html = $html.Replace('{{config}}', $config).Replace('{{orgjsonld}}', $orgJson)
  $html = $html.Replace('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">', ('<meta name="robots" content="' + $robots + '">'))
  $html = Expand-Site $html
  if ($html -match '\{\{[a-zA-Z]') { $left = [regex]::Matches($html, '\{\{[^}]+\}\}') | ForEach-Object { $_.Value } | Select-Object -Unique; throw "Unexpanded tokens in $path : $($left -join ', ')" }

  $rel = $_.FullName.Substring($pagesDir.Length).TrimStart('\')
  $out = Join-Path $docs $rel
  Write-Text $out $html
  if ($fm['sitemap'] -ne 'no') {
    $prio = if ($path -eq '/') { '1.0' } elseif ($path -eq '/quote/') { '0.9' } elseif ($path -like '/work/*' -and $path -ne '/work/') { '0.6' } else { '0.8' }
    [void]$sitemap.Add(@{ loc = $canonical; prio = $prio })
  }
  Log "  page $path"
}

$xml = '<?xml version="1.0" encoding="UTF-8"?>' + "`n" + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "`n"
foreach ($u in $sitemap) { $xml += "  <url><loc>$($u.loc)</loc><lastmod>$today</lastmod><changefreq>monthly</changefreq><priority>$($u.prio)</priority></url>`n" }
$xml += '</urlset>' + "`n"
Write-Text (Join-Path $docs 'sitemap.xml') $xml
Log ("Sitemap: {0} urls" -f $sitemap.Count)

# Headless browser for renders: Chrome first (Edge 150+ headless detaches and writes late on this machine), Edge as fallback.
# Set YG_BROWSER to a full path to force one.
function Find-Browser {
  $c = @($env:YG_BROWSER, "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
  return ($c | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)
}
# ---------------------------------------------------------------- social image + touch icon (Edge headless)
# Rendered into source\render\ (kept between builds) and copied into docs\. -SkipRender reuses the last render.
$renderDir = Join-Path $root 'source\render'
Ensure-Dir $renderDir
# lava.html renders the WebGL hero texture (baked to img\lava.jpg); og.html uses that render as its backdrop.
$jobs = @(
  @{ in = 'lava.html'; out = 'lava.png'; size = '1920,1080'; copy = $false },
  @{ in = 'og.html'; out = 'og-image.png'; size = '1200,630'; copy = $true },
  @{ in = 'icon.html'; out = 'apple-touch-icon.png'; size = '180,180'; copy = $true }
)
$lavaPng = Join-Path $renderDir 'lava.png'
$srcJsUrl = 'file:///' + (Join-Path $src 'js').Replace('\', '/')
if (-not $SkipRender) {
  $edge = Find-Browser
  if ($edge) {
    foreach ($j in $jobs) {
      $tmp = Join-Path $renderDir $j.in
      $html = Expand-Site (Read-Text (Join-Path $src ('og\' + $j.in)))
      $html = $html.Replace('{{srcjs}}', $srcJsUrl).Replace('{{lava}}', ('file:///' + $lavaPng.Replace('\', '/')))
      Write-Text $tmp $html
      $outPng = Join-Path $renderDir $j.out
      if (Test-Path $outPng) { Remove-Item $outPng -Force }
      $url = 'file:///' + $tmp.Replace('\', '/')
      # software WebGL (SwiftShader) so the texture renders without a GPU; harmless for the plain pages
      $args = @('--headless=new', '--hide-scrollbars', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', "--window-size=$($j.size)", '--virtual-time-budget=6000', "--screenshot=$outPng", $url)
      $errLog = Join-Path $renderDir 'edge.log'
      $p = Start-Process -FilePath $edge -ArgumentList $args -Wait -PassThru -NoNewWindow -RedirectStandardError $errLog
      if (Test-Path $outPng) { Log ("  rendered {0} ({1})" -f $j.out, [IO.Path]::GetFileNameWithoutExtension($edge)) } else { Write-Warning ("Edge did not produce {0}" -f $j.out) }
    }
  } else { Write-Warning 'No Chrome or Edge found; lava.jpg, og-image.png and apple-touch-icon.png were not rendered.' }
}
foreach ($j in $jobs) {
  if (-not $j.copy) { continue }
  $png = Join-Path $renderDir $j.out
  if (Test-Path $png) { Copy-Item $png (Join-Path $docs $j.out) -Force } else { Write-Warning ("Missing {0}; run build.ps1 without -SkipRender." -f $j.out) }
}
# downloadable PDFs (lead magnet) printed from src\downloads\*.html with Edge; kept in source\render between builds
$dlSrc = Join-Path $src 'downloads'
if (Test-Path $dlSrc) {
  Get-ChildItem $dlSrc -Filter *.html | ForEach-Object {
    $pdfName = $_.BaseName + '.pdf'
    $pdfOut = Join-Path $renderDir $pdfName
    if (-not $SkipRender) {
      $edge = Find-Browser
      if ($edge) {
        $tmp = Join-Path $renderDir $_.Name
        Write-Text $tmp (Expand-Site (Read-Text $_.FullName))
        if (Test-Path $pdfOut) { Remove-Item $pdfOut -Force }
        $args = @('--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--virtual-time-budget=5000', '--no-pdf-header-footer', "--print-to-pdf=$pdfOut", ('file:///' + $tmp.Replace('\', '/')))
        Start-Process -FilePath $edge -ArgumentList $args -Wait -NoNewWindow -RedirectStandardError (Join-Path $renderDir 'edge.log') | Out-Null
        if (Test-Path $pdfOut) { Log ("  printed {0}" -f $pdfName) } else { Write-Warning ("Edge did not produce {0}" -f $pdfName) }
      }
    }
    if (Test-Path $pdfOut) { Ensure-Dir (Join-Path $docs 'downloads'); Copy-Item $pdfOut (Join-Path $docs ('downloads\' + $pdfName)) -Force }
  }
}
if (Test-Path $lavaPng) {
  Save-Resized $lavaPng (Join-Path $docs 'img\lava.jpg') 1920 80
  Save-Resized $lavaPng (Join-Path $docs 'img\lava-sm.jpg') 960 78
} else { Write-Warning 'Missing lava.png; the hero falls back to a flat gradient. Run build.ps1 without -SkipRender.' }

Log ("Build complete -> {0}" -f $docs)
