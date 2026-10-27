# Yoergoods Digital - static site build
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1 [-SkipImages] [-SkipRender]
#   src\pages\**\*.html (front matter + body)  +  src\partials  +  src\data\site.json  ->  docs\ (deployable site)
#   source\shots\*.png (portfolio screenshots) and source\people\*.jpg are resized into docs\img with System.Drawing.
#   -SkipRender reuses the last headless renders in source\render (lava texture, og-image, apple-touch-icon, logo-512,
#   PDFs) and only renders the ones that are missing.
# Front matter keys: title, description, path, canonical, ogtitle, bodyclass, scripts, robots, sitemap (no),
#   lastmod (overrides the page date), ogimage (site path of a 1200x630 image), ogimagealt, schematype, mainentity.
# Structured data: every page gets ONE JSON-LD @graph (LocalBusiness + WebSite + Person, plus a WebPage node on
#   indexable pages). Inline <script type="application/ld+json"> blocks in a page are validated, given @ids, linked to
#   the WebPage and merged into that graph (Normalize-PageNodes below).
# Page dates (sitemap lastmod, schema dateModified/datePublished) come from git, falling back to file times.
# ASCII only in this file (Windows PowerShell 5.1 reads BOM-less scripts as ANSI).
param([switch]$SkipImages, [switch]$SkipRender)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = $PSScriptRoot
$src = Join-Path $root 'src'
$docs = Join-Path $root 'docs'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$inv = [Globalization.CultureInfo]::InvariantCulture
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
# refresh packages: {{price.tuneup}}, {{price.refreshessentials}}, {{price.refreshplus}}. The Website Refresh tier's
# "from" price must equal Refresh Essentials so every "refreshes from" line on the site agrees with the packages.
if ($site.pricing.refresh) {
  $prices['tuneup'] = [int]$site.pricing.refresh.tuneup.price
  $prices['refreshessentials'] = [int]$site.pricing.refresh.essentials.price
  $prices['refreshplus'] = [int]$site.pricing.refresh.plus.price
  if ($prices['refresh'] -ne $prices['refreshessentials']) { throw "site.json: tier 'refresh' from ($($prices['refresh'])) must equal pricing.refresh.essentials.price ($($prices['refreshessentials']))." }
}
$locality = ([string]$site.location -split ',')[0].Trim()
$region = if (([string]$site.location -split ',').Count -gt 1) { ([string]$site.location -split ',')[1].Trim() } else { '' }

# the config the pages read as window.YG (pricing drives the quote builder)
$yg = [ordered]@{
  name = $site.name; domain = $domain; base = $base; email = $site.email; phone = $site.phone
  endpoint = $site.quoteEndpoint
  pricing = [ordered]@{ tiers = $site.pricing.tiers; care = $site.pricing.care; branding = $site.pricing.branding; refresh = $site.pricing.refresh; estimate = $site.pricing.estimate }
}
$config = $yg | ConvertTo-Json -Compress -Depth 10

# ---------------------------------------------------------------- partials + token expansion
$partials = @{}
$partialFiles = @{}
Get-ChildItem (Join-Path $src 'partials') -File | ForEach-Object {
  $pn = [IO.Path]::GetFileNameWithoutExtension($_.Name)
  $partials[$pn] = Read-Text $_.FullName
  $partialFiles[$pn] = $_.FullName
}

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

