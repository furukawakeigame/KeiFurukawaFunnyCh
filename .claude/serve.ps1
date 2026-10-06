# Minimal static file server for local preview (no Python needed)
param([int]$Port = 8000)
$root = Split-Path -Parent $PSScriptRoot
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css'; '.js'='text/javascript'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'; '.json'='application/json'; '.mp3'='audio/mpeg'; '.wav'='audio/wav' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
  $file = Join-Path $root $path
  # Local-only upload slot for recorded videos (.claude/out/)
  if ($ctx.Request.HttpMethod -eq 'PUT' -and $path.StartsWith('.claude/out/')) {
    New-Item -ItemType Directory -Force (Split-Path $file) | Out-Null
    $fs = [IO.File]::Create($file); $ctx.Request.InputStream.CopyTo($fs); $fs.Close()
    $ctx.Response.StatusCode = 201; $ctx.Response.Close(); continue
  }
  if (Test-Path $file -PathType Container) {
    if (-not $path.EndsWith('/') -and $path -ne '') { $ctx.Response.Redirect("/$path/"); $ctx.Response.Close(); continue }
    $file = Join-Path $file 'index.html'
  }
  if (Test-Path $file -PathType Leaf) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $ext = [IO.Path]::GetExtension($file).ToLower()
    $ctx.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else { $ctx.Response.StatusCode = 404 }
  $ctx.Response.Close()
}
