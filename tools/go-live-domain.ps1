# Yoergoods Digital - move the live site from jordanyoerger.com/yoergoods-digital/ to its own domain.
# Usage (from the repo root, after the domain is registered and DNS is set as described in README.md):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\go-live-domain.ps1 -Check          just test DNS
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\go-live-domain.ps1                 do the switch
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\go-live-domain.ps1 -EnableHttps    finish later if the
#                                                                                               certificate was still pending
# What it does: verifies DNS points at GitHub Pages -> sets domain/basePath in src\data\site.json -> rebuilds ->
# commits and pushes -> tells GitHub Pages the custom domain -> waits for the certificate -> enforces HTTPS ->
# checks the live URLs. The old address 301s to the new one automatically.
# ASCII only (Windows PowerShell 5.1).
param(
  [string]$Domain = 'www.yoergoodsdigital.com',
  [string]$Repo = 'jgyoerger1/yoergoods-digital',
  [string]$GithubUser = 'jgyoerger1',
  [switch]$Check,
  [switch]$EnableHttps,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$apex = $Domain -replace '^www\.', ''
$githubIps = @('185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153')
function Log($m) { Write-Host ("  " + $m) }
function Head($m) { Write-Host ""; Write-Host $m -ForegroundColor Cyan }

# ---------------------------------------------------------------- 1. DNS
Head "1. DNS for $Domain"
$ok = $true
try {
  $cname = (Resolve-DnsName $Domain -Type CNAME -ErrorAction Stop | Where-Object { $_.Type -eq 'CNAME' } | Select-Object -First 1).NameHost
} catch { $cname = $null }
if ($cname -and $cname -match "^$GithubUser\.github\.io\.?$") { Log "www CNAME -> $cname  OK" }
else { Log ("www CNAME -> {0}  (expected {1}.github.io)" -f ($(if ($cname) { $cname } else { 'none' }), $GithubUser)); $ok = $false }
try { $a = @(Resolve-DnsName $apex -Type A -ErrorAction Stop | Where-Object { $_.Type -eq 'A' } | ForEach-Object { $_.IPAddress }) } catch { $a = @() }
$hits = @($a | Where-Object { $githubIps -contains $_ })
if ($hits.Count -ge 1) { Log ("apex A -> {0}  OK ({1} of 4 GitHub addresses)" -f ($a -join ', '), $hits.Count) }
else { Log ("apex A -> {0}  (expected the four GitHub Pages addresses)" -f $(if ($a.Count) { $a -join ', ' } else { 'none' })); $ok = $false }
if (-not $ok) {
  Write-Host ""
  Write-Host "DNS is not pointing at GitHub Pages yet. At the registrar / DNS host add:" -ForegroundColor Yellow
  Write-Host "  CNAME  www   ->  $GithubUser.github.io      (Cloudflare: DNS only, grey cloud)"
  foreach ($ip in $githubIps) { Write-Host "  A      @     ->  $ip" }
  Write-Host "then wait a few minutes and run this script again. Use -Force to continue anyway."
  if (-not $Force) { exit 1 }
}
if ($Check) { Write-Host ""; Write-Host "DNS check complete."; exit 0 }

# ---------------------------------------------------------------- token
# (PowerShell adds a byte-order mark when piping text to git, so the request goes through a temp file and cmd)
$credTmp = Join-Path $env:TEMP 'yoergoods-gcred.txt'
[IO.File]::WriteAllText($credTmp, "protocol=https`nhost=github.com`nusername=$GithubUser`n`n", (New-Object System.Text.UTF8Encoding($false)))
$credOut = cmd /c "git credential fill < `"$credTmp`" 2>nul"
Remove-Item $credTmp -Force -ErrorAction SilentlyContinue
$token = ($credOut | Select-String '^password=' | ForEach-Object { $_.Line.Substring(9) })
if (-not $token) { throw 'No GitHub credential found in Git Credential Manager; push once from a terminal first.' }
$headers = @{ Authorization = "token $token"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'yoergoods-go-live' }
function Api($method, $path, $body) {
  $p = @{ Method = $method; Uri = "https://api.github.com/repos/$Repo$path"; Headers = $headers; ContentType = 'application/json' }
  if ($body) { $p.Body = ($body | ConvertTo-Json -Compress) }
  try { return Invoke-RestMethod @p } catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $null } else { throw } }
}

if (-not $EnableHttps) {
  # ---------------------------------------------------------------- 2. site config
  Head "2. Site config"
  $cfg = Join-Path $root 'src\data\site.json'
  $json = [IO.File]::ReadAllText($cfg)
  $json = [regex]::Replace($json, '"domain":\s*"[^"]*"', ('"domain": "https://' + $Domain + '"'))
  $json = [regex]::Replace($json, '"basePath":\s*"[^"]*"', '"basePath": ""')
  [IO.File]::WriteAllText($cfg, $json, (New-Object System.Text.UTF8Encoding($false)))
  Log "site.json: domain https://$Domain, basePath empty"
  $prev = Join-Path $root 'Preview Site.cmd'
  if (Test-Path $prev) { (Get-Content $prev -Raw) -replace 'http://localhost:8777/[^\s"]*', 'http://localhost:8777/' | Set-Content $prev -Encoding ASCII; Log 'Preview Site.cmd opens the site root' }

  # ---------------------------------------------------------------- 3. build + publish
  Head "3. Build and publish"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'build.ps1') | Select-Object -Last 3 | ForEach-Object { Log $_ }
  if (-not (Test-Path (Join-Path $root 'docs\CNAME'))) { throw 'docs\CNAME was not written; check basePath in site.json' }
  Push-Location $root
  try {
    git add -A 2>$null | Out-Null
    git -c user.name="Jordan Yoerger" -c user.email="jordan.yoerger@greatdayimprovements.com" commit -q -m "Go live on $Domain" 2>$null | Out-Null
    git push -q origin main 2>$null
    Log ("pushed " + (git rev-parse --short HEAD))
  } finally { Pop-Location }

  # ---------------------------------------------------------------- 4. GitHub Pages custom domain
  Head "4. GitHub Pages custom domain"
  [void](Api 'PUT' '/pages' @{ cname = $Domain })
  Log "custom domain set to $Domain"
}

# ---------------------------------------------------------------- 5. certificate + HTTPS
Head "5. Certificate and HTTPS"
$state = ''
for ($i = 0; $i -lt 40; $i++) {
  $pg = Api 'GET' '/pages' $null
  $state = [string]$pg.https_certificate.state
  Log ("certificate: {0}  (domain {1}, status {2})" -f $state, $pg.cname, $pg.status)
  if ($state -eq 'approved' -or $state -eq 'issued') { break }
  if ($state -match 'errored|bad_authz|dns_changed') { Write-Warning "Certificate state is $state. Check the DNS records and re-run with -EnableHttps."; break }
  Start-Sleep -Seconds 15
}
if ($state -eq 'approved' -or $state -eq 'issued') {
  [void](Api 'PUT' '/pages' @{ https_enforced = $true })
  Log 'HTTPS enforced'
} else {
  Write-Warning 'The certificate is still being issued (GitHub can take up to an hour). Run this script again later with -EnableHttps.'
}

# ---------------------------------------------------------------- 6. live checks
Head "6. Live checks"
foreach ($u in @("https://$Domain/", "https://$Domain/quote/", "https://$Domain/sitemap.xml", "http://$apex/", "https://jordanyoerger.com/yoergoods-digital/")) {
  try {
    $r = Invoke-WebRequest -Uri $u -MaximumRedirection 0 -UseBasicParsing -ErrorAction SilentlyContinue
    $code = $r.StatusCode; $loc = $r.Headers.Location
  } catch { $code = $_.Exception.Response.StatusCode.value__; $loc = $_.Exception.Response.Headers['Location'] }
  Log ("{0}  {1} {2}" -f $code, $u, $(if ($loc) { "-> $loc" } else { '' }))
}
Write-Host ""
Write-Host "Done. Next: add the property in Google Search Console and submit https://$Domain/sitemap.xml" -ForegroundColor Green
