# IndexNow: tell Bing (and Yandex, Naver, Seznam, Yep) that pages are new or changed. Google does not use IndexNow;
# use Search Console for Google.
#
# Run it AFTER Publish.cmd has pushed and GitHub Pages has deployed (about a minute), because the search engines
# fetch https://<host>/<key>.txt to check the key before they accept the URLs.
#
# Usage (from the project folder):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\indexnow.ps1 -DryRun     # show the request, send nothing
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\indexnow.ps1             # every URL in docs\sitemap.xml
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\indexnow.ps1 -ChangedSince 2026-10-14
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\indexnow.ps1 -Url https://www.yoergoodsdigital.com/pricing/
#   ... -Url "https://www.yoergoodsdigital.com/,https://www.yoergoodsdigital.com/pricing/"   # several: ONE quoted string
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\indexnow.ps1 -Live       # read the live sitemap instead
#
# The key lives in src\data\site.json (indexNowKey); build.ps1 publishes it as docs\<key>.txt from src\<key>.txt.
# Submit only URLs that really changed. Re-sending an unchanged sitemap every day earns nothing.
# ASCII only in this file (Windows PowerShell 5.1 reads BOM-less scripts as ANSI).
# No positional binding: an unquoted "-Url a, b" list once spilled b into -Endpoint and posted to the site itself.
[CmdletBinding(PositionalBinding = $false)]
param(
  [string[]]$Url,
  [string]$ChangedSince,
  [switch]$Live,
  [switch]$DryRun,
  [string]$Endpoint = 'https://api.indexnow.org/indexnow'
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$root = Split-Path $PSScriptRoot -Parent
$site = Get-Content (Join-Path $root 'src\data\site.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$key = [string]$site.indexNowKey
if (-not $key) { throw 'No indexNowKey in src\data\site.json.' }
$domain = ([string]$site.domain).TrimEnd('/') + [string]$site.basePath
$siteHost = ([Uri]([string]$site.domain)).Host
$keyLocation = "$(([string]$site.domain).TrimEnd('/'))/$key.txt"

# ---------------------------------------------------------------- which URLs
$entries = @()
# "powershell -File" passes "-Url a,b" as one string, so split on commas and spaces here
$Url = @($Url | ForEach-Object { [string]$_ -split '[,\s]+' } | Where-Object { $_ })
if ($Url.Count -gt 0) {
  foreach ($u in $Url) { $entries += [pscustomobject]@{ loc = $u; lastmod = '' } }
} else {
  if ($Live) {
    $sm = "$domain/sitemap.xml"
    Write-Host "Reading $sm"
    $xmlText = (Invoke-WebRequest -Uri $sm -UseBasicParsing).Content
  } else {
    $sm = Join-Path $root 'docs\sitemap.xml'
    if (-not (Test-Path $sm)) { throw 'docs\sitemap.xml not found. Run build.ps1 first (or pass -Live).' }
    Write-Host "Reading $sm"
    $xmlText = [IO.File]::ReadAllText($sm, [Text.Encoding]::UTF8)
  }
  $xml = [xml]$xmlText
  foreach ($n in @($xml.urlset.url)) { $entries += [pscustomobject]@{ loc = [string]$n.loc; lastmod = [string]$n.lastmod } }
  if ($ChangedSince) {
    $since = [DateTimeOffset]::Parse($ChangedSince, [Globalization.CultureInfo]::InvariantCulture)
    $entries = @($entries | Where-Object { $_.lastmod -and ([DateTimeOffset]::Parse($_.lastmod, [Globalization.CultureInfo]::InvariantCulture) -ge $since) })
  }
}
$urls = @($entries | ForEach-Object { $_.loc } | Where-Object { $_ } | Select-Object -Unique)
if ($urls.Count -eq 0) { Write-Host 'Nothing to submit.'; exit 0 }
foreach ($u in $urls) {
  $h = ([Uri]$u).Host
  if ($h -ne $siteHost) { throw "URL $u is not on $siteHost. IndexNow only accepts URLs on the key's host." }
}
if ($urls.Count -gt 10000) { throw 'IndexNow accepts at most 10,000 URLs per request.' }

$body = [ordered]@{ host = $siteHost; key = $key; keyLocation = $keyLocation; urlList = $urls } | ConvertTo-Json -Depth 4
Write-Host ("{0} URL(s) for {1}" -f $urls.Count, $siteHost)
$urls | ForEach-Object { Write-Host "  $_" }

if ($DryRun) {
  Write-Host ''
  Write-Host "DRY RUN: would POST to $Endpoint"
  Write-Host $body
  exit 0
}

# ---------------------------------------------------------------- the key file has to be live first
try {
  $kr = Invoke-WebRequest -Uri $keyLocation -UseBasicParsing
  $liveKey = if ($kr.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($kr.Content) } else { [string]$kr.Content }
  if ($liveKey.Trim() -ne $key) { throw "$keyLocation is live but does not contain the key from site.json." }
} catch {
  throw "Key file check failed ($keyLocation): $($_.Exception.Message). Publish the site and wait for GitHub Pages to deploy, then run this again."
}

# ---------------------------------------------------------------- submit
$meaning = @{
  200 = 'OK: URLs received.'
  202 = 'Accepted: URLs received; the key is still being validated.'
  400 = 'Bad request: the request format is invalid.'
  403 = 'Forbidden: the key was not valid (key file missing or different).'
  422 = 'Unprocessable: a URL is not on the host, or the key does not match.'
  429 = 'Too many requests: slow down (possible spam signal).'
}
try {
  $resp = Invoke-WebRequest -Uri $Endpoint -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -UseBasicParsing
  $code = [int]$resp.StatusCode
} catch {
  $r = $_.Exception.Response
  if ($null -eq $r) { throw }
  $code = [int]$r.StatusCode
}
$msg = if ($meaning.ContainsKey($code)) { $meaning[$code] } else { 'Unexpected status.' }
Write-Host ("IndexNow responded {0}. {1}" -f $code, $msg)
if ($code -ne 200 -and $code -ne 202) { exit 1 }