# ---------------------------------------------------------------- page dates
# Last modified = the last git commit that touched the page source (or the file's LastWriteTime if earlier), or the
# LastWriteTime when the file has uncommitted changes or is not in git. Content partials pulled in with {{include:...}} count as part of the page;
# head/nav/footer boilerplate does not (a footer tweak is not a content change). First published = the commit that
# added the file (creation time if it is not committed yet). Front matter "lastmod:" overrides the computed date.
$gitOk = $false
$gitDirty = @{}
if ((Test-Path (Join-Path $root '.git')) -and (Get-Command git -ErrorAction SilentlyContinue)) {
  $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    $st = @(& git -C $root status --porcelain --untracked-files=all -- src 2>$null)
    if ($LASTEXITCODE -eq 0) {
      $gitOk = $true
      foreach ($l in $st) { if ([string]$l -match '^.. (?:.* -> )?"?(.+?)"?$') { $gitDirty[$matches[1].Replace('/', '\').ToLowerInvariant()] = $true } }
    }
  } catch { $gitOk = $false } finally { $ErrorActionPreference = $eap }
}
$dateCache = @{}
function Format-Date($d) { return ([DateTimeOffset]$d).ToString('yyyy-MM-ddTHH:mm:sszzz', $inv) }
function Get-FileDate([string]$full, [switch]$First) {
  $key = $full.ToLowerInvariant() + $(if ($First) { '|first' } else { '|last' })
  if ($dateCache.ContainsKey($key)) { return $dateCache[$key] }
  $rel = $full.Substring($root.Length).TrimStart('\')
  $d = $null
  if ($gitOk -and ($First -or -not $gitDirty.ContainsKey($rel.ToLowerInvariant()))) {
    $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
      $gp = $rel.Replace('\', '/')
      if ($First) { $o = @(& git -C $root log --follow --diff-filter=A --format=%cI -- $gp 2>$null) }
      else { $o = @(& git -C $root log -1 --format=%cI -- $gp 2>$null) }
      $o = @($o | Where-Object { $_ })
      if ($o.Count -gt 0) { $d = [DateTimeOffset]::Parse([string]$o[$o.Count - 1], $inv) }
    } catch { $d = $null } finally { $ErrorActionPreference = $eap }
  }
  # Publish.cmd builds before it commits, so a page is first published with its file time; taking the earlier of the
  # git date and the file time keeps the date from jumping to the commit time on the next build. A fresh clone has
  # file times newer than the commits, so the git date wins there.
  $fi = Get-Item -LiteralPath $full
  $t = [DateTimeOffset]$fi.LastWriteTime
  if ($First -and ([DateTimeOffset]$fi.CreationTime) -lt $t) { $t = [DateTimeOffset]$fi.CreationTime }
  if ($null -eq $d -or $t -lt $d) { $d = $t }
  $dateCache[$key] = $d
  return $d
}
function Get-ContentFiles([string]$text, $seen) {
  foreach ($m in [regex]::Matches($text, '\{\{include:([a-zA-Z0-9_-]+)')) {
    $n = $m.Groups[1].Value
    if ($partialFiles.ContainsKey($n) -and -not $seen.ContainsKey($n)) { $seen[$n] = $partialFiles[$n]; Get-ContentFiles $partials[$n] $seen }
  }
}

# ---------------------------------------------------------------- read every page (front matter, dates)
$pagesDir = Join-Path $src 'pages'
$pages = New-Object System.Collections.ArrayList
$pageByPath = @{}
Get-ChildItem $pagesDir -Recurse -Filter *.html | Sort-Object FullName | ForEach-Object {
  $raw = Read-Text $_.FullName
  $sep = $raw.IndexOf("`n---")
  if ($sep -lt 0) { throw "No front matter in $($_.FullName)" }
  $fm = @{}
  foreach ($line in ($raw.Substring(0, $sep) -split "`r?`n")) {
    if ($line -match '^\s*([a-zA-Z]+)\s*:\s*(.*)$') { $fm[$matches[1]] = $matches[2].Trim() }
  }
  $body = $raw.Substring($sep + 4).TrimStart("-").TrimStart("`r", "`n")
  $path = if ($fm['path']) { $fm['path'] } else { throw "No path in $($_.FullName)" }
  $robots = if ($fm['robots']) { $fm['robots'] } else { 'index, follow, max-image-preview:large, max-snippet:-1' }
  $pg = [ordered]@{
    file = $_.FullName; rel = $_.FullName.Substring($pagesDir.Length).TrimStart('\'); fm = $fm; body = $body; path = $path
    title = (Expand-Site ([string]$fm['title']))
    canonical = $(if ($fm['canonical']) { "$domain$base" + $fm['canonical'] } else { "$domain$base$path" })
    robots = $robots; index = ($robots -notmatch 'noindex'); hasService = ($body -match '"@type"\s*:\s*"Service"')
    serviceName = ''; lastmod = $null; published = $null
  }
  $sm = [regex]::Match($body, '"@type"\s*:\s*"Service"(?:[^{}]|\{\{[^}]*\}\})*?"name"\s*:\s*"((?:[^"\\]|\\.)*)"')
  if ($sm.Success) { $pg.serviceName = Expand-Site $sm.Groups[1].Value }
  $pg.insitemap = $pg.index -and ($fm['sitemap'] -ne 'no')
  if ($pg.index) {
    if ($fm['lastmod']) { $pg.lastmod = [string]$fm['lastmod'] }
    else {
      $seen = @{}; Get-ContentFiles $body $seen
      $d = Get-FileDate $_.FullName
      foreach ($f in $seen.Values) { $pd = Get-FileDate $f; if ($pd -gt $d) { $d = $pd } }
      $pg.lastmod = Format-Date $d
    }
    $pg.published = Format-Date (Get-FileDate $_.FullName -First)
  }
  [void]$pages.Add($pg)
  $pageByPath[$path] = $pg
}
Log ("Read {0} pages (dates from {1})" -f $pages.Count, $(if ($gitOk) { 'git' } else { 'file times' }))

# ---------------------------------------------------------------- structured data (sitewide nodes)
$siteRoot = "$domain$base"
$orgId = "$siteRoot/#org"; $siteId = "$siteRoot/#website"; $personId = "$siteRoot/#jordan"
function New-Ref([string]$x) { return [ordered]@{ '@id' = $x } }
function From-Price($n) { return [ordered]@{ '@type' = 'PriceSpecification'; minPrice = [double]$n; priceCurrency = 'USD' } }
# a service page's Service node gets @id <page>#service (Normalize-PageNodes); offers point at it when it exists,
# with enough inline (type, name, url) to stand alone on pages that do not carry that Service node
function Get-ServiceRef([string]$p) {
  if (-not ($pageByPath.ContainsKey($p) -and $pageByPath[$p].hasService)) { return $null }
  $r = [ordered]@{ '@type' = 'Service'; '@id' = "$siteRoot$p#service" }
  if ($pageByPath[$p].serviceName) { $r.name = $pageByPath[$p].serviceName }
  $r.url = $pageByPath[$p].canonical
  return $r
}
$fixedPriceNames = @($site.pricing.branding.PSObject.Properties | ForEach-Object { [string]$_.Value.name })
if ($site.pricing.refresh) { $fixedPriceNames += @($site.pricing.refresh.PSObject.Properties | ForEach-Object { [string]$_.Value.name }) }

# areaServed: cities and counties from site.json serviceArea (Wikipedia titles follow "<Name>,_Ohio")
$areas = @()
foreach ($c in @($site.serviceArea.cities)) { $areas += [ordered]@{ '@type' = 'City'; name = "$c, Ohio"; sameAs = ('https://en.wikipedia.org/wiki/' + ([string]$c).Replace(' ', '_') + ',_Ohio') } }
$shortAreas = @()
foreach ($c in @($site.serviceArea.counties)) { $shortAreas += [ordered]@{ '@type' = 'AdministrativeArea'; name = "$c County, Ohio"; sameAs = ('https://en.wikipedia.org/wiki/' + ([string]$c).Replace(' ', '_') + '_County,_Ohio') } }
$areas += $shortAreas
$areas += [ordered]@{ '@type' = 'State'; name = 'Ohio' }
$areas += [ordered]@{ '@type' = 'Country'; name = 'United States' }
$shortAreas += [ordered]@{ '@type' = 'Country'; name = 'United States' }

$offers = @()
$tierPage = @{ launch = '/new-website/'; refresh = '/website-refresh/' }
foreach ($t in $site.pricing.tiers) {
  $tid = [string]$t.id
  if ($tid -eq 'refresh' -and $site.pricing.refresh) { continue }   # the refresh packages below replace the "from" tier
  $svc = $null
  if ($tierPage.ContainsKey($tid)) { $svc = Get-ServiceRef $tierPage[$tid] }
  if (-not $svc) { $svc = [ordered]@{ '@type' = 'Service'; name = [string]$t.name; serviceType = 'Web design'; provider = (New-Ref $orgId) } }
  $offers += [ordered]@{ '@type' = 'Offer'; name = [string]$t.name; description = [string]$t.blurb; url = "$siteRoot/pricing/"; priceCurrency = 'USD'; priceSpecification = (From-Price $t.from); itemOffered = $svc }
}
if ($site.pricing.refresh) {
  foreach ($rp in $site.pricing.refresh.PSObject.Properties) {
    $r = $rp.Value
    $svc = Get-ServiceRef '/website-refresh/'
    if (-not $svc) { $svc = [ordered]@{ '@type' = 'Service'; name = 'Website refresh and redesign'; serviceType = 'Website redesign'; provider = (New-Ref $orgId) } }
    # refresh packages are fixed prices; optional extras are quoted on top
    $offers += [ordered]@{ '@type' = 'Offer'; name = [string]$r.name; description = [string]$r.blurb; url = "$siteRoot/website-refresh/"; price = [double]$r.price; priceCurrency = 'USD'; itemOffered = $svc }
  }
}
if ($site.pricing.portfolio) {
  $svc = Get-ServiceRef '/portfolio-websites/'
  if (-not $svc) { $svc = [ordered]@{ '@type' = 'Service'; name = 'Portfolio website'; serviceType = 'Web design'; provider = (New-Ref $orgId) } }
  $offers += [ordered]@{ '@type' = 'Offer'; name = 'Portfolio Website'; url = "$siteRoot/portfolio-websites/"; priceCurrency = 'USD'; priceSpecification = (From-Price $site.pricing.portfolio.from); itemOffered = $svc }
}
if ($site.pricing.branding) {
  foreach ($bp in $site.pricing.branding.PSObject.Properties) {
    $b = $bp.Value
    $svc = Get-ServiceRef '/branding/'
    if (-not $svc) { $svc = [ordered]@{ '@type' = 'Service'; name = 'Logo and brand identity design'; serviceType = 'Brand identity design'; provider = (New-Ref $orgId) } }
    # branding packages are fixed prices on the site, not "from" prices
    $offers += [ordered]@{ '@type' = 'Offer'; name = [string]$b.name; description = [string]$b.blurb; url = "$siteRoot/branding/"; price = [double]$b.price; priceCurrency = 'USD'; itemOffered = $svc }
  }
}
$careItems = @($site.pricing.care.items | ForEach-Object { [string]$_ })
for ($i = 1; $i -lt $careItems.Count; $i++) { $careItems[$i] = $careItems[$i].Substring(0, 1).ToLowerInvariant() + $careItems[$i].Substring(1) }
$offers += [ordered]@{
  '@type' = 'Offer'; name = 'Website care plan'; url = "$siteRoot/pricing/"; priceCurrency = 'USD'
  priceSpecification = @(
    [ordered]@{ '@type' = 'UnitPriceSpecification'; price = [double]$site.pricing.care.from; priceCurrency = 'USD'; unitCode = 'MON'; unitText = 'month' },
    [ordered]@{ '@type' = 'UnitPriceSpecification'; price = [double]$site.pricing.care.annual; priceCurrency = 'USD'; unitCode = 'ANN'; unitText = 'year' })
  itemOffered = [ordered]@{ '@type' = 'Service'; name = 'Website care plan'; description = (($careItems -join '; ') + '.'); provider = (New-Ref $orgId) }
}

$regionCode = @{ 'Ohio' = 'OH' }[$region]
if (-not $regionCode) { $regionCode = $region }
$org = [ordered]@{
  '@type' = 'LocalBusiness'; '@id' = $orgId; name = $site.name; url = "$siteRoot/"
  logo = [ordered]@{ '@type' = 'ImageObject'; '@id' = "$siteRoot/#logo"; url = "$siteRoot/logo-512.png"; contentUrl = "$siteRoot/logo-512.png"; width = 512; height = 512; caption = $site.name }
  image = "$siteRoot/og-image.jpg"; slogan = $site.tagline
  description = ("$($site.name) is a one-person web design studio in $($site.location). It builds fast, Google-ready websites for small businesses in " + [string]$site.serviceArea.summary + ', plus remote clients anywhere in the US, with fixed-price quotes and a professional project manager running every job.')
  email = $site.email; priceRange = '$$'
  address = [ordered]@{ '@type' = 'PostalAddress'; addressLocality = $locality; addressRegion = $regionCode; postalCode = [string]$site.postalCode; addressCountry = 'US' }
  areaServed = $areas
  founder = (New-Ref $personId)
  contactPoint = [ordered]@{ '@type' = 'ContactPoint'; contactType = 'sales'; email = $site.email; areaServed = 'US'; availableLanguage = 'English' }
  knowsAbout = @('Small business web design', 'Website redesign', 'Portfolio websites', 'Landing pages', 'Logo and brand identity design', 'Search engine optimization', 'Project management')
  makesOffer = $offers
}
# business profiles only (a personal LinkedIn is the Person's, not the business's); omitted until one exists
$orgSameAs = @(@([string]$site.socials.gbp, [string]$site.socials.linkedinCompany, [string]$site.socials.facebook, [string]$site.socials.instagram) | Where-Object { $_ })
if ($orgSameAs.Count -gt 0) { $org.sameAs = $orgSameAs }
if ([string]$site.socials.gbp) { $org.hasMap = [string]$site.socials.gbp }

$website = [ordered]@{ '@type' = 'WebSite'; '@id' = $siteId; name = $site.name; alternateName = @([string]$site.shortName, ($siteHost -replace '^www\.', '')); url = "$siteRoot/"; publisher = (New-Ref $orgId); inLanguage = 'en-US' }

$personUrl = if ($pageByPath.ContainsKey('/about/') -and $pageByPath['/about/'].index) { "$siteRoot/about/" } else { [string]$site.ownerUrl }
$person = [ordered]@{
  '@type' = 'Person'; '@id' = $personId; name = $site.owner; jobTitle = 'Founder and project manager'
  description = "Founder of $($site.name) in $($site.location): a PMP-certified project manager with an MBA, a mechanical engineer by training, and eight years leading programs."
  url = $personUrl
}
if (Test-Path (Join-Path $root 'source\people\jordan-headshot.jpg')) { $person.image = "$siteRoot/img/jordan-yoerger.jpg" }
$person.worksFor = (New-Ref $orgId)
$person.hasCredential = @(
  [ordered]@{ '@type' = 'EducationalOccupationalCredential'; credentialCategory = 'certification'; name = 'Project Management Professional (PMP)'; recognizedBy = [ordered]@{ '@type' = 'Organization'; name = 'Project Management Institute'; url = 'https://www.pmi.org/' } },
  [ordered]@{ '@type' = 'EducationalOccupationalCredential'; credentialCategory = 'degree'; name = 'Master of Business Administration (MBA)' })
$person.knowsAbout = @('Project management', 'Program management', 'Mechanical engineering', 'Small business web design')
$personSameAs = @(@([string]$site.socials.linkedin, [string]$site.ownerUrl) | Where-Object { $_ -and $_ -ne $personUrl })
if ($personSameAs.Count -gt 0) { $person.sameAs = $personSameAs }

# ---------------------------------------------------------------- page JSON-LD: parse, link, merge
$jsonldRx = [regex]'(?s)[ \t]*<script type="application/ld\+json">(.*?)</script>[ \t]*\r?\n?'
function ConvertTo-Ordered($x) {
  if ($null -eq $x) { return $null }
  if ($x -is [System.Management.Automation.PSCustomObject]) {
    $o = [ordered]@{}
    foreach ($p in $x.PSObject.Properties) { $o[$p.Name] = ConvertTo-Ordered $p.Value }
    return $o
  }
  if ($x -is [array]) { $a = @(); foreach ($i in $x) { $a += , (ConvertTo-Ordered $i) }; return , $a }
  return $x
}
function Get-Types($n) { if ($n -isnot [System.Collections.IDictionary]) { return @() }; return @(@($n['@type']) | ForEach-Object { [string]$_ }) }
function Set-Id($n, [string]$id) {
  if ($n.Contains('@id')) { return }
  $at = 0; $k = 0
  foreach ($key in @($n.Keys)) { $k++; if ($key -eq '@type') { $at = $k } }
  $n.Insert($at, '@id', $id)
}
function Get-TitleParts([string]$title) { return @(($title -split '\s*\|\s*') | Where-Object { $_ -and $_ -ne [string]$site.name }) }
function Get-Headline([string]$title) {
  $parts = @(Get-TitleParts $title)
  $h = if ($parts.Count -gt 0) { $parts -join ': ' } else { $title }
  if ($h.Length -gt 110) { $h = $h.Substring(0, 107).TrimEnd() + '...' }
  return $h
}
function Get-ShortTitle([string]$title) { $parts = @(Get-TitleParts $title); if ($parts.Count -gt 0) { return $parts[0] } else { return $title } }
function Normalize-Offers($offers, [string]$c) {
  $res = @()
  foreach ($o in @($offers)) {
    if ($o -is [System.Collections.IDictionary]) {
      if (-not $o.Contains('url')) { $o['url'] = $c }
      # site prices are "from" prices except the fixed branding and refresh packages
      if ($o.Contains('price') -and -not $o.Contains('priceSpecification') -and -not ($fixedPriceNames -contains [string]$o['name'])) {
        $cur = if ($o['priceCurrency']) { [string]$o['priceCurrency'] } else { 'USD' }
        $min = [double]::Parse([string]$o['price'], $inv)
        $o.Remove('price')
        $o['priceSpecification'] = [ordered]@{ '@type' = 'PriceSpecification'; minPrice = $min; priceCurrency = $cur }
      }
    }
    $res += , $o
  }
  if ($offers -is [array]) { return , $res } else { return $res[0] }
}
# Gives page entities @ids, links them to the page and the sitewide nodes, and replaces markup the page does not support:
#   BreadcrumbList -> #breadcrumb; FAQPage -> #faq (isPartOf the WebPage); Service -> #service (url, description,
#   provider, areaServed places, "from" offers as priceSpecification.minPrice); Product whose offer is PreOrder (guide
#   not on sale yet) -> an ebook (Book, #guide) with no offer; Product on sale -> #product with seller;
#   CreativeWork/SoftwareApplication describing an outside site (case studies) -> Article (#article) about that site,
#   with any offer dropped; every Article gets #article, headline (from the title), url, image, author (#jordan),
#   publisher (#org), datePublished/dateModified (page dates) and mainEntityOfPage when the source leaves them out.
# The page sources already carry most of this; the rules keep older or new pages consistent.
function Normalize-PageNodes($nodes, $pg, [string]$desc) {
  $c = $pg.canonical
  $out = New-Object System.Collections.ArrayList
  $svc = 0
  foreach ($n in @($nodes)) {
    if ($n -isnot [System.Collections.IDictionary]) { continue }
    if ($n.Contains('@context')) { $n.Remove('@context') }
    $t = Get-Types $n
    if ($t -contains 'BreadcrumbList') { Set-Id $n "$c#breadcrumb" }
    elseif ($t -contains 'FAQPage') {
      Set-Id $n "$c#faq"
      if (-not $n.Contains('url')) { $n['url'] = $c }
      if ($pg.index -and -not $n.Contains('isPartOf')) { $n['isPartOf'] = (New-Ref "$c#webpage") }
    }
    elseif ($t -contains 'Service') {
      $svc++
      Set-Id $n ("$c#service" + $(if ($svc -gt 1) { "-$svc" } else { '' }))
      if (-not $n.Contains('url')) { $n['url'] = $c }
      if ($desc -and -not $n.Contains('description')) { $n['description'] = $desc }
      if (-not $n.Contains('provider')) { $n['provider'] = (New-Ref $orgId) }
      if (-not $n.Contains('areaServed') -or ($n['areaServed'] -is [string])) { $n['areaServed'] = $shortAreas }
      if ($n.Contains('offers')) { $n['offers'] = Normalize-Offers $n['offers'] $c }
    }
    elseif ($t -contains 'Product') {
      $offer = @($n['offers'])[0]
      $av = if ($offer -is [System.Collections.IDictionary]) { [string]$offer['availability'] } else { '' }
      if ($av -match 'PreOrder$') {
        $b = [ordered]@{ '@type' = 'Book'; '@id' = "$c#guide"; name = $n['name'] }
        if ($n['description']) { $b.description = $n['description'] }
        $b.url = $c
        $b.bookFormat = 'https://schema.org/EBook'
        if ([string]$n['category'] -match 'PDF') { $b.encodingFormat = 'application/pdf' }
        $b.inLanguage = 'en-US'
        $b.author = (New-Ref $personId)
        $b.publisher = (New-Ref $orgId)
        if ($n['image']) { $b.image = $n['image'] }
        $n = $b
      } else {
        Set-Id $n "$c#product"
        if (-not $n.Contains('url')) { $n['url'] = $c }
        if (($offer -is [System.Collections.IDictionary]) -and -not $offer.Contains('seller')) { $offer['seller'] = (New-Ref $orgId) }
      }
    }
    elseif (($t -contains 'CreativeWork' -or $t -contains 'SoftwareApplication' -or $t -contains 'WebSite') -and ([string]$n['url'] -match '^https?://') -and -not ([string]$n['url']).StartsWith("$siteRoot/")) {
      if ($n.Contains('offers')) { $n.Remove('offers') }
      if ($t -contains 'CreativeWork') { $n['@type'] = 'WebSite' }
      if ($n['about'] -is [string]) { if (-not $n.Contains('description')) { $n['description'] = $n['about'] }; $n.Remove('about') }
      $n = [ordered]@{ '@type' = 'Article'; about = $n }
    }
    # articles (case studies): fill in what the page already knows instead of repeating it in the JSON-LD source
    if (@(Get-Types $n | Where-Object { $_ -match '^(Article|BlogPosting|NewsArticle)$' }).Count -gt 0) {
      Set-Id $n "$c#article"
      if (-not $n.Contains('headline')) { $n['headline'] = (Get-Headline $pg.title) }
      if ($desc -and -not $n.Contains('description')) { $n['description'] = $desc }
      if (-not $n.Contains('url')) { $n['url'] = $c }
      if (-not $n.Contains('image') -and ($n['about'] -is [System.Collections.IDictionary]) -and $n['about']['image']) { $n['image'] = $n['about']['image'] }
      if (-not $n.Contains('author')) { $n['author'] = (New-Ref $personId) }
      if (-not $n.Contains('publisher')) { $n['publisher'] = (New-Ref $orgId) }
      if ($pg.published -and -not $n.Contains('datePublished')) { $n['datePublished'] = $pg.published }
      if ($pg.lastmod -and -not $n.Contains('dateModified')) { $n['dateModified'] = $pg.lastmod }
      if ($pg.index -and -not $n.Contains('mainEntityOfPage')) { $n['mainEntityOfPage'] = (New-Ref "$c#webpage") }
    }
    [void]$out.Add($n)
  }
  return , $out.ToArray()
}
function Get-ChildPages($pg) {
  if ($pg.path -eq '/' -or -not $pg.path.EndsWith('/')) { return @() }
  return @($pages | Where-Object { $_.index -and $_.path -ne $pg.path -and $_.path.StartsWith($pg.path) -and ($_.path.Substring($pg.path.Length).TrimEnd('/') -notmatch '/') })
}
function New-PageNodes($pg, $pageNodes, [string]$desc, [string]$html) {
  $c = $pg.canonical
  $fm = $pg.fm
  $children = @(Get-ChildPages $pg)
  $ptype = if ($fm['schematype']) { $fm['schematype'] } elseif ($pg.path -eq '/about/') { 'AboutPage' } elseif ($children.Count -gt 0) { 'CollectionPage' } else { 'WebPage' }
  $wp = [ordered]@{ '@type' = $ptype; '@id' = "$c#webpage"; url = $c; name = $pg.title }
  if ($desc) { $wp.description = $desc }
  $wp.isPartOf = (New-Ref $siteId)
  $wp.inLanguage = 'en-US'
  if ($pg.published) { $wp.datePublished = $pg.published }
  if ($pg.lastmod) { $wp.dateModified = $pg.lastmod }
  $extra = @()
  $ids = @($pageNodes | ForEach-Object { [string]$_['@id'] })
  $main = $null
  if ($pg.path -eq '/') { $wp.about = (New-Ref $orgId); $main = $orgId }
  elseif ($ptype -eq 'AboutPage') { $wp.about = (New-Ref $orgId); $main = $personId }
  else {
    $wp.publisher = (New-Ref $orgId)
    foreach ($frag in @('#article', '#service', '#guide', '#product')) { if (-not $main -and ($ids -contains "$c$frag")) { $main = "$c$frag" } }
  }
  if ($children.Count -gt 0) {
    # list the child pages in the order the collection page links to them
    $ordered = @($children | Sort-Object @{ Expression = { $i = $html.IndexOf('href="' + $base + $_.path + '"'); if ($i -lt 0) { [int]::MaxValue } else { $i } } }, @{ Expression = { $_.path } })
    $items = @()
    $pos = 0
    foreach ($ch in $ordered) { $pos++; $items += [ordered]@{ '@type' = 'ListItem'; position = $pos; url = $ch.canonical; name = (Get-ShortTitle $ch.title) } }
    $extra += [ordered]@{ '@type' = 'ItemList'; '@id' = "$c#list"; numberOfItems = $items.Count; itemListElement = $items }
    if (-not $main) { $main = "$c#list" }
  }
  if ($fm['mainentity']) { $main = $(if ($fm['mainentity'].StartsWith('#')) { "$c" + $fm['mainentity'] } else { $fm['mainentity'] }) }
  if ($main) { $wp.mainEntity = (New-Ref $main) }
  if ($ids -contains "$c#breadcrumb") { $wp.breadcrumb = (New-Ref "$c#breadcrumb") }
  return , (@($wp) + $extra)
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
# llms.txt: plain-text summary for AI agents; prices come from the same site.json tokens as the pages
$llmsSrc = Join-Path $src 'llms.txt'
if (Test-Path $llmsSrc) {
  $llms = Expand-Site (Read-Text $llmsSrc)
  if ($llms -match '\{\{[a-zA-Z#^/]') { throw 'Unexpanded tokens in src\llms.txt' }
  Write-Text (Join-Path $docs 'llms.txt') $llms
}
# IndexNow key file (tools\indexnow.ps1 submits URLs with this key; the file proves we own the host)
$indexNowKey = [string]$site.indexNowKey
if ($indexNowKey) {
  if ($indexNowKey -notmatch '^[a-zA-Z0-9-]{8,128}$') { throw 'site.json indexNowKey must be 8-128 characters of a-z, A-Z, 0-9 or -' }
  $keySrc = Join-Path $src "$indexNowKey.txt"
  if (-not (Test-Path $keySrc)) { throw "Missing src\$indexNowKey.txt (IndexNow key file named after site.json indexNowKey)" }
  if ((Read-Text $keySrc).Trim() -ne $indexNowKey) { throw "src\$indexNowKey.txt must contain exactly the site.json indexNowKey" }
  Write-Text (Join-Path $docs "$indexNowKey.txt") $indexNowKey
}
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
# square PNG at an exact size (icons); the navy fill keeps resampled edges from going translucent
function Save-Square($inPath, $outPath, [int]$size) {
  $img = [System.Drawing.Image]::FromFile($inPath)
  try {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(255, 11, 20, 32))
    $g.DrawImage($img, 0, 0, $size, $size)
    $g.Dispose()
    Ensure-Dir (Split-Path $outPath -Parent)
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  } finally { $img.Dispose() }
}
# .ico with PNG-compressed entries (supported by every current browser and by Windows Vista+)
function Write-Ico([string[]]$pngPaths, [string]$outPath) {
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$pngPaths.Count)
  $offset = 6 + 16 * $pngPaths.Count
  $blobs = @()
  foreach ($p in $pngPaths) {
    $bytes = [IO.File]::ReadAllBytes($p)
    $im = [System.Drawing.Image]::FromFile($p); $w = $im.Width; $h = $im.Height; $im.Dispose()
    $bw.Write([byte]($w % 256)); $bw.Write([byte]($h % 256)); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$bytes.Length); $bw.Write([uint32]$offset)
    $offset += $bytes.Length
    $blobs += , $bytes
  }
  foreach ($b in $blobs) { $bw.Write([byte[]]$b) }
  $bw.Flush()
  [IO.File]::WriteAllBytes($outPath, $ms.ToArray())
  $bw.Dispose()
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
if (-not $partials['head'].Contains('{{orgjsonld}}')) { throw 'src\partials\head.html must contain the {{orgjsonld}} token (sitewide JSON-LD graph)' }
$jsonldCount = 0
foreach ($pg in $pages) {
  $fm = $pg.fm; $path = $pg.path; $canonical = $pg.canonical; $robots = $pg.robots
  $ogtitle = if ($fm['ogtitle']) { $fm['ogtitle'] } else { $fm['title'] }
  $desc = Expand-Site ([string]$fm['description'])
  $scripts = ''
  if ($fm['scripts']) { foreach ($s in ($fm['scripts'] -split '\s*,\s*')) { $scripts += "<script src=`"{{base}}/js/$s.js`" defer></script>`n" } }
  # social image: front matter "ogimage:" (a site path or absolute URL of a 1200x630 image), else the site card
  $ogimage = "$siteRoot/og-image.jpg"
  if ($fm['ogimage']) { $ogimage = $(if ($fm['ogimage'] -match '^https?://') { $fm['ogimage'] } else { $siteRoot + $fm['ogimage'] }) }
  $ogtype = switch -regex ($ogimage) { '\.png$' { 'image/png' } '\.webp$' { 'image/webp' } default { 'image/jpeg' } }
  $ogalt = if ($fm['ogimagealt']) { $fm['ogimagealt'] } else { "$($site.name). $($site.tagline)." }

  $html = $partials['head'] + $partials['nav'] + $pg.body.TrimEnd() + "`n" + $partials['footer']
  $html = Expand-Includes $html
  $html = $html.Replace('{{title}}', (Attr $pg.title)).Replace('{{description}}', (Attr $desc)).Replace('{{canonical}}', $canonical)
  $html = $html.Replace('{{ogtitle}}', (Attr $ogtitle)).Replace('{{bodyclass}}', [string]$fm['bodyclass']).Replace('{{pagescripts}}', $scripts)
  $html = $html.Replace('{{ogimage}}', $ogimage).Replace('{{ogimagetype}}', $ogtype).Replace('{{ogimagealt}}', (Attr $ogalt))
  $html = $html.Replace('{{config}}', $config)
  $html = $html.Replace('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">', ('<meta name="robots" content="' + $robots + '">'))
  $html = Expand-Site $html

  # pull the page's own JSON-LD blocks out of the body, validate them and merge them into the head graph
  $pageNodes = @()
  $html = $jsonldRx.Replace($html, [System.Text.RegularExpressions.MatchEvaluator]{
    param($m)
    $json = $m.Groups[1].Value
    if ($json.Trim() -eq '{{orgjsonld}}') { return $m.Value }
    try { $parsed = ConvertFrom-Json $json } catch { throw ("Invalid JSON-LD in {0}: {1}" -f $pg.rel, $_.Exception.Message) }
    foreach ($obj in @($parsed)) {
      $o = ConvertTo-Ordered $obj
      if ($o -is [System.Collections.IDictionary] -and $o.Contains('@graph')) { foreach ($g in @($o['@graph'])) { $script:pageNodes += , $g } }
      else { $script:pageNodes += , $o }
    }
    return ''
  })
  $pageNodes = Normalize-PageNodes $pageNodes $pg $desc
  $nodes = @($org, $website, $person)
  if ($pg.index) { $nodes += New-PageNodes $pg $pageNodes $desc $html }
  $nodes += $pageNodes
  $jsonldCount += $nodes.Count
  $graphJson = [ordered]@{ '@context' = 'https://schema.org'; '@graph' = $nodes } | ConvertTo-Json -Compress -Depth 40
  $html = $html.Replace('{{orgjsonld}}', $graphJson)

  if (-not $pg.index) {
    # noindex pages (404, redirect stubs) carry no canonical: noindex plus a canonical elsewhere is a mixed signal
    $html = [regex]::Replace($html, '[ \t]*<link rel="canonical"[^>]*>\r?\n?', '')
  }
  # a meta refresh written in a page body belongs in <head>
  $hi = $html.IndexOf('</head>')
  if ($hi -gt 0) {
    $rm = [regex]::Match($html.Substring($hi), '[ \t]*<meta http-equiv="refresh"[^>]*>\r?\n?')
    if ($rm.Success) {
      $tag = $rm.Value.Trim()
      $html = $html.Remove($hi + $rm.Index, $rm.Length).Insert($hi, $tag + "`n")
    }
  }
  if ($html -match '\{\{[a-zA-Z]') { $left = [regex]::Matches($html, '\{\{[^}]+\}\}') | ForEach-Object { $_.Value } | Select-Object -Unique; throw "Unexpanded tokens in $path : $($left -join ', ')" }

  Write-Text (Join-Path $docs $pg.rel) $html
  Log "  page $path"
}
Log ("JSON-LD: {0} nodes across {1} pages" -f $jsonldCount, $pages.Count)

# sitemap: indexable pages only, lastmod = the page's real last change (Google ignores changefreq and priority)
$xml = '<?xml version="1.0" encoding="UTF-8"?>' + "`n" + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "`n"
$inSitemap = @($pages | Where-Object { $_.insitemap } | Sort-Object { $_.path })
foreach ($pg in $inSitemap) { $xml += "  <url><loc>$([Security.SecurityElement]::Escape($pg.canonical))</loc><lastmod>$($pg.lastmod)</lastmod></url>`n" }
$xml += '</urlset>' + "`n"
Write-Text (Join-Path $docs 'sitemap.xml') $xml
Log ("Sitemap: {0} urls" -f $inSitemap.Count)

# Headless browser for renders: Chrome first (Edge 150+ headless detaches and writes late on this machine), Edge as fallback.
# Set YG_BROWSER to a full path to force one.
function Find-Browser {
  $c = @($env:YG_BROWSER, "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
  return ($c | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)
}
# ---------------------------------------------------------------- social image, touch icon, logo (headless browser)
# Rendered into source\render\ (kept between builds) and copied into docs\. -SkipRender reuses the last render and
# only renders outputs that do not exist yet.
$renderDir = Join-Path $root 'source\render'
Ensure-Dir $renderDir
# lava.html renders the WebGL hero texture (baked to img\lava.jpg); og.html uses that render as its backdrop.
# icon.html is the navy-square mark at {{px}} pixels: the apple-touch-icon, and the 512px logo used by the schema
# logo, the web manifest, icon-192.png and favicon.ico.
$jobs = @(
  @{ in = 'lava.html'; tmp = 'lava.html'; out = 'lava.png'; size = '1920,1080'; copy = $false },
  @{ in = 'og.html'; tmp = 'og.html'; out = 'og-image.png'; size = '1200,630'; copy = $true },
  @{ in = 'icon.html'; tmp = 'icon.html'; out = 'apple-touch-icon.png'; size = '180,180'; copy = $true; px = '180' },
  @{ in = 'icon.html'; tmp = 'logo.html'; out = 'logo-512.png'; size = '512,512'; copy = $true; px = '512' }
)
$lavaPng = Join-Path $renderDir 'lava.png'
$srcJsUrl = 'file:///' + (Join-Path $src 'js').Replace('\', '/')
$browser = $null
foreach ($j in $jobs) {
  $outPng = Join-Path $renderDir $j.out
  if ($SkipRender -and (Test-Path $outPng)) { continue }
  if (-not $browser) { $browser = Find-Browser }
  if (-not $browser) { Write-Warning ("No Chrome or Edge found; {0} was not rendered." -f $j.out); continue }
  $tmp = Join-Path $renderDir $j.tmp
  $html = Expand-Site (Read-Text (Join-Path $src ('og\' + $j.in)))
  $html = $html.Replace('{{srcjs}}', $srcJsUrl).Replace('{{lava}}', ('file:///' + $lavaPng.Replace('\', '/')))
  if ($j.px) { $html = $html.Replace('{{px}}', $j.px) }
  Write-Text $tmp $html
  if (Test-Path $outPng) { Remove-Item $outPng -Force }
  $url = 'file:///' + $tmp.Replace('\', '/')
  # software WebGL (SwiftShader) so the texture renders without a GPU; harmless for the plain pages
  $cargs = @('--headless=new', '--hide-scrollbars', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', "--window-size=$($j.size)", '--virtual-time-budget=6000', "--screenshot=$outPng", $url)
  $errLog = Join-Path $renderDir 'edge.log'
  $p = Start-Process -FilePath $browser -ArgumentList $cargs -Wait -PassThru -NoNewWindow -RedirectStandardError $errLog
  if (Test-Path $outPng) { Log ("  rendered {0} ({1})" -f $j.out, [IO.Path]::GetFileNameWithoutExtension($browser)) } else { Write-Warning ("The browser did not produce {0}" -f $j.out) }
}
foreach ($j in $jobs) {
  if (-not $j.copy) { continue }
  $png = Join-Path $renderDir $j.out
  if (Test-Path $png) { Copy-Item $png (Join-Path $docs $j.out) -Force } else { Write-Warning ("Missing {0}; run build.ps1 without -SkipRender." -f $j.out) }
}
# the link-preview image as JPEG (the PNG render is ~350 KB; previews want well under 300 KB)
$ogPng = Join-Path $renderDir 'og-image.png'
if (Test-Path $ogPng) { Save-Resized $ogPng (Join-Path $docs 'og-image.jpg') 1200 84 } else { Write-Warning 'Missing og-image.png; og-image.jpg was not written.' }
# favicon.ico (16/32/48) and the 192px manifest icon, resampled from the 512px logo render
$logoPng = Join-Path $renderDir 'logo-512.png'
if (Test-Path $logoPng) {
  Save-Square $logoPng (Join-Path $docs 'icon-192.png') 192
  $icoParts = @()
  foreach ($s in @(16, 32, 48)) { $fp = Join-Path $renderDir "favicon-$s.png"; Save-Square $logoPng $fp $s; $icoParts += $fp }
  Write-Ico $icoParts (Join-Path $docs 'favicon.ico')
  Log '  favicon.ico + icon-192.png'
} else { Write-Warning 'Missing logo-512.png; favicon.ico and icon-192.png were not written.' }
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
        $cargs = @('--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--virtual-time-budget=5000', '--no-pdf-header-footer', "--print-to-pdf=$pdfOut", ('file:///' + $tmp.Replace('\', '/')))
        Start-Process -FilePath $edge -ArgumentList $cargs -Wait -NoNewWindow -RedirectStandardError (Join-Path $renderDir 'edge.log') | Out-Null
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
