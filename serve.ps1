# Tiny local web server for previewing the built site (docs\) - no installs needed.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 [-Port 8777] [-Root <folder>] [-Base /yoergoods-digital]
# -Base defaults to basePath in src\data\site.json so the preview matches the published URL layout
# (http://localhost:8777/ redirects to http://localhost:8777/yoergoods-digital/ while the site lives under jordanyoerger.com).
param([int]$Port = 8777, [string]$Root = "", [string]$Base = "(auto)")
if (-not $Root) { $Root = Join-Path $PSScriptRoot "docs" }
$Root = (Resolve-Path $Root).Path
if ($Base -eq "(auto)") {
  $Base = ""
  $cfg = Join-Path $PSScriptRoot "src\data\site.json"
  if (Test-Path $cfg) { try { $Base = [string](Get-Content $cfg -Raw | ConvertFrom-Json).basePath } catch { $Base = "" } }
}
$Base = $Base.TrimEnd("/")
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root at http://localhost:$Port$Base/   (close this window to stop)"
$mime = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".png" = "image/png"; ".svg" = "image/svg+xml"
  ".webmanifest" = "application/manifest+json"; ".xml" = "application/xml"; ".txt" = "text/plain"; ".ico" = "image/x-icon"; ".webp" = "image/webp"
}
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($Base) {
      if ($path -eq "/" -or $path -eq $Base) { $res.StatusCode = 302; $res.RedirectLocation = "$Base/"; $res.Close(); continue }
      if ($path.StartsWith("$Base/")) { $path = $path.Substring($Base.Length) }
    }
    $file = Join-Path $Root (($path.TrimStart("/")) -replace "/", "\")
    if ((Test-Path $file -PathType Container) -and -not $path.EndsWith("/")) {
      $res.StatusCode = 301; $res.RedirectLocation = "$Base$path/"
    } else {
      if ($path.EndsWith("/")) { $file = Join-Path $file "index.html" }
      if (-not (Test-Path $file -PathType Leaf)) { $file = Join-Path $Root "404.html"; $res.StatusCode = 404 }
      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $res.Headers["Cache-Control"] = "no-store"
      $bytes = [IO.File]::ReadAllBytes($file)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch { try { $res.StatusCode = 500 } catch {} }
  finally { try { $res.Close() } catch {} }
}
